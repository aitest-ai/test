/** 遊戲化物理：所有座標單位為公尺，時間單位為秒。不是經實測標定的真實棒球空氣動力學。 */
export const HOME_Z = 8;
export const RELEASE_Z = -17.5;
export const GRAVITY = -9.81;
export const FIXED_DT = 1 / 120;
export const PITCHES = Object.freeze({
  fastball: {name:'四縫線直球', en:'4-SEAM FASTBALL', kmh:142, ax:.14, extraDrop:.15, tint:0xfff3d8},
  curve: {name:'曲球', en:'CURVEBALL', kmh:112, ax:-1.1, extraDrop:3.5, tint:0xffddb4},
  slider: {name:'滑球', en:'SLIDER', kmh:128, ax:3.9, extraDrop:1.4, tint:0xf9edb3},
  change: {name:'變速球', en:'CHANGEUP', kmh:106, ax:-.65, extraDrop:1.1, tint:0xe4e7ef}
});
export const DIFFICULTY = Object.freeze({rookie:{scale:.76, variance:.27},pro:{scale:.94,variance:.56},hell:{scale:1.09,variance:.84}});
export function clamp(v,a,b){return Math.min(b,Math.max(a,v));}
export function lerp(a,b,t){return a+(b-a)*t;}
export function kmhToMs(kmh){return kmh/3.6;}
export function createPitch(type='fastball',difficulty='rookie',random=Math.random){
  const p=PITCHES[type]??PITCHES.fastball;
  const d=DIFFICULTY[difficulty]??DIFFICULTY.rookie;
  const kmh=p.kmh*d.scale*(1+(random()-.5)*.035);
  const speed=kmhToMs(kmh), start={x:0,y:1.9,z:RELEASE_Z};
  // Target is chosen per pitch (intentionally sometimes just outside the strike zone).
  const locationX=(random()-.5)*(1.45+d.variance*.6);
  const locationY=.78+random()*(.54+d.variance*.2);
  const flightTime=(HOME_Z-RELEASE_Z)/(speed*.97);
  const vx=(locationX-start.x)/flightTime-.5*p.ax*flightTime;
  const vy=(locationY-start.y)/flightTime-.5*(GRAVITY-p.extraDrop)*flightTime;
  return {
    type,pitch:p,kmh,start:{...start},pos:{...start},
    vel:{x:vx,y:vy,z:speed},
    target:{x:locationX,y:locationY,z:HOME_Z},flightTime,
    elapsed:0, crossed:false
  };
}
export function stepPitch(p,dt){
  // Simple drag term, deliberately weaker than a true coefficient calibrated to a real baseball.
  const speed=Math.hypot(p.vel.x,p.vel.y,p.vel.z);
  const drag=.00035*speed;
  p.vel.x+=(p.pitch.ax-p.vel.x*drag)*dt;
  p.vel.y+=(GRAVITY-p.pitch.extraDrop-p.vel.y*drag)*dt;
  p.vel.z+=(-p.vel.z*drag)*dt;
  p.pos.x+=p.vel.x*dt;p.pos.y+=p.vel.y*dt;p.pos.z+=p.vel.z*dt;
  p.elapsed+=dt;
  return p;
}
export function insideZone(pos){return Math.abs(pos.x)<=.78&&pos.y>=.62&&pos.y<=1.55;}
export function batContact(p,aim,swingProgress){
  const zError=Math.abs(p.pos.z-(HOME_Z-.15));
  const xError=Math.abs(p.pos.x-aim.x);
  const yError=Math.abs(p.pos.y-aim.y);
  const active=swingProgress>=.09&&swingProgress<=.32;
  const within=active&&zError<2.5&&xError<.82&&yError<.7;
  if(!within)return null;
  const precision=clamp(1-zError/3.5-xError*.30-yError*.36,0,1);
  const timing=clamp((HOME_Z-p.pos.z)/2.5,-1,1);
  const launchAngle=clamp((20+(aim.y-1)*24)+precision*5,9,46);
  const exitKmh=86+precision*82;
  const spray=clamp((aim.x*.16)+(timing*.33)+((p.pos.x-aim.x)*.1),-.85,.85);
  const elevation=launchAngle*Math.PI/180;
  const out=kmhToMs(exitKmh);
  const horiz=out*Math.cos(elevation);
  return {
    pos:{...p.pos}, vel:{x:Math.sin(spray)*horiz,y:out*Math.sin(elevation),z:-Math.cos(spray)*horiz},
    exitKmh,launchAngle,precision,timing,elapsed:0,
    maxHeight:p.pos.y,distance:0
  };
}
export function stepBattedBall(b,dt){
  const speed=Math.hypot(b.vel.x,b.vel.y,b.vel.z);
  const coeff=.0032;
  const drag=coeff*speed;
  b.vel.x-=drag*b.vel.x*dt;
  b.vel.y+=(GRAVITY-drag*b.vel.y+1.2*Math.exp(-b.elapsed/3))*dt;
  b.vel.z-=drag*b.vel.z*dt;
  b.pos.x+=b.vel.x*dt;b.pos.y+=b.vel.y*dt;b.pos.z+=b.vel.z*dt;
  b.elapsed+=dt;b.maxHeight=Math.max(b.maxHeight,b.pos.y);
  b.distance=Math.hypot(b.pos.x,b.pos.z-HOME_Z);
  return b;
}
export function isFair(pos){
  const forward=HOME_Z-pos.z;
  return forward>0&&Math.abs(pos.x)<=forward*1.02;
}
export function classifyBall(b){
  const fair=isFair(b.pos),distance=b.distance;
  if(!fair)return {kind:'foul',name:'界外球',bases:0};
  if(distance>94)return {kind:'homer',name:'全壘打！',bases:4};
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
