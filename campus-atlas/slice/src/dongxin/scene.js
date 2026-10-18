import * as THREE from 'three';
// 東新版場景工廠：把 buildModel() 的房間／走廊／樓梯／戶外資料，用 slice 的 Batch + 材質做成 3D。
// 幾何依據：使用者上傳設計圖推得的格網（房間矩形、走廊遮罩、梯間）；立面語彙（走廊側灰框玻璃隔間＋木門、綠色欄杆、圓柱）沿用 slice 的照片語彙。
// 全部屬「示意」：房間名稱暫定、尺寸為圖面推得近似值。
import { Batch } from '../scene/batch.js';
import * as BGU from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import PLANTERS from '../../data/planters.dongxin.json';

export function buildDongxinScene(m, MS, opts = {}) {
  const T = THREE, { D, SC, CELL, GW, GH, WX0, WZ0, FH, NF, NL, UP, DN, LY, RANK, ci, cj, BYFLOOR, STAIRS, NAV, RC, CORR, PLACES, STR_N, clampN, FLOOR, EDGES, CT, STAGE, SLIDE } = m;
  const clamp = clampN, RAMP = m.RAMP;
  const FONT = '"Noto Sans TC","PingFang TC","Microsoft JhengHei","Noto Sans CJK TC",sans-serif';
  const SLAB = 0.3, WALL_H = FH - SLAB, DOOR_H = 2.35, DOOR_HALF = CELL * 2;
  const ACC = MS.accentHex;   // 房間類型色帶（材質 JSON 的 accents）
  const rng = (seed) => { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; };
  const lam = (c, o) => new T.MeshLambertMaterial(Object.assign({ color: new T.Color(c) }, o || {}));
  const canvasTex = (w, h, draw, repeat) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
    const t = new T.CanvasTexture(c); t.anisotropy = 4; if (repeat) t.wrapS = t.wrapT = T.RepeatWrapping; return t; };
  const roundRect = (g, x, y, w, h, r) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); };
  const fit = (g, txt, maxW, size, weight) => { let s = size; g.font = weight + ' ' + s + 'px ' + FONT; while (g.measureText(txt).width > maxW && s > 12) { s -= 2; g.font = weight + ' ' + s + 'px ' + FONT; } return s; };
  // 門牌：畫在 (ox, oy) 起的 w×h 格（第三輪 F：所有門牌畫進同一張圖集，見 flushSigns）
  const drawSign = (g, ox, oy, w, h, name, color) => { g.save(); g.translate(ox, oy);
    g.fillStyle = color; roundRect(g, 2, 2, w - 4, h - 4, 16); g.fill(); g.strokeStyle = 'rgba(255,255,255,.6)'; g.lineWidth = 3; roundRect(g, 8, 8, w - 16, h - 16, 11); g.stroke();
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; fit(g, name, w - 36, 52, '700'); g.fillText(name, w / 2, h / 2 + 2); g.restore(); };

  // 場景角色 → 材質：全部來自材質 JSON 的 roles（換校＝換 JSON）。facade.* / roof.* 為各棟立面與屋頂。
  const M = Object.assign({}, MS.roles), R = (k) => MS.role(k);
  M.acc = MS.acc;
  const GB = { x0: 1130 * SC, x1: 1360 * SC, z: 1022 * SC };            // 校門：警衛室東側的藍色伸縮門（平面圖粉紅線處）
  const GATE = PLACES.find(p => p.name === '校門');
  const UNIT = new T.BoxGeometry(1, 1, 1), CYL = new T.CylinderGeometry(0.5, 0.5, 1, 16);
  const root = new T.Group(); root.name = 'dongxin';
  const world = root;
  const PILLARS = m.PILLARS.slice(), CAN = [], UNDER = [], FG = [];
  for (let f = 0; f < NL; f++) { const g = new T.Group(); g.name = 'F' + f; FG.push(g); root.add(g); }
  let groundMesh = null, groundBox = null;

  // 方塊批次：軸對齊 → Batch（合併、UV 以世界公尺）；旋轉 / 圓柱 → InstancedMesh
  function IB(parent) {
    const B = new Batch(), rot = new Map(), cyls = [];
    return {
      cyl(mat, dia, h, x, y, z) { cyls.push([mat, dia, h, x, y, z]); },
      quad(mat, a, b, c, d, two) { B.quad(mat, a, b, c, d, two); },
      add(mat, w, h, d, x, y, z, ry) {
        if (ry) { let a = rot.get(mat); if (!a) rot.set(mat, a = []); a.push([w, h, d, x, y, z, ry]); return; }
        B.box(mat, x - w / 2, y - h / 2, z - d / 2, x + w / 2, y + h / 2, z + d / 2, 1);
      },
      flush() {
        B.flush(parent, parent.name);
        const q = new T.Quaternion(), p = new T.Vector3(), s = new T.Vector3(), mm = new T.Matrix4(), ax = new T.Vector3(0, 1, 0);
        if (cyls.length) { const by = new Map(); cyls.forEach(c => { if (!by.has(c[0])) by.set(c[0], []); by.get(c[0]).push(c); });
          by.forEach((a, mat) => { const im = new T.InstancedMesh(CYL, mat, a.length); a.forEach((c, i) => { q.identity(); p.set(c[3], c[4], c[5]); s.set(c[1], c[2], c[1]); mm.compose(p, q, s); im.setMatrixAt(i, mm); });
            im.instanceMatrix.needsUpdate = true; im.frustumCulled = false; parent.add(im); }); }
        rot.forEach((a, mat) => { const im = new T.InstancedMesh(UNIT, mat, a.length);
          a.forEach((b, i) => { q.setFromAxisAngle(ax, b[6]); p.set(b[3], b[4], b[5]); s.set(b[0], b[1], b[2]); mm.compose(p, q, s); im.setMatrixAt(i, mm); });
          im.instanceMatrix.needsUpdate = true; im.frustumCulled = false; parent.add(im); });
      }
    };
  }

  // 圓柱（S2，照片 atrium_column_cropped / mufeng_corridor_2f）：清水混凝土、無塗裝，每約 0.25 m 一道水平模板縫（照片量測，見紀錄）（以世界高度畫線，實例化圓柱也連續）
// 第三輪 B：縫的明暗由 20% 降為 7%（雲端驗收：對比太強，像一圈一圈的環；照片 chuantang_front_cantilever 遠看幾乎看不出縫）
  const colMat = lam('#b3b4b0'); colMat.name = 'column';
  colMat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vWY;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvec4 cwp=vec4(transformed,1.0);\n#ifdef USE_INSTANCING\ncwp=instanceMatrix*cwp;\n#endif\nvWY=(modelMatrix*cwp).y;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vWY;').replace('#include <map_fragment>', '#include <map_fragment>\n{ float d=abs(fract(vWY/0.25+0.5)-0.5)*0.25, w=max(fwidth(vWY)*0.7,0.004); diffuseColor.rgb*=1.0-0.07*(1.0-smoothstep(w*0.5,w*1.5,d)); }'); };
  colMat.customProgramCacheKey = () => 'columnFormwork';
  // 走廊欄杆（S3，照片 mufeng_corridor_2f）：綠色直立扁鐵條（條寬約 3 cm、中心距約 5.6 cm，照片量測）；條佔 55%，遠處 mipmap 平均後仍高於 alphaTest，看起來近乎實板（與照片一致）＝ alphaTest 條紋貼圖，世界公尺 UV
  const railBars = (() => { const t = canvasTex(32, 8, (g, w, h) => { g.clearRect(0, 0, w, h); g.fillStyle = '#fff'; g.fillRect(0, 0, 18, h); }, true); t.repeat.set(1 / 0.056, 1);
    const mt = new T.MeshLambertMaterial({ color: M.rail.color.clone(), map: t, alphaTest: 0.5, side: T.DoubleSide }); mt.name = 'railBars'; return mt; })();
  // 穿堂彩繪（照片 chuantang_front_cantilever：2F 橋的欄板與橋下柱子以彩色幾何壁畫包覆；圖樣為示意，非原畫）
  let _mural = null, _muralCol = null;
  const muralTex = () => _mural || (_mural = (() => { const mt = canvasTex(2048, 256, (g, w, h) => { g.fillStyle = '#e9e9e4'; g.fillRect(0, 0, w, h); const cols = ['#f06b8a', '#2f8fd8', '#35b7c9', '#f3d34a', '#2b4aa8', '#8fd0a8', '#f2a1b6', '#8fa7c8'];
      const r = rng(11); for (let i = 0; i < 22; i++) { const x = i * w / 21 - 60, ww = 140 + r() * 160, hh = 80 + r() * 150; g.fillStyle = cols[(r() * cols.length) | 0]; g.beginPath(); g.moveTo(x, h); g.lineTo(x + ww / 2, h - hh); g.lineTo(x + ww, h); g.closePath(); g.fill();
        g.strokeStyle = '#fff'; g.lineWidth = 6; g.stroke(); g.fillStyle = cols[(r() * cols.length) | 0]; g.fillRect(x + ww * 0.3, h - hh * 0.45, ww * 0.4, hh * 0.2); } }); mt.shared = false; return mt; })());
  const muralCol = () => _muralCol || (_muralCol = new T.MeshLambertMaterial({ map: muralTex() }));
  // 集賢樓操場側 3F 鰭片量體（S6，照片 jixian_playground_side_finbox / finbox_underside_detail / sling_platform_canopy）：
  // 3F 整層從磚面挑出的灰色清水混凝土盒。設計圖的 3F 北牆（圖書室）原本整層比 2F／4F 往北凸出約 1.52 m；照片只有鰭片段凸出，
  // 使用者決定（2026-10-18）：只讓鰭片段（21.3 m）凸出，其餘與 2F／4F 磚面齊平 → dongxin_geo.json 的 3F 圖書室北緣改與 2F／4F 對齊（Z0 20.87），
  // 鰭片段保留原設計圖的牆線當玻璃面（凸出 1.52 m），鰭片再往外 0.35 m；盒內與圖書室相通（不進碰撞，像窗邊凸窗）。
  // 西端與穿堂西側牆線齊（照片：鰭片盒右端在穿堂出口右緣上方），寬約 21 m（約 24 片鰭片 × 0.9 m，估計）。
  const FINBOX = (() => { const lib = BYFLOOR[2] && BYFLOOR[2].find(r => r.name === '圖書室'); if (!lib || !CT) return null;
    const x0 = CT.xs[0], x1 = Math.min(lib.X1 - 0.4, x0 + 21.3), front = lib.Z0 - 1.52;
    return { x0, x1, wall: lib.Z0, front, z0: front - 0.35, z1: lib.Z0 + 0.3, y0: LY(2) - 0.75, y1: LY(3) + 0.1 }; })();
  /* ---------- 建築（自舊版移植，改用 slice 材質／Batch）---------- */
function hasAbove(r){
  const up=UP[r.f], list=up>=0?BYFLOOR[up]:[]; const area=r.w*r.d;
  const ov=o=>Math.max(0,Math.min(r.X1,o.X1)-Math.max(r.X0,o.X0))*Math.max(0,Math.min(r.Z1,o.Z1)-Math.max(r.Z0,o.Z0));
  for(const o of list) if(ov(o)>area*0.25) return true;
  for(const s of STAIRS) if(up>=0&&s.fl.includes(up)&&ov(s)>area*0.25) return true;
  return false;
}
// 集賢樓深凹窗洞立面（S4，照片 jixian_facade_3_4f / jixian_facade_courtyard / finbox_underside_detail）：
//   牆＝結構牆（厚 0.3）＋外側 0.25 m 紅磚外皮；窗洞 1.1×2.65 m（洞底離樓板 0.75 m），玻璃退在結構牆內側 → 凹深 0.45 m；
//   洞底灰色花崗石窗台（厚 0.28 m、每側寬出 0.15 m、挑出外皮 0.22 m）、洞內下段綠色欄杆（1.0 m）＋冷氣室外機（0.8×0.6 m）；
//   第三輪 B 依 jixian_facade_3_4f.jpg 畫面中央的窗重量（層高 3.9 m＝209 px）：洞寬 59 px≈1.1 m、洞高 142 px≈2.65 m、欄杆 57 px≈1.0 m、窗台厚 15 px≈0.28 m；窗洞間距不等（每層各自的亂數，上下交錯）。
//   外皮從樓板底蓋到牆頂（樓板邊不外露，與照片連續的磚面一致）；頂層外皮再高 0.35 m 當女兒牆。
const WINDOWS=[];   // 測試用：每個窗洞玻璃中心與外法線
function recessFacade(ib,sm,ax,fix,a,b,y0,wh,OUT,seed,top,skip){
  const T_=SLAB, SK=0.25, Wo=1.1, ob=0.75, ot=3.4, so=T_/2+SK, RH=1.0;
  const box=(mt,u0,u1,ya,yb,off,th)=>{ if(u1-u0<0.02||yb-ya<0.02) return; const c=(u0+u1)/2, q=fix+OUT*off; if(ax==='x') ib.add(mt,u1-u0,yb-ya,th,c,(ya+yb)/2,q); else ib.add(mt,th,yb-ya,u1-u0,q,(ya+yb)/2,c); };
  const r=rng(seed), W=[]; let u=a+0.6+r()*0.9; while(u+Wo<=b-0.6){ if(!skip||!skip(u+Wo/2)) W.push(u); u+=Wo+0.8+r()*1.4; }
  const yTop=y0+wh+(top?0.35:0), core=(u0,u1,ya,yb)=>{ box(sm,u0,u1,ya,yb,0,T_); box(M.wall,u0,u1,ya,yb,-(T_/2+0.015),0.03); };
  let p=a;
  for(const w0 of W){ const w1=w0+Wo;
    core(p,w0,y0,y0+wh); box(sm,p,w0,y0-SLAB,yTop,T_/2+SK/2,SK); p=w1;
    core(w0,w1,y0,y0+ob); core(w0,w1,y0+ot,y0+wh); box(sm,w0,w1,y0-SLAB,y0+ob,T_/2+SK/2,SK); box(sm,w0,w1,y0+ot,yTop,T_/2+SK/2,SK);
    box(M.glass,w0+0.04,w1-0.04,y0+ob,y0+ot,-0.05,0.04);
    for(const [ua,ub] of [[w0,w0+0.06],[w1-0.06,w1],[(w0+w1)/2-0.03,(w0+w1)/2+0.03]]) box(M.frame,ua,ub,y0+(ua===w0||ub===w1?ob:ob+RH+0.06),y0+ot,-0.05,0.08);
    box(M.frame,w0,w1,y0+ob+RH,y0+ob+RH+0.06,-0.05,0.08); box(M.frame,w0,w1,y0+ot-0.06,y0+ot,-0.05,0.08);
    box(M.granite,w0-0.15,w1+0.15,y0+ob-0.28,y0+ob,(so+0.22-0.05)/2,so+0.22+0.05);            // 花崗石窗台
    box(M.band,w0+0.15,w1-0.15,y0+ob,y0+ob+0.6,0.14,0.3);                                       // 冷氣室外機
    box(railBars,w0+0.03,w1-0.03,y0+ob,y0+ob+RH,so-0.04,0.03); box(M.rail,w0,w1,y0+ob+RH,y0+ob+RH+0.05,so-0.04,0.05);
    const cx=(w0+w1)/2, q=fix-OUT*0.05; WINDOWS.push(ax==='x'?{x:cx,z:q,y:y0+2.3,nx:0,nz:OUT}:{x:q,z:cx,y:y0+2.3,nx:OUT,nz:0}); }
  core(p,b,y0,y0+wh); box(sm,p,b,y0-SLAB,yTop,T_/2+SK/2,SK);
  return W.length;
}
function wallSegs(ib,r,y0,mat,accMat,door){
  const T_=SLAB, wh=WALL_H, yc=y0+wh/2, bandY=y0+wh-0.2, F_=r.stair?[0,1,2,3,4].find(f=>Math.abs(LY(f)-y0)<0.01):r.f;
  const sides=[
    {s:'N',ax:'x',a:r.X0,b:r.X1,fix:r.Z0+T_/2},{s:'S',ax:'x',a:r.X0,b:r.X1,fix:r.Z1-T_/2},
    {s:'W',ax:'z',a:r.Z0,b:r.Z1,fix:r.X0+T_/2},{s:'E',ax:'z',a:r.Z0,b:r.Z1,fix:r.X1-T_/2}];
  const OPP={N:'S',S:'N',W:'E',E:'W'};
  sides.forEach(sd=>{
    const ctWall=CT&&!r.stair&&r.f<=1&&sd.ax==='z'&&(Math.abs(sd.fix-CT.xl)<0.5||Math.abs(sd.fix-CT.xr)<0.5)&&sd.b>CT.zb&&sd.a<CT.face+0.1;   // 穿堂兩側：清水混凝土（S1）
    const IN={N:1,S:-1,W:1,E:-1}[sd.s], OUT=-IN;
    // 外牆判定：牆外 0.6 m 沿牆取樣，大多不是同層房間＝外牆（照片：集賢樓外牆全是紅磚；內隔牆維持原材質）
    const outRoom=(u)=>{ const x=sd.ax==='x'?u:sd.fix+OUT*0.6, z=sd.ax==='x'?sd.fix+OUT*0.6:u, i=ci(x), j=cj(z); return i<0||j<0||i>=GW||j>=GH?false:RC[F_][j*GW+i]>=0; };
    let nOut=0, nS=0; for(let u=sd.a+0.5;u<sd.b-0.4;u+=0.9){ nS++; if(!outRoom(u)) nOut++; } const exterior=nS>0&&nOut/nS>0.6;
    const sm=ctWall?M.conc:r.stair?R('facade.stair'):(r.ribbon?R('facade.ribbon'):r.bld==='K'?R('facade.K'):r.bld==='M'?R('facade.M'):((door&&sd.s===OPP[door.side])||exterior?R('facade.J'):R('facade.J.side')));
    const put=(a,b,y,h,m,thick)=>{ if(b-a<0.02) return; const len=b-a, c=(a+b)/2;
      if(sd.ax==='x') ib.add(m,len,h,thick,c,y,sd.fix); else ib.add(m,thick,h,len,sd.fix,y,c);
      if(m===sm&&!r.stair){ const o=sd.fix+IN*(T_/2+0.015); // 室內面：米白粉刷
        if(sd.ax==='x') ib.add(M.wall,len,h,0.03,c,y,o); else ib.add(M.wall,0.03,h,len,o,y,c); } };
    if(r.stair&&door&&!(sd.s==='S'&&door.side!=='S')){ // 梯塔：只有朝南（校門側、掛鐘）那面是實牆，其餘三面開放：走廊側完全開口，其他側只留欄杆
      const len=sd.b-sd.a, c=(sd.a+sd.b)/2, w=len, isDoor=(sd.s===door.side);
      if(sd.ax==='x'){ ib.add(M.conc,w,0.35,T_,c,y0+wh-0.17,sd.fix); ib.add(M.conc,0.35,wh,0.35,sd.a+0.17,y0+wh/2,sd.fix); ib.add(M.conc,0.35,wh,0.35,sd.b-0.17,y0+wh/2,sd.fix); }
      else { ib.add(M.conc,T_,0.35,w,sd.fix,y0+wh-0.17,c); ib.add(M.conc,0.35,wh,0.35,sd.fix,y0+wh/2,sd.a+0.17); ib.add(M.conc,0.35,wh,0.35,sd.fix,y0+wh/2,sd.b-0.17); }
      return; }
    if(!r.stair&&door&&sd.s===door.side){ corridorFace(ib,sd,r,door,y0,wh); return; }
    if(r.bld==='J'&&!r.ribbon&&!ctWall&&exterior&&r.name!=='警衛室'&&!(door&&door.side===sd.s)&&r.f<4){   // 集賢樓外牆：深凹窗洞（S4）
      const skip=(u)=>outRoom(u)||(sd.ax==='x'&&CT&&sd.s==='S'&&r.f>=2&&u>CT.x0-0.6&&u<CT.x1+0.6);
      const seed=Math.round(sd.fix*10)*31+Math.round(sd.a*10)*7+r.f*131, fb=FINBOX&&r.f===2&&sd.s==='N'&&sd.ax==='x'&&Math.abs(sd.fix-FINBOX.wall)<0.5;
      if(fb){ recessFacade(ib,sm,'x',sd.fix,sd.a,FINBOX.x0,y0,wh,OUT,seed,!hasAbove(r),skip); recessFacade(ib,sm,'x',sd.fix,FINBOX.x1,sd.b,y0,wh,OUT,seed+7,!hasAbove(r),skip); return; }   // 鰭片量體段由 buildFinBox 畫
      recessFacade(ib,sm,sd.ax,sd.fix,sd.a,sd.b,y0,wh,OUT,seed,!hasAbove(r),skip); return; }
    if((r.bld==='M'||r.bld==='K')&&exterior&&!(door&&door.side===sd.s)&&r.f<4){   // 沐風苑／蒙萌園外牆：米黃面磚上的條狀長窗（S11，照片 mengmeng_mufeng_courtyard_a/b、mufeng_facade）
      put(sd.a,sd.b,yc,wh,sm,T_); put(sd.a,sd.b,bandY,0.4,M.band,T_+0.04);
      const len=sd.b-sd.a, L2=Math.min(len-1.6,len*0.7); if(L2<1.2) return; const c2=(sd.a+sd.b)/2, ya=y0+2.0, yb=y0+2.85, nn=Math.max(2,Math.round(L2/0.65));
      const bx=(mt,u0,u1,y_,h,th)=>{ if(sd.ax==='x') ib.add(mt,u1-u0,h,th,(u0+u1)/2,y_,sd.fix); else ib.add(mt,th,h,u1-u0,sd.fix,y_,(u0+u1)/2); };
      bx(M.glass,c2-L2/2,c2+L2/2,(ya+yb)/2,yb-ya,T_+0.04);
      for(let q=0;q<=nn;q++){ const pp=c2-L2/2+q*L2/nn; bx(M.frame,pp-0.03,pp+0.03,(ya+yb)/2,yb-ya+0.06,T_+0.08); }
      bx(M.frame,c2-L2/2,c2+L2/2,ya,0.06,T_+0.08); bx(M.frame,c2-L2/2,c2+L2/2,yb,0.06,T_+0.08);
      return; }
    let gap=null; if(door&&door.side===sd.s) gap=[(sd.ax==='x'?door.x:door.z)-DOOR_HALF,(sd.ax==='x'?door.x:door.z)+DOOR_HALF];
    if(gap){
      put(sd.a,gap[0],yc,wh,sm,T_); put(gap[1],sd.b,yc,wh,sm,T_);
      put(gap[0],gap[1],y0+(DOOR_H+wh)/2,wh-DOOR_H,sm,T_);
      put(gap[0]-0.06,gap[0]+0.06,y0+DOOR_H/2,DOOR_H,accMat,T_+0.05); put(gap[1]-0.06,gap[1]+0.06,y0+DOOR_H/2,DOOR_H,accMat,T_+0.05);
      put(sd.a,gap[0],bandY,0.4,M.band,T_+0.04); put(gap[1],sd.b,bandY,0.4,M.band,T_+0.04);
    } else{ put(sd.a,sd.b,yc,wh,sm,T_); put(sd.a,sd.b,bandY,0.4,M.band,T_+0.04); }
    if(r.ribbon&&(sd.s==='S'||sd.s==='W')&&!(door&&door.side===sd.s)){ // 帶狀窗（照片：時鐘梯塔旁紅磚教室的長條連續窗）
      const L2=sd.b-sd.a-1.2, c2=(sd.a+sd.b)/2, nn=Math.max(2,Math.round(L2/1.1)), stp=L2/nn;
      for(const yy of [1.55]){ if(sd.ax==='x') ib.add(M.glass,L2,1.25,T_+0.06,c2,y0+yy,sd.fix); else ib.add(M.glass,T_+0.06,1.25,L2,sd.fix,y0+yy,c2);
        for(let q=0;q<=nn;q++){ const pp=sd.a+0.6+q*stp; if(sd.ax==='x') ib.add(M.frame,0.05,1.3,T_+0.08,pp,y0+yy,sd.fix); else ib.add(M.frame,T_+0.08,1.3,0.05,sd.fix,y0+yy,pp); }
        if(sd.ax==='x'){ ib.add(M.frame,L2,0.06,T_+0.08,c2,y0+yy-0.64,sd.fix); ib.add(M.frame,L2,0.06,T_+0.08,c2,y0+yy+0.64,sd.fix); } else { ib.add(M.frame,T_+0.08,0.06,L2,sd.fix,y0+yy-0.64,c2); ib.add(M.frame,T_+0.08,0.06,L2,sd.fix,y0+yy+0.64,c2); } }
      return; }
    // 窗：沿牆等距
    const len=sd.b-sd.a; const n=r.stair?0:Math.max(1,Math.floor((len-1.2)/2.4));
    for(let k=0;k<n;k++){ const c=sd.a+len*(k+0.5)/n, w=Math.min(1.5,len/n-0.5);
      if(gap&&c>gap[0]-w/2-0.3&&c<gap[1]+w/2+0.3) continue;
      if(sd.ax==='x') ib.add(M.glass,w,1.0,T_+0.05,c,y0+1.7,sd.fix); else ib.add(M.glass,T_+0.05,1.0,w,sd.fix,y0+1.7,c); }
  });
}
/* 教室朝走廊的那一面：灰框玻璃隔間 + 木紋門 + 上方氣窗 + 門旁木紋板（參考實景照片） */
function corridorFace(ib,sd,r,door,y0,wh){
  const ax=sd.ax, fix=sd.fix, c0=(ax==='x'?door.x:door.z), g0=c0-DOOR_HALF, g1=c0+DOOR_HALF;
  const box=(m,a,b,y,h,th)=>{ if(b-a<0.02) return; const len=b-a, c=(a+b)/2; if(ax==='x') ib.add(m,len,h,th,c,y,fix); else ib.add(m,th,h,len,fix,y,c); };
  const Y=(v)=>y0+v;
  // 底部矮牆、頂部樑
  box(M.wall,sd.a,g0,Y(0.17),0.34,0.3); box(M.wall,g1,sd.b,Y(0.17),0.34,0.3);
  box(M.band,sd.a,sd.b,Y(wh-0.2),0.4,0.34);
  const top=wh-0.4;
  const seg=(a,b,woodAt)=>{ const L=b-a; if(L<0.2) return; let ga=a, gb=b;
    if(L>2.4){ const wl=Math.min(1.6,L*0.4); if(woodAt==='hi'){ box(M.slat,b-wl,b,Y(0.34+(2.4-0.34)/2),2.4-0.34,0.12); gb=b-wl; } else { box(M.slat,a,a+wl,Y(0.34+(2.4-0.34)/2),2.4-0.34,0.12); ga=a+wl; } }
    const n=Math.max(1,Math.round((gb-ga)/1.1)), bw=(gb-ga)/n;
    for(let k=0;k<n;k++){ const p=ga+k*bw, q=p+bw;
      box(M.glass2,p,q,Y(0.34+(2.4-0.34)/2),2.4-0.34,0.05);          // 下層玻璃
      box(M.glass2,p,q,Y(2.5+(top-2.5)/2),top-2.5,0.05); }           // 上層氣窗
    for(let k=0;k<=n;k++){ const p=ga+k*bw; box(M.frame,p-0.035,p+0.035,Y(0.34+(top-0.34)/2),top-0.34,0.1); }  // 直框
    box(M.frame,ga,gb,Y(0.34),0.07,0.1); box(M.frame,ga,gb,Y(2.45),0.08,0.1); box(M.frame,ga,gb,Y(top),0.07,0.1); };
  seg(sd.a,g0,'hi'); seg(g1,sd.b,'lo');
  // 門洞：門框 + 上方氣窗 + 開啟的木紋門扇
  box(M.frame,g0-0.05,g0+0.03,Y(DOOR_H/2),DOOR_H,0.14); box(M.frame,g1-0.03,g1+0.05,Y(DOOR_H/2),DOOR_H,0.14);
  box(M.frame,g0,g1,Y(DOOR_H+0.03),0.07,0.14);
  box(M.glass2,g0,g1,Y(DOOR_H+(top-DOOR_H)/2+0.05),top-DOOR_H-0.1,0.05); box(M.frame,g0,g1,Y(top),0.07,0.1);
  { const lw=(g1-g0)-0.1, nx=door.nx, nz=door.nz;   // 門扇打開約 80 度，靠在門框一側
    if(ax==='x') ib.add(M.wood,0.05,DOOR_H-0.06,lw,g0+0.06,Y((DOOR_H-0.06)/2),fix+nz*(lw/2+0.1));
    else ib.add(M.wood,lw,DOOR_H-0.06,0.05,fix+nx*(lw/2+0.1),Y((DOOR_H-0.06)/2),g0+0.06); }
}
// 門牌（第三輪 F：draw call 收斂）：原本每塊門牌 2 個網格＋各自一張貼圖（約 190 個 draw call）；改為先收集，
// flushSigns 把所有門牌畫進同一張圖集（每格 256×96，格間留 8 px 防 mipmap 滲色），每個樓層群組合併成 1 個網格（鳥瞰剖層照樣跟著樓層顯示／隱藏）
const SIGNS=new Map();   // 群組 → [{text,col,pos:[[x,y,z,ry],...]}]
function doorSign(g,r,door,y0,text,col){
  const rot={N:Math.PI,S:0,E:Math.PI/2,W:-Math.PI/2}[door.side];
  const nx=door.nx,nz=door.nz, off=SLAB/2+0.03, pos=[1,-1].map(dir=>[door.x+nx*off*dir,y0+DOOR_H+0.62,door.z+nz*off*dir,rot+(dir<0?Math.PI:0)]);
  if(!SIGNS.has(g)) SIGNS.set(g,[]); SIGNS.get(g).push({text,col,pos});
}
function flushSigns(){
  const all=[...SIGNS.values()].flat(); if(!all.length) return;
  const CW=256, CH=96, GUT=8, cols=Math.floor(2048/(CW+GUT)), rows=Math.ceil(all.length/cols), W=cols*(CW+GUT), H=rows*(CH+GUT);
  let k=0; const cell=new Map();
  const tex=canvasTex(W,H,(g)=>{ g.clearRect(0,0,W,H); for(const s of all){ const cx=(k%cols)*(CW+GUT)+GUT/2, cy=Math.floor(k/cols)*(CH+GUT)+GUT/2; drawSign(g,cx,cy,CW,CH,s.text,s.col); cell.set(s,[cx,cy]); k++; } });
  tex.shared=false; const mat=new T.MeshBasicMaterial({map:tex,side:T.FrontSide}); mat.name='doorSigns';
  const mm=new T.Matrix4(), q=new T.Quaternion(), ax=new T.Vector3(0,1,0), one=new T.Vector3(1,1,1), p=new T.Vector3();
  SIGNS.forEach((list,g)=>{ const parts=[];
    for(const s of list){ const [cx,cy]=cell.get(s), u0=cx/W, u1=(cx+CW)/W, v1=1-cy/H, v0=1-(cy+CH)/H;
      for(const [x,y,z,ry] of s.pos){ const pg=new T.PlaneGeometry(1.7,0.64), uv=pg.attributes.uv;
        for(let i=0;i<uv.count;i++) uv.setXY(i,u0+uv.getX(i)*(u1-u0),v0+uv.getY(i)*(v1-v0));
        q.setFromAxisAngle(ax,ry); p.set(x,y,z); pg.applyMatrix4(mm.compose(p,q,one)); parts.push(pg); } }
    const mesh=new T.Mesh(BGU.mergeGeometries(parts),mat); mesh.name='doorSigns_'+g.name; g.add(mesh); });
}
const TWR = m.TOWER ? m.TOWER.s : null;   // 時鐘梯塔（最靠近校門的梯間）
// 3F→4F 轉折平台後方：米白粉刷牆＋木紋門（機房／儲藏）＋灰色消防栓箱（照片 tower_landing_3to4.jpg）
const TDET=[];   // 梯塔牆面小物（樓層數字、喇叭、標示）：[圖集格, u, v, y, 寬, 高]，最後合併成一個網格
function towerLandingWall(ib,s,f,box){ const hw=s.Lt/2, W=s.sh, yM=LY(f)+FH/2, top=LY(f+1)+FH-SLAB;
  box(M.wall,hw-0.12,hw,-W/2,W/2,yM,top); box(M.wood,hw-0.15,hw-0.12,0.15,1.15,yM,yM+2.1); box(M.frame,hw-0.16,hw-0.12,0.1,1.2,yM+2.1,yM+2.16);
  box(M.frame,hw-0.3,hw-0.12,-1.6,-0.85,yM+0.3,yM+1.3); TDET.push([7,hw-0.31,-1.225,yM+0.85,0.7,0.95,'u']); }
// 梯間（S10，照片 tower_stair_flight / tower_landing_3to4 / tower_stair_wall_1f）：雙跑折返梯，每跑 STR_N（13）階；
//   踏面灰色地磚（材質角色 step）＋踏緣兩條深色止滑條；平台鋪地磚；兩跑之間與開放側：綠色直立扁鐵條欄杆（隨梯跑斜向，高 1.0 m）＋不鏽鋼扶手；
//   實牆側（朝南的牆）：牆側不鏽鋼扶手（高 0.9 m）。開放／實牆的判定與 wallSegs 一致（只有朝南那面是實牆）。
function buildStairInterior(ib,g,s,f){
  const hs=FH/(2*STR_N), dl=s.L/STR_N, y0=LY(f), yM=y0+FH/2, W=s.sh, wlane=s.ww, hw=s.Lt/2;
  const box=(m_,ua,ub,va,vb,ya,yb)=>{ const uc=(ua+ub)/2, vc=(va+vb)/2, du=ub-ua, dv=vb-va, h=yb-ya, p=s.P(uc,vc,(ya+yb)/2);
    if(s.along==='x') ib.add(m_,du,h,dv,p.x,p.y,p.z); else ib.add(m_,dv,h,du,p.x,p.y,p.z); };
  const P=(u,v,y)=>{ const q=s.P(u,v,y); return [q.x,q.y,q.z]; };
  const railQ=(ua,va,ya,ub,vb,yb,h=1.0)=>{ ib.quad(railBars,P(ua,va,ya),P(ub,vb,yb),P(ub,vb,yb+h),P(ua,va,ya+h)); beam(ib,M.rail,P(ua,va,ya+h),P(ub,vb,yb+h),0.05); };
  const hand=(ua,va,ya,ub,vb,yb)=>beam(ib,M.frame,P(ua,va,ya+0.9),P(ub,vb,yb+0.9),0.045);
  const F1=s.fs, door=s.doors[f], comp=(vs)=>s.along==='x'?(vs<0?'N':'S'):(vs<0?'W':'E'), bEnd=s.along==='x'?(s.sgn>0?'E':'W'):(s.sgn>0?'S':'N');
  const solid=(c)=>c==='S'&&door&&door.side!=='S';
  if(DN[f]>=0&&s.fl.includes(DN[f])){ // 本層樓板：入口平台、轉折平台、下半側；下層上來的梯跑通過的開口不鋪
    const t=SLAB;
    box(M.slab,-hw,s.uA,-W/2,W/2,y0-t,y0); box(M.floor,-hw,s.uA,-W/2,W/2,y0,y0+0.012);
    box(M.slab,s.uB,hw,-W/2,W/2,y0-t,y0);
    box(M.slab,s.uA,s.uB,F1<0?-W/2:0,F1<0?0:W/2,y0-t,y0);   // 第一跑起步那一側
  }
  if(UP[f]<0||!s.fl.includes(UP[f])) return;
  const l1=F1*s.lane, v1a=l1-wlane/2, v1b=l1+wlane/2, v2a=-l1-wlane/2, v2b=-l1+wlane/2;
  // 第一跑（F1 側）：A→B 上升半層，實心踏階；踏緣（靠 A 側）兩條止滑條
  for(let k=0;k<STR_N;k++){ const ua=s.uA+k*dl, ub=ua+dl, top=y0+(k+1)*hs;
    box(M.step,ua,ub,v1a,v1b,y0,top); for(const d of [0.03,0.075]) box(M.frame,ua+d,ua+d+0.022,v1a+0.05,v1b-0.05,top,top+0.004); }
  // 轉折平台（B 端）
  box(M.slab,s.uB,hw,-W/2,W/2,yM-SLAB,yM); box(M.floor,s.uB,hw,-W/2,W/2,yM,yM+0.012);
  // 第二跑（另一側）：B→A 再上升半層，懸挑踏階（下方留空）；踏緣靠 B 側
  for(let k=0;k<STR_N;k++){ const ub=s.uB-k*dl, ua=ub-dl, top=yM+(k+1)*hs;
    box(M.step,ua,ub,v2a,v2b,top-0.28,top); for(const d of [0.03,0.075]) box(M.frame,ub-d-0.022,ub-d,v2a+0.05,v2b-0.05,top,top+0.004); }
  // 欄杆：兩跑之間（梯井兩側各一道）
  railQ(s.uA,F1*0.06,y0,s.uB,F1*0.06,yM); railQ(s.uB,-F1*0.06,yM,s.uA,-F1*0.06,y0+FH); hand(s.uA,F1*0.11,y0,s.uB,F1*0.11,yM); hand(s.uB,-F1*0.11,yM,s.uA,-F1*0.11,y0+FH);
  // 外側：開放側＝斜向欄杆＋平台段水平欄杆；實牆側＝牆側扶手
  const o1=F1*(W/2-0.05), o2=-o1, h1=F1*(W/2-0.09), h2=-h1;
  if(solid(comp(F1))) hand(s.uA,h1,y0,s.uB,h1,yM); else { railQ(s.uA,o1,y0,s.uB,o1,yM,1.1); railQ(s.uB,o1,yM,hw,o1,yM,1.1); }
  if(solid(comp(-F1))) hand(s.uB,h2,yM,s.uA,h2,y0+FH); else { railQ(s.uB,o2,yM,s.uA,o2,y0+FH,1.1); railQ(s.uB,o2,yM,hw,o2,yM,1.1); }
  if(!solid(bEnd)){ if(s===TWR&&f===2) towerLandingWall(ib,s,f,box); else railQ(hw-0.05,-W/2,yM,hw-0.05,W/2,yM,1.1); }
}
// 沐風苑／蒙萌園屋頂（S5、S11）：外牆邊加藍灰色金屬斜屋簷（沐風苑出挑 1.0 m、封邊 0.35 m；蒙萌園薄簷出挑 0.6 m）；
// 蒙萌園單層翼樓：幼兒園辦公室＝平屋頂（深灰防水層＋低女兒牆），其餘＝藍色鋼板單斜屋頂（照片 mengmeng_mufeng_courtyard_a/b；哪一翼用哪種為推定）。
const darkRoof=lam('#3d3f41');
function roofMK(ib,r,f,y0){
  const yt=y0+FH, rm=R('roof.'+r.bld)||M.roof, M_=r.bld==='M', ov=M_?1.0:0.6, fz=M_?0.35:0.15;
  const free=(x,z)=>{ const i=ci(x), j=cj(z); if(i<0||j<0||i>=GW||j>=GH) return true; const k=j*GW+i; return RC[f][k]<0&&!FLOOR[f][k]; };
  const sides=[['x',r.Z0,r.X0,r.X1,-1],['x',r.Z1,r.X0,r.X1,1],['z',r.X0,r.Z0,r.Z1,-1],['z',r.X1,r.Z0,r.Z1,1]];
  if(r.bld==='K'&&f===0){
    if(r.name==='幼兒園辦公室'){ ib.add(darkRoof,r.w-0.2,0.04,r.d-0.2,r.cx,yt+0.02,r.cz);
      for(const [ax,fx,a,b,o] of sides){ const c=(a+b)/2, L=b-a+0.2; if(ax==='x') ib.add(M.conc,L,0.45,0.2,c,yt+0.22,fx+o*0.0); else ib.add(M.conc,0.2,0.45,L,fx,yt+0.22,c); } return; }
    const alongX=r.w>=r.d, H=0.9;   // 單斜：沿長邊，一側高 H
    const P=(u,v,y)=>alongX?[u,y,v]:[v,y,u], u0=(alongX?r.X0:r.Z0)-0.4, u1=(alongX?r.X1:r.Z1)+0.4, v0=(alongX?r.Z0:r.X0)-0.5, v1=(alongX?r.Z1:r.X1)+0.5;
    ib.quad(rm,P(u0,v0,yt+0.05),P(u1,v0,yt+0.05),P(u1,v1,yt+H),P(u0,v1,yt+H));
    for(const u of [u0+0.4,u1-0.4]) ib.quad(R('facade.K'),P(u,v0+0.5,yt),P(u,v1-0.5,yt),P(u,v1-0.5,yt+H*(v1-0.5-v0)/(v1-v0)),P(u,v0+0.5,yt+0.0001));
    return; }
  for(const [ax,fx,a,b,o] of sides){ const mid=(a+b)/2, ox=ax==='x'?mid:fx+o*0.6, oz=ax==='x'?fx+o*0.6:mid; if(!free(ox,oz)) continue;
    const P=(u,off,y)=>ax==='x'?[u,y,fx+o*off]:[fx+o*off,y,u], A=a-ov, B=b+ov;
    ib.quad(rm,P(A,0,yt+0.15),P(B,0,yt+0.15),P(B,ov,yt-0.12),P(A,ov,yt-0.12));
    ib.quad(rm,P(A,ov,yt-0.12),P(B,ov,yt-0.12),P(B,ov,yt-0.12-fz),P(A,ov,yt-0.12-fz)); }
}
function buildFloors(){
  for(let f=0;f<NL;f++){
    const g=FG[f], ib=FIB[f], y0=LY(f), UPR=(f>=1&&f<=3), GARAGE=(f===4), CEIL=[];
    const rooms=BYFLOOR[f].concat(STAIRS.filter(s=>s.fl.includes(f)));
    rooms.forEach(r=>{
      const isSt=!!r.stair, tp=isSt?'t':r.t, acc=M.acc[tp]||M.acc.p;
      // 樓板／地板
      const fm=r.name==='電腦教室'?M.raised:M.floor;   // 電腦教室：白色架高地板（照片 computer_room）
      if(!isSt){ if(UPR) ib.add(M.slab,r.w+0.3,SLAB,r.d+0.3,r.cx,y0-SLAB/2,r.cz); else ib.add(fm,r.w,0.08,r.d,r.cx,y0+0.04,r.cz);
        if(UPR) ib.add(fm,r.w-0.6,0.03,r.d-0.6,r.cx,y0+0.015,r.cz); }
      else if(!(DN[f]>=0&&r.fl.includes(DN[f]))) ib.add(M.floor,r.w,0.08,r.d,r.cx,y0+0.04,r.cz);
      if(r.solid){ ib.add(M.conc,r.w,WALL_H,r.d,r.cx,y0+WALL_H/2,r.cz); if(GARAGE) CEIL.push([r.w+0.3,SLAB,r.d+0.3,r.cx,-0.3,r.cz]); }
      else{
        const door=isSt?r.doors[f]:r.door;
        wallSegs(ib,r,y0,M.wall,acc,door);
        if(!isSt&&(r.t==='c'||r.t==='s')&&r.w>4&&r.d>4){ // 教室：黑板（門對面那面牆，室內側）
          const o={N:'S',S:'N',W:'E',E:'W'}[door.side], bl=Math.min(4.8,(o==='N'||o==='S'?r.w:r.d)*0.55), t0=SLAB+0.02;
          const bx=o==='N'?r.cx:o==='S'?r.cx:(o==='W'?r.X0+t0:r.X1-t0), bz=o==='W'?r.cz:o==='E'?r.cz:(o==='N'?r.Z0+t0:r.Z1-t0);
          if(o==='N'||o==='S'){ ib.add(M.frame,bl+0.12,1.32,0.05,bx,y0+1.55,bz); ib.add(MS.board,bl,1.2,0.06,bx,y0+1.55,bz+(o==='N'?0.01:-0.01)); }
          else { ib.add(M.frame,0.05,1.32,bl+0.12,bx,y0+1.55,bz); ib.add(MS.board,0.06,1.2,bl,bx+(o==='W'?0.01:-0.01),y0+1.55,bz); } }
        if(r.desks) r.desks.forEach(dk=>{ const cx=(dk.x0+dk.x1)/2, cz=(dk.z0+dk.z1)/2, w=dk.x1-dk.x0, d=dk.z1-dk.z0;
          ib.add(MS.desk,w,0.04,d,cx,y0+0.72,cz);
          [[-1,-1],[1,-1],[-1,1],[1,1]].forEach(([a,b])=>ib.add(M.frame,0.04,0.7,0.04,cx+a*(w/2-0.05),y0+0.37,cz+b*(d/2-0.05)));
          dk.chairs.forEach(c=>{ const cd=dk.chairDir; ib.add(MS.chair,0.4,0.04,0.4,c.x,y0+0.44,c.z); ib.add(M.frame,0.06,0.42,0.06,c.x,y0+0.22,c.z);
            if(cd.x) ib.add(MS.chair,0.04,0.4,0.4,c.x+cd.x*0.19,y0+0.66,c.z); else ib.add(MS.chair,0.4,0.4,0.04,c.x,y0+0.66,c.z+cd.z*0.19); }); });
        if(!isSt&&r.name==='電腦教室'){ // 木紋貼皮高櫃（照片 computer_room）：下櫃 0.85 m＋開放層板＋上櫃到 2.3 m，沿門側以外的一面側牆（不進碰撞，比照課桌）
          const ds=door.side, alongX=(ds==='W'||ds==='E'), t0=SLAB+0.02, L=(alongX?r.w:r.d)-2.0;
          const inRoom=(x,z)=>BYFLOOR[r.f].some(o=>o!==r&&x>o.X0&&x<o.X1&&z>o.Z0&&z<o.Z1);   // 牆外是別的房間＝內牆（沒有窗），櫃子貼這面
          const lo=alongX?!inRoom(r.cx,r.Z1+0.5)||inRoom(r.cx,r.Z0-0.5):!inRoom(r.X1+0.5,r.cz)||inRoom(r.X0-0.5,r.cz);
          const put=(h,y,dep,inset)=>{ const o=t0+inset+dep/2; if(alongX) ib.add(M.veneer,L,h,dep,r.cx,y0+y,lo?r.Z0+o:r.Z1-o); else ib.add(M.veneer,dep,h,L,lo?r.X0+o:r.X1-o,y0+y,r.cz); };
          put(0.85,0.425,0.5,0); put(0.03,1.2,0.4,0); put(1.0,1.8,0.4,0); put(0.02,0.9,0.5,0);   // 下櫃、層板、上櫃、櫃面
        }
        if(isSt) buildStairInterior(ib,g,r,f);
        doorSign(g,r,door,y0,isSt?'樓梯':r.name,ACC[tp]);
      }
      // 屋頂
      const top=isSt?(UP[f]<0||!r.fl.includes(UP[f])):(!hasAbove(r)&&!GARAGE);
      if(top) ib.add(R('roof.'+r.bld)||M.roof,r.w+0.2,SLAB,r.d+0.2,r.cx,y0+FH-SLAB/2,r.cz);
      if(top&&!isSt&&(r.bld==='M'||r.bld==='K')) roofMK(ib,r,f,y0);
    });
    // 走廊樓板（上層）
    if(f>0){
      const n=FLOOR[f], rc=RC[f]; const run=new Map();
      const used=new Uint8Array(GW*GH); const rects=[];
      for(let j=0;j<GH;j++) for(let i=0;i<GW;i++){
        const k=j*GW+i; if(used[k]||!n[k]||rc[k]>=0) continue;
        let i2=i; while(i2+1<GW&&n[j*GW+i2+1]&&rc[j*GW+i2+1]<0&&!used[j*GW+i2+1]) i2++;
        let j2=j; outer: while(j2+1<GH){ for(let x=i;x<=i2;x++){ const q=(j2+1)*GW+x; if(!n[q]||rc[q]>=0||used[q]) break outer; } j2++; }
        for(let y=j;y<=j2;y++) for(let x=i;x<=i2;x++) used[y*GW+x]=1;
        rects.push([i,j,i2,j2]);
      }
      rects.forEach(([i,j,i2,j2])=>{ const w=(i2-i+1)*CELL, d=(j2-j+1)*CELL, cx=WX0+(i+(i2-i+1)/2)*CELL, cz=WZ0+(j+(j2-j+1)/2)*CELL;
        if(GARAGE) ib.add(M.garage,w+0.02,SLAB,d+0.02,cx,y0-SLAB/2,cz);
        else { ib.add(M.slab,w+0.02,SLAB,d+0.02,cx,y0-SLAB/2,cz); ib.add(M.slabTop,w,0.01,d,cx,y0-0.001,cz); }   // 樓板（底面＝下層走廊天花，粉刷）＋走廊石英磚面層
        if(GARAGE) CEIL.push([w+0.02,SLAB,d+0.02,cx,-0.3,cz]); });
    }
    // 柱子（S2）：model.js 的 PILLARS（已進碰撞），每層畫一段
    for(const p of m.PILLARS){ if(f<p.f0||f>p.f1) continue; const ya=f===p.f0?p.y0:LY(f), yb=f===p.f1?p.y1:LY(f)+FH; ib.cyl(p.kind==='ctPaint'?muralCol():colMat,p.r*2,yb-ya,p.x,(ya+yb)/2,p.z);
      if(f===0&&p.f0===0) ib.cyl(colMat,p.r*2+0.12,0.06,p.x,0.03,p.z); }   // 柱腳小圓盤
    // 走廊外緣（S3）：深邊梁（樓板下外露 0.9 m）＋ 0.25 m 矮緣（寬 0.3 m，在走廊線外側）＋ 綠色直條欄杆（總高 1.1 m）
    if(f>0&&!GARAGE) for(const e of EDGES[f]){ const len=e.b-e.a; if(len<0.1) continue; const c=(e.a+e.b)/2;
      const put=(mt,off,th,y,h,L=len,cc=c)=>{ const q=e.fix+e.out*off; if(e.ax==='x') ib.add(mt,L,h,th,cc,y,q); else ib.add(mt,th,h,L,q,y,cc); };
      put(M.conc,0.15,0.3,y0-0.9+1.15/2,1.15);
      put(railBars,0.15,0.03,y0+0.25+0.85/2,0.85); put(M.rail,0.15,0.06,y0+1.08,0.05); put(M.rail,0.15,0.05,y0+0.3,0.04);
      for(const [pe,sg] of [[e.a,-1],[e.b,1]]){ const ax_=pe+sg*0.15, oz=e.fix+e.out*0.15, x_=e.ax==='x'?ax_:oz, z_=e.ax==='x'?oz:ax_, ii=ci(x_), jj=cj(z_);   // 凸角：補上角落那一格的邊梁
        if(ii>=0&&jj>=0&&ii<GW&&jj<GH&&FLOOR[f][jj*GW+ii]&&RC[f][jj*GW+ii]<0) continue; put(M.conc,0.15,0.3,y0-0.9+1.15/2,1.15,0.3,ax_); } }
    // 邊緣：B1 停車場的牆與柱（沿用舊做法，第三輪檢查點 3 再改）
    if(GARAGE){ const n=FLOOR[f], rc=RC[f];   // FLOOR：未放柱的範圍（柱不是牆）
      const inC=(i,j)=>{ if(i<0||j<0||i>=GW||j>=GH) return false; const k=j*GW+i; return rc[k]<0&&n[k]&&(f>0||CORR[0][k]); };
      const edge=(i,j)=>{ if(i<0||j<0||i>=GW||j>=GH) return true; const k=j*GW+i; return !inC(i,j)&&rc[k]<0; };
      const seg=(ax,fix,a,b)=>{ const len=b-a; if(len<0.1) return; const c=(a+b)/2;
        if(GARAGE){ if(ax==='x') ib.add(M.conc,len,FH-0.2,0.3,c,y0+(FH-0.2)/2,fix); else ib.add(M.conc,0.3,FH-0.2,len,fix,y0+(FH-0.2)/2,c); }
        else if(f>0){ if(ax==='x') ib.add(M.rail,len,1.05,0.07,c,y0+0.53,fix); else ib.add(M.rail,0.07,1.05,len,fix,y0+0.53,c); }
      };   // 停車場的柱改為格狀方柱（buildGarage，S12）
      for(let j=0;j<GH;j++){ let sN=-1,sS=-1;
        for(let i=0;i<=GW;i++){
          const fr=inC(i,j), eN=fr&&edge(i,j-1), eS=fr&&edge(i,j+1);
          if(eN&&sN<0) sN=i; if(!eN&&sN>=0){ seg('x',WZ0+j*CELL,WX0+sN*CELL,WX0+i*CELL); sN=-1; }
          if(eS&&sS<0) sS=i; if(!eS&&sS>=0){ seg('x',WZ0+(j+1)*CELL,WX0+sS*CELL,WX0+i*CELL); sS=-1; }
        } }
      for(let i=0;i<GW;i++){ let sW=-1,sE=-1;
        for(let j=0;j<=GH;j++){
          const fr=inC(i,j), eW=fr&&edge(i-1,j), eE=fr&&edge(i+1,j);
          if(eW&&sW<0) sW=j; if(!eW&&sW>=0){ seg('z',WX0+i*CELL,WZ0+sW*CELL,WZ0+j*CELL); sW=-1; }
          if(eE&&sE<0) sE=j; if(!eE&&sE>=0){ seg('z',WX0+(i+1)*CELL,WZ0+sE*CELL,WZ0+j*CELL); sE=-1; }
        } } }
    { const rc=RC[f];
      // 雨遮（頂層走廊或上方無結構的走廊）
      const can=new T.Group(); can.name='CAN'+f; CAN[f]=can; world.add(can); const cb=IB(can); UNDER[f]=new Uint8Array(GW*GH); CEIL.forEach(c=>cb.add(M.conc,...c));   // 停車場天花：清水混凝土
      const used=new Uint8Array(GW*GH), cov=new Uint8Array(GW*GH);
      const fl=FLOOR[f];
      for(let k=0;k<GW*GH;k++){ if(!(rc[k]<0&&fl[k]&&(f>0||CORR[0][k]))) continue;
        const up=UP[f], above=GARAGE||(up>=0&&(FLOOR[up][k]||RC[up][k]>=0)); if(above) UNDER[f][k]=1; else { cov[k]=1; UNDER[f][k]=1; } }
      if(f===0&&CT) for(let k=0;k<GW*GH;k++){ const x=WX0+(k%GW+0.5)*CELL, z=WZ0+(((k/GW)|0)+0.5)*CELL;   // 穿堂：挑空到 3F，不做一層高的雨遮（S1）
        if(x>CT.x0-0.3&&x<CT.x1+0.3&&z>CT.zb&&z<CT.edge+3.0){ cov[k]=0; if(z>CT.zb+0.3) UNDER[f][k]=0; } }
      { // 屋簷深度限制：只留離「房間／上層結構」3 m 內的雨遮（川堂等開闊處不做大片頂蓋；照片中川堂雨遮進深有限）
        const EAVE=Math.round(3.0/CELL), dist=new Int16Array(GW*GH).fill(-1), q=[];
        for(let k=0;k<GW*GH;k++) if(rc[k]>=0||(UNDER[f][k]&&!cov[k])){ dist[k]=0; q.push(k); }
        for(let h=0;h<q.length;h++){ const k=q[h], d=dist[k]; if(d>=EAVE) continue; const i=k%GW, j=(k/GW)|0;
          for(const [di,dj] of [[1,0],[-1,0],[0,1],[0,-1]]){ const ni=i+di, nj=j+dj; if(ni<0||nj<0||ni>=GW||nj>=GH) continue; const t=nj*GW+ni; if(dist[t]>=0) continue; dist[t]=d+1; q.push(t); } }
        for(let k=0;k<GW*GH;k++) if(cov[k]&&dist[k]<0){ cov[k]=0; UNDER[f][k]=0; } }
      for(let j=0;j<GH;j++) for(let i=0;i<GW;i++){
        const k=j*GW+i; if(used[k]||!cov[k]) continue;
        let i2=i; while(i2+1<GW&&cov[j*GW+i2+1]&&!used[j*GW+i2+1]) i2++;
        let j2=j; outer2: while(j2+1<GH){ for(let x=i;x<=i2;x++){ const q=(j2+1)*GW+x; if(!cov[q]||used[q]) break outer2; } j2++; }
        for(let y=j;y<=j2;y++) for(let x=i;x<=i2;x++) used[y*GW+x]=1;
        const w=(i2-i+1)*CELL, d=(j2-j+1)*CELL, cx=WX0+(i+(i2-i+1)/2)*CELL, cz=WZ0+(j+(j2-j+1)/2)*CELL;
        cb.add(M.roof,w+0.5,0.2,d+0.5,cx,y0+FH-0.1,cz); }
      cb.flush();
    }
  }
}

/* ---------- 穿堂（S1）：校門側懸挑框架＋3F 樓板延伸、玻璃角窗房、2F 彩繪橋欄板（尺寸見 model.js 的 CT 與執行紀錄） ---------- */
function buildChuantang(){
  if(!CT) return; const C=CT, x0=C.x0, x1=C.x1, ibs=FIB;   // 併進各樓層的批次（不增加 draw call）
  // 垂直方塊依樓層切段放進各樓層群組（鳥瞰剖切時跟著樓層顯示／隱藏）
  const vbox=(mt,xa,xb,za,zb,ya,yb)=>{ for(let f=0;f<NF;f++){ const a=Math.max(ya,LY(f)), b=Math.min(yb,LY(f)+FH); if(b-a>0.01) ibs[f].add(mt,xb-xa,b-a,zb-za,(xa+xb)/2,(a+b)/2,(za+zb)/2); } };
  const top=4*FH;
  // 兩側清水混凝土牆（左：家長會辦公室東牆往前延伸；右：玻璃角窗房外側），從地面到邊梁頂
  vbox(M.conc,x0,C.xl,C.face-0.3,C.edge,0,C.beamTop); vbox(M.conc,C.box.x1,x1,C.face-0.3,C.edge,0,C.beamTop);
  // 3F 樓板延伸（懸挑板）與前緣邊梁（梁底 7.2 m，S1 校門側淨高 ≥ 7 m）
  vbox(M.slab,x0,x1,C.face-0.3,C.edge,C.soffit,2*FH); vbox(M.conc,x0,x1,C.edge-0.35,C.edge,C.beamBot,C.beamTop);
  // 3F–4F 紅磚量體前緣：照片（chuantang_from_above）中板緣只比上方磚牆凸出約 0.75 m
  const zf=C.edge-0.75; vbox(R('facade.J'),x0,x1,C.face-0.3,zf-0.55,C.beamTop,top);
  for(const f of [2,3]) recessFacade(ibs[f],R('facade.J'),'x',zf-0.4,x0,x1,LY(f),WALL_H,1,9001+f*17,f===3,null);   // 前緣立面：深凹窗洞（S4）
  ibs[3].add(R('roof.J')||M.roof,x1-x0+0.2,SLAB,zf-C.face+0.5,(x0+x1)/2,top-SLAB/2,(C.face+zf)/2-0.1);
  // 玻璃角窗房（1–2F）：灰框、玻璃、窗下淺藍灰實板（照片 chuantang_front_glassbox_col）
  const B=C.box, spand=M.band;   // 窗下實板：沿用飾帶材質（不多一個 draw call）
  vbox(M.glass,B.x0+0.05,B.x1,B.z1-0.06,B.z1,0,C.soffit); vbox(M.glass,B.x0,B.x0+0.06,B.z0,B.z1,0,C.soffit);
  for(const [ya,yb] of [[0,0.6],[3.3,4.6]]){ vbox(spand,B.x0,B.x1,B.z1-0.08,B.z1+0.01,ya,yb); vbox(spand,B.x0-0.01,B.x0+0.08,B.z0,B.z1,ya,yb); }
  const nx=Math.round((B.x1-B.x0)/1.15), nz=Math.round((B.z1-B.z0)/1.0);
  for(let k=0;k<=nx;k++){ const x=B.x0+(B.x1-B.x0)*k/nx; vbox(M.frame,x-0.04,x+0.04,B.z1-0.1,B.z1+0.02,0,C.soffit); }
  for(let k=0;k<=nz;k++){ const z=B.z0+(B.z1-B.z0)*k/nz; vbox(M.frame,B.x0-0.02,B.x0+0.1,z-0.04,z+0.04,0,C.soffit); }
  for(const y of [0.6,2.2,3.3,4.6,6.2]){ vbox(M.frame,B.x0,B.x1,B.z1-0.1,B.z1+0.02,y-0.04,y+0.04); vbox(M.frame,B.x0-0.02,B.x0+0.1,B.z0,B.z1,y-0.04,y+0.04); }
  ibs[0].add(M.wall,B.x1-B.x0,0.05,B.z1-B.z0,(B.x0+B.x1)/2,0.025,(B.z0+B.z1)/2);
  // 2F 橋的南側彩繪欄板（含邊梁外側），朝校門
  const pl=new T.Mesh(new T.PlaneGeometry(C.xr-C.xl,2.0),new T.MeshBasicMaterial({map:muralTex(),side:T.DoubleSide})); pl.position.set((C.xl+C.xr)/2,FH-0.9+1.0,C.zb+0.31); FG[1].add(pl);
}
function buildFinBox(){
  // 盒體（雲端驗收第 3 點：要有「深厚的灰色底板／側封板、盒體明顯凸出」的體積感）：底板、頂緣、側封板都跨滿整個凸出深度（鰭片外緣到磚牆線）
  const F=FINBOX; if(!F) return; const ib=FIB[2], L=F.x1-F.x0, cx=(F.x0+F.x1)/2, D=F.wall-F.z0, zc=(F.z0+F.wall)/2;
  ib.add(M.conc,L,0.75,D,cx,F.y0+0.375,zc);                                           // 厚底板（照片：底板厚約 0.75 m）
  ib.add(M.conc,L,0.35,D,cx,F.y1-0.175,zc);                                           // 頂緣
  for(const x of [F.x0+0.15,F.x1-0.15]) ib.add(M.conc,0.3,F.y1-F.y0,D,x,(F.y0+F.y1)/2,zc);   // 側封板（厚 0.3 m）
  const gz=F.front+0.15, ya=LY(2), yb=F.y1-0.35;                                      // 灰框長窗（原設計圖 3F 北牆線；鰭片在外）
  ib.add(M.glass,L-0.6,yb-ya,0.04,cx,(ya+yb)/2,gz);
  for(let x=F.x0+0.3;x<=F.x1-0.29;x+=0.9) ib.add(M.frame,0.06,yb-ya,0.08,x,(ya+yb)/2,gz);
  for(const y of [ya+0.9,ya+2.6]) ib.add(M.frame,L-0.6,0.06,0.08,cx,y,gz);
  // 垂直鰭片：每 0.9 m 一片，深 0.44 m、斜 35°（照片的鋸齒狀斜鰭片），深灰（照片的鰭片比磚面與底板暗，雲端驗收：原本偏淺）
  const a=0.6, dx=Math.sin(a)*0.22, dz=Math.cos(a)*0.22;
  for(let x=F.x0+0.7;x<=F.x1-0.5;x+=0.9){ const zf=F.z0+0.2; ib.quad(M.frame,[x-dx,ya,zf-dz],[x+dx,ya,zf+dz],[x+dx,yb,zf+dz],[x-dx,yb,zf-dz],true); }
}
/* ---------- 小物件（頂點色，同一樓層群組合併成一個網格＝一個 draw call）：遊戲塔、校門樹雕、旗桿、短柱燈、樹的竹架、停車場標線／管線／燈 ---------- */
const PROPS=[[],[],[],[],[]], C3=(h)=>new T.Color(h);
function vcAdd(f,g,col){ g=g.index?g.toNonIndexed():g; const n=g.attributes.position.count, c=new Float32Array(n*3); for(let i=0;i<n;i++) (typeof col==='function'?col(i,n):col).toArray(c,i*3);
  g.setAttribute('color',new T.BufferAttribute(c,3)); for(const k of Object.keys(g.attributes)) if(!['position','normal','color'].includes(k)) g.deleteAttribute(k); PROPS[f].push(g); }
const vcBox=(f,x0,y0,z0,x1,y1,z1,c)=>vcAdd(f,new T.BoxGeometry(x1-x0,y1-y0,z1-z0).translate((x0+x1)/2,(y0+y1)/2,(z0+z1)/2),c);
function vcStick(f,a,b,r,c,seg=6){ const A=new T.Vector3(...a), B=new T.Vector3(...b), L=A.distanceTo(B), g=new T.CylinderGeometry(r,r,L,seg,1);
  g.applyMatrix4(new T.Matrix4().makeRotationFromQuaternion(new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),B.clone().sub(A).normalize()))); g.translate((A.x+B.x)/2,(A.y+B.y)/2,(A.z+B.z)/2); vcAdd(f,g,c); }
function flushProps(){ const mt=lam('#ffffff',{vertexColors:true}); PROPS.forEach((parts,f)=>{ if(!parts.length) return; const mesh=new T.Mesh(BGU.mergeGeometries(parts),mt); mesh.name='props_F'+f; FG[f].add(mesh); }); }
// 蒙萌園中庭遊戲塔（S11；第三輪 B 依 mengmeng_mufeng_courtyard_b 重做）：灰色鋼柱架起的黃色方盒（約在 2F 高度，盒頂上有綠色欄杆平台框），
// 方盒側面接黃色出口管，再接紅黃寬環相間的大弧度螺旋管（約 1.5 圈）落到地面。尺寸以 2F 欄杆 1.1 m 為尺估計（示意）
function buildSlide(){
  const S_=m.SLIDE; if(!S_) return; const Y=C3('#e8c11c'), Rd=C3('#d8452f'), Gy=C3('#9aa0a4'), Gn=C3('#3f7a5a'), tx=S_.x-0.95, tz=S_.z, h=0.7, yb=3.6, yt=5.0;   // 整組收在 SLIDE 中心 2.1 m 內（＝碰撞圓盤）
  for(const [a,b] of [[-1,-1],[1,-1],[-1,1],[1,1]]) vcStick(0,[tx+a*(h-0.08),0,tz+b*(h-0.08)],[tx+a*(h-0.08),yb,tz+b*(h-0.08)],0.07,Gy,8);   // 鋼柱
  vcBox(0,tx-h,yb,tz-h,tx+h,yt,tz+h,Y);                                                                                            // 黃色方盒
  for(const [a,b] of [[-1,-1],[1,-1],[-1,1],[1,1]]) vcStick(0,[tx+a*h,yt,tz+b*h],[tx+a*h,yt+1.1,tz+b*h],0.035,Gy,6);             // 盒頂平台框
  for(const [x0,z0,x1,z1] of [[tx-h,tz-h,tx+h,tz-h+0.04],[tx-h,tz+h-0.04,tx+h,tz+h],[tx-h,tz-h,tx-h+0.04,tz+h]]) vcBox(0,x0,yt+0.15,z0,x1,yt+1.05,z1,Gn);
  // 出口管（黃）→ 螺旋管：中心在方盒外側，半徑 0.9 m、管徑 0.8 m，自 yb+0.5 起轉 1.5 圈到地面
  const cx=S_.x+0.75, cz=S_.z, turns=1.5, R0=0.9, a0=Math.PI, pts=[new T.Vector3(tx+h-0.1,yb+0.55,cz)];
  for(let k=0;k<=60;k++){ const t=k/60, a=a0-t*turns*Math.PI*2; pts.push(new T.Vector3(cx+Math.cos(a)*R0,yb+0.5-t*(yb+0.1),cz+Math.sin(a)*R0)); }
  const ex=cx+Math.cos(a0-turns*Math.PI*2)*R0, ez=cz+Math.sin(a0-turns*Math.PI*2)*R0; pts.push(new T.Vector3(ex,0.4,ez+0.6));
  vcAdd(0,new T.TubeGeometry(new T.CatmullRomCurve3(pts),120,0.4,12,false),(i,n)=>{ const k=i/n; return k<0.06?Y:(Math.floor(k*18)%2?Rd:Y); });
}
/* ---------- 時鐘梯塔外部與牆面（S10）：B 端兩角牆墩（清水混凝土）＋灰色落水管；實牆內側金色樓層數字、廣播喇叭、防空避難標示 ---------- */
function buildTower(){
  const TW=m.TOWER; if(!TW) return; const s=TW.s, fl=s.fl.filter(f=>f<4), topF=Math.max(...fl);
  for(const p of TW.piers){ if(!p.ok) continue; const cx=(p.x0+p.x1)/2, cz=(p.z0+p.z1)/2;
    for(const f of fl){ FIB[f].add(M.conc,p.x1-p.x0,FH,p.z1-p.z0,cx,LY(f)+FH/2,cz); const ex=s.P(s.Lt/2+0.95,0,0); FIB[f].add(M.frame,0.11,FH,0.11,ex.x,LY(f)+FH/2,cz); } }
  if(s.along!=='x') return;   // 數字等掛在朝南實牆（梯沿 x 時 v>0 側）
  for(const f of s.fl){ const y=LY(f), u=-s.Lt/2+0.9, v=s.sh/2-SLAB-0.012;
    TDET.push([f===4?4:Math.min(3,f),u,v,y+1.95,0.34,0.62,'v']); TDET.push([5,u,v,y+2.8,0.3,0.3,'v']); if(f===0) TDET.push([6,u+0.6,v,y+1.05,0.42,0.6,'v']); }
  // 圖集：0–3＝金色 1–4、4＝B1、5＝喇叭、6＝防空避難標示、7＝消防栓箱面板
  const at=canvasTex(1024,256,(g,w,h)=>{ g.clearRect(0,0,w,h); const cell=(k)=>k*128;
    g.font='700 200px '+FONT; g.textAlign='center'; g.textBaseline='middle'; ['1','2','3','4'].forEach((t,k)=>{ g.fillStyle='#d9c27a'; g.fillText(t,cell(k)+64,132); g.strokeStyle='#a8924e'; g.lineWidth=3; g.strokeText(t,cell(k)+64,132); });
    g.font='700 110px '+FONT; g.fillStyle='#d9c27a'; g.fillText('B1',cell(4)+64,132);
    g.fillStyle='#ecebe6'; g.fillRect(cell(5)+8,72,112,112); g.fillStyle='#55585a'; for(let i=0;i<6;i++) for(let j=0;j<6;j++){ g.beginPath(); g.arc(cell(5)+34+i*12,98+j*12,3,0,7); g.fill(); }
    g.fillStyle='#fafafa'; g.fillRect(cell(6)+6,20,116,216); g.fillStyle='#f2c230'; g.beginPath(); g.arc(cell(6)+64,80,34,0,7); g.fill(); g.fillStyle='#1f4f9a'; g.fillRect(cell(6)+40,92,48,22);
    g.fillStyle='#222'; g.font='700 22px '+FONT; g.fillText('防空避難',cell(6)+64,150); g.fillStyle='#d8352f'; g.fillRect(cell(6)+24,190,70,12); g.beginPath(); g.moveTo(cell(6)+94,180); g.lineTo(cell(6)+112,196); g.lineTo(cell(6)+94,212); g.fill();
    g.fillStyle='#8c9194'; g.fillRect(cell(7)+4,20,120,216); g.fillStyle='#eee'; g.font='700 24px '+FONT; g.fillText('消防栓',cell(7)+70,140); g.fillStyle='#d8352f'; g.beginPath(); g.arc(cell(7)+50,50,10,0,7); g.arc(cell(7)+90,50,10,0,7); g.fill(); });
  at.shared=false; const parts=[];
  for(const [k,u,v,y,w,h,ax] of TDET){ const pg=new T.PlaneGeometry(w,h), uv=pg.attributes.uv; for(let i=0;i<uv.count;i++) uv.setX(i,(k+uv.getX(i))/8);
    if(ax==='v') pg.rotateY(Math.PI); else pg.rotateY(-Math.PI/2*s.sgn); const q=s.P(u,v,y); pg.translate(q.x,q.y,q.z); parts.push(pg); }
  if(parts.length){ const mesh=new T.Mesh(BGU.mergeGeometries(parts),new T.MeshBasicMaterial({map:at,alphaTest:0.4})); mesh.name='tower_signs'; world.add(mesh); }
}
/* ---------- 警衛室（S7）：橘紅磚小亭＋綠色雨遮（北側門口、東側面向校門），照片無直接證據的尺寸為估計 ---------- */
function buildGuard(){
  const g=BYFLOOR[0].find(r=>r.name==='警衛室'); if(!g) return; const ib=FIB[0], y=2.65, D=1.1;
  ib.add(M.rail,g.w+D+0.3,0.12,D,(g.X0-0.3+g.X1+D)/2,y,g.Z0-D/2); ib.add(M.rail,D,0.12,g.d+0.3,g.X1+D/2,y,(g.Z0+g.Z1+0.3)/2);
  ib.add(M.rail,g.w+D+0.3,0.28,0.06,(g.X0-0.3+g.X1+D)/2,y-0.08,g.Z0-D); ib.add(M.rail,0.06,0.28,g.d+D+0.3,g.X1+D,y-0.08,(g.Z0-D+g.Z1+0.3)/2);
}
/* ---------- 廣場花壇（S8）：設計圖底圖抽出的花壇輪廓（scripts/extract_planters.py → data/planters.dongxin.json）
   ＝ 高 0.3 m、寬 0.25 m 的灰色花崗石曲線緣；沿花壇外側每約 9 m 一支黑色短柱燈；花壇區內的樹加竹架（照片 jixian_facade_courtyard、chuantang_looking_to_gate） ---------- */
function buildPlanters(){
  const ib=FIB[0], H=0.3, w=0.125, dark=C3('#2b2d2f'), cap=C3('#d9dcd6');
  const inPoly=(pts,x,z)=>{ let c=false; for(let i=0,j=pts.length-1;i<pts.length;j=i++){ const [xi,zi]=pts[i], [xj,zj]=pts[j]; if(((zi>z)!==(zj>z))&&x<(xj-xi)*(z-zi)/(zj-zi)+xi) c=!c; } return c; };
  for(const p of PLANTERS.planters){ const P=p.pts, n=P.length, segs=p.closed?n:n-1; let acc=4.5;
    for(let k=0;k<segs;k++){ const [ax,az]=P[k], [bx,bz]=P[(k+1)%n], L=Math.hypot(bx-ax,bz-az); if(L<1e-3) continue; const nx=-(bz-az)/L*w, nz=(bx-ax)/L*w;
      ib.quad(M.conc,[ax-nx,H,az-nz],[bx-nx,H,bz-nz],[bx+nx,H,bz+nz],[ax+nx,H,az+nz],false);
      ib.quad(M.conc,[ax+nx,0,az+nz],[bx+nx,0,bz+nz],[bx+nx,H,bz+nz],[ax+nx,H,az+nz]); ib.quad(M.conc,[ax-nx,0,az-nz],[bx-nx,0,bz-nz],[bx-nx,H,bz-nz],[ax-nx,H,az-nz]);
      acc+=L; if(acc>9&&p.closed){ acc=0; let ox=nx/w*0.5, oz=nz/w*0.5; const mx=(ax+bx)/2, mz=(az+bz)/2; if(inPoly(P,mx+ox,mz+oz)){ ox=-ox; oz=-oz; }
        const bxp=mx+ox, bzp=mz+oz; if(!(CT&&bxp>CT.x0&&bxp<CT.x1&&bzp>CT.face&&bzp<CT.edge)){ vcStick(0,[bxp,0,bzp],[bxp,0.85,bzp],0.08,dark,10); vcStick(0,[bxp,0.85,bzp],[bxp,0.95,bzp],0.07,cap,10); } } } }
}
function buildTreeSupports(){
  const bam=C3('#9b7b4e'), [rx0,rz0,rx1,rz1]=PLANTERS.region;
  for(const t of TREES_KEPT){ const x=t[0]*SC, z=t[1]*SC; if(x<rx0||x>rx1||z<rz0||z>rz1) continue;   // 竹架（三腳）
    for(let k=0;k<3;k++){ const a=k*2.094+0.4; vcStick(0,[x+Math.cos(a)*1.0,0,z+Math.sin(a)*1.0],[x+Math.cos(a)*0.12,1.8,z+Math.sin(a)*0.12],0.035,bam,5); } }
}
/* ---------- 地下停車場（S12，無實景照片，台灣常見校園地下停車場樣式，示意）：方柱（model.js 的 GCOLS，已進碰撞）＋柱腳黃黑警示帶、
   灰色環氧樹脂地坪（材質 garage）上的白色停車格與編號、黃色車道虛線、天花管線與日光燈、綠色「出口」指示 ---------- */
function buildGarage(){
  const G=m.GCOLS; if(!G||!G.box) return; const ib=FIB[4], yF=LY(4), yC=-SLAB, Wt=C3('#e9e9e2'), Yl=C3('#e7bb1f'), Bk=C3('#262626'), Gy=C3('#9a9fa3'), Lt=C3('#fbfbf4'), Gn=C3('#2e9b54');
  const free=(x,z)=>{ const i=ci(x), j=cj(z); return i>=0&&j>=0&&i<GW&&j<GH&&NAV[4][j*GW+i]===1; };
  for(const c of G){ ib.add(M.conc,0.6,yC-yF,0.6,c.x,(yF+yC)/2,c.z); for(let k=0;k<6;k++) vcBox(4,c.x-0.31,yF+k*0.15,c.z-0.31,c.x+0.31,yF+(k+1)*0.15,c.z+0.31,k%2?Bk:Yl); }
  const rows=G.rows, B=G.box, nums=[]; let no=1;
  for(let r=0;r+1<rows.length;r+=2){ const za=rows[r], zb=rows[r+1], zm=(za+zb)/2;
    for(let cx=B.x0+4.0;cx<B.x1-1;cx+=8.1) for(let q=0;q<3;q++){ const bx=cx+0.3+q*2.5;
      for(const [z0,z1,fz] of [[za,zm,za+0.9],[zm,zb,zb-0.9]]){ const ok=[[bx+0.2,z0+0.3],[bx+2.3,z0+0.3],[bx+0.2,z1-0.3],[bx+2.3,z1-0.3],[bx+1.25,(z0+z1)/2]].every(([x,z])=>free(x,z)); if(!ok) continue;
        vcBox(4,bx,yF+0.003,z0,bx+0.1,yF+0.008,z1,Wt); vcBox(4,bx+2.4,yF+0.003,z0,bx+2.5,yF+0.008,z1,Wt); vcBox(4,bx,yF+0.003,zm-0.05,bx+2.5,yF+0.008,zm+0.05,Wt);
        nums.push([no++,bx+1.25,fz]); } } }
  const aisles=[(B.z0+rows[0])/2]; for(let r=1;r+1<rows.length;r+=2) aisles.push((rows[r]+rows[r+1])/2);
  for(const az of aisles){ for(let x=B.x0+1;x<B.x1-1;x+=3.5) if(free(x,az)&&free(x+2,az)) vcBox(4,x,yF+0.003,az-0.06,x+2,yF+0.008,az+0.06,Yl);
    vcStick(4,[B.x0+0.5,yC-0.35,az+1.2],[B.x1-0.5,yC-0.35,az+1.2],0.09,Gy,8); vcStick(4,[B.x0+0.5,yC-0.25,az+1.6],[B.x1-0.5,yC-0.25,az+1.6],0.05,Gy,6);
    for(let x=B.x0+2;x<B.x1-1;x+=4) if(free(x,az)) vcBox(4,x-0.6,yC-0.12,az-0.08,x+0.6,yC-0.05,az+0.08,Lt); }
  // 編號與「出口」：圖集（白色數字 0–9、綠底白字出口）合併成一個網格
  const at=canvasTex(1024,128,(g,w,h)=>{ g.clearRect(0,0,w,h); g.font='700 100px '+FONT; g.textAlign='center'; g.textBaseline='middle'; g.fillStyle='#f2f2ea';
    for(let d=0;d<10;d++) g.fillText(String(d),d*64+32,68); g.fillStyle='#2e9b54'; g.fillRect(640,8,376,112); g.fillStyle='#fff'; g.font='700 72px '+FONT; g.fillText('出口 EXIT',828,66); });
  at.shared=false; const parts=[];
  const plane=(u0,u1,w,h,setup)=>{ const pg=new T.PlaneGeometry(w,h), uv=pg.attributes.uv; for(let i=0;i<uv.count;i++) uv.setX(i,u0+uv.getX(i)*(u1-u0)); setup(pg); parts.push(pg); };
  for(const [n,x,z] of nums){ const t=String(n).padStart(3,'0'); [...t].forEach((ch,k)=>plane(+ch*64/1024,(+ch+1)*64/1024,0.32,0.6,pg=>{ pg.rotateX(-Math.PI/2); pg.translate(x+(k-1)*0.3,yF+0.01,z); })); }
  for(const st of STAIRS) if(st.fl.includes(4)){ const e=st.ent; plane(640/1024,1,1.2,0.38,pg=>{ pg.translate(e.x,yC-0.6,e.z); }); vcBox(4,e.x-0.62,yC-0.8,e.z-0.04,e.x+0.62,yC-0.4,e.z-0.01,Gn); }
  if(parts.length){ const mesh=new T.Mesh(BGU.mergeGeometries(parts),new T.MeshBasicMaterial({map:at,alphaTest:0.4,side:T.DoubleSide})); mesh.name='garage_signs'; FG[4].add(mesh); }
}
/* ---------- 司令台（S9）：開放式抬高平台＋斜坡＋不鏽鋼扶手＋鋼柱斜撐的折板雨遮（model.js 的 STAGE；尺寸為照片估計） ---------- */
// 斜置的方塊（斜撐、斜扶手）：p→q 的方形斷面桿件，四個側面用 Batch.quad（併進樓層批次，不另增 draw call）
function beam(ib,mt,p,q,w){ const d=[q[0]-p[0],q[1]-p[1],q[2]-p[2]], L=Math.hypot(...d), dn=d.map(v=>v/L);
  let u=[dn[2],0,-dn[0]]; if(Math.hypot(...u)<1e-3) u=[1,0,0]; const ul=Math.hypot(...u); u=u.map(v=>v/ul*w/2);
  const v=[dn[1]*u[2]-dn[2]*u[1],dn[2]*u[0]-dn[0]*u[2],dn[0]*u[1]-dn[1]*u[0]];
  const c=(a,s1,s2)=>[a[0]+s1*u[0]+s2*v[0],a[1]+s1*u[1]+s2*v[1],a[2]+s1*u[2]+s2*v[2]];
  for(const [s1,s2,t1,t2] of [[1,1,-1,1],[-1,1,-1,-1],[-1,-1,1,-1],[1,-1,1,1]]) ib.quad(mt,c(p,s1,s2),c(q,s1,s2),c(q,t1,t2),c(p,t1,t2),false); }
function buildStage(){
  const S_=m.STAGE; if(!S_) return; const ib=FIB[0], P=S_.plat, Rm=S_.ramp, Cn=S_.canopy, PH=S_.PH;
  // 平台：灰色花崗石貼面（量體）＋深色木紋面
  ib.add(M.granite,P.x1-P.x0+0.3,PH,P.z1-P.z0+0.3,(P.x0+P.x1)/2,PH/2,(P.z0+P.z1)/2);
  ib.add(M.wood,P.x1-P.x0,0.02,P.z1-P.z0,(P.x0+P.x1)/2,PH+0.01,(P.z0+P.z1)/2);
  // 斜坡：坡面＋上平台、兩側矮牆（梯形面）、坡道與平台之間的花台
  ib.quad(M.conc,[Rm.x0,0.01,Rm.z1],[Rm.top,PH,Rm.z1],[Rm.top,PH,Rm.z0],[Rm.x0,0.01,Rm.z0]);
  ib.add(M.conc,Rm.x1-Rm.top,PH,Rm.z1-P.z1,(Rm.top+Rm.x1)/2,PH/2,(P.z1+Rm.z1)/2);
  for(const z of [Rm.z0-0.1,Rm.z1+0.1]) ib.quad(M.conc,[Rm.x0,0,z],[Rm.top,0,z],[Rm.top,PH+0.1,z],[Rm.x0,0.1,z]);
  ib.add(M.conc,Rm.top-P.x0,PH+0.1,Rm.z0-P.z1-0.2,(P.x0+Rm.top)/2,(PH+0.1)/2,(P.z1+Rm.z0)/2);
  ib.add(M.conc,Rm.x1-Rm.x0+0.6,0.5,S_.face-Rm.z1-0.2,(Rm.x0+Rm.x1)/2,0.25,(Rm.z1+S_.face)/2);   // 斜坡後方到牆：矮花台
  // 不鏽鋼扶手（斜坡兩側，高 0.85 m）
  const hr=(x)=>Math.min(PH,PH*Math.max(0,(x-Rm.x0)/(Rm.top-Rm.x0)));
  for(const z of [Rm.z0-0.1,Rm.z1+0.1]){ beam(ib,M.frame,[Rm.x0,0.9,z],[Rm.top,PH+0.9,z],0.05); beam(ib,M.frame,[Rm.top,PH+0.9,z],[Rm.x1,PH+0.9,z],0.05);
    for(let x=Rm.x0;x<=Rm.x1+0.01;x+=1.5) ib.add(M.frame,0.04,0.9,0.04,x,hr(x)+0.45,z); }
  // 折板雨遮：中脊沿 z、前低後高；四周下垂的封邊
  const xm=(Cn.x0+Cn.x1)/2, hw=(Cn.x1-Cn.x0)/2, Y=(x,z)=>Cn.yFront+(Cn.yBack-Cn.yFront)*(z-Cn.z0)/(Cn.z1-Cn.z0)+(Cn.ridge??0.3)*(1-Math.abs(x-xm)/hw);
  const pt=(x,z,dy=0)=>[x,Y(x,z)+dy,z];
  const CM=M.roof;   // 折板雨遮：淺銀灰金屬（照片受光面約 (150,155,160)；沿用屋頂灰材質，不另增 draw call）
  for(const [xa,xb] of [[Cn.x0,xm],[xm,Cn.x1]]){ ib.quad(CM,pt(xa,Cn.z0),pt(xb,Cn.z0),pt(xb,Cn.z1),pt(xa,Cn.z1)); ib.quad(CM,pt(xa,Cn.z0,-0.18),pt(xb,Cn.z0,-0.18),pt(xb,Cn.z1,-0.18),pt(xa,Cn.z1,-0.18));
    ib.quad(CM,pt(xa,Cn.z0),pt(xb,Cn.z0),pt(xb,Cn.z0,-Cn.drop),pt(xa,Cn.z0,-Cn.drop)); }
  beam(ib,M.dark,pt(xm,Cn.z0+0.02,0.03),pt(xm,Cn.z1-0.02,0.03),0.08);   // 折板中脊稜線（雲端驗收：稜線不明顯）
  for(const x of [Cn.x0,Cn.x1]) ib.quad(M.frame,pt(x,Cn.z0),pt(x,Cn.z1),pt(x,Cn.z1,-Cn.drop),pt(x,Cn.z0,-Cn.drop));
  // 鋼柱＋斜撐
  for(const [x,z] of S_.cols){ const top=Y(x,z)-0.18; ib.cyl(M.frame,S_.colR*2,top,x,top/2,z); beam(ib,M.frame,[x,2.6,z],[x+(x<xm?1.2:-1.2),Y(x,z-3.6)-0.18,z-3.6],0.16); }
}
/* ---------- 地面、圍牆、樹 ---------- */
function buildGround(){
  const base=new T.Mesh(new T.PlaneGeometry(1400,1400),new T.MeshBasicMaterial({color:0xd5d8d5})); base.rotation.x=-Math.PI/2; base.position.set(80,-0.06,40); world.add(base);
  const tx=D.tex, w=(tx.x1-tx.x0)*SC, h=(tx.y1-tx.y0)*SC;
  groundBox={x:tx.x0*SC,z:tx.y0*SC,w,h};
  let planOk; const planReady=new Promise(r=>planOk=r);
  const t=new T.TextureLoader().load(opts.planUrl||tx.file,()=>planOk(t)); t.anisotropy=8;
  // 地面：往地下室的梯口要挖洞（Shape 內座標 = (x, -z)，旋轉後朝上）
  const x0=groundBox.x, z0=groundBox.z; const shp=new T.Shape(); shp.moveTo(x0,-z0); shp.lineTo(x0+w,-z0); shp.lineTo(x0+w,-(z0+h)); shp.lineTo(x0,-(z0+h)); shp.lineTo(x0,-z0);
  STAIRS.forEach(st=>{ if(!st.fl.includes(4)) return; const a=st.P(st.uA+0.02,0.0,0), b=st.P(st.uB,-st.fs*st.sh/2,0);   // 下層第二跑上來的開口（第一跑的另一側）
    const xa=Math.min(a.x,b.x), xb=Math.max(a.x,b.x), za=Math.min(a.z,b.z), zb=Math.max(a.z,b.z); const hp=new T.Path();
    hp.moveTo(xa,-za); hp.lineTo(xa,-zb); hp.lineTo(xb,-zb); hp.lineTo(xb,-za); hp.lineTo(xa,-za); shp.holes.push(hp); });
  { const R=RAMP, hp=new T.Path(), xa=R.x0, xb=R.x1, za=R.z0+R.cover, zb=R.z1; hp.moveTo(xa,-za); hp.lineTo(xa,-zb); hp.lineTo(xb,-zb); hp.lineTo(xb,-za); hp.lineTo(xa,-za); shp.holes.push(hp); }
  const gg=new T.ShapeGeometry(shp); gg.rotateX(-Math.PI/2);
  { const pos=gg.attributes.position, uv=new Float32Array(pos.count*2); for(let i=0;i<pos.count;i++){ uv[i*2]=(pos.getX(i)-x0)/w; uv[i*2+1]=1-(pos.getZ(i)-z0)/h; } gg.setAttribute('uv',new T.BufferAttribute(uv,2)); }
  const gm=new T.MeshBasicMaterial({map:t,color:0xf2f2f2});
  groundDetail(gm, R('ground.detail'), R('corridor'));
  const m=new T.Mesh(gg,gm);
  m.name='ground_plan'; m.userData.planReady=planReady; m.position.set(0,-0.02,0); world.add(m); groundMesh=m;   // planReady：底圖載入完成（ao.js 把地面 AO 乘進底圖）
}
// 地面細節：把圖片型鋪面紋理（材質角色 ground.detail）以世界公尺鋪在底圖上，只作用在底圖的「鋪面色」（低彩度、非綠、非線條），
// 草地、跑道、球場保留底圖原色。細節除以貼圖平均色，只加明暗紋理、不改底圖色調；遠處 mipmap 平均後自然淡出。
// 只有圖片載入成功才開啟（程式化備援或換膜沒有圖片時，地面與原本完全相同）。
// 校門側廣場與穿堂地坪（S8，照片 chuantang_front_glassbox_col：淺灰大塊石英磚約 0.6 m 見方、細縫）的範圍 [x0,z0,x1,z1]（m）
const PLAZA=[[69.0,42.3,112.0,72.0],[80.1,21.2,93.2,42.4]];   // 校門內側一帶照片為灰色連鎖磚（gate_inside_sculpture_wall），不在大磚範圍
// 廣場／穿堂（PLAZA）鋪材質角色 corridor 的實景淺灰石英磚貼圖（第三輪 A；雲端驗收：原本由底圖去飽和而來，偏米黃）；沒有圖片時退回底圖去飽和＋0.6 m 程式縫。
function groundDetail(mat, det, tile){
  const tx=det&&det.map; if(!tx||!tx.userData.image) return;
  const tt=tile&&tile.map&&tile.map.userData.image?tile.map:null;
  const U={uDet:{value:tx},uDetK:{value:0},uDetScale:{value:tx.repeat},uDetMean:{value:new T.Vector3(1,1,1)},uPlA:{value:new T.Vector4(...PLAZA[0])},uPlB:{value:new T.Vector4(...PLAZA[1])},
    uTile:{value:tt||tx},uTileK:{value:0},uTileScale:{value:(tt||tx).repeat}};
  tx.userData.ready.then(r=>{ if(r.ok){ U.uDetMean.value.set(...r.mean); U.uDetK.value=opts.groundDetail??0.45; } });
  if(tt) tt.userData.ready.then(r=>{ if(r.ok) U.uTileK.value=1; });
  mat.onBeforeCompile=(sh)=>{ Object.assign(sh.uniforms,U);
    sh.vertexShader=sh.vertexShader.replace('#include <common>','#include <common>\nvarying vec2 vWXZ;').replace('#include <begin_vertex>','#include <begin_vertex>\nvWXZ=(modelMatrix*vec4(transformed,1.0)).xz;');
    sh.fragmentShader=sh.fragmentShader.replace('#include <common>','#include <common>\nvarying vec2 vWXZ;uniform sampler2D uDet;uniform float uDetK;uniform vec2 uDetScale;uniform vec3 uDetMean;uniform vec4 uPlA,uPlB;uniform sampler2D uTile;uniform float uTileK;uniform vec2 uTileScale;')
      .replace('#include <map_fragment>',`#include <map_fragment>
      { vec3 pc=diffuseColor.rgb; float mx=max(pc.r,max(pc.g,pc.b)), mn=min(pc.r,min(pc.g,pc.b)), sat=(mx-mn)/max(mx,1e-3);
        float w=(1.0-smoothstep(0.13,0.22,sat))*(1.0-smoothstep(0.0,0.04,pc.g-pc.r))*smoothstep(0.5,0.65,mx);
        vec3 d=texture2D(uDet,vWXZ*uDetScale).rgb/uDetMean;
        bool pl=(all(greaterThan(vWXZ,uPlA.xy))&&all(lessThan(vWXZ,uPlA.zw)))||(all(greaterThan(vWXZ,uPlB.xy))&&all(lessThan(vWXZ,uPlB.zw)));
        if(pl&&uDetK>0.0){ float wp=(1.0-smoothstep(0.0,0.04,pc.g-pc.r))*smoothstep(0.45,0.6,mx);   // 校門側廣場、穿堂：淺灰大磚 0.6 m（S8），底圖暖色調降為淺灰
          vec2 gq=abs(fract(vWXZ/0.6+0.5)-0.5)*0.6; float ln=1.0-smoothstep(0.004,0.012,min(gq.x,gq.y)); float l=dot(pc,vec3(0.3,0.59,0.11));
          vec3 gc=uTileK>0.0?texture2D(uTile,vWXZ*uTileScale).rgb*1.05:vec3(l*0.93,l*0.95,l*0.96)*(1.0-0.22*ln);
          diffuseColor.rgb=mix(diffuseColor.rgb,gc,wp); }
        else { vec3 tc=texture2D(uDet,vWXZ*uDetScale).rgb*1.12;   // 鋪面：除了加紋理，也把底圖的米白往實景連鎖磚的灰色拉（照片 jixian_facade_courtyard、gate_inside_sculpture_wall 為灰色連鎖磚）
          diffuseColor.rgb=mix(diffuseColor.rgb*mix(vec3(1.0),d,w*uDetK),tc,w*uDetK*1.2); } }`); };
  mat.customProgramCacheKey=()=>'groundDetail';
}
function buildDecor(){
  const gx=[GB.x0,GB.x1], gz=GB.z;
  // 校名牆銘牌
  const tex=canvasTex(1024,256,(g,w,h)=>{ g.clearRect(0,0,w,h); g.fillStyle='#6b6f73'; g.fillRect(0,0,w,h); g.fillStyle='#2b2f33'; g.textAlign='left'; g.textBaseline='middle';
    g.font='500 40px '+FONT; g.fillText('臺北市南港區',60,70); g.font='700 96px '+FONT; g.fillText('東新國民小學',60,150);
    g.font='400 30px sans-serif'; g.fillText('Taipei Municipal Dongxin Elementary School',60,222); });
  tex.shared=false; const plate=new T.Mesh(new T.PlaneGeometry(5.4,1.35),new T.MeshBasicMaterial({map:tex}));
  plate.position.set(gx[1]+3.2,1.35,gz-0.3+0.27); world.add(plate);
  // 梯塔時鐘（最靠近校門的梯間，南面）
  const st=STAIRS.slice().sort((a,b)=>Math.hypot(a.cx-GATE.x,a.cz-GATE.z)-Math.hypot(b.cx-GATE.x,b.cz-GATE.z))[0];
  const ck=canvasTex(256,256,(g,w,h)=>{ g.fillStyle='#f4f2ea'; g.beginPath(); g.arc(128,128,120,0,7); g.fill(); g.strokeStyle='#333'; g.lineWidth=8; g.stroke();
    g.lineWidth=5; for(let i=0;i<12;i++){ const a=i*Math.PI/6; g.beginPath(); g.moveTo(128+Math.sin(a)*98,128-Math.cos(a)*98); g.lineTo(128+Math.sin(a)*112,128-Math.cos(a)*112); g.stroke(); }
    g.lineWidth=9; g.beginPath(); g.moveTo(128,128); g.lineTo(128+Math.sin(0.9)*60,128-Math.cos(0.9)*60); g.stroke(); g.lineWidth=6; g.beginPath(); g.moveTo(128,128); g.lineTo(128+Math.sin(4.2)*86,128-Math.cos(4.2)*86); g.stroke(); });
  ck.shared=false; const clock=new T.Mesh(new T.CircleGeometry(1.0,32),new T.MeshBasicMaterial({map:ck}));
  clock.position.set(st.cx,3*FH+FH-1.0,st.Z1+0.06); world.add(clock);
  { const bk=new T.Mesh(UNIT,M.conc); bk.scale.set(2.3,2.3,0.3); bk.position.set(st.cx,3*FH+FH-1.0,st.Z1-0.02); world.add(bk); }
  // 時鐘梯塔（照片）：頂部與底部的綠色水平百葉箱、塔身挑出的梯間平台（欄杆已在樓梯建構中）
  { const lt=canvasTex(64,64,(g,w,h)=>{ g.fillStyle='#2f7a52'; g.fillRect(0,0,w,h); g.fillStyle='#1f5a3c'; for(let i=0;i<8;i++) g.fillRect(0,i*8+5,w,3); },true);
    const lv=new T.MeshLambertMaterial({map:lt}); const wS=st.w+0.4, dS=st.d+0.4;
    const top=new T.Mesh(UNIT,lv); top.scale.set(wS,1.7,dS); top.position.set(st.cx,4*FH+0.85,st.cz); world.add(top);
    const lid=new T.Mesh(UNIT,M.conc); lid.scale.set(wS+0.3,0.2,dS+0.3); lid.position.set(st.cx,4*FH+1.8,st.cz); world.add(lid);
    const base=new T.Mesh(UNIT,lv); base.scale.set(wS,2.2,0.18); base.position.set(st.cx,1.2,st.Z1+0.12); world.add(base); }
}
function gateSculpture(wx,wz){
  const Sv=C3('#c9ccce'), r=rng(23), birds=[C3('#e0533b'),C3('#f0c22e'),C3('#3d7fd0'),C3('#f08a2a'),C3('#7bc46a')], tips=[];
  // 樹雕：牆頂偏東（由校內看在牆的左半），主幹往上分枝 4 層，枝條在牆面方向展開（鏤空的樹冠輪廓）
  const grow=(p,a,len,rad,d)=>{ const q=[p[0]+Math.cos(a)*len,p[1]+Math.sin(a)*len*0.75,p[2]+(r()-0.5)*0.25]; vcStick(0,p,q,rad,Sv,6);
    if(d===0){ tips.push(q); return; } const n=d>2?2:2+(r()<0.5?1:0); for(let k=0;k<n;k++) grow(q,a+(k-(n-1)/2)*0.9+(r()-0.5)*0.4,len*0.78,rad*0.72,d-1); };
  const base=[wx+1.2,2.4,wz]; grow(base,Math.PI/2+0.35,1.25,0.11,4);   // 照片：樹雕寬約為牆長的一半（≈3.5 m）、高約 1.6 m（估計）
  tips.forEach((t,k)=>{ if(k%3) return; const c=birds[k%birds.length]; vcAdd(0,new T.SphereGeometry(0.11,8,6).translate(t[0],t[1]+0.08,t[2]),c); vcAdd(0,new T.ConeGeometry(0.035,0.09,6).rotateZ(-Math.PI/2).translate(t[0]+0.13,t[1]+0.1,t[2]),C3('#f0b030')); });
  // 旗桿＋國旗（牆前、校內側）
  const fx=wx-0.9, fz=wz-1.1; vcStick(0,[fx,0,fz],[fx,6.5,fz],0.045,C3('#d4d7d9'),10); vcBox(0,fx-0.25,0,fz-0.25,fx+0.25,0.12,fz+0.25,C3('#55595c'));
  const red=C3('#d02a2a'), blue=C3('#1f3c99'); vcBox(0,fx+0.05,5.4,fz-0.01,fx+1.55,6.4,fz+0.01,red); vcBox(0,fx+0.05,5.9,fz-0.015,fx+0.8,6.4,fz+0.015,blue);
  vcAdd(0,new T.CircleGeometry(0.12,12).translate(fx+0.42,6.15,fz+0.02),C3('#ffffff'));
  // 黑色短柱燈（牆前）
  for(const dx of [-3.2,3.0]){ vcStick(0,[wx+dx,0,wz-1.4],[wx+dx,0.85,wz-1.4],0.08,C3('#2b2d2f'),10); }
}
function buildFence(){
  const ib=IB(world), P=D.site.map(p=>[p[0]*SC,p[1]*SC]); const n=P.length;
  const gateX=[(745-90)*SC,(745+90)*SC];
  for(let i=0;i<n;i++){
    let [ax,az]=P[i],[bx,bz]=P[(i+1)%n]; const isSouth=(i===n-1);
    const pieces=[]; if(isSouth&&ax>bx){ [ax,az,bx,bz]=[bx,bz,ax,az]; }
    if(isSouth){ // 留校門缺口
      const t0=(gateX[0]-ax)/(bx-ax), t1=(gateX[1]-ax)/(bx-ax);
      pieces.push([0,Math.max(0,t0)]); pieces.push([Math.min(1,t1),1]);
    } else pieces.push([0,1]);
    pieces.forEach(([t0,t1])=>{ if(t1-t0<0.01) return; const x0=ax+(bx-ax)*t0,z0=az+(bz-az)*t0,x1=ax+(bx-ax)*t1,z1=az+(bz-az)*t1;
      const len=Math.hypot(x1-x0,z1-z0), ang=-Math.atan2(z1-z0,x1-x0);
      ib.add(M.fence,len,0.12,0.12,(x0+x1)/2,1.9,(z0+z1)/2,ang);
      const k=Math.max(1,Math.round(len/3)); for(let q=0;q<=k;q++){ const tt=q/k; ib.add(M.dark,0.14,1.95,0.14,x0+(x1-x0)*tt,0.97,z0+(z1-z0)*tt,ang); }
      ib.add(M.rail,len,0.05,0.05,(x0+x1)/2,1.0,(z0+z1)/2,ang); });
  }
  { // 藍色伸縮校門（警衛室東側）+ 灰色校名牆：門扇關上東側 60%，西側留出入口
    const gz=GB.z, B=M.fence, xa=GB.x0+(GB.x1-GB.x0)*0.4, xb=GB.x1, gw=xb-xa, gx=(xa+xb)/2;
    ib.add(B,gw,0.1,0.1,gx,0.25,gz); ib.add(B,gw,0.1,0.1,gx,1.9,gz); ib.add(B,gw,0.08,0.08,gx,1.0,gz);
    for(let q=0;q<=Math.round(gw/0.25);q++) ib.add(B,0.05,1.7,0.05,xa+q*0.25,1.05,gz);
    // 校門地標（照片 gate_inside_sculpture_wall.jpg）：淺灰清水混凝土矮牆（高 2.4 m、長 7 m，估計）＋牆頂銀色鏤空樹雕與彩色小鳥＋不鏽鋼旗桿（國旗）
    ib.add(M.conc,7,2.4,0.5,GB.x1+3.2,1.2,gz-0.3);
    gateSculpture(GB.x1+3.2,gz-0.3);
  }
  ib.flush();
}
const TREES_KEPT=[];
function buildTrees(){
  const SG=STAGE, inBox=(x,z,a)=>x>a.x0&&x<a.x1&&z>a.z0&&z<a.z1;
  const list=D.trees.filter(t=>{ const x=t[0]*SC, z=t[1]*SC;   // 不長在司令台、穿堂框架、遊戲塔上
    if(SG&&inBox(x,z,{x0:SG.canopy.x0-1,x1:SG.canopy.x1+1,z0:SG.canopy.z0-1,z1:SG.face})) return false;
    if(CT&&inBox(x,z,{x0:CT.x0-1.5,x1:CT.x1+1.5,z0:CT.zb,z1:CT.edge+1.5})) return false;
    if(SLIDE&&Math.hypot(x-SLIDE.x,z-SLIDE.z)<3.5) return false; return true; }), n=list.length; TREES_KEPT.push(...list); if(!n) return;
  const trunk=new T.InstancedMesh(new T.CylinderGeometry(0.16,0.24,1,6),M.trunk,n);
  const crown=new T.InstancedMesh(new T.IcosahedronGeometry(1,1),lam('#ffffff'),n);
  const r=rng(7), m=new T.Matrix4(), q=new T.Quaternion(), p=new T.Vector3(), s=new T.Vector3(), c=new T.Color();
  list.forEach((t,i)=>{ const rad=clamp(t[2]*0.5,1.0,2.4), th=2.0+rad*0.6;
    p.set(t[0]*SC,th/2,t[1]*SC); s.set(1,th,1); m.compose(p,q,s); trunk.setMatrixAt(i,m);
    p.set(t[0]*SC,th+rad*0.55,t[1]*SC); s.set(rad,rad*0.85,rad); m.compose(p,q,s); crown.setMatrixAt(i,m);
    c.setHSL(0.27+r()*0.06,0.38+r()*0.14,0.32+r()*0.1); crown.setColorAt(i,c); });
  [trunk,crown].forEach(o=>{ o.frustumCulled=false; world.add(o); });
  crown.instanceColor.needsUpdate=true;
}

/* ---------- 停車場坡道入口（蒙萌園與集賢樓之間；依使用者照片：混凝土側牆＋藍色欄杆、跨坡道的出入口龍門架、紅白柵欄臂、紅色禁停線、地下鐵捲門） ---------- */
function buildRamp(){
  const R=RAMP, ib=IB(world), xa=R.x0, xb=R.x1, w=xb-xa, zc=R.z0+R.cover, zs=R.z1, drop=R.drop, L=zs-R.z0, cxr=(xa+xb)/2;
  const ground=lam('#8d9096'), strip=canvasTex(64,128,(g,W,H)=>{ g.fillStyle='#8f9296'; g.fillRect(0,0,W,H); g.fillStyle='#7b7e83'; for(let i=0;i<8;i++) g.fillRect(0,i*16+11,W,3); },true);
  // 坡面：南端(街側) y=0 → 北端 y=-drop
  const gm=new T.BufferGeometry(); const v=new Float32Array([xa,0,zs, xb,0,zs, xb,-drop,R.z0, xa,-drop,R.z0]);
  gm.setAttribute('position',new T.BufferAttribute(v,3)); gm.setAttribute('uv',new T.BufferAttribute(new Float32Array([0,0,1,0,1,L/1.5,0,L/1.5]),2)); gm.setIndex([0,2,1,0,3,2]); gm.computeVertexNormals();
  strip.repeat.set(1,1); const rm=new T.Mesh(gm,new T.MeshLambertMaterial({map:strip,side:T.DoubleSide})); world.add(rm);
  // 側牆（階梯近似斜面）＋ 欄杆
  const N=12, dz=L/N;
  for(let k=0;k<N;k++){ const z=zs-(k+0.5)*dz, dep=drop*(k+0.5)/N+0.1, h=dep+0.45, yc=(0.45-dep)/2;
    [xa+0.15,xb-0.15].forEach(x=>ib.add(M.conc,0.3,h,dz+0.02,x,yc,z)); }
  [xa+0.15,xb-0.15].forEach(x=>{ ib.add(M.fence,0.06,0.06,L-R.cover,x,1.3,(zs+zc)/2); ib.add(M.fence,0.06,0.06,L-R.cover,x,0.75,(zs+zc)/2);
    for(let z=zc;z<=zs+0.01;z+=1.0) ib.add(M.fence,0.05,0.9,0.05,x,0.9,z); });
  // 北端：擋土牆＋鐵捲門
  ib.add(M.conc,w,drop+0.5,0.4,cxr,(0.45-drop-0.05)/2,R.z0+0.2);
  const door=lam('#2c2d30'); ib.add(door,w-1.6,2.5,0.06,cxr,-drop+1.35,R.z0+0.43);
  for(let q=0;q<10;q++) ib.add(lam('#3a3b3f'),w-1.6,0.04,0.08,cxr,-drop+0.2+q*0.25,R.z0+0.45);
  // 龍門架（出口 EXIT｜P 圖示｜入口 ENTRANCE）
  const zg=zs-1.2, W2=w+1.0, white=lam('#eceeef');
  ib.add(white,0.18,3.4,0.18,xa-0.5,1.7,zg); ib.add(white,0.18,3.4,0.18,xb+0.5,1.7,zg); ib.add(white,W2,0.1,0.1,cxr,3.4,zg); ib.add(lam('#5c6670'),W2-0.3,0.78,0.1,cxr,2.95,zg);
  const sg=canvasTex(1024,128,(g,W,H)=>{ g.fillStyle='#5c6670'; g.fillRect(0,0,W,H); g.fillStyle='#e8eaeb'; g.textBaseline='middle';
    g.fillStyle='#c8322d'; g.beginPath(); g.arc(70,64,34,0,7); g.fill(); g.fillStyle='#fff'; g.fillRect(52,58,36,12);
    g.fillStyle='#e8eaeb'; g.font='700 30px '+FONT; g.textAlign='left'; g.fillText('出口 EXIT',120,64); g.font='700 84px '+FONT; g.textAlign='center'; g.fillText('P',420,66);
    g.font='600 30px '+FONT; g.fillText('無障礙・汽車・機車',620,64); g.textAlign='right'; g.font='700 30px '+FONT; g.fillText('入口 ENTRANCE',1000,64); });
  sg.shared=false; const sp=new T.Mesh(new T.PlaneGeometry(W2-0.3,0.78),new T.MeshBasicMaterial({map:sg})); sp.position.set(cxr,2.95,zg+0.06); world.add(sp);
  const spb=new T.Mesh(new T.PlaneGeometry(W2-0.3,0.78),new T.MeshBasicMaterial({color:0x5c6670})); spb.rotation.y=Math.PI; spb.position.set(cxr,2.95,zg-0.06); world.add(spb);
  const bar=canvasTex(512,32,(g,W,H)=>{ for(let i=0;i<16;i++){ g.fillStyle=i%2?'#f4f4f4':'#d8352f'; g.fillRect(i*32,0,32,H); } }); bar.shared=false;
  const bm=new T.Mesh(new T.PlaneGeometry(W2-0.5,0.14),new T.MeshBasicMaterial({map:bar,side:T.DoubleSide})); bm.position.set(cxr,2.15,zg+0.03); world.add(bm);
  // 紅色禁停線：由坡道口向南張開
  const red=new T.MeshBasicMaterial({color:0xd7261e,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2});
  [[xa-0.35,-1],[xb+0.35,1]].forEach(([x,sg_])=>{ const gq=new T.BufferGeometry(), x2=x+sg_*6.5, z2=zs+8, t=0.18;
    gq.setAttribute('position',new T.BufferAttribute(new Float32Array([x-t,0.012,zs, x+t,0.012,zs, x2+t,0.012,z2, x2-t,0.012,z2]),3)); gq.setIndex([0,2,1,0,3,2]);
    const mq=new T.Mesh(gq,red); mq.material.side=T.DoubleSide; world.add(mq); });
  // 黃黑警示緣石（坡面兩側，每 0.6 m 換色）＋入口門型遮雨棚（S12，台灣常見樣式，示意）
  { const Yl=C3('#e7bb1f'), Bk=C3('#262626'), yAt=(z)=>-drop*(zs-z)/L; let k=0;
    for(let z=zs-0.3;z>R.z0+0.3;z-=0.6,k++) for(const x of [xa+0.42,xb-0.42]) vcBox(0,x-0.11,yAt(z)-0.05,z-0.3,x+0.11,yAt(z)+0.15,z+0.3,k%2?Bk:Yl);
    const z0c=zc+0.2, z1c=zc+5.2, gy=C3('#c9ced1'), st=C3('#8d9499');
    for(const x of [xa-0.35,xb+0.35]) for(const z of [z0c+0.2,z1c-0.2]) vcStick(0,[x,0,z],[x,4.0,z],0.09,st,8);
    vcBox(0,xa-0.6,4.0,z0c,xb+0.6,4.15,z1c,gy); vcBox(0,xa-0.6,3.75,z1c-0.08,xb+0.6,4.15,z1c,st); vcBox(0,xa-0.6,3.75,z0c,xb+0.6,4.15,z0c+0.08,st); }
  // 交通錐
  const cone=lam('#ee6a1e'); [xa-0.9,xb+0.9].forEach(x=>{ const c=new T.Mesh(new T.CylinderGeometry(0.02,0.16,0.7,10),cone); c.position.set(x,0.35,zs+0.4); world.add(c); });
  ib.flush();
}
/* ---------- 棟名標示（白色直排字，位置為示意）＋ 蒙萌園圓窗立面（示意） ---------- */
function buildSigns(){
  const BB={}; m.ROOMS.filter(r=>!r.solid&&r.f<4&&r.name!=='警衛室').concat(STAIRS).forEach(r=>{ const fmax=r.stair?Math.max(...r.fl.filter(f=>f<4)):r.f;
    const b=BB[r.bld]||(BB[r.bld]={x0:1e9,x1:-1e9,z0:1e9,z1:-1e9,top:0,sr:null,er:null}); b.x0=Math.min(b.x0,r.X0); b.x1=Math.max(b.x1,r.X1); b.z0=Math.min(b.z0,r.Z0); b.z1=Math.max(b.z1,r.Z1); b.top=Math.max(b.top,fmax+1);
    if(!b.sr||r.Z1>b.sr.Z1) b.sr=r; });
  const mk=(txt,col)=>{ const t=canvasTex(128,128*txt.length*0.9|0,(g,W,H)=>{ g.clearRect(0,0,W,H); g.fillStyle=col||'#f4f4f1'; g.strokeStyle=col?'rgba(255,255,255,.25)':'rgba(0,0,0,.35)'; g.lineWidth=col?2:4; g.textAlign='center'; g.textBaseline='middle'; g.font='700 92px '+FONT;
      [...txt].forEach((ch,i)=>{ const y=(i+0.5)*H/txt.length; g.strokeText(ch,W/2,y); g.fillText(ch,W/2,y); }); }); t.shared=false; return new T.MeshBasicMaterial({map:t,transparent:true,side:T.DoubleSide,depthWrite:false}); };
  const put=(txt,x,y,z,ry,col)=>{ const h=0.62*txt.length, p=new T.Mesh(new T.PlaneGeometry(0.62,h),mk(txt,col)); p.position.set(x,y,z); p.rotation.y=ry; world.add(p); };
  const K=BB.K, Mm=BB.M, J=BB.J;
  const colTop=(sr)=>{ let t=sr.f+1; m.ROOMS.forEach(r=>{ if(r.bld!==sr.bld||r.solid||r.f>=4) return; const ox=Math.min(r.X1,sr.X1)-Math.max(r.X0,sr.X0), oz=Math.min(r.Z1,sr.Z1)-Math.max(r.Z0,sr.Z0); if(ox>2&&oz>2) t=Math.max(t,r.f+1); }); return t; };
  if(K) put('蒙萌園',K.sr.X1+0.06,colTop(K.sr)*FH-1.6,K.sr.cz,Math.PI/2);          // 面向坡道的東牆（使用者照片）
  if(Mm) put('沐風苑',Mm.sr.cx,colTop(Mm.sr)*FH-1.6,Mm.sr.Z1+0.06,0,'#5d6266');          // 灰色金屬直書字（照片 mengmeng_mufeng_courtyard_a）
  if(J) put('集賢樓',J.sr.X1-1.2,colTop(J.sr)*FH-1.6,J.sr.Z1+0.31,0,'#5d6266');             // 東端頂部灰色直書字（照片 jixian_facade_3_4f）；+0.31：在 0.25 m 磚外皮之外
  if(K){ // 蒙萌園：白色方盒立面上的大小圓窗（示意）
    const cv=canvasTex(1024,448,(g,W,H)=>{ g.fillStyle='#e9eaea'; g.fillRect(0,0,W,H); const C=[[150,220,92,'#6fa3c6'],[300,150,64,'#f3c43a'],[440,230,98,'#7db3cf'],[600,140,56,'#8ab9d2'],[700,250,80,'#f3c43a'],[860,160,70,'#6fa3c6'],[930,300,50,'#8ab9d2']];
      C.forEach(([x,y,r,c])=>{ g.fillStyle='#fff'; g.beginPath(); g.arc(x,y,r+10,0,7); g.fill(); g.strokeStyle='#9aa0a4'; g.lineWidth=4; g.stroke(); g.fillStyle=c; g.beginPath(); g.arc(x,y,r,0,7); g.fill(); }); }); cv.shared=false;
    const pw=Math.min(8,K.sr.w*0.95), pnl=new T.Mesh(new T.PlaneGeometry(pw,pw*448/1024),new T.MeshBasicMaterial({map:cv})); pnl.position.set(K.sr.cx,colTop(K.sr)*FH-1.9,K.sr.Z1+0.07); world.add(pnl); }
}
  m.ROOMS.forEach(r=>{ if(['潛能教室','電腦教室','音樂教室'].includes(r.name)) r.ribbon=true; });
  const FIB = FG.map(g => IB(g));   // 各樓層共用的方塊批次（buildFloors、buildChuantang 都加進來，最後一次合併）
  buildGround(); buildFloors(); buildChuantang(); buildStage(); buildFinBox(); buildSlide(); buildTower(); buildGuard(); buildPlanters(); buildGarage(); FIB.forEach(b => b.flush()); buildFence(); buildDecor(); buildTrees(); buildTreeSupports(); buildRamp(); buildSigns(); flushProps(); flushSigns();
  return { root, FG, CAN, UNDER, PILLARS, WINDOWS, FINBOX, PLANTERS: PLANTERS.planters.length, get groundMesh() { return groundMesh; }, get groundBox() { return groundBox; }, GATE, ACC, GB };
}
