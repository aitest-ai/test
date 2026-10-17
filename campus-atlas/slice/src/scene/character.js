import * as THREE from 'three';
// 原創低面數學生角色（圓柱＋方塊組成，無外部模型）。
export function makeCharacter(M) {
  const g = new THREE.Group(), limbs = {};
  const add = (geo, mat, x, y, z, parent = g) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; };
  const pivot = (x, y, z) => { const p = new THREE.Group(); p.position.set(x, y, z); g.add(p); return p; };
  add(new THREE.BoxGeometry(0.46, 0.56, 0.26), M.shirt, 0, 1.05, 0);
  add(new THREE.SphereGeometry(0.19, 14, 12), M.skin, 0, 1.52, 0);
  add(new THREE.SphereGeometry(0.2, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), M.hair, 0, 1.55, -0.01);
  add(new THREE.BoxGeometry(0.34, 0.42, 0.14), M.bag, 0, 1.08, -0.2);
  limbs.legL = pivot(-0.12, 0.76, 0); add(new THREE.BoxGeometry(0.17, 0.74, 0.18), M.pants, 0, -0.37, 0, limbs.legL);
  limbs.legR = pivot(0.12, 0.76, 0); add(new THREE.BoxGeometry(0.17, 0.74, 0.18), M.pants, 0, -0.37, 0, limbs.legR);
  limbs.armL = pivot(-0.3, 1.28, 0); add(new THREE.BoxGeometry(0.12, 0.55, 0.14), M.shirt, 0, -0.26, 0, limbs.armL);
  limbs.armR = pivot(0.3, 1.28, 0); add(new THREE.BoxGeometry(0.12, 0.55, 0.14), M.shirt, 0, -0.26, 0, limbs.armR);
  return { group: g, limbs };
}
