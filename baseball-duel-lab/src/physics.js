/** 遊戲化物理：所有座標單位為公尺，時間單位為秒。不是經實測標定的真實棒球空氣動力學。 */
export const HOME_Z = 8;
export const RELEASE_Z = -17.5;
export const GRAVITY = -9.80665;
export const FIXED_DT = 1 / 120;
export const BALL_RADIUS=.0366, BAT_LENGTH=.90, BAT_RADIUS=.043;
const MASS=.145, BAT_MASS=.78,RHO=1.20,AREA=Math.PI*BALL_RADIUS**2,DRAG=.5*RHO*AREA*.33/MASS;
export const PITCHES = Object.freeze({
 fastball:{name:'四縫線直球',en:'4-SEAM FASTBALL',kmh:142,spinAxis:{x:-1,y:0,z:0},lift:.18,tint:0xfff3d8},
 curve:{name:'曲球',en:'CURVEBALL',kmh:112,spinAxis:{x:1,y:0,z:0},lift:.18,tint:0xffddb4},
 slider:{name:'滑球',en:'SLIDER',kmh:128,spinAxis:{x:0,y:1,z:-.1},lift:.16,tint:0xf9edb3},
 change:{name:'變速球',en:'CHANGEUP',kmh:106,spinAxis:{x:-.9,y:-.4,z:0},lift:.12,tint:0xe4e7ef}
});
export const DIFFICULTY = Object.freeze({rookie:{scale:.76, variance:.27},pro:{scale:.94,variance:.56},hell:{scale:1.09,variance:.84}});
export function clamp(v,a,b){return Math.min(b,Math.max(a,v));}
export function lerp(a,b,t){return a+(b-a)*t;}
export function kmhToMs(kmh){return kmh/3.6;}
const magnitude=v=>Math.hypot(v.x,v.y,v.z);
const minus=(a,b)=>({x:a.x-b.x,y:a.y-b.y,z:a.z-b.z});
const dot=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z;
const cross=(a,b)=>({x:a.y*b.z-a.z*b.y,y:a.z*b.x-a.x*b.z,z:a.x*b.y-a.y*b.x});
const mix=(a,b,t)=>({x:lerp(a.x,b.x,t),y:lerp(a.y,b.y,t),z:lerp(a.z,b.z,t)});
export function ballAcceleration(v,axis,lift=.18){
 const speed=magnitude(v),a={x:-DRAG*speed*v.x,y:GRAVITY-DRAG*speed*v.y,z:-DRAG*speed*v.z};
 if(speed>1e-6&&magnitude(axis)>1e-6){
  const d=cross(axis,v),len=magnitude(d);
  if(len>1e-6){const f=.5*RHO*AREA*lift/MASS*speed*speed/len;a.x+=d.x*f;a.y+=d.y*f;a.z+=d.z*f;}
 }
 return a;
}
function advance(p,v,axis,lift,dt){
 const a=ballAcceleration(v,axis,lift),h={x:v.x+a.x*dt/2,y:v.y+a.y*dt/2,z:v.z+a.z*dt/2};
 const mid=ballAcceleration(h,axis,lift);
 p.x+=h.x*dt;p.y+=h.y*dt;p.z+=h.z*dt;
 v.x+=mid.x*dt;v.y+=mid.y*dt;v.z+=mid.z*dt;
}
function solve(initial,spec){
 const p={...initial.start},v={...initial.vel};let time=0;
 for(let i=0;i<250;i++){
  const old={...p};advance(p,v,spec.spinAxis,spec.lift,FIXED_DT);time+=FIXED_DT;
  if(p.z>=HOME_Z){const t=clamp((HOME_Z-old.z)/(p.z-old.z),0,1);return {pos:mix(old,p,t),time:time-FIXED_DT*(1-t)};}
  if(p.y<-.1)break;
 }
 return {pos:{...p},time,missed:true};
}
export function createPitch(type='fastball',difficulty='rookie',random=Math.random){
 const spec=PITCHES[type]??PITCHES.fastball,d=DIFFICULTY[difficulty]??DIFFICULTY.rookie;
 const kmh=spec.kmh*d.scale*(1+(random()-.5)*.038),speed=kmhToMs(kmh),start={x:0,y:1.82,z:RELEASE_Z};
 const target={x:(random()-.5)*(1.40+d.variance*.48),y:.79+random()*(.55+d.variance*.32),z:HOME_Z};
 const t=(HOME_Z-RELEASE_Z)/(speed*.94);
 const pitch={type,pitch:spec,kmh,start:{...start},pos:{...start},prevPos:{...start},
  vel:{x:target.x/t,y:(target.y-start.y)/t-GRAVITY*t/2,z:speed},target,elapsed:0,flightTime:t,crossing:null};
 for(let i=0;i<7;i++){
  const x=solve(pitch,spec),ex=target.x-x.pos.x,ey=target.y-x.pos.y;
  if(Math.hypot(ex,ey)<.002)break;
  pitch.vel.x+=ex/x.time;pitch.vel.y+=ey/x.time;
 }
 pitch.flightTime=solve(pitch,spec).time;return pitch;
}
export function stepPitch(p,dt){
 if(p.crossing)return p;
 p.prevPos={...p.pos};advance(p.pos,p.vel,p.pitch.spinAxis,p.pitch.lift,dt);p.elapsed+=dt;
 if(p.prevPos.z<HOME_Z&&p.pos.z>=HOME_Z){
  const t=(HOME_Z-p.prevPos.z)/(p.pos.z-p.prevPos.z);p.crossing={...mix(p.prevPos,p.pos,t),z:HOME_Z};
 }
 return p;
}
export function insideZone(pos){return Math.abs(pos.x)<=.73&&pos.y>=.53&&pos.y<=1.45;}
/** Physical bat geometry; this exact pose also controls the rendered Three.js bat. */
export function batPose(progress,aim={x:0,y:1.06}){
 const u=clamp(progress,0,1),theta=progress<0?-2.32:-2.32+4.55*(u*u*(3-2*u));
 const grip={x:-.81+aim.x*.43+u*.10,y:clamp(aim.y,.56,1.54)+.09,z:HOME_Z+.35-u*.08};
 const d={x:Math.cos(theta),y:progress<0?.69:.1*Math.cos(Math.PI*u)+.04,z:-Math.sin(theta)};
 const len=magnitude(d),dir={x:d.x/len,y:d.y/len,z:d.z/len};
 const along=f=>({x:grip.x+dir.x*f,y:grip.y+dir.y*f,z:grip.z+dir.z*f});
 return {grip,direction:dir,barrelStart:along(.24),tip:along(BAT_LENGTH),progress:u};
}
function nearest(p,a,b){
 const v=minus(b,a),f=clamp(dot(minus(p,a),v)/dot(v,v),0,1);
 return {x:a.x+v.x*f,y:a.y+v.y*f,z:a.z+v.z*f};
}
/** Swept capsule vs moving sphere: 16 substeps prevent contact tunnelling. */
export function batContact(p,aim,progress,previousProgress,dt=FIXED_DT){
 if(progress<0||progress>1||previousProgress<0)return null;
 const radius=BALL_RADIUS+BAT_RADIUS+.008,prior=p.prevPos??p.pos;
 for(let i=0;i<=16;i++){
  const t=i/16,u=lerp(previousProgress,progress,t),pose=batPose(u,aim),ball=mix(prior,p.pos,t);
  const point=nearest(ball,pose.barrelStart,pose.tip),d=minus(ball,point),distance=magnitude(d);
  if(distance>radius)continue;
  const pre=batPose(clamp(u-.006,0,1),aim),post=batPose(clamp(u+.006,0,1),aim);
  const before=nearest(ball,pre.barrelStart,pre.tip),after=nearest(ball,post.barrelStart,post.tip);
  const seconds=clamp(.012/(progress-previousProgress||1)*dt,1e-6,.1);
  const batVelocity={x:(after.x-before.x)/seconds,y:(after.y-before.y)/seconds,z:(after.z-before.z)/seconds};
  const normal=distance>1e-5?{x:d.x/distance,y:d.y/distance,z:d.z/distance}:{x:0,y:.11,z:-.994};
  const incoming=dot(minus(p.vel,batVelocity),normal);
  if(incoming>=-.15)continue;
  const impulse=(1+.55)/(1+MASS/BAT_MASS)*incoming;
  const v={x:p.vel.x-impulse*normal.x,y:p.vel.y-impulse*normal.y,z:p.vel.z-impulse*normal.z};
  return {pos:{...ball},vel:v,exitKmh:magnitude(v)*3.6,launchAngle:Math.atan2(v.y,Math.hypot(v.x,v.z))*180/Math.PI,
   precision:clamp(1-distance/radius,0,1),timing:clamp((HOME_Z-ball.z)/2.5,-1,1),
   elapsed:0,maxHeight:ball.y,distance:0,crossedFence:false,
   impact:{separation:distance,point,normal,batVelocity,swingProgress:u}};
 }
 return null;
}
export function stepBattedBall(b,dt){
 const old=b.distance;
 advance(b.pos,b.vel,{x:0,y:0,z:0},0,dt);b.elapsed+=dt;
 b.maxHeight=Math.max(b.maxHeight,b.pos.y);
 b.distance=Math.hypot(b.pos.x,b.pos.z-HOME_Z);
 if(!b.crossedFence&&old<94&&b.distance>=94&&isFair(b.pos)&&b.pos.y>2.5)b.crossedFence=true;
 return b;
}
export function isFair(pos){
  const forward=HOME_Z-pos.z;
  return forward>0&&Math.abs(pos.x)<=forward+BALL_RADIUS;
}
export function classifyBall(b){
  const fair=isFair(b.pos),distance=b.distance;
  if(!fair)return {kind:'foul',name:'界外球',bases:0};
  if(b.crossedFence)return {kind:'homer',name:'全壘打！',bases:4};
  if(distance>73)return {kind:'triple',name:'三壘安打！',bases:3};
  if(distance>44)return {kind:'double',name:'二壘安打！',bases:2};
  if(distance>23)return {kind:'single',name:'一壘安打！',bases:1};
  return {kind:'out',name:'守備出局',bases:0};
}
/** Training-only baserunner model: advance batters by N bases, without tag-ups / force-out intricacies. */
export function advanceBases(bases,amount){
  const next=[false,false,false];let runs=0;
  for(let i=2;i>=0;i--){if(bases[i]){const dest=i+1+amount;if(dest>3)runs++;else next[dest-1]=true;}}
  if(amount>=4)runs++;else next[amount-1]=true;
  return {bases:next,runs};
}
export function advanceWalk(bases){
  const next=[...bases];let runs=0;
  if(next[0]){if(next[1]){if(next[2])runs++;next[2]=true;}next[1]=true;}
  next[0]=true;return {bases:next,runs};
}
