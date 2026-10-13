// 軸對齊方塊批次合併：同材質的所有方塊合成一個 Mesh，降低 draw call。
// UV 以世界公尺換算（u,v = 座標 / tile），所以磚縫、板縫跨方塊也連續。
export class Batch {
  constructor() { this.m = new Map(); }
  _g(mat) { let g = this.m.get(mat); if (!g) { g = { p: [], n: [], u: [], i: [] }; this.m.set(mat, g); } return g; }
  box(mat, x0, y0, z0, x1, y1, z1, tile = 1) {
    if (x1 <= x0 || y1 <= y0 || z1 <= z0) return;
    const g = this._g(mat), T = tile;
    const face = (n, vs, uvf) => { const b = g.p.length / 3; for (const v of vs) { g.p.push(...v); g.n.push(...n); g.u.push(...uvf(v)); } g.i.push(b, b + 1, b + 2, b, b + 2, b + 3); };
    const X = [x0, x1], Y = [y0, y1], Z = [z0, z1];
    face([1, 0, 0], [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], v => [v[2] / T, v[1] / T]);
    face([-1, 0, 0], [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], v => [v[2] / T, v[1] / T]);
    face([0, 1, 0], [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]], v => [v[0] / T, v[2] / T]);
    face([0, -1, 0], [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], v => [v[0] / T, v[2] / T]);
    face([0, 0, 1], [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], v => [v[0] / T, v[1] / T]);
    face([0, 0, -1], [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], v => [v[0] / T, v[1] / T]);
  }
  flush(parent, name) {
    for (const [mat, g] of this.m) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(g.p, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(g.n, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(g.u, 2));
      geo.setIndex(g.i);
      const mesh = new THREE.Mesh(geo, mat); mesh.name = name || ''; mesh.frustumCulled = false;
      if (mat.transparent) mesh.renderOrder = 2;
      parent.add(mesh);
    }
    this.m.clear();
  }
}
