// 東新國小版主程式：只負責「組裝＋主迴圈＋測試掛鉤」。
//   資料    dongxin/model.js   設計圖格網 → 房間／走廊／樓梯／門／可走格（無 three 依賴）
//   碰撞    dongxin/world.js   物理層：可走格＋解析式梯面
//   導航    dongxin/pathgrid.js 路徑網格（淨空成本＋樓梯入口圖）；dongxin/nav.js 組成含樓梯航點的路線；app/guide.js 選取、畫線、walker
//   場景    app/stage.js       渲染器、燈光、校舍、標記、角色、樓層顯示
//   角色    app/player.js      手動移動、自動導覽推進、走路動畫
//   鏡頭    app/camera.js      狀態機：third／guide／first／bird，切換時平滑過渡
//   輸入    app/input.js       鍵盤、拖曳、滾輪、搖桿
//   UI      ui/panel.js、ui/minimap.js
import * as THREE from 'three';
THREE.ColorManagement.enabled = false;
import { buildModel } from './dongxin/model.js';
import { createDxWorld } from './dongxin/world.js';
import { createDxNav } from './dongxin/nav.js';
import { createStage } from './dongxin/app/stage.js';
import { createInput } from './dongxin/app/input.js';
import { createPlayer } from './dongxin/app/player.js';
import { createCameraRig } from './dongxin/app/camera.js';
import { createGuide } from './dongxin/app/guide.js';
import { createPanel } from './dongxin/ui/panel.js';
import { createMinimap } from './dongxin/ui/minimap.js';
import D from '../data/dongxin_geo.json';

// 換膜：data/materials.<id>.json 全部打包；網址 ?skin=<id> 選用（預設 dongxin）
const SKINS = Object.fromEntries(Object.entries(import.meta.glob('../data/materials.*.json', { eager: true, import: 'default' })).map(([k, v]) => [v.id, v]));
const SKIN = SKINS[new URLSearchParams(location.search).get('skin')] || SKINS.dongxin;
const PLAN_SOFT = new URL('../assets/dongxin_plan_soft.jpg', import.meta.url).href, PLAN = new URL('../assets/dongxin_plan.jpg', import.meta.url).href;
const $ = (s) => document.querySelector(s);

const m = buildModel(D), world = createDxWorld(m), nav = createDxNav(m, world);
const { STAIRS, ROOMS, PLACES } = m;
const canvas = $('#scene');
const stage = createStage(canvas, m, world, { planSoft: PLAN_SOFT, skin: SKIN, shadows: new URLSearchParams(location.search).get('shadows') !== '0' });
const { camera, dx } = stage;

// ---------- 狀態 ----------
const GATE = dx.GATE;
const TWR = STAIRS.slice().sort((a, b) => Math.hypot(a.cx - GATE.x, a.cz - GATE.z) - Math.hypot(b.cx - GATE.x, b.cz - GATE.z))[0];
const HD0 = Math.atan2(TWR.cx - GATE.x, TWR.cz - GATE.z);           // 出生點：校門正面，面向鐘塔
const S = { x: GATE.x, z: GATE.z, y: 0, heading: HD0, yaw: HD0, pitch: 0.34, dist: 6.4, mode: 'third', viewFloor: null,
  byaw: Math.PI, birdH: 70, selected: null, walker: null, route: null, moving: false, walkT: 0, yCam: 0, speedK: 1, turnK: 1 };
const TARGETS = ROOMS.filter(r => !r.solid).concat(PLACES);

// ---------- 組裝 ----------
const ctx = { S, m, world, nav, stage, camera, canvas, TARGETS };
const ui = ctx.ui = createPanel(ctx);
const cam = ctx.cam = createCameraRig({ S, m, world, camera, ch: stage.ch });
const guide = ctx.guide = createGuide({ S, m, world, nav, stage, cam, ui });
const input = createInput(canvas, S, { cycleMode: ui.cycleMode, cancel: guide.cancelRoute, pick: ui.pickRoom });
const player = createPlayer({ S, m, world, input, ch: stage.ch }, {
  onManualTakeover: () => ui.setStatus('已改為手動操作（路線仍顯示）'),
  onArrived: (t) => { guide.cancelRoute(); ui.toast('已到達 ' + (t ? t.name : '')); },
  onStuck: () => guide.startRoute(true),
});
const mini = createMinimap($('#mini'), { S, m, world, groundBox: dx.groundBox, planUrl: PLAN });
ui.bind();

// ---------- 主迴圈 ----------
let hudT = 0;
function update(dt) {
  player.update(dt);
  const f = player.curF(), inRoom = world.roomAt(f, S.x, S.z) >= 0;
  stage.applyFloorVisibility(S, f, inRoom);
  guide.animatePin(dt); guide.update(dt);
  cam.update(dt, inRoom);
  stage.lighting.update(S, S.mode === 'bird');
  ui.tickFps(dt);
  hudT += dt; if (hudT > 0.15) { hudT = 0; ui.updateFloorButtons(); mini.draw(); ui.updateWhere(); }
}
const timer = new THREE.Timer();
const AUTO_DEGRADE = new URLSearchParams(location.search).get('degrade') !== '0';   // ?degrade=0：不自動關陰影／AO（量測用）
let frozen = false;   // __dx.view 拍照時暫停主迴圈
function loop(ts) { requestAnimationFrame(loop); timer.update(ts); if (frozen) return; const raw = Math.max(0, timer.getDelta()); if (AUTO_DEGRADE) { stage.lighting.watch(raw); stage.ao.watch(raw); } update(Math.min(raw, 0.05)); stage.render(); }   // 第一幀：rAF 時戳可能早於啟動時的 performance.now()（載入很忙時差到數秒）→ 負的 dt，曾讓 HUD／小地圖延遲約 2 秒才畫

window.__dx = { S, m, world, nav, setDest: guide.setDest, startRoute: guide.startRoute, gotoFloor: guide.gotoFloor, setMode: ui.setMode, teleportTo: guide.teleportTo, cancelRoute: guide.cancelRoute, keys: input.keys, THREE, TARGETS,
  tick(dt) { update(dt); },
  advance(sec, dt = 1 / 30) { for (let t = 0; t < sec; t += dt) update(dt); stage.render(); },
  cam() { const d = new THREE.Vector3(); camera.getWorldDirection(d); return { p: camera.position.toArray(), d: d.toArray() }; },
  info() { return { x: S.x, z: S.z, y: S.y, floor: player.curF(), mode: S.mode, camState: cam.state, blending: cam.blending, walker: !!S.walker, done: S.walker ? S.walker.done : null }; },
  skins: Object.keys(SKINS), skin: SKIN.id,
  textures: () => ({ ...stage.M.textureStatus }), textureTiming: () => ({ ...stage.M.textureTiming }), texturesReady: () => stage.M.ready.then(() => ({ ...stage.M.textureStatus })),
  // 匯出校舍為 glb（資產管線用；按需載入 GLTFExporter，不影響一般載入）。回傳 ArrayBuffer。
  async exportGLB() { const { GLTFExporter } = await import('three/examples/jsm/exporters/GLTFExporter.js');
    // 匯出用複本：有逐實例顏色的 InstancedMesh（樹冠）攤平成一個帶頂點色（COLOR_0）的網格，
    // 因為 Blender 4.0 匯入 glTF 時不支援逐實例顏色（上一輪樹冠變白）。執行期場景不受影響。
    const root = dx.root.clone(), swaps = [];
    root.traverse(o => { if (o.isInstancedMesh && o.instanceColor) swaps.push(o); });
    for (const im of swaps) { const parts = [], mtx = new THREE.Matrix4(), col = new THREE.Color();
      for (let i = 0; i < im.count; i++) { const g = im.geometry.index ? im.geometry.toNonIndexed() : im.geometry.clone(); im.getMatrixAt(i, mtx); g.applyMatrix4(mtx); im.getColorAt(i, col);
        const c = new Float32Array(g.attributes.position.count * 3); for (let k = 0; k < c.length; k += 3) { c[k] = col.r; c[k + 1] = col.g; c[k + 2] = col.b; }
        g.setAttribute('color', new THREE.BufferAttribute(c, 3)); for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(k)) g.deleteAttribute(k); parts.push(g); }
      const { mergeGeometries } = await import('three/examples/jsm/utils/BufferGeometryUtils.js');
      const mat = im.material.clone(); mat.vertexColors = true; const mesh = new THREE.Mesh(mergeGeometries(parts), mat); mesh.name = im.name || 'tree_crowns';
      mesh.matrix.copy(im.matrix); mesh.matrix.decompose(mesh.position, mesh.quaternion, mesh.scale); im.parent.add(mesh); im.parent.remove(im); }
    return new GLTFExporter().parseAsync(root, { binary: true, onlyVisible: false, maxTextureSize: 1024 }); },
  renderInfo() { const r = stage.renderer.info.render; return { calls: r.calls, triangles: r.triangles, programs: stage.renderer.info.programs?.length, shadows: stage.lighting.shadows, degraded: stage.lighting.degraded }; },
  // 照片對照用：自由相機（位置、注視點、垂直視角），所有樓層可見，畫一幀（下一次 update 會被鏡頭狀態機蓋回）
  view(p, t, fov = 60) { frozen = true; dx.FG.forEach(g => g.visible = true); dx.CAN.forEach(g => g && (g.visible = true)); stage.ch.group.visible = false;
    camera.fov = fov; camera.updateProjectionMatrix(); camera.position.set(...p); camera.up.set(0, 1, 0); camera.lookAt(...t); stage.lighting.update({ ...S, x: t[0], z: t[2] }, false); stage.render(); camera.fov = 60; camera.updateProjectionMatrix(); },
  unfreeze() { frozen = false; },
  scn: { WINDOWS: dx.WINDOWS, FINBOX: dx.FINBOX, planters: dx.PLANTERS },   // 結構驗收用（窗洞、鰭片量體）
  setShadows: (v) => stage.lighting.setShadows(v), _scene: stage.scene, lightmap: stage.lm, ao: () => ({ status: stage.ao.status, ms: Math.round(stage.ao.ms) }), aoReady: () => stage.ao.ready.then(() => ({ status: stage.ao.status })),
  // 量測用：GPU 資源數與貼圖記憶體估計（RGBA8 × mipmap 4/3；壓縮貼圖依區塊格式估）
  memInfo() { const seen = new Set(); let bytes = 0, n = 0;
    stage.scene.traverse(o => { const ms = o.material ? [].concat(o.material) : []; for (const mt of ms) for (const k in mt) { const t = mt[k]; if (!t || !t.isTexture || seen.has(t)) continue; seen.add(t); n++;
      const im = t.image || {}, w = im.width || (t.mipmaps?.[0]?.width) || 0, h = im.height || (t.mipmaps?.[0]?.height) || 0, bpp = t.isCompressedTexture || t.format === THREE.RedFormat ? 1 : 4;
      bytes += w * h * bpp * (t.generateMipmaps !== false || t.mipmaps?.length > 1 ? 4 / 3 : 1); } });
    const r = stage.renderer.info; return { textures: n, textureMB: +(bytes / 1048576).toFixed(2), gpuTextures: r.memory.textures, gpuGeometries: r.memory.geometries, shadowMapMB: stage.lighting.shadows ? +(stage.lighting.sun.shadow.mapSize.x ** 2 * 4 / 1048576).toFixed(1) : 0 }; } };
try { if (!localStorage.getItem('dx.help1')) { $('#help').hidden = false; localStorage.setItem('dx.help1', '1'); } } catch (e) { }
ui.renderList(); ui.setMode('third'); ui.updateFloorButtons();
$('#loading').classList.add('done'); setTimeout(() => $('#loading').style.display = 'none', 500);
loop();
setTimeout(() => nav.grid && nav.grid.warmAsync(), 600);   // 背景預熱樓梯入口的路徑網格
