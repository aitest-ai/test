// 導覽層：選取目的地、規劃/顯示路線、啟動 walker、傳送、切換樓層。路徑規劃本身在 nav.js / model.js。
import { createWalker } from '../../nav/navgraph.js';
import { createRouteLine } from './routeline.js';
const $ = (s) => document.querySelector(s);

// ui: { renderList(), updateFloorButtons(), toast(msg) }；cam: { reset() }
export function createGuide({ S, m, world, nav, stage, cam, ui }) {
  const { LY, STAIRS, levelLabel } = m, { selPlane, pin } = stage;
  const line = createRouteLine(stage.scene, world);
  const curF = () => world.floorOfY(S.y + 0.1);
  const where = (r) => (r.bldName ? r.bldName + ' ' : '') + (r.f === 4 ? 'B1' : (r.t === 'p' ? '戶外' : levelLabel(r.f)));

  function setDest(t) { S.selected = t; cancelRoute(true); $('#info').hidden = !t;
    if (!t) { selPlane.visible = pin.visible = false; return; }
    $('#iname').textContent = t.name; $('#isub').textContent = `${where(t)}・${t.t === 'p' ? '地點' : '名稱暫定（依設計圖）'}・非校方測繪`;
    if (t.X0 !== undefined) { selPlane.visible = true; selPlane.scale.set(t.w - 0.3, t.d - 0.3, 1); selPlane.position.set(t.cx, LY(t.f) + 0.05, t.cz); } else selPlane.visible = false;
    pin.visible = true; pin.position.set(t.x, LY(t.f) + 2.8, t.z); ui.renderList(); }
  function cancelRoute() { S.walker = null; S.route = null; line.clear(); $('#status').hidden = true; }
  function startRoute(auto = true) { const t = S.selected; if (!t) return; const rt = nav.route(S, t); if (!rt) { ui.toast('找不到路線'); return; }
    S.route = rt; drawRoute(rt); if (auto) S.walker = createWalker(world, rt, { tol: 0.12 }); $('#status').hidden = false; lastRemain = -1; $('#stext').textContent = `前往 ${t.name}（約 ${Math.round(rt.total)} 公尺）`; }
  function drawRoute(rt) { line.set(rt); }
  function teleportTo(t) { cancelRoute();                      // 教室：站到門外走廊、面向教室門；其他：就地
    const d = t.door; let x = t.x, z = t.z;
    if (d && d.out && world.standOk(d.out.x, d.out.z, LY(t.f))) { x = d.out.x; z = d.out.z; S.yaw = S.heading = Math.atan2(-d.nx, -d.nz); }
    S.x = x; S.z = z; S.y = LY(t.f); S.yCam = S.y; cam.reset(); }
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
    if (S.mode === 'bird') { S.viewFloor = S.viewFloor === f ? null : f; ui.updateFloorButtons(); return; }
    if (f === curF() && Math.abs(S.y - LY(f)) < 0.3) { ui.toast('目前就在 ' + levelLabel(f)); return; }
    const c = nearestOnFloor(f); if (!c) { ui.toast(levelLabel(f) + ' 沒有可到達的地方'); return; }
    const far = Math.hypot(c.x - S.x, c.z - S.z);
    cancelRoute(); S.x = c.x; S.z = c.z; S.y = LY(f); S.yCam = S.y; cam.reset(); ui.updateFloorButtons();
    ui.toast('已到 ' + levelLabel(f) + (far > 6 ? '（最近的可走位置）' : ''));
    if (S.selected) startRoute(false);
  }
  // 每幀：導引帶進度（小地圖讀同一份 S.route.prog）；導覽中狀態列顯示剩餘距離
  let lastRemain = -1;
  function update(dt) {
    if (!S.route) return; line.update(S, dt);
    const r = Math.ceil(S.route.remain); if (S.walker && r !== lastRemain && S.selected) { lastRemain = r; $('#stext').textContent = `前往 ${S.selected.name}・剩 ${r} 公尺`; }
  }
  function animatePin(dt) { pin.rotation.y += dt * 2; if (pin.visible && S.selected) pin.position.y = LY(S.selected.f) + 2.8 + Math.sin(performance.now() / 300) * 0.1; }
  return { setDest, cancelRoute, startRoute, drawRoute, teleportTo, gotoFloor, animatePin, update };
}
