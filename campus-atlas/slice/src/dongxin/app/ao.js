// 環境遮蔽（AO）：把 Blender 依執行期 lightmap UV 烘焙的 AO 圖（assets/ao/，scripts/blender/bake_uv1.py）套回即時場景。
//   靜態批次網格：aoMap＝主圖集，取 uv1（channel 1）。
//   地面：地面 AO 與底圖用同一組 UV，載入時在 CPU Canvas 上直接乘進底圖（每像素不多取一次貼圖；
//   原本用 aoMap 時 SwiftShader 出生點視角慢約兩成，見紀錄）。
//   MeshLambert 的 aoMap 只壓暗間接光（環境光＋半球光），日光與陰影不受影響。
//   開場先掛 1×1 白色貼圖（shader 一開始就編好 aoMap 版本），圖片載入後同一個 Texture 換圖，不會再重編 shader。
//   自動降級：連續 3 秒低於 20 FPS 就拿掉 AO（重編一次 shader）。計時與 lighting 的關陰影（< 30 FPS、3 秒）同時起算，
//   很慢的裝置兩者會在同一幀觸發，只卡一次；中等裝置只關陰影、保留 AO。網址 ?degrade=0 停用（量測用）。
//   幾何簽章（lightmap.js）與烘焙時不同 → 不套用並警告（場景改了但沒重烘，套上會錯位）。網址 ?ao=0 關閉。
import * as THREE from 'three';
import META from '../../../assets/ao/ao.json';
import { lightmapTargets } from '../lightmap.js';

const URLS = import.meta.glob('../../../assets/ao/*.jpg', { eager: true, query: '?url', import: 'default' });
const url = (n) => URLS['../../../assets/ao/' + n + '.jpg'];

export function createAO(dx, lm, { enabled = true, intensity = 1.0, groundIntensity = 1.0 } = {}) {
  const st = { status: 'off', ms: 0 };
  const none = { watch() {}, disable() {}, setIntensity() {} };
  if (!enabled) return { ...st, ...none, ready: Promise.resolve(st) };
  if (META.signature !== lm.signature) { console.warn(`[ao] 場景幾何與 AO 烘焙不符（${lm.signature} ≠ ${META.signature}），不套用 AO；請重新執行 npm run assets:ao`); st.status = 'mismatch'; return { ...st, ...none, ready: Promise.resolve(st) }; }
  const placeholder = (channel) => { const c = document.createElement('canvas'); c.width = c.height = 1; const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 1, 1);
    const t = new THREE.Texture(c); t.channel = channel; t.flipY = false; t.format = THREE.RedFormat; t.needsUpdate = true; return t; };
  const main = placeholder(1);
  const mats = new Set(); for (const m of lightmapTargets(dx.root)) { const mt = m.material; if (mt.isMeshLambertMaterial && !mt.transparent) mats.add(mt); }
  mats.forEach(mt => { mt.aoMap = main; mt.aoMapIntensity = intensity; mt.needsUpdate = true; });
  st.status = 'loading'; st.materials = mats.size;
  const load = (t, src) => new Promise((ok, no) => { const im = new Image(); im.onload = () => (im.decode ? im.decode().catch(() => {}) : Promise.resolve()).then(() => {
      const t0 = performance.now(); t.dispose(); t.image = im; t.anisotropy = 4; t.needsUpdate = true; st.ms += performance.now() - t0; ok(); });
    im.onerror = () => no(new Error(src)); im.src = url(src); });
  const img = (src) => new Promise((ok, no) => { const im = new Image(); im.onload = () => ok(im); im.onerror = () => no(new Error(src)); im.src = url(src); });
  // 地面 AO 乘進底圖：底圖原尺寸的 CPU Canvas（willReadFrequently，不必等 GPU）→ multiply 疊上 AO（groundIntensity 以透明度調）
  const groundBake = () => dx.groundMesh ? Promise.all([dx.groundMesh.userData.planReady, img('ao_ground')]).then(([pt, ag]) => {
    const t0 = performance.now(), p = pt.image, c = document.createElement('canvas'); c.width = p.width; c.height = p.height;
    const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(p, 0, 0); g.globalCompositeOperation = 'multiply'; g.globalAlpha = groundIntensity;
    // AO 圖是 glTF 慣例（第一列＝v 0），底圖 Texture 是 flipY（第一列＝v 1）：垂直翻轉後疊上
    g.translate(0, c.height); g.scale(1, -1); g.drawImage(ag, 0, 0, c.width, c.height);
    pt.dispose(); pt.image = c; pt.needsUpdate = true; st.ms += performance.now() - t0; }) : Promise.resolve();
  const ready = Promise.all([load(main, 'ao_main'), groundBake()])
    .then(() => { if (st.status === 'loading') st.status = 'on'; return st; }, e => { st.status = 'failed'; console.warn('[ao] AO 圖載入失敗，維持無 AO：' + e.message); return st; });
  let slowT = 0;
  function disable(reason) { if (st.status === 'off' || st.status === 'degraded') return; mats.forEach(mt => { mt.aoMap = null; mt.needsUpdate = true; }); st.status = 'degraded'; console.info('[ao] ' + reason); }
  // 由主迴圈每幀呼叫（AO 圖還在載入時也計時，載入完成若已判定太慢就直接不套用）
  function watch(dt) { if (!(st.status === 'on' || st.status === 'loading') || dt <= 0) return; slowT = (1 / dt < 20) ? slowT + dt : 0; if (slowT > 3) disable('FPS 持續低於 20，已自動關閉 AO'); }
  return Object.assign(st, { ready, main, watch, disable, setIntensity(v) { mats.forEach(mt => mt.aoMapIntensity = v); } });
}
