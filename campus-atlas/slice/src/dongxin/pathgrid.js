// 東新版路徑網格（path grid）：取代「最近 3 座樓梯 × 多次 A*」的路徑規劃。無 three.js 依賴，可在 Node 測試。
//   1. 淨空場：每層可走格到最近不可走格的距離（兩趟 chamfer 距離轉換，單位 m）。
//   2. 成本 = 距離 ×（1 + 貼牆懲罰），8 鄰、斜走不切角。同層用 A*；每個樓梯入口做一次全層洪泛（延遲建立、快取），
//      因為成本對稱，入口洪泛同時給出「任一格 → 入口」的距離與路徑，跨樓層查詢不必再搜尋。
//   3. 入口圖：節點 =（樓梯, 樓層）的入口平台；邊 = 樓梯（相鄰樓層）＋ 同層步行（入口間洪泛距離，快取）。
//      起點／終點直接查入口洪泛接上入口，Dijkstra 找全域最佳樓梯組合（可多座樓梯轉乘）。
//   4. 拉直：視線拉直時要求線段保有淨空 ≥ min(兩端淨空, 0.8 m)，路線走走廊中間、不擦牆角；窄處（門口）自動放寬。
// 輸出與 model.planRoute 相同的 legs：[{type:'walk',f,pts}|{type:'stair',s,from,to}]，nav.js 不必改。
export function createPathGrid(m, opts = {}) {
  const { GW, GH, CELL, NL, ERO, NAV, STAIRS, UP, DN, RANK, FH, cxm, czm, ci, cj } = m;
  const N = GW * GH, SQ2 = Math.SQRT2;
  const CLEAR_PREF = opts.clearPref ?? 0.9, PENALTY = opts.penalty ?? 1.5, LOS_CLEAR = opts.losClear ?? 0.8;

  // ---------- 1. 淨空場（m）：到最近不可走格中心的近似歐氏距離 ----------
  const CLR = [];
  for (let f = 0; f < NL; f++) {
    const d = new Float32Array(N), nav = NAV[f], BIG = 1e6;
    for (let k = 0; k < N; k++) d[k] = nav[k] ? BIG : 0;
    const a = 1, b = SQ2;
    for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) { const k = j * GW + i; if (!d[k]) continue; let v = d[k];
      if (i > 0) v = Math.min(v, d[k - 1] + a); else v = Math.min(v, a);
      if (j > 0) { v = Math.min(v, d[k - GW] + a); if (i > 0) v = Math.min(v, d[k - GW - 1] + b); if (i < GW - 1) v = Math.min(v, d[k - GW + 1] + b); } else v = Math.min(v, a);
      d[k] = v; }
    for (let j = GH - 1; j >= 0; j--) for (let i = GW - 1; i >= 0; i--) { const k = j * GW + i; if (!d[k]) continue; let v = d[k];
      if (i < GW - 1) v = Math.min(v, d[k + 1] + a); else v = Math.min(v, a);
      if (j < GH - 1) { v = Math.min(v, d[k + GW] + a); if (i < GW - 1) v = Math.min(v, d[k + GW + 1] + b); if (i > 0) v = Math.min(v, d[k + GW - 1] + b); } else v = Math.min(v, a);
      d[k] = v; }
    for (let k = 0; k < N; k++) d[k] *= CELL;
    CLR[f] = d;
  }
  // 每格的成本倍率：淨空 < CLEAR_PREF 時遞增（貼牆最多 1+PENALTY 倍）
  const MUL = CLR.map(c => { const u = new Float32Array(N); for (let k = 0; k < N; k++) { const t = Math.max(0, (CLEAR_PREF - c[k]) / CLEAR_PREF); u[k] = 1 + PENALTY * t * t; } return u; });

  // ---------- 2. 單源洪泛 ----------
  const DX = [1, -1, 0, 0, 1, 1, -1, -1], DZ = [0, 0, 1, -1, 1, -1, 1, -1];
  function nearestCell(f, x, z, maxR = 80) {
    const e = ERO[f], i0 = ci(x), j0 = cj(z);
    if (i0 >= 0 && j0 >= 0 && i0 < GW && j0 < GH && e[j0 * GW + i0]) return j0 * GW + i0;
    let best = -1, bd = 1e9;
    for (let R = 1; R <= maxR; R++) {
      for (let j = j0 - R; j <= j0 + R; j++) for (let i = i0 - R; i <= i0 + R; i++) {
        if (Math.max(Math.abs(i - i0), Math.abs(j - j0)) !== R || i < 0 || j < 0 || i >= GW || j >= GH) continue;
        if (e[j * GW + i]) { const d = (i - i0) ** 2 + (j - j0) ** 2; if (d < bd) { bd = d; best = j * GW + i; } }
      }
      if (best >= 0) return best;
    }
    return -1;
  }
  const heap = () => { const hk = [], hv = [];   // 二元堆積：key / cell
    return { get size() { return hk.length; },
      push(key, v) { hk.push(key); hv.push(v); let c = hk.length - 1; while (c > 0) { const p = (c - 1) >> 1; if (hk[p] <= hk[c]) break; [hk[p], hk[c]] = [hk[c], hk[p]]; [hv[p], hv[c]] = [hv[c], hv[p]]; c = p; } },
      pop() { const v = hv[0], lk = hk.pop(), lv = hv.pop(); if (hk.length) { hk[0] = lk; hv[0] = lv; let c = 0; for (;;) { const l = 2 * c + 1, r = l + 1; let s = c; if (l < hk.length && hk[l] < hk[s]) s = l; if (r < hk.length && hk[r] < hk[s]) s = r; if (s === c) break; [hk[s], hk[c]] = [hk[c], hk[s]]; [hv[s], hv[c]] = [hv[c], hv[s]]; c = s; } } return v; } }; };
  const stepCost = (mul, a, b, k) => (k < 4 ? 1 : SQ2) * CELL * 0.5 * (mul[a] + mul[b]);
  // 全層洪泛：{ dist: Float32Array, dir: Uint8Array（往來源走的方向碼，255=無） }。成本對稱，所以也是「任一格 → 來源」的最短路。
  function flood(f, src) {
    const e = ERO[f], mul = MUL[f], dist = new Float32Array(N).fill(Infinity), dir = new Uint8Array(N).fill(255), done = new Uint8Array(N), H = heap();
    dist[src] = 0; H.push(0, src);
    while (H.size) {
      const cur = H.pop(); if (done[cur]) continue; done[cur] = 1;
      const i = cur % GW, j = (cur / GW) | 0, dc = dist[cur];
      for (let k = 0; k < 8; k++) {
        const ni = i + DX[k], nj = j + DZ[k]; if (ni < 0 || nj < 0 || ni >= GW || nj >= GH) continue;
        const nk = nj * GW + ni; if (!e[nk] || done[nk]) continue;
        if (k >= 4 && (!e[j * GW + ni] || !e[nj * GW + i])) continue;
        const nd = dc + stepCost(mul, cur, nk, k);
        if (nd < dist[nk]) { dist[nk] = nd; dir[nk] = BACK[k]; H.push(nd, nk); }
      }
    }
    return { f, dist, dir, src };
  }
  const BACK = [1, 0, 3, 2, 7, 6, 5, 4];   // 方向 k 的反方向（DX/DZ 的索引）
  // 從格 c 沿方向碼走回洪泛來源：回傳 [c, ..., src]
  const toSource = (fl, c) => { const out = [c]; let guard = N; while (c !== fl.src && guard--) { const k = fl.dir[c]; if (k === 255) return null; c = (((c / GW) | 0) + DZ[k]) * GW + (c % GW) + DX[k]; out.push(c); } return out; };
  // 同層：帶淨空成本的 A*（啟發式＝八方向距離 × CELL，倍率 ≥ 1 故可採納）
  function astarW(f, s, t) {
    const e = ERO[f], mul = MUL[f], g = new Map([[s, 0]]), par = new Map([[s, -1]]), closed = new Set(), H = heap(), ti = t % GW, tj = (t / GW) | 0;
    const h = (c) => { const dx = Math.abs(c % GW - ti), dz = Math.abs(((c / GW) | 0) - tj); return (Math.max(dx, dz) + (SQ2 - 1) * Math.min(dx, dz)) * CELL; };
    H.push(h(s), s);
    while (H.size) {
      const cur = H.pop(); if (closed.has(cur)) continue; closed.add(cur);
      if (cur === t) { const out = []; for (let c = t; c >= 0; c = par.get(c)) out.push(c); return out.reverse(); }
      const i = cur % GW, j = (cur / GW) | 0, gc = g.get(cur);
      for (let k = 0; k < 8; k++) {
        const ni = i + DX[k], nj = j + DZ[k]; if (ni < 0 || nj < 0 || ni >= GW || nj >= GH) continue;
        const nk = nj * GW + ni; if (!e[nk] || closed.has(nk)) continue;
        if (k >= 4 && (!e[j * GW + ni] || !e[nj * GW + i])) continue;
        const ng = gc + stepCost(mul, cur, nk, k);
        if (ng < (g.get(nk) ?? Infinity)) { g.set(nk, ng); par.set(nk, cur); H.push(ng + h(nk), nk); }
      }
    }
    return null;
  }

  // ---------- 4. 拉直（保淨空的視線檢查） ----------
  function losClear(f, ax, az, bx, bz, need) {
    const e = ERO[f], c = CLR[f], d = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(d / (CELL * 0.5)));
    for (let k = 0; k <= n; k++) { const t = k / n, i = ci(ax + (bx - ax) * t), j = cj(az + (bz - az) * t); if (i < 0 || j < 0 || i >= GW || j >= GH) return false; const q = j * GW + i; if (!e[q] || c[q] < need) return false; }
    return true;
  }
  const clrAt = (f, x, z) => { const i = ci(x), j = cj(z); return (i < 0 || j < 0 || i >= GW || j >= GH) ? 0 : CLR[f][j * GW + i]; };
  function smooth(f, pts) {
    if (pts.length <= 2) return pts;
    const out = [pts[0]]; let a = 0;
    while (a < pts.length - 1) {
      let b = pts.length - 1;
      while (b > a + 1) {
        const need = Math.min(LOS_CLEAR, clrAt(f, pts[a].x, pts[a].z), clrAt(f, pts[b].x, pts[b].z)) - 1e-3;
        if (losClear(f, pts[a].x, pts[a].z, pts[b].x, pts[b].z, need)) break; b--;
      }
      out.push(pts[b]); a = b;
    }
    return out;
  }
  function walkPts(f, cells, from, to) {
    const pts = cells.map(c => ({ x: cxm(c % GW), z: czm((c / GW) | 0) }));
    if (from) pts[0] = { x: from.x, z: from.z };
    let out = smooth(f, pts);
    if (to) { const last = out[out.length - 1]; if (Math.hypot(last.x - to.x, last.z - to.z) > 0.3 && m.freeAt(f, to.x, to.z)) out.push({ x: to.x, z: to.z }); }
    return out;
  }

  // ---------- 3. 入口圖 ----------
  const PORTALS = [];   // { s, f, cell }
  STAIRS.forEach(s => s.fl.forEach(f => PORTALS.push({ s, f, cell: nearestCell(f, s.ent.x, s.ent.z, 20), id: PORTALS.length })));
  const portalAt = (s, f) => PORTALS.find(p => p.s === s && p.f === f);
  const stairCost = (s) => 2 * Math.hypot(s.L, FH / 2) + s.sh / 2 + 1.0;   // 一層：兩跑斜長＋平台橫移＋進出入口平台（與 nav.stairPts 的航點一致）
  const portalFlood = new Map();   // 入口洪泛（延遲建立、快取）：任一格到該入口的成本與路徑
  const pflood = (p) => { if (!portalFlood.has(p.id)) portalFlood.set(p.id, flood(p.f, p.cell)); return portalFlood.get(p.id); };
  const warm = () => PORTALS.forEach(pflood);
  // 背景預熱：每個 tick 建一個入口洪泛（約 20 ms），避免第一次跨樓層導覽時頓一下
  const warmAsync = (done) => { let k = 0; const step = () => { if (k >= PORTALS.length) { if (done) done(); return; } pflood(PORTALS[k++]); setTimeout(step, 0); }; setTimeout(step, 0); };

  function planRoute(from, dest) {
    const sc = nearestCell(from.f, from.x, from.z), tc = nearestCell(dest.f, dest.x, dest.z); if (sc < 0 || tc < 0) return null;
    if (from.f === dest.f) {                                   // 同層：直接 A*（經別層繞路不會更短，不考慮）
      const cells = astarW(from.f, sc, tc); return cells ? [{ type: 'walk', f: from.f, pts: walkPts(from.f, cells, from, dest) }] : null;
    }
    // Dijkstra over 入口：起點成本 = 入口洪泛在起點格的值
    const D = new Map(), prev = new Map(), open = [], closed = new Set();
    for (const p of PORTALS) if (p.f === from.f) { const c = pflood(p).dist[sc]; if (isFinite(c)) { D.set(p.id, c); prev.set(p.id, null); open.push(p); } }
    while (open.length) {
      open.sort((a, b) => D.get(a.id) - D.get(b.id)); const u = open.shift(); if (closed.has(u.id)) continue; closed.add(u.id);
      const du = D.get(u.id), relax = (v, c, via) => { const nd = du + c; if (nd < (D.get(v.id) ?? Infinity)) { D.set(v.id, nd); prev.set(v.id, { u, via }); open.push(v); } };
      for (const nf of [UP[u.f], DN[u.f]]) if (nf >= 0 && u.s.fl.includes(nf)) relax(portalAt(u.s, nf), stairCost(u.s), 'stair');
      const pf = pflood(u); for (const v of PORTALS) if (v.f === u.f && v !== u && isFinite(pf.dist[v.cell])) relax(v, pf.dist[v.cell], 'walk');
    }
    let best = null;
    for (const p of PORTALS) { if (p.f !== dest.f || !D.has(p.id)) continue; const c = D.get(p.id) + pflood(p).dist[tc]; if (isFinite(c) && (!best || c < best.cost)) best = { cost: c, p }; }
    if (!best) return null;
    const seq = []; for (let p = best.p; p; ) { const pr = prev.get(p.id); seq.unshift({ p, via: pr ? pr.via : null }); p = pr ? pr.u : null; }
    const ent = (p) => ({ x: p.s.ent.x, z: p.s.ent.z }), legs = [];
    legs.push({ type: 'walk', f: from.f, pts: walkPts(from.f, toSource(pflood(seq[0].p), sc), from, ent(seq[0].p)) });
    for (let k = 1; k < seq.length; k++) {
      const a = seq[k - 1].p, b = seq[k].p;
      if (seq[k].via === 'stair') { const L = legs[legs.length - 1]; if (L.type === 'stair' && L.s === a.s && L.to === a.f) L.to = b.f; else legs.push({ type: 'stair', s: a.s, from: a.f, to: b.f }); }
      else legs.push({ type: 'walk', f: a.f, pts: walkPts(a.f, toSource(pflood(b), a.cell), ent(a), ent(b)) });
    }
    const last = seq[seq.length - 1].p;
    legs.push({ type: 'walk', f: dest.f, pts: walkPts(dest.f, toSource(pflood(last), tc).reverse(), ent(last), dest) });
    return legs;
  }
  return { planRoute, warm, warmAsync, CLR, flood, nearestCell, PORTALS, stairCost, clearanceAt: clrAt };
}
