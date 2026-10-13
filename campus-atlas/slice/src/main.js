import { WING } from './data/wing.js';
import { buildLayout } from './model/layout.js';
import { createWorld } from './physics/collision.js';
import { createNav, createWalker } from './nav/navgraph.js';
import { makeMaterials } from './scene/materials.js';
import { buildBuilding } from './scene/buildingFactory.js';
import { buildEnvironment } from './scene/environment.js';
import { makeCharacter } from './scene/character.js';

const $ = (s) => document.querySelector(s);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const angDiff = (a, b) => { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };
const lay = buildLayout(WING), world = createWorld(lay), nav = createNav(lay, world);
const { FH, F } = lay;

// ---------- 渲染器與場景 ----------
const canvas = $('#scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
const scene = new THREE.Scene(); scene.background = new THREE.Color(0xcfe3ee); scene.fog = new THREE.Fog(0xcfe3ee, 70, 190);
const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 400);
scene.add(new THREE.AmbientLight(0xffffff, 0.3)); scene.add(new THREE.HemisphereLight(0xf4f8ff, 0x8d9a8d, 0.58));
const sun = new THREE.DirectionalLight(0xfff0d8, 0.5); sun.position.set(-30, 60, 40); scene.add(sun);
const M = makeMaterials();
const bld = buildBuilding(lay, M); scene.add(bld.root);
scene.add(buildEnvironment(lay, M));

// 教室門牌（走廊側氣窗上方）
function plaque(text) { const c = document.createElement('canvas'); c.width = 512; c.height = 96; const g = c.getContext('2d');
  g.fillStyle = '#2f5d50'; g.fillRect(0, 0, 512, 96); g.strokeStyle = '#e8efe9'; g.lineWidth = 5; g.strokeRect(6, 6, 500, 84);
  g.fillStyle = '#fff'; g.font = 'bold 46px "Noto Sans TC","PingFang TC","Microsoft JhengHei",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 256, 50);
  const t = new THREE.CanvasTexture(c); t.anisotropy = 4; return new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.28), new THREE.MeshBasicMaterial({ map: t })); }
lay.rooms.forEach(r => { const m = plaque(r.name); m.position.set(r.door.x, r.floor * FH + 3.15, lay.CD + 0.09); bld.floors[r.floor].add(m); });

// 選取高亮與目的地圖釘
const selPlane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0xffc928, transparent: true, opacity: 0.32, depthWrite: false })); selPlane.rotation.x = -Math.PI / 2; selPlane.visible = false; scene.add(selPlane);
const pin = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.6, 12), M.pin); pin.rotation.x = Math.PI; pin.visible = false; scene.add(pin);
const dots = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.15, 0.15, 0.02, 12), M.route, 600); dots.count = 0; dots.frustumCulled = false; scene.add(dots);
const ch = makeCharacter(M); scene.add(ch.group);

// ---------- 狀態 ----------
const sp = lay.nodes.find(n => n.id === 'cWa@0');
const S = { x: WING.L / 2, z: WING.D + 15, y: 0, heading: Math.PI, yaw: Math.PI, pitch: 0.34, dist: 6.2, mode: 'third', viewFloor: null,
  byaw: Math.PI, selected: null, walker: null, route: null, moving: false, walkT: 0, yCam: 0, dSm: 6.2, speedK: 1, turnK: 1 };
const keys = {}; const joy = { x: 0, y: 0 }; let drag = null, lastDragT = -9;
const floorLabel = (k) => `${k + 1}F`;

// ---------- 輸入 ----------
const KM = { KeyW: 'f', ArrowUp: 'f', KeyS: 'b', ArrowDown: 'b', KeyA: 'tl', ArrowLeft: 'tl', KeyD: 'tr', ArrowRight: 'tr', KeyQ: 'sl', KeyE: 'sr', ShiftLeft: 'run', ShiftRight: 'run' };
addEventListener('keydown', e => { if (e.target.tagName === 'INPUT') return; const k = KM[e.code]; if (k) { keys[k] = true; e.preventDefault(); }
  if (e.code === 'KeyV') cycleMode(); if (e.code === 'Escape') cancelRoute(); });
addEventListener('keyup', e => { const k = KM[e.code]; if (k) keys[k] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
canvas.addEventListener('pointerdown', e => { drag = { id: e.pointerId, x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, moved: false }; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointermove', e => { if (!drag || drag.id !== e.pointerId) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY;
  if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) > 6) drag.moved = true;
  if (S.mode === 'bird') S.byaw -= dx * 0.0055; else S.yaw -= dx * 0.0055 * S.turnK; if (S.mode !== 'bird') S.pitch = clamp(S.pitch + dy * 0.004 * S.turnK, -0.45, 1.25); lastDragT = performance.now(); });
canvas.addEventListener('pointerup', e => { if (drag && !drag.moved && S.mode === 'bird') pickRoom(e); drag = null; });
canvas.addEventListener('pointercancel', () => { drag = null; });
canvas.addEventListener('wheel', e => { e.preventDefault(); if (S.mode === 'bird') S.birdH = clamp((S.birdH || 36) + e.deltaY * 0.04, 14, 110); else S.dist = clamp(S.dist + e.deltaY * 0.008, 2.5, 14); }, { passive: false });
(function joystick() { const el = $('#joy'), knob = $('#joyknob'); let id = null;
  const set = (e) => { const r = el.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2, R = r.width / 2;
    let dx = (e.clientX - cx) / R, dy = (e.clientY - cy) / R; const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; }
    joy.x = dx; joy.y = -dy; knob.style.transform = `translate(${dx * R * .55}px,${dy * R * .55}px)`; };
  el.addEventListener('pointerdown', e => { id = e.pointerId; el.setPointerCapture(id); set(e); e.preventDefault(); });
  el.addEventListener('pointermove', e => { if (e.pointerId === id) set(e); });
  const end = e => { if (e.pointerId === id) { id = null; joy.x = joy.y = 0; knob.style.transform = ''; } };
  el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end); })();

// ---------- 導航 ----------
function setDest(room) { S.selected = room; cancelRoute(true); $('#info').hidden = !room;
  if (!room) { selPlane.visible = pin.visible = false; return; }
  $('#iname').textContent = room.name; $('#isub').textContent = `${floorLabel(room.floor)}・示意位置（未經校方測繪）`;
  selPlane.visible = true; selPlane.scale.set(room.x1 - room.x0 - 0.3, room.z1 - room.z0 - 0.3, 1); selPlane.position.set((room.x0 + room.x1) / 2, room.floor * FH + 0.03, (room.z0 + room.z1) / 2);
  pin.visible = true; pin.position.set(room.sill.x, room.floor * FH + 2.5, room.sill.z); renderList(); }
function cancelRoute(silent) { S.walker = null; S.route = null; dots.count = 0; $('#status').hidden = true; }
function startRoute(auto = true) { const r = S.selected; if (!r) return; const rt = nav.route(S, r.id); if (!rt) { toast('找不到路線'); return; }
  S.route = rt; drawRoute(rt); if (auto) S.walker = createWalker(world, rt); $('#status').hidden = false; $('#stext').textContent = `前往 ${r.name}（約 ${Math.round(rt.length)} 公尺）`; }
function drawRoute(rt) { const m = new THREE.Matrix4(); let n = 0, carry = 0;
  for (let i = 1; i < rt.pts.length && n < 600; i++) { const a = rt.pts[i - 1], b = rt.pts[i], len = Math.hypot(b.x - a.x, b.z - a.z); let d = carry;
    for (; d < len && n < 600; d += 0.8) { const t = len ? d / len : 0, x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t, yy = a.y + (b.y - a.y) * t, sy = world.surfaceY(x, z, yy + 0.2);
      m.setPosition(x, (sy ?? yy) + 0.05, z); dots.setMatrixAt(n++, m); } carry = d - len; }
  dots.count = n; dots.instanceMatrix.needsUpdate = true; }
function teleportToSill(room) { S.x = room.sill.x; S.z = room.sill.z; S.y = room.sill.y; S.heading = S.yaw = Math.PI; S.yCam = S.y; camInit = false; camLim = Infinity; }
function gotoFloor(k) { if (S.mode === 'bird') { S.viewFloor = S.viewFloor === k ? null : k; updateFloorButtons(); return; }
  cancelRoute(); S.x = clamp(S.x, 7, WING.L - 7); S.z = lay.ZC; S.y = k * FH; S.heading = S.yaw = Math.PI / 2; S.yCam = S.y; camInit = false; updateFloorButtons(); }
function toast(t) { const el = $('#toast'); el.textContent = t; el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => el.hidden = true, 2400); }

// ---------- UI ----------
function renderList() { const q = ($('#q').value || '').trim().toLowerCase(); const box = $('#list'); box.innerHTML = '';
  for (let k = F - 1; k >= 0; k--) { const rs = lay.rooms.filter(r => r.floor === k && (!q || r.name.toLowerCase().includes(q) || `${k + 1}f`.includes(q) || `${k + 1}樓`.includes(q)));
    if (!rs.length) continue; const h = document.createElement('div'); h.className = 'grp'; h.textContent = `${floorLabel(k)}`; box.appendChild(h);
    rs.forEach(r => { const b = document.createElement('button'); b.className = 'item' + (S.selected === r ? ' on' : ''); b.textContent = r.name; b.onclick = () => { setDest(r); if (innerWidth < 760) $('#panel').classList.remove('open'); }; box.appendChild(b); }); } }
function updateFloorButtons() { const cur = nav.floorOf(S.y); document.querySelectorAll('#floors button').forEach(b => { const k = b.dataset.k; b.classList.toggle('on', k === 'all' ? (S.mode === 'bird' && S.viewFloor === null) : (S.mode === 'bird' ? S.viewFloor === +k : cur === +k)); }); }
(function buildFloorButtons() { const box = $('#floors'); for (let k = F - 1; k >= 0; k--) { const b = document.createElement('button'); b.dataset.k = k; b.textContent = floorLabel(k); b.onclick = () => gotoFloor(k); box.appendChild(b); }
  const a = document.createElement('button'); a.dataset.k = 'all'; a.textContent = '全貌'; a.onclick = () => { if (S.mode !== 'bird') setMode('bird'); S.viewFloor = null; updateFloorButtons(); }; box.appendChild(a); })();
function setMode(m) { S.mode = m; camInit = false; document.querySelectorAll('#modes button').forEach(b => b.classList.toggle('on', b.dataset.m === m)); if (m === 'bird') { S.birdH = S.birdH || 36; } updateFloorButtons(); }
const MODES = ['third', 'first', 'bird']; function cycleMode() { setMode(MODES[(MODES.indexOf(S.mode) + 1) % 3]); }
document.querySelectorAll('#modes button').forEach(b => b.onclick = () => setMode(b.dataset.m));
$('#q').addEventListener('input', renderList);
$('#go').onclick = () => startRoute(true); $('#tp').onclick = () => { if (S.selected) { cancelRoute(); teleportToSill(S.selected); toast('已傳送到 ' + S.selected.name + ' 門口'); } };
$('#stop').onclick = () => cancelRoute(); $('#clr').onclick = () => setDest(null);
$('#pbtn').onclick = () => $('#panel').classList.toggle('open');
$('#helpbtn').onclick = () => $('#help').hidden = !$('#help').hidden; $('#helpclose').onclick = () => $('#help').hidden = true;
$('#spd').onclick = () => { S.speedK = S.speedK === 1 ? 1.6 : S.speedK === 1.6 ? 0.6 : 1; $('#spd').textContent = '速度 ' + Math.round(S.speedK * 100) + '%'; };
function pickRoom(e) { const r = canvas.getBoundingClientRect(), v = new THREE.Vector2((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1);
  const rc = new THREE.Raycaster(); rc.setFromCamera(v, camera); const ks = S.viewFloor === null ? [F - 1, ...Array.from({ length: F - 1 }, (_, i) => F - 2 - i)] : [S.viewFloor];
  for (const k of ks) { const o = rc.ray.origin, d = rc.ray.direction, y = k * FH + 0.02; if (Math.abs(d.y) < 1e-4) continue; const t = (y - o.y) / d.y; if (t < 0) continue;
    const x = o.x + d.x * t, z = o.z + d.z * t; const room = lay.rooms.find(rm => rm.floor === k && x >= rm.x0 && x <= rm.x1 && z >= rm.z0 && z <= rm.z1);
    if (room && (S.viewFloor !== null || k === F - 1)) { setDest(room); return; } } }

// ---------- 主迴圈 ----------
function resize() { const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();
let fpsN = 0, fpsT = 0, hudT = 0; const camPos = new THREE.Vector3(), camPrev = new THREE.Vector3(), camPrevS = { x: 0, z: 0 }; let camPrevInit = false, camTh = 0, camThInit = false; let camInit = false, camLim = Infinity;
function update(dt) {
  S.moving = false;
  const fwd = (keys.f ? 1 : 0) - (keys.b ? 1 : 0) + joy.y, turn = (keys.tl ? 1 : 0) - (keys.tr ? 1 : 0) - joy.x * 0.9, str = (keys.sr ? 1 : 0) - (keys.sl ? 1 : 0);
  const manual = Math.abs(fwd) > 0.05 || Math.abs(turn) > 0.05 || Math.abs(str) > 0.05;
  if (manual && S.walker) { S.walker = null; $('#stext').textContent = '已改為手動操作（路線仍顯示）'; }
  if (manual && S.mode !== 'bird') {
    S.yaw += turn * 1.9 * S.turnK * dt;                                   // 左右＝轉彎，鏡頭與人物一起轉
    let mx = Math.sin(S.yaw) * fwd - Math.cos(S.yaw) * str, mz = Math.cos(S.yaw) * fwd + Math.sin(S.yaw) * str; const ml = Math.hypot(mx, mz);
    if (ml > 0.05) { mx /= ml; mz /= ml; const sp = (keys.run ? 7.4 : 4.4) * S.speedK * Math.min(1, ml); world.move(S, mx * sp * dt, mz * sp * dt); S.moving = true;
      S.heading += angDiff(S.heading, Math.atan2(mx, mz)) * Math.min(1, dt * 12); }
    else S.heading += angDiff(S.heading, S.yaw) * Math.min(1, dt * 8);
  } else if (S.walker) {
    const px = S.x, pz = S.z; S.walker.step(S, dt, 4.8 * S.speedK); S.moving = Math.hypot(S.x - px, S.z - pz) > 1e-4;
    if (S.moving) S.heading += angDiff(S.heading, Math.atan2(S.x - px, S.z - pz)) * Math.min(1, dt * 10);
    if (!drag && performance.now() - lastDragT > 900) { const lim = (S.occ ? 3.0 : 1.5) * dt; const inShaft = lay.shafts.some(sh => S.x > sh.x0 + 0.1 && S.x < sh.x0 + 4.9 && S.z < lay.CD + 0.3);   // 梯間內：鏡頭固定從開口側往內看，不隨 U 形轉彎亂轉
      S.yaw += clamp(angDiff(S.yaw, inShaft ? Math.PI : S.walker.ahead(S, 3.2)) * (S.occ ? 4 : 2.2) * dt, -lim, lim); }   // 鏡頭平順跟上，限制角速度
    if (S.walker.done) { const r = S.selected; cancelRoute(); toast('已到達 ' + (r ? r.name : '') + ' 門口'); }
    else if (S.walker.stuck) { S.walker = null; startRoute(true); }
  }
  S.walkT += dt * (S.moving ? 9 * Math.max(0.7, S.speedK) : 0); const sw = Math.sin(S.walkT) * 0.75 * (S.moving ? 1 : 0);
  ch.limbs.legL.rotation.x = sw; ch.limbs.legR.rotation.x = -sw; ch.limbs.armL.rotation.x = -sw * 0.9; ch.limbs.armR.rotation.x = sw * 0.9;
  S.yCam += (S.y - S.yCam) * Math.min(1, dt * 7);                           // 鏡頭高度低通：爬樓梯不抖
  ch.group.position.set(S.x, S.y + Math.abs(Math.sin(S.walkT)) * 0.04 * (S.moving ? 1 : 0), S.z); ch.group.rotation.y = S.heading;

  // 樓層顯示（鳥瞰剖開）
  const bird = S.mode === 'bird';
  bld.floors.forEach((g, k) => g.visible = !(bird && S.viewFloor !== null && k > S.viewFloor)); bld.roof.visible = !(bird && S.viewFloor !== null);
  pin.rotation.y += dt * 2; if (pin.visible) pin.position.y = (S.selected ? S.selected.floor * FH : 0) + 2.5 + Math.sin(performance.now() / 300) * 0.08;

  // 鏡頭
  const tgt = new THREE.Vector3(S.x, S.yCam + 1.35, S.z);
  if (S.mode === 'third') {
    const bx = -Math.sin(S.yaw), bz = -Math.cos(S.yaw), pE = clamp(S.pitch, -0.2, 1.2), cp = Math.cos(pE), spn = Math.sin(pE);
    const want = S.dist, t = world.ray(S.x, S.z, S.x + bx * want * cp, S.z + bz * want * cp, S.y, 0.2), dA = clamp(t * want - 0.1, 0.9, want);
    S.occ = t * want < want * 0.8;
    const des = new THREE.Vector3(S.x + bx * dA * cp, tgt.y + spn * dA, S.z + bz * dA * cp);
    des.y = Math.max(Math.min(des.y, world.ceilingY(des.x, des.z, S.y) - 0.15), S.yCam + 0.35);
    if (!camInit) { camPos.copy(des); camInit = true; camLim = Infinity; camPrevInit = false; camThInit = false; }
    camPos.lerp(des, 1 - Math.exp(-dt * 6.5));
    { const ex = camPos.x - S.x, ez = camPos.z - S.z, Lh = Math.hypot(ex, ez);       // 繞角色的方位角速度上限：U 形轉彎／進出梯間時鏡頭不會甩動
      if (Lh > 0.3) { const th = Math.atan2(ex, ez); if (camThInit) { const w = (S.occ ? 3.4 : 2.6) * dt, dth = clamp(angDiff(camTh, th), -w, w); camTh += dth; } else camTh = th; camThInit = true;
        camPos.x = S.x + Math.sin(camTh) * Lh; camPos.z = S.z + Math.cos(camTh) * Lh; } }                              // 鏡頭位置指數平滑（不逐分量跳動）
    { const ex = camPos.x - S.x, ez = camPos.z - S.z, Lh = Math.hypot(ex, ez);   // 安全：平滑後仍不可穿牆；被擋時「快速但不瞬間」收近
      if (Lh > 0.05) { const t2 = world.ray(S.x, S.z, camPos.x, camPos.z, S.y, 0.16), Lallow = t2 < 1 ? Math.max(0.9, t2 * Lh - 0.1) : Lh;
        if (!isFinite(camLim) || Lallow >= camLim) camLim = Lallow; else camLim += (Lallow - camLim) * (1 - Math.exp(-dt * 9));
        const Ls = Math.min(Lh, camLim), k = Ls / Lh; camPos.x = S.x + ex * k; camPos.z = S.z + ez * k; if (k < 1) camPos.y = tgt.y + (camPos.y - tgt.y) * k; }   // 沿視線等比收近（3D 徑向），視線方向不變
      camPos.y = Math.max(Math.min(camPos.y, world.ceilingY(camPos.x, camPos.z, S.y) - 0.15), S.yCam + 0.35); }
    { const vp = dt > 0 ? Math.hypot(S.x - camPrevS.x, S.z - camPrevS.z) / dt : 0;       // 鏡頭速度上限：避免被遮擋/解除遮擋時單幀大跳（爬樓梯、進門的晃動來源）
      if (camPrevInit) { const mx = camPos.x - camPrev.x, my = camPos.y - camPrev.y, mz = camPos.z - camPrev.z, L = Math.hypot(mx, my, mz), cap = (6 + 1.3 * Math.min(vp, 9)) * dt;
        if (L > cap) camPos.set(camPrev.x + mx / L * cap, camPrev.y + my / L * cap, camPrev.z + mz / L * cap); }
      camPrev.copy(camPos); camPrevS.x = S.x; camPrevS.z = S.z; camPrevInit = true; }
    const d = Math.hypot(camPos.x - S.x, camPos.z - S.z);
    camera.position.copy(camPos); camera.up.set(0, 1, 0); camera.lookAt(tgt); ch.group.visible = d > 0.95;
  } else if (S.mode === 'first') {
    camera.position.set(S.x, S.yCam + 1.5, S.z); camera.up.set(0, 1, 0); const p = -(S.pitch - 0.1);
    camera.lookAt(S.x + Math.sin(S.yaw) * Math.cos(p) * 5, S.yCam + 1.5 + Math.sin(p) * 5, S.z + Math.cos(S.yaw) * Math.cos(p) * 5); ch.group.visible = false;
  } else { const h = S.birdH || 36; const cxm = WING.L / 2 + (S.x - WING.L / 2) * 0.0, czm = WING.D / 2 + 4;
    camera.position.set(cxm, (S.viewFloor === null ? 0 : S.viewFloor * FH) + h, czm + 0.01); camera.up.set(Math.sin(S.byaw), 0, Math.cos(S.byaw)); camera.lookAt(cxm, (S.viewFloor === null ? 0 : S.viewFloor * FH), czm); ch.group.visible = true; }
  fpsN++; fpsT += dt; if (fpsT > 1) { $('#fps').textContent = Math.round(fpsN / fpsT) + ' fps'; fpsN = 0; fpsT = 0; }
  hudT += dt; if (hudT > 0.15) { hudT = 0; updateFloorButtons(); const k = nav.floorOf(S.y); $('#where').textContent = `${floorLabel(k)} · ${S.x < 5 || S.x > WING.L - 5 ? '梯間' : (S.z > lay.CD && S.z < WING.D ? '走廊' : (S.z < lay.CD && S.y >= 0 && S.x > 0 && S.x < WING.L && S.z > 0 ? '教室' : '戶外'))}`; }
}
const clock = new THREE.Clock();
function loop() { update(Math.min(clock.getDelta(), 0.05)); renderer.render(scene, camera); requestAnimationFrame(loop); }

// 測試／除錯用：確定性前進
window.__slice = { S, lay, world, nav, setDest, startRoute, gotoFloor, setMode, teleportToSill, cancelRoute, keys, THREE,
  advance(sec, dt = 1 / 30) { for (let t = 0; t < sec; t += dt) update(dt); renderer.render(scene, camera); },
  cam() { const d = new THREE.Vector3(); camera.getWorldDirection(d); return { p: camera.position.toArray(), d: d.toArray() }; },
  info() { return { x: S.x, z: S.z, y: S.y, floor: nav.floorOf(S.y), mode: S.mode, walker: !!S.walker, done: S.walker ? S.walker.done : null }; } };
try { if (!localStorage.getItem('slice.help1')) { $('#help').hidden = false; localStorage.setItem('slice.help1', '1'); } } catch (e) { }
renderList(); setMode('third'); updateFloorButtons();
$('#loading').classList.add('done'); setTimeout(() => $('#loading').style.display = 'none', 500);
loop();
