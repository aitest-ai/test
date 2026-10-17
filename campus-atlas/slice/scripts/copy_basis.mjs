// 建置前把 three 附帶的 Basis 轉碼器（KTX2Loader 需要）複製到 public/basis/
import fs from 'fs';
const src = new URL('../node_modules/three/examples/jsm/libs/basis/', import.meta.url), dst = new URL('../public/basis/', import.meta.url);
fs.mkdirSync(dst, { recursive: true });
for (const f of ['basis_transcoder.js', 'basis_transcoder.wasm']) fs.copyFileSync(new URL(f, src), new URL(f, dst));
