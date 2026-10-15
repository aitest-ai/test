import test from 'node:test';
import assert from 'node:assert/strict';
import {FIXED_DT,BAT_LENGTH,PITCHES,HOME_Z,batPose,batContact,createPitch,stepPitch,stepBattedBall,classifyBall} from '../src/physics.js';
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
test('bat is 90 cm, correctly held and sweeps into the strike zone',()=>{
 const a=batPose(-1),b=batPose(.66);
 assert.ok(Math.abs(distance(a.grip,a.tip)-BAT_LENGTH)<1e-8);
 assert.ok(a.tip.y>a.grip.y+.3);assert.ok(b.tip.x>b.grip.x&&b.tip.z<b.grip.z);
});
test('all pitches reach chosen target despite spin and drag',()=>{
 for(const type of Object.keys(PITCHES)){
  const p=createPitch(type,'pro',()=>.5);
  for(let i=0;i<250&&!p.crossing;i++)stepPitch(p,FIXED_DT);
  assert.ok(p.crossing,type);
  assert.ok(Math.hypot(p.crossing.x-p.target.x,p.crossing.y-p.target.y)<.04,type);
 }
});
test('distant barrel never produces a ghost contact',()=>{
 const p=createPitch('fastball','rookie',()=>.5);
 for(let i=0;i<250&&!p.crossing;i++){
  stepPitch(p,FIXED_DT);
  assert.equal(batContact(p,{x:1.15,y:.5},.66,.635,FIXED_DT),null);
 }
});
test('swept bat gives genuine collision and plausible velocity',()=>{
 let hit;
 search:for(let lead=.12;lead<=.34;lead+=.015)
 for(let x=-.7;x<=.6;x+=.15)
 for(let y=.7;y<=1.4;y+=.075){
  const p=createPitch('fastball','rookie',()=>.5);let t=0;
  for(let i=0;i<240&&!p.crossing;i++){
   stepPitch(p,FIXED_DT);t+=FIXED_DT;
   const u=(t-p.flightTime+lead)/.34;
   if(u>=0&&u<=1){hit=batContact(p,{x,y},u,Math.max(0,u-FIXED_DT/.34),FIXED_DT);if(hit)break search;}
  }
 }
 assert.ok(hit,'no actual collision found');
 assert.ok(hit.impact.separation<.09);
 assert.ok(hit.exitKmh>20&&hit.exitKmh<320);
 for(let i=0;i<100;i++)stepBattedBall(hit,FIXED_DT);
 assert.ok(Number.isFinite(hit.distance));
});
test('home run needs actual fence clearance',()=>{
 const b={pos:{x:0,y:0,z:HOME_Z-105},distance:105,crossedFence:false};
 assert.notEqual(classifyBall(b).kind,'homer');
 b.crossedFence=true;assert.equal(classifyBall(b).kind,'homer');
});
