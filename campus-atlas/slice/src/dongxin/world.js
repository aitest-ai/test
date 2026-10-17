// 東新版物理層：格網可走遮罩 + 解析式樓梯（與 slice 的 physics/collision.js 介面相同）。
// 介面：hit / surfaceY / standOk / move / ray / los / ceilingY / floorOfY / stairAt
// 角色碰撞體：直立膠囊（半徑 R=0.3、高 1.7 m），水平面上即半徑 R 的圓；垂直方向由樓板與梯面高度決定（STEP_UP / MAX_DROP）。
// 場景碰撞體是「簡化碰撞體」＝ 0.30 m 格網的不可走格（每格一個 AABB）＋ 解析式梯面，與視覺網格完全分離。
// 判定：梯面影響區（梯間外擴 0.4 m）以外 → 圓 × 不可走格 AABB 精確最短距離（無取樣縫隙）；區內（梯面是解析式）→ 圓周 96 點＋內圈 16 點＋圓心取樣。
// 移動：子步 ≤ 0.08 m；被擋時先二分逼近到貼牆，再沿接觸法線投影滑動，凸角處試 ±20°/40°/60° 繞過（不卡角）。
// 樓梯不是腳本動畫：梯級、平台是可站立表面，人物用同一個 move() 走上去（手動、自動導航一致）。
export const R = 0.3, STEP_UP = 0.45, MAX_DROP = 0.6;

export function createDxWorld(m) {
  const { NL, FH, LY, UP, STAIRS, NAV, RC, ERO, CELL, GW, GH, WX0, WZ0, STR_N } = m;
  const SLAB = 0.3;
  const cell = (x, z) => { const i = Math.floor((x - WX0) / CELL), j = Math.floor((z - WZ0) / CELL); return (i < 0 || j < 0 || i >= GW || j >= GH) ? -1 : j * GW + i; };
  const gridFree = (f, x, z) => { const k = cell(x, z); return k >= 0 && NAV[f][k] === 1; };
  // y → 內部樓層編號（B1 = 4）。梯段中間回傳較近的那層。
  const floorOfY = (y) => { let best = 0, bd = 1e9; for (let f = 0; f < NL; f++) { const d = Math.abs(y - LY(f)); if (d < bd) { bd = d; best = f; } } return best; };

  // 每個樓梯的局部座標
  const loc = (s, x, z) => { const du = s.along === 'x' ? x - s.cx : z - s.cz, dv = s.along === 'x' ? z - s.cz : x - s.cx; return [s.sgn * du, dv]; };
  // 某點的所有梯面高度（可能同時屬於不同梯段；一般只會有一個）
  const stairHeights = (x, z, out) => {
    for (const s of STAIRS) {
      if (x < s.X0 - 0.4 || x > s.X1 + 0.4 || z < s.Z0 - 0.4 || z > s.Z1 + 0.4) continue;
      const [u, v] = loc(s, x, z), dl = s.L / STR_N, hs = FH / (2 * STR_N);
      for (const lo of s.fl) {
        const up = UP[lo]; if (up < 0 || !s.fl.includes(up)) continue;
        const y0 = LY(lo), yM = y0 + FH / 2;
        if (u >= s.uA - 0.3 && u <= s.uB && Math.abs(v + s.lane) <= s.ww / 2) { const k = Math.min(STR_N - 1, Math.max(0, Math.floor((u - s.uA) / dl))); out.push(y0 + (k + 1) * hs); }
        if (u >= s.uB && u <= s.Lt / 2 && Math.abs(v) <= s.sh / 2 - 0.1) out.push(yM);
        if (u >= s.uA - 0.3 && u <= s.uB && Math.abs(v - s.lane) <= s.ww / 2) { const k = Math.min(STR_N - 1, Math.max(0, Math.floor((s.uB - u) / dl))); out.push(yM + (k + 1) * hs); }
      }
    }
    return out;
  };
  const surfaces = (x, z) => {
    const out = []; for (let f = 0; f < NL; f++) if (gridFree(f, x, z)) out.push(LY(f));
    return stairHeights(x, z, out);
  };
  const surfaceY = (x, z, y) => { let best = null; for (const s of surfaces(x, z)) if (s <= y + STEP_UP + 1e-6 && (best === null || s > best)) best = s; return best; };
  // 取樣點可站：落在「該層格網可走」或「梯面（高度與 y 相容）」
  const sampleOK = (x, z, y) => {
    for (let f = 0; f < NL; f++) { const ly = LY(f); if (y >= ly - 0.02 && y < ly + STEP_UP && gridFree(f, x, z)) return true; }
    const hs = stairHeights(x, z, []);
    for (const h of hs) if (h <= y + STEP_UP + 1e-6 && h >= y - MAX_DROP) return true;
    return false;
  };
  // 在高度 y 可用的樓層（樓板 ly ≤ y < ly + STEP_UP）
  const levelsAt = (y) => { const out = []; for (let f = 0; f < NL; f++) { const ly = LY(f); if (y >= ly - 0.02 && y < ly + STEP_UP) out.push(f); } return out; };
  // 梯面影響區：梯間外擴 0.4 m（stairHeights 的查詢範圍）。區內可走與否取決於解析式梯面 → 用取樣；區外純格網 → 精確 AABB。
  const ZONE = new Uint8Array(GW * GH);
  for (const s of STAIRS) { const a = Math.floor((s.X0 - 0.4 - WX0) / CELL), b = Math.floor((s.X1 + 0.4 - WX0) / CELL), c = Math.floor((s.Z0 - 0.4 - WZ0) / CELL), d = Math.floor((s.Z1 + 0.4 - WZ0) / CELL);
    for (let j = Math.max(0, c); j <= Math.min(GH - 1, d); j++) for (let i = Math.max(0, a); i <= Math.min(GW - 1, b); i++) ZONE[j * GW + i] = 1; }
  const RING = [[0, 0]], NR = 96, NI = 16;
  for (let k = 0; k < NR; k++) RING.push([Math.cos(k / NR * 2 * Math.PI), Math.sin(k / NR * 2 * Math.PI)]);
  for (let k = 0; k < NI; k++) RING.push([0.55 * Math.cos((k + 0.5) / NI * 2 * Math.PI), 0.55 * Math.sin((k + 0.5) / NI * 2 * Math.PI)]);
  // 接觸：回傳 null（不碰）或 { nx, nz, depth }：法線指向可走側（把角色推出去的方向），depth 為最大穿入（取樣部分為估計值）
  function contact(x, z, y, r = R) {
    let nx = 0, nz = 0, depth = 0, any = false;
    const fl = levelsAt(y);
    const i0 = Math.floor((x - r - WX0) / CELL), i1 = Math.floor((x + r - WX0) / CELL), j0 = Math.floor((z - r - WZ0) / CELL), j1 = Math.floor((z + r - WZ0) / CELL);
    let zoned = false;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      let free = false; if (i >= 0 && j >= 0 && i < GW && j < GH) { const k = j * GW + i; if (ZONE[k]) { zoned = true; continue; } for (const f of fl) if (NAV[f][k] === 1) { free = true; break; } }
      if (free) continue;
      const x0 = WX0 + i * CELL, z0 = WZ0 + j * CELL, px = Math.max(x0, Math.min(x, x0 + CELL)), pz = Math.max(z0, Math.min(z, z0 + CELL));
      const ex = x - px, ez = z - pz, d = Math.hypot(ex, ez); if (d >= r - 1e-6) continue;
      any = true; const w = r - d; depth = Math.max(depth, w);
      if (d > 1e-9) { nx += ex / d * w; nz += ez / d * w; }
      else { const c = [x - x0, x0 + CELL - x, z - z0, z0 + CELL - z], mi = c.indexOf(Math.min(...c)); nx += [-1, 1, 0, 0][mi] * r; nz += [0, 0, -1, 1][mi] * r; }   // 圓心在格內：往最近的邊推
    }
    if (zoned) for (const [cx, cz] of RING) {
      const sx = x + cx * r, sz = z + cz * r, k = cell(sx, sz); if (k < 0 || !ZONE[k] || sampleOK(sx, sz, y)) continue;   // 區格內的點才取樣（區外格已精確處理）
      any = true; const l = Math.hypot(cx, cz), w = r * (1 - l) + 0.01; depth = Math.max(depth, w); if (l > 0) { nx -= cx / l * w; nz -= cz / l * w; }
    }
    if (!any) return null;
    const l = Math.hypot(nx, nz); return l > 1e-9 ? { nx: nx / l, nz: nz / l, depth } : { nx: 0, nz: 0, depth };
  }
  const hit = (x, z, y, r = R) => contact(x, z, y, r) ? true : null;
  const standOk = (x, z, y) => !hit(x, z, y, R);
  const tryStep = (p, nx, nz) => {
    if (hit(nx, nz, p.y, R)) return false;
    const y = surfaceY(nx, nz, p.y);
    if (y === null || p.y - y > MAX_DROP) return false;
    if (hit(nx, nz, y, R)) return false;
    p.x = nx; p.z = nz; p.y = y; return true;
  };
  // 沿 (sx,sz) 前進，被擋就二分逼近到貼牆（最多 5 次，精度約 2.5 mm）；回傳實際走的比例
  const advance = (p, sx, sz) => {
    if (tryStep(p, p.x + sx, p.z + sz)) return 1;
    let lo = 0, hi = 1; for (let k = 0; k < 5; k++) { const mid = (lo + hi) / 2; if (tryStep(p, p.x + sx * (mid - lo), p.z + sz * (mid - lo))) lo = mid; else hi = mid; }
    return lo;
  };
  const ROT = [20, -20, 40, -40, 60, -60].map(a => [Math.cos(a * Math.PI / 180), Math.sin(a * Math.PI / 180)]);
  const move = (p, dx, dz) => {
    const n = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.08)); const sx = dx / n, sz = dz / n, sl = Math.hypot(sx, sz);
    for (let i = 0; i < n; i++) {
      const done = advance(p, sx, sz); if (done >= 1) continue;
      let rx = sx * (1 - done), rz = sz * (1 - done);                         // 剩下的位移
      const c = contact(p.x + rx, p.z + rz, p.y, R);
      if (c && (c.nx || c.nz)) {                                               // 沿牆滑：去掉朝牆的分量
        const dn = rx * c.nx + rz * c.nz; if (dn < 0) { const tx = rx - dn * c.nx, tz = rz - dn * c.nz; if (Math.hypot(tx, tz) > 1e-4 && advance(p, tx, tz) > 0.5) continue; }
      }
      let ok = false;                                                          // 凸角：旋轉一點繞過去（只取遠離牆的那一側先試）
      const side = c ? Math.sign(rx * c.nz - rz * c.nx) || 1 : 1;
      for (const [ca, sa] of ROT) { const s_ = sa * side, tx = (rx * ca - rz * s_) * ca, tz = (rx * s_ + rz * ca) * ca; if (tryStep(p, p.x + tx, p.z + tz)) { ok = true; break; } }
      if (ok) continue;
      if (c && Math.abs(c.nx) > 0.08 && Math.abs(c.nz) > 0.08) {               // 幾乎正面撞上「角」（法線是斜的；平直牆面的法線必為軸向）：沿角的切線偏外 30° 繞行
        const rl = Math.hypot(rx, rz), sg = (-c.nz * rx + c.nx * rz) >= 0 ? 1 : -1, tx = -c.nz * sg, tz = c.nx * sg, k = 0.5 * rl;   // 取與剩餘位移同向的切線
        if (tryStep(p, p.x + (tx * 0.866 + c.nx * 0.5) * k, p.z + (tz * 0.866 + c.nz * 0.5) * k)) continue;
      }
      const a = tryStep(p, p.x + rx, p.z), b = tryStep(p, p.x, p.z + rz);    // 最後退回軸向分解
      if (!a && !b && sl > 0) break;
    }
  };
  // 鏡頭射線：離開起點所在的「房間／梯間」（或走出戶外/進入別的房間）就算被擋；另加柱子
  let pillars = [];
  const roomAt = (f, x, z) => { const k = cell(x, z); return k < 0 ? -1 : RC[f][k]; };
  const ray = (x0, z0, x1, z1, y, margin = 0.2) => {
    const f = floorOfY(y + 0.1), rp = roomAt(f, x0, z0), n = Math.max(2, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 0.2));
    for (let i = 1; i <= n; i++) {
      const t = i / n, x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
      if (roomAt(f, x, z) !== rp) return Math.max(0, (i - 1) / n);
      for (const p of pillars) if (p.f === f && (p.x - x) ** 2 + (p.z - z) ** 2 < (0.17 + margin * 0.5) ** 2) return Math.max(0, (i - 1) / n);
    }
    return 1;
  };
  const los = (x0, z0, x1, z1, y) => {
    const n = Math.max(2, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 0.1));
    for (let i = 0; i <= n; i++) { const t = i / n; if (hit(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t, y, R)) return false; }
    return true;
  };
  // 頭頂樓板底面（鏡頭上限）：房間／梯間內 = 本層頂；有上層 = 上層樓板；無（戶外、雨遮外）= ∞
  const covered = (f, k) => { // 此格頭上是否有結構
    if (RC[f][k] >= 0) return true;
    if (f === 4) return true;                                   // 地下停車場有頂（地面層）
    const up = UP[f]; if (up >= 0 && (NAV[up][k] || RC[up][k] >= 0)) return true;
    return false;
  };
  const ceilingY = (x, z, y) => {
    const f = floorOfY(y + 0.1), k = cell(x, z); if (k < 0) return Infinity;
    if (f === 4 && y < LY(0)) return LY(0) - SLAB;
    const up = RC[f][k] >= 0 && !(RC[f][k] >= 1000) ? LY(f) + FH - SLAB : (covered(f, k) ? LY(f) + FH - SLAB : Infinity);
    return up;
  };
  // 目前所在的梯間（站在梯間範圍內），不在則 null
  const stairAt = (x, z, margin = 0) => { for (const s of STAIRS) if (x > s.X0 - margin && x < s.X1 + margin && z > s.Z0 - margin && z < s.Z1 + margin) return s; return null; };
  return { hit, contact, surfaces, surfaceY, standOk, move, ray, los, ceilingY, R, floorOfY, roomAt, stairAt, stairLoc: loc, cell, setPillars: (p) => { pillars = p; }, stairHeights };
}
