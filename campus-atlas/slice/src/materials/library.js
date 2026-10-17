// 材質庫：由材質 JSON（data/materials.*.json）建出 three 材質。換校＝換一份 JSON（換膜），程式不用改。
//   textures  依序產生（共用亂數序列 → 同一份 JSON 永遠產生相同紋理；個別紋理可給 seed 用自己的序列）
//   materials 物理材質（紅磚、清水混凝土、鋁框、玻璃、地磚…）：map 指向紋理，或 color；unlit 用 MeshBasic
//   roles     場景角色 → 材質 id（外牆、樓板、欄杆、各棟立面、各棟屋頂…），場景程式只認角色
//   accents   房間類型色帶
import * as THREE from 'three';
import { GENERATORS } from './generators.js';

const pm = (seed) => { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; };                       // Park–Miller
const lcg = (seed) => { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; };

export function validateSpec(spec) {
  const errs = [], mats = spec.materials || {}, texs = new Set((spec.textures || []).map(t => t.id));
  for (const t of spec.textures || []) if (!GENERATORS[t.gen]) errs.push(`紋理 ${t.id}：未知產生器 ${t.gen}`);
  for (const [id, m] of Object.entries(mats)) { if (m.map && !texs.has(m.map)) errs.push(`材質 ${id}：找不到紋理 ${m.map}`); if (!m.map && !m.color) errs.push(`材質 ${id}：需要 map 或 color`); }
  for (const [role, id] of Object.entries(spec.roles || {})) if (!mats[id]) errs.push(`角色 ${role}：找不到材質 ${id}`);
  return errs;
}

export function buildMaterials(spec) {
  const errs = validateSpec(spec); if (errs.length) throw new Error('材質 JSON 錯誤：\n' + errs.join('\n'));
  const shared = (spec.rng?.type === 'lcg' ? lcg : pm)(spec.rng?.seed ?? 7);
  const TEX = {};
  for (const t of spec.textures) {
    const c = document.createElement('canvas'); [c.width, c.height] = t.size;
    GENERATORS[t.gen](c.getContext('2d'), c.width, c.height, t.p, t.seed !== undefined ? lcg(t.seed) : shared);
    const tx = new THREE.CanvasTexture(c); tx.wrapS = tx.wrapT = THREE.RepeatWrapping; tx.anisotropy = 4; TEX[t.id] = tx;
  }
  const M = {};
  for (const [id, d] of Object.entries(spec.materials)) {
    const o = {}; if (d.map) o.map = TEX[d.map]; if (d.color) o.color = new THREE.Color(d.color);
    if (d.transparent) { o.transparent = true; o.opacity = d.opacity ?? 1; } if (d.depthWrite === false) o.depthWrite = false;
    M[id] = d.unlit ? new THREE.MeshBasicMaterial(o) : new THREE.MeshLambertMaterial(o); M[id].name = id; M[id].userData.label = d.label || id;
  }
  const roles = {}; for (const [r, id] of Object.entries(spec.roles || {})) roles[r] = M[id];
  const acc = {}; for (const [k, c] of Object.entries(spec.accents || {})) acc[k] = new THREE.MeshLambertMaterial({ color: new THREE.Color(c) });
  return Object.assign(M, { roles, acc, accentHex: { ...(spec.accents || {}) }, role: (r) => roles[r] || null, spec: { id: spec.id, school: spec.school, evidence: spec.evidence }, textures: TEX });
}
