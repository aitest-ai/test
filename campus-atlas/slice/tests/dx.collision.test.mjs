// 東新版碰撞驗收：貼牆斜走不穿牆、不卡角。
//   穿入深度：角色圓心到「該層不可走格」AABB 的精確最短距離，小於 R 的部分就是穿入（梯間內不量，梯面另有測試）。
//   滑牆效率：以 20°–70° 斜推牆 2 秒，實際沿牆位移 ÷ 理想沿牆位移（speed·t·sinθ，扣掉前方被擋的情況）。
//   卡住：先貼到牆上，沿牆純切向前方 1.2 m 明明可走（用同一個 world 探測），斜推時卻幾乎沒動（效率 < 0.25）。
//   （牆面往走廊凸出的內凹角：純切向也走不過去 → 不列入，停下來才是正確物理。）
// 用法：node tests/dx.collision.test.mjs [--json]
import fs from 'fs';
import { buildModel } from '../src/dongxin/model.js';
import { createDxWorld } from '../src/dongxin/world.js';

const D = JSON.parse(fs.readFileSync(new URL('../data/dongxin_geo.json', import.meta.url)));
const m = buildModel(D), world = createDxWorld(m);
const { NAV, GW, GH, CELL, WX0, WZ0, LY, NL } = m, R = world.R;
const json = process.argv.includes('--json');

// 偽亂數（可重現）
let seed = 12345; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;

// 精確穿入深度（格網部分）
function penetration(p) {
  if (world.stairAt(p.x, p.z, 0.6)) return 0;
  const f = world.floorOfY(p.y + 0.1); if (Math.abs(p.y - LY(f)) > 0.05) return 0;
  const i0 = Math.floor((p.x - R - WX0) / CELL), i1 = Math.floor((p.x + R - WX0) / CELL), j0 = Math.floor((p.z - R - WZ0) / CELL), j1 = Math.floor((p.z + R - WZ0) / CELL);
  let dmin = Infinity;
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const blocked = i < 0 || j < 0 || i >= GW || j >= GH || !NAV[f][j * GW + i]; if (!blocked) continue;
    const x0 = WX0 + i * CELL, z0 = WZ0 + j * CELL, dx = Math.max(x0 - p.x, 0, p.x - (x0 + CELL)), dz = Math.max(z0 - p.z, 0, p.z - (z0 + CELL));
    dmin = Math.min(dmin, Math.hypot(dx, dz));
  }
  return Math.max(0, R - dmin);
}

// 找貼牆起點：可站立、且往某個軸向 0.6 m 內就撞牆的格子；回傳牆的外法線（指向可走側）
function sampleStarts(n) {
  const out = [], dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  let guard = 0;
  while (out.length < n && guard++ < n * 400) {
    const f = Math.floor(rnd() * 4), i = 2 + Math.floor(rnd() * (GW - 4)), j = 2 + Math.floor(rnd() * (GH - 4));
    if (!NAV[f][j * GW + i]) continue;
    const p = { x: WX0 + (i + 0.5) * CELL, z: WZ0 + (j + 0.5) * CELL, y: LY(f) };
    if (!world.standOk(p.x, p.z, p.y) || world.stairAt(p.x, p.z, 1.5)) continue;
    const [dx, dz] = dirs[Math.floor(rnd() * 4)];
    let wallAt = -1; for (let s = 0.05; s <= 0.6; s += 0.05) if (world.hit(p.x + dx * s, p.z + dz * s, p.y)) { wallAt = s; break; }
    if (wallAt < 0) continue;
    out.push({ p, n: [-dx, -dz] });
  }
  return out;
}

const starts = sampleStarts(400), dt = 1 / 60, speed = 5.0, T = 2.0;
let maxPen = 0, penFrames = 0, frames = 0, effSum = 0, effN = 0, stuck = 0; const worst = [];
for (const st of starts) for (const ang of [20, 35, 50, 70]) for (const side of [1, -1]) {
  const a = ang * Math.PI / 180, [nx, nz] = st.n, tx = -nz * side, tz = nx * side;          // 推向牆（-n）並沿切線（t）
  const ux = -nx * Math.cos(a) + tx * Math.sin(a), uz = -nz * Math.cos(a) + tz * Math.sin(a);
  const p = { ...st.p };
  // 沿牆前方是否可走：從起點沿切線探測（只用作卡住判定的條件）
  let free = 0; { const q = { ...st.p }; for (let k = 0; k < 12; k++) world.move(q, -nx * 0.05, -nz * 0.05); const q0 = { ...q }; for (let k = 0; k < 15; k++) { const bx = q.x, bz = q.z; world.move(q, tx * 0.08, tz * 0.08); if (Math.hypot(q.x - bx, q.z - bz) < 0.04) break; free = Math.hypot(q.x - q0.x, q.z - q0.z); } }
  for (let t = 0; t < T; t += dt) {
    world.move(p, ux * speed * dt, uz * speed * dt); frames++;
    const pe = penetration(p); if (pe > 1e-6) penFrames++; if (pe > maxPen) { maxPen = pe; worst.unshift({ pe: +pe.toFixed(4), x: +p.x.toFixed(2), z: +p.z.toFixed(2), y: p.y, ang }); worst.length = Math.min(worst.length, 5); }
  }
  if (free >= 1.15) {
    const along = (p.x - st.p.x) * tx + (p.z - st.p.z) * tz, ideal = Math.min(speed * T * Math.sin(a), free);
    const eff = Math.max(0, Math.min(1, along / ideal)); effSum += eff; effN++; if (eff < 0.25) { stuck++; if (process.env.DBG) console.log("stuck", JSON.stringify({ x: +st.p.x.toFixed(2), z: +st.p.z.toFixed(2), y: st.p.y, n: st.n, side, ang, free: +free.toFixed(2), along: +along.toFixed(2), end: [+p.x.toFixed(2), +p.z.toFixed(2)] })); }
  }
}
// 凸角擦邊：找露出的凸角（不可走格 B，其某一象限 4×4 格全可走，且沿兩個面各 6 格可走），
// 角色沿面方向直走、路線與角重疊 g（0.05–0.25 m）：應該被角推開繞過去（前進 ≥ 1.6 m / 1 秒），不停住也不穿過。
let cornerRuns = 0, cornerStuck = 0, cornerMaxPen = 0; const cornerBad = [];
const freeC = (f, i, j) => i >= 0 && j >= 0 && i < GW && j < GH && NAV[f][j * GW + i] === 1;
for (let f = 0; f < 4 && cornerRuns < 1600; f++) for (let j = 6; j < GH - 6 && cornerRuns < 1600; j += 1) for (let i = 6; i < GW - 6; i += 1) {
  if (NAV[f][j * GW + i]) continue;
  for (const [qx, qz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    // B 的牆往 -q 兩個方向延伸；q 象限 4×4 全可走；沿兩個面各有 7 格長、3 格寬的走道
    if (freeC(f, i - qx, j) || freeC(f, i, j - qz)) continue;
    let ok = true;
    for (let a = 1; a <= 4 && ok; a++) for (let b = 1; b <= 4 && ok; b++) if (!freeC(f, i + qx * a, j + qz * b)) ok = false;
    for (let a = 0; a <= 6 && ok; a++) for (let b = 1; b <= 3 && ok; b++) if (!freeC(f, i - qx * a, j + qz * b) || !freeC(f, i + qx * b, j - qz * a)) ok = false;
    if (!ok) continue;
    const cx = WX0 + (i + (qx > 0 ? 1 : 0)) * CELL, cz = WZ0 + (j + (qz > 0 ? 1 : 0)) * CELL, y = LY(f);
    if (world.stairAt(cx, cz, 2)) continue;
    for (const along of ['x', 'z']) for (const g of [0.05, 0.15, 0.25]) {
      // 沿 x 走：從角外側 1 m 出發，橫向位置讓圓與角重疊 g，朝 -qx 方向（經過角、沿 B 的 qz 面）
      const p = along === 'x' ? { x: cx + qx * 1.0, z: cz + qz * (R - g), y } : { x: cx + qx * (R - g), z: cz + qz * 1.0, y };
      if (!world.standOk(p.x, p.z, y)) continue;
      const ux = along === 'x' ? -qx : 0, uz = along === 'x' ? 0 : -qz, p0 = { ...p };
      for (let t = 0; t < 1; t += dt) { world.move(p, ux * speed * dt, uz * speed * dt); cornerMaxPen = Math.max(cornerMaxPen, penetration(p)); }
      const prog = (p.x - p0.x) * ux + (p.z - p0.z) * uz; cornerRuns++;
      if (prog < 1.6) { cornerStuck++; if (cornerBad.length < 5) cornerBad.push({ f, cx: +cx.toFixed(2), cz: +cz.toFixed(2), along, g, prog: +prog.toFixed(2) }); }
    }
  }
}
// 正面撞平直牆 2 秒：不得沿牆漂移（> 2 cm 算失敗）。階梯狀斜牆、細牆端點會正確地把人導開，不列入。
let headRuns = 0, headDrift = 0;
const flatWall = (st) => {   // 沿 -n 找到第一個牆格；牆格左右各 4 格同為牆、牆前一排同為可走 → 平直牆面
  const [nx, nz] = st.n, f = world.floorOfY(st.p.y + 0.1); let i = Math.floor((st.p.x - WX0) / CELL), j = Math.floor((st.p.z - WZ0) / CELL);
  for (let k = 0; k < 4 && freeC(f, i, j); k++) { i -= nx; j -= nz; } if (freeC(f, i, j)) return false;
  for (let t = -4; t <= 4; t++) { const a = i + t * Math.abs(nz), b = j + t * Math.abs(nx); if (freeC(f, a, b) || !freeC(f, a + nx, b + nz)) return false; }
  return true; };
for (const st of starts) { if (!flatWall(st)) continue; const [nx, nz] = st.n, p = { ...st.p };
  for (let t = 0; t < 2; t += dt) world.move(p, -nx * speed * dt, -nz * speed * dt);
  const lat = Math.abs((p.x - st.p.x) * -nz + (p.z - st.p.z) * nx); headRuns++; headDrift = Math.max(headDrift, lat); if (process.env.DBG && lat > 0.02) console.log("drift", JSON.stringify({ x: st.p.x, z: st.p.z, y: st.p.y, n: st.n, lat, end: [p.x, p.z] })); }
const res = { starts: starts.length, runs: starts.length * 8, frames, maxPenetration_m: +maxPen.toFixed(4), framesWithPenetration: penFrames,
  slideEfficiency: +(effSum / effN).toFixed(3), slideRuns: effN, stuckRuns: stuck, worst,
  headOnRuns: headRuns, headOnMaxDrift_m: +headDrift.toFixed(4), cornerRuns, cornerStuck, cornerMaxPenetration_m: +cornerMaxPen.toFixed(4), cornerBad };
if (json) console.log(JSON.stringify(res));
else {
  console.log('碰撞驗收', JSON.stringify(res, null, 1));
  const ok = maxPen <= 0.01 && stuck === 0 && cornerStuck === 0 && cornerMaxPen <= 0.01 && cornerRuns > 50 && headDrift <= 0.02 && headRuns > 50;
  console.log(ok ? 'COLLISION PASS' : 'COLLISION FAIL', `(門檻：穿入 ≤ 1 cm、貼牆卡住 0 次、凸角擦邊卡住 0 次、正面撞牆漂移 ≤ 2 cm；滑牆效率參考值)`);
  process.exitCode = ok ? 0 : 1;
}
