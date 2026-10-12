/**
 * 東新國小新校舍外觀「參照模式」v2。
 * 參照臺北市政府 2022 完工照：紅褐磚、清水混凝土、深灰鋁窗、
 * 半戶外走廊、綠色欄杆及外露樓梯。
 * 本模組是原創幾何示範：量體比例、樓層配置、建築方位尚非測繪結果。
 */
export function addDongxinFacade({THREE, building:b, root, floors, box, baseTag}) {
  const H=b.floorHeight, W=b.width, D=b.depth, front=D/2, bays=b.roomCount, bay=W/bays;
  const makeMat=(color,roughness=.9,metalness=0)=>new THREE.MeshStandardMaterial({color,roughness,metalness});
  const mortar='#b8ada1', steel=makeMat('#536b69',.55,.36), green=makeMat('#477569',.58,.3);
  const concrete=makeMat('#e5e2d9',.96), shadeConcrete=makeMat('#babfba',.96);
  const glazing=new THREE.MeshStandardMaterial({color:'#709fac',roughness:.19,metalness:.22,transparent:true,opacity:.58,side:THREE.DoubleSide});
  const glassDark=makeMat('#334c55',.35,.2);
  const brickCanvas=document.createElement('canvas');brickCanvas.width=768;brickCanvas.height=384;
  const ctx=brickCanvas.getContext('2d');
  ctx.fillStyle=mortar;ctx.fillRect(0,0,768,384);
  const bw=64,bh=24;
  const colors=['#a75c46','#b66e51','#ac604c','#c07958','#a96550','#b47053'];
  for(let row=0;row<16;row++){
    for(let col=-1;col<13;col++){
      const ox=col*bw+((row%2)?bw/2:0),oy=row*bh;
      if(ox>768||ox+bw<0)continue;
      const idx=Math.abs(((row*61+col*29)*13)%colors.length);
      ctx.fillStyle=colors[idx];ctx.fillRect(ox+2,oy+2,bw-4,bh-4);
      ctx.fillStyle='rgba(255,245,215,.065)';ctx.fillRect(ox+3,oy+3,bw-7,2);
      ctx.fillStyle='rgba(42,26,18,.08)';ctx.fillRect(ox+3,oy+bh-5,bw-7,2);
    }
  }
  const brickTex=new THREE.CanvasTexture(brickCanvas);
  brickTex.encoding=THREE.sRGBEncoding;brickTex.anisotropy=4;
  brickTex.wrapS=brickTex.wrapT=THREE.RepeatWrapping;
  brickTex.repeat.set(Math.max(1,W/22),Math.max(1,b.floors*.75));
  const brick=new THREE.MeshStandardMaterial({map:brickTex,roughness:.98,metalness:0});
  const add=(parent,x,y,z,w,h,d,mat,tag=false)=>{
    const ob=box(parent,x,y,z,w,h,d,mat);
    if(tag)baseTag(ob,b);
    return ob;
  };
  const pane=(parent,cx,cy,z,w,h)=>{
    // 顏色較深的玻璃底，加上前方透明玻璃，避免雙面透明造成閃爍
    add(parent,cx,cy,z-.015,w,h,.05,glassDark);
    add(parent,cx,cy,z+.025,w-.1,h-.12,.035,glazing);
    add(parent,cx-w/2,cy,z+.07,.095,h,.12,steel);
    add(parent,cx+w/2,cy,z+.07,.095,h,.12,steel);
    add(parent,cx,cy+h/2,z+.07,w+.1,.085,.12,steel);
    add(parent,cx,cy-h/2,z+.07,w+.1,.085,.12,steel);
    add(parent,cx,cy,z+.08,.072,h,.09,steel);
    add(parent,cx,cy+.02,z+.09,w,.056,.085,steel);
  };

  // 真正與照片相似的是「外觀語言」，不是未經確認的校舍配置。
  for(let level=0;level<b.floors;level++){
    const g=floors[level],y=level*H;
    // 樓層間紅磚與灰白混凝土水平帶
    add(g,0,y+H*.17,front+.19,W+.1,.58,.32,brick,true);
    add(g,0,y+H*.85,front+.20,W+.1,.72,.30,brick,true);
    add(g,0,y+H*.99,front+.34,W+.45,.15,.57,concrete,true);
    add(g,0,y+H*.1,-D/2-.2,W+.1,.46,.32,brick,true);
    add(g,0,y+H*.86,-D/2-.21,W+.1,.7,.32,brick,true);
    // 面向中庭的規律窗帶及紅磚柱
    for(let i=0;i<bays;i++){
      const cx=-W/2+(i+.5)*bay;
      const z=front+.35;
      pane(g,cx,y+H*.52,z,Math.min(bay*.68,5.7),H*.42);
      // 窗台與遮陽板
      add(g,cx,y+H*.29,z+.24,bay*.74,.115,.66,shadeConcrete);
      add(g,cx,y+H*.77,z+.21,bay*.77,.13,.63,concrete);
      // 背面的小窗反映真正教室外牆的鋁窗節奏
      const back=-D/2-.37;
      add(g,cx,y+H*.56,back,bay*.56,H*.38,.06,glassDark);
      add(g,cx,y+H*.56,back-.035,bay*.55,H*.37,.04,glazing);
      for(let k of [-1,0,1])add(g,cx+k*bay*.18,y+H*.56,back-.08,.07,H*.39,.09,steel);
      add(g,cx,y+H*.56,back-.075,bay*.57,.07,.07,steel);
    }
    for(let i=0;i<=bays;i++){
      const x=-W/2+i*bay;
      add(g,x,y+H*.50,front+.28,.54,H-.20,.42,brick,true);
      add(g,x,y+H*.52,-D/2-.29,.62,H-.22,.34,brick,true);
    }
    // 位於建物外側的半戶外廊道：梁柱、地板、欄杆、雨棚
    const outerZ=front+1.55;
    add(g,0,y+.20,outerZ,W,.20,2.30,concrete);
    add(g,0,y+H-.22,outerZ,W,.26,2.46,concrete,true);
    for(let i=0;i<=bays;i++){
      const x=-W/2+i*bay;
      add(g,x,y+H*.49,outerZ+1.02,.30,H-.30,.30,concrete);
    }
    if(level>0){
      add(g,0,y+1.05,outerZ+1.18,W-.45,.10,.12,green);
      for(let i=0;i<=bays*5;i++){
        const x=-W/2+.2+i*(W-.4)/(bays*5);
        add(g,x,y+.7,outerZ+1.18,.055,.69,.075,green);
      }
    }
    if(level===0){
      for(let i=0;i<bays;i++) {
        const cx=-W/2+(i+.5)*bay;
        add(g,cx,y+.13,outerZ+1.7,bay*.85,.07,1.25,shadeConcrete);
      }
    }
  }

  // 清水混凝土外露樓梯塔，透明綠色護欄（照片的可辨識視覺特徵）
  const stair=new THREE.Group();
  stair.position.set(-W/2-3.45,0,front-.5);
  root.add(stair);
  const sw=5.55, sd=6.25;
  const maxY=b.floors*H;
  for(let s of [-1,1]){
    add(stair,s*(sw/2-.15),maxY/2,0,.37,maxY+.15,sd+.15,concrete);
    add(stair,0,maxY/2,s*(sd/2-.13),sw,.0+maxY*.018,.22,shadeConcrete);
  }
  for(let i=0;i<b.floors;i++){
    const y=i*H;
    add(stair,0,y+.18,0,sw-.45,.18,sd-.48,concrete);
    add(stair,0,y+H-.15,0,sw+.1,.30,sd+.24,concrete);
    // 梯段為可見的折返示意，無法當真正可行走室內樓梯
    const steps=9;
    for(let n=0;n<steps;n++){
      const t=(n+.5)/steps;
      const x=-sw*.29+t*sw*.58;
      add(stair,x,y+.26+t*(H*.42),-sd*.18,.43,.17,sd*.39,concrete);
    }
    for(let n=0;n<steps;n++){
      const t=(n+.5)/steps;
      const x=sw*.29-t*sw*.58;
      add(stair,x,y+H*.51+t*(H*.43),sd*.18,.43,.17,sd*.39,concrete);
    }
    // 梯塔面向操場的深綠色帷幕玻璃
    add(stair,0,y+H*.56,sd/2+.07,sw-.62,H*.72,.08,glassDark);
    add(stair,0,y+H*.56,sd/2+.11,sw-.72,H*.69,.055,glazing);
    for(let n=-1;n<=1;n++)add(stair,n*(sw-.6)/3,y+H*.56,sd/2+.16,.09,H*.73,.09,green);
    add(stair,0,y+H*.56,sd/2+.16,sw-.6,.09,.09,green);
  }
  // 屋頂一段紅磚三角造型，以政府公開外觀照片輪廓做近似示意
  const cap=new THREE.Group();root.add(cap);
  const roofY=b.floors*H+.25;
  const shape=new THREE.Shape();
  const left=-W/2+.7;
  shape.moveTo(left,0);
  shape.lineTo(left+11.5,0);
  shape.lineTo(left+7,2.6);
  shape.lineTo(left,0);
  const geo=new THREE.ExtrudeGeometry(shape,{depth:1.7,bevelEnabled:false});
  const mesh=new THREE.Mesh(geo,brick);
  mesh.position.set(0,roofY,front-1.4);
  mesh.castShadow=true;mesh.receiveShadow=true;cap.add(mesh);baseTag(mesh,b);
  add(cap,left+5.5,roofY+.2,front+.65,12,.22,.45,shadeConcrete);
  // 無侵入式版本資訊：讓使用者知道這棟是照片參照，非原始圖面
  root.userData.referenceMode='外觀照片參照（未測繪）';
  return {stair,roofAccent:cap,additionalObstacle:{x:b.x-W/2-3.45,z:b.z+front-.5,hw:sw/2+.25,hd:sd/2+.25}};
}
