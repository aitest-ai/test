import * as THREE from 'three';
// 軸對齊方塊批次合併：同材質的所有方塊合成一個 Mesh，降低 draw call。
// UV 以世界公尺換算（u,v = 座標 / tile），所以磚縫、板縫跨方塊也連續。
const BASE_OBC = THREE.Material.prototype.onBeforeCompile;
const isSolid = (m) => m.isMeshLambertMaterial && !m.map && !m.transparent && !m.alphaTest && !m.vertexColors && !m.polygonOffset && m.side === THREE.FrontSide
  && m.opacity === 1 && m.onBeforeCompile === BASE_OBC && !m.userData.keepSeparate;
const SOLID = {};
function solidMat(noShadow) { const k = noShadow ? 'ns' : 'c'; if (!SOLID[k]) { SOLID[k] = new THREE.MeshLambertMaterial({ vertexColors: true }); SOLID[k].name = noShadow ? 'solidVC_noShadow' : 'solidVC';
  if (noShadow) SOLID[k].userData.noShadow = true; } return SOLID[k]; }
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
  // 任意平面四邊形（斜坡、斜屋簷）：a→b→c→d 逆時針（從正面看）；兩面都加（背面反向），UV 依法線投影到世界公尺。
  // 仍是「每面 4 個獨立頂點」的矩形，lightmap.js 的配島邏輯照樣適用（需為矩形）。
  quad(mat, a, b, c, d, twoSided = true) {
    const g = this._g(mat), e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
    let n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]]; const l = Math.hypot(...n) || 1; n = n.map(v => v / l);
    const ax = Math.abs(n[0]) > Math.abs(n[1]) && Math.abs(n[0]) > Math.abs(n[2]) ? 0 : Math.abs(n[1]) > Math.abs(n[2]) ? 1 : 2;
    const uv = v => ax === 0 ? [v[2], v[1]] : ax === 1 ? [v[0], v[2]] : [v[0], v[1]];
    const put = (vs, nn) => { const base = g.p.length / 3; for (const v of vs) { g.p.push(...v); g.n.push(...nn); g.u.push(...uv(v)); } g.i.push(base, base + 1, base + 2, base, base + 2, base + 3); };
    put([a, b, c, d], n); if (twoSided) put([a, d, c, b], n.map(v => -v));
  }
  flush(parent, name) {
    // 第三輪 F（draw call 收斂）：同一批次裡「純色、不透明、沒有自訂 shader」的 Lambert 材質（窗框灰、綠欄杆、屋頂、飾帶、課桌椅…）
    // 合併成一個頂點色網格（共用 SOLID 材質，顏色寫進頂點）；投影與不投影（userData.noShadow）各一個。外觀不變，每個群組省下 N−1 個 draw call。
    const solid = [new Map(), new Map()];
    for (const [mat, g] of [...this.m]) if (isSolid(mat)) { solid[mat.userData.noShadow ? 1 : 0].set(mat, g); this.m.delete(mat); }
    solid.forEach((bucket, ns) => { if (!bucket.size) return; const G = { p: [], n: [], u: [], i: [], c: [] };
      for (const [mat, g] of bucket) { const base = G.p.length / 3, nv = g.p.length / 3, c = mat.color;
        G.p.push(...g.p); G.n.push(...g.n); G.u.push(...g.u); for (const k of g.i) G.i.push(k + base); for (let v = 0; v < nv; v++) G.c.push(c.r, c.g, c.b); }
      this.m.set(solidMat(ns === 1), G); });
    for (const [mat, g] of this.m) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(g.p, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(g.n, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(g.u, 2));
      if (g.c) geo.setAttribute('color', new THREE.Float32BufferAttribute(g.c, 3));
      geo.setIndex(g.i);
      const mesh = new THREE.Mesh(geo, mat); mesh.name = name || ''; mesh.frustumCulled = false; mesh.userData.batch = true;   // 每個面 4 個獨立頂點的軸對齊矩形（lightmap.js 依此配 uv1）
      if (mat.transparent) mesh.renderOrder = 2;
      parent.add(mesh);
    }
    this.m.clear();
  }
}
