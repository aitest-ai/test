import * as THREE from 'three';
import {
  HOME_Z,FIXED_DT,PITCHES,DIFFICULTY,clamp,lerp,createPitch,stepPitch,
  insideZone,batContact,stepBattedBall,classifyBall,advanceBases,advanceWalk
} from './physics.js';

const $=(id)=>document.getElementById(id);
const canvas=$('game-canvas'),area=$('arena');
const QA_MODE=new URLSearchParams(location.search).has('qa');
const els={pitchButton:$('pitch-button'),pitchLabel:$('pitch-button-label'),swingButton:$('swing-button'),mobileSwing:$('mobile-swing'),soundButton:$('sound-button'),
  call:$('big-call'),callHead:$('call-head'),callDescription:$('call-description'),flightMain:$('flight-main'),flightSub:$('flight-sub'),
  actionHelp:$('action-help'),actionKicker:$('action-kicker'),aimFrame:$('aim-frame'),aimCross:$('aim-cross')};
const state={phase:'ready',pitchType:'fastball',difficulty:'rookie',aim:{x:0,y:1.06},pitch:null,batted:null,swingTime:-1,swingCount:0,
  windup:0,resultTime:0,balls:0,strikes:0,outs:0,runs:0,hits:0,homers:0,bestDistance:0,bases:[false,false,false],
  sound:true,trail:[],frameIndex:0,hitFlash:0};

let renderer,scene,camera,clock,baseball,batter,pitcher,batPivot,bat,batOriginal,shadows,stadiumLights,trailLine,flightShadow,catcher;
const FLIGHT_END=8;
const mat=(hex,extra={})=>new THREE.MeshStandardMaterial({color:hex,roughness:.87,...extra});
const mats={grass:mat('#568d5e'),dirt:mat('#b2764b'),chalk:new THREE.MeshBasicMaterial({color:'#fff9e2'}),white:mat('#fff8e9'),navy:mat('#173c4a'),dark:mat('#244b52'),brown:mat('#a47d50'),metal:mat('#a8c1bd',{metalness:.5,roughness:.4}),red:mat('#d8774e'),skin:mat('#d6a17c'),ball:mat('#f5f0df'),rim:mat('#dbc69e')};
function mesh(geometry,material,position,cast=false){const item=new THREE.Mesh(geometry,material);if(position)item.position.set(...position);item.castShadow=cast;item.receiveShadow=true;scene.add(item);return item;}
function box(w,h,d,x,y,z,material,cast=true){return mesh(new THREE.BoxGeometry(w,h,d),material,[x,y,z],cast);}
function cylinder(rt,rb,h,x,y,z,material,segments=12){return mesh(new THREE.CylinderGeometry(rt,rb,h,segments),material,[x,y,z],true);}
function line(a,b,color='#f7efcf',radius=.036){const av=new THREE.Vector3(...a),bv=new THREE.Vector3(...b),dir=bv.clone().sub(av),length=dir.length();const line=mesh(new THREE.CylinderGeometry(radius,radius,length,7),mat(color),[...av.clone().add(bv).multiplyScalar(.5).toArray()],false);line.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),dir.normalize());return line;}
function fieldPolygon(points,color,y=.015){const v=[];for(let i=1;i<points.length-1;i++){v.push(points[0][0],y,points[0][1],points[i][0],y,points[i][1],points[i+1][0],y,points[i+1][1]);}const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(v,3));g.computeVertexNormals();return mesh(g,mat(color,{side:THREE.DoubleSide}),null,false);}
function makeTexture(){const c=document.createElement('canvas');c.width=c.height=256;const x=c.getContext('2d');x.fillStyle='#517e53';x.fillRect(0,0,256,256);for(let i=0;i<4800;i++){x.fillStyle=i%5===0?'#63865c':'#719669';x.globalAlpha=.055+Math.random()*.15;x.fillRect(Math.random()*256,Math.random()*256,1+Math.random()*2,2+Math.random()*4);}x.globalAlpha=1;const tex=new THREE.CanvasTexture(c);tex.wrapS=tex.wrapT=THREE.RepeatWrapping;tex.repeat.set(36,32);tex.colorSpace=THREE.SRGBColorSpace;return tex;}
function createField(){
 const turf=mat('#5c8a5a',{map:makeTexture(),roughness:1});
 const plane=mesh(new THREE.PlaneGeometry(235,205),turf,[0,-.06,-30]);plane.rotation.x=-Math.PI/2;
 // mow pattern across the outfield
 for(let i=0;i<12;i++){const stripe=mesh(new THREE.PlaneGeometry(235,8),mat(i%2?'#86aa65':'#68985d',{transparent:true,opacity:.09}),[0,-.03,-107+i*12]);stripe.rotation.x=-Math.PI/2;}
 // fan of deep-green fair outfield, between foul lines
 const fan=[[0,HOME_Z]];for(let a=-Math.PI/4;a<=Math.PI/4+.001;a+=Math.PI/64)fan.push([Math.sin(a)*94,HOME_Z-Math.cos(a)*94]);fieldPolygon(fan,'#4d8154',-.008);
 // slightly darker home plate dirt and diamond infield
 fieldPolygon([[0,HOME_Z],[22,-13],[0,-35],[-22,-13]],'#ab6b43',.023);
 fieldPolygon([[0,HOME_Z],[15,-7],[0,-22],[-15,-7]],'#789b59',.032);
 // base paths & dirt patches
 for(const [x,z] of [[0,HOME_Z],[22,-13],[0,-35],[-22,-13]]){
   const pad=mesh(new THREE.CylinderGeometry(2.3,2.3,.08,28),mats.dirt,[x,.045,z]);
   if(z!==HOME_Z){const base=box(.74,.10,.74,x,.14,z,mats.white);base.rotation.y=Math.PI/4;}
 }
 const home=fieldPolygon([[-.4,HOME_Z+.12],[.4,HOME_Z+.12],[.4,HOME_Z-.45],[0,HOME_Z-.85],[-.4,HOME_Z-.45]],'#f8f7e7',.18);
 line([0,.13,HOME_Z],[60,.13,-52],'#f9eed7',.085);line([0,.13,HOME_Z],[-60,.13,-52],'#f9eed7',.085);
 // mound
 const mound=mesh(new THREE.CylinderGeometry(2.5,2.9,.24,48),mats.dirt,[0,.12,-17.5]);
 box(.65,.08,.22,0,.31,-17.5,mats.white);
 // batter's boxes & catcher's arc
 line([-2.1,.14,HOME_Z+1.65],[-2.1,.14,HOME_Z-1.4],'#fbf1d8',.05);
 line([-2.1,.14,HOME_Z+1.65],[-.9,.14,HOME_Z+1.65],'#fbf1d8',.05);
 line([1.15,.14,HOME_Z+1.65],[1.15,.14,HOME_Z-1.4],'#fbf1d8',.05);
 for(let t=-48;t<=48;t+=3){const a=t*Math.PI/180,next=(t+3)*Math.PI/180;line([94*Math.sin(a),1.1,HOME_Z-94*Math.cos(a)],[94*Math.sin(next),1.1,HOME_Z-94*Math.cos(next)],'#194550',.21);}
 for(let t=-48;t<=48;t+=6){const a=t*Math.PI/180;const x=94*Math.sin(a),z=HOME_Z-94*Math.cos(a);box(1.45,2.8,.35,x,1.5,z,mats.dark,false);}
 // warning track
 for(let t=-46;t<46;t+=3){const a=t*Math.PI/180,next=(t+3)*Math.PI/180;line([88*Math.sin(a),.02,HOME_Z-88*Math.cos(a)],[88*Math.sin(next),.02,HOME_Z-88*Math.cos(next)],'#a87955',1.8);}
 // Outfield billboards, bleachers and upright stadium floodlights
 for(let s of [-1,1]){
   for(let i=0;i<13;i++){
     const x=s*(57+i*.9),z=4-i*4.4;
     for(let r=0;r<5;r++){box(1.12,.29,2.15,x+s*r*.83,.28+r*.65,z,mat(r%2?'#8dabb0':'#577c81'),false);}
   }
   const cx=s*77,cz=-47;
   cylinder(.38,.72,22,cx,11,cz,mat('#455a61'),9);
   const beam=box(7.5,3.4,.65,cx,22,cz,mat('#eff4df',{emissive:'#d9edb2',emissiveIntensity:.7}));
   beam.rotation.y=s*.25;
   for(let r=-1;r<=1;r++)for(let c=-2;c<=2;c++)box(.95,.72,.1,cx+c*1.2,22+r*.95,cz+.5,mat('#fff7d5',{emissive:'#ffedbc',emissiveIntensity:1.2}));
 }
 // scoreboard behind center field
 box(18,8,1,0,10,-87,mat('#182e34'));
 box(15,1.2,.1,0,12.7,-86.4,mat('#e0a66d',{emissive:'#c48b4b',emissiveIntensity:.3}));
 for(let r=0;r<2;r++)for(let c=0;c<8;c++)box(.9,.62,.08,-5.5+c*1.6,9.5-r*1.35,-86.4,mat(c%2?'#91ca9c':'#d4c27d',{emissive:c%2?'#588768':'#8c7646',emissiveIntensity:.4}));
 // simple backstop and dugout roofs
 for(let s of [-1,1]){
  box(14,1.2,5,s*34,1.8,14,mat('#243e46'));
  box(15,.5,5.8,s*34,3.15,14,mat('#e2c49f'));
  for(let k=0;k<4;k++)box(.25,2.5,.3,s*(28+k*4),1.75,16.4,mat('#59766b'));
 }
}
function modelPerson(pos,uniform,trim,hat,scale=1){
 const person=new THREE.Group();scene.add(person);person.position.set(...pos);person.scale.setScalar(scale);
 const pants=mat('#e9e5d6'),shirt=mat(uniform),edge=mat(trim),hatmat=mat(hat);
 const g=new THREE.Group();person.add(g);
 function shape(geo,material,point,parent=g){const o=new THREE.Mesh(geo,material);o.castShadow=true;o.receiveShadow=true;o.position.set(...point);parent.add(o);return o;}
 function limb(a,b,r1,r2,material,parent=g){const av=new THREE.Vector3(...a),bv=new THREE.Vector3(...b),d=bv.clone().sub(av);const m=shape(new THREE.CylinderGeometry(r1,r2,d.length(),10),material,av.clone().add(bv).multiplyScalar(.5).toArray(),parent);m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.clone().normalize());return m;}
 shape(new THREE.SphereGeometry(.33,14,10),mats.skin,[0,2.35,0]);
 shape(new THREE.SphereGeometry(.31,15,8),hatmat,[0,2.56,0]);shape(new THREE.BoxGeometry(.62,.06,.32),hatmat,[0,2.50,-.2]);
 shape(new THREE.CylinderGeometry(.50,.43,1.02,11),shirt,[0,1.53,0]);
 shape(new THREE.CylinderGeometry(.43,.41,.32,10),edge,[0,1.07,0]);
 const leftArm=new THREE.Group();leftArm.position.set(-.45,1.93,0);g.add(leftArm);
 const rightArm=new THREE.Group();rightArm.position.set(.45,1.93,0);g.add(rightArm);
 limb([0,0,0],[-.13,-.49,-.08],.16,.12,shirt,leftArm);limb([-.13,-.49,-.08],[-.19,-.8,-.12],.12,.09,mats.skin,leftArm);
 limb([0,0,0],[.13,-.49,-.08],.16,.12,shirt,rightArm);limb([.13,-.49,-.08],[.19,-.8,-.12],.12,.09,mats.skin,rightArm);
 for(const x of [-.23,.23]){limb([x,1.01,0],[x,.2,0],.17,.13,pants);shape(new THREE.BoxGeometry(.35,.2,.58),edge,[x,.12,-.16]);}
 return {person,g,leftArm,rightArm};
}
function makePlayers(){
 pitcher=modelPerson([0,.33,-17.5],'#fff2de','#164957','#184353',1.03);
 pitcher.person.rotation.y=Math.PI;
 batter=modelPerson([-1.6,.1,HOME_Z+1.25],'#f3ede0','#bf7145','#b76d4a',1.03);
 batter.person.rotation.y=-.3;
 catcher=modelPerson([0,-.1,HOME_Z+3.35],'#315c6c','#234959','#1f3945',.91);
 catcher.g.position.y=-.65;catcher.rightArm.rotation.x=.55;
 // bat from pivot near shoulder; rotates across the plate
 batPivot=new THREE.Group();batPivot.position.set(-1.13,1.82,HOME_Z+1.05);scene.add(batPivot);
 const batGeo=new THREE.CylinderGeometry(.055,.10,2.0,12);
 bat=new THREE.Mesh(batGeo,mat('#d6a06c'));bat.position.set(.62,.5,-.18);bat.rotation.z=1.00;batPivot.add(bat);
 const grip=new THREE.Mesh(new THREE.CylinderGeometry(.065,.065,.5,10),mat('#243e3d'));grip.position.set(.05,-.25,0);grip.rotation.z=1.0;batPivot.add(grip);
 batOriginal=batPivot.rotation.y;
}
function makeBall(){
 baseball=new THREE.Group();scene.add(baseball);
 const shell=new THREE.Mesh(new THREE.SphereGeometry(.118,20,15),mats.ball);shell.castShadow=true;baseball.add(shell);
 const seam=mat('#b44745');
 for(let i=0;i<2;i++){
   const curve=[];for(let j=0;j<=22;j++){const t=j/22*Math.PI*2;curve.push(new THREE.Vector3(.117*Math.cos(t),.055*Math.sin(2*t)*(i?1:-1),.117*Math.sin(t)));}
   const ribbon=new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve),new THREE.LineBasicMaterial({color:'#b5524f'}));baseball.add(ribbon);
 }
 baseball.visible=false;
 const sh=new THREE.Mesh(new THREE.CircleGeometry(.23,20),new THREE.MeshBasicMaterial({color:'#193225',transparent:true,opacity:.4,depthWrite:false}));sh.rotation.x=-Math.PI/2;sh.position.y=.06;scene.add(sh);flightShadow=sh;
 trailLine=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(),new THREE.Vector3()]),new THREE.LineBasicMaterial({color:'#ffda8d',transparent:true,opacity:.86}));trailLine.visible=false;scene.add(trailLine);
}
function initWorld(){
 scene=new THREE.Scene();scene.background=new THREE.Color('#a7c5c8');scene.fog=new THREE.Fog('#bbccd1',115,270);
 camera=new THREE.PerspectiveCamera(54,1,.1,600);camera.position.set(5.4,9.1,27);camera.lookAt(0,.8,-5);
 renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
 renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.7));renderer.setSize(area.clientWidth,area.clientHeight,false);
 renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.27;
 renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
 scene.add(new THREE.HemisphereLight('#edf9ff','#537e50',2.5));
 const sun=new THREE.DirectionalLight('#ffe2ac',3.0);sun.position.set(-35,70,5);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-83;sun.shadow.camera.right=83;sun.shadow.camera.top=78;sun.shadow.camera.bottom=-68;sun.shadow.bias=-.0003;scene.add(sun);
 createField();makePlayers();makeBall();
 window.addEventListener('resize',resize);
 if('ResizeObserver' in window)new ResizeObserver(resize).observe(area);
 clock=new THREE.Clock();resize();
 $('loading').hidden=true;
 requestAnimationFrame(frame);
}
function resize(){if(!renderer)return;const w=area.clientWidth,h=area.clientHeight;if(w&&h){renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();}}
function setCall(title,subtitle='',highlight=false){els.call.classList.remove('hidden');els.call.classList.toggle('highlight',highlight);els.callHead.textContent=title;els.callDescription.textContent=subtitle;}
function hideCall(){els.call.classList.add('hidden');}
function sayFlight(main,sub=''){els.flightMain.textContent=main;els.flightSub.textContent=sub;}
function sound(note='hit'){if(!state.sound)return;try{const ac=new (window.AudioContext||window.webkitAudioContext)(),osc=ac.createOscillator(),gain=ac.createGain();osc.connect(gain);gain.connect(ac.destination);osc.type=note==='hit'?'triangle':'sine';osc.frequency.setValueAtTime(note==='hit'?360:note==='pitch'?480:175,ac.currentTime);osc.frequency.exponentialRampToValueAtTime(note==='hit'?105:note==='pitch'?250:85,ac.currentTime+.16);gain.gain.setValueAtTime(.065,ac.currentTime);gain.gain.exponentialRampToValueAtTime(.0001,ac.currentTime+.2);osc.start();osc.stop(ac.currentTime+.21);osc.onended=()=>ac.close();}catch{}}
function updateNumbers(){
 for(const k of ['balls','strikes','outs','runs','hits','homers'])$(k).textContent=state[k];
 $('best-distance').textContent=Math.round(state.bestDistance);
 state.bases.forEach((active,i)=>$('base-'+(i+1)).classList.toggle('on',active));
}
function choosePitch(type){if(state.phase==='windup'||state.phase==='flight'||state.phase==='batted')return;state.pitchType=type;
 document.querySelectorAll('.pitch').forEach(b=>b.classList.toggle('active',b.dataset.type===type));const spec=PITCHES[type];sayFlight(spec.en,`${spec.name} · 名目球速 ${spec.kmh} km/h（難度會調整）`);
}
function chooseDifficulty(diff){if(state.phase==='windup'||state.phase==='flight'||state.phase==='batted')return;state.difficulty=diff;
 document.querySelectorAll('.diff').forEach(b=>b.classList.toggle('active',b.dataset.difficulty===diff));
}
function readyControls(){const throwing=state.phase==='windup'||state.phase==='flight'||state.phase==='batted';
 els.pitchButton.disabled=throwing;els.pitchLabel.textContent=state.phase==='ready'?'開始投球':state.phase==='result'?'下一球 · 再挑戰':'球路進行中';
 els.swingButton.disabled=state.phase!=='flight';els.mobileSwing.disabled=state.phase!=='flight';
 document.querySelectorAll('.pitch,.diff').forEach(b=>b.disabled=throwing);
 els.actionKicker.textContent=state.phase==='flight'?'WATCH THE BALL · SWING ON TIME':state.phase==='windup'?'PITCHER IS WINDING UP':'BATTER READY';
 els.actionHelp.textContent=state.phase==='flight'?'球快到本壘了！空白鍵揮棒，或點擊「揮棒」。':state.phase==='windup'?'投手正在準備投球…': '移動瞄準點，準備迎接下一球。';
}
function resetBallVisual(){state.trail=[];trailLine.visible=false;baseball.visible=false;flightShadow.visible=false;}
function startPitch(){if(!['ready','result'].includes(state.phase))return;
 state.phase='windup';state.windup=0;state.pitch=createPitch(state.pitchType,state.difficulty);state.batted=null;state.swingTime=-1;state.swingCount=0;
 resetBallVisual();state.hitFlash=0;setCall('GET READY','投手即將出手');sayFlight(state.pitch.pitch.en,`${state.pitch.pitch.name} · ${Math.round(state.pitch.kmh)} km/h`);readyControls();sound('pitch');
}
function swing(){if(state.phase!=='flight'||state.swingCount)return;
 state.swingCount=1;state.swingTime=0;sound('swing');
}
function addTrail(pos){state.frameIndex++;if(state.frameIndex%3)return;state.trail.push(new THREE.Vector3(pos.x,pos.y,pos.z));if(state.trail.length>115)state.trail.shift();if(state.trail.length<2)return;trailLine.geometry.dispose();trailLine.geometry=new THREE.BufferGeometry().setFromPoints(state.trail);trailLine.visible=true;}
function positionBall(pos){baseball.visible=true;baseball.position.set(pos.x,pos.y,pos.z);baseball.rotation.x+=.13;baseball.rotation.y+=.08;flightShadow.visible=true;flightShadow.position.x=pos.x;flightShadow.position.z=pos.z;flightShadow.material.opacity=clamp(.43-pos.y*.014,.05,.4);flightShadow.scale.setScalar(clamp(1+pos.y*.1,1,4));}
function finalizePitch(){const p=state.pitch;if(!p)return;
 if(state.swingCount){addStrike('揮棒落空','沒有在正確時機與位置碰到球。');return;}
 if(insideZone(p.pos)){addStrike('好球！','球通過好球帶，沒有揮棒。');}else{state.balls++;if(state.balls>=4){const adv=advanceWalk(state.bases);state.bases=adv.bases;state.runs+=adv.runs;setResult('四壞保送', '保送上一壘。',false);resetCount();}else setResult('壞球', '球沒有通過好球帶。',false);}
 updateNumbers();
}
function resetCount(){state.balls=0;state.strikes=0;}
function addOut(){state.outs++;if(state.outs>=3){state.outs=0;state.bases=[false,false,false];setTimeout(()=>{},0);return true;}return false;}
function addStrike(title,detail){state.strikes++;if(state.strikes>=3){resetCount();const inning=addOut();setResult('三振出局',inning?'三出局，壘上跑者歸零，開啟新半局。':'打者遭三振，下一位打者上場。',false);}else setResult(title,detail,false);updateNumbers();}
function setResult(head,detail,celebrate=false){state.phase='result';state.resultTime=0;setCall(head,detail,celebrate);els.actionHelp.textContent=detail;readyControls();resetBallVisual();if(!celebrate)sound('miss');}
function onContact(contact){state.phase='batted';state.batted=contact;state.trail=[];state.hitFlash=.45;
 setCall(contact.precision>.8?'PERFECT CONTACT!':'CONTACT!',`擊球初速 ${Math.round(contact.exitKmh)} km/h · 仰角 ${Math.round(contact.launchAngle)}°`,true);
 sayFlight(`${Math.round(contact.exitKmh)} km/h`,`EXIT VELOCITY · ${Math.round(contact.launchAngle)}° LAUNCH ANGLE`);readyControls();sound('hit');
}
function onLanded(){const b=state.batted;if(!b)return;const outcome=classifyBall(b),metres=Math.round(b.distance);
 state.bestDistance=Math.max(state.bestDistance,b.distance);
 const meta=`飛行 ${metres} m · 初速 ${Math.round(b.exitKmh)} km/h · 仰角 ${Math.round(b.launchAngle)}°`;
 if(outcome.kind==='foul'){
  if(state.strikes<2)state.strikes++;setResult('界外球',meta+'；兩好球後界外不增加好球數。',false);
 }else if(outcome.kind==='out'){
  const inning=addOut();setResult('飛球／滾地出局',meta+(inning?' · 三出局，換新半局。':''),false);
 }else{
  const adv=advanceBases(state.bases,outcome.bases);state.bases=adv.bases;state.runs+=adv.runs;state.hits++;if(outcome.kind==='homer')state.homers++;
  resetCount();setResult(outcome.name,meta,true);
 }
 updateNumbers();sayFlight(`${metres} m`,outcome.name+' · '+'模擬飛行距離');
}
function updatePitch(dt){const p=state.pitch;if(!p)return;stepPitch(p,dt);positionBall(p.pos);addTrail(p.pos);
 if(state.swingCount&&state.swingTime>=0){const contact=batContact(p,state.aim,state.swingTime);if(contact){onContact(contact);return;}}
 if(p.pos.z>=HOME_Z+.06||p.pos.y<.08){finalizePitch();}
}
function updateBatted(dt){const b=state.batted;if(!b)return;stepBattedBall(b,dt);positionBall(b.pos);addTrail(b.pos);
 if(b.elapsed>.35)hideCall();
 if(b.pos.y<=.105||b.elapsed>9){b.pos.y=Math.max(.105,b.pos.y);onLanded();}
}
function updateAnimation(dt,t){
 const pitchWindup=state.phase==='windup',flight=state.phase==='flight';
 const k=pitchWindup?state.windup:0;
 pitcher.leftArm.rotation.x= pitchWindup?Math.sin(k*Math.PI)*-.75:flight?-.35:.03;
 pitcher.rightArm.rotation.x= pitchWindup?Math.sin(k*Math.PI)*1.45:flight?1.7:Math.sin(t*.55)*.03;
 pitcher.g.rotation.z=pitchWindup?Math.sin(k*3)*.13:0;
 batter.rightArm.rotation.x=state.swingTime>=0&&state.swingTime<.48?-.48:Math.sin(t*.45)*.012;
 if(state.swingTime>=0&&state.swingTime<.52){const u=clamp(state.swingTime/.36,0,1);const eased=1-Math.pow(1-u,3);batPivot.rotation.y=2.9*eased-.7;batPivot.rotation.z=-.15+Math.sin(u*Math.PI)*.11;}else{batPivot.rotation.y=-.7;batPivot.rotation.z=0;}
}
function update(dt){
 if(state.phase==='windup'){
  state.windup+=dt;if(state.windup>=.91){state.phase='flight';state.windup=0;hideCall();readyControls();}
 }else if(state.phase==='flight'){
  if(state.swingCount){state.swingTime+=dt;}
  updatePitch(dt);
 }else if(state.phase==='batted')updateBatted(dt);
 else if(state.phase==='result')state.resultTime+=dt;
 state.hitFlash=Math.max(0,state.hitFlash-dt);
}
let accumulator=0,lastFrame=0;
function frame(ms){requestAnimationFrame(frame);const elapsed=lastFrame?Math.min((ms-lastFrame)/1000,.35):.016;lastFrame=ms;
 if(!QA_MODE){accumulator+=elapsed;let steps=0;while(accumulator>=FIXED_DT&&steps<50){update(FIXED_DT);accumulator-=FIXED_DT;steps++;}}
 updateAnimation(elapsed,ms*.001);
 if(state.phase==='batted'&&state.batted){const b=state.batted;
  const target=new THREE.Vector3(clamp(b.pos.x*.3,-25,25),Math.max(2,Math.min(12,b.pos.y*.25)),lerp(-18,b.pos.z,.25));
  camera.position.lerp(new THREE.Vector3(lerp(10,b.pos.x*.3,.15),Math.min(17,7+b.pos.y*.1),15),.018);
  const look=new THREE.Vector3(lerp(0,b.pos.x,.3),Math.max(.5,Math.min(8,b.pos.y*.4)),lerp(-19,b.pos.z,.22));
  camera.lookAt(look);
 }else{camera.position.lerp(new THREE.Vector3(5.4,9.1,27),.028);camera.lookAt(0,.8,-5);}
 renderer.render(scene,camera);
}
function setAim(x,y){state.aim.x=clamp(x,-1.15,1.15);state.aim.y=clamp(y,.5,1.8);
 const px=(state.aim.x+1.15)/2.3*100,py=(1.8-state.aim.y)/1.3*100;
 els.aimCross.style.left=px+'%';els.aimCross.style.top=py+'%';
}
function moveAimFromPointer(ev){const rect=els.aimFrame.getBoundingClientRect(),nx=clamp((ev.clientX-rect.left)/rect.width,0,1),ny=clamp((ev.clientY-rect.top)/rect.height,0,1);setAim(nx*2.3-1.15,1.8-ny*1.3);}
let dragging=false;
els.aimFrame.addEventListener('pointerdown',e=>{dragging=true;els.aimFrame.setPointerCapture(e.pointerId);moveAimFromPointer(e);});
els.aimFrame.addEventListener('pointermove',e=>{if(dragging)moveAimFromPointer(e);});
els.aimFrame.addEventListener('pointerup',e=>{dragging=false;});
els.aimFrame.addEventListener('pointercancel',()=>dragging=false);
window.addEventListener('keydown',e=>{
 if($('help-dialog').open)return;
 const k=e.key.toLowerCase();if([' ','arrowup','arrowdown','arrowleft','arrowright','w','a','s','d'].includes(k))e.preventDefault();
 if(k===' '&&!e.repeat)swing();
 if(k==='enter'&&!e.repeat)startPitch();
 const step=.13;if(k==='a'||k==='arrowleft')setAim(state.aim.x-step,state.aim.y);
 if(k==='d'||k==='arrowright')setAim(state.aim.x+step,state.aim.y);
 if(k==='w'||k==='arrowup')setAim(state.aim.x,state.aim.y+step);
 if(k==='s'||k==='arrowdown')setAim(state.aim.x,state.aim.y-step);
});
els.pitchButton.addEventListener('click',startPitch);
els.swingButton.addEventListener('click',swing);els.mobileSwing.addEventListener('pointerdown',e=>{e.preventDefault();swing();});
document.querySelectorAll('.pitch').forEach(b=>b.addEventListener('click',()=>choosePitch(b.dataset.type)));
document.querySelectorAll('.diff').forEach(b=>b.addEventListener('click',()=>chooseDifficulty(b.dataset.difficulty)));
els.soundButton.addEventListener('click',()=>{state.sound=!state.sound;els.soundButton.querySelector('span').textContent=state.sound?'音效開啟':'音效關閉';});
$('help-button').addEventListener('click',()=>$('help-dialog').showModal());
$('close-help').addEventListener('click',()=>$('help-dialog').close());
setAim(0,1.06);updateNumbers();readyControls();
try{initWorld();}catch(error){console.error('Baseball lab rendering failed',error);$('loading').hidden=true;$('scene-error').hidden=false;$('scene-error').textContent=`球場無法啟動：${error.message}`;}
window.__baseballLab={state,getHealth:()=>({phase:state.phase,renderer:!!renderer,canvas:!!renderer?.domElement,webgl:renderer?.getContext()?.getParameter(renderer.getContext().VERSION),pitchType:state.pitchType,balls:state.balls,strikes:state.strikes,outs:state.outs,hits:state.hits}),
 startPitch,swing,setAim,debugAdvance:(n=1)=>{if(!QA_MODE)return false;for(let i=0;i<Math.min(n,3000);i++)update(FIXED_DT);return true;}};
