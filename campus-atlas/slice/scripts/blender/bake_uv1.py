# Blender 無頭 AO 烘焙（給即時場景用）：依執行期的 lightmap UV（glTF TEXCOORD_1，見 src/dongxin/lightmap.js）烘焙 AO 圖集，
# 不改網格、不重新展 UV、不匯出模型，只輸出圖片；執行期重算同一組 uv1 就能套回。
#   receivers：有 TEXCOORD_1 的批次網格 → 主圖集（--res，預設 4096）
#   ground_plan：地面底圖網格（UV0 就是底圖座標）→ 地面 AO（--ground-res，預設 2048）
#   其餘物件（實例化的柱、樹、看板）只當遮蔽物
# 用法（在 slice/ 下）：
#   docker run --rm -v "$PWD":/work campus-blender:4.0 --python scripts/blender/bake_uv1.py -- assets-src/dongxin_raw.glb assets-src/ao --res 4096 --samples 32 --distance 1.2
# 輸出：<out_dir>/ao_main.png、ao_ground.png、bake.json
import bpy, sys, os, json, time

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
opt = lambda k, d: type(d)(argv[argv.index(k) + 1]) if k in argv else d
inp, out = argv[0], argv[1]; os.makedirs(out, exist_ok=True)
RES, GRES, SAMPLES, DIST, MARGIN = opt('--res', 4096), opt('--ground-res', 2048), opt('--samples', 32), opt('--distance', 1.2), opt('--margin', 16)
T0 = time.time(); rep = {'input': inp, 'blender': bpy.app.version_string, 'res': RES, 'groundRes': GRES, 'samples': SAMPLES, 'distance': DIST, 'margin': MARGIN}
def lap(k): rep.setdefault('sec', {})[k] = round(time.time() - T0, 1); print('STEP', k, rep['sec'][k], 's', flush=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=inp)
lap('import')
objs = [o for o in bpy.context.scene.objects if o.type == 'MESH']
recv = [o for o in objs if len(o.data.uv_layers) >= 2]
ground = [o for o in objs if o.name.startswith('ground_plan')]
rep.update(objects=len(objs), receivers=len(recv), ground=len(ground))
# 所有物件都能遮蔽（含隱藏的天花、B1）；接收者的 UV1 改名 LM，地面的 UV0 改名 LM
for o in objs: o.hide_render = False; o.hide_set(False)
for o in recv: o.data.uv_layers[1].name = 'LM'
for o in ground: o.data.uv_layers[0].name = 'LM'
# 烘焙寫入的位置由物件「作用中」的 UV 層決定（不是材質裡的 UV Map 節點）：一定要把 LM 設為作用中，否則全寫到 UV0（世界公尺座標，落在圖外）
for o in recv + ground: o.data.uv_layers.active = o.data.uv_layers['LM']

sc = bpy.context.scene; sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = SAMPLES
sc.cycles.use_denoising = False          # Ubuntu arm64 版未編入 OpenImageDenoise：開著會讓烘焙悄悄輸出全黑
sc.world = sc.world or bpy.data.worlds.new('W'); sc.world.light_settings.distance = DIST
sc.render.bake.margin = MARGIN; sc.render.bake.margin_type = 'EXTEND'   # 島外擴 MARGIN px：mipmap 與雙線性取樣不會吃到島外的黑底（上一輪黑縫）
def image(name, res):
    img = bpy.data.images.new(name, res, res, alpha=False, float_buffer=False); img.generated_color = (1, 1, 1, 1); return img
IMG_MAIN, IMG_GROUND = image('ao_main', RES), image('ao_ground', GRES)
def hook(mat, img):
    mat.use_nodes = True; nt = mat.node_tree
    for n in [n for n in nt.nodes if n.name in ('LM_UV', 'LM_TEX')]: nt.nodes.remove(n)
    uvn = nt.nodes.new('ShaderNodeUVMap'); uvn.uv_map = 'LM'; uvn.name = 'LM_UV'
    tn = nt.nodes.new('ShaderNodeTexImage'); tn.image = img; tn.name = 'LM_TEX'; tn.interpolation = 'Linear'
    nt.links.new(uvn.outputs['UV'], tn.inputs['Vector']); nt.nodes.active = tn
# 同一個材質可能同時被接收者與非接收者（實例化的柱）使用：只有被選取的物件會烘焙，非接收者不受影響
mr = {m for o in recv for m in o.data.materials if m}; mg = {m for o in ground for m in o.data.materials if m}
if mr & mg: raise SystemExit('地面與建築共用材質，無法分開烘焙')
for m in mr: hook(m, IMG_MAIN)
for m in mg: hook(m, IMG_GROUND)
# 接收者合併成一個物件再烘焙：Blender 的邊緣外擴（margin）是逐物件計算的，只看「這個物件」的島，
# 多個物件共用一張圖集時，先烘的物件的島會被後烘物件的外擴蓋掉（第一次烘焙約四成可見面變黑）。合併不改 UV。
bpy.ops.object.select_all(action='DESELECT')
for o in recv: o.select_set(True)
bpy.context.view_layer.objects.active = recv[0]; bpy.ops.object.join(); recv = [bpy.context.view_layer.objects.active]
# 共面重疊（屋頂盒與天花板盒同高、樓板疊樓板）會讓 AO 光線一出發就撞到另一個共面的面，烘出約五成的雜訊灰（上一輪的屋頂斑駁）。
# 做法：烘焙用的是「每個面沿法線外推 EPS」的複本，複本對次級光線不可見（相機可見要保留，否則 Cycles 不烘它）；原本的幾何留在原處當遮蔽物。
# 光線從共面雙胞胎前方 EPS 處出發，就不會自撞；牆角等真正的遮蔽幾乎不變（EPS 遠小於 AO 距離）。
EPS = opt('--push', 0.02)
if EPS > 0:
    import bmesh
    src = recv[0]; dup = src.copy(); dup.data = src.data.copy(); bpy.context.collection.objects.link(dup)
    bm = bmesh.new(); bm.from_mesh(dup.data); bmesh.ops.split_edges(bm, edges=bm.edges[:])
    for f in bm.faces:
        d = f.normal * EPS
        for v in f.verts: v.co += d
    bm.to_mesh(dup.data); bm.free()
    for k in ('visible_diffuse', 'visible_glossy', 'visible_transmission', 'visible_volume_scatter', 'visible_shadow'): setattr(dup, k, False)
    recv = [dup]; rep['push'] = EPS
bpy.ops.object.select_all(action='DESELECT')
for o in recv + ground: o.select_set(True)
bpy.context.view_layer.objects.active = recv[0]
lap('setup')
bpy.ops.object.bake(type='AO', margin=MARGIN, use_clear=True, target='IMAGE_TEXTURES')
lap('bake')
for img in (IMG_MAIN, IMG_GROUND):
    img.filepath_raw = os.path.join(out, img.name + '.png'); img.file_format = 'PNG'; img.save()
    px = img.pixels[:]; s = px[0::4 * 61]; rep[img.name + 'Mean'] = round(sum(s) / len(s), 3)
lap('save')
json.dump(rep, open(os.path.join(out, 'bake.json'), 'w'), ensure_ascii=False, indent=1); print('BAKE_REPORT', json.dumps(rep, ensure_ascii=False))
