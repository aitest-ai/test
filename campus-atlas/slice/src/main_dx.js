// 東新國小版：用 slice 的相機／輸入／UI／測試掛鉤，載入由設計圖推得的真實平面資料。
import { buildModel } from './dongxin/model.js';
import { createDxWorld } from './dongxin/world.js';
import { createDxNav } from './dongxin/nav.js';
import { buildDongxinScene } from './dongxin/scene.js';
import { createWalker } from './nav/navgraph.js';
import { makeMaterials } from './scene/materials.js';
import { makeCharacter } from './scene/character.js';

const $ = (s) => document.querySelector(s);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const angDiff = (a, b) => { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };
const FONT = '"Noto Sans TC","PingFang TC","Microsoft JhengHei",sans-serif';

const D = await (await fetch('./data/dongxin_geo.json')).json();
const m = buildModel(D), world = createDxWorld(m), nav = createDxNav(m, world);
const { FH, LY, NL, NF, UP, STAIRS, ROOMS, PLACES, levelLabel, RANK } = m;

// ---------- 渲染器與場景 ----------
const canvas = $('#scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
const scene = new THREE.Scene(); scene.background = new THREE.Color(0xbcd9ee); scene.fog = new THREE.Fog(0xbcd9ee, 110, 420);
const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 900);
scene.add(new THREE.AmbientLight(0xffffff, 0.32)); scene.add(new THREE.HemisphereLight(0xe4f2ff, 0xb7a98d, 0.6));
const sun = new THREE.DirectionalLight(0xfff0d8, 0.5); sun.position.set(-30, 60, 40); scene.add(sun);
const M = makeMaterials();
const dx = buildDongxinScene(m, M, { planUrl: './assets/dongxin_plan_soft.jpg' }); scene.add(dx.root);
world.setPillars(dx.PILLARS);
const FG = dx.FG, CAN = dx.CAN;

const selPlane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0xffc928, transparent: true, opacity: 0.32, depthWrite: false })); selPlane.rotation.x = -Math.PI / 2; selPlane.visible = false; scene.add(selPlane);
const pin = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.8, 12), M.pin); pin.rotation.x = Math.PI; pin.visible = false; scene.add(pin);
const dots = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.17, 0.17, 0.02, 12), M.route, 1600); dots.count = 0; dots.frustumCulled = false; scene.add(dots);
const ch = makeCharacter(M); scene.add(ch.group);

// ---------- 狀態 ----------
const GATE = dx.GATE;
const TWR = STAIRS.slice().sort((a, b) => Math.hypot(a.cx - GATE.x, a.cz - GATE.z) - Math.hypot(b.cx - GATE.x, b.cz - GATE.z))[0];
const HD0 = Math.atan2(TWR.cx - GATE.x, TWR.cz - GATE.z);           // 出生點：校門正面，面向鐘塔
const S = { x: GATE.x, z: GATE.z, y: 0, heading: HD0, yaw: HD0, pitch: 0.34, dist: 6.4, mode: 'third', viewFloor: null,
  byaw: Math.PI, birdH: 70, selected: null, walker: null, route: null, moving: false, walkT: 0, yCam: 0, speedK: 1, turnK: 1 };
const keys = {}; const joy = { x: 0, y: 0 }; let drag = null, lastDragT = -9;
const TARGETS = ROOMS.filter(r => !r.solid).concat(PLACES);
const lvlOrder = [3, 2, 1, 0, 4];
const curF = () => world.floorOfY(S.y + 0.1);

// ---------- 輸入 ----------
const KM = { KeyW: 'f', ArrowUp: 'f', KeyS: 'b', ArrowDown: 'b', KeyA: 'tl', ArrowLeft: 'tl', KeyD: 'tr', ArrowRight: 'tr', KeyQ: 'sl', KeyE: 'sr', ShiftLeft: 'run', ShiftRight: 'run' };
addEventListener('keydown', e => { if (e.target.tagName === 'INPUT') return; const k = KM[e.code]; if (k) { keys[k] = true; e.preventDefault(); }
  if (e.code === 'KeyV') cycleMode(); if (e.code === 'Escape') cancelRoute(); });
addEventListener('keyup', e => { const k = KM[e.code]; if (k) keys[k] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
canvas.addEventListener('pointerdown', e => { drag = { id: e.pointerId, x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, moved: false }; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointermove', e => { if (!drag || drag.id !== e.pointerId) return; const dx_ = e.clientX - drag.x, dy_ = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY;
  if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) > 6) drag.moved = true;
  if (S.mode === 'bird') S.byaw -= dx_ * 0.0055; else S.yaw -= dx_ * 0.0055 * S.turnK; if (S.mode !== 'bird') S.pitch = clamp(S.pitch + dy_ * 0.004 * S.turnK, -0.45, 1.25); lastDragT = performance.now(); });
canvas.addEventListener('pointerup', e => { if (drag && !drag.moved && S.mode === 'bird') pickRoom(e); drag = null; });
canvas.addEventListener('pointercancel', () => { drag = null; });
canvas.addEventListener('wheel', e => { e.preventDefault(); if (S.mode === 'bird') S.birdH = clamp(S.birdH + e.deltaY * 0.08, 20, 180); else S.dist = clamp(S.dist + e.deltaY * 0.008, 2.5, 14); }, { passive: false });
(function joystick() { const el = $('#joy'), knob = $('#joyknob'); let id = null;
  const set = (e) => { const r = el.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2, R = r.width / 2;
    let dx_ = (e.clientX - cx) / R, dy_ = (e.clientY - cy) / R; const l = Math.hypot(dx_, dy_); if (l > 1) { dx_ /= l; dy_ /= l; }
    joy.x = dx_; joy.y = -dy_; knob.style.transform = `translate(${dx_ * R * .55}px,${dy_ * R * .55}px)`; };
  el.addEventListener('pointerdown', e => { id = e.pointerId; el.setPointerCapture(id); set(e); e.preventDefault(); });
  el.addEventListener('pointermove', e => { if (e.pointerId === id) set(e); });
  const end = e => { if (e.pointerId === id) { id = null; joy.x = joy.y = 0; knob.style.transform = ''; } };
  el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end); })();

// ---------- 導航 ----------
const where = (r) => r.f === 4 ? 'B1' : (r.t === 'p' ? '戶外' : levelLabel(r.f));
function setDest(t) { S.selected = t; cancelRoute(true); $('#info').hidden = !t;
  if (!t) { selPlane.visible = pin.visible = false; return; }
  $('#iname').textContent = t.name; $('#isub').textContent = `${where(t)}・${t.t === 'p' ? '地點' : '名稱暫定（依設計圖）'}・非校方測繪`;
  if (t.X0 !== undefined) { selPlane.visible = true; selPlane.scale.set(t.w - 0.3, t.d - 0.3, 1); selPlane.position.set(t.cx, LY(t.f) + 0.05, t.cz); } else selPlane.visible = false;
  pin.visible = true; pin.position.set(t.x, LY(t.f) + 2.8, t.z); renderList(); }
function cancelRoute() { S.walker = null; S.route = null; dots.count = 0; $('#status').hidden = true; }
function startRoute(auto = true) { const t = S.selected; if (!t) return; const rt = nav.route(S, t); if (!rt) { toast('找不到路線'); return; }
  S.route = rt; drawRoute(rt); if (auto) S.walker = createWalker(world, rt, { tol: 0.12 }); $('#status').hidden = false; $('#stext').textContent = `前往 ${t.name}（約 ${Math.round(rt.length)} 公尺）`; }
function drawRoute(rt) { const mm = new THREE.Matrix4(); let n = 0, carry = 0;
  for (let i = 1; i < rt.pts.length && n < 1600; i++) { const a = rt.pts[i - 1], b = rt.pts[i], len = Math.hypot(b.x - a.x, b.z - a.z); let d = carry;
    for (; d < len && n < 1600; d += 0.9) { const k = len ? d / len : 0, x = a.x + (b.x - a.x) * k, z = a.z + (b.z - a.z) * k, yy = a.y + (b.y - a.y) * k, sy = world.surfaceY(x, z, yy + 0.2);
      mm.setPosition(x, (sy ?? yy) + 0.06, z); dots.setMatrixAt(n++, mm); } carry = d - len; }
  dots.count = n; dots.instanceMatrix.needsUpdate = true; }
function teleportTo(t) { cancelRoute();                      // 教室：站到門外走廊、面向教室門；其他：就地
  const d = t.door; let x = t.x, z = t.z;
  if (d && d.out && world.standOk(d.out.x, d.out.z, LY(t.f))) { x = d.out.x; z = d.out.z; S.yaw = S.heading = Math.atan2(-d.nx, -d.nz); }
  S.x = x; S.z = z; S.y = LY(t.f); S.yCam = S.y; camInit = false; camLim = Infinity; }
function nearestOnFloor(f) {   // 該樓層離目前位置最近、不在房間/梯口附近的可走格
  const e = m.ERO[f], i0 = m.ci(S.x), j0 = m.cj(S.z), sts = STAIRS.filter(t => t.fl.includes(f)); let best = -1, bd = 1e9;
  const okc = (i, j, strict) => { const k = j * m.GW + i; if (!e[k]) return false; if (strict) { if (m.RC[f][k] >= 0) return false; const x = m.cxm(i), z = m.czm(j); for (const t of sts) if (x > t.X0 - 2.5 && x < t.X1 + 2.5 && z > t.Z0 - 2.5 && z < t.Z1 + 2.5) return false; } return true; };
  for (const strict of [true, false]) { for (let R = 0; R <= 260 && best < 0; R++) for (let j = j0 - R; j <= j0 + R; j++) for (let i = i0 - R; i <= i0 + R; i++) {
      if (Math.max(Math.abs(i - i0), Math.abs(j - j0)) !== R || i < 0 || j < 0 || i >= m.GW || j >= m.GH) continue;
      if (okc(i, j, strict)) { const d = (i - i0) ** 2 + (j - j0) ** 2; if (d < bd) { bd = d; best = j * m.GW + i; } } }
    if (best >= 0) break; }
  return best < 0 ? null : { x: m.cxm(best % m.GW), z: m.czm((best / m.GW) | 0) };
}
function gotoFloor(f) {
  if (S.mode === 'bird') { S.viewFloor = S.viewFloor === f ? null : f; updateFloorButtons(); return; }
  if (f === curF() && Math.abs(S.y - LY(f)) < 0.3) { toast('目前就在 ' + levelLabel(f)); return; }
  const c = nearestOnFloor(f); if (!c) { toast(levelLabel(f) + ' 沒有可到達的地方'); return; }
  const far = Math.hypot(c.x - S.x, c.z - S.z);
  cancelRoute(); S.x = c.x; S.z = c.z; S.y = LY(f); S.yCam = S.y; camInit = false; camLim = Infinity; updateFloorButtons();
  toast('已到 ' + levelLabel(f) + (far > 6 ? '（最近的可走位置）' : ''));
  if (S.selected) startRoute(false);
}
function toast(t) { const el = $('#toast'); el.textContent = t; el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => el.hidden = true, 2400); }

// ---------- UI ----------
const norm = (s) => (s || '').toLowerCase().replace(/\s+/g, '');
function renderList() { const q = norm($('#q').value); const box = $('#list'); box.innerHTML = '';
  const groups = [['戶外・地點', TARGETS.filter(t => t.t === 'p')], ...lvlOrder.map(f => [levelLabel(f), TARGETS.filter(t => t.t !== 'p' && t.f === f)])];
  for (const [title, arr] of groups) { const rs = arr.filter(r => !q || norm(r.name).includes(q) || norm(title).includes(q) || (q.endsWith('樓') && norm(title) === (q.slice(0, -1) + 'f')));
    if (!rs.length) continue; const h = document.createElement('div'); h.className = 'grp'; h.textContent = title; box.appendChild(h);
    rs.forEach(r => { const b = document.createElement('button'); b.className = 'item' + (S.selected === r ? ' on' : ''); b.textContent = r.name; b.onclick = () => { setDest(r); if (innerWidth < 760) $('#panel').classList.remove('open'); }; box.appendChild(b); }); } }
function updateFloorButtons() { const cur = curF(); document.querySelectorAll('#floors button').forEach(b => { const k = b.dataset.k; b.classList.toggle('on', k === 'all' ? (S.mode === 'bird' && S.viewFloor === null) : (S.mode === 'bird' ? S.viewFloor === +k : cur === +k)); }); }
(function buildFloorButtons() { const box = $('#floors'); lvlOrder.forEach(f => { const b = document.createElement('button'); b.dataset.k = f; b.textContent = levelLabel(f); b.onclick = () => gotoFloor(f); box.appendChild(b); });
  const a = document.createElement('button'); a.dataset.k = 'all'; a.textContent = '全貌'; a.onclick = () => { if (S.mode !== 'bird') setMode('bird'); S.viewFloor = null; updateFloorButtons(); }; box.appendChild(a); })();
function setMode(mo) { S.mode = mo; camInit = false; document.querySelectorAll('#modes button').forEach(b => b.classList.toggle('on', b.dataset.m === mo)); updateFloorButtons(); }
const MODES = ['third', 'first', 'bird']; function cycleMode() { setMode(MODES[(MODES.indexOf(S.mode) + 1) % 3]); }
document.querySelectorAll('#modes button').forEach(b => b.onclick = () => setMode(b.dataset.m));
$('#q').addEventListener('input', renderList);
$('#go').onclick = () => startRoute(true); $('#tp').onclick = () => { if (S.selected) { teleportTo(S.selected); toast('已傳送到 ' + S.selected.name); } };
$('#stop').onclick = () => cancelRoute(); $('#clr').onclick = () => setDest(null);
$('#pbtn').onclick = () => $('#panel').classList.toggle('open');
$('#helpbtn').onclick = () => $('#help').hidden = !$('#help').hidden; $('#helpclose').onclick = () => $('#help').hidden = true;
$('#spd').onclick = () => { S.speedK = S.speedK === 1 ? 1.6 : S.speedK === 1.6 ? 0.6 : 1; $('#spd').textContent = '速度 ' + Math.round(S.speedK * 100) + '%'; };
function pickRoom(e) { const r = canvas.getBoundingClientRect(), v = new THREE.Vector2((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1);
  const rc = new THREE.Raycaster(); rc.setFromCamera(v, camera);
  const ks = S.viewFloor === null ? [3, 2, 1, 0] : [S.viewFloor];
  for (const f of ks) { const o = rc.ray.origin, d = rc.ray.direction, y = LY(f) + 0.02; if (Math.abs(d.y) < 1e-4) continue; const t = (y - o.y) / d.y; if (t < 0) continue;
    const x = o.x + d.x * t, z = o.z + d.z * t; const room = ROOMS.find(rm => !rm.solid && rm.f === f && x >= rm.X0 && x <= rm.X1 && z >= rm.Z0 && z <= rm.Z1);
    if (room) { setDest(room); return; } } }

// ---------- 小地圖 ----------
const mini = $('#mini'), mg = mini.getContext('2d'); const miniFloor = []; let planImg = null;
{ const im = new Image(); im.onload = () => { planImg = im; }; im.src = './assets/dongxin_plan.jpg'; }
for (let f = 1; f < NL; f++) { const c = document.createElement('canvas'); c.width = m.GW; c.height = m.GH; const g = c.getContext('2d'), id = g.createImageData(m.GW, m.GH), n = m.NAV[f], rc = m.RC[f];
  for (let k = 0; k < m.GW * m.GH; k++) { let r = 0, gg = 0, b = 0, a = 0; if (n[k] && rc[k] < 0) { r = 216; gg = 212; b = 202; a = 255; } else if (rc[k] >= 0) { r = 244; gg = 240; b = 230; a = 255; if (!n[k]) { r = 70; gg = 76; b = 84; } }
    id.data[k * 4] = r; id.data[k * 4 + 1] = gg; id.data[k * 4 + 2] = b; id.data[k * 4 + 3] = a; } g.putImageData(id, 0, 0); miniFloor[f] = c; }
function drawMini() {
  const w = mini.width, h = mini.height, ppm = w / 70, f = curF();
  mg.setTransform(1, 0, 0, 1, 0, 0); mg.clearRect(0, 0, w, h); mg.fillStyle = '#2b2f33'; mg.fillRect(0, 0, w, h);
  const rot = -Math.PI / 2 - Math.atan2(Math.cos(S.yaw), Math.sin(S.yaw));
  mg.save(); mg.translate(w / 2, h / 2); mg.rotate(rot); mg.scale(ppm, ppm); mg.translate(-S.x, -S.z);
  if (f === 0) { if (planImg && dx.groundBox) mg.drawImage(planImg, dx.groundBox.x, dx.groundBox.z, dx.groundBox.w, dx.groundBox.h); mg.fillStyle = 'rgba(255,255,255,.30)'; m.BYFLOOR[0].forEach(r => mg.fillRect(r.X0, r.Z0, r.w, r.d)); }
  else if (miniFloor[f]) { mg.imageSmoothingEnabled = false; mg.drawImage(miniFloor[f], m.WX0, m.WZ0, m.GW * m.CELL, m.GH * m.CELL); }
  const rt = S.route; if (rt) { mg.strokeStyle = '#ff7a00'; mg.lineWidth = 0.9; mg.lineJoin = 'round'; mg.lineCap = 'round'; mg.setLineDash([1.4, 1.2]); mg.beginPath(); let pen = false;
    rt.pts.forEach(p => { if (world.floorOfY(p.y + 0.1) !== f || p.stair) { pen = false; return; } if (!pen) { mg.moveTo(p.x, p.z); pen = true; } else mg.lineTo(p.x, p.z); }); mg.stroke(); mg.setLineDash([]);
    const t = S.selected; if (t && t.f === f) { mg.fillStyle = '#ff4d3d'; mg.beginPath(); mg.arc(t.x, t.z, 1.7, 0, 7); mg.fill(); mg.strokeStyle = '#fff'; mg.lineWidth = 0.4; mg.stroke(); } }
  mg.restore();
  const a = Math.atan2(Math.cos(S.heading), Math.sin(S.heading)) + rot;
  mg.save(); mg.translate(w / 2, h / 2); mg.rotate(a); mg.fillStyle = '#2f9cff'; mg.strokeStyle = '#fff'; mg.lineWidth = 3; mg.beginPath(); mg.moveTo(15, 0); mg.lineTo(-9, -9); mg.lineTo(-4, 0); mg.lineTo(-9, 9); mg.closePath(); mg.fill(); mg.stroke(); mg.restore();
  mg.fillStyle = 'rgba(0,0,0,.55)'; mg.fillRect(w - 62, h - 30, 58, 26); mg.fillStyle = '#fff'; mg.font = '700 20px ' + FONT; mg.textAlign = 'center'; mg.fillText(levelLabel(f), w - 33, h - 10);
}

// ---------- 主迴圈 ----------
function resize() { const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();
let fpsN = 0, fpsT = 0, hudT = 0, whereKey = ''; const camPos = new THREE.Vector3(), camPrev = new THREE.Vector3(), camPrevS = { x: 0, z: 0 }; let camPrevInit = false, camTh = 0, camThInit = false; let camInit = false, camLim = Infinity;
const stairYaw = (s) => s.along === 'x' ? s.sgn * Math.PI / 2 : (s.sgn > 0 ? 0 : Math.PI);   // 站在梯間入口端、朝梯間內看（A→B）
function update(dt) {
  S.moving = false;
  const fwd = (keys.f ? 1 : 0) - (keys.b ? 1 : 0) + joy.y, turn = (keys.tl ? 1 : 0) - (keys.tr ? 1 : 0) - joy.x * 0.9, str = (keys.sr ? 1 : 0) - (keys.sl ? 1 : 0);
  const manual = Math.abs(fwd) > 0.05 || Math.abs(turn) > 0.05 || Math.abs(str) > 0.05;
  if (manual && S.walker) { S.walker = null; $('#stext').textContent = '已改為手動操作（路線仍顯示）'; }
  const stairNow = world.stairAt(S.x, S.z, 0), inShaft = !!stairNow && Math.abs(S.y - LY(curF())) > 0.25;
  if (manual && S.mode !== 'bird') {
    S.yaw += turn * 1.9 * S.turnK * dt;
    let mx = Math.sin(S.yaw) * fwd - Math.cos(S.yaw) * str, mz = Math.cos(S.yaw) * fwd + Math.sin(S.yaw) * str; const ml = Math.hypot(mx, mz);
    if (ml > 0.05) { mx /= ml; mz /= ml; const sp = (keys.run ? 8.4 : 5.0) * S.speedK * Math.min(1, ml); world.move(S, mx * sp * dt, mz * sp * dt); S.moving = true;
      { const sA = world.stairAt(S.x, S.z, 0.3);                                      // 梯口導引：朝梯間直走時，輕推向最近的梯跑中線（梯口中央是分隔牆，不用精準對位）
        if (sA && Math.abs(S.y - LY(curF())) < 0.2) { const [u, v] = world.stairLoc(sA, S.x, S.z), fU = (sA.along === 'x' ? mx : mz) * sA.sgn;
          if (fU > 0.3 && u < sA.uA + 0.2 && u > sA.uA - 1.6) { const cf = curF(), canDn = m.DN[cf] >= 0 && sA.fl.includes(m.DN[cf]), canUp = UP[cf] >= 0 && sA.fl.includes(UP[cf]);
            const tv = (v > 0.3 && canDn) || !canUp ? sA.lane : -sA.lane, dv = clamp((tv - v) * 2.6, -1.8, 1.8) * dt; world.move(S, sA.along === 'x' ? 0 : dv, sA.along === 'x' ? dv : 0); } } }
      S.heading += angDiff(S.heading, Math.atan2(mx, mz)) * Math.min(1, dt * 12); }
    else S.heading += angDiff(S.heading, S.yaw) * Math.min(1, dt * 8);
  } else if (S.walker) {
    const px = S.x, pz = S.z; S.walker.step(S, dt, 5.6 * S.speedK); S.moving = Math.hypot(S.x - px, S.z - pz) > 1e-4;
    if (S.moving) S.heading += angDiff(S.heading, Math.atan2(S.x - px, S.z - pz)) * Math.min(1, dt * 10);
    if (!drag && performance.now() - lastDragT > 900) { const lim = (S.occ ? 3.0 : 1.5) * dt;
      S.yaw += clamp(angDiff(S.yaw, inShaft ? stairYaw(stairNow) : S.walker.ahead(S, 3.2)) * (S.occ ? 4 : 2.2) * dt, -lim, lim); }
    if (S.walker.done) { const t = S.selected; cancelRoute(); toast('已到達 ' + (t ? t.name : '')); }
    else if (S.walker.stuck) { S.walker = null; startRoute(true); }
  }
  S.walkT += dt * (S.moving ? 9 * Math.max(0.7, S.speedK) : 0); const sw = Math.sin(S.walkT) * 0.75 * (S.moving ? 1 : 0);
  ch.limbs.legL.rotation.x = sw; ch.limbs.legR.rotation.x = -sw; ch.limbs.armL.rotation.x = -sw * 0.9; ch.limbs.armR.rotation.x = sw * 0.9;
  S.yCam += (S.y - S.yCam) * Math.min(1, dt * 7);
  ch.group.position.set(S.x, S.y + Math.abs(Math.sin(S.walkT)) * 0.04 * (S.moving ? 1 : 0), S.z); ch.group.rotation.y = S.heading;

  // 樓層顯示
  const bird = S.mode === 'bird', f = curF(), inRoom = world.roomAt(f, S.x, S.z) >= 0;
  let maxVis = NF - 1; if (bird) maxVis = S.viewFloor !== null ? (S.viewFloor === 4 ? -1 : S.viewFloor) : (f === 0 && !inRoom ? NF - 1 : RANK(f));
  for (let k = 0; k < NF; k++) { FG[k].visible = k <= maxVis; CAN[k].visible = k <= maxVis && !(bird && k === f); }
  const nearB1 = S.y < -0.3 || STAIRS.some(s => s.fl.includes(4) && Math.hypot(s.cx - S.x, s.cz - S.z) < 14);
  const showB1 = bird ? (S.viewFloor === 4 || (S.viewFloor === null && f === 4)) : nearB1;
  FG[4].visible = showB1; CAN[4].visible = showB1 && !bird;
  if (dx.groundMesh) dx.groundMesh.visible = !(bird && showB1);
  pin.rotation.y += dt * 2; if (pin.visible && S.selected) pin.position.y = LY(S.selected.f) + 2.8 + Math.sin(performance.now() / 300) * 0.1;

  // 鏡頭
  const tgt = new THREE.Vector3(S.x, S.yCam + 1.35, S.z);
  if (S.mode === 'third') {
    const bx = -Math.sin(S.yaw), bz = -Math.cos(S.yaw), pE = clamp(inRoom ? Math.max(S.pitch, 0.5) : S.pitch, -0.2, 1.2), cp = Math.cos(pE), spn = Math.sin(pE);
    const want = S.dist, t = world.ray(S.x, S.z, S.x + bx * want * cp, S.z + bz * want * cp, S.y, 0.2), dA = clamp(t * want - 0.1, 0.9, want);
    S.occ = t * want < want * 0.8;
    const des = new THREE.Vector3(S.x + bx * dA * cp, tgt.y + spn * dA, S.z + bz * dA * cp);
    des.y = Math.max(Math.min(des.y, world.ceilingY(des.x, des.z, S.y) - 0.15), S.yCam + 0.35);
    if (!camInit) { camPos.copy(des); camInit = true; camLim = Infinity; camPrevInit = false; camThInit = false; }
    camPos.lerp(des, 1 - Math.exp(-dt * 6.5));
    { const ex = camPos.x - S.x, ez = camPos.z - S.z, Lh = Math.hypot(ex, ez);       // 繞角色的方位角速度上限：U 形轉彎／進出梯間時鏡頭不會甩動
      if (Lh > 0.3) { const th = Math.atan2(ex, ez); if (camThInit) { const w = (S.occ ? 3.4 : 2.6) * dt, dth = clamp(angDiff(camTh, th), -w, w); camTh += dth; } else camTh = th; camThInit = true;
        camPos.x = S.x + Math.sin(camTh) * Lh; camPos.z = S.z + Math.cos(camTh) * Lh; } }
    { const ex = camPos.x - S.x, ez = camPos.z - S.z, Lh = Math.hypot(ex, ez);
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
  } else { const base = S.viewFloor === null ? S.y : LY(S.viewFloor); camera.position.set(S.x, base + S.birdH, S.z + 0.01); camera.up.set(Math.sin(S.byaw), 0, Math.cos(S.byaw)); camera.lookAt(S.x, base, S.z); ch.group.visible = true; }
  sun.position.set(S.x - 30, 60, S.z + 40);
  fpsN++; fpsT += dt; if (fpsT > 1) { $('#fps').textContent = Math.round(fpsN / fpsT) + ' fps'; fpsN = 0; fpsT = 0; }
  hudT += dt; if (hudT > 0.15) { hudT = 0; updateFloorButtons(); drawMini(); updateWhere(); }
}
function updateWhere() {
  let name = '校園', fl = ''; const f = curF(), rid = world.roomAt(f, S.x, S.z);
  if (rid >= 1000) { name = '樓梯'; fl = levelLabel(f); } else if (rid >= 0) { name = ROOMS[rid].name; fl = levelLabel(f); }
  else if (f === 4) { name = '地下停車場'; fl = 'B1'; }
  else if (f > 0) { name = '走廊'; fl = levelLabel(f); }
  else { let bd = 1e9, bn = null; PLACES.forEach(p => { if (p.f !== 0) return; const d = Math.hypot(p.x - S.x, p.z - S.z); if (d < bd) { bd = d; bn = p; } }); if (bn && bd < 16) name = bn.name; fl = '1F'; }
  const key = name + fl; if (key === whereKey) return; whereKey = key; $('#where').textContent = `${fl ? fl + ' · ' : ''}${name}`;
}
const clock = new THREE.Clock();
function loop() { update(Math.min(clock.getDelta(), 0.05)); renderer.render(scene, camera); requestAnimationFrame(loop); }

window.__dx = { S, m, world, nav, setDest, startRoute, gotoFloor, setMode, teleportTo, cancelRoute, keys, THREE, TARGETS,
  tick(dt) { update(dt); },
  advance(sec, dt = 1 / 30) { for (let t = 0; t < sec; t += dt) update(dt); renderer.render(scene, camera); },
  cam() { const d = new THREE.Vector3(); camera.getWorldDirection(d); return { p: camera.position.toArray(), d: d.toArray() }; },
  info() { return { x: S.x, z: S.z, y: S.y, floor: curF(), mode: S.mode, walker: !!S.walker, done: S.walker ? S.walker.done : null }; } };
try { if (!localStorage.getItem('dx.help1')) { $('#help').hidden = false; localStorage.setItem('dx.help1', '1'); } } catch (e) { }
renderList(); setMode('third'); updateFloorButtons();
$('#loading').classList.add('done'); setTimeout(() => $('#loading').style.display = 'none', 500);
loop();
