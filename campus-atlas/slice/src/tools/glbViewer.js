// 資產管線檢視頁：載入壓縮後的 glb（EXT_meshopt_compression＋KHR_texture_basisu），回報統計並提供 window.__glb 給測試。
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
THREE.ColorManagement.enabled = false;
const src = new URLSearchParams(location.search).get('src') || 'models/dongxin.glb', info = document.querySelector('#info');
const renderer = new THREE.WebGLRenderer({ canvas: document.querySelector('#c'), antialias: true }); renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
const scene = new THREE.Scene(); scene.background = new THREE.Color(0xbcd9ee);
const camera = new THREE.PerspectiveCamera(50, 1, 0.5, 2000); camera.position.set(-60, 120, 200);
const LK = Math.PI; scene.add(new THREE.AmbientLight(0xffffff, 0.32 * LK), new THREE.HemisphereLight(0xe4f2ff, 0xb7a98d, 0.6 * LK));
const sun = new THREE.DirectionalLight(0xfff0d8, 0.5 * LK); sun.position.set(-30, 60, 40); scene.add(sun);
const controls = new OrbitControls(camera, renderer.domElement); controls.target.set(70, 0, 20);
const ktx2 = new KTX2Loader().setTranscoderPath('./basis/').detectSupport(renderer);
const loader = new GLTFLoader().setKTX2Loader(ktx2).setMeshoptDecoder(MeshoptDecoder);
const resize = () => { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }; addEventListener('resize', resize); resize();
const t0 = performance.now();
window.__glb = { ready: false };
loader.load(src, (g) => {
  scene.add(g.scene); let meshes = 0, tris = 0, ktx = 0; const tex = new Set();
  g.scene.traverse(o => { if (!o.isMesh) return; meshes++; const gm = o.geometry; tris += (gm.index ? gm.index.count : gm.attributes.position.count) / 3 * (o.isInstancedMesh ? o.count : 1);
    const m = o.material; if (m.map) { tex.add(m.map); if (m.map.isCompressedTexture) ktx++; } });
  const st = { ms: Math.round(performance.now() - t0), meshes, triangles: Math.round(tris), textures: tex.size, compressedTextures: [...tex].filter(t => t.isCompressedTexture).length, extensions: g.parser.json.extensionsUsed || [] };
  Object.assign(window.__glb, st, { ready: true }); info.textContent = `${src}：${st.meshes} 網格、${st.triangles} 三角形、貼圖 ${st.textures}（KTX2 ${st.compressedTextures}）、${st.ms} ms｜${st.extensions.join(', ')}`;
}, undefined, (e) => { window.__glb.error = String(e); info.textContent = '載入失敗：' + e; });
renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, camera); });
window.__glb.view = (x, y, z, tx, ty, tz) => { camera.position.set(x, y, z); controls.target.set(tx, ty, tz); controls.update(); renderer.render(scene, camera); };
