import { Batch } from './batch.js';
import { STAIR } from '../model/layout.js';

// 由 layout 資料程式化生成校舍。每層一個 Group（鳥瞰時可剖開），屋頂獨立一組。
export function buildBuilding(lay, M) {
  const { W, F, FH, L, D, CD } = lay, slab = W.slab, S = STAIR, RISE = FH / 20;
  const root = new THREE.Group(); root.name = 'wing';
  const floors = [], roof = new THREE.Group(); roof.name = 'roof';
  const top = (k) => k * FH + FH - slab;                              // 該層牆頂（板下緣）

  // ----- 帶洞樓板 -----
  const holeShape = (sh) => { const p = new THREE.Path(); const h = sh.hole; p.moveTo(h.x0, h.z0); p.lineTo(h.x1, h.z0); p.lineTo(h.x1, h.z1); p.lineTo(h.x0, h.z1); p.closePath(); return p; };
  const slabMesh = (k, x0, z0, x1, z1, mat, holes) => {
    const s = new THREE.Shape(); s.moveTo(x0, z0); s.lineTo(x1, z0); s.lineTo(x1, z1); s.lineTo(x0, z1); s.closePath();
    if (holes) lay.shafts.forEach(sh => s.holes.push(holeShape(sh)));
    const g = new THREE.ExtrudeGeometry(s, { depth: slab, bevelEnabled: false }); g.rotateX(Math.PI / 2);   // 往下擠出
    return new THREE.Mesh(g, mat);
  };
  const finishMesh = (k, holes) => {
    const s = new THREE.Shape(); s.moveTo(0, 0); s.lineTo(L, 0); s.lineTo(L, -D); s.lineTo(0, -D); s.closePath();   // y=-z
    if (holes) lay.shafts.forEach(sh => { const h = sh.hole, p = new THREE.Path(); p.moveTo(h.x0, -h.z0); p.lineTo(h.x1, -h.z0); p.lineTo(h.x1, -h.z1); p.lineTo(h.x0, -h.z1); p.closePath(); s.holes.push(p); });
    const g = new THREE.ShapeGeometry(s); g.rotateX(-Math.PI / 2);
    const uv = g.attributes.uv, pos = g.attributes.position; for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / 1.2, pos.getZ(i) / 1.2);
    const m = new THREE.Mesh(g, M.tile); m.position.y = k * FH + 0.004; return m;
  };

  // ----- 牆（含開口）-----
  const solidRects = (w, yTop) => {
    const ops = w.openings.slice().sort((p, q) => p.a - q.a), out = []; let cur = w.a;
    for (const o of ops) {
      if (o.a > cur) out.push([cur, w.y0, o.a, yTop]);
      if (o.y0 > w.y0) out.push([o.a, w.y0, o.b, o.y0]);
      if (o.y1 < yTop) out.push([o.a, o.y1, o.b, yTop]);
      cur = o.b;
    }
    if (cur < w.b) out.push([cur, w.y0, w.b, yTop]);
    return out;
  };
  const wbox = (B, mat, w, a0, y0, a1, y1, t0, t1, tile = 1) => {          // 沿牆座標 a、垂直牆座標 t
    if (w.axis === 'x') B.box(mat, a0, y0, w.at + t0, a1, y1, w.at + t1, tile); else B.box(mat, w.at + t0, y0, a0, w.at + t1, y1, a1, tile);
  };
  const cladOut = { 'x@0': -1, 'z@0': -1 };                                // 磚面貼在哪一側（-1＝負向側）

  for (let k = 0; k < F; k++) {
    const g = new THREE.Group(); g.name = 'floor' + k; floors.push(g); root.add(g);
    const B = new Batch(), y0 = k * FH, yT = top(k);
    // 樓板
    if (k >= 1) { const sm = slabMesh(k, 0, 0, L, D, M.concrete, true); sm.position.y = y0; g.add(sm); }
    g.add(finishMesh(k, k >= 1));
    // 牆
    for (const w of lay.walls.filter(w => w.k === k)) {
      const t = w.t, h = t / 2;
      if (w.type === 'brick' || w.type === 'plaster') {
        const core = w.type === 'brick' ? M.plaster : M.plaster;
        for (const [a0, yy0, a1, yy1] of solidRects(w, Math.min(w.y1, yT))) wbox(B, core, w, a0, yy0, a1, yy1, -h, h, 1);
        if (w.type === 'brick') {
          const outSide = (w.axis === 'x' && w.at === 0) ? -1 : (w.axis === 'z' && w.at === 0) ? -1 : (w.axis === 'z' && w.at === L) ? 1 : 0;
          if (outSide) for (const [a0, yy0, a1, yy1] of solidRects(w, Math.min(w.y1, yT))) wbox(B, M.brick, w, a0, yy0, a1, yy1, outSide < 0 ? -h - 0.05 : h, outSide < 0 ? -h : h + 0.05, 1);
        }
        // 窗框＋玻璃
        for (const o of w.openings.filter(o => o.kind === 'window')) {
          const f = 0.06, wd = o.b - o.a;
          wbox(B, M.frame, w, o.a - 0.03, o.y0 - 0.05, o.b + 0.03, o.y0 + f, -h - 0.02, h + 0.02);
          wbox(B, M.frame, w, o.a - 0.03, o.y1 - f, o.b + 0.03, o.y1 + 0.04, -h - 0.02, h + 0.02);
          wbox(B, M.frame, w, o.a - 0.03, o.y0, o.a + f, o.y1, -h - 0.02, h + 0.02);
          wbox(B, M.frame, w, o.b - f, o.y0, o.b + 0.03, o.y1, -h - 0.02, h + 0.02);
          const n = Math.max(2, Math.round(wd / 1.1)); for (let i = 1; i < n; i++) { const c = o.a + wd * i / n; wbox(B, M.frame, w, c - 0.025, o.y0, c + 0.025, o.y1, -0.03, 0.03); }
          wbox(B, M.glass, w, o.a + f, o.y0 + f, o.b - f, o.y1 - f, -0.012, 0.012);
        }
      } else if (w.type === 'face') {
        faceWall(B, w, yT);
      } else if (w.type === 'rail') {
        railWall(B, w);
      }
    }
    // 柱（含邊梁）
    for (const c of lay.columns) B.box(M.concrete, c.x - c.s / 2, y0, c.z - c.s / 2, c.x + c.s / 2, y0 + FH, c.z + c.s / 2, 1.2);
    B.box(M.concrete, 0, yT - 0.42, D - 0.4, L, yT, D + 0.06, 1.2);          // 走廊外緣邊梁
    // 梯間
    lay.shafts.forEach(sh => { if (k < F - 1) stairs(B, sh, k); });
    // 教室內裝
    lay.rooms.filter(r => r.floor === k).forEach(r => classroom(B, r, k));
    B.flush(g, 'floor' + k);
  }

  function faceWall(B, w, yT) {
    const t = w.t, h = t / 2, y0 = w.y0;
    const bays = lay.bays;
    for (const [a, b] of bays) {
      const door = w.openings.find(o => o.a > a && o.b < b);
      const segs = door ? [[a, door.a], [door.b, b]] : [[a, b]];
      for (const [s0, s1] of segs) {
        wbox(B, M.plaster, w, s0, y0, s1, y0 + 0.85, -h, h);                         // 窗台矮牆
        wbox(B, M.glass, w, s0, y0 + 0.88, s1, y0 + 2.34, -0.01, 0.01);
        const n = Math.max(1, Math.round((s1 - s0) / 1.2));
        for (let i = 0; i <= n; i++) { const c = s0 + (s1 - s0) * i / n; wbox(B, M.frame, w, c - 0.03, y0 + 0.85, c + 0.03, y0 + 2.4, -h - 0.02, h + 0.02); }
        wbox(B, M.frame, w, s0, y0 + 0.85, s1, y0 + 0.9, -h - 0.02, h + 0.02);
      }
      wbox(B, M.frame, w, a, y0 + 2.34, b, y0 + 2.4, -h - 0.02, h + 0.02);          // 氣窗下框
      wbox(B, M.glass, w, a, y0 + 2.4, b, y0 + 2.95, -0.01, 0.01);                    // 氣窗
      wbox(B, M.slat, w, a, y0 + 2.95, b, yT, -h, h);                                  // 上方通風百葉面板
      wbox(B, M.frame, w, a, y0 + 2.92, b, y0 + 2.98, -h - 0.02, h + 0.02);
      if (door) {                                                                     // 門框、門扇（開 90°）
        wbox(B, M.frame, w, door.a - 0.05, y0, door.a, y0 + 2.34, -h - 0.03, h + 0.03);
        wbox(B, M.frame, w, door.b, y0, door.b + 0.05, y0 + 2.34, -h - 0.03, h + 0.03);
        wbox(B, M.frame, w, door.a - 0.05, y0 + 2.3, door.b + 0.05, y0 + 2.4, -h - 0.03, h + 0.03);
        B.box(M.wood, door.a - 0.05, y0, w.at - 0.04 - 0.9, door.a - 0.01, y0 + 2.25, w.at - 0.04, 1.0);
        B.box(M.frame, door.a - 0.052, y0 + 0.95, w.at - 0.3, door.a - 0.04, y0 + 1.05, w.at - 0.1, 1);
      }
    }
  }
  function railWall(B, w) {
    const T = w.t + 0.04, hh = w.y1 - w.y0, span = w.b - w.a;
    const bar = (a0, a1, y0, y1) => wbox(B, M.green, w, a0, y0, a1, y1, -T / 2, T / 2);
    bar(w.a, w.b, w.y1 - 0.05, w.y1); bar(w.a, w.b, w.y0 + 0.08, w.y0 + 0.14);
    const n = Math.floor(span / 0.13);
    for (let i = 0; i <= n; i++) { const c = w.a + span * i / n; wbox(B, M.green, w, c - 0.012, w.y0 + 0.14, c + 0.012, w.y1 - 0.05, -0.012, 0.012); }
    const np = Math.max(1, Math.round(span / 2.2));
    for (let i = 0; i <= np; i++) { const c = w.a + span * i / np; wbox(B, M.green, w, c - 0.03, w.y0, c + 0.03, w.y1, -0.03, 0.03); }
  }
  function stairs(B, sh, k) {
    const base = k * FH, solid = k === 0;
    for (let i = 1; i <= S.NST; i++) {
      const za0 = S.ZF0 - i * S.TREAD, za1 = za0 + S.TREAD, ta = base + i * RISE;
      B.box(M.concrete, sh.A[0], solid ? base : ta - 0.45, za0, sh.A[1], ta, za1, 1.2);
      B.box(M.frame, sh.A[0], ta - 0.012, za0 - 0.01, sh.A[1], ta, za0 + 0.04, 1);
      const zb0 = lay.stairInfo.ZL0 + (i - 1) * S.TREAD, zb1 = zb0 + S.TREAD, tb = base + FH / 2 + i * RISE;
      B.box(M.concrete, sh.B[0], solid ? base : tb - 0.45, zb0, sh.B[1], tb, zb1, 1.2);
      B.box(M.frame, sh.B[0], tb - 0.012, zb1 - 0.04, sh.B[1], tb, zb1 + 0.01, 1);
      // 扶手（沿牆外側，階梯狀）
      B.box(M.green, sh.A[0], ta + 0.84, za0, sh.A[0] + 0.05, ta + 0.9, za1, 1);
      B.box(M.green, sh.B[1] - 0.05, tb + 0.84, zb0, sh.B[1], tb + 0.9, zb1, 1);
      // 梯跑中分隔欄
      const dv = Math.max(ta, tb) + 0.9, dv0 = Math.min(ta, tb);
      B.box(M.plaster, sh.x0 + 2.42, base, za0, sh.x0 + 2.58, dv, za1, 1);
      B.box(M.green, sh.x0 + 2.4, dv - 0.06, za0, sh.x0 + 2.6, dv, za1, 1);
    }
    const ly = base + FH / 2;                                                  // 中間平台
    B.box(M.concrete, sh.A[0], ly - 0.3, lay.stairInfo.ZL1, sh.B[1], ly, lay.stairInfo.ZL0, 1.2);
    B.box(M.green, sh.A[0], ly + 0.84, lay.stairInfo.ZL1, sh.A[0] + 0.05, ly + 0.9, lay.stairInfo.ZL0, 1);
  }
  function classroom(B, r, k) {
    const y0 = k * FH, d = lay.desks.find(d => d.room === r.id);
    // 黑板（靠西側隔間牆）與講台
    B.box(M.board, r.x0 + 0.12, y0 + 0.95, 1.0, r.x0 + 0.16, y0 + 2.1, 7.0, 1);
    B.box(M.frame, r.x0 + 0.12, y0 + 0.9, 0.95, r.x0 + 0.17, y0 + 0.95, 7.05, 1);
    B.box(M.desk, r.x0 + 0.5, y0, 2.6, r.x0 + 1.3, y0 + 0.12, 5.4, 1);
    // 課桌椅（面向黑板）
    const colW = 0.9, rowD = 0.95;
    const nC = Math.floor((d.z1 - d.z0) / colW), nR = Math.floor((d.x1 - d.x0) / rowD);
    for (let i = 0; i < nR; i++) for (let j = 0; j < nC; j++) {
      const cx = d.x0 + 0.3 + i * rowD, cz = d.z0 + 0.45 + j * colW;
      B.box(M.desk, cx - 0.3, y0 + 0.7, cz - 0.3, cx + 0.2, y0 + 0.74, cz + 0.3, 1);
      B.box(M.frame, cx - 0.28, y0, cz - 0.28, cx - 0.24, y0 + 0.7, cz + 0.28, 1);
      B.box(M.frame, cx + 0.14, y0, cz - 0.28, cx + 0.18, y0 + 0.7, cz + 0.28, 1);
      B.box(M.chair, cx + 0.28, y0 + 0.42, cz - 0.2, cx + 0.62, y0 + 0.46, cz + 0.2, 1);
      B.box(M.chair, cx + 0.58, y0 + 0.46, cz - 0.2, cx + 0.62, y0 + 0.85, cz + 0.2, 1);
      B.box(M.frame, cx + 0.3, y0, cz - 0.02, cx + 0.34, y0 + 0.42, cz + 0.02, 1);
    }
  }

  // ----- 屋頂與雨庇（獨立 Group，鳥瞰剖開時隱藏）-----
  { const RB = new Batch(), yr = F * FH;
    const rs = slabMesh(F, -0.5, -0.5, L + 0.5, D + 0.9, M.roof, false); rs.position.y = yr; roof.add(rs);
    RB.box(M.concrete, -0.5, yr, -0.5, L + 0.5, yr + 0.35, -0.3, 1.2); RB.box(M.concrete, -0.5, yr, D + 0.7, L + 0.5, yr + 0.35, D + 0.9, 1.2);
    RB.box(M.concrete, -0.5, yr, -0.5, -0.3, yr + 0.35, D + 0.9, 1.2); RB.box(M.concrete, L + 0.3, yr, -0.5, L + 0.5, yr + 0.35, D + 0.9, 1.2);
    for (const c of lay.columns) RB.box(M.concrete, c.x - c.s / 2, yr - slab, c.z - c.s / 2, c.x + c.s / 2, yr, c.z + c.s / 2, 1.2);
    RB.flush(roof, 'roof');
    for (const sh of lay.shafts) { const t = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), M.roof); t.visible = false; roof.add(t); }
  }
  root.add(roof);
  return { root, floors, roof };
}
