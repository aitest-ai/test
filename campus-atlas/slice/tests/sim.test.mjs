import { WING } from '../src/data/wing.js';
import { buildLayout } from '../src/model/layout.js';
import { createWorld } from '../src/physics/collision.js';
import { createNav, createWalker } from '../src/nav/navgraph.js';
const lay = buildLayout(WING), world = createWorld(lay), nav = createNav(lay, world);
let fail = 0; const ok = (c, m) => { if (!c) { fail++; console.log('FAIL', m); } };
const results = [];
// 1) 路線可達：多個起點 × 全部教室
const starts = [{ x: 18, z: 26, y: 0, n: '校門前' }, { x: 3, z: 14, y: 0, n: '西南角' }, { x: 33, z: 14, y: 0, n: '東南角' }];
for (let k = 0; k < lay.F; k++) { starts.push({ x: 18, z: 9.5, y: k * lay.FH, n: `${k + 1}F走廊中` }); starts.push({ x: 1.3, z: 8.5, y: k * lay.FH, n: `${k + 1}F西梯口` }); }
let routes = 0, arrived = 0, maxJump = 0, inWall = 0, minTime = 1e9, maxLen = 0;
for (const s of starts) for (const r of lay.rooms) {
  const p = { x: s.x, z: s.z, y: s.y, heading: 0 };
  ok(world.standOk(p.x, p.z, p.y), `start invalid ${s.n}`);
  const rt = nav.route(p, r.id); routes++;
  if (!rt) { ok(false, `no route ${s.n}→${r.name}`); continue; }
  const w = createWalker(world, rt); let t = 0;
  while (!w.done && t < 120) { const py = p.y; w.step(p, 1 / 30); t += 1 / 30; maxJump = Math.max(maxJump, Math.abs(p.y - py)); if (world.hit(p.x, p.z, p.y, world.R * 0.98)) inWall++; if (w.stuck) break; }
  const d = Math.hypot(p.x - r.sill.x, p.z - r.sill.z);
  if (w.done && d < 0.3 && Math.abs(p.y - r.sill.y) < 0.05) arrived++; else ok(false, `未抵達 ${s.n}→${r.name} d=${d.toFixed(2)} y=${p.y.toFixed(2)} t=${t.toFixed(1)} stuck=${!!w.stuck}`);
  maxLen = Math.max(maxLen, rt.length);
}
console.log(`路線 ${arrived}/${routes} 抵達；最大單步 y 跳動 ${maxJump.toFixed(3)} m；進牆次數 ${inWall}；最長路線 ${maxLen.toFixed(1)} m`);
ok(arrived === routes, 'all routes arrive'); ok(inWall === 0, 'no wall penetration'); ok(maxJump < 0.25, 'y continuity');
// 2) 隨機亂走：不得進入任何碰撞體、不得離開可站立表面、y 連續
let seed = 12345; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
let bad = 0, steps = 0, floorsSeen = new Set(), maxJump2 = 0;
for (let run = 0; run < 40; run++) {
  const p = { x: 4 + rnd() * 28, z: 9.5, y: Math.floor(rnd() * 3) * lay.FH }; let hd = rnd() * 6.28;
  for (let i = 0; i < 4000; i++) {
    if (rnd() < 0.04) hd += (rnd() - 0.5) * 3;
    const py = p.y; world.move(p, Math.sin(hd) * 0.16, Math.cos(hd) * 0.16); steps++;
    if (world.hit(p.x, p.z, p.y, world.R * 0.98)) bad++;
    if (world.surfaceY(p.x, p.z, p.y + 0.01) === null) bad++;
    maxJump2 = Math.max(maxJump2, Math.abs(p.y - py)); floorsSeen.add(Math.round(p.y / lay.FH * 2) / 2);
  }
}
console.log(`隨機亂走 ${steps} 步：違規 ${bad}；最大 y 跳動 ${maxJump2.toFixed(3)}；到過高度(層) ${[...floorsSeen].sort().join(',')}`);
ok(bad === 0, 'fuzz violations'); ok(maxJump2 < 0.25, 'fuzz y jump');
// 3) 無法由底下鑽進梯級下方
const q = { x: 3.7, z: 7.2, y: 0 }; for (let i = 0; i < 60; i++) world.move(q, 0, -0.1);
console.log('B 跑道從底層直走:', JSON.stringify({ z: +q.z.toFixed(2), y: +q.y.toFixed(2) }));
console.log(fail ? `FAILED ${fail}` : 'ALL PASS');
process.exit(fail ? 1 : 0);
