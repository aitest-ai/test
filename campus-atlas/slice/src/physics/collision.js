// 物理層：2D 圓形角色 × 軸對齊矩形碰撞體（含 y 範圍）＋ 可站立表面（樓板／梯級）。
// 不靠視覺物件擋人；碰撞體與渲染分離。
export const R = 0.3, STEP_UP = 0.45, MAX_DROP = 0.6, BODY_LO = 0.2, BODY_HI = 1.5;

export function createWorld(lay) {
  const { colliders, shafts, stairInfo: si, FH, F, L, D } = lay;
  const hit = (x, z, y, r, lo = BODY_LO, hi = BODY_HI, camOnly = false) => {
    for (const c of colliders) {
      if (camOnly && !c.cam) continue;
      if (y + hi <= c.y0 || y + lo >= c.y1) continue;
      const nx = Math.max(c.x0, Math.min(x, c.x1)), nz = Math.max(c.z0, Math.min(z, c.z1));
      const dx = x - nx, dz = z - nz;
      if (dx * dx + dz * dz < r * r) return c;
    }
    return null;
  };
  // 所有可站立表面高度
  const surfaces = (x, z) => {
    const out = [];
    for (let k = 0; k < F; k++) if (lay.hasSlab(k, x, z)) out.push(k * FH);
    for (const sh of shafts) for (let k = 0; k < F - 1; k++) {
      const base = k * FH;
      if (x >= sh.A[0] && x <= sh.A[1] && z > si.ZL0 && z < si.ZF0) { const i = Math.min(si.NST, Math.floor((si.ZF0 - z) / si.TREAD) + 1); out.push(base + i * si.RISE); }
      if (x >= sh.B[0] && x <= sh.B[1] && z > si.ZL0 && z < si.ZF0) { const i = Math.min(si.NST, Math.floor((z - si.ZL0) / si.TREAD) + 1); out.push(base + FH / 2 + i * si.RISE); }
      if (x >= sh.A[0] && x <= sh.B[1] && z >= si.ZL1 && z <= si.ZL0) out.push(base + FH / 2);
    }
    return out;
  };
  const surfaceY = (x, z, y) => {
    let best = null;
    for (const s of surfaces(x, z)) if (s <= y + STEP_UP + 1e-6 && (best === null || s > best)) best = s;
    return best;
  };
  const standOk = (x, z, y) => !hit(x, z, y, R);
  // 嘗試移動一小步
  const tryStep = (p, nx, nz) => {
    if (hit(nx, nz, p.y, R)) return false;
    const y = surfaceY(nx, nz, p.y);
    if (y === null || p.y - y > MAX_DROP) return false;
    if (hit(nx, nz, y, R)) return false;
    p.x = nx; p.z = nz; p.y = y; return true;
  };
  // 移動並滑牆
  const move = (p, dx, dz) => {
    const n = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.08)); const sx = dx / n, sz = dz / n;
    for (let i = 0; i < n; i++) {
      if (tryStep(p, p.x + sx, p.z + sz)) continue;
      const a = tryStep(p, p.x + sx, p.z), b = tryStep(p, p.x, p.z + sz);
      if (!a && !b) break;
    }
  };
  // 視線／鏡頭射線：回傳第一個遮擋的比例 t（0..1），無則 1
  const ray = (x0, z0, x1, z1, y, margin = 0.2) => {
    const n = Math.max(2, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 0.1));
    for (let i = 1; i <= n; i++) { const t = i / n; if (hit(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t, y, margin, 1.3, 2.2, true)) return Math.max(0, (i - 1) / n); }
    return 1;
  };
  const los = (x0, z0, x1, z1, y) => {
    const n = Math.max(2, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 0.1));
    for (let i = 0; i <= n; i++) { const t = i / n; if (hit(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t, y, R)) return false; }
    return true;
  };
  // 頭頂樓板底面（鏡頭上限）
  const ceilingY = (x, z, y) => {
    let best = Infinity;
    if (x < 0 || x > L || z < 0 || z > D) return best;
    for (let k = 1; k <= F; k++) { const yy = k * FH - lay.W.slab; if (yy > y + 1.2 && (k === F || lay.hasSlab(k, x, z))) best = Math.min(best, yy); }
    return best;
  };
  return { hit, surfaces, surfaceY, standOk, move, ray, los, ceilingY, R };
}
