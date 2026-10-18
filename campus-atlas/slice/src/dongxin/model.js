// 東新國小資料層（由上傳設計圖推得的格網資料 → 房間／走廊／樓梯／門／可走格／路徑規劃）。不依賴 three.js，可在 Node 測試。
// 資料來源：data/dongxin_geo.json（使用者上傳的設計圖；房間名稱為暫定，尺寸為由圖面推得之近似值，非校方測繪）。
export function buildModel(D){
const SC=D.SC, CELL=4*SC, GX0=D.grid[0], GY0=D.grid[1], GW=D.grid[2], GH=D.grid[3];
const WX0=GX0*SC, WZ0=GY0*SC, FH=3.9, NF=4, NL=5;   // NF=地上樓層數；NL=含地下一層(內部編號4=B1)
const UP=[1,2,3,-1,0], DN=[4,0,1,2,-1], LY=f=>f===4?-FH:f*FH, RANK=f=>f===4?-1:f;
const clampN=(v,a,b)=>Math.max(a,Math.min(b,v));
const ci=x=>Math.floor((x-WX0)/CELL), cj=z=>Math.floor((z-WZ0)/CELL);
const cxm=i=>WX0+(i+0.5)*CELL, czm=j=>WZ0+(j+0.5)*CELL;
function unrle(r){ const a=new Uint8Array(GW*GH); let p=0,v=0; for(const n of r){ if(v) a.fill(1,p,p+n); p+=n; v^=1; } return a; }
const WALK0=unrle(D.masks.w0), CORR=[0,1,2,3,4].map(f=>unrle(D.masks['c'+f]));
const TYPE_LABEL={c:'教室',s:'專科',o:'行政',k:'幼兒園',w:'廁所',p:'戶外'};
const levelLabel=f=>f===4?'B1':(f+1)+'F';

const ROOMS=[], PLACES=[], STAIRS=[], BYFLOOR=[[],[],[],[],[]];
function snapRect(o){
  const i0=ci(o.x0+CELL*0.5), j0=cj(o.z0+CELL*0.5), i1=Math.max(i0+3,ci(o.x1-CELL*0.5)), j1=Math.max(j0+3,cj(o.z1-CELL*0.5));
  o.i0=i0;o.j0=j0;o.i1=i1;o.j1=j1;
  o.X0=WX0+i0*CELL; o.X1=WX0+(i1+1)*CELL; o.Z0=WZ0+j0*CELL; o.Z1=WZ0+(j1+1)*CELL;
  o.cx=(o.X0+o.X1)/2; o.cz=(o.Z0+o.Z1)/2; o.w=o.X1-o.X0; o.d=o.Z1-o.Z0;
}
for(let f=0;f<NL;f++){
  (D.rooms[f]||[]).forEach(a=>{
    const [name,t,x,y,w,h]=a; if(t==='t') return;
    if(f===0&&name==='司令台') return;   // 司令台不是房間：開放式平台＋雨遮（S9，見下方 STAGE）
    const r={name,t,f,x0:x*SC,z0:y*SC,x1:(x+w)*SC,z1:(y+h)*SC,code:t==='c'?name:'',label:levelLabel(f),solid:t==='w'};
    snapRect(r); r.idx=ROOMS.length; ROOMS.push(r); BYFLOOR[f].push(r);
  });
}
D.stairs.forEach((s,k)=>{
  const [x,y,w,h]=s.r; const o={id:s.id,fl:s.f.slice(),name:'樓梯',t:'t',x0:x*SC,z0:y*SC,x1:(x+w)*SC,z1:(y+h)*SC,doors:{},stair:true};
  snapRect(o); STAIRS.push(o);
});

function recomp(o){ o.X0=WX0+o.i0*CELL; o.X1=WX0+(o.i1+1)*CELL; o.Z0=WZ0+o.j0*CELL; o.Z1=WZ0+(o.j1+1)*CELL;
  o.cx=(o.X0+o.X1)/2; o.cz=(o.Z0+o.Z1)/2; o.w=o.X1-o.X0; o.d=o.Z1-o.Z0; }
// 讓相鄰房間貼合成連續的量體：縫隙 ≤ GAP 格就合併到中線；與樓梯間貼合時只動房間
(function clampToStairs(){ // 房間不得侵入梯間範圍
  for(let f=0;f<NL;f++) for(const r of BYFLOOR[f]) for(const s of STAIRS){ if(!s.fl.includes(f)) continue;
    const px=Math.min(r.i1,s.i1)-Math.max(r.i0,s.i0)+1, py=Math.min(r.j1,s.j1)-Math.max(r.j0,s.j0)+1; if(px<=0||py<=0) continue;
    if(px<=py){ if(r.i0+r.i1<s.i0+s.i1) r.i1=s.i0-1; else r.i0=s.i1+1; } else { if(r.j0+r.j1<s.j0+s.j1) r.j1=s.j0-1; else r.j0=s.j1+1; }
    if(r.i1-r.i0<3||r.j1-r.j0<3) console.log&&0; }
  BYFLOOR.forEach(l=>l.forEach(recomp));
})();
ROOMS.forEach(r=>{ if(['潛能教室','電腦教室','音樂教室'].includes(r.name)&&r.x0/SC>800){ r.keep=true; r.forceDoor='N'; } });
(function trimToCorridor(){ // 房間不得吃進走廊：外緣整排大多是走廊格就往內縮（保持走廊連續）
  for(let f=0;f<4;f++){ const cm=CORR[f];
    for(const r of BYFLOOR[f]){ if(r.solid||r.keep) continue;
      for(let it=0;it<14;it++){ let ch=false;
        const frac=(fn,len)=>{ let c=0,run=0,best=0; for(let t=0;t<len;t++){ if(fn(t)){ c++; run++; if(run>best) best=run; } else run=0; } return (c/len>0.6||best>=14)?1:0; };
        const w=r.i1-r.i0+1, h=r.j1-r.j0+1;
        if(w>8&&frac(t=>cm[(r.j0+t)*GW+r.i0],h)>0){ r.i0++; ch=true; }
        if(w>8&&frac(t=>cm[(r.j0+t)*GW+r.i1],h)>0){ r.i1--; ch=true; }
        if(h>8&&frac(t=>cm[r.j0*GW+r.i0+t],w)>0){ r.j0++; ch=true; }
        if(h>8&&frac(t=>cm[r.j1*GW+r.i0+t],w)>0){ r.j1--; ch=true; }
        if(!ch) break; } } }
  // 第二步：走廊被房間「從內部」吃掉一塊（寬度 ≥5 格）→ 把房間朝最近的那一邊縮回，讓走廊貫通
  for(let f=0;f<4;f++){ const cm=CORR[f], own=new Int16Array(GW*GH).fill(-1);
    BYFLOOR[f].forEach((r,idx)=>{ if(r.solid) return; for(let j=r.j0;j<=r.j1;j++) for(let i=r.i0;i<=r.i1;i++) own[j*GW+i]=idx; });
    STAIRS.forEach(s=>{ if(s.fl.includes(f)) for(let j=s.j0;j<=s.j1;j++) for(let i=s.i0;i<=s.i1;i++) own[j*GW+i]=-2; });
    const m=new Uint8Array(GW*GH), seen=new Uint8Array(GW*GH); for(let k=0;k<GW*GH;k++) m[k]=(cm[k]&&own[k]>=0)?1:0;
    for(let k=0;k<GW*GH;k++){ if(!m[k]||seen[k]) continue; const st=[k]; seen[k]=1; let c=0,i0=1e9,i1=-1,j0=1e9,j1=-1; const cnt={};
      while(st.length){ const q=st.pop(); c++; const i=q%GW, j=(q/GW)|0; i0=Math.min(i0,i); i1=Math.max(i1,i); j0=Math.min(j0,j); j1=Math.max(j1,j); cnt[own[q]]=(cnt[own[q]]||0)+1;
        for(const [di,dj] of [[1,0],[-1,0],[0,1],[0,-1]]){ const nq=(j+dj)*GW+i+di; if(m[nq]&&!seen[nq]){ seen[nq]=1; st.push(nq); } } }
      if(c<60||i1-i0<4||j1-j0<4) continue;
      let ro=-1,best=0; for(const key in cnt) if(cnt[key]>best){ best=cnt[key]; ro=+key; } const r=BYFLOOR[f][ro]; if(!r||r.keep) continue;
      const opts=[[i0-r.i0,'i1',i0-1],[r.i1-i1,'i0',i1+1],[j0-r.j0,'j1',j0-1],[r.j1-j1,'j0',j1+1]].sort((a,b)=>a[0]-b[0]); // 距離該邊最近的優先
      for(const [d,key,val] of opts){ const t={i0:r.i0,i1:r.i1,j0:r.j0,j1:r.j1}; t[key]=val; if(t.i1-t.i0>=7&&t.j1-t.j0>=7){ r[key]=val; break; } } } }
  BYFLOOR.forEach(l=>l.forEach(recomp));
})();
(function snapNeighbors(){
  const GAP=6, ov=(a0,a1,b0,b1)=>Math.min(a1,b1)-Math.max(a0,b0)+1;
  for(let pass=0;pass<2;pass++) for(let f=0;f<NL;f++){
    const L=BYFLOOR[f].concat(STAIRS.filter(s=>s.fl.includes(f)));
    for(const a of L) for(const b of L){ if(a===b) continue;
      const gapCorr=(i0,i1,j0,j1)=>{ if(f>=4) return false; let c=0,t=0; for(let j=j0;j<=j1;j++) for(let i=i0;i<=i1;i++){ t++; if(CORR[f][j*GW+i]) c++; } return t>0&&c/t>0.5; };
      if(a.i1<b.i0&&b.i0-a.i1-1<=GAP&&b.i0-a.i1-1>=0&&ov(a.j0,a.j1,b.j0,b.j1)>=4&&!gapCorr(a.i1+1,b.i0-1,Math.max(a.j0,b.j0),Math.min(a.j1,b.j1))){
        if(b.stair&&!a.stair) a.i1=b.i0-1; else if(a.stair&&!b.stair) b.i0=a.i1+1; else if(!a.stair&&!b.stair){ const m=Math.floor((a.i1+b.i0)/2); a.i1=m; b.i0=m+1; } }
      if(a.j1<b.j0&&b.j0-a.j1-1<=GAP&&b.j0-a.j1-1>=0&&ov(a.i0,a.i1,b.i0,b.i1)>=4&&!gapCorr(Math.max(a.i0,b.i0),Math.min(a.i1,b.i1),a.j1+1,b.j0-1)){
        if(b.stair&&!a.stair) a.j1=b.j0-1; else if(a.stair&&!b.stair) b.j0=a.j1+1; else if(!a.stair&&!b.stair){ const m=Math.floor((a.j1+b.j0)/2); a.j1=m; b.j0=m+1; } }
    }
  }
  BYFLOOR.forEach(l=>l.forEach(recomp));
})();
const NAV=[],ERO=[],RC=[];
for(let f=0;f<NL;f++){ NAV[f]=(f===0?WALK0:CORR[f]).slice(); RC[f]=new Int16Array(GW*GH).fill(-1); }
// 房間格子編號：房間 0..n-1，樓梯用 1000+k
for(let f=0;f<NL;f++){
  const list=BYFLOOR[f].slice(); STAIRS.forEach(s=>{ if(s.fl.includes(f)) list.push(s); });
  list.forEach(r=>{ const id=r.stair?1000+STAIRS.indexOf(r):r.idx; for(let j=r.j0;j<=r.j1;j++) for(let i=r.i0;i<=r.i1;i++) RC[f][j*GW+i]=id; });
}

/* ---------- 棟別（官方棟名：集賢樓＝行政及專科、沐風苑＝班級教室、蒙萌園＝幼兒園；依使用者說明與簡報；房間歸屬由位置推定） ---------- */
const BLD={J:'集賢樓',M:'沐風苑',K:'蒙萌園'};
function bldOf(t,px,py){ if(t==='k') return 'K'; if(px<800) return (py>900&&px<700)?'K':'M'; return 'J'; }
ROOMS.forEach(r=>{ r.bld=bldOf(r.t,(r.x0+r.x1)/2/SC,(r.z0+r.z1)/2/SC); r.bldName=BLD[r.bld]; });
STAIRS.forEach(s=>{ s.bld=bldOf('t',(s.x0+s.x1)/2/SC,(s.z0+s.z1)/2/SC); s.bldName=BLD[s.bld]; });
/* ---------- 樓梯幾何（雙跑，入口平台在 A 端，轉折平台在 B 端） ---------- */
const STR_A=1.8, STR_B=1.0, STR_N=13;   // 每跑 13 階：照片 tower_stair_flight.jpg 數得 13 個踢面 → 級高 3.9/26＝0.150 m（原 11 階＝0.177 m）
function stairInit(s){
  s.along=(s.w>=s.d)?'x':'z'; s.Lt=s.along==='x'?s.w:s.d; s.sh=s.along==='x'?s.d:s.w;
  const lo=s.along==='x'?'W':'N', hi=s.along==='x'?'E':'S';
  const score=side=>s.fl.reduce((a,f)=>a+(pickDoor(f,s,side).run||0),0);
  const sl=score(lo), sh_=score(hi); const useLo=sl>=sh_;
  s.A=useLo?'lo':'hi'; s.sgn=useLo?1:-1; s.doorSide=useLo?lo:hi;
  s.uA=-s.Lt/2+STR_A; s.uB=s.Lt/2-STR_B; s.L=s.uB-s.uA; s.lane=s.sh/4; s.ww=s.sh/2-0.35; s.fs=-1;   // fs：第一跑（往上）在 v 的哪一側（-1／+1）；時鐘梯塔依照片翻成 +1（見 TOWER）
  s.P=(u,v,y)=>s.along==='x'?{x:s.cx+s.sgn*u,z:s.cz+v,y}:{x:s.cx+v,z:s.cz+s.sgn*u,y};
  s.ent=s.P(-s.Lt/2+STR_A/2,0,0);
}
function blockShaft(f,s){ // 只有 A 端入口平台可走，中段（梯跑）與 B 端封起來
  const nav=NAV[f];
  for(let j=s.j0;j<=s.j1;j++) for(let i=s.i0;i<=s.i1;i++){
    const x=cxm(i), z=czm(j); const u=s.sgn*((s.along==='x'?x-s.cx:z-s.cz));
    if(u>s.uA-0.15) nav[j*GW+i]=0;
  }
  // 入口平台四周：只要外側不是房間就開放（梯間與走廊之間不砌牆）
  for(let j=s.j0;j<=s.j1;j++) for(let i=s.i0;i<=s.i1;i++){
    if(!(i===s.i0||i===s.i1||j===s.j0||j===s.j1)) continue;
    const x=cxm(i), z=czm(j), u=s.sgn*((s.along==='x'?x-s.cx:z-s.cz)); if(u>s.uA-0.15) continue;
    const oi=i===s.i0?i-1:i===s.i1?i+1:i, oj=j===s.j0?j-1:j===s.j1?j+1:j; if(oi<0||oj<0||oi>=GW||oj>=GH) continue;
    if(RC[f][oj*GW+oi]<0) nav[j*GW+i]=1;
  }
}
function pickDoor(f,r,only){
  const base=f===0?WALK0:CORR[f], rc=RC[f], corr=CORR[f];
  const mk=(arr)=>(i,j)=>i>=0&&j>=0&&i<GW&&j<GH&&arr[j*GW+i]&&rc[j*GW+i]<0;
  const sidesFor=(free)=>{
    const {i0,i1,j0,j1}=r;
    const sides=[
      {s:'N',n:i1-i0+1,p:(t,k)=>[i0+t,j0-k]},
      {s:'S',n:i1-i0+1,p:(t,k)=>[i0+t,j1+k]},
      {s:'W',n:j1-j0+1,p:(t,k)=>[i0-k,j0+t]},
      {s:'E',n:j1-j0+1,p:(t,k)=>[i1+k,j0+t]}];
    let best=null;
    for(const sd of sides){ if(only&&sd.s!==only) continue;
      let run=0,bestRun=0,end=-1;
      for(let t=1;t<sd.n-1;t++){ let ok=false; for(let k=1;k<=4&&!ok;k++) ok=free(...sd.p(t,k)); if(ok){ run++; if(run>bestRun){ bestRun=run; end=t; } } else run=0; }
      sd.run=bestRun; sd.end=end; if(!best||bestRun>best.run) best=sd;
    }
    return best;
  };
  let best=sidesFor(mk(corr));
  if(best.run<4&&f===0) best=sidesFor(mk(base));
  let tc;
  if(best.run<4){ best=null; }
  if(!best){ // 找不到：往南開門
    const sd={s:'S',n:r.i1-r.i0+1,run:4}; sd.end=Math.floor(sd.n/2)+2; best=sd;
  }
  if(only&&best.s!==only){ const n=(only==='N'||only==='S')?r.i1-r.i0+1:r.j1-r.j0+1; best={s:only,n,run:0,end:Math.floor(n/2)+2}; }
  const mid=best.end-Math.floor(best.run/2)+ (best.run%2===0?0:0);
  tc=clampN(mid,2,best.n-4);
  return {side:best.s,tc,run:best.run};
}
function carveRect(f,r,door){
  const nav=NAV[f];
  for(let j=r.j0;j<=r.j1;j++) for(let i=r.i0;i<=r.i1;i++){
    const ring=(i===r.i0||i===r.i1||j===r.j0||j===r.j1);
    nav[j*GW+i]=(r.solid||ring)?0:1;
  }
  if(!door) return;
  const {side,tc}=door;
  if(r.stair){ // 梯間與走廊相連的那一側完全開放（不留牆、不留門框）：整條邊都可走
    for(let t=1;t<(side==='N'||side==='S'?r.i1-r.i0:r.j1-r.j0);t++){
      let i,j; if(side==='N'){i=r.i0+t;j=r.j0;} else if(side==='S'){i=r.i0+t;j=r.j1;} else if(side==='W'){i=r.i0;j=r.j0+t;} else {i=r.i1;j=r.j0+t;}
      nav[j*GW+i]=1; }
  }
  for(let t=tc-1;t<=tc+2;t++){
    let i,j; if(side==='N'){i=r.i0+t;j=r.j0;} else if(side==='S'){i=r.i0+t;j=r.j1;} else if(side==='W'){i=r.i0;j=r.j0+t;} else {i=r.i1;j=r.j0+t;}
    nav[j*GW+i]=1;
  }
  // 門外「引道」：從門往外挖到走廊為止
  for(let t=tc-2;t<=tc+3;t++){
    for(let k=1;k<=6;k++){
      let i,j; if(side==='N'){i=r.i0+t;j=r.j0-k;} else if(side==='S'){i=r.i0+t;j=r.j1+k;} else if(side==='W'){i=r.i0-k;j=r.j0+t;} else {i=r.i1+k;j=r.j0+t;}
      if(i<0||j<0||i>=GW||j>=GH) break; const q=j*GW+i; if(RC[f][q]>=0) break;
      if(nav[q]&&k>1) break; nav[q]=1;
    }
  }
  // 門的世界座標（牆線上的中點）與門外／門內點
  const half=CELL*2; let x,z,nx=0,nz=0;
  if(side==='N'){ x=WX0+(r.i0+tc+1)*CELL; z=r.Z0; nz=-1; }
  else if(side==='S'){ x=WX0+(r.i0+tc+1)*CELL; z=r.Z1; nz=1; }
  else if(side==='W'){ z=WZ0+(r.j0+tc+1)*CELL; x=r.X0; nx=-1; }
  else { z=WZ0+(r.j0+tc+1)*CELL; x=r.X1; nx=1; }
  door.x=x; door.z=z; door.nx=nx; door.nz=nz; door.half=half; door.out={x:x+nx*0.9,z:z+nz*0.9}; door.inn={x:x-nx*1.0,z:z-nz*1.0};
}
for(let f=0;f<NL;f++){
  BYFLOOR[f].forEach(r=>{ if(r.solid){ carveRect(f,r,null); return; } r.door=pickDoor(f,r,r.forceDoor); });
  STAIRS.forEach(s=>{ if(!s.fl.includes(f)) return; if(!s.A){ stairInit(s); }
    s.doors[f]=pickDoor(f,s,s.doorSide); });
  BYFLOOR[f].forEach(r=>{ if(!r.solid) carveRect(f,r,r.door); });
  STAIRS.forEach(s=>{ if(s.fl.includes(f)){ carveRect(f,s,s.doors[f]); blockShaft(f,s); } });
}
/* ---------- 停車場坡道（蒙萌園與集賢樓之間，平面圖條紋區；使用者照片佐證）：坡道範圍不可走 ---------- */
const RAMP={x0:703*SC,x1:790*SC,z0:935*SC,z1:1062*SC,cover:3.0,drop:3.2};
{ const nav=NAV[0]; for(let j=0;j<GH;j++) for(let i=0;i<GW;i++){ const x=cxm(i), z=czm(j);
    if(x>RAMP.x0-0.15&&x<RAMP.x1+0.15&&z>RAMP.z0+RAMP.cover-0.15&&z<RAMP.z1+0.15) nav[j*GW+i]=0; } }
/* ---------- 教室桌椅（示意排列：面向黑板、保留走道；桌子所在格不可走） ---------- */
function layoutDesks(r){
  const d=r.door; if(!d||!(d.nx||d.nz)) return;
  const alongX=d.nz!==0, T=0.45, DESK_U=1.4, DESK_V=0.7, PU=2.4, PV=1.7;
  const uMin=(alongX?r.X0:r.Z0)+T+0.9, uMax=(alongX?r.X1:r.Z1)-T-0.9, Dv=alongX?r.d:r.w;
  const toW=(u,v)=>alongX?{x:u,z:d.nz>0?r.Z0+v:r.Z1-v}:{z:u,x:d.nx>0?r.X0+v:r.X1-v};
  const nc=Math.floor((uMax-uMin+(PU-DESK_U))/PU); if(nc<1) return;
  const used=nc*PU-(PU-DESK_U), u00=(uMin+uMax)/2-used/2;
  const out=[];
  for(let v0=2.0;v0+DESK_V+0.6<=Dv-2.2;v0+=PV) for(let c=0;c<nc;c++){
    const u0=u00+c*PU, a=toW(u0,v0), b=toW(u0+DESK_U,v0+DESK_V);
    const dk={x0:Math.min(a.x,b.x),x1:Math.max(a.x,b.x),z0:Math.min(a.z,b.z),z1:Math.max(a.z,b.z),chairs:[]};
    [0.4,1.1].forEach(du=>{ const q=toW(u0+du,v0+DESK_V+0.3); dk.chairs.push({x:q.x,z:q.z}); });
    dk.chairDir={x:alongX?0:(d.nx>0?1:-1),z:alongX?(d.nz>0?1:-1):0};   // 椅背朝向（遠離黑板＝朝門）
    out.push(dk);
  }
  r.desks=out;
  const nav=NAV[r.f]; out.forEach(dk=>{ const i0=ci(dk.x0),i1=ci(dk.x1),j0=cj(dk.z0),j1=cj(dk.z1);
    for(let j=j0;j<=j1;j++) for(let i=i0;i<=i1;i++) if(i>=0&&j>=0&&i<GW&&j<GH&&RC[r.f][j*GW+i]===r.idx) nav[j*GW+i]=0; });
}
for(let f=0;f<NL;f++) BYFLOOR[f].forEach(r=>{ if(r.t==='c'&&!r.solid&&r.w>4&&r.d>4) layoutDesks(r); });
/* ---------- 連通性修復：把孤島（走廊斷開的一段、被切離的梯間入口）用最短的通道接回主走廊 ---------- */
function repairConnectivity(f){
  const n=NAV[f], rc=RC[f], N=GW*GH;
  for(let iter=0;iter<12;iter++){
    const comp=new Int32Array(N), sizes=[0]; let id=0;
    for(let k=0;k<N;k++){ if(!n[k]||comp[k]) continue; id++; let c=0; const st=[k]; comp[k]=id;
      while(st.length){ const q=st.pop(); c++; const i=q%GW, j=(q/GW)|0;
        if(i>0&&n[q-1]&&!comp[q-1]){ comp[q-1]=id; st.push(q-1); } if(i<GW-1&&n[q+1]&&!comp[q+1]){ comp[q+1]=id; st.push(q+1); }
        if(j>0&&n[q-GW]&&!comp[q-GW]){ comp[q-GW]=id; st.push(q-GW); } if(j<GH-1&&n[q+GW]&&!comp[q+GW]){ comp[q+GW]=id; st.push(q+GW); } }
      sizes[id]=c; }
    let main=1; for(let i=1;i<=id;i++) if(sizes[i]>sizes[main]) main=i;
    let target=-1; for(let i=1;i<=id;i++) if(i!==main&&sizes[i]>=20){ target=i; break; }
    if(target<0) return;
    // Dijkstra：從孤島出發，走「非房間」格成本 1、穿過房間成本 8、穿過梯間成本 40，到達主走廊為止
    const dist=new Float32Array(N).fill(1e9), par=new Int32Array(N).fill(-1); const heap=[];
    const push=(d,k)=>{ heap.push([d,k]); let c=heap.length-1; while(c>0){ const p=(c-1)>>1; if(heap[p][0]<=heap[c][0]) break; [heap[p],heap[c]]=[heap[c],heap[p]]; c=p; } };
    const pop=()=>{ const t=heap[0], l=heap.pop(); if(heap.length){ heap[0]=l; let c=0; for(;;){ let a=2*c+1,b=a+1,m=c; if(a<heap.length&&heap[a][0]<heap[m][0]) m=a; if(b<heap.length&&heap[b][0]<heap[m][0]) m=b; if(m===c) break; [heap[m],heap[c]]=[heap[c],heap[m]]; c=m; } } return t; };
    for(let k=0;k<N;k++) if(comp[k]===target){ dist[k]=0; push(0,k); }
    let hit=-1;
    while(heap.length){ const [d,k]=pop(); if(d>dist[k]) continue; if(comp[k]===main){ hit=k; break; }
      const i=k%GW, j=(k/GW)|0;
      for(const [di,dj] of [[1,0],[-1,0],[0,1],[0,-1]]){ const ni=i+di, nj=j+dj; if(ni<1||nj<1||ni>=GW-1||nj>=GH-1) continue; const q=nj*GW+ni;
        const cost=rc[q]>=1000?40:rc[q]>=0?8:1; const nd=d+cost; if(nd<dist[q]){ dist[q]=nd; par[q]=k; push(nd,q); } } }
    if(hit<0){ sizes[target]=0; for(let k=0;k<N;k++) if(comp[k]===target) comp[k]=-1; return; }
    for(let k=hit;k>=0&&comp[k]!==target;k=par[k]){ const i=k%GW, j=(k/GW)|0;   // 通道寬約 1.2 m
      for(let dj=-1;dj<=2;dj++) for(let di=-1;di<=2;di++){ const q=(j+dj)*GW+(i+di); if(i+di<0||j+dj<0||i+di>=GW||j+dj>=GH) continue; if(rc[q]>=1000) continue; n[q]=1; } }
  }
}
for(let f=1;f<NL;f++) repairConnectivity(f);   // 1F 是戶外，不需要
/* ---------- 第三輪 Phase 0：穿堂、柱子、走廊邊緣（依實景照片；尺寸量測依據見 docs/GX10_ROUND3_REALPHOTO.md 執行紀錄） ---------- */
// FLOOR：放柱子之前的可走格＝「有樓板」的範圍（場景的走廊樓板、欄杆邊線、雨遮用；柱子佔的格子仍有樓板）
const FLOOR=NAV.map(a=>a.slice()), SLAB_=0.3;
const byName=(f,n)=>BYFLOOR[f].find(r=>r.name===n);
const cornerX=v=>WX0+Math.round((v-WX0)/CELL)*CELL, cornerZ=v=>WZ0+Math.round((v-WZ0)/CELL)*CELL;
// 穿堂（S1）：貫穿集賢樓的南北向通道。校門側（南）雙層挑空到 3F 樓板；中段 2F 是連通兩側走廊的彩繪橋；操場側（北）只有一層高。
// 校門側由懸挑框架承托 3F：前排兩根大圓柱、厚邊梁、兩側清水混凝土牆；右側是凸出的 1–2F 灰框玻璃角窗房。
const CT=(()=>{ const L=byName(0,'家長會辦公室'), Rr=byName(0,'學務處'), N0=byName(0,'總務處'), N1=byName(0,'健康中心'); if(!L||!Rr||!N0||!N1) return null;
  const face=Math.max(L.Z1,Rr.Z1);                        // 1–2F 南面牆線
  const xs=[cornerX(N0.X1),cornerX(N1.X0)];               // 柱列：與北段通道兩側牆線同一軸（照片量得前排柱心距 ≈ 8.7 m，北段通道淨寬 8.77 m）
  let zb=-1e9; { const i=ci((xs[0]+xs[1])/2); for(let j=0;j<GH;j++){ const k=j*GW+i, z=WZ0+(j+1)*CELL; if(z<face&&NAV[1][k]&&RC[1][k]<0) zb=Math.max(zb,z); } }   // 2F 橋的南緣
  const zc=cornerZ(face+2.1), edge=zc+1.0;                // 前排柱心在牆線外 2.1 m；板緣只越過柱心 1.0 m（柱外緣再出 0.5 m）
  return { xl:L.X1, xr:Rr.X0, face, zb:cornerZ(zb), zc, edge, xs, wallT:0.6, box:{x0:Rr.X0,x1:Rr.X0+4.6,z0:face,z1:face+2.0},
    soffit:2*FH-SLAB_, beamBot:2*FH-0.6, beamTop:2*FH+0.3, gateClear:2*FH-0.6, fieldClear:FH-SLAB_, north:{x0:N0.X1,x1:N1.X0,z0:N0.Z0,z1:N0.Z1},
    get x0(){ return this.xl-this.wallT; }, get x1(){ return this.box.x1+this.wallT; } };
})();
// 司令台（S9，照片 sling_platform_canopy.jpg）：開放式抬高平台（花崗石貼面、深色木紋面）＋側邊斜坡（不鏽鋼扶手）＋鋼柱斜撐的折板大雨遮。
// 位置：集賢樓操場側穿堂出口旁（照片：由操場看向集賢樓，平台在穿堂出口左側＝東側），平台邊與穿堂東牆線之間留斜坡口。
// 物理：平台與斜坡是解析式表面（同樓梯），1F 格網在這一區由解析式表面接管（PLATMASK）；導航格網保留平台／斜坡可走，四周留一圈不可走（只能從斜坡上下）。
const STAGE=(()=>{ const H=byName(0,'健康中心'); if(!H) return null;
  const face=H.Z0, x0=cornerX(H.X0), PH=1.1;
  const plat={x0:x0+2.1,x1:x0+12.1,z0:cornerZ(face-8.2),z1:cornerZ(face-3.2)};               // 10 m × 5 m（任務檔估計；照片無尺）
  const ramp={x0:x0,x1:plat.x1,z0:plat.z1+0.6,z1:plat.z1+2.0,top:plat.x1-2.0};             // 寬 1.4 m，坡段 x0→top 上升 1.1 m（約 1:9），top→x1 為上平台
  const canopy={x0:x0-1.2,x1:plat.x1+0.8,z0:plat.z0-3.4,z1:face-0.25,yBack:4.9,yFront:4.15,drop:0.75,ridge:0.55};   // 照片 sling_platform_canopy：鋼柱頂約在 2F 窗台下緣（≈4.4 m）、雨遮低、前緣下垂封邊深、遠超出平台（第三輪 B 降低；估計）
  const cols=[[x0-0.35,face-1.0],[x0+6.6,face-1.0]];                                          // 鋼柱（含斜撐），在斜坡後方
  return {face,PH,plat,ramp,canopy,cols,colR:0.22,   // 鋼柱徑約 0.44 m（照片以 1F 窗高 1.5 m 為尺，柱寬約 0.3 倍窗高；第三輪 B 由 0.34 加粗）
   
    height(x,z){ if(x>=plat.x0&&x<=plat.x1&&z>=plat.z0&&z<=plat.z1) return PH;
      if(x>=ramp.top&&x<=ramp.x1&&z>=plat.z1&&z<=ramp.z1) return PH;                          // 上平台與平台相接
      if(x>=ramp.x0&&x<=ramp.top&&z>=ramp.z0&&z<=ramp.z1) return PH*(x-ramp.x0)/(ramp.top-ramp.x0);
      return null; } };
})();
const PLATMASK=new Uint8Array(GW*GH);
if(STAGE){ const S_=STAGE, P_=S_.plat, R_=S_.ramp;
  for(let j=cj(P_.z0-0.9);j<=cj(S_.face-0.01);j++) for(let i=ci(R_.x0-0.6);i<=ci(P_.x1+0.9);i++){ if(i<0||j<0||i>=GW||j>=GH) continue;
    const k=j*GW+i, x=cxm(i), z=czm(j), h=S_.height(x,z);
    const nearPlat=x>P_.x0-0.45&&x<P_.x1+0.45&&z>P_.z0-0.45&&z<R_.z1+0.45&&!(x<R_.x0+0.3);   // 平台／斜坡外圍一圈（＋斜坡後方到牆）
    if(h!==null){ PLATMASK[k]=1; NAV[0][k]=1; }
    else if(nearPlat||(x>R_.x0-0.3&&x<P_.x1+0.45&&z>R_.z1-0.01)) { PLATMASK[k]=1; NAV[0][k]=0; } }
  S_.cols.forEach(([x,z])=>blockDisk(0,x,z,S_.colR)); }
// 時鐘梯塔（S10）＝最靠近校門的梯間：轉折平台端（B 端）外側兩角各一座方形清水混凝土牆墩 0.9 m（沿梯）× 1.4 m（橫向），
// 照片 tower_exterior_corner_formwork.jpg 以欄杆 1.1 m 為尺：牆墩正面寬約 1.3 倍欄杆高 → 1.4 m、側面約 0.8 倍 → 0.9 m（估計）。地面層進碰撞。
const TOWER=(()=>{ const g=D.places.find(p=>p[0]==='校門'); if(!g) return null; const gx=g[1]*SC, gz=g[2]*SC;
  const s=STAIRS.slice().sort((a,b)=>Math.hypot(a.cx-gx,a.cz-gz)-Math.hypot(b.cx-gx,b.cz-gz))[0]; if(!s||!s.P) return null;
  const piers=[-1,1].map(sv=>{ const a=s.P(s.Lt/2,sv*s.sh/2,0), b=s.P(s.Lt/2+0.9,sv*(s.sh/2-1.4),0); return {x0:Math.min(a.x,b.x),x1:Math.max(a.x,b.x),z0:Math.min(a.z,b.z),z1:Math.max(a.z,b.z)}; });
  s.fs=1;   // 照片 tower_stair_flight／tower_landing_3to4：往上走時實牆（朝南、掛鐘那面）在右手邊 → 第一跑貼著南牆（v>0）
  return {s,piers}; })();
if(TOWER) TOWER.piers.forEach(p=>{ let ok=true; for(let j=cj(p.z0+1e-3);j<=cj(p.z1-1e-3);j++) for(let i=ci(p.x0+1e-3);i<=ci(p.x1-1e-3);i++) if(RC[0][j*GW+i]>=0) ok=false; p.ok=ok; if(ok) blockRect(0,p.x0,p.z0,p.x1,p.z1); });
// 蒙萌園中庭遊戲塔（S11，照片 mengmeng_mufeng_courtyard_a/b：黃色塔身＋紅黃螺旋滑梯，約兩層高）：
// 位置照片無法定位到格網 → 取蒙萌園中庭（平面圖 x 300–560、y 760–980，四周為太陽班／星星班、幼兒園辦公室、彩虹班／月亮班）內離障礙物最遠的戶外空地（示意）。佔地半徑 1.7 m 進碰撞。
const SLIDE=(()=>{ let best=null; const x0=300*SC, x1=560*SC, z0=760*SC, z1=980*SC, R=14, mx=(x0+x1)/2, mz=(z0+z1)/2;
  for(let j=cj(z0);j<=cj(z1);j++) for(let i=ci(x0);i<=ci(x1);i++){ if(!NAV[0][j*GW+i]||CORR[0][j*GW+i]) continue; let d=R;
    for(let dj=-R;dj<=R&&d>0;dj++) for(let di=-R;di<=R;di++){ const ii=i+di, jj=j+dj; if(ii<0||jj<0||ii>=GW||jj>=GH||!NAV[0][jj*GW+ii]){ d=Math.min(d,Math.hypot(di,dj)); } }
    const c=Math.hypot(cxm(i)-mx,czm(j)-mz); if(!best||d>best.d||(d===best.d&&c<best.c)) best={d,c,x:cxm(i),z:czm(j)}; }   // 同樣空曠時取最靠近中庭中心
  return best&&best.d>=8?{x:best.x,z:best.z,r:2.1}:null; })();   // r：遊戲塔＋螺旋滑梯的碰撞圓盤（第三輪 B 加大滑梯後 1.7→2.1；需淨空 ≥ 8 格）
if(SLIDE) blockDisk(0,SLIDE.x,SLIDE.z,SLIDE.r);
// 地下停車場柱（S12，無實景照片，依台灣常見校園地下停車場）：0.6 m 方柱，沿 x 每 8.1 m（三格車位 2.7 m）；
// 沿 z 以「背靠背兩排車位 10 m＋車道 6.5 m」為一組，柱在車位前緣（間距 10／6.5 m 交替，平均約 8 m）。柱心在格角、佔 2×2 格，進碰撞。
const inStairRect=(x,z,pad)=>STAIRS.some(s=>x>s.X0-pad&&x<s.X1+pad&&z>s.Z0-pad&&z<s.Z1+pad);
const GCOLS=[];
{ const f=4, nav=NAV[f]; let i0=GW,i1=0,j0=GH,j1=0; for(let j=0;j<GH;j++) for(let i=0;i<GW;i++) if(nav[j*GW+i]){ i0=Math.min(i0,i); i1=Math.max(i1,i); j0=Math.min(j0,j); j1=Math.max(j1,j); }
  if(i1>i0){ const X0_=WX0+i0*CELL, X1_=WX0+(i1+1)*CELL, Z0_=WZ0+j0*CELL, Z1_=WZ0+(j1+1)*CELL, rows=[];
    for(let z=Z0_+6.5;z<Z1_-1;){ rows.push(z); z+=10; if(z<Z1_-1) rows.push(z); z+=6.5; }
    const clear=(x,z,r)=>{ for(let j=cj(z-r);j<=cj(z+r);j++) for(let i=ci(x-r);i<=ci(x+r);i++){ if(i<0||j<0||i>=GW||j>=GH||!nav[j*GW+i]) return false; } return true; };
    for(const zr of rows) for(let x=X0_+4.0;x<X1_-1;x+=8.1){ const cx=cornerX(x), cz=cornerZ(zr); if(!clear(cx,cz,1.3)||inStairRect(cx,cz,1.8)) continue; GCOLS.push({x:cx,z:cz}); blockDisk(f,cx,cz,0.3); }
    GCOLS.rows=rows; GCOLS.box={x0:X0_,x1:X1_,z0:Z0_,z1:Z1_}; } }
// 柱子（S2）：清水混凝土圓柱，貫穿多層（同一位置每層一段，視覺連續）。走廊柱直徑 0.6 m，柱心放在格角 → 正好佔 2×2 格（0.605 m），
// 穿堂前排 0.9 m（佔 4×4 格）、橋下 0.75 m。柱子進碰撞：佔到的格子設為不可走（淨空場、A*、膠囊碰撞都看得到）。
// 走廊柱沿走廊外緣（與欄杆同一線），間距 ≤ 4.8 m（照片估計），由上往下生成：上層的柱一路往下延伸到遇到房間為止。
const COL_D=0.6, COL_STEP=4.8, PILLARS=[], EDGES=[];
const inCT=(x,z)=>CT&&x>CT.x0-0.4&&x<CT.x1+0.4&&z>CT.zb-0.6&&z<CT.edge+0.4;
function blockDisk(f,x,z,r){ for(let j=cj(z-r);j<=cj(z+r);j++) for(let i=ci(x-r);i<=ci(x+r);i++){ if(i<0||j<0||i>=GW||j>=GH) continue;
  const x0=WX0+i*CELL, z0=WZ0+j*CELL, px=clampN(x,x0,x0+CELL), pz=clampN(z,z0,z0+CELL); if(Math.hypot(x-px,z-pz)<r-0.01) NAV[f][j*GW+i]=0; } }
function blockRect(f,x0,z0,x1,z1){ for(let j=cj(z0+1e-3);j<=cj(z1-1e-3);j++) for(let i=ci(x0+1e-3);i<=ci(x1-1e-3);i++) if(i>=0&&j>=0&&i<GW&&j<GH) NAV[f][j*GW+i]=0; }
// 走廊外緣（上層＝欄杆線；1F＝走廊與戶外的交界）：{ax,fix,a,b,out}，out＝往外（非走廊側）的方向（±1）
for(let f=0;f<NL;f++){ const n=FLOOR[f], rc=RC[f], E=[]; EDGES[f]=E;
  const inC=(i,j)=>{ if(i<0||j<0||i>=GW||j>=GH) return false; const k=j*GW+i; return rc[k]<0&&n[k]&&(f>0||CORR[0][k]); };
  const edge1=(i,j)=>{ if(i<0||j<0||i>=GW||j>=GH) return true; const k=j*GW+i; return !inC(i,j)&&rc[k]<0; };
  const edge=(i,j,di,dj)=>edge1(i,j)&&edge1(i+di,j+dj);   // 外側連續兩格都是空的才算外緣（房間與走廊之間一格寬的縫不算，不立柱、不放欄杆）
  for(let j=0;j<GH;j++){ let sN=-1,sS=-1;
    for(let i=0;i<=GW;i++){ const fr=inC(i,j), eN=fr&&edge(i,j-1,0,-1), eS=fr&&edge(i,j+1,0,1);
      if(eN&&sN<0) sN=i; if(!eN&&sN>=0){ E.push({ax:'x',fix:WZ0+j*CELL,a:WX0+sN*CELL,b:WX0+i*CELL,out:-1}); sN=-1; }
      if(eS&&sS<0) sS=i; if(!eS&&sS>=0){ E.push({ax:'x',fix:WZ0+(j+1)*CELL,a:WX0+sS*CELL,b:WX0+i*CELL,out:1}); sS=-1; } } }
  for(let i=0;i<GW;i++){ let sW=-1,sE=-1;
    for(let j=0;j<=GH;j++){ const fr=inC(i,j), eW=fr&&edge(i-1,j,-1,0), eE=fr&&edge(i+1,j,1,0);
      if(eW&&sW<0) sW=j; if(!eW&&sW>=0){ E.push({ax:'z',fix:WX0+i*CELL,a:WZ0+sW*CELL,b:WZ0+j*CELL,out:-1}); sW=-1; }
      if(eE&&sE<0) sE=j; if(!eE&&sE>=0){ E.push({ax:'z',fix:WX0+(i+1)*CELL,a:WZ0+sE*CELL,b:WZ0+j*CELL,out:1}); sE=-1; } } }
}
{ const cellsAround=(x,z)=>[[x-0.1,z-0.1],[x+0.1,z-0.1],[x-0.1,z+0.1],[x+0.1,z+0.1]].map(([a,b])=>{ const i=ci(a), j=cj(b); return (i<0||j<0||i>=GW||j>=GH)?-1:j*GW+i; });
  const roomUnder=(g,x,z)=>cellsAround(x,z).some(k=>k<0||RC[g][k]>=0);
  const near=(f,x,z)=>PILLARS.some(p=>f>=p.f0&&f<=p.f1&&Math.hypot(p.x-x,p.z-z)<1.2);
  // 柱與牆／別的柱之間留下 1–2 格（≤ 0.6 m）的縫 → 角色擠不過去、會卡在縫裡：這種位置不立柱
  const pocket=(g,x,z)=>{ const I=Math.round((x-WX0)/CELL), J=Math.round((z-WZ0)/CELL), fr=(i,j)=>i>=0&&j>=0&&i<GW&&j<GH&&NAV[g][j*GW+i]===1;
    for(let di=-1;di<=1;di++) for(let dj=-1;dj<=1;dj++){ if(!di&&!dj) continue; const bi=di<0?I-1:I, bj=dj<0?J-1:J;   // 2×2 柱格在此方向的角格
      for(const [oi,oj] of (di&&dj)?[[0,0]]:(di?[[0,-1],[0,0]]:[[-1,0],[0,0]])){ const si=(di?bi:I+oi), sj=(dj?bj:J+oj);
        let gap=0; for(let d=1;d<=3;d++){ if(fr(si+di*d,sj+dj*d)) gap++; else break; } if(gap>=1&&gap<=2&&!fr(si+di*(gap+1),sj+dj*(gap+1))) return true; } }
    return false; };
  const DOORS=[0,1,2,3,4].map(g=>BYFLOOR[g].filter(r=>r.door&&r.door.x!==undefined).map(r=>r.door).concat(STAIRS.filter(s=>s.doors[g]&&s.doors[g].x!==undefined).map(s=>s.doors[g])));
  const nearDoor=(g,x,z)=>DOORS[g].some(d=>Math.hypot(d.x-x,d.z-z)<CELL*2+1.0);   // 門口（門寬 1.2 m）前後不立柱
  for(const f of [3,2,1,0]){ // 地上樓層由上往下；B1 停車場另有做法（不進碰撞）
    for(const e of EDGES[f]){ const len=e.b-e.a; if(len<0.5) continue; const q=Math.max(1,Math.round(len/COL_STEP));
      for(let t=0;t<=q;t++){ const p=e.ax==='x'?cornerX(e.a+len*t/q):cornerZ(e.a+len*t/q), x=e.ax==='x'?p:e.fix, z=e.ax==='x'?e.fix:p;
        if(inStairRect(x,z,0.6)||inCT(x,z)||near(f,x,z)) continue;
        if(f===0){ const up=cellsAround(x,z); if(!up.some(k=>k>=0&&(FLOOR[1][k]||RC[1][k]>=0))) continue; }   // 1F 只在上方有結構處立柱（純雨遮是懸挑，不立柱）
        if(nearDoor(f,x,z)) continue;
        let g=f; while(g>0&&!roomUnder(g-1,x,z)&&!nearDoor(g-1,x,z)) g--;
        let bad=false; for(let h=g;h<=f&&!bad;h++) bad=pocket(h,x,z); if(bad) continue;
        const P={x,z,r:COL_D/2,f0:g,f1:f,y0:LY(g),y1:LY(f)+FH-0.15,kind:'corr'}; PILLARS.push(P); for(let h=g;h<=f;h++) blockDisk(h,x,z,P.r); } } }
  if(CT){ CT.xs.forEach((x,k)=>{ PILLARS.push({x,z:CT.zc,r:0.45,f0:0,f1:1,y0:0,y1:CT.soffit,kind:'ct'}); PILLARS.push({x,z:CT.zb,r:0.375,f0:0,f1:1,y0:0,y1:CT.soffit,kind:k===0?'ctPaint':'ctIn'}); }); }
  for(const p of PILLARS) if(p.kind!=='corr') for(let g=p.f0;g<=p.f1;g++) blockDisk(g,p.x,p.z,p.r);
  if(CT){ blockRect(0,CT.x0,CT.face,CT.xl,CT.edge); blockRect(0,CT.box.x0,CT.box.z0,CT.box.x1,CT.box.z1); blockRect(0,CT.box.x1,CT.face,CT.x1,CT.edge); }   // 框架兩側牆、玻璃角窗房
}
for(let f=0;f<NL;f++){
  const n=NAV[f], e=new Uint8Array(GW*GH);
  for(let j=1;j<GH-1;j++) for(let i=1;i<GW-1;i++){
    const k=j*GW+i; if(!n[k]) continue;
    if(n[k-1]&&n[k+1]&&n[k-GW]&&n[k+GW]&&n[k-GW-1]&&n[k-GW+1]&&n[k+GW-1]&&n[k+GW+1]) e[k]=1;
  }
  ERO[f]=e;
}
const freeAt=(f,x,z)=>{ const i=ci(x), j=cj(z); return i>=0&&j>=0&&i<GW&&j<GH&&NAV[f][j*GW+i]===1; };
const roomAt=(f,x,z)=>{ const i=ci(x), j=cj(z); if(i<0||j<0||i>=GW||j>=GH) return -1; return RC[f][j*GW+i]; };
function canStand(f,x,z,r){ r=r||0.3; return freeAt(f,x,z)&&freeAt(f,x+r,z)&&freeAt(f,x-r,z)&&freeAt(f,x,z+r)&&freeAt(f,x,z-r); }

/* ---------- A* ---------- */
const N_=GW*GH, GS=new Float32Array(N_), PAR=new Int32Array(N_), SEEN=new Uint32Array(N_), CLOSED=new Uint32Array(N_); let STAMP=0;
function nearestCell(f,x,z,maxR){
  const e=ERO[f], i0=ci(x), j0=cj(z);
  if(i0>=0&&j0>=0&&i0<GW&&j0<GH&&e[j0*GW+i0]) return j0*GW+i0;
  let best=-1,bd=1e9;
  for(let R=1;R<=(maxR||80);R++){
    for(let j=j0-R;j<=j0+R;j++) for(let i=i0-R;i<=i0+R;i++){
      if(Math.max(Math.abs(i-i0),Math.abs(j-j0))!==R) continue; if(i<0||j<0||i>=GW||j>=GH) continue;
      if(e[j*GW+i]){ const d=(i-i0)*(i-i0)+(j-j0)*(j-j0); if(d<bd){ bd=d; best=j*GW+i; } }
    }
    if(best>=0) return best;
  }
  return -1;
}
function losOK(f,ax,az,bx,bz){
  const e=ERO[f], d=Math.hypot(bx-ax,bz-az), n=Math.max(1,Math.ceil(d/(CELL*0.5)));
  for(let k=0;k<=n;k++){ const t=k/n, i=ci(ax+(bx-ax)*t), j=cj(az+(bz-az)*t); if(i<0||j<0||i>=GW||j>=GH||!e[j*GW+i]) return false; }
  return true;
}
function astar(f,sx,sz,tx,tz){
  const e=ERO[f], s=nearestCell(f,sx,sz), t=nearestCell(f,tx,tz); if(s<0||t<0) return null;
  STAMP++; const ti=t%GW, tj=(t/GW)|0;
  const heap=[]; const push=(fv,idx)=>{ heap.push([fv,idx]); let c=heap.length-1; while(c>0){ const p=(c-1)>>1; if(heap[p][0]<=heap[c][0]) break; [heap[p],heap[c]]=[heap[c],heap[p]]; c=p; } };
  const pop=()=>{ const top=heap[0], last=heap.pop(); if(heap.length){ heap[0]=last; let c=0; for(;;){ let l=2*c+1,r=l+1,m=c; if(l<heap.length&&heap[l][0]<heap[m][0]) m=l; if(r<heap.length&&heap[r][0]<heap[m][0]) m=r; if(m===c) break; [heap[m],heap[c]]=[heap[c],heap[m]]; c=m; } } return top; };
  const h=(i,j)=>{ const dx=Math.abs(i-ti), dz=Math.abs(j-tj); return Math.max(dx,dz)+0.4142*Math.min(dx,dz); };
  SEEN[s]=STAMP; GS[s]=0; PAR[s]=-1; push(h(s%GW,(s/GW)|0),s);
  const DX=[1,-1,0,0,1,1,-1,-1], DZ=[0,0,1,-1,1,-1,1,-1];
  let found=false;
  while(heap.length){
    const [,cur]=pop(); if(CLOSED[cur]===STAMP) continue; CLOSED[cur]=STAMP;
    if(cur===t){ found=true; break; }
    const ci_=cur%GW, cj_=(cur/GW)|0;
    for(let k=0;k<8;k++){
      const ni=ci_+DX[k], nj=cj_+DZ[k]; if(ni<0||nj<0||ni>=GW||nj>=GH) continue;
      const nk=nj*GW+ni; if(!e[nk]) continue;
      if(k>=4&&(!e[cj_*GW+ni]||!e[nj*GW+ci_])) continue;
      const g=GS[cur]+(k<4?1:1.4142);
      if(SEEN[nk]!==STAMP||g<GS[nk]){ SEEN[nk]=STAMP; GS[nk]=g; PAR[nk]=cur; push(g+h(ni,nj),nk); }
    }
  }
  if(!found) return null;
  let cells=[]; for(let c=t;c>=0;c=PAR[c]) cells.push(c); cells.reverse();
  let pts=cells.map(c=>({x:cxm(c%GW),z:czm((c/GW)|0)}));
  pts[0]={x:sx,z:sz}; // 起點用真實位置
  // 拉直
  const out=[pts[0]]; let a=0;
  while(a<pts.length-1){
    let b=pts.length-1;
    while(b>a+1&&!losOK(f,pts[a].x,pts[a].z,pts[b].x,pts[b].z)) b--;
    out.push(pts[b]); a=b;
  }
  const last=out[out.length-1];
  if(Math.hypot(last.x-tx,last.z-tz)>0.3&&freeAt(f,tx,tz)) out.push({x:tx,z:tz});
  return out;
}
const polyLen=p=>{ let d=0; for(let i=1;i<p.length;i++) d+=Math.hypot(p[i].x-p[i-1].x,p[i].z-p[i-1].z); return d; };
const legLen=l=>l.type==='walk'?polyLen(l.pts):Math.abs(RANK(l.to)-RANK(l.from))*9;
const routeLen=legs=>legs.reduce((s,l)=>s+legLen(l),0);
function walkLeg(f,a,b){ const p=astar(f,a.x,a.z,b.x,b.z); return p?{type:'walk',f,pts:p}:null; }
function planRoute(from,dest){
  if(from.f===dest.f){ const w=walkLeg(from.f,from,dest); return w?[w]:null; }
  const cands=STAIRS.filter(s=>s.fl.includes(from.f)&&s.fl.includes(dest.f));
  cands.sort((a,b)=>(Math.hypot(a.cx-from.x,a.cz-from.z)+Math.hypot(a.cx-dest.x,a.cz-dest.z))-(Math.hypot(b.cx-from.x,b.cz-from.z)+Math.hypot(b.cx-dest.x,b.cz-dest.z)));
  let best=null;
  for(const s of cands.slice(0,3)){
    const c={x:s.ent.x,z:s.ent.z}; const w1=walkLeg(from.f,from,c), w2=walkLeg(dest.f,c,dest); if(!w1||!w2) continue;
    const legs=[w1,{type:'stair',s,from:from.f,to:dest.f},w2], L=routeLen(legs); if(!best||L<best.L) best={legs,L};
  }
  return best&&best.legs;
}
// 目的地：房間中心；戶外地點吸附到最近可走處
ROOMS.forEach(r=>{ if(r.solid) return; const c=nearestCell(r.f,r.cx,r.cz,30); r.x=c>=0?cxm(c%GW):r.cx; r.z=c>=0?czm((c/GW)|0):r.cz; r.t0=r.t; });
D.places.forEach(p=>{
  const px=p[1]*SC, pz=p[2]*SC; const c=nearestCell(p[0].startsWith('地下')?4:0,px,pz,120);
  const bf=p[0].startsWith('地下'); PLACES.push({name:p[0],code:'',t:'p',f:bf?4:0,label:bf?'B1':'戶外',x:c>=0?cxm(c%GW):px,z:c>=0?czm((c/GW)|0):pz});
});
if(STAGE){ const P_=STAGE.plat; PLACES.push({name:'司令台',code:'',t:'p',f:0,label:'戶外',x:(P_.x0+P_.x1)/2,z:(P_.z0+P_.z1)/2,y:STAGE.PH}); }   // y：站在平台上的高度
{ const c=nearestCell(0,(RAMP.x0+RAMP.x1)/2,RAMP.z1+1.5,40); PLACES.push({name:'停車場入口',code:'',t:'p',f:0,label:'戶外',x:c>=0?cxm(c%GW):(RAMP.x0+RAMP.x1)/2,z:c>=0?czm((c/GW)|0):RAMP.z1+1.5}); }
if(SLIDE){ const c=nearestCell(0,SLIDE.x+SLIDE.r+1.2,SLIDE.z,40); PLACES.push({name:'蒙萌園中庭',code:'',t:'p',f:0,label:'戶外',x:c>=0?cxm(c%GW):SLIDE.x+SLIDE.r+1.2,z:c>=0?czm((c/GW)|0):SLIDE.z}); }   // 遊戲塔旁（第三輪 E 任務導覽站點）
return { BLD,RAMP,D,SC,CELL,GX0,GY0,GW,GH,WX0,WZ0,FH,NF,NL,UP,DN,LY,RANK,clampN,ci,cj,cxm,czm,TYPE_LABEL,levelLabel,
  ROOMS,PLACES,STAIRS,BYFLOOR,CORR,WALK0,NAV,FLOOR,EDGES,PILLARS,CT,STAGE,PLATMASK,SLIDE,TOWER,GCOLS,ERO,RC,STR_A,STR_B,STR_N,freeAt,roomAt,canStand,nearestCell,losOK,astar,planRoute,pickDoor };
}
