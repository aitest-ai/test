// 小地圖：1F 用設計圖底圖、其他層用可走格著色；跟著視角旋轉；畫目前樓層的路線（與 3D 導引帶同步進度）、換樓層梯口與目的地。
const FONT = '"Noto Sans TC","PingFang TC","Microsoft JhengHei",sans-serif';

export function createMinimap(mini, { S, m, world, groundBox, planUrl }) {
  const mg = mini.getContext('2d'), { NL, levelLabel } = m; const miniFloor = []; let planImg = null;
  { const im = new Image(); im.onload = () => { planImg = im; }; im.src = planUrl; }
  for (let f = 1; f < NL; f++) { const c = document.createElement('canvas'); c.width = m.GW; c.height = m.GH; const g = c.getContext('2d'), id = g.createImageData(m.GW, m.GH), n = m.NAV[f], rc = m.RC[f];
    for (let k = 0; k < m.GW * m.GH; k++) { let r = 0, gg = 0, b = 0, a = 0; if (n[k] && rc[k] < 0) { r = 216; gg = 212; b = 202; a = 255; } else if (rc[k] >= 0) { r = 244; gg = 240; b = 230; a = 255; if (!n[k]) { r = 70; gg = 76; b = 84; } }
      id.data[k * 4] = r; id.data[k * 4 + 1] = gg; id.data[k * 4 + 2] = b; id.data[k * 4 + 3] = a; } g.putImageData(id, 0, 0); miniFloor[f] = c; }

  function draw() {
    const w = mini.width, h = mini.height, ppm = w / 70, f = world.floorOfY(S.y + 0.1);
    mg.setTransform(1, 0, 0, 1, 0, 0); mg.clearRect(0, 0, w, h); mg.fillStyle = '#2b2f33'; mg.fillRect(0, 0, w, h);
    const rot = -Math.PI / 2 - Math.atan2(Math.cos(S.yaw), Math.sin(S.yaw));
    mg.save(); mg.translate(w / 2, h / 2); mg.rotate(rot); mg.scale(ppm, ppm); mg.translate(-S.x, -S.z);
    if (f === 0) { if (planImg && groundBox) mg.drawImage(planImg, groundBox.x, groundBox.z, groundBox.w, groundBox.h); mg.fillStyle = 'rgba(255,255,255,.30)'; m.BYFLOOR[0].forEach(r => mg.fillRect(r.X0, r.Z0, r.w, r.d)); }
    else if (miniFloor[f]) { mg.imageSmoothingEnabled = false; mg.drawImage(miniFloor[f], m.WX0, m.WZ0, m.GW * m.CELL, m.GH * m.CELL); }
    const rt = S.route; if (rt && rt.samples) {                // 與 3D 導引帶同一份取樣與進度：走過＝灰、剩下＝橘；只畫目前樓層
      const sm = rt.samples, fl = (q) => world.floorOfY(q.y - 0.07 + 0.1);
      mg.lineJoin = 'round'; mg.lineCap = 'round';
      const stroke = (i0, i1, color, w) => { mg.strokeStyle = color; mg.lineWidth = w; mg.beginPath(); let pen = false;
        for (let i = i0; i <= i1 && i < sm.length; i++) { const q = sm[i]; if (fl(q) !== f || q.stair) { pen = false; continue; } if (!pen) { mg.moveTo(q.x, q.z); pen = true; } else mg.lineTo(q.x, q.z); } mg.stroke(); };
      stroke(0, rt.prog, 'rgba(160,160,160,.75)', 0.7);
      mg.setLineDash([1.4, 1.0]); stroke(rt.prog, sm.length - 1, '#ff7a00', 1.0); mg.setLineDash([]);
      // 換樓層：在本層梯口標「↑3F」「↓B1」
      for (let i = Math.max(1, rt.prog); i < sm.length; i++) { const a0 = sm[i - 1], b0 = sm[i]; if (fl(a0) === f && b0.stair && !a0.stair) {
          let j = i; while (j < sm.length - 1 && sm[j].stair) j++; const nf = fl(sm[j]); if (nf === f) continue;
          mg.save(); mg.translate(a0.x, a0.z); mg.rotate(-rot); mg.fillStyle = '#ff7a00'; mg.beginPath(); mg.arc(0, 0, 2.1, 0, 7); mg.fill();
          mg.fillStyle = '#fff'; mg.font = '700 2.2px ' + FONT; mg.textAlign = 'center'; mg.textBaseline = 'middle'; mg.fillText((m.RANK(nf) > m.RANK(f) ? '↑' : '↓') + levelLabel(nf), 0, 0.1); mg.restore(); break; } }
      const t = S.selected; if (t && t.f === f) { mg.fillStyle = '#ff4d3d'; mg.beginPath(); mg.arc(t.x, t.z, 1.7, 0, 7); mg.fill(); mg.strokeStyle = '#fff'; mg.lineWidth = 0.4; mg.stroke(); } }
    mg.restore();
    const a = Math.atan2(Math.cos(S.heading), Math.sin(S.heading)) + rot;
    mg.save(); mg.translate(w / 2, h / 2); mg.rotate(a); mg.fillStyle = '#2f9cff'; mg.strokeStyle = '#fff'; mg.lineWidth = 3; mg.beginPath(); mg.moveTo(15, 0); mg.lineTo(-9, -9); mg.lineTo(-4, 0); mg.lineTo(-9, 9); mg.closePath(); mg.fill(); mg.stroke(); mg.restore();
    mg.fillStyle = 'rgba(0,0,0,.55)'; mg.fillRect(w - 62, h - 30, 58, 26); mg.fillStyle = '#fff'; mg.font = '700 20px ' + FONT; mg.textAlign = 'center'; mg.fillText(levelLabel(f), w - 33, h - 10);
  }
  return { draw };
}
