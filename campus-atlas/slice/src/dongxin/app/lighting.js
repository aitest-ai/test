// 燈光與陰影：統一曝光（單一曝光係數；可選色調映射）、太陽柔和陰影（跟著角色的正交陰影相機）、地面陰影接收層。
// 參數集中在 DEFAULTS；材質 JSON（換膜）可帶 "lighting" 覆寫；網址 ?shadows=0 關陰影。
// 自動降級：連續 3 秒低於 30 FPS 就關陰影（手機／內顯不會因此卡頓）。
import * as THREE from 'three';

export const DEFAULTS = {
  // 曝光：本專案維持線性輸出（與 r128 版一致），色調映射會把不受光的天空／地面一起壓暗，所以預設不用；
  // exposure 是統一乘在所有燈上的單一係數。陰影處亮度 ≈ 環境光＋半球光（接近舊版），受光處再加日光。
  toneMapping: 'none', exposure: 1.0,
  ambient: 0.32, hemi: { sky: '#e4f2ff', ground: '#b7a98d', intensity: 0.66 },
  sun: { color: '#fff0d8', intensity: 0.6, offset: [-30, 60, 40] },
  shadows: { enabled: true, mapSize: 2048, radius: 4, blurSamples: 12, extent: 42, birdExtent: 110, bias: -0.0005, normalBias: 0.04, groundOpacity: 0.28 },
};
const TONE = { none: THREE.NoToneMapping, neutral: THREE.NeutralToneMapping, aces: THREE.ACESFilmicToneMapping, agx: THREE.AgXToneMapping };
const merge = (a, b) => { const o = { ...a }; for (const k in b || {}) o[k] = (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k])) ? merge(a[k] || {}, b[k]) : b[k]; return o; };

export function createLighting(renderer, scene, override, { shadows = true } = {}) {
  const L = merge(DEFAULTS, override), LK = Math.PI * L.exposure;   // r155 起光照單位改變：×π 對齊舊亮度；再乘統一曝光
  renderer.toneMapping = TONE[L.toneMapping] ?? THREE.NoToneMapping; renderer.toneMappingExposure = 1;
  const amb = new THREE.AmbientLight(0xffffff, L.ambient * LK), hemi = new THREE.HemisphereLight(new THREE.Color(L.hemi.sky), new THREE.Color(L.hemi.ground), L.hemi.intensity * LK);
  const sun = new THREE.DirectionalLight(new THREE.Color(L.sun.color), L.sun.intensity * LK); sun.position.set(...L.sun.offset);
  scene.add(amb, hemi, sun, sun.target);
  const S = L.shadows; let on = !!(S.enabled && shadows);
  renderer.shadowMap.enabled = on; renderer.shadowMap.type = THREE.PCFShadowMap;
  sun.castShadow = on; sun.shadow.mapSize.set(S.mapSize, S.mapSize); sun.shadow.radius = S.radius; sun.shadow.blurSamples = S.blurSamples;
  sun.shadow.bias = S.bias; sun.shadow.normalBias = S.normalBias;
  const cam = sun.shadow.camera; cam.near = 1; cam.far = 260;
  // 地面陰影接收層：1F 地面是 unlit 底圖（不受光），疊一層只畫陰影的透明面
  const catcher = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.ShadowMaterial({ opacity: S.groundOpacity, depthWrite: false }));
  catcher.rotation.x = -Math.PI / 2; catcher.position.y = 0.02; catcher.receiveShadow = true; catcher.renderOrder = 1; catcher.visible = on; scene.add(catcher);

  // 哪些網格投影／受影：不透明、受光的材質才參與；看板（MeshBasic）、玻璃（透明）、標記不投影
  function setupCasters(root) {
    let n = 0; root.traverse(o => { if (!o.isMesh) return; const m = o.material, lit = m && !m.isMeshBasicMaterial && !m.isShadowMaterial, opaque = m && !m.transparent;
      o.castShadow = lit && opaque; o.receiveShadow = lit; if (o.castShadow) n++; }); return n; }
  let ext = 0;
  function update(S_, birdMode) {        // 每幀：陰影相機跟著角色（鳥瞰時放大範圍）；以 texel 為單位對齊，移動時陰影不閃爍
    if (!on) return; const e = birdMode ? S.birdExtent : S.extent;
    if (e !== ext) { ext = e; cam.left = cam.bottom = -e; cam.right = cam.top = e; cam.updateProjectionMatrix(); }
    const texel = (2 * e) / S.mapSize, cx = Math.round(S_.x / texel) * texel, cz = Math.round(S_.z / texel) * texel, cy = S_.y;
    sun.target.position.set(cx, cy, cz); sun.position.set(cx + L.sun.offset[0], cy + L.sun.offset[1], cz + L.sun.offset[2]);
    catcher.position.x = cx; catcher.position.z = cz;
  }
  function setShadows(v) { on = !!v; renderer.shadowMap.enabled = on; sun.castShadow = on; catcher.visible = on; scene.traverse(o => { if (o.material) o.material.needsUpdate = true; }); }
  // 自動降級：連續 3 秒平均 FPS < 30 → 關陰影（只做一次）
  let slowT = 0, degraded = false;
  function watch(dt) { if (!on || degraded || dt <= 0) return; slowT = (1 / dt < 30) ? slowT + dt : 0; if (slowT > 3) { degraded = true; setShadows(false); console.info('[lighting] FPS 持續低於 30，已自動關閉陰影'); } }
  return { sun, amb, hemi, catcher, config: L, setupCasters, update, watch, setShadows, get shadows() { return on; }, get degraded() { return degraded; } };
}
