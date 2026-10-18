import * as THREE from 'three';
// 東新版場景工廠：把 buildModel() 的房間／走廊／樓梯／戶外資料，用 slice 的 Batch + 材質做成 3D。
// 幾何依據：使用者上傳設計圖推得的格網（房間矩形、走廊遮罩、梯間）；立面語彙（走廊側灰框玻璃隔間＋木門、綠色欄杆、圓柱）沿用 slice 的照片語彙。
// 全部屬「示意」：房間名稱暫定、尺寸為圖面推得近似值。
import { Batch } from '../scene/batch.js';

export function buildDongxinScene(m, MS, opts = {}) {
  const T = THREE, { D, SC, CELL, GW, GH, WX0, WZ0, FH, NF, NL, UP, DN, LY, RANK, ci, cj, BYFLOOR, STAIRS, NAV, RC, CORR, PLACES, STR_N, clampN } = m;
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
  const signTex = (name, color) => canvasTex(256, 96, (g, w, h) => {
    g.fillStyle = color; roundRect(g, 2, 2, w - 4, h - 4, 16); g.fill(); g.strokeStyle = 'rgba(255,255,255,.6)'; g.lineWidth = 3; roundRect(g, 8, 8, w - 16, h - 16, 11); g.stroke();
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; fit(g, name, w - 36, 52, '700'); g.fillText(name, w / 2, h / 2 + 2); });

  // 場景角色 → 材質：全部來自材質 JSON 的 roles（換校＝換 JSON）。facade.* / roof.* 為各棟立面與屋頂。
  const M = Object.assign({}, MS.roles), R = (k) => MS.role(k);
  M.acc = MS.acc;
  const GB = { x0: 1130 * SC, x1: 1360 * SC, z: 1022 * SC };            // 校門：警衛室東側的藍色伸縮門（平面圖粉紅線處）
  const GATE = PLACES.find(p => p.name === '校門');
  const UNIT = new T.BoxGeometry(1, 1, 1), CYL = new T.CylinderGeometry(0.5, 0.5, 1, 12);
  const root = new T.Group(); root.name = 'dongxin';
  const world = root;
  const PILLARS = [], CAN = [], UNDER = [], FG = [];
  for (let f = 0; f < NL; f++) { const g = new T.Group(); g.name = 'F' + f; FG.push(g); root.add(g); }
  let groundMesh = null, groundBox = null;

  // 方塊批次：軸對齊 → Batch（合併、UV 以世界公尺）；旋轉 / 圓柱 → InstancedMesh
  function IB(parent) {
    const B = new Batch(), rot = new Map(), cyls = [];
    return {
      cyl(mat, dia, h, x, y, z) { cyls.push([mat, dia, h, x, y, z]); },
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

  /* ---------- 建築（自舊版移植，改用 slice 材質／Batch）---------- */
function hasAbove(r){
  const up=UP[r.f], list=up>=0?BYFLOOR[up]:[]; const area=r.w*r.d;
  const ov=o=>Math.max(0,Math.min(r.X1,o.X1)-Math.max(r.X0,o.X0))*Math.max(0,Math.min(r.Z1,o.Z1)-Math.max(r.Z0,o.Z0));
  for(const o of list) if(ov(o)>area*0.25) return true;
  for(const s of STAIRS) if(up>=0&&s.fl.includes(up)&&ov(s)>area*0.25) return true;
  return false;
}
function wallSegs(ib,r,y0,mat,accMat,door){
  const T_=SLAB, wh=WALL_H, yc=y0+wh/2, bandY=y0+wh-0.2;
  const sides=[
    {s:'N',ax:'x',a:r.X0,b:r.X1,fix:r.Z0+T_/2},{s:'S',ax:'x',a:r.X0,b:r.X1,fix:r.Z1-T_/2},
    {s:'W',ax:'z',a:r.Z0,b:r.Z1,fix:r.X0+T_/2},{s:'E',ax:'z',a:r.Z0,b:r.Z1,fix:r.X1-T_/2}];
  const OPP={N:'S',S:'N',W:'E',E:'W'};
  sides.forEach(sd=>{
    const sm=r.stair?R('facade.stair'):(r.ribbon?R('facade.ribbon'):r.bld==='K'?R('facade.K'):r.bld==='M'?R('facade.M'):((door&&sd.s===OPP[door.side])?R('facade.J'):R('facade.J.side')));
    const IN={N:1,S:-1,W:1,E:-1}[sd.s];
    const put=(a,b,y,h,m,thick)=>{ if(b-a<0.02) return; const len=b-a, c=(a+b)/2;
      if(sd.ax==='x') ib.add(m,len,h,thick,c,y,sd.fix); else ib.add(m,thick,h,len,sd.fix,y,c);
      if(m===sm&&!r.stair){ const o=sd.fix+IN*(T_/2+0.015); // 室內面：米白粉刷
        if(sd.ax==='x') ib.add(M.wall,len,h,0.03,c,y,o); else ib.add(M.wall,0.03,h,len,o,y,c); } };
    if(r.stair&&door&&!(sd.s==='S'&&door.side!=='S')){ // 梯塔：只有朝南（校門側、掛鐘）那面是實牆，其餘三面開放：走廊側完全開口，其他側只留欄杆
      const len=sd.b-sd.a, c=(sd.a+sd.b)/2, w=len, isDoor=(sd.s===door.side);
      if(sd.ax==='x'){ if(!isDoor) ib.add(M.rail,w,1.1,0.1,c,y0+0.55,sd.fix); ib.add(M.conc,w,0.35,T_,c,y0+wh-0.17,sd.fix); ib.add(M.conc,0.35,wh,0.35,sd.a+0.17,y0+wh/2,sd.fix); ib.add(M.conc,0.35,wh,0.35,sd.b-0.17,y0+wh/2,sd.fix); }
      else { if(!isDoor) ib.add(M.rail,0.1,1.1,w,sd.fix,y0+0.55,c); ib.add(M.conc,T_,0.35,w,sd.fix,y0+wh-0.17,c); ib.add(M.conc,0.35,wh,0.35,sd.fix,y0+wh/2,sd.a+0.17); ib.add(M.conc,0.35,wh,0.35,sd.fix,y0+wh/2,sd.b-0.17); }
      return; }
    if(!r.stair&&door&&sd.s===door.side){ corridorFace(ib,sd,r,door,y0,wh); return; }
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
function doorSign(g,r,door,y0,text,col){
  const tex=signTex(text,col); tex.shared=false;
  const mat=new T.MeshBasicMaterial({map:tex,side:T.FrontSide});
  const rot={N:Math.PI,S:0,E:Math.PI/2,W:-Math.PI/2}[door.side];
  const nx=door.nx,nz=door.nz, off=SLAB/2+0.03;
  [1,-1].forEach(dir=>{
    const m=new T.Mesh(new T.PlaneGeometry(1.7,0.64),mat); m.position.set(door.x+nx*off*dir,y0+DOOR_H+0.62,door.z+nz*off*dir);
    m.rotation.y=rot+(dir<0?Math.PI:0); g.add(m);
  });
}
function buildStairInterior(ib,g,s,f){
  const hs=FH/(2*STR_N), dl=s.L/STR_N, y0=LY(f), yM=y0+FH/2, W=s.sh, wlane=s.ww;
  // 以 (u 範圍, v 範圍, y 範圍) 加方塊（u 沿梯跑方向，v 橫向）
  const box=(m,ua,ub,va,vb,ya,yb)=>{ const uc=(ua+ub)/2, vc=(va+vb)/2, du=ub-ua, dv=vb-va, h=yb-ya, p=s.P(uc,vc,(ya+yb)/2);
    if(s.along==='x') ib.add(m,du,h,dv,p.x,p.y,p.z); else ib.add(m,dv,h,du,p.x,p.y,p.z); };
  if(DN[f]>=0&&s.fl.includes(DN[f])){ // 本層樓板：入口平台、轉折平台、下半側；下層上來的梯跑通過的開口不鋪
    const t=SLAB, hw=s.Lt/2;
    box(M.slab,-hw,s.uA,-W/2,W/2,y0-t,y0);
    box(M.slab,s.uB,hw,-W/2,W/2,y0-t,y0);
    box(M.slab,s.uA,s.uB,-W/2,0,y0-t,y0);
  }
  if(UP[f]<0||!s.fl.includes(UP[f])) return;
  // 第一跑（下側 v<0）：A→B 上升半層，實心踏階
  for(let k=0;k<STR_N;k++){ const ua=s.uA+k*dl, ub=ua+dl, top=y0+(k+1)*hs;
    box(M.step,ua,ub,-s.lane-wlane/2,-s.lane+wlane/2,y0,top); }
  // 轉折平台（B 端）
  box(M.slab,s.uB,s.Lt/2,-W/2,W/2,yM-SLAB,yM);
  // 第二跑（上側 v>0）：B→A 再上升半層，懸挑踏階（下方留空）
  for(let k=0;k<STR_N;k++){ const ub=s.uB-k*dl, ua=ub-dl, top=yM+(k+1)*hs;
    box(M.step,ua,ub,s.lane-wlane/2,s.lane+wlane/2,top-0.28,top); }
  // 中央矮牆（兩跑之間）與外側扶手
  box(M.rail,s.uA,s.uB,-0.04,0.04,y0+0.0,y0+1.0+0.0);
}
function buildFloors(){
  for(let f=0;f<NL;f++){
    const g=FG[f], ib=IB(g), y0=LY(f), UPR=(f>=1&&f<=3), GARAGE=(f===4), CEIL=[];
    const rooms=BYFLOOR[f].concat(STAIRS.filter(s=>s.fl.includes(f)));
    rooms.forEach(r=>{
      const isSt=!!r.stair, tp=isSt?'t':r.t, acc=M.acc[tp]||M.acc.p;
      // 樓板／地板
      if(!isSt){ if(UPR) ib.add(M.slab,r.w+0.3,SLAB,r.d+0.3,r.cx,y0-SLAB/2,r.cz); else ib.add(M.floor,r.w,0.08,r.d,r.cx,y0+0.04,r.cz);
        if(UPR) ib.add(M.floor,r.w-0.6,0.03,r.d-0.6,r.cx,y0+0.015,r.cz); }
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
        if(isSt) buildStairInterior(ib,g,r,f);
        doorSign(g,r,door,y0,isSt?'樓梯':r.name,ACC[tp]);
      }
      // 屋頂
      const top=isSt?(UP[f]<0||!r.fl.includes(UP[f])):(!hasAbove(r)&&!GARAGE);
      if(top) ib.add(R('roof.'+r.bld)||M.roof,r.w+0.2,SLAB,r.d+0.2,r.cx,y0+FH-SLAB/2,r.cz);
    });
    // 走廊樓板（上層）
    if(f>0){
      const n=NAV[f], rc=RC[f]; const run=new Map();
      const used=new Uint8Array(GW*GH); const rects=[];
      for(let j=0;j<GH;j++) for(let i=0;i<GW;i++){
        const k=j*GW+i; if(used[k]||!n[k]||rc[k]>=0) continue;
        let i2=i; while(i2+1<GW&&n[j*GW+i2+1]&&rc[j*GW+i2+1]<0&&!used[j*GW+i2+1]) i2++;
        let j2=j; outer: while(j2+1<GH){ for(let x=i;x<=i2;x++){ const q=(j2+1)*GW+x; if(!n[q]||rc[q]>=0||used[q]) break outer; } j2++; }
        for(let y=j;y<=j2;y++) for(let x=i;x<=i2;x++) used[y*GW+x]=1;
        rects.push([i,j,i2,j2]);
      }
      rects.forEach(([i,j,i2,j2])=>{ const w=(i2-i+1)*CELL, d=(j2-j+1)*CELL, cx=WX0+(i+(i2-i+1)/2)*CELL, cz=WZ0+(j+(j2-j+1)/2)*CELL;
        ib.add(GARAGE?M.garage:M.slabTop,w+0.02,SLAB,d+0.02,cx,y0-SLAB/2,cz); if(GARAGE) CEIL.push([w+0.02,SLAB,d+0.02,cx,-0.3,cz]); });
    }
    // 邊緣：欄杆（上層）、柱子（全部樓層）
    { const n=NAV[f], rc=RC[f];
      const inC=(i,j)=>{ if(i<0||j<0||i>=GW||j>=GH) return false; const k=j*GW+i; return rc[k]<0&&n[k]&&(f>0||CORR[0][k]); };
      const edge=(i,j)=>{ if(i<0||j<0||i>=GW||j>=GH) return true; const k=j*GW+i; return !inC(i,j)&&rc[k]<0; };
      const seg=(ax,fix,a,b)=>{ const len=b-a; if(len<0.1) return; const c=(a+b)/2;
        if(GARAGE){ if(ax==='x') ib.add(M.conc,len,FH-0.2,0.3,c,y0+(FH-0.2)/2,fix); else ib.add(M.conc,0.3,FH-0.2,len,fix,y0+(FH-0.2)/2,c); }
        else if(f>0){ if(ax==='x') ib.add(M.rail,len,1.05,0.07,c,y0+0.53,fix); else ib.add(M.rail,0.07,1.05,len,fix,y0+0.53,c); }
        const q=Math.max(1,Math.round(len/5.5));
        for(let t=0;t<=q;t++){ const p=a+len*t/q, px=ax==='x'?p:fix, pz=ax==='x'?fix:p;
          let yb=y0; if(UPR){ let ok=false; for(const [dx,dz] of [[0,0],[0.25,0],[-0.25,0],[0,0.25],[0,-0.25]]){ const ii=ci(px+dx), jj=cj(pz+dz); if(ii<0||jj<0||ii>=GW||jj>=GH) continue; const kk=jj*GW+ii; if(RC[f-1][kk]>=0||CORR[f-1][kk]) ok=true; } if(!ok) yb=0; }
          ib.cyl(M.conc,0.34,y0+FH-0.15-yb,px,(yb+y0+FH-0.15)/2,pz); PILLARS.push({f,x:px,z:pz}); } };
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
        } }
      // 雨遮（頂層走廊或上方無結構的走廊）
      const can=new T.Group(); can.name='CAN'+f; CAN[f]=can; world.add(can); const cb=IB(can); UNDER[f]=new Uint8Array(GW*GH); CEIL.forEach(c=>cb.add(M.slab,...c));
      const used=new Uint8Array(GW*GH), cov=new Uint8Array(GW*GH);
      for(let k=0;k<GW*GH;k++){ if(!(rc[k]<0&&n[k]&&(f>0||CORR[0][k]))) continue;
        const up=UP[f], above=GARAGE||(up>=0&&(NAV[up][k]||RC[up][k]>=0)); if(above) UNDER[f][k]=1; else { cov[k]=1; UNDER[f][k]=1; } }
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
    ib.flush();
  }
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
  STAIRS.forEach(st=>{ if(!st.fl.includes(4)) return; const a=st.P(st.uA+0.02,0.0,0), b=st.P(st.uB,st.sh/2,0);
    const xa=Math.min(a.x,b.x), xb=Math.max(a.x,b.x), za=Math.min(a.z,b.z), zb=Math.max(a.z,b.z); const hp=new T.Path();
    hp.moveTo(xa,-za); hp.lineTo(xa,-zb); hp.lineTo(xb,-zb); hp.lineTo(xb,-za); hp.lineTo(xa,-za); shp.holes.push(hp); });
  { const R=RAMP, hp=new T.Path(), xa=R.x0, xb=R.x1, za=R.z0+R.cover, zb=R.z1; hp.moveTo(xa,-za); hp.lineTo(xa,-zb); hp.lineTo(xb,-zb); hp.lineTo(xb,-za); hp.lineTo(xa,-za); shp.holes.push(hp); }
  const gg=new T.ShapeGeometry(shp); gg.rotateX(-Math.PI/2);
  { const pos=gg.attributes.position, uv=new Float32Array(pos.count*2); for(let i=0;i<pos.count;i++){ uv[i*2]=(pos.getX(i)-x0)/w; uv[i*2+1]=1-(pos.getZ(i)-z0)/h; } gg.setAttribute('uv',new T.BufferAttribute(uv,2)); }
  const gm=new T.MeshBasicMaterial({map:t,color:0xf2f2f2});
  groundDetail(gm, R('ground.detail'));
  const m=new T.Mesh(gg,gm);
  m.name='ground_plan'; m.userData.planReady=planReady; m.position.set(0,-0.02,0); world.add(m); groundMesh=m;   // planReady：底圖載入完成（ao.js 把地面 AO 乘進底圖）
}
// 地面細節：把圖片型鋪面紋理（材質角色 ground.detail）以世界公尺鋪在底圖上，只作用在底圖的「鋪面色」（低彩度、非綠、非線條），
// 草地、跑道、球場保留底圖原色。細節除以貼圖平均色，只加明暗紋理、不改底圖色調；遠處 mipmap 平均後自然淡出。
// 只有圖片載入成功才開啟（程式化備援或換膜沒有圖片時，地面與原本完全相同）。
function groundDetail(mat, det){
  const tx=det&&det.map; if(!tx||!tx.userData.image) return;
  const U={uDet:{value:tx},uDetK:{value:0},uDetScale:{value:tx.repeat},uDetMean:{value:new T.Vector3(1,1,1)}};
  tx.userData.ready.then(r=>{ if(r.ok){ U.uDetMean.value.set(...r.mean); U.uDetK.value=opts.groundDetail??0.45; } });
  mat.onBeforeCompile=(sh)=>{ Object.assign(sh.uniforms,U);
    sh.vertexShader=sh.vertexShader.replace('#include <common>','#include <common>\nvarying vec2 vWXZ;').replace('#include <begin_vertex>','#include <begin_vertex>\nvWXZ=(modelMatrix*vec4(transformed,1.0)).xz;');
    sh.fragmentShader=sh.fragmentShader.replace('#include <common>','#include <common>\nvarying vec2 vWXZ;uniform sampler2D uDet;uniform float uDetK;uniform vec2 uDetScale;uniform vec3 uDetMean;')
      .replace('#include <map_fragment>',`#include <map_fragment>
      { vec3 pc=diffuseColor.rgb; float mx=max(pc.r,max(pc.g,pc.b)), mn=min(pc.r,min(pc.g,pc.b)), sat=(mx-mn)/max(mx,1e-3);
        float w=(1.0-smoothstep(0.13,0.22,sat))*(1.0-smoothstep(0.0,0.04,pc.g-pc.r))*smoothstep(0.5,0.65,mx);
        vec3 d=texture2D(uDet,vWXZ*uDetScale).rgb/uDetMean; diffuseColor.rgb*=mix(vec3(1.0),d,w*uDetK); }`); };
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
  // 川堂二樓欄板：彩色幾何壁畫（朝向挑空的川堂）
  { const mt=canvasTex(2048,256,(g,w,h)=>{ g.fillStyle='#e9e9e4'; g.fillRect(0,0,w,h); const cols=['#f06b8a','#2f8fd8','#35b7c9','#f3d34a','#2b4aa8','#8fd0a8','#f2a1b6','#8fa7c8'];
      const r=rng(11); for(let i=0;i<22;i++){ const x=i*w/21-60, ww=140+r()*160, hh=80+r()*150; g.fillStyle=cols[(r()*cols.length)|0]; g.beginPath(); g.moveTo(x,h); g.lineTo(x+ww/2,h-hh); g.lineTo(x+ww,h); g.closePath(); g.fill();
        g.strokeStyle='#fff'; g.lineWidth=6; g.stroke(); g.fillStyle=cols[(r()*cols.length)|0]; g.fillRect(x+ww*0.3,h-hh*0.45,ww*0.4,hh*0.2); } });
    mt.shared=false; const mm=new T.MeshBasicMaterial({map:mt,side:T.DoubleSide});
    const z0=455*SC, x0=1065*SC, x1=1235*SC; const pl=new T.Mesh(new T.PlaneGeometry(x1-x0,1.15),mm); pl.position.set((x0+x1)/2,FH+0.62,z0+0.06); world.add(pl);
    const z1=562*SC; const p2=new T.Mesh(new T.PlaneGeometry(x1-x0,1.15),mm); p2.position.set((x0+x1)/2,FH+0.62,z1-0.06); world.add(p2); }
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
    ib.add(M.conc,6,2.4,0.5,GB.x1+3.2,1.2,gz-0.3);
    ib.add(M.rail,0.3,3.2,0.3,GB.x1+5.2,1.6,gz-0.3);
  }
  ib.flush();
}
function buildTrees(){
  const list=D.trees, n=list.length; if(!n) return;
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
  // 交通錐
  const cone=lam('#ee6a1e'); [xa-0.9,xb+0.9].forEach(x=>{ const c=new T.Mesh(new T.CylinderGeometry(0.02,0.16,0.7,10),cone); c.position.set(x,0.35,zs+0.4); world.add(c); });
  ib.flush();
}
/* ---------- 棟名標示（白色直排字，位置為示意）＋ 蒙萌園圓窗立面（示意） ---------- */
function buildSigns(){
  const BB={}; m.ROOMS.filter(r=>!r.solid&&r.f<4&&r.name!=='警衛室').concat(STAIRS).forEach(r=>{ const fmax=r.stair?Math.max(...r.fl.filter(f=>f<4)):r.f;
    const b=BB[r.bld]||(BB[r.bld]={x0:1e9,x1:-1e9,z0:1e9,z1:-1e9,top:0,sr:null,er:null}); b.x0=Math.min(b.x0,r.X0); b.x1=Math.max(b.x1,r.X1); b.z0=Math.min(b.z0,r.Z0); b.z1=Math.max(b.z1,r.Z1); b.top=Math.max(b.top,fmax+1);
    if(!b.sr||r.Z1>b.sr.Z1) b.sr=r; });
  const mk=(txt)=>{ const t=canvasTex(128,128*txt.length*0.9|0,(g,W,H)=>{ g.clearRect(0,0,W,H); g.fillStyle='#f4f4f1'; g.strokeStyle='rgba(0,0,0,.35)'; g.lineWidth=4; g.textAlign='center'; g.textBaseline='middle'; g.font='700 92px '+FONT;
      [...txt].forEach((ch,i)=>{ const y=(i+0.5)*H/txt.length; g.strokeText(ch,W/2,y); g.fillText(ch,W/2,y); }); }); t.shared=false; return new T.MeshBasicMaterial({map:t,transparent:true,side:T.DoubleSide,depthWrite:false}); };
  const put=(txt,x,y,z,ry)=>{ const h=0.62*txt.length, p=new T.Mesh(new T.PlaneGeometry(0.62,h),mk(txt)); p.position.set(x,y,z); p.rotation.y=ry; world.add(p); };
  const K=BB.K, Mm=BB.M, J=BB.J;
  const colTop=(sr)=>{ let t=sr.f+1; m.ROOMS.forEach(r=>{ if(r.bld!==sr.bld||r.solid||r.f>=4) return; const ox=Math.min(r.X1,sr.X1)-Math.max(r.X0,sr.X0), oz=Math.min(r.Z1,sr.Z1)-Math.max(r.Z0,sr.Z0); if(ox>2&&oz>2) t=Math.max(t,r.f+1); }); return t; };
  if(K) put('蒙萌園',K.sr.X1+0.06,colTop(K.sr)*FH-1.6,K.sr.cz,Math.PI/2);          // 面向坡道的東牆（使用者照片）
  if(Mm) put('沐風苑',Mm.sr.cx,colTop(Mm.sr)*FH-1.6,Mm.sr.Z1+0.06,0);
  if(J) put('集賢樓',J.sr.X1-1.2,colTop(J.sr)*FH-1.6,J.sr.Z1+0.06,0);
  if(K){ // 蒙萌園：白色方盒立面上的大小圓窗（示意）
    const cv=canvasTex(1024,448,(g,W,H)=>{ g.fillStyle='#e9eaea'; g.fillRect(0,0,W,H); const C=[[150,220,92,'#6fa3c6'],[300,150,64,'#f3c43a'],[440,230,98,'#7db3cf'],[600,140,56,'#8ab9d2'],[700,250,80,'#f3c43a'],[860,160,70,'#6fa3c6'],[930,300,50,'#8ab9d2']];
      C.forEach(([x,y,r,c])=>{ g.fillStyle='#fff'; g.beginPath(); g.arc(x,y,r+10,0,7); g.fill(); g.strokeStyle='#9aa0a4'; g.lineWidth=4; g.stroke(); g.fillStyle=c; g.beginPath(); g.arc(x,y,r,0,7); g.fill(); }); }); cv.shared=false;
    const pw=Math.min(8,K.sr.w*0.95), pnl=new T.Mesh(new T.PlaneGeometry(pw,pw*448/1024),new T.MeshBasicMaterial({map:cv})); pnl.position.set(K.sr.cx,colTop(K.sr)*FH-1.9,K.sr.Z1+0.07); world.add(pnl); }
}
  m.ROOMS.forEach(r=>{ if(['潛能教室','電腦教室','音樂教室'].includes(r.name)) r.ribbon=true; });
  buildGround(); buildFloors(); buildFence(); buildDecor(); buildTrees(); buildRamp(); buildSigns();
  return { root, FG, CAN, UNDER, PILLARS, get groundMesh() { return groundMesh; }, get groundBox() { return groundBox; }, GATE, ACC, GB };
}
