// 程式化紋理產生器（Canvas，原創，無外部圖檔）。每個產生器只吃參數（顏色、數量、尺寸），由材質 JSON 驅動。
// 亂數：r() 由 library.js 提供（共用序列或每張紋理自己的種子），同一份 JSON 每次產生完全相同的紋理。
// 參數單位：紋理像素；一張紋理在場景中通常鋪 1 m（由幾何 UV 決定）。

export const GENERATORS = {
  // 半磚錯縫磚牆：rows 皮 × cols 塊；每塊顏色 = base + jitter·r()，各通道乘 mul 再加 add
  brick(g, w, h, p, r) {
    g.fillStyle = p.mortar; g.fillRect(0, 0, w, h);
    const rh = h / p.rows, bw = w / p.cols, ins = p.inset ?? 1.5;
    for (let row = 0; row < p.rows; row++) for (let c = -1; c < p.cols + 1; c++) {
      const x = c * bw + (row % 2 ? bw / 2 : 0), base = p.base + r() * p.jitter;
      g.fillStyle = `rgb(${base * p.mul[0] + p.add[0]},${base * p.mul[1] + p.add[1]},${base * p.mul[2] + p.add[2]})`; g.fillRect(x + ins, row * rh + ins, bw - 2 * ins, rh - 2 * ins);
    }
  },
  // 方塊面磚（半格錯縫），每塊 HSL 抖動：hsl = [h, dh, s, ds, l, dl]
  tileHsl(g, w, h, p, r) {
    g.fillStyle = p.mortar; g.fillRect(0, 0, w, h); const cs = p.cell, ins = p.inset ?? 1.5;
    for (let row = 0; row < p.rows; row++) { const off = (row % 2) * (cs / 2); for (let c = -1; c < p.cols + 1; c++) { const x = c * cs + off;
      g.fillStyle = `hsl(${p.hsl[0] + r() * p.hsl[1]},${p.hsl[2] + r() * p.hsl[3]}%,${p.hsl[4] + r() * p.hsl[5]}%)`; g.fillRect(x + ins, row * cs + ins, cs - 2 * ins, cs - 2 * ins); } }
  },
  // 仿清水混凝土：細孔斑點＋模板縫＋繫結孔
  concrete(g, w, h, p, r) {
    g.fillStyle = p.bg; g.fillRect(0, 0, w, h);
    const [r0, g0, b0] = p.speckBase, sr = p.speckRange;
    for (let i = 0; i < p.specks; i++) { g.fillStyle = `rgba(${r0 + r() * sr},${g0 + r() * sr},${b0 + r() * sr},${p.speckAlpha})`; g.fillRect(r() * w, r() * h, 2 + r() * 5, 2 + r() * 5); }
    g.strokeStyle = p.seam; g.lineWidth = 2; g.strokeRect(0, 0, w, h);
    g.fillStyle = p.tie; for (const x of p.ties) for (const y of p.ties) g.fillRect(x - 2, y - 2, 4, 4);
  },
  // 底色＋隨機斑點（粉刷、草地）：color 用 rgba 樣板，{a} 為透明度抖動、{r}{g}{b} 為顏色抖動
  speckle(g, w, h, p, r) {
    g.fillStyle = p.bg; g.fillRect(0, 0, w, h);
    for (let i = 0; i < p.count; i++) {
      if (p.rgbBase) { const [r0, g0, b0] = p.rgbBase, [dr, dg, db] = p.rgbRange; g.fillStyle = `rgba(${r0 + r() * dr},${g0 + r() * dg},${b0 + r() * db},${p.alpha})`; }
      else g.fillStyle = `rgba(${p.rgb[0]},${p.rgb[1]},${p.rgb[2]},${r() * p.alphaMax})`;
      g.fillRect(r() * w, r() * h, p.size[0], p.size[1]);
    }
  },
  // 地磚：外框＋十字縫＋污點
  floorTile(g, w, h, p, r) {
    g.fillStyle = p.bg; g.fillRect(0, 0, w, h); g.strokeStyle = p.joint; g.lineWidth = 2; g.strokeRect(0, 0, w, h);
    g.beginPath(); g.moveTo(w / 2, 0); g.lineTo(w / 2, h); g.moveTo(0, h / 2); g.lineTo(w, h / 2); g.stroke();
    for (let i = 0; i < p.stains; i++) { g.fillStyle = `rgba(${p.stain[0]},${p.stain[1]},${p.stain[2]},${r() * p.stainAlpha})`; g.fillRect(r() * w, r() * h, 6, 6); }
  },
  // 木紋：直向細線
  wood(g, w, h, p, r) {
    g.fillStyle = p.bg; g.fillRect(0, 0, w, h);
    for (let i = 0; i < p.lines; i++) { g.strokeStyle = `rgba(${p.line[0]},${p.line[1]},${p.line[2]},${p.alpha[0] + r() * p.alpha[1]})`; g.beginPath(); g.moveTo(r() * w, 0); g.lineTo(r() * w, h); g.stroke(); }
  },
  // 鋪面：等距方格縫
  grid(g, w, h, p) {
    g.fillStyle = p.bg; g.fillRect(0, 0, w, h); g.strokeStyle = p.joint; g.lineWidth = 2;
    for (let i = 0; i <= p.n; i++) { const s = i * w / p.n; g.beginPath(); g.moveTo(s, 0); g.lineTo(s, h); g.moveTo(0, s); g.lineTo(w, s); g.stroke(); }
  },
  // 百葉／橫條
  stripes(g, w, h, p) {
    g.fillStyle = p.bg; g.fillRect(0, 0, w, h); g.fillStyle = p.stripe; for (let y = 0; y < h; y += p.pitch) g.fillRect(0, y + p.offset, w, p.width);
  },
};
