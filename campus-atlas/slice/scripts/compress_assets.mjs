// 資產壓縮管線：glb → 去重／刪除未用／合併同材質網格／量化／meshopt 幾何壓縮／貼圖轉 KTX2（toktx，Basis ETC1S＋mipmap）。
// 用法：node scripts/compress_assets.mjs <in.glb> <out.glb> [--uastc] [--no-ktx] [--no-join]
// 需要：toktx（KTX-Software 4.4.2；預設找 ~/.local/opt/ktx/bin/toktx，或環境變數 TOKTX）。報告寫到 <out>.report.json。
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, KHRTextureBasisu, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { dedup, prune, join, weld, quantize, flatten, getTextureColorSpace } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';

const [inp, out] = process.argv.slice(2).filter(a => !a.startsWith('--'));
const flag = (f) => process.argv.includes(f);
if (!inp || !out) { console.error('用法：node scripts/compress_assets.mjs <in.glb> <out.glb> [--uastc] [--no-ktx] [--no-join]'); process.exit(2); }
const TOKTX = process.env.TOKTX || path.join(os.homedir(), '.local/opt/ktx/bin/toktx');
const LIB = path.join(path.dirname(path.dirname(TOKTX)), 'lib');

await MeshoptEncoder.ready; await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(inp);
const stat = (label) => { const r = doc.getRoot(); let tris = 0, prims = 0, texBytes = 0;
  r.listMeshes().forEach(m => m.listPrimitives().forEach(p => { prims++; const idx = p.getIndices(), pos = p.getAttribute('POSITION'); tris += (idx ? idx.getCount() : pos.getCount()) / 3; }));
  r.listTextures().forEach(t => texBytes += t.getImage()?.byteLength || 0);
  return { step: label, meshes: r.listMeshes().length, primitives: prims, triangles: Math.round(tris), materials: r.listMaterials().length, textures: r.listTextures().length, textureKB: Math.round(texBytes / 1024) }; };
const report = { input: inp, inputKB: Math.round(fs.statSync(inp).size / 1024), steps: [stat('原始')] };

await doc.transform(dedup(), prune()); report.steps.push(stat('去重＋刪除未用'));
if (!flag('--no-join')) { await doc.transform(flatten(), join({ keepNamed: false }), prune()); report.steps.push(stat('合併同材質網格')); }
await doc.transform(weld(), quantize({ quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12 })); report.steps.push(stat('焊接＋量化'));

if (!flag('--no-ktx')) {
  if (!fs.existsSync(TOKTX)) { console.error('找不到 toktx：', TOKTX); process.exit(3); }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ktx-')); let n = 0, before = 0, after = 0;
  doc.createExtension(KHRTextureBasisu).setRequired(true);
  for (const tex of doc.getRoot().listTextures()) {
    const img = tex.getImage(), mime = tex.getMimeType(); if (!img || mime === 'image/ktx2') continue;
    const ext = mime === 'image/jpeg' ? '.jpg' : '.png', src = path.join(tmp, `t${n}${ext}`), dst = path.join(tmp, `t${n}.ktx2`); fs.writeFileSync(src, img);
    const srgb = getTextureColorSpace(tex) === 'srgb';
    // 本專案渲染器維持線性輸出（與 r128 相同），貼圖以原始數值取樣 → 一律標 linear，避免 sRGB 轉換讓顏色變深
    const args = ['--t2', '--genmipmap', '--assign_oetf', 'linear', '--assign_primaries', 'none', ...(flag('--uastc') ? ['--encode', 'uastc', '--uastc_quality', '2', '--zcmp', '18'] : ['--encode', 'etc1s', '--clevel', '2', '--qlevel', '160']), dst, src];
    execFileSync(TOKTX, args, { env: { ...process.env, LD_LIBRARY_PATH: LIB }, stdio: 'pipe' });
    const k = fs.readFileSync(dst); before += img.byteLength; after += k.byteLength;
    tex.setImage(new Uint8Array(k)).setMimeType('image/ktx2').setURI(tex.getURI().replace(/\.(png|jpe?g)$/i, '.ktx2')); n++;
    void srgb;
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  report.ktx2 = { textures: n, beforeKB: Math.round(before / 1024), afterKB: Math.round(after / 1024), mode: flag('--uastc') ? 'UASTC' : 'ETC1S' };
  report.steps.push(stat('貼圖轉 KTX2'));
}
doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.FILTER });
await io.write(out, doc);
report.outputKB = Math.round(fs.statSync(out).size / 1024); report.ratio = +(report.outputKB / report.inputKB).toFixed(3);
fs.writeFileSync(out + '.report.json', JSON.stringify(report, null, 1));
console.table(report.steps); console.log(`輸出 ${out}：${report.inputKB} KB → ${report.outputKB} KB（${(report.ratio * 100).toFixed(1)}%）`, report.ktx2 || '');
