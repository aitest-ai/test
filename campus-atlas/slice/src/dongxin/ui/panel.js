// UI 層：清單/搜尋、樓層鈕、視角模式鈕、資訊卡按鈕、提示訊息、目前位置、FPS、鳥瞰點選教室。
import * as THREE from 'three';
const $ = (s) => document.querySelector(s);
const norm = (s) => (s || '').toLowerCase().replace(/\s+/g, '');
export const MODES = ['third', 'first', 'bird'];

// ctx 需有：S, m, world, camera, TARGETS；guide 與 cam 於建立後才綁上（ctx.guide / ctx.cam）
export function createPanel(ctx) {
  const { S, m, world, camera, TARGETS } = ctx, { ROOMS, PLACES, STAIRS, LY, levelLabel } = m;
  const lvlOrder = [3, 2, 1, 0, 4];
  const curF = () => world.floorOfY(S.y + 0.1);

  function toast(t) { const el = $('#toast'); el.textContent = t; el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => el.hidden = true, 2400); }
  function renderList() { const q = norm($('#q').value); const box = $('#list'); box.innerHTML = '';
    const groups = [['戶外・地點', TARGETS.filter(t => t.t === 'p')], ...lvlOrder.map(f => [levelLabel(f), TARGETS.filter(t => t.t !== 'p' && t.f === f)])];
    for (const [title, arr] of groups) { const rs = arr.filter(r => !q || norm(r.name).includes(q) || norm(title).includes(q) || (r.bldName && norm(r.bldName).includes(q)) || (q.endsWith('樓') && norm(title) === (q.slice(0, -1) + 'f')));
      if (!rs.length) continue; const h = document.createElement('div'); h.className = 'grp'; h.textContent = title; box.appendChild(h);
      rs.forEach(r => { const b = document.createElement('button'); b.className = 'item' + (S.selected === r ? ' on' : ''); b.textContent = r.name; if (r.bldName) { const sp = document.createElement('small'); sp.textContent = ' ' + r.bldName; sp.style.opacity = '.55'; b.appendChild(sp); } b.onclick = () => { ctx.guide.setDest(r); if (innerWidth < 760) $('#panel').classList.remove('open'); }; box.appendChild(b); }); } }
  function updateFloorButtons() { const cur = curF(); document.querySelectorAll('#floors button').forEach(b => { const k = b.dataset.k; b.classList.toggle('on', k === 'all' ? (S.mode === 'bird' && S.viewFloor === null) : (S.mode === 'bird' ? S.viewFloor === +k : cur === +k)); }); }
  function setMode(mo) { S.mode = mo; document.querySelectorAll('#modes button').forEach(b => b.classList.toggle('on', b.dataset.m === mo)); updateFloorButtons(); }
  function cycleMode() { setMode(MODES[(MODES.indexOf(S.mode) + 1) % 3]); }
  function pickRoom(e) { const r = ctx.canvas.getBoundingClientRect(), v = new THREE.Vector2((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1);
    const rc = new THREE.Raycaster(); rc.setFromCamera(v, camera);
    const ks = S.viewFloor === null ? [3, 2, 1, 0] : [S.viewFloor];
    for (const f of ks) { const o = rc.ray.origin, d = rc.ray.direction, y = LY(f) + 0.02; if (Math.abs(d.y) < 1e-4) continue; const t = (y - o.y) / d.y; if (t < 0) continue;
      const x = o.x + d.x * t, z = o.z + d.z * t; const room = ROOMS.find(rm => !rm.solid && rm.f === f && x >= rm.X0 && x <= rm.X1 && z >= rm.Z0 && z <= rm.Z1);
      if (room) { ctx.guide.setDest(room); return; } } }

  let whereKey = '';
  function updateWhere() {
    let name = '校園', fl = ''; const f = curF(), rid = world.roomAt(f, S.x, S.z);
    if (rid >= 1000) { name = '樓梯'; fl = (STAIRS[rid - 1000].bldName || '') + ' ' + levelLabel(f); } else if (rid >= 0) { name = ROOMS[rid].name; fl = ROOMS[rid].bldName + ' ' + levelLabel(f); }
    else if (f === 4) { name = '地下停車場'; fl = 'B1'; }
    else if (f > 0) { name = '走廊'; fl = levelLabel(f); }
    else { let bd = 1e9, bn = null; PLACES.forEach(p => { if (p.f !== 0) return; const d = Math.hypot(p.x - S.x, p.z - S.z); if (d < bd) { bd = d; bn = p; } }); if (bn && bd < 16) name = bn.name; fl = '1F'; }
    const key = name + fl; if (key === whereKey) return; whereKey = key; $('#where').textContent = `${fl ? fl + ' · ' : ''}${name}`;
  }
  let fpsN = 0, fpsT = 0;
  function tickFps(dt) { fpsN++; fpsT += dt; if (fpsT > 1) { $('#fps').textContent = Math.round(fpsN / fpsT) + ' fps'; fpsN = 0; fpsT = 0; } }

  function bind() {
    const g = ctx.guide;
    (function buildFloorButtons() { const box = $('#floors'); lvlOrder.forEach(f => { const b = document.createElement('button'); b.dataset.k = f; b.textContent = levelLabel(f); b.onclick = () => g.gotoFloor(f); box.appendChild(b); });
      const a = document.createElement('button'); a.dataset.k = 'all'; a.textContent = '全貌'; a.onclick = () => { if (S.mode !== 'bird') setMode('bird'); S.viewFloor = null; updateFloorButtons(); }; box.appendChild(a); })();
    document.querySelectorAll('#modes button').forEach(b => b.onclick = () => setMode(b.dataset.m));
    $('#q').addEventListener('input', renderList);
    $('#go').onclick = () => g.startRoute(true); $('#tp').onclick = () => { if (S.selected) { g.teleportTo(S.selected); toast('已傳送到 ' + S.selected.name); } };
    $('#stop').onclick = () => g.cancelRoute(); $('#clr').onclick = () => g.setDest(null);
    $('#pbtn').onclick = () => $('#panel').classList.toggle('open');
    $('#helpbtn').onclick = () => $('#help').hidden = !$('#help').hidden; $('#helpclose').onclick = () => $('#help').hidden = true;
    $('#spd').onclick = () => { S.speedK = S.speedK === 1 ? 1.6 : S.speedK === 1.6 ? 0.6 : 1; $('#spd').textContent = '速度 ' + Math.round(S.speedK * 100) + '%'; };
  }
  return { toast, renderList, updateFloorButtons, setMode, cycleMode, pickRoom, updateWhere, tickFps, bind,
    setStatus: (t) => { $('#stext').textContent = t; } };
}
