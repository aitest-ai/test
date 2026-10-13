// 材質：全部由 Canvas 程式生成（原創紋理，無外部圖檔）。顏色取自照片語彙：紅磚、仿清水混凝土、灰框玻璃、綠色欄杆、木門。
const cv = (w, h, f) => { const c = document.createElement('canvas'); c.width = w; c.height = h; f(c.getContext('2d'), w, h); return c; };
const rnd = (() => { let s = 7; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
const tex = (c, rep = true) => { const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; return t; };
export function makeMaterials() {
  const L = (o) => new THREE.MeshLambertMaterial(o);
  const brick = tex(cv(256, 256, (g, w, h) => {            // 1 m 見方：4 皮磚 × 8 塊（半磚錯縫）
    g.fillStyle = '#c9c2b6'; g.fillRect(0, 0, w, h);
    const rh = h / 12, bw = w / 6;
    for (let r = 0; r < 12; r++) for (let c = -1; c < 7; c++) {
      const x = c * bw + (r % 2 ? bw / 2 : 0), base = 150 + rnd() * 26;
      g.fillStyle = `rgb(${base + 20},${base * 0.46},${base * 0.34})`; g.fillRect(x + 1.5, r * rh + 1.5, bw - 3, rh - 3);
    }
  }));
  const concrete = tex(cv(256, 256, (g, w, h) => {          // 仿清水混凝土：模板縫＋細孔
    g.fillStyle = '#b9b8b2'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 1800; i++) { g.fillStyle = `rgba(${90 + rnd() * 70},${90 + rnd() * 70},${88 + rnd() * 70},.10)`; g.fillRect(rnd() * w, rnd() * h, 2 + rnd() * 5, 2 + rnd() * 5); }
    g.strokeStyle = 'rgba(70,70,66,.55)'; g.lineWidth = 2; g.strokeRect(0, 0, w, h);
    g.fillStyle = 'rgba(60,60,58,.5)'; for (const x of [64, 192]) for (const y of [64, 192]) g.fillRect(x - 2, y - 2, 4, 4);
  }));
  const plaster = tex(cv(64, 64, (g, w, h) => { g.fillStyle = '#ece8df'; g.fillRect(0, 0, w, h); for (let i = 0; i < 200; i++) { g.fillStyle = `rgba(150,145,130,${rnd() * .08})`; g.fillRect(rnd() * w, rnd() * h, 2, 2); } }));
  const tile = tex(cv(128, 128, (g, w, h) => { g.fillStyle = '#cdd3c8'; g.fillRect(0, 0, w, h); g.strokeStyle = 'rgba(90,100,90,.5)'; g.lineWidth = 2; g.strokeRect(0, 0, w, h); g.beginPath(); g.moveTo(w / 2, 0); g.lineTo(w / 2, h); g.moveTo(0, h / 2); g.lineTo(w, h / 2); g.stroke(); for (let i = 0; i < 60; i++) { g.fillStyle = `rgba(80,90,80,${rnd() * .06})`; g.fillRect(rnd() * w, rnd() * h, 6, 6); } }));
  const wood = tex(cv(64, 128, (g, w, h) => { g.fillStyle = '#9a6a3f'; g.fillRect(0, 0, w, h); for (let i = 0; i < 26; i++) { g.strokeStyle = `rgba(70,40,20,${.1 + rnd() * .2})`; g.beginPath(); g.moveTo(rnd() * w, 0); g.lineTo(rnd() * w, h); g.stroke(); } }));
  const pave = tex(cv(256, 256, (g, w, h) => { g.fillStyle = '#c9c4b8'; g.fillRect(0, 0, w, h); g.strokeStyle = 'rgba(100,95,85,.55)'; g.lineWidth = 2; for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * 64, 0); g.lineTo(i * 64, h); g.moveTo(0, i * 64); g.lineTo(w, i * 64); g.stroke(); } }));
  const grass = tex(cv(128, 128, (g, w, h) => { g.fillStyle = '#86ad78'; g.fillRect(0, 0, w, h); for (let i = 0; i < 700; i++) { g.fillStyle = `rgba(${60 + rnd() * 50},${110 + rnd() * 60},${60 + rnd() * 40},.35)`; g.fillRect(rnd() * w, rnd() * h, 2, 3); } }));
  const slat = tex(cv(64, 64, (g, w, h) => { g.fillStyle = '#7d8a8c'; g.fillRect(0, 0, w, h); g.fillStyle = '#5c6a6c'; for (let y = 0; y < h; y += 8) g.fillRect(0, y + 5, w, 3); }));
  const M = {
    brick: L({ map: brick }), concrete: L({ map: concrete }), plaster: L({ map: plaster }), tile: L({ map: tile }),
    wood: L({ map: wood }), pave: L({ map: pave }), grass: L({ map: grass }), slat: L({ map: slat }),
    frame: L({ color: 0x6f7679 }), green: L({ color: 0x3f7a5a }), roof: L({ color: 0x8f9694 }), ceil: L({ color: 0xf1efe8 }),
    glass: new THREE.MeshLambertMaterial({ color: 0x9fc4d4, transparent: true, opacity: 0.28, depthWrite: false }),
    board: L({ color: 0x2f4b43 }), desk: L({ color: 0xc9a46b }), chair: L({ color: 0x3b6ea5 }), trunk: L({ color: 0x7a5a3a }), leaf: L({ color: 0x4f8a50 }),
    skin: L({ color: 0xf1c8a0 }), shirt: L({ color: 0x2f7fd0 }), pants: L({ color: 0x2c3a55 }), hair: L({ color: 0x2a211b }), bag: L({ color: 0xe0a030 }),
    route: new THREE.MeshBasicMaterial({ color: 0xffc928 }), pin: new THREE.MeshBasicMaterial({ color: 0xe5484d })
  };
  return M;
}
