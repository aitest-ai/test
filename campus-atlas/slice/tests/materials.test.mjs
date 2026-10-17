// 材質 JSON 驗收（Node）：每份 data/materials.*.json 結構正確、角色（roles）與東新預設完全一致（換膜不會漏角色）。
import fs from 'fs';
import { validateSpec } from '../src/materials/library.js';
const dir = new URL('../data/', import.meta.url), files = fs.readdirSync(dir).filter(f => /^materials\..+\.json$/.test(f));
const base = JSON.parse(fs.readFileSync(new URL('materials.dongxin.json', dir)));
let fail = 0;
for (const f of files) {
  const s = JSON.parse(fs.readFileSync(new URL(f, dir))), errs = validateSpec(s);
  const miss = Object.keys(base.roles).filter(r => !(r in s.roles)), extra = Object.keys(s.roles).filter(r => !(r in base.roles));
  const accMiss = Object.keys(base.accents).filter(k => !(k in (s.accents || {})));
  const ok = !errs.length && !miss.length && !accMiss.length;
  if (!ok) fail++;
  console.log(ok ? 'PASS' : 'FAIL', f, `id=${s.id} 紋理 ${s.textures.length}、材質 ${Object.keys(s.materials).length}、角色 ${Object.keys(s.roles).length}`, errs.concat(miss.map(r => '缺角色 ' + r), accMiss.map(k => '缺色帶 ' + k), extra.map(r => '（多出角色 ' + r + '）')).join('；'));
}
console.log(fail ? 'MATERIALS FAIL' : 'MATERIALS PASS', files.length, 'files'); process.exitCode = fail ? 1 : 0;
