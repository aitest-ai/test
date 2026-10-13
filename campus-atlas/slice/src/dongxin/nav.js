// 東新版導航層：格網 A*（走廊/室外）+ 明確的樓梯路段（waypoint），輸出與 slice 相同的 route 格式 { pts:[{x,z,y,stair?}], length, room }。
// 路徑的 y 是「意圖高度」；實際高度由 world.move() 依梯面決定，所以手動與自動走路完全一致。
export function createDxNav(m, world) {
  const { STAIRS, UP, DN, LY, FH, planRoute, STR_N } = m;
  const floorOf = (y) => world.floorOfY(y);
  // 梯段 waypoint：由 lo 層走到 lo 的上一層（dir>0）或反向
  function stairPts(s, lo, dir) {
    const y0 = LY(lo), yM = y0 + FH / 2, y1 = y0 + FH;
    let pts = [s.P(s.uA, -s.lane, y0), s.P(s.uB, -s.lane, yM), s.P(s.uB + 0.5, -s.lane, yM), s.P(s.uB + 0.5, s.lane, yM), s.P(s.uB, s.lane, yM), s.P(s.uA, s.lane, y1)];
    if (dir < 0) pts = pts.reverse();
    return pts.map(p => ({ x: p.x, z: p.z, y: p.y, stair: true }));
  }
  function stairLeg(s, from, to) {
    const pts = []; let f = from;
    while (f !== to) {
      const dir = (LY(to) > LY(f)) ? 1 : -1, nxt = dir > 0 ? UP[f] : DN[f]; if (nxt < 0 || !s.fl.includes(nxt)) return null;
      const lo = dir > 0 ? f : nxt;
      pts.push({ x: s.ent.x, z: s.ent.z, y: LY(f) });       // 該層入口平台中央
      stairPts(s, lo, dir).forEach(p => pts.push(p));
      f = nxt;
    }
    pts.push({ x: s.ent.x, z: s.ent.z, y: LY(to) });
    return pts;
  }
  // 站在梯段中間時：先走到最近的一端
  function finishStair(from) {
    const s = world.stairAt(from.x, from.z, 0); if (!s) return null;
    const f = floorOf(from.y);
    if (Math.abs(from.y - LY(f)) < 0.35) return null;       // 其實在平台上
    const lo = from.y >= LY(f) ? f : (DN[f] >= 0 ? DN[f] : f);
    const up = UP[lo]; if (up < 0 || !s.fl.includes(up)) return null;
    const goUp = (from.y - LY(lo)) > FH / 2, dir = goUp ? 1 : -1;
    const pts = stairPts(s, lo, dir);
    // 只保留「前方」的 waypoint
    let best = 0, bd = 1e9; pts.forEach((p, i) => { const d = Math.hypot(p.x - from.x, p.z - from.z); if (d < bd) { bd = d; best = i; } });
    const ahead = pts.slice(Math.min(best + 1, pts.length - 1));
    const endF = dir > 0 ? up : lo;
    ahead.push({ x: s.ent.x, z: s.ent.z, y: LY(endF) });
    return { pts: ahead, floor: endF, x: s.ent.x, z: s.ent.z };
  }
  // target：{ f, x, z, name,... }（ROOMS / PLACES 的項目）
  function route(from, target) {
    const out = [{ x: from.x, z: from.z, y: from.y }];
    let cur = { f: floorOf(from.y), x: from.x, z: from.z };
    const fin = finishStair(from);
    if (fin) { fin.pts.forEach(p => out.push(p)); cur = { f: fin.floor, x: fin.x, z: fin.z }; }
    const legs = planRoute(cur, { f: target.f, x: target.x, z: target.z });
    if (!legs) return null;
    for (const leg of legs) {
      if (leg.type === 'walk') { leg.pts.forEach((p, i) => { if (i === 0 && out.length > 1) return; out.push({ x: p.x, z: p.z, y: LY(leg.f) }); }); }
      else { const sp = stairLeg(leg.s, leg.from, leg.to); if (!sp) return null; sp.forEach(p => out.push(p)); }
    }
    // 去除連續重複點
    const pts = out.filter((p, i) => i === 0 || Math.hypot(p.x - out[i - 1].x, p.z - out[i - 1].z) > 0.02 || Math.abs(p.y - out[i - 1].y) > 0.02);
    return { pts, room: target, length: pts.reduce((s, p, i) => i ? s + Math.hypot(p.x - pts[i - 1].x, p.z - pts[i - 1].z) : 0, 0) };
  }
  return { route, floorOf, stairPts };
}
