// 場景層：渲染器、相機、燈光、東新校舍、標記（選取面、圖釘）與角色；以及「依樓層顯示/隱藏」。路線導引帶在 routeline.js。
import * as THREE from 'three';
import { buildDongxinScene } from '../scene.js';
import { makeMaterials } from '../../scene/materials.js';
import { makeCharacter } from '../../scene/character.js';
import { createLighting } from './lighting.js';

export function createStage(canvas, m, world, { planSoft, skin, shadows = true }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  // 維持 r128 時代的色彩管線（不做 sRGB 轉換），升級 three 後畫面不變色
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0xbcd9ee); scene.fog = new THREE.Fog(0xbcd9ee, 110, 420);
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 900);
  const lighting = createLighting(renderer, scene, skin && skin.lighting, { shadows });   // 曝光、太陽、柔和陰影（lighting.js）
  const M = makeMaterials(skin);   // skin＝材質 JSON（換膜）；未給則用東新預設
  const dx = buildDongxinScene(m, M, { planUrl: planSoft }); scene.add(dx.root);
  world.setPillars(dx.PILLARS);
  lighting.setupCasters(dx.root);

  const selPlane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0xffc928, transparent: true, opacity: 0.32, depthWrite: false })); selPlane.rotation.x = -Math.PI / 2; selPlane.visible = false; scene.add(selPlane);
  const pin = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.8, 12), M.pin); pin.rotation.x = Math.PI; pin.visible = false; scene.add(pin);
  const ch = makeCharacter(M); scene.add(ch.group); lighting.setupCasters(ch.group);

  function resize() { const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
  addEventListener('resize', resize); resize();

  // 樓層顯示：鳥瞰時剖開到所選樓層；步行時隱藏所在樓層以上的天花（CAN）；B1 只在附近或選取時顯示
  const { FG, CAN } = dx, { NF, STAIRS, RANK } = m;
  function applyFloorVisibility(S, f, inRoom) {
    const bird = S.mode === 'bird';
    let maxVis = NF - 1; if (bird) maxVis = S.viewFloor !== null ? (S.viewFloor === 4 ? -1 : S.viewFloor) : (f === 0 && !inRoom ? NF - 1 : RANK(f));
    for (let k = 0; k < NF; k++) { FG[k].visible = k <= maxVis; CAN[k].visible = k <= maxVis && !(bird && k === f); }
    const nearB1 = S.y < -0.3 || STAIRS.some(s => s.fl.includes(4) && Math.hypot(s.cx - S.x, s.cz - S.z) < 14);
    const showB1 = bird ? (S.viewFloor === 4 || (S.viewFloor === null && f === 4)) : nearB1;
    FG[4].visible = showB1; CAN[4].visible = showB1 && !bird;
    if (dx.groundMesh) dx.groundMesh.visible = !(bird && showB1);
  }

  return { renderer, scene, camera, sun: lighting.sun, lighting, M, dx, selPlane, pin, ch, resize, applyFloorVisibility, render() { renderer.render(scene, camera); } };
}
