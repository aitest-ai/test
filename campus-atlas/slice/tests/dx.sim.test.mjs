// 東新版無頭測試：全地點可達、走路不穿牆、樓梯可走上去
import fs from 'fs';
import { buildModel } from '../src/dongxin/model.js';
import { createDxWorld } from '../src/dongxin/world.js';
import { createDxNav } from '../src/dongxin/nav.js';
import { createWalker } from '../src/nav/navgraph.js';
const D = JSON.parse(fs.readFileSync(new URL('../data/dongxin_geo.json', import.meta.url)));
const m = buildModel(D), world = createDxWorld(m), nav = createDxNav(m, world);
let pass = 0, fail = 0; const bad = [];
const ok = (c, msg) => { if (c) pass++; else { fail++; bad.push(msg); } };
const gate = m.PLACES.find(p => p.name === '校門');
const targets = [...m.ROOMS.filter(r => !r.solid), ...m.PLACES];
function walk(start, t, maxSec = 260) {
  const rt = nav.route(start, t); if (!rt) return { err: 'noroute' };
  const w = createWalker(world, rt, { tol: 0.12 }), p = { x: start.x, z: start.z, y: start.y, heading: 0 };
  let ymin = p.y, ymax = p.y, bumps = 0;
  for (let tt = 0; tt < maxSec && !w.done && !w.stuck; tt += 1 / 30) { w.step(p, 1 / 30, 6); ymin = Math.min(ymin, p.y); ymax = Math.max(ymax, p.y);
    if (world.hit(p.x, p.z, p.y, 0.29)) bumps++; }
  return { done: w.done, stuck: w.stuck, p, bumps, len: rt.length };
}
// 1) 從校門出發 → 每個目的地
const t0 = Date.now();
for (const t of targets) {
  const r = walk({ x: gate.x, z: gate.z, y: 0 }, t);
  ok(r.done && !r.err && r.bumps === 0 && Math.hypot(r.p.x - t.x, r.p.z - t.z) < 1.0 && Math.abs(r.p.y - (t.y ?? m.LY(t.f))) < 0.05, `gate→${t.name}(${t.f}): ${JSON.stringify(r.err || { done: r.done, stuck: r.stuck, bumps: r.bumps, d: r.p && Math.hypot(r.p.x - t.x, r.p.z - t.z).toFixed(2), y: r.p && r.p.y.toFixed(2) })}`);
}
console.log('gate→all', targets.length, 'targets', Date.now() - t0, 'ms');
// 2) 跨樓層隨機對（含 B1 ↔ 4F）
let seed = 12345; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
const pool = targets.filter(t => t.f !== undefined);
for (let i = 0; i < 60; i++) {
  const a = pool[(rnd() * pool.length) | 0], b = pool[(rnd() * pool.length) | 0]; if (a === b) continue;
  const r = walk({ x: a.x, z: a.z, y: a.y ?? m.LY(a.f) }, b);
  ok(r.done && !r.err && r.bumps === 0 && Math.abs(r.p.y - (b.y ?? m.LY(b.f))) < 0.05, `${a.name}(${a.f})→${b.name}(${b.f}): ${JSON.stringify(r.err || { done: r.done, stuck: r.stuck, bumps: r.bumps, y: r.p && r.p.y.toFixed(2) })}`);
}
// 2b) B1 ↔ 4F 明確測試（最長的垂直路線）
{ const b1 = m.PLACES.find(p => p.f === 4), r4 = m.ROOMS.find(r => r.f === 3 && !r.solid);
  const a = walk({ x: b1.x, z: b1.z, y: m.LY(4) }, r4), c = a.done ? walk({ x: a.p.x, z: a.p.z, y: a.p.y }, b1) : { done: false };
  ok(a.done && Math.abs(a.p.y - 11.7) < 0.05 && c.done && Math.abs(c.p.y + 3.9) < 0.05 && a.bumps === 0 && c.bumps === 0, `B1(${b1.name})→4F(${r4.name})→B1 ${JSON.stringify([a.done, a.p && a.p.y, c.done, c.p && c.p.y])}`); }
// 3) 每座樓梯：由最低層走到最高層再回來
for (const s of m.STAIRS) {
  const lo = Math.min(...s.fl.filter(f => f < 4)), hi = Math.max(...s.fl.filter(f => f < 4));
  const tgtA = { f: lo, x: s.ent.x, z: s.ent.z }, tgtB = { f: hi, x: s.ent.x, z: s.ent.z };
  const up = walk({ x: s.ent.x, z: s.ent.z, y: m.LY(lo) }, tgtB), dn = up.done ? walk({ x: up.p.x, z: up.p.z, y: up.p.y }, tgtA) : { done: false };
  ok(up.done && Math.abs(up.p.y - m.LY(hi)) < 0.05 && dn.done && Math.abs(dn.p.y - m.LY(lo)) < 0.05, `stair ${s.id} up/down ${JSON.stringify([up.done, up.p && up.p.y, dn.done, dn.p && dn.p.y])}`);
}
// 4) 手動方向鍵撞牆：朝四個方向猛衝 200 步，不得進入 hit 狀態
{ let n = 0; for (const t of targets.slice(0, 40)) for (let a = 0; a < 8; a++) { const p = { x: t.x, z: t.z, y: m.LY(t.f ?? 0) }; if (world.hit(p.x, p.z, p.y, 0.3)) continue;
    for (let i = 0; i < 200; i++) world.move(p, Math.sin(a * Math.PI / 4) * 0.16, Math.cos(a * Math.PI / 4) * 0.16); if (world.hit(p.x, p.z, p.y, 0.29)) n++; } ok(n === 0, 'wall-penetration ' + n); }
console.log(`DX SIM  pass ${pass}  fail ${fail}`); bad.slice(0, 30).forEach(b => console.log(' FAIL', b));
process.exit(fail ? 1 : 0);
