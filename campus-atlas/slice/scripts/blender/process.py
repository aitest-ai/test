# Blender 無頭批次處理（Blender 4.0，Docker arm64）：glb → 整理法線／UV → 烘焙 AO → glb（AO 寫成 glTF occlusionTexture，texCoord 1）。
# 用法（在 slice/ 下）：
#   docker run --rm -v "$PWD":/work campus-blender:4.0 --python scripts/blender/process.py -- assets-src/dongxin_raw.glb assets-out/dongxin_ao.glb --res 4096 --samples 16
# 報告寫到 <out>.blender.json。
import bpy, bmesh, sys, os, json, time, math

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
opt = lambda k, d: type(d)(argv[argv.index(k) + 1]) if k in argv else d
inp, out = argv[0], argv[1]
RES, SAMPLES, MERGE = opt('--res', 2048), opt('--samples', 16), opt('--merge', 0.0005)
T0 = time.time(); rep = {'input': inp, 'blender': bpy.app.version_string, 'res': RES, 'samples': SAMPLES}
def lap(k):
    rep.setdefault('sec', {})[k] = round(time.time() - T0, 1); print('STEP', k, rep['sec'][k], 's', flush=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=inp)
lap('import')
meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
rep['objectsImported'] = len(meshes)
LIMIT = opt('--limit', 0)                      # 除錯用：只留前 N 個物件
if LIMIT:
    for o in meshes[LIMIT:]: bpy.data.objects.remove(o, do_unlink=True)
    meshes = meshes[:LIMIT]
# 共用網格（實例化的樹）先轉成各自獨立，否則 lightmap UV 會重疊、AO 互相覆蓋
bpy.ops.object.select_all(action='DESELECT')
for o in meshes: o.select_set(True)
bpy.context.view_layer.objects.active = meshes[0]
bpy.ops.object.make_single_user(object=True, obdata=True, material=False)
bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)

# ---------- 1. 法線整理：去除重複頂點、統一面法線朝外、清自訂法線、30° 自動平滑 ----------
merged = flipped = 0; tris = 0
for o in meshes:
    me = o.data
    bm = bmesh.new(); bm.from_mesh(me)
    n0 = len(bm.verts); bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=MERGE); merged += n0 - len(bm.verts)
    before = [f.normal.copy() for f in bm.faces]
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    flipped += sum(1 for f, n in zip(bm.faces, before) if f.normal.dot(n) < 0)
    bm.to_mesh(me); bm.free(); tris += sum(len(p.vertices) - 2 for p in me.polygons)
for o in meshes:
    bpy.context.view_layer.objects.active = o
    try: bpy.ops.mesh.customdata_custom_splitnormals_clear()
    except Exception: pass
    o.data.use_auto_smooth = True if hasattr(o.data, 'use_auto_smooth') else None
    if hasattr(o.data, 'auto_smooth_angle'): o.data.auto_smooth_angle = math.radians(30)
    for p in o.data.polygons: p.use_smooth = False
rep.update(verticesMerged=merged, facesFlipped=flipped, triangles=tris); lap('normals')
# 合併成單一物件（保留各材質槽）：烘焙一次完成，避免上千個物件逐一烘焙的開銷
# 超大底色平面（最大邊 > 300 m）不烘 AO：它會吃掉整張 lightmap 的面積，校舍只剩細縫
big = [o for o in meshes if max(o.dimensions) > 300]; meshes = [o for o in meshes if o not in big]; rep['excludedHuge'] = [o.name for o in big]
bpy.ops.object.select_all(action='DESELECT')
for o in meshes: o.select_set(True)
bpy.context.view_layer.objects.active = meshes[0]; bpy.ops.object.join(); meshes = [bpy.context.view_layer.objects.active]
rep['objectsAfterJoin'] = len(meshes); lap('join')

# ---------- 2. UV：保留原貼圖 UV（UV0），新增 lightmap UV「AO」（UV1），全部物件打包到同一張圖 ----------
for o in meshes:
    if len(o.data.uv_layers) == 0: o.data.uv_layers.new(name='UVMap')
    uv = o.data.uv_layers.new(name='AO'); o.data.uv_layers.active = uv
    o.data.uv_layers[0].active_render = True
bpy.ops.object.select_all(action='DESELECT')
for o in meshes: o.select_set(True)
bpy.context.view_layer.objects.active = meshes[0]
# 長邊先細分到 ≤ MAXE m，再把所有邊標成縫線逐面展開：避免上百公尺的牆／地面成為細長大島，讓打包器只能照它縮放
MAXE = opt('--max-edge', 6.0)
for o in meshes:
    bm = bmesh.new(); bm.from_mesh(o.data)
    for _ in range(12):
        long_ = [e for e in bm.edges if e.calc_length() > MAXE]
        if not long_: break
        bmesh.ops.subdivide_edges(bm, edges=long_, cuts=1, use_grid_fill=True)
    bm.to_mesh(o.data); bm.free()
rep['trianglesAfterSubdiv'] = sum(len(p.vertices) - 2 for o in meshes for p in o.data.polygons)
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.mesh.mark_seam(clear=False)
bpy.ops.uv.unwrap(method='ANGLE_BASED', margin=0.0)
bpy.ops.uv.pack_islands(rotate=True, margin=2.0 / RES)
bpy.ops.object.mode_set(mode='OBJECT'); lap('uv')

# ---------- 3. 烘焙 AO（Cycles，CPU） ----------
sc = bpy.context.scene; sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = SAMPLES
sc.cycles.use_denoising = False   # Ubuntu arm64 版未編入 OpenImageDenoise：開著會讓算圖報錯、烘焙悄悄輸出全黑
sc.world = sc.world or bpy.data.worlds.new('W'); sc.world.light_settings.distance = 6.0   # AO 距離 6 m
img = bpy.data.images.new('campus_ao', RES, RES, alpha=False, float_buffer=False); img.generated_color = (1, 1, 1, 1)
mats = {m for o in meshes for m in o.data.materials if m}
for m in mats:
    m.use_nodes = True; nt = m.node_tree
    uvn = nt.nodes.new('ShaderNodeUVMap'); uvn.uv_map = 'AO'; uvn.name = 'AO_UV'
    tn = nt.nodes.new('ShaderNodeTexImage'); tn.image = img; tn.name = 'AO_TEX'; tn.interpolation = 'Linear'
    nt.links.new(uvn.outputs['UV'], tn.inputs['Vector']); nt.nodes.active = tn
bpy.ops.object.select_all(action='DESELECT')
for o in meshes: o.select_set(True)
bpy.context.view_layer.objects.active = meshes[0]
bpy.ops.object.bake(type='AO', margin=4, use_clear=True, target='IMAGE_TEXTURES')
img.filepath_raw = os.path.splitext(out)[0] + '_ao.png'; img.file_format = 'PNG'; img.save()
allpx = img.pixels[:]; px = allpx[0::4 * 97]; rep['aoMean'] = round(sum(px) / len(px), 3); lap('bake')

# ---------- 4. 接到 glTF occlusion：glTF Material Output 節點群組的 Occlusion 輸入 ----------
grp = bpy.data.node_groups.get('glTF Material Output') or bpy.data.node_groups.new('glTF Material Output', 'ShaderNodeTree')
if hasattr(grp, 'interface'):          # Blender 4.0+
    if not any(it.name == 'Occlusion' for it in grp.interface.items_tree): grp.interface.new_socket('Occlusion', in_out='INPUT', socket_type='NodeSocketFloat')
elif 'Occlusion' not in grp.inputs: grp.inputs.new('NodeSocketFloat', 'Occlusion')
for m in mats:
    nt = m.node_tree; g = nt.nodes.new('ShaderNodeGroup'); g.node_tree = grp
    sep = nt.nodes.new('ShaderNodeSeparateColor'); nt.links.new(nt.nodes['AO_TEX'].outputs['Color'], sep.inputs['Color']); nt.links.new(sep.outputs[0], g.inputs['Occlusion'])
lap('hook')

# ---------- 5. 匯出 ----------
os.makedirs(os.path.dirname(out) or '.', exist_ok=True)
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_image_format='AUTO', export_texcoords=True, export_normals=True, export_materials='EXPORT', use_selection=False, export_apply=True)
rep['outputKB'] = os.path.getsize(out) // 1024; lap('export')
json.dump(rep, open(out + '.blender.json', 'w'), ensure_ascii=False, indent=1); print('BLENDER_REPORT', json.dumps(rep, ensure_ascii=False))
