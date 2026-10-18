// Lightmap UV（uv1）：替批次合併的靜態網格（Batch：每個面 4 個獨立頂點的軸對齊矩形）配一張共用 AO 圖集的座標。
// 決定性：同一份場景每次都得到完全相同的 uv1，所以「匯出 → Blender 依 uv1 烘焙 AO → 執行期套回」不需要往返網格，
// 執行期只要重算 uv1 就能對上烘焙圖。場景幾何一改，signature 就不同，執行期會拒用舊的 AO 圖（不會貼錯位置）。
//   每個面＝一個島，島的大小＝面的實際尺寸 × 密度 d（texel/m），四周留 pad 個 texel 給烘焙邊緣外擴（避免黑縫）。
//   太小的面（短邊 < minTexels）與透明材質不配島，uv1 指到左下角保留的白色區塊（AO＝1）；沒有 uv1 的網格（實例化的柱、樹）
//   取樣值是 (0,0)，也落在白色區塊。
//   密度 d 以二分搜尋找「放得進 size² 的最大值」，用簡單的層架（shelf）排列：依高度排序、同高依原順序。

export const LM_DEFAULTS = { size: 4096, pad: 3, minTexels: 1.5, reserve: 8 };

function fnv(h, v) { h ^= v & 0xffff; h = Math.imul(h, 16777619); h ^= v >>> 16; return Math.imul(h, 16777619) >>> 0; }

export function lightmapTargets(root) {
  const out = []; root.traverse(o => { if (o.isMesh && !o.isInstancedMesh && o.userData.batch && o.geometry.index) out.push(o); }); return out;
}

export function assignLightmapUV(root, opts = {}) {
  const T0 = (typeof performance !== 'undefined' ? performance : Date).now(), O = { ...LM_DEFAULTS, ...opts }, S = O.size, meshes = lightmapTargets(root);
  // 1. 收集面：quad k 的四個頂點是 index[6k], [6k+1], [6k+2], [6k+5]（Batch 的面順序 b, b+1, b+2, b, b+2, b+3）
  const faces = []; let sig = 2166136261;
  for (const m of meshes) {
    const g = m.geometry, p = g.attributes.position.array, ix = g.index.array, skip = !!(m.material.transparent || m.material.isMeshBasicMaterial);
    for (let q = 0; q < ix.length / 6; q++) {
      const v0 = ix[q * 6], v1 = ix[q * 6 + 1], v2 = ix[q * 6 + 2];
      const d = (a, b) => Math.hypot(p[a * 3] - p[b * 3], p[a * 3 + 1] - p[b * 3 + 1], p[a * 3 + 2] - p[b * 3 + 2]);
      faces.push({ m, b: v0, e1: d(v0, v1), e2: d(v1, v2), skip });
      for (let k = 0; k < 3; k++) sig = fnv(sig, Math.round(p[v0 * 3 + k] * 100) | 0);
    }
  }
  sig = fnv(sig, faces.length);
  // 2. 二分搜尋密度
  const tryPack = (d) => {
    const isl = [];
    faces.forEach((f, i) => { if (f.skip) return; let w = Math.round(f.e1 * d), h = Math.round(f.e2 * d); if (Math.min(w, h) < O.minTexels) return;
      const rot = h > w; if (rot) [w, h] = [h, w]; isl.push({ i, w, h, rot }); });
    const order = isl.slice().sort((a, b) => b.h - a.h || a.i - b.i);
    let x = O.reserve + O.pad, y = 0, shelf = O.reserve + O.pad; const P = O.pad;   // 第一層先讓出左下角保留區
    for (const s of order) { const W = s.w + 2 * P, H = s.h + 2 * P;
      if (x + W > S) { y += shelf; x = 0; shelf = 0; }
      if (y + H > S || W > S) return null;
      s.x = x + P; s.y = y + P; x += W; if (H > shelf) shelf = H; }
    return isl;
  };
  let lo = 0.25, hi = 64, best = null, bestD = 0;
  for (let it = 0; it < 20; it++) { const mid = (lo + hi) / 2, r = tryPack(mid); if (r) { best = r; bestD = mid; lo = mid; } else hi = mid; }
  if (!best) throw new Error('lightmap：圖集放不下');
  for (const v of [S, O.pad, O.reserve, Math.round(O.minTexels * 100), Math.round(bestD * 1000), best.length]) sig = fnv(sig, v);   // 排列參數也進簽章：圖集大小或密度不同也會被擋下
  // 3. 寫入 uv1（texel 座標 / S；v 由下往上，與 Blender／glTF 的 UV 一致）
  const byFace = new Map(best.map(s => [s.i, s])), white = (O.reserve / 2) / S, uvs = new Map();
  for (const m of meshes) uvs.set(m, new Float32Array(m.geometry.attributes.position.count * 2).fill(white));
  let texels = 0;
  faces.forEach((f, i) => { const s = byFace.get(i); if (!s) return; const a = uvs.get(f.m), x0 = s.x / S, y0 = s.y / S, x1 = (s.x + s.w) / S, y1 = (s.y + s.h) / S;
    // 頂點 b..b+3 對應面的 (0,0)(e1,0)(e1,e2)(0,e2)；旋轉的島把 e1 放到 v 方向
    const C = s.rot ? [[x0, y0], [x0, y1], [x1, y1], [x1, y0]] : [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
    for (let k = 0; k < 4; k++) { a[(f.b + k) * 2] = C[k][0]; a[(f.b + k) * 2 + 1] = C[k][1]; } texels += s.w * s.h; });
  for (const m of meshes) m.geometry.setAttribute('uv1', new m.geometry.attributes.uv.constructor(uvs.get(m), 2));
  return { size: S, pad: O.pad, texelsPerMeter: +bestD.toFixed(3), faces: faces.length, islands: best.length, skipped: faces.length - best.length,
    fill: +(texels / (S * S)).toFixed(3), meshes: meshes.length, signature: sig.toString(16), ms: Math.round((typeof performance !== 'undefined' ? performance : Date).now() - T0) };
}
