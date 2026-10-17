import * as THREE from 'three';
// 場地：草地、鋪面前庭、樹、路燈。純示意，不代表東新國小實際場地。
export function buildEnvironment(lay, M) {
  const g = new THREE.Group(); const { L, D } = lay;
  const plane = (w, d, mat, x, y, z, rep) => { const geo = new THREE.PlaneGeometry(w, d); geo.rotateX(-Math.PI / 2);
    const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / rep, uv.getY(i) * d / rep);
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); g.add(m); return m; };
  plane(400, 400, M.grass, L / 2, -0.04, D / 2, 6);
  plane(L + 14, 30, M.pave, L / 2, -0.012, D + 13.5, 3);                       // 前庭
  plane(L + 14, 4, M.pave, L / 2, -0.012, -4, 3);                              // 北側步道
  const tree = (x, z, s = 1) => { const t = new THREE.Mesh(new THREE.CylinderGeometry(0.16 * s, 0.22 * s, 2.6 * s, 8), M.trunk); t.position.set(x, 1.3 * s, z); g.add(t);
    const a = new THREE.Mesh(new THREE.SphereGeometry(1.5 * s, 12, 9), M.leaf); a.position.set(x, 3.4 * s, z); a.scale.y = 0.85; g.add(a); };
  [[-9, 14], [45, 14], [-9, 30], [45, 30], [6, 38], [30, 38], [-10, -3], [46, -3], [18, -9]].forEach(([x, z], i) => tree(x, z, 0.9 + (i % 3) * 0.15));
  for (const x of [3, 33]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 4.2, 8), M.frame); p.position.set(x, 2.1, D + 7); g.add(p);
    const a = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.1, 0.28), M.frame); a.position.set(x, 4.2, D + 7); g.add(a); }
  return g;
}
