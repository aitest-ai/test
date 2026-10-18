// 材質庫：由材質 JSON（data/materials.*.json）建出 three 材質。換校＝換一份 JSON（換膜），程式不用改。
//   textures  依序產生（共用亂數序列 → 同一份 JSON 永遠產生相同紋理；個別紋理可給 seed 用自己的序列）
//             加上 "image" 區塊即為圖片型紋理：先用程式化版本（gen/p）當備援立即顯示，圖片載入後換上；載入失敗就一直用備援，不會白屏。
//   materials 物理材質（紅磚、清水混凝土、鋁框、玻璃、地磚…）：map 指向紋理，或 color；unlit 用 MeshBasic
//   roles     場景角色 → 材質 id（外牆、樓板、欄杆、各棟立面、各棟屋頂…），場景程式只認角色
//   accents   房間類型色帶
//
// 圖片型紋理 "image"：
//   src           圖檔名（交由 buildMaterials 的 resolve() 換成網址；本專案放 assets/textures/）
//   repeatMeters  一張貼圖在場景中代表幾公尺（數字或 [u, v]）。幾何 UV 一律以世界公尺計，所以比例固定，不隨牆面大小拉伸
//   anisotropy    各向異性過濾（預設 8）
//   colorSpace    "none"（預設）：照原始像素值取樣。本專案關閉 ColorManagement、線性輸出，程式化 Canvas 紋理也是原值取樣，
//                 兩者一致，JPEG 的顏色會原樣出現在畫面上。"srgb" 會先解碼成線性，在本專案會偏暗，只在改用色彩管理時才用
//   compose       可選：{ size:[w,h], tile:[nx,ny], overlay:{ gen, p, seed } }，先把圖片鋪 nx×ny 次到 Canvas，再疊一層程式化圖樣（模板縫、分割條）
//   color         材質上的 color 會乘在貼圖上，可用來微調亮度
import * as THREE from 'three';
import { GENERATORS } from './generators.js';

const pm = (seed) => { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; };                       // Park–Miller
const lcg = (seed) => { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; };
const IMG_EXT = /\.(jpe?g|png|webp)$/i;
export const GENERATED_EVIDENCE = '原創生成材質（示意）';

// exists(src)：可選，Node 測試傳入檢查圖檔是否存在；瀏覽器端不檢查（缺檔走備援）
export function validateSpec(spec, { exists } = {}) {
  const errs = [], mats = spec.materials || {}, texs = new Set((spec.textures || []).map(t => t.id));
  let images = 0;
  for (const t of spec.textures || []) {
    if (!GENERATORS[t.gen]) errs.push(`紋理 ${t.id}：未知產生器 ${t.gen}${t.image ? '（圖片型紋理也需要程式化備援）' : ''}`);
    const im = t.image; if (!im) continue; images++;
    const pre = `紋理 ${t.id} 的 image`;
    if (typeof im.src !== 'string' || !IMG_EXT.test(im.src)) errs.push(`${pre}.src 必須是 .jpg／.png／.webp 檔名，收到 ${JSON.stringify(im.src)}`);
    else if (exists && !exists(im.src)) errs.push(`${pre}.src 找不到圖檔 ${im.src}`);
    const rm = im.repeatMeters, rmOk = (v) => typeof v === 'number' && v > 0 && v < 100;
    if (!(rmOk(rm) || (Array.isArray(rm) && rm.length === 2 && rm.every(rmOk)))) errs.push(`${pre}.repeatMeters 必須是正數或 [u, v]（公尺），收到 ${JSON.stringify(rm)}`);
    if (im.colorSpace !== undefined && !['none', 'srgb'].includes(im.colorSpace)) errs.push(`${pre}.colorSpace 只能是 "none" 或 "srgb"`);
    if (im.anisotropy !== undefined && !(Number.isInteger(im.anisotropy) && im.anisotropy >= 1 && im.anisotropy <= 16)) errs.push(`${pre}.anisotropy 必須是 1–16 的整數`);
    if (im.compose) { const c = im.compose;
      if (!(Array.isArray(c.size) && c.size.length === 2 && Array.isArray(c.tile) && c.tile.length === 2)) errs.push(`${pre}.compose 需要 size:[w,h] 與 tile:[nx,ny]`);
      if (c.overlay && !GENERATORS[c.overlay.gen]) errs.push(`${pre}.compose.overlay：未知產生器 ${c.overlay.gen}`); }
  }
  if (images && !String(spec.evidence || '').includes(GENERATED_EVIDENCE)) errs.push(`使用圖片型紋理時，evidence 必須註明「${GENERATED_EVIDENCE}」`);
  for (const [id, m] of Object.entries(mats)) { if (m.map && !texs.has(m.map)) errs.push(`材質 ${id}：找不到紋理 ${m.map}`); if (!m.map && !m.color) errs.push(`材質 ${id}：需要 map 或 color`); }
  for (const [role, id] of Object.entries(spec.roles || {})) if (!mats[id]) errs.push(`角色 ${role}：找不到材質 ${id}`);
  return errs;
}

function loadImage(url) {
  return new Promise((ok, no) => { if (!url) return no(new Error('沒有對應的網址')); const im = new Image(); im.crossOrigin = 'anonymous';
    im.onload = () => (im.decode ? im.decode().catch(() => {}) : Promise.resolve()).then(() => ok(im)); im.onerror = () => no(new Error('載入失敗')); im.src = url; });
}
// 合成與取平均色都用 CPU 端 Canvas（willReadFrequently）：GPU 加速的 Canvas 在 drawImage／getImageData 時要和 GPU 同步，
// 首幀編譯 shader 期間會被卡住（SwiftShader 實測 2.3 s → 見紀錄）；CPU Canvas 不必等 GPU。
const cpuCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d', { willReadFrequently: true })]; };
function meanColor(src) { const [, g] = cpuCanvas(16, 16); g.drawImage(src, 0, 0, 16, 16);
  const d = g.getImageData(0, 0, 16, 16).data, s = [0, 0, 0]; for (let i = 0; i < d.length; i += 4) { s[0] += d[i]; s[1] += d[i + 1]; s[2] += d[i + 2]; } return s.map(v => v / 256 / 255); }

// 圖片載入後換上：同一個 Texture 物件（材質、shader uniform 都不用重接），先 dispose 釋放 GPU 端舊尺寸的儲存再換圖
function applyImage(tx, t, img) {
  const im = t.image; let src = img;
  if (im.compose) { const c = im.compose, [cv, g] = cpuCanvas(c.size[0], c.size[1]);
    const tw = cv.width / c.tile[0], th = cv.height / c.tile[1];
    for (let x = 0; x < c.tile[0]; x++) for (let y = 0; y < c.tile[1]; y++) g.drawImage(img, x * tw, y * th, tw, th);
    if (c.overlay) GENERATORS[c.overlay.gen](g, cv.width, cv.height, c.overlay.p || {}, lcg(c.overlay.seed ?? 1));
    src = cv; }
  const rm = Array.isArray(im.repeatMeters) ? im.repeatMeters : [im.repeatMeters, im.repeatMeters];
  tx.dispose(); tx.image = src; tx.repeat.set(1 / rm[0], 1 / rm[1]); tx.anisotropy = im.anisotropy ?? 8;
  tx.colorSpace = im.colorSpace === 'srgb' ? THREE.SRGBColorSpace : THREE.NoColorSpace; tx.needsUpdate = true;
  return meanColor(src);
}

// resolve(src)：圖檔名 → 網址（main_dx.js 用 import.meta.glob 提供）
export function buildMaterials(spec, { resolve = (s) => s } = {}) {
  const errs = validateSpec(spec); if (errs.length) throw new Error('材質 JSON 錯誤：\n' + errs.join('\n'));
  const shared = (spec.rng?.type === 'lcg' ? lcg : pm)(spec.rng?.seed ?? 7);
  const TEX = {}, status = {}, timing = {}, pending = [];
  for (const t of spec.textures) {
    const c = document.createElement('canvas'); [c.width, c.height] = t.size;
    GENERATORS[t.gen](c.getContext('2d'), c.width, c.height, t.p, t.seed !== undefined ? lcg(t.seed) : shared);
    const tx = new THREE.CanvasTexture(c); tx.wrapS = tx.wrapT = THREE.RepeatWrapping; tx.anisotropy = 4; TEX[t.id] = tx;
    if (t.image) {
      status[t.id] = 'loading'; tx.userData.image = t.image.src;
      tx.userData.ready = loadImage(resolve(t.image.src)).then(img => { const t0 = performance.now(), mean = applyImage(tx, t, img); timing[t.id] = Math.round(performance.now() - t0); status[t.id] = 'image'; return { ok: true, mean }; },
        e => { status[t.id] = 'fallback'; console.warn(`[materials] 圖片 ${t.image.src} ${e.message}，紋理 ${t.id} 改用程式化備援`); return { ok: false }; });
      pending.push(tx.userData.ready);
    }
  }
  const M = {};
  for (const [id, d] of Object.entries(spec.materials)) {
    const o = {}; if (d.map) o.map = TEX[d.map]; if (d.color) o.color = new THREE.Color(d.color);
    if (d.transparent) { o.transparent = true; o.opacity = d.opacity ?? 1; } if (d.depthWrite === false) o.depthWrite = false;
    M[id] = d.unlit ? new THREE.MeshBasicMaterial(o) : new THREE.MeshLambertMaterial(o); M[id].name = id; M[id].userData.label = d.label || id;
  }
  const roles = {}; for (const [r, id] of Object.entries(spec.roles || {})) roles[r] = M[id];
  const acc = {}; for (const [k, c] of Object.entries(spec.accents || {})) acc[k] = new THREE.MeshLambertMaterial({ color: new THREE.Color(c) });
  return Object.assign(M, { roles, acc, accentHex: { ...(spec.accents || {}) }, role: (r) => roles[r] || null, spec: { id: spec.id, school: spec.school, evidence: spec.evidence }, textures: TEX,
    textureStatus: status, textureTiming: timing, ready: Promise.all(pending) });
}
