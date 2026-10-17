// 東新國小版主程式：只負責「組裝＋主迴圈＋測試掛鉤」。
//   資料    dongxin/model.js   設計圖格網 → 房間／走廊／樓梯／門／可走格（無 three 依賴）
//   碰撞    dongxin/world.js   物理層：可走格＋解析式梯面
//   導航    dongxin/pathgrid.js 路徑網格（淨空成本＋樓梯入口圖）；dongxin/nav.js 組成含樓梯航點的路線；app/guide.js 選取、畫線、walker
//   場景    app/stage.js       渲染器、燈光、校舍、標記、角色、樓層顯示
//   角色    app/player.js      手動移動、自動導覽推進、走路動畫
//   鏡頭    app/camera.js      第三人稱／第一人稱／鳥瞰
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

const PLAN_SOFT = new URL('../assets/dongxin_plan_soft.jpg', import.meta.url).href, PLAN = new URL('../assets/dongxin_plan.jpg', import.meta.url).href;
const $ = (s) => document.querySelector(s);

const m = buildModel(D), world = createDxWorld(m), nav = createDxNav(m, world);
const { STAIRS, ROOMS, PLACES } = m;
const canvas = $('#scene');
const stage = createStage(canvas, m, world, { planSoft: PLAN_SOFT });
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
  guide.animatePin(dt);
  cam.update(dt, inRoom);
  stage.sun.position.set(S.x - 30, 60, S.z + 40);
  ui.tickFps(dt);
  hudT += dt; if (hudT > 0.15) { hudT = 0; ui.updateFloorButtons(); mini.draw(); ui.updateWhere(); }
}
const timer = new THREE.Timer();
function loop(ts) { timer.update(ts); update(Math.min(timer.getDelta(), 0.05)); stage.render(); requestAnimationFrame(loop); }

window.__dx = { S, m, world, nav, setDest: guide.setDest, startRoute: guide.startRoute, gotoFloor: guide.gotoFloor, setMode: ui.setMode, teleportTo: guide.teleportTo, cancelRoute: guide.cancelRoute, keys: input.keys, THREE, TARGETS,
  tick(dt) { update(dt); },
  advance(sec, dt = 1 / 30) { for (let t = 0; t < sec; t += dt) update(dt); stage.render(); },
  cam() { const d = new THREE.Vector3(); camera.getWorldDirection(d); return { p: camera.position.toArray(), d: d.toArray() }; },
  info() { return { x: S.x, z: S.z, y: S.y, floor: player.curF(), mode: S.mode, walker: !!S.walker, done: S.walker ? S.walker.done : null }; },
  renderInfo() { const r = stage.renderer.info.render; return { calls: r.calls, triangles: r.triangles }; } };
try { if (!localStorage.getItem('dx.help1')) { $('#help').hidden = false; localStorage.setItem('dx.help1', '1'); } } catch (e) { }
ui.renderList(); ui.setMode('third'); ui.updateFloorButtons();
$('#loading').classList.add('done'); setTimeout(() => $('#loading').style.display = 'none', 500);
loop();
setTimeout(() => nav.grid && nav.grid.warmAsync(), 600);   // 背景預熱樓梯入口的路徑網格
