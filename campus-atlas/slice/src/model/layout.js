// 模型層：由 WING 參數衍生「牆、碰撞體、洞口、梯間、門、導航節點」。
// 這裡完全不依賴 Three.js，因此可在 Node 中做不穿牆／可達性測試。
export const STAIR = { NST: 9, TREAD: 0.28, ZF0: 6.5, LAND_D: 1.78, LANE_A: [0.2, 2.4], LANE_B: [2.6, 4.8], W: 5 };

export function buildLayout(W) {
  const { L, D, FH, floors: F, classDepth: CD } = W;
  const RISE = FH / 20;
  const S = STAIR;
  const ZL0 = S.ZF0 - S.NST * S.TREAD;          // 平台南緣 ≈ 3.98
  const ZL1 = ZL0 - S.LAND_D;                    // 平台北緣 ≈ 2.2
  const rooms = [], walls = [], colliders = [], doors = [];

  const edges = [W.bayEdges[0], ...W.bayEdges.slice(1)];
  const bays = []; for (let i = 0; i < edges.length - 1; i++) bays.push([edges[i], edges[i + 1]]);

  // ---------- 牆（每層相同）----------
  const wall = (o) => walls.push(o);
  for (let k = 0; k < F; k++) {
    const y0 = k * FH, y1 = (k + 1) * FH;
    const win = [];
    bays.forEach(([a, b]) => win.push({ a: a + 1.0, b: b - 1.0, y0: y0 + 0.9, y1: y0 + 2.6, kind: 'window' }));
    W.stairs.forEach(s => win.push({ a: s.x0 + 1.2, b: s.x0 + 3.8, y0: y0 + 1.0, y1: y0 + 2.8, kind: 'window' }));
    wall({ k, type: 'brick', axis: 'x', at: 0, a: 0, b: L, t: 0.32, y0, y1, openings: win });                 // 北外牆
    W.stairs.forEach(s => {
      const outer = s.x0 === 0 ? 0 : L;
      wall({ k, type: 'brick', axis: 'z', at: outer, a: 0, b: CD, t: 0.32, y0, y1, openings: [] });            // 梯間外側牆
    });
    W.stairs.forEach(s => {
      const inner = s.x0 === 0 ? S.W : s.x0;
      wall({ k, type: 'plaster', axis: 'z', at: inner, a: 0, b: CD, t: 0.25, y0, y1, openings: [] });         // 梯間／教室牆
    });
    bays.slice(0, -1).forEach(([, b]) => wall({ k, type: 'plaster', axis: 'z', at: b, a: 0, b: CD, t: 0.2, y0, y1, openings: [] }));
    // 走廊側（灰框玻璃＋木門）
    const dop = [];
    bays.forEach(([a, b], bi) => {
      const cx = a + W.doorOffset;
      const room = { id: `r${k + 1}-${bi + 1}`, name: W.rooms[k][bi], floor: k, x0: a, x1: b, z0: 0, z1: CD,
        door: { x: cx, z: CD, w: W.doorWidth, h: W.doorHeight } };
      rooms.push(room); doors.push(room.door);
      dop.push({ a: cx - W.doorWidth / 2, b: cx + W.doorWidth / 2, y0, y1: y0 + W.doorHeight, kind: 'door', room: room.id });
    });
    wall({ k, type: 'face', axis: 'x', at: CD, a: W.bayEdges[0], b: W.bayEdges[W.bayEdges.length - 1], t: 0.14, y0, y1, openings: dop });
    // 走廊外緣欄杆（一樓是開放騎樓，無欄杆）
    if (k >= 1) {
      wall({ k, type: 'rail', axis: 'x', at: D, a: 0, b: L, t: 0.1, y0, y1: y0 + 1.1, openings: [] });
      wall({ k, type: 'rail', axis: 'z', at: 0, a: CD, b: D, t: 0.1, y0, y1: y0 + 1.1, openings: [] });
      wall({ k, type: 'rail', axis: 'z', at: L, a: CD, b: D, t: 0.1, y0, y1: y0 + 1.1, openings: [] });
    }
    // 梯間洞口護欄（樓板上）
    if (k >= 1) W.stairs.forEach(s => {
      wall({ k, type: 'rail', axis: 'x', at: ZL1, a: s.x0 + 0.15, b: s.x0 + 4.85, t: 0.08, y0, y1: y0 + 1.1, openings: [] });
      if (k === F - 1) wall({ k, type: 'rail', axis: 'x', at: S.ZF0, a: s.x0 + 0.15, b: s.x0 + 2.4, t: 0.08, y0, y1: y0 + 1.1, openings: [] });   // 頂樓才封 A 跑道口；中間樓層 A 跑道接續上行
    });
  }
  // ---------- 柱 ----------
  const colX = [0.2, 5, 11.5, 18, 24.5, 31, L - 0.2];
  const columns = colX.map(x => ({ x, z: D - 0.2, s: 0.4 }));

  // ---------- 碰撞體（xz 矩形＋絕對 y 範圍）----------
  const rect = (x0, z0, x1, z1, y0, y1, extra = {}) => colliders.push({ x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1), y0, y1, ...extra });
  for (const w of walls) {
    const gaps = w.openings.filter(o => o.kind === 'door').sort((p, q) => p.a - q.a);
    const segs = []; let cur = w.a;
    for (const g of gaps) { if (g.a > cur) segs.push([cur, g.a]); cur = g.b; }
    if (cur < w.b) segs.push([cur, w.b]);
    const cam = !(w.type === 'rail' || w.type === 'face');
    for (const [a, b] of segs) {
      if (w.axis === 'x') rect(a, w.at - w.t / 2, b, w.at + w.t / 2, w.y0, w.y1, { cam, tag: w.type });
      else rect(w.at - w.t / 2, a, w.at + w.t / 2, b, w.y0, w.y1, { cam, tag: w.type });
    }
  }
  for (let k = 0; k < F; k++) for (const c of columns) rect(c.x - c.s / 2, c.z - c.s / 2, c.x + c.s / 2, c.z + c.s / 2, k * FH, (k + 1) * FH, { cam: true, tag: 'col' });

  // 教室課桌椅區塊（教室內留出講台側與門側走道）
  const desks = [];
  for (const r of rooms) { const d = { room: r.id, k: r.floor, x0: r.x0 + 1.95, x1: r.x1 - 0.45, z0: 0.55, z1: 6.15 }; desks.push(d);
    rect(d.x0, d.z0, d.x1, d.z1, r.floor * FH, r.floor * FH + 0.95, { cam: false, tag: 'desk' }); }

  // ---------- 梯間（開放式、雙跑）----------
  const shafts = W.stairs.map(s => ({ id: s.id, x0: s.x0,
    A: [s.x0 + S.LANE_A[0], s.x0 + S.LANE_A[1]], B: [s.x0 + S.LANE_B[0], s.x0 + S.LANE_B[1]],
    hole: { x0: s.x0 + 0.15, x1: s.x0 + 4.85, z0: ZL1, z1: S.ZF0 } }));
  const stairInfo = { RISE, ZL0, ZL1, ZF0: S.ZF0, TREAD: S.TREAD, NST: S.NST, flights: F - 1 };
  for (const sh of shafts) for (let k = 0; k < F - 1; k++) {
    const base = k * FH;
    if (k === 0) for (let i = 1; i <= S.NST; i++) {         // 梯級實心（僅地面層需要：防止從底下鑽進梯下）：由下往上可踏上，從底下進不去
      const zA0 = S.ZF0 - i * S.TREAD, zA1 = zA0 + S.TREAD, topA = base + i * RISE;
      rect(sh.A[0], zA0, sh.A[1], zA1, base, topA - 0.5, { cam: false, tag: 'step' });
      const zB0 = ZL0 + (i - 1) * S.TREAD, zB1 = zB0 + S.TREAD, topB = base + FH / 2 + i * RISE;
      rect(sh.B[0], zB0, sh.B[1], zB1, base, topB - 0.5, { cam: false, tag: 'step' });
    }
    if (k === 0) rect(sh.A[0], ZL1, sh.B[1], ZL0, base, base + FH / 2 - 0.5, { cam: false, tag: 'landing' });
    rect(sh.x0 + 2.4, ZL0, sh.x0 + 2.6, S.ZF0, base, base + FH, { cam: false, tag: 'divider' });
  }
  const hasSlab = (k, x, z) => {                                   // 第 k 層樓板是否在此有面（k=0 為地面）
    if (k === 0) return true;
    if (x < 0 || x > L || z < 0 || z > D) return false;
    for (const sh of shafts) { const h = sh.hole; if (x > h.x0 && x < h.x1 && z > h.z0 && z < h.z1) return false; }
    return true;
  };

  // ---------- 導航節點 ----------
  const ZC = (CD + D) / 2;                                         // 走廊中線 ≈ 9.5
  const nodes = []; const nid = (k, name) => `${name}@${k}`;
  const add = (k, name, x, z, y) => { const n = { id: nid(k, name), k, x, z, y: y ?? k * FH, edges: [] }; nodes.push(n); return n; };
  const link = (a, b) => { const d = Math.hypot(a.x - b.x, a.z - b.z) + Math.abs(a.y - b.y) * 1.5; a.edges.push([b, d]); b.edges.push([a, d]); };
  const byId = {};
  for (let k = 0; k < F; k++) {
    const line = [];
    shafts.forEach(sh => { line.push(add(k, `in${sh.id}`, sh.x0 + 1.3, CD - 0.9)); line.push(add(k, `out${sh.id}`, sh.x0 + 3.7, CD - 0.9)); });
    const cn = []; // 走廊節點（每個梯口與每個門前）
    shafts.forEach(sh => { cn.push(add(k, `c${sh.id}a`, sh.x0 + 1.3, ZC)); cn.push(add(k, `c${sh.id}b`, sh.x0 + 3.7, ZC)); });
    rooms.filter(r => r.floor === k).forEach(r => {
      cn.push(add(k, `cd${r.id}`, r.door.x, ZC));
      const front = add(k, `door${r.id}`, r.door.x, CD + 0.55);      // 門前
      const sill = add(k, `sill${r.id}`, r.door.x, CD - 0.35);       // 門口（導航終點）
      byId[r.id] = sill.id; r.navNode = sill.id; r.sill = { x: sill.x, z: sill.z, y: sill.y };
      link(front, sill);
      front._cd = `cd${r.id}`;
    });
    cn.sort((p, q) => p.x - q.x);
    for (let i = 0; i + 1 < cn.length; i++) link(cn[i], cn[i + 1]);
    for (const n of nodes.filter(n => n.k === k && n.id.startsWith('door'))) link(n, nodes.find(m => m.id === nid(k, n._cd)));
    shafts.forEach(sh => {
      link(nodes.find(n => n.id === nid(k, `in${sh.id}`)), nodes.find(n => n.id === nid(k, `c${sh.id}a`)));
      link(nodes.find(n => n.id === nid(k, `out${sh.id}`)), nodes.find(n => n.id === nid(k, `c${sh.id}b`)));
    });
  }
  const get = (id) => nodes.find(n => n.id === id);
  // 樓層連結：in(k) ↔ 梯跑 A → 平台 → 梯跑 B ↔ out(k+1)；中途航點以 via 記錄
  for (const sh of shafts) for (let k = 0; k < F - 1; k++) {
    const a = get(nid(k, `in${sh.id}`)), b = get(nid(k + 1, `out${sh.id}`));
    const base = k * FH;
    const via = [ { x: sh.x0 + 1.3, z: 5.2, y: base + 0.9 }, { x: sh.x0 + 1.3, z: 3.6, y: base + FH / 2 }, { x: sh.x0 + 2.5, z: 3.05, y: base + FH / 2 },
                  { x: sh.x0 + 3.7, z: 3.6, y: base + FH / 2 }, { x: sh.x0 + 3.7, z: 5.2, y: base + FH / 2 + 0.9 + 0.2 } ];
    const d = 14; a.edges.push([b, d, via]); b.edges.push([a, d, via.slice().reverse()]);
  }
  return { W, F, FH, L, D, CD, ZC, desks, rooms, walls, doors, columns, colliders, shafts, stairInfo, nodes, hasSlab, bays };
}
