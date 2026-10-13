// 導航層：節點圖＋Dijkstra。樓層轉換用明確的「梯跑邊」，不靠猜測。
export function createNav(lay, world) {
  const nodes = lay.nodes;
  const byId = new Map(nodes.map(n => [n.id, n]));
  const floorOf = (y) => Math.max(0, Math.min(lay.F - 1, Math.round(y / lay.FH)));
  function route(from, roomId) {
    const room = lay.rooms.find(r => r.id === roomId); if (!room) return null;
    const goal = byId.get(room.navNode);
    const k = floorOf(from.y);
    // 虛擬起點：連到同層「視線可達」的節點；若都不可達，退而求其次連最近者
    const cand = nodes.filter(n => n.k === k).map(n => ({ n, d: Math.hypot(n.x - from.x, n.z - from.z), ok: world.los(from.x, from.z, n.x, n.z, from.y) }));
    let starts = cand.filter(c => c.ok); if (!starts.length) starts = cand.sort((a, b) => a.d - b.d).slice(0, 1);
    const dist = new Map(), prev = new Map(), pq = [];
    for (const s of starts) { dist.set(s.n.id, s.d); prev.set(s.n.id, null); pq.push([s.d, s.n]); }
    while (pq.length) {
      pq.sort((a, b) => a[0] - b[0]); const [d, u] = pq.shift();
      if (d > dist.get(u.id)) continue; if (u === goal) break;
      for (const e of u.edges) { const v = e[0], nd = d + e[1]; if (nd < (dist.get(v.id) ?? Infinity)) { dist.set(v.id, nd); prev.set(v.id, [u, e]); pq.push([nd, v]); } }
    }
    if (!dist.has(goal.id)) return null;
    const chain = []; let cur = goal;
    while (cur) { const p = prev.get(cur.id); chain.push({ node: cur, via: p ? p[1][2] : null }); cur = p ? p[0] : null; }
    chain.reverse();
    const pts = [{ x: from.x, z: from.z, y: from.y }];
    for (const c of chain) { if (c.via) c.via.forEach(v => pts.push({ x: v.x, z: v.z, y: v.y, stair: true })); pts.push({ x: c.node.x, z: c.node.z, y: c.node.y }); }
    return { pts, room, length: pts.reduce((s, p, i) => i ? s + Math.hypot(p.x - pts[i - 1].x, p.z - pts[i - 1].z) : 0, 0) };
  }
  return { route, floorOf };
}
// 路線跟隨：每步朝下一個航點前進，走到容許距離內換下一點。
export function createWalker(world, route) {
  let i = 1, stuck = 0;
  return {
    done: false,
    // 路線前方 dist 公尺處的方位角（鏡頭預判轉彎用）
    ahead(p, dist = 3) { let x = p.x, z = p.z, left = dist, j = i; while (j < route.pts.length && left > 0) { const t = route.pts[j], d = Math.hypot(t.x - x, t.z - z); if (d >= left) { const r = left / d; x += (t.x - x) * r; z += (t.z - z) * r; left = 0; break; } x = t.x; z = t.z; left -= d; j++; }
      const dx = x - p.x, dz = z - p.z; return Math.hypot(dx, dz) > 0.05 ? Math.atan2(dx, dz) : p.heading; },
    step(p, dt, speed = 4.8) {
      if (this.done) return;
      while (i < route.pts.length && Math.hypot(route.pts[i].x - p.x, route.pts[i].z - p.z) < (i === route.pts.length - 1 ? 0.12 : 0.35)) i++;
      if (i >= route.pts.length) { this.done = true; return; }
      const t = route.pts[i], dx = t.x - p.x, dz = t.z - p.z, d = Math.hypot(dx, dz), m = Math.min(d, speed * dt);
      const bx = p.x, bz = p.z; world.move(p, dx / d * m, dz / d * m);
      p.heading = Math.atan2(dx, dz);
      stuck = Math.hypot(p.x - bx, p.z - bz) < m * 0.2 ? stuck + dt : 0;
      if (stuck > 1.5) this.stuck = true;
    }
  };
}
