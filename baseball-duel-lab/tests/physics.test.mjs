import test from 'node:test';
import assert from 'node:assert/strict';
import {PITCHES,createPitch,stepPitch,batContact,insideZone,stepBattedBall, classifyBall,advanceWalk,advanceBases,HOME_Z,FIXED_DT} from '../src/physics.js';

test('4 pitch types each reaches the plate',()=>{
 for(const name of Object.keys(PITCHES)){
  const p=createPitch(name,'rookie',()=>.5);
  let guard=0;while(p.pos.z<HOME_Z&&guard++<5000)stepPitch(p,FIXED_DT);
  assert.ok(guard<5000,`${name} pitch did not cross plate`);
  assert.ok(p.elapsed>.3&&p.elapsed<1.5,`${name} flight duration out of bounds`);
  assert.ok(p.pos.y>0,`${name} ball hit ground before plate`);
 }
});
test('swing must be inside a contact window and aimed near pitch',()=>{
 const p=createPitch('fastball','rookie',()=>.5);
 while(p.pos.z<HOME_Z-.3)stepPitch(p,FIXED_DT);
 const contact=batContact(p,{x:p.pos.x,y:p.pos.y},.16);
 assert.ok(contact?.exitKmh>95);
 assert.equal(batContact(p,{x:p.pos.x,y:p.pos.y},.01),null);
 assert.equal(batContact(p,{x:2,y:2},.16),null);
});
test('a batted ball lands within bounded simulation and yields a known result',()=>{
 const p=createPitch('fastball','rookie',()=>.5);
 while(p.pos.z<HOME_Z-.3)stepPitch(p,FIXED_DT);
 const b=batContact(p,{x:p.pos.x,y:p.pos.y},.16);
 let i=0;while(b.pos.y>0.1&&i++<6000)stepBattedBall(b,FIXED_DT);
 assert.ok(i<6000);
 assert.ok(b.distance>25);
 assert.ok(['homer','triple','double','single','out','foul'].includes(classifyBall(b).kind));
});
test('walk advances only forced runners',()=>{
 assert.deepEqual(advanceWalk([false,false,true]),{bases:[true,false,true],runs:0});
 assert.deepEqual(advanceWalk([true,true,true]),{bases:[true,true,true],runs:1});
});
test('hit advancement scores and positions runners',()=>{
 assert.deepEqual(advanceBases([false,true,true],2),{bases:[false,true,false],runs:2});
 assert.deepEqual(advanceBases([true,true,true],4),{bases:[false,false,false],runs:4});
});
