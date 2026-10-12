import {school, allRooms} from './schoolData.js';

const $=s=>document.querySelector(s);
const rooms=allRooms();
const state={mode:'overview',selected:null,building:null,activeFloor:0,search:'',walking:false,
  player:{x:school.spawn.x,z:school.spawn.z,heading:school.spawn.heading},route:[],routeIndex:0,
  dragging:false,pointerStart:null,orbit:{az:.67,polar:.98,dist:104,target:null},joy:{x:0,y:0}};
let scene,camera,renderer,world,playerMesh,raycaster,clock,routeObject=null,siteCanvas,walkingTween=0;
const THREE=window.THREE;
const mats={},buildingModels=new Map(),hitMeshes=[], obstacles=[],refs={};
const U={forest:'#285f50',terracotta:'#cfa384',cream:'#f4eddf',glass:'#84aabb',coral:'#d4a87c',pavement:'#e0e4d6',wood:'#aa8063'};

function getMat(hex,rough=.83,metal=0){const key=hex+'/'+rough+'/'+metal;if(!mats[key])mats[key]=new THREE.MeshStandardMaterial({color:hex,roughness:rough,metalness:metal});return mats[key];}
function box(parent,x,y,z,w,h,d,mat,extra){let obj=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),typeof mat==='string'?getMat(mat):mat);obj.position.set(x,y,z);obj.castShadow=h>.32;obj.receiveShadow=true;if(extra)obj.userData={...obj.userData,...extra};parent.add(obj);return obj;}
function cyl(parent,x,y,z,r,h,mat,segments=12){let obj=new THREE.Mesh(new THREE.CylinderGeometry(r,r,h,segments),getMat(mat));obj.position.set(x,y,z);obj.castShadow=true;parent.add(obj);return obj;}
function plane(parent,x,y,z,w,d,mat){const ob=new THREE.Mesh(new THREE.PlaneGeometry(w,d),typeof mat==='string'?getMat(mat):mat);ob.rotation.x=-Math.PI/2;ob.position.set(x,y,z);ob.receiveShadow=true;parent.add(ob);return ob;}
function textSprite(label,width=4,height=.75,bg='#285e50',fg='#ffffff',fontSize=48){const canvas=document.createElement('canvas');canvas.width=512;canvas.height=128;const g=canvas.getContext('2d');g.fillStyle=bg;g.fillRect(0,0,512,128);g.strokeStyle='rgba(255,255,255,.3)';g.lineWidth=4;g.strokeRect(4,4,504,120);g.fillStyle=fg;g.textAlign='center';g.textBaseline='middle';g.font=`700 ${fontSize}px "Noto Sans TC",sans-serif`;g.fillText(label,256,67,475);const t=new THREE.CanvasTexture(canvas);t.anisotropy=4;const mat=new THREE.MeshBasicMaterial({map:t,transparent:true,side:THREE.DoubleSide,depthWrite:false});const m=new THREE.Mesh(new THREE.PlaneGeometry(width,height),mat);return m;}
function addName(parent,label,x,y,z,scale=1){const sign=textSprite(label,5*scale,.9*scale,'#244f48','#ffffff',48);sign.position.set(x,y,z);parent.add(sign);return sign;}
function seeded(i){const a=Math.sin(i*93.194+17.39)*43758.5453;return a-Math.floor(a);}
function tileTexture(){const c=document.createElement('canvas');c.width=c.height=256;const g=c.getContext('2d');g.fillStyle='#d8e1d3';g.fillRect(0,0,256,256);for(let y=0;y<8;y++)for(let x=0;x<8;x++){let k=x+8*y;g.fillStyle=`rgba(${130+Math.floor(seeded(k)*40)},${155+Math.floor(seeded(k+50)*34)},${136+Math.floor(seeded(k+90)*35)},.09)`;g.fillRect(x*32+1,y*32+1,30,30);}g.strokeStyle='rgba(102,130,110,.11)';for(let i=0;i<=256;i+=32){g.beginPath();g.moveTo(i,0);g.lineTo(i,256);g.stroke();g.beginPath();g.moveTo(0,i);g.lineTo(256,i);g.stroke();}const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(12,10);return new THREE.MeshStandardMaterial({map:t,roughness:.96});}
function grassTexture(){const c=document.createElement('canvas');c.width=c.height=256;let g=c.getContext('2d');g.fillStyle='#91b598';g.fillRect(0,0,256,256);for(let i=0;i<6500;i++){const x=seeded(i*3)*256,y=seeded(i*3+1)*256,r=seeded(i+4);g.fillStyle=r>.6?'#98ba9f':r>.3?'#8dad90':'#a5bfa3';g.globalAlpha=.15+seeded(i+5)*.21;g.fillRect(x,y,1+seeded(i+2)*3,1+seeded(i+6)*3)}g.globalAlpha=1;const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(9,7);return new THREE.MeshStandardMaterial({map:t,roughness:1});}
function createGround(){plane(world,0,-.13,0,600,600,'#a9c2ab');plane(world,0,-.08,0,school.site.width,school.site.depth,grassTexture());
  box(world,0,-.05,0,school.site.width+.8,.25,school.site.depth+.8,'#c2caba');
  plane(world,0,.07,0,school.site.width-2,school.site.depth-2,grassTexture());
  const paver=tileTexture();plane(world,0,.12,18,18,62,paver);plane(world,0,.13,-1,95,8,paver);
  plane(world,-27,.13,20,36,16,paver);plane(world,24,.13,32,26,10,paver);
  plane(world,-22,.14,-15,47,9,paver);plane(world,26,.14,-15,43,9,paver);
  // Traffic free campus entrance approach
  plane(world,0,.15,45,13,9,paver);box(world,-8,.68,49,2.5,1.1,1.5,'#d9dbd1');box(world,8,.68,49,2.5,1.1,1.5,'#d9dbd1');
  cyl(world,-7,1.4,48,.14,2.7,'#415f54');cyl(world,7,1.4,48,.14,2.7,'#415f54');
  const top=box(world,0,2.8,48,13.8,.38,.55,'#447566');top.castShadow=true;
  const gateLabel=textSprite('東新國小 · 校園原型',8.2,.95,'#355c4e','#ffffff',41);gateLabel.position.set(0,2.05,48.4);world.add(gateLabel);
  // boundary perimeter (decorative railing)
  for(let x=-58;x<=58;x+=4){for(const z of [-48,48]){if(z===48&&Math.abs(x)<9)continue;cyl(world,x,.55,z,.09,1.1,'#8aada0');}}
  for(let z=-44;z<=44;z+=4){cyl(world,-60,.55,z,.09,1.1,'#8aada0');cyl(world,60,.55,z,.09,1.1,'#8aada0');}
  // Ground navigation lines decorative pads
  for(let i=-24;i<=24;i+=8){box(world,i,.18,18,1,.07,1,'#f1f0de');}
}
function addTree(x,z,s=1,type=0){const g=new THREE.Group();g.position.set(x,0,z);world.add(g);cyl(g,0,1.6*s,0,.23*s,3.2*s,'#866c55',9);
 const shades=['#4d8967','#63977a','#7aa585','#5b8e6c'];
 if(type%3===0){for(let i=0;i<3;i++){let sph=new THREE.Mesh(new THREE.IcosahedronGeometry((1.35+(i%2)*.21)*s,1),getMat(shades[(type+i)%shades.length]));sph.position.set((i-1)*.5*s,3.35*s+(i===1?.7:0),i*.22*s);sph.castShadow=true;g.add(sph)}}
 else{for(let i=0;i<3;i++){let sph=new THREE.Mesh(new THREE.SphereGeometry(1.2*s,8,6),getMat(shades[(type+i)%shades.length]));sph.position.set((i-1)*.48*s,3.3*s+(i===1?.45:0),i*.2*s);sph.castShadow=true;g.add(sph)}}
 return g;}
function addShrub(x,z,s=1){const m=new THREE.Mesh(new THREE.DodecahedronGeometry(s,0),getMat('#648f66'));m.scale.set(1.3,.65,1);m.position.set(x,.55*s,z);m.castShadow=true;world.add(m);}
function streetLamp(x,z){cyl(world,x,2.4,z,.105,4.8,'#627469');const arm=box(world,x+.42,4.72,z,.95,.1,.1,'#627469');box(world,x+.87,4.65,z,.7,.13,.47,'#f5e7bf');let light=new THREE.PointLight(0xffddab,.12,9);light.position.set(x+.87,4.3,z);world.add(light);}
function buildOutdoor(){
 // Basketball court & markings
 box(world,24,.12,6,26,.14,17,'#d7b890');plane(world,24,.207,6,24,15,'#6a9799');
 const line='#e5e9d9';for(let k of [-1,1]){
  box(world,24+k*11,.227,6,.16,.025,13.5,line);
  box(world,24+k*6,.228,6,.12,.02,8.6,line);
  let post=cyl(world,24+k*11,1.65,6,.14,3.3,'#e8e7d8');
  box(world,24+k*11-k*.35,3.1,6,.1,1.65,2.15,'#eff3ea');
  const rim=new THREE.Mesh(new THREE.TorusGeometry(.46,.075,7,16),getMat('#e48e5a'));rim.rotation.x=Math.PI/2;rim.position.set(24+k*11-k*.62,2.65,6);world.add(rim);
 }
 box(world,24,.229,6,.13,.04,14.4,line);
 let center=new THREE.Mesh(new THREE.TorusGeometry(2,.10,6,44),getMat(line));center.rotation.x=Math.PI/2;center.position.set(24,.23,6);world.add(center);
 // Garden
 box(world,-29,.11,4,29,.12,15,'#e3d9c7');plane(world,-29,.188,4,27,13,'#95b99a');
 for(let i=0;i<8;i++){const a=i*Math.PI*2/8;addShrub(-29+Math.cos(a)*10,4+Math.sin(a)*4,.65)}
 let sculpture=new THREE.Mesh(new THREE.IcosahedronGeometry(2,1),getMat('#dbc39b'));sculpture.position.set(-29,1.7,4);sculpture.castShadow=true;world.add(sculpture);
 for(let i=0;i<8;i++){const x=-54+i*15;addTree(x,-43,.93+seeded(i)*.18,i);}
 for(let i=0;i<6;i++){const z=-34+i*13;addTree(-56,z,.95,i+10);}
 for(let i=0;i<6;i++){const z=-30+i*14;addTree(56,z,.97,i+20);}
 [[-51,40],[51,43],[-40,-9],[39,-9],[-44,10],[13,39]].forEach(([x,z],i)=>addTree(x,z,.85,i+21));
 for(let i=0;i<6;i++)addShrub(-44+i*3,34,.55);
 [-13,13].forEach(x=>streetLamp(x,26));streetLamp(-8,-6);streetLamp(8,-6);
 // outdoor benches
 for(const [x,z] of [[-18,8],[-18,2],[-41,10],[15,21]]){box(world,x,.65,z,2.4,.17,.6,'#a27d5b');box(world,x,1.2,z-.23,2.4,.85,.14,'#a27d5b');for(const k of [-.95,.95])cyl(world,x+k,.3,z,.08,.6,'#60675b');}
 const label=textSprite('中庭球場',4.2,.77,'#4b746d');label.position.set(24,1.2,15.6);world.add(label);
}
function baseTag(obj,b){obj.userData.buildingId=b.id;hitMeshes.push(obj);return obj;}
function buildBuilding(b){const root=new THREE.Group();root.position.set(b.x,0,b.z);root.rotation.y=b.front==='north'?Math.PI:0;world.add(root);
 const width=b.width,depth=b.depth,H=b.floorHeight,cnt=b.roomCount,roomW=width/cnt,front=depth/2;
 const floors=[];
 const wallMat=getMat(b.color),ivory=getMat('#f0e9de'),glass=new THREE.MeshStandardMaterial({color:'#92bbba',transparent:true,opacity:.61,metalness:.25,roughness:.13,side:THREE.DoubleSide}),
 frameMat=getMat('#eae8d8'),dark=getMat('#426960');
 box(root,0,.1,0,width+1.2,.28,depth+1.1,'#c9cabd');
 // Ground-level outer shadow slab and plinth
 baseTag(box(root,0,.22,0,width+.3,.35,depth+.4,'#d8d1c1'),b);
 for(let floor=0;floor<b.floors;floor++){
  const group=new THREE.Group();root.add(group);floors.push(group);
  const y=floor*H;const hy=y+H/2;
  baseTag(box(group,0,y+.27,0,width,.22,depth,'#e8e4d8'),b);
  // back opaque wall with centered mullioned window bands
  baseTag(box(group,0,hy,-depth/2,width,H-.24,.32,wallMat),b);
  // side wings
  baseTag(box(group,-width/2,hy,0,.36,H-.18,depth,wallMat),b);
  baseTag(box(group,width/2,hy,0,.36,H-.18,depth,wallMat),b);
  // Exterior walkway at forward edge
  baseTag(box(group,0,y+.2,front-1.45,width,.16,3.0,'#e6ddcc'),b);
  // interior partition back to front, plus doors at classroom face
  for(let r=0;r<cnt;r++){
    const x=-width/2+roomW*r;
    if(r>0)box(group,x,hy-0.05,-1.35,.15,H-.7,depth-3.45,'#f4eee3');
    const center=x+roomW/2;
    // interior floor color accents and desks, visible on selected floor
    box(group,center,y+.34,-1.27,roomW-.35,.08,depth-3.6,r%2===0?'#d8c5a9':'#cabd9b');
    // classroom rear window: make glass inset dark patch and mullions in front of wall
    for(let k=0;k<2;k++){
      const px=center+(k===0?-roomW*.22:roomW*.22);
      box(group,px,y+H*.58,-depth/2-.22,roomW*.3,H*.4,.05,glass);
      box(group,px,y+H*.58,-depth/2-.255,roomW*.018,H*.4,.065,'#e8dfcc');
    }
    // Front classroom wall is broken into two panels and glass entrance
    const frontZ=front-3.05;
    const drW=Math.min(1.65,roomW*.25);
    baseTag(box(group,center-(roomW+drW)/4,hy,frontZ,(roomW-drW)/2,H-.5,.22,wallMat),b);
    baseTag(box(group,center+(roomW+drW)/4,hy,frontZ,(roomW-drW)/2,H-.5,.22,wallMat),b);
    box(group,center,hy-.12,frontZ,drW,H-.85,.06,glass);
    for(let k of [-1,1])box(group,center+k*drW/2,hy-.08,frontZ+.08,.065,H-.8,.1,frameMat);
    box(group,center,hy+H*.33,frontZ,.10,.08,drW,frameMat).rotation.y=Math.PI/2;
    // front room sign on corridor
    const txt=b.rooms[floor]?.[r]||`教室 ${floor+1}-${r+1}`;
    const sign=textSprite(txt,Math.min(roomW*.65,3.7),.55,'#356658','#f5f6f0',38);
    sign.position.set(center,y+H*.73,frontZ+.17);sign.userData={buildingId:b.id,roomId:`${b.id}-${floor+1}-${r+1}`};group.add(sign);hitMeshes.push(sign);
    // room furniture: 2 rows of desks, visible when sliced
    if(b.kind!=='活動場地'&&b.kind!=='行政空間')for(let u=0;u<2;u++)for(let v=0;v<2;v++){
       const dx=center+(u?1:-1)*Math.min(roomW*.21,1.5),dz=-2.4+(v?1.9:0);
       box(group,dx,y+.72,dz,.93,.09,.63,'#b89b79');
       for(const px of [-.33,.33])cyl(group,dx+px,y+.51,dz,.045,.38,'#9b8c7b');
    }
    // Wide glazed strips facing courtyard
    box(group,center,y+H*.58,front+.055,roomW-.8,H*.47,.055,glass);
    box(group,center,y+H*.58,front+.095,.06,H*.48,.08,frameMat);
  }
  // load-bearing courtyard columns and railings
  for(let i=0;i<=cnt;i++){
   const x=-width/2+i*roomW;
   baseTag(box(group,x,hy,front-.25,.35,H, .37,ivory),b);
   if(floor>0){box(group,x,y+1.08,front+.025,.1,.96,.11,frameMat);}
  }
  if(floor>0){box(group,0,y+1.03,front+.04,width,.11,.10,frameMat);box(group,0,y+.35,front+.08,width,.08,.14,'#9aaba2');}
  // accent upper horizontal line
  baseTag(box(group,0,y+H-.23,front+.09,width+.4,.37,.43,'#f0e6d7'),b);
  // side window strips
  [-1,1].forEach(sign=>{for(let j=0;j<3;j++)box(group,sign*(width/2+.02),y+H*.57,-depth/2+1.55+j*3, .07,H*.42,1.6,glass);});
 }
 // roof and parapet, HVAC details
 const roofY=b.floors*H+.08;
 baseTag(box(root,0,roofY,0,width+1.25,.28,depth+1.15,'#e7e0d5'),b);
 [-1,1].forEach(s=>{box(root,0,roofY+.49,s*(depth/2+.42),width+1.2,.82,.25,'#e7e2d8');box(root,s*(width/2+.45),roofY+.49,0,.25,.82,depth+1,'#e7e2d8');});
 for(let i=0;i<Math.min(3,cnt);i++){box(root,-width/3+i*width/3,roofY+.37,-1,1.7,.5,1.2,'#b9c5c0');}
 // roof signage floats on courtyard front for easy reading
 let sign=addName(root,b.name,0,roofY+1.8,front+.3,1);baseTag(sign,b);
 // Front steps & entrance strip
 box(root,0,.11,front+2.0,width*.9,.2,2,'#d6d8c9');
 for(let i=0;i<5;i++){
    const sx=-width*.31+i*width*.155;
    box(root,sx,.17,front+1.0,1.4,.12,.95,'#eee5d6');
 }
 const model={root,floors,b};buildingModels.set(b.id,model);
 obstacles.push({x:b.x,z:b.z,hw:width/2+.5,hd:depth/2+.5});
}
function buildBuildings(){for(const b of school.buildings)buildBuilding(b);}
function createPlayer(){const group=new THREE.Group();scene.add(group);playerMesh=group;
 const skin=getMat('#ecc2a0'),uniform=getMat('#f0e7db'),pants=getMat('#516c70'),hair=getMat('#3c3838'),bag=getMat('#ba8763');
 cyl(group,0,1.16,0,.38,.9,'#7e9b87');const body=box(group,0,1.45,0,.75,.86,.48,uniform);body.castShadow=true;
 let head=new THREE.Mesh(new THREE.SphereGeometry(.35,14,12),skin);head.position.y=2.2;head.castShadow=true;group.add(head);
 let cap=new THREE.Mesh(new THREE.SphereGeometry(.355,14,12),hair);cap.scale.y=.52;cap.position.set(0,2.39,-.025);group.add(cap);
 const eyes=[-.13,.13];eyes.forEach(x=>{const ob=new THREE.Mesh(new THREE.SphereGeometry(.028,8,6),hair);ob.position.set(x,2.22,.328);group.add(ob)});
 let backpack=box(group,0,1.45,-.33,.61,.73,.30,bag);backpack.castShadow=true;
 refs.legs=[];refs.arms=[];
 for(const s of [-1,1]){
  const leg=new THREE.Group();leg.position.set(s*.19,1,0);group.add(leg);box(leg,0,-.36,0,.26,.71,.28,pants);box(leg,0,-.76,.12,.3,.19,.47,'#f0efea');refs.legs.push(leg);
  const arm=new THREE.Group();arm.position.set(s*.5,1.74,0);group.add(arm);box(arm,0,-.31,0,.24,.63,.23,uniform);const palm=new THREE.Mesh(new THREE.SphereGeometry(.13,8,6),skin);palm.position.y=-.65;arm.add(palm);refs.arms.push(arm);
 }
 const ring=new THREE.Mesh(new THREE.RingGeometry(.76,.82,32),new THREE.MeshBasicMaterial({color:'#e8f3df',side:THREE.DoubleSide,transparent:true,opacity:.8}));ring.rotation.x=-Math.PI/2;ring.position.y=.18;group.add(ring);
 group.position.set(state.player.x,.18,state.player.z);group.rotation.y=state.player.heading;
}
function initThree(){if(!THREE)throw new Error('THREE unavailable');const el=$('#scene');scene=new THREE.Scene();scene.background=new THREE.Color('#d9e8e5');scene.fog=new THREE.Fog('#d9e8e5',135,280);
 camera=new THREE.PerspectiveCamera(49,1,.1,500);renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.7));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.outputEncoding=THREE.sRGBEncoding;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;el.appendChild(renderer.domElement);
 scene.add(new THREE.HemisphereLight('#f5ffff','#9fae97',.91));let sun=new THREE.DirectionalLight('#fff1d9',1.25);sun.position.set(-50,100,55);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-100;sun.shadow.camera.right=100;sun.shadow.camera.top=100;sun.shadow.camera.bottom=-100;sun.shadow.camera.near=1;sun.shadow.camera.far=250;sun.shadow.bias=-.0006;scene.add(sun);
 world=new THREE.Group();scene.add(world);createGround();buildBuildings();buildOutdoor();createPlayer();raycaster=new THREE.Raycaster();clock=new THREE.Clock();
 state.orbit.target=new THREE.Vector3(0,4,0);listenScene();onResize();new ResizeObserver(onResize).observe(el);requestAnimationFrame(animate);
}
function onResize(){if(!renderer)return;const r=$('#scene').getBoundingClientRect();const w=Math.max(300,r.width),h=Math.max(250,r.height);camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h,false)}
function isBlocked(x,z,radius=.7){if(Math.abs(x)>school.site.width/2-3||Math.abs(z)>school.site.depth/2-3)return true;return obstacles.some(o=>Math.abs(x-o.x)<o.hw+radius&&Math.abs(z-o.z)<o.hd+radius)}
function movePlayer(dx,dz){const p=state.player,nx=p.x+dx,nz=p.z+dz;if(!isBlocked(nx,p.z,.42))p.x=nx;if(!isBlocked(p.x,nz,.42))p.z=nz}
function animate(){requestAnimationFrame(animate);const dt=Math.min(clock.getDelta(),.065);const mode=state.mode;
 if(mode==='walk'){
  let p=state.player,forward=0,lateral=0;const k=refs.keys||{};
  if(k.KeyW||k.ArrowUp)forward++;if(k.KeyS||k.ArrowDown)forward--;
  if(k.KeyA||k.ArrowLeft)lateral--;if(k.KeyD||k.ArrowRight)lateral++;
  forward-=state.joy.y;lateral+=state.joy.x;
  let moving=false;
  if(state.route.length){
   const next=state.route[state.routeIndex];if(next){let dx=next.x-p.x,dz=next.z-p.z,len=Math.hypot(dx,dz);if(len<.42){state.routeIndex++;if(state.routeIndex>=state.route.length)finishRoute();}
    else{const d=Math.min((k.ShiftLeft?8:6.5)*dt,len);movePlayer(dx/len*d,dz/len*d);p.heading=Math.atan2(dx,dz);moving=true;}}
  }else if(Math.abs(forward)+Math.abs(lateral)>.08){const len=Math.hypot(forward,lateral)||1;forward/=len;lateral/=len;const speed=k.ShiftLeft?9.5:5.7;const h=p.heading;movePlayer((Math.sin(h)*forward+Math.cos(h)*lateral)*dt*speed,(Math.cos(h)*forward-Math.sin(h)*lateral)*dt*speed);moving=true;}
  playerMesh.position.set(p.x,.18,p.z);playerMesh.rotation.y=p.heading;
  walkingTween+=dt*(moving?9:3);refs.legs?.forEach((g,i)=>g.rotation.x=moving?Math.sin(walkingTween+Math.PI*i)*.54:THREE.MathUtils.lerp(g.rotation.x,0,.12));refs.arms?.forEach((g,i)=>g.rotation.x=moving?Math.sin(walkingTween+Math.PI*(i+1))*.44:THREE.MathUtils.lerp(g.rotation.x,0,.12));
  const behind=7.8,des=new THREE.Vector3(p.x-Math.sin(p.heading)*behind,5.4,p.z-Math.cos(p.heading)*behind);
  camera.position.lerp(des,Math.min(1,dt*6));camera.lookAt(p.x,1.9,p.z);playerMesh.visible=true;
 }else{const o=state.orbit,sz=o.dist,az=o.az,polar=o.polar;const desired=new THREE.Vector3(o.target.x+Math.sin(az)*Math.sin(polar)*sz,o.target.y+Math.cos(polar)*sz,o.target.z+Math.cos(az)*Math.sin(polar)*sz);
  camera.position.lerp(desired,Math.min(1,dt*5));camera.lookAt(o.target);playerMesh.visible=true;
 }
 renderer.render(scene,camera);drawMinimap();}
function listenScene(){const el=renderer.domElement;let moved=false;
 el.addEventListener('pointerdown',e=>{if(e.button!==0)return;state.dragging=true;moved=false;state.pointerStart={x:e.clientX,y:e.clientY};el.setPointerCapture(e.pointerId)});
 el.addEventListener('pointermove',e=>{if(!state.dragging||!state.pointerStart)return;const dx=e.clientX-state.pointerStart.x,dy=e.clientY-state.pointerStart.y;if(Math.abs(dx)+Math.abs(dy)>2)moved=true;
  if(state.mode==='overview'){state.orbit.az-=dx*.006;state.orbit.polar=THREE.MathUtils.clamp(state.orbit.polar+dy*.005,.22,1.48)}
  else state.player.heading-=dx*.007;
  state.pointerStart={x:e.clientX,y:e.clientY};});
 el.addEventListener('pointerup',e=>{if(!state.dragging)return;state.dragging=false;state.pointerStart=null;if(!moved&&state.mode==='overview')raySelect(e);});
 el.addEventListener('pointercancel',()=>{state.dragging=false;state.pointerStart=null});
 el.addEventListener('wheel',e=>{if(state.mode!=='overview')return;e.preventDefault();state.orbit.dist=THREE.MathUtils.clamp(state.orbit.dist+e.deltaY*.065,17,158)},{passive:false});
 document.addEventListener('keydown',e=>{if(e.code==='Slash'&&document.activeElement!==$('#search')){e.preventDefault();$('#search').focus();}if(/^(KeyW|KeyA|KeyS|KeyD|ArrowUp|ArrowDown|ArrowLeft|ArrowRight|ShiftLeft)$/.test(e.code)&&document.activeElement?.tagName!=='INPUT'){e.preventDefault();refs.keys[e.code]=true;if(state.route.length&&e.code!=='ShiftLeft')finishRoute(true);}if(e.code==='Escape'){$('#help-overlay').classList.add('hidden');$('#intro').classList.add('hidden')}});
 document.addEventListener('keyup',e=>refs.keys[e.code]=false);refs.keys={};
 const joystick=$('#mobile-joystick');joystick.addEventListener('pointerdown',e=>{joystick.setPointerCapture(e.pointerId);updateJoy(e)});joystick.addEventListener('pointermove',e=>{if(e.buttons)updateJoy(e)});joystick.addEventListener('pointerup',()=>{state.joy={x:0,y:0};joystick.querySelector('div').style.transform='' });
 function updateJoy(e){const r=joystick.getBoundingClientRect(),dx=(e.clientX-r.left-r.width/2)/(r.width*.33),dy=(e.clientY-r.top-r.height/2)/(r.height*.33);let len=Math.max(1,Math.hypot(dx,dy));state.joy={x:dx/len,y:dy/len};joystick.querySelector('div').style.transform=`translate(${state.joy.x*28}px,${state.joy.y*28}px)`}
}
function raySelect(e){const r=renderer.domElement.getBoundingClientRect();const pt=new THREE.Vector2((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);raycaster.setFromCamera(pt,camera);const hits=raycaster.intersectObjects(hitMeshes,true);
 for(const hit of hits){let obj=hit.object;while(obj){if(obj.userData?.roomId){const room=rooms.find(x=>x.id===obj.userData.roomId);if(room){selectItem(room);return}}if(obj.userData?.buildingId){const b=school.buildings.find(x=>x.id===obj.userData.buildingId);if(b){selectItem(b);return}}obj=obj.parent;}}
}
function focusBuilding(b,floor=0){state.building=b;state.activeFloor=floor;
 for(const [id,model] of buildingModels){model.floors.forEach((g,i)=>{g.visible=id!==b?.id||floor===0||i<floor});}
 renderFloors();if(b&&state.mode==='overview'){const h=(floor>0?Math.max(3,(floor-.35)*b.floorHeight):b.floors*b.floorHeight*.5);state.orbit.target.set(b.x,h,b.z);state.orbit.dist=THREE.MathUtils.clamp(b.width*1.7,37,66);}}
function renderFloors(){const b=state.building;const cont=$('#floor-switcher');cont.innerHTML='';let nums=[0,...Array.from({length:b?.floors||4},(_,i)=>i+1)];for(const f of nums){const el=document.createElement('button');el.className='floor-btn'+(state.activeFloor===f?' active':'');el.textContent=f===0?'全部':`${f}F`;el.title=f===0?'顯示整棟建築':`顯示 ${f} 樓及以下`;el.addEventListener('click',()=>{if(!b&&school.buildings[0])focusBuilding(school.buildings[0],f);else focusBuilding(b,f);if(state.mode==='walk')setMode('overview');});cont.append(el)}}
function selectItem(item){state.selected=item;const b=item.building||((item.floors)?item:null);if(b)focusBuilding(b,item.floor||0);
 $('#selection-card').classList.remove('hidden');$('#selection-type').textContent=item.floor?'CLASSROOM · SPACE':item.kind==='戶外運動'?'OPEN SPACE · COURT':'CAMPUS · BUILDING';
 $('#selection-title').textContent=item.name;
 $('#selection-sub').textContent=item.floor?`${b.name} · ${item.floor} 樓 · 示範教室`:(item.floors?`${item.floors} 層樓 · ${item.rooms.flat().length} 間示範空間`:`${item.kind} · 校園戶外設施`);
 $('#selection-kind').textContent=item.kind||b.kind;$('#selection-floor').textContent=item.floor?`${item.floor}F`:(item.floors?`1F — ${item.floors}F`:'戶外');
 if(item.x!==undefined&&state.mode==='overview'){
  if(!b){state.orbit.target.set(item.x,1.2,item.z);state.orbit.dist=44;}
  else if(item.floor){state.orbit.target.set(item.x,(item.floor-.55)*b.floorHeight,item.building.z);state.orbit.dist=33;}
 }
 renderLists();}
function renderLists(){const q=state.search.toLowerCase();const target=$('#building-list');target.innerHTML='';let buildings=school.buildings.filter(b=>!q||b.name.includes(q)||b.kind.includes(q)||b.rooms.some(arr=>arr.some(name=>name.includes(q))));
 for(const b of buildings){let el=document.createElement('button');el.className='building-item'+(state.building?.id===b.id?' selected':'');el.innerHTML=`<span class="building-thumb" style="--building-color:${b.color}"></span><span><strong>${b.name}</strong><small>${b.floors} 層樓 · ${b.kind}</small></span><span class="building-chevron">›</span>`;el.addEventListener('click',()=>{selectItem(b);setMode('overview')});target.append(el)}
 $('#building-count').textContent=String(buildings.length).padStart(2,'0');const roomEl=$('#room-list');roomEl.innerHTML='';const shown=rooms.filter(r=> (!q||r.name.includes(q)||r.building.name.includes(q)) && (q||r.building.id===(state.building?.id||'a'))).slice(0,22);
 $('#room-count').textContent=String(shown.length).padStart(2,'0');if(!shown.length){roomEl.innerHTML='<div class="room-empty">找不到符合的教室，試試其他關鍵字。</div>';return;}
 for(const r of shown){const el=document.createElement('button');el.className='room-item'+(state.selected?.id===r.id?' selected':'');el.innerHTML=`<span>${r.name}</span><span>${r.floor}F　↗</span>`;el.addEventListener('click',()=>{selectItem(r);setMode('overview')});roomEl.append(el)}
}
function setMode(mode){state.mode=mode;$('#mode-overview').classList.toggle('active',mode==='overview');$('#mode-walk').classList.toggle('active',mode==='walk');$('#walk-hud').classList.toggle('hidden',mode!=='walk');$('#mobile-joystick').classList.toggle('hidden',mode!=='walk');
 $('#scene-label').textContent=mode==='walk'?'地面步行 · 第三人稱':'全校鳥瞰';
 if(mode==='overview'){if(!state.building){state.orbit.target.set(0,4,0);state.orbit.dist=104;}}
 else{focusBuilding(null,0);$('#selection-card').classList.add('hidden');}
}
function routeDestination(item){const b=item.building||((item.floors)?item:null);if(!b)return {x:item.x,z:item.z};const pos=item.floor?item.x:b.x;const dir=b.front==='north'?-1:1;
 return {x:pos,z:b.z+dir*(b.depth/2+3.2)};}
function findPath(start,goal){const step=2,ox=-Math.floor(school.site.width/2)+2,oz=-Math.floor(school.site.depth/2)+2,nx=Math.floor((school.site.width-5)/step),nz=Math.floor((school.site.depth-5)/step);
 const key=(a,b)=>`${a},${b}`,toGrid=p=>({i:Math.round((p.x-ox)/step),j:Math.round((p.z-oz)/step)}),toWorld=(i,j)=>({x:ox+i*step,z:oz+j*step});
 const a=toGrid(start),b=toGrid(goal),blocked=(i,j)=>{if(i<0||i>=nx||j<0||j>=nz)return true;const p=toWorld(i,j);return isBlocked(p.x,p.z,.5)};
 function nearest(cell){if(!blocked(cell.i,cell.j))return cell;for(let r=1;r<8;r++){for(let i=cell.i-r;i<=cell.i+r;i++)for(let j=cell.j-r;j<=cell.j+r;j++){if(!blocked(i,j))return {i,j}}}return cell}
 const A=nearest(a),B=nearest(b),startK=key(A.i,A.j),endK=key(B.i,B.j),open=[A],visited=new Set([startK]),parent=new Map();let found=false;
 while(open.length){const cur=open.shift(),curK=key(cur.i,cur.j);if(curK===endK){found=true;break;}
  for(const [di,dj] of [[1,0],[-1,0],[0,1],[0,-1]]){const ni=cur.i+di,nj=cur.j+dj,k=key(ni,nj);if(visited.has(k)||blocked(ni,nj))continue;visited.add(k);parent.set(k,curK);open.push({i:ni,j:nj})}}
 if(!found)return [];
 let cur=endK,list=[];while(cur){const [i,j]=cur.split(',').map(Number);list.push(toWorld(i,j));cur=parent.get(cur)}list.reverse();
 let points=[{x:start.x,z:start.z},...list];if(!isBlocked(goal.x,goal.z,.4))points.push(goal);
 return points.filter((p,i)=>i===0||i===points.length-1||i%2===0);
}
function showRoute(path){if(routeObject){scene.remove(routeObject);routeObject=null;}if(path.length<2)return;const group=new THREE.Group();const pts=path.map(p=>new THREE.Vector3(p.x,.45,p.z));const curve=new THREE.CatmullRomCurve3(pts,false,'centripetal');const tube=new THREE.Mesh(new THREE.TubeGeometry(curve,Math.max(18,path.length*3),.13,8,false),new THREE.MeshBasicMaterial({color:'#f4c36b',transparent:true,opacity:.96}));group.add(tube);
 for(let i=0;i<pts.length;i+=Math.max(1,Math.ceil(pts.length/11))){let ob=new THREE.Mesh(new THREE.SphereGeometry(.23,8,8),new THREE.MeshBasicMaterial({color:'#fff5c4'}));ob.position.copy(pts[i]);group.add(ob)}
 let marker=new THREE.Mesh(new THREE.ConeGeometry(.65,1.5,6),new THREE.MeshStandardMaterial({color:'#e0aa55',emissive:'#a56f32',emissiveIntensity:.15}));marker.position.set(pts.at(-1).x,1.55,pts.at(-1).z);marker.rotation.x=Math.PI;group.add(marker);scene.add(group);routeObject=group;
}
function startNavigation(){const item=state.selected;if(!item)return;const dest=routeDestination(item),path=findPath(state.player,dest);if(path.length<2){$('#route-status').classList.remove('hidden');$('#route-copy').textContent='找不到可通行路線，請改選其他地點';return;}state.route=path.slice(1);state.routeIndex=0;showRoute(path);setMode('walk');$('#route-status').classList.remove('hidden');$('#route-copy').textContent=`正在前往：${item.name}`;}
function finishRoute(cancel=false){state.route=[];state.routeIndex=0;$('#route-status').classList.add('hidden');if(routeObject){scene.remove(routeObject);routeObject=null;}if(!cancel){$('#scene-label').textContent='已抵達目標入口';}}
function drawMinimap(){const cv=$('#minimap');if(!cv)return;const ctx=cv.getContext('2d'),w=cv.width,h=cv.height,sx=w/school.site.width,sz=h/school.site.depth;
 ctx.fillStyle='#dfeadf';ctx.fillRect(0,0,w,h);const X=x=>(x+school.site.width/2)*sx,Z=z=>(z+school.site.depth/2)*sz;
 ctx.fillStyle='#c0d4c4';ctx.fillRect(X(-12),Z(-50),X(12)-X(-12),h);
 ctx.fillStyle='#d2dcca';ctx.fillRect(X(-48),Z(-5),X(48)-X(-48),sz*10);
 for(const b of school.buildings){ctx.fillStyle=state.building?.id===b.id?'#4d8768':'#9aae99';ctx.fillRect(X(b.x-b.width/2),Z(b.z-b.depth/2),b.width*sx,b.depth*sz);ctx.strokeStyle='#f9fbf4';ctx.lineWidth=1;ctx.strokeRect(X(b.x-b.width/2),Z(b.z-b.depth/2),b.width*sx,b.depth*sz);}
 ctx.fillStyle='#77a5a7';ctx.fillRect(X(11),Z(-2),26*sx,17*sz);
 if(state.route.length){ctx.strokeStyle='#dbad52';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(X(state.player.x),Z(state.player.z));for(const p of state.route.slice(state.routeIndex)){ctx.lineTo(X(p.x),Z(p.z));}ctx.stroke()}
 ctx.beginPath();ctx.arc(X(state.player.x),Z(state.player.z),4.2,0,Math.PI*2);ctx.fillStyle='#e1a854';ctx.fill();ctx.strokeStyle='#fff';ctx.lineWidth=1.8;ctx.stroke();
 $('#map-caption').textContent=`目前位置 · ${state.mode==='walk'?'步行中':'校園地圖'}`;
}
function setupUI(){renderFloors();renderLists();$('#search').addEventListener('input',e=>{state.search=e.target.value;renderLists()});
 $('#selection-close').addEventListener('click',()=>{$('#selection-card').classList.add('hidden');state.selected=null;});$('#go-to').addEventListener('click',startNavigation);
 $('#mode-walk').addEventListener('click',()=>setMode('walk'));$('#mode-overview').addEventListener('click',()=>setMode('overview'));
 $('#reset-view').addEventListener('click',()=>{state.selected=null;focusBuilding(null,0);state.orbit.target.set(0,4,0);state.orbit.dist=104;state.orbit.az=.67;state.orbit.polar=.98;setMode('overview');$('#selection-card').classList.add('hidden');renderLists()});
 $('#route-cancel').addEventListener('click',()=>finishRoute(true));$('#hint-close').addEventListener('click',()=>$('#scene-hint').classList.add('hidden'));
 $('#start-walk').addEventListener('click',()=>{$('#intro').classList.add('hidden');setMode('walk')});$('#start-overview').addEventListener('click',()=>{$('#intro').classList.add('hidden');setMode('overview')});
 $('#help-btn').addEventListener('click',()=>$('#help-overlay').classList.remove('hidden'));
 $('#help-close').addEventListener('click',()=>$('#help-overlay').classList.add('hidden'));
 $('#help-ok').addEventListener('click',()=>$('#help-overlay').classList.add('hidden'));
}
try{initThree();setupUI();$('#scene-loading').classList.add('hidden');window.__campus={state,school,rooms,selectItem,setMode,findPath,isBlocked,getHealth:()=>({rendered:renderer.info.render.calls,buildings:buildingModels.size,rooms:rooms.length,mode:state.mode,canvas:renderer.domElement.width+'x'+renderer.domElement.height})};}
catch(err){console.error('3D campus initialization failed',err);$('#scene-loading').classList.add('hidden');$('#scene-error').classList.remove('hidden');$('#scene-error').textContent=`3D 場景初始化失敗：${err.message}`;}