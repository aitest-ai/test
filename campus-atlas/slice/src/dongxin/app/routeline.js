// 路線導引帶：沿路線每 0.25 m 取樣、貼合地面與梯面高度，做成一條連續的帶狀網格；帶上箭頭往前流動。
// 進度：每幀把角色投影到取樣點（只在上次位置附近搜尋，跨樓層用高度區分），走過的部分用 drawRange 隱藏。
// 小地圖與狀態列讀同一份 progress（route.samples / route.prog / route.remain），保證同步。
import * as THREE from 'three';

const STEP = 0.25, HALF_W = 0.28, LIFT = 0.07;

function arrowTexture() {   // 一格 = 1 m 長：白色 V 形箭頭，底色透明
  const c = document.createElement('canvas'); c.width = 64; c.height = 128; const g = c.getContext('2d');
  g.clearRect(0, 0, 64, 128); g.strokeStyle = '#fff'; g.lineWidth = 14; g.lineCap = 'round'; g.lineJoin = 'round';
  g.beginPath(); g.moveTo(14, 82); g.lineTo(32, 46); g.lineTo(50, 82); g.stroke();
  const t = new THREE.CanvasTexture(c); t.wrapS = THREE.ClampToEdgeWrapping; t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; return t;
}

export function createRouteLine(scene, world) {
  const tex = arrowTexture();
  const base = new THREE.MeshBasicMaterial({ color: 0xffb81c, transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const arrows = new THREE.MeshBasicMaterial({ color: 0xffffff, map: tex, transparent: true, opacity: 0.95, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  const geo = new THREE.BufferGeometry();
  const band = new THREE.Mesh(geo, base), arr = new THREE.Mesh(geo, arrows);
  band.frustumCulled = arr.frustumCulled = false; band.renderOrder = 2; arr.renderOrder = 3; band.visible = arr.visible = false;
  scene.add(band, arr);
  let route = null;

  // 取樣：沿每段等距取點，高度用 world.surfaceY 貼合（樓梯上會一階一階上升）
  function sample(rt) {
    const out = []; let s = 0, next = 0;
    for (let i = 1; i < rt.pts.length; i++) {
      const a = rt.pts[i - 1], b = rt.pts[i], len = Math.hypot(b.x - a.x, b.z - a.z); if (len < 1e-6) continue;
      for (; next <= s + len; next += STEP) { const k = (next - s) / len, x = a.x + (b.x - a.x) * k, z = a.z + (b.z - a.z) * k, yy = a.y + (b.y - a.y) * k, sy = world.surfaceY(x, z, yy + 0.2);
        out.push({ x, z, y: (sy ?? yy) + LIFT, s: next, stair: !!(a.stair || b.stair) }); }
      s += len;
    }
    const last = rt.pts[rt.pts.length - 1], ly = world.surfaceY(last.x, last.z, last.y + 0.2) ?? last.y;
    if (!out.length || s - out[out.length - 1].s > 0.02) out.push({ x: last.x, z: last.z, y: ly + LIFT, s, stair: false });
    return out;
  }
  function build(sm) {
    const n = sm.length, pos = new Float32Array(n * 2 * 3), uv = new Float32Array(n * 2 * 2), idx = [];
    for (let i = 0; i < n; i++) {
      const p = sm[i], a = sm[Math.max(0, i - 1)], b = sm[Math.min(n - 1, i + 1)];
      let tx = b.x - a.x, tz = b.z - a.z; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
      const nx = -tz * HALF_W, nz = tx * HALF_W;
      pos.set([p.x + nx, p.y, p.z + nz, p.x - nx, p.y, p.z - nz], i * 6);
      uv.set([0, p.s, 1, p.s], i * 4);
      if (i < n - 1) idx.push(i * 2, i * 2 + 2, i * 2 + 1, i * 2 + 1, i * 2 + 2, i * 2 + 3);   // 逆時針（由上往下看），法線朝上
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); geo.setIndex(idx);
    geo.computeBoundingSphere(); geo.setDrawRange(0, idx.length);
  }

  return {
    set(rt) { route = rt; rt.samples = sample(rt); rt.prog = 0; rt.total = rt.samples[rt.samples.length - 1].s; rt.remain = rt.total; build(rt.samples); band.visible = arr.visible = true; },
    clear() { route = null; band.visible = arr.visible = false; },
    // 每幀：更新進度、隱藏走過的部分、箭頭往前流動
    update(S, dt) {
      if (!route) return;
      const sm = route.samples; let best = route.prog, bd = Infinity;
      for (let i = Math.max(0, route.prog - 8); i < Math.min(sm.length, route.prog + 60); i++) {
        const q = sm[i], d = Math.hypot(q.x - S.x, q.z - S.z) + Math.abs(q.y - LIFT - S.y) * 3; if (d < bd) { bd = d; best = i; } }
      if (bd < 2.5) route.prog = Math.max(route.prog, best);          // 偏離路線太遠時不更新（例如手動走開）
      route.remain = Math.max(0, route.total - sm[route.prog].s);
      const start = Math.max(0, route.prog - 1) * 6; geo.setDrawRange(start, Math.max(0, (sm.length - 1) * 6 - start));
      tex.offset.y -= dt * 1.6;
    },
  };
}
