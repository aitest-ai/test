// 東新版物理層：格網可走遮罩 + 解析式樓梯（與 slice 的 physics/collision.js 介面相同）。
// 介面：hit / surfaceY / standOk / move / ray / los / ceilingY / floorOfY / stairAt
// 角色是圓（R=0.3）；水平碰撞 = 圓周 5 個取樣點都必須落在「可走格」或「梯面」上。
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
  const hit = (x, z, y, r = R) => (sampleOK(x, z, y) && sampleOK(x + r, z, y) && sampleOK(x - r, z, y) && sampleOK(x, z + r, y) && sampleOK(x, z - r, y)) ? null : true;
  const standOk = (x, z, y) => !hit(x, z, y, R);
  const tryStep = (p, nx, nz) => {
    if (hit(nx, nz, p.y, R)) return false;
    const y = surfaceY(nx, nz, p.y);
    if (y === null || p.y - y > MAX_DROP) return false;
    if (hit(nx, nz, y, R)) return false;
    p.x = nx; p.z = nz; p.y = y; return true;
  };
  const move = (p, dx, dz) => {
    const n = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.08)); const sx = dx / n, sz = dz / n;
    for (let i = 0; i < n; i++) {
      if (tryStep(p, p.x + sx, p.z + sz)) continue;
      const a = tryStep(p, p.x + sx, p.z), b = tryStep(p, p.x, p.z + sz);
      if (!a && !b) break;
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
  return { hit, surfaces, surfaceY, standOk, move, ray, los, ceilingY, R, floorOfY, roomAt, stairAt, stairLoc: loc, cell, setPillars: (p) => { pillars = p; }, stairHeights };
}
