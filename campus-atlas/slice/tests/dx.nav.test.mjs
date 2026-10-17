// 東新版導航驗收：路徑網格（pathgrid.js）vs 舊版（最近 3 座樓梯 × A*）
//   - 可達：所有目標對都有路線
//   - 樓梯選擇：與「窮舉每座可用樓梯」的幾何最短比，多走 > 5 m 視為選錯
//   - 淨空：沿步行段每 0.25 m 取樣離牆距離（平均、最小、< 0.5 m 的比例）
//   - 速度：每條路線規劃時間
//   - 轉乘：人為拿掉貫通樓梯時，仍能經兩座樓梯轉乘到達
// 用法：node tests/dx.nav.test.mjs [--json] [--pairs N]
import fs from 'fs';
import { buildModel } from '../src/dongxin/model.js';
import { createPathGrid } from '../src/dongxin/pathgrid.js';

const D = JSON.parse(fs.readFileSync(new URL('../data/dongxin_geo.json', import.meta.url)));
const m = buildModel(D), pg = createPathGrid(m);
const json = process.argv.includes('--json'), NP = +(process.argv[process.argv.indexOf('--pairs') + 1] || 0) || 600;
const T = [...m.ROOMS.filter(r => !r.solid), ...m.PLACES];
let seed = 7; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
const polyLen = p => { let d = 0; for (let i = 1; i < p.length; i++) d += Math.hypot(p[i].x - p[i - 1].x, p[i].z - p[i - 1].z); return d; };
const legsLen = legs => legs.reduce((s, l) => s + (l.type === 'walk' ? polyLen(l.pts) : Math.abs(m.RANK(l.to) - m.RANK(l.from)) * pg.stairCost(l.s)), 0);
function clearance(legs) { const out = [];
  for (const l of legs) if (l.type === 'walk') for (let i = 1; i < l.pts.length; i++) { const a = l.pts[i - 1], b = l.pts[i], n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.25));
    for (let k = 0; k < n; k++) out.push(pg.clearanceAt(l.f, a.x + (b.x - a.x) * k / n, a.z + (b.z - a.z) * k / n)); }
  return out; }
// 窮舉單一樓梯的幾何最短（用舊 A* 量，無淨空懲罰）
function bestSingle(a, b) { let best = Infinity;
  for (const s of m.STAIRS) { if (!s.fl.includes(a.f) || !s.fl.includes(b.f)) continue; const w1 = m.astar(a.f, a.x, a.z, s.ent.x, s.ent.z), w2 = m.astar(b.f, s.ent.x, s.ent.z, b.x, b.z); if (!w1 || !w2) continue;
    best = Math.min(best, polyLen(w1) + polyLen(w2) + Math.abs(m.RANK(b.f) - m.RANK(a.f)) * pg.stairCost(s)); }
  return best; }

const pairs = []; while (pairs.length < NP) { const a = T[Math.floor(rnd() * T.length)], b = T[Math.floor(rnd() * T.length)]; if (a !== b) pairs.push([a, b]); }
const S = { old: { ms: 0, none: 0, wrong: 0, extra: 0, clr: [], len: 0 }, new: { ms: 0, none: 0, wrong: 0, extra: 0, clr: [], len: 0 } };
let cross = 0;
for (const [a, b] of pairs) {
  const A = { f: a.f, x: a.x, z: a.z }, B = { f: b.f, x: b.x, z: b.z };
  const best = a.f !== b.f ? bestSingle(a, b) : null; if (best !== null) cross++;
  for (const [k, plan] of [['old', m.planRoute], ['new', pg.planRoute]]) {
    const t0 = performance.now(), legs = plan(A, B); S[k].ms += performance.now() - t0;
    if (!legs) { S[k].none++; continue; }
    const L = legsLen(legs); S[k].len += L;
    if (best !== null) { const ex = L - best; if (ex > 5) { S[k].wrong++; } S[k].extra = Math.max(S[k].extra, ex); }
    S[k].clr.push(...clearance(legs));
  }
}
const sum = (o) => { const c = o.clr.slice().sort((x, y) => x - y); return { msPerRoute: +(o.ms / pairs.length).toFixed(1), noRoute: o.none, wrongStair: o.wrong, maxExtraVsBestStair_m: +o.extra.toFixed(1),
  totalLen_m: Math.round(o.len), clearMean_m: +(c.reduce((s, v) => s + v, 0) / c.length).toFixed(3), clearP05_m: +c[Math.floor(c.length * 0.05)].toFixed(3), under05_pct: +(c.filter(v => v < 0.5).length / c.length * 100).toFixed(1) }; };
// 轉乘：拿掉 S3、S4（唯二貫通 B1～4F 的樓梯）→ 1F→4F 需要 S1/S2(到3F) 再…（若資料無法轉乘則報告）
const m2 = buildModel(D); const keep = m2.STAIRS.filter(s => !['S3', 'S4'].includes(s.id)); m2.STAIRS.length = 0; keep.forEach(s => m2.STAIRS.push(s));
const pg2 = createPathGrid(m2), g = m2.PLACES.find(p => p.name === '校門'), t3 = m2.ROOMS.find(r => r.f === 2 && !r.solid);
const legs2 = pg2.planRoute({ f: 0, x: g.x, z: g.z }, { f: t3.f, x: t3.x, z: t3.z });
// 人造轉乘案例：只留 S1（1F–3F 的上半段改由 S2 負責）→ 把 S1 改成只到 2F、S2 只從 2F 起，1F→3F 必須在 2F 換梯
const m3 = buildModel(D); const s1 = m3.STAIRS.find(s => s.id === 'S1'), s2 = m3.STAIRS.find(s => s.id === 'S2');
const keep3 = [s1, s2]; m3.STAIRS.length = 0; keep3.forEach(s => m3.STAIRS.push(s)); s1.fl = [0, 1]; s2.fl = [1, 2];
const pg3 = createPathGrid(m3), legs3 = pg3.planRoute({ f: 0, x: g.x, z: g.z }, { f: t3.f, x: t3.x, z: t3.z });
const transfer = { withoutS3S4: legs2 ? legs2.map(l => l.type === 'walk' ? 'walk' + l.f : l.s.id + ':' + l.from + '→' + l.to).join(' ') : null,
  forcedTransfer: legs3 ? legs3.map(l => l.type === 'walk' ? 'walk' + l.f : l.s.id + ':' + l.from + '→' + l.to).join(' ') : null };
const res = { pairs: pairs.length, crossFloor: cross, old: sum(S.old), new: sum(S.new), transfer };
if (json) console.log(JSON.stringify(res));
else {
  console.log('導航驗收', JSON.stringify(res, null, 1));
  const n = res.new, ok = n.noRoute === 0 && n.wrongStair === 0 && n.clearMean_m >= res.old.clearMean_m && transfer.forcedTransfer && /S1:0→1.*S2:1→2/.test(transfer.forcedTransfer);
  console.log(ok ? 'NAV PASS' : 'NAV FAIL', '(門檻：全可達、選錯樓梯 0、平均淨空不低於舊版、可在 2F 轉乘)');
  process.exitCode = ok ? 0 : 1;
}
