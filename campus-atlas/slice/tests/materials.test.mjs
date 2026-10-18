// 材質 JSON 驗收（Node）：每份 data/materials.*.json 結構正確、角色（roles）與東新預設完全一致（換膜不會漏角色）、
// 圖片型紋理的圖檔存在於 assets/textures/；再用故意寫錯的 JSON 確認 validateSpec 會給出清楚的錯誤。
import fs from 'fs';
import { validateSpec, GENERATED_EVIDENCE } from '../src/materials/library.js';
const dir = new URL('../data/', import.meta.url), files = fs.readdirSync(dir).filter(f => /^materials\..+\.json$/.test(f));
const texDir = new URL('../assets/textures/', import.meta.url), exists = (src) => fs.existsSync(new URL(src, texDir));
const base = JSON.parse(fs.readFileSync(new URL('materials.dongxin.json', dir)));
let fail = 0;
for (const f of files) {
  const s = JSON.parse(fs.readFileSync(new URL(f, dir))), errs = validateSpec(s, { exists });
  const miss = Object.keys(base.roles).filter(r => !(r in s.roles)), extra = Object.keys(s.roles).filter(r => !(r in base.roles));
  const accMiss = Object.keys(base.accents).filter(k => !(k in (s.accents || {})));
  const imgs = s.textures.filter(t => t.image), kb = imgs.reduce((a, t) => a + fs.statSync(new URL(t.image.src, texDir)).size, 0) / 1024;
  const ok = !errs.length && !miss.length && !accMiss.length;
  if (!ok) fail++;
  console.log(ok ? 'PASS' : 'FAIL', f, `id=${s.id} 紋理 ${s.textures.length}（圖片 ${imgs.length}，${kb.toFixed(0)} KB）、材質 ${Object.keys(s.materials).length}、角色 ${Object.keys(s.roles).length}`, errs.concat(miss.map(r => '缺角色 ' + r), accMiss.map(k => '缺色帶 ' + k), extra.map(r => '（多出角色 ' + r + '）')).join('；'));
}
// 錯誤案例：每個都必須被擋下，且訊息含關鍵字
const clone = () => JSON.parse(JSON.stringify(base)), img = (s) => s.textures.find(t => t.image).image;
const BAD = [
  ['缺圖檔', s => { img(s).src = 'no_such.jpg'; }, '找不到圖檔'],
  ['不支援的格式', s => { img(s).src = 'brick.gif'; }, '.jpg'],
  ['repeatMeters 錯誤', s => { img(s).repeatMeters = 0; }, 'repeatMeters'],
  ['repeatMeters 長度錯誤', s => { img(s).repeatMeters = [1, 2, 3]; }, 'repeatMeters'],
  ['colorSpace 錯誤', s => { img(s).colorSpace = 'p3'; }, 'colorSpace'],
  ['缺程式化備援', s => { s.textures.find(t => t.image).gen = 'nope'; }, '程式化備援'],
  ['evidence 未註明生成材質', s => { s.evidence = '照片'; }, GENERATED_EVIDENCE],
  ['overlay 產生器錯誤', s => { const i = s.textures.find(t => t.image?.compose).image; i.compose.overlay.gen = 'nope'; }, 'overlay'],
];
for (const [name, mut, key] of BAD) { const s = clone(); mut(s); const errs = validateSpec(s, { exists });
  const ok = errs.some(e => e.includes(key)); if (!ok) fail++; console.log(ok ? 'PASS' : 'FAIL', '錯誤案例：' + name, '→', errs.join('；') || '（沒有報錯）'); }
console.log(fail ? 'MATERIALS FAIL' : 'MATERIALS PASS', files.length, 'files,', BAD.length, 'error cases'); process.exitCode = fail ? 1 : 0;
