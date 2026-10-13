import { WING } from '../src/data/wing.js';
import { buildLayout } from '../src/model/layout.js';
import { createWorld } from '../src/physics/collision.js';
import { createNav, createWalker } from '../src/nav/navgraph.js';
const lay = buildLayout(WING), world = createWorld(lay), nav = createNav(lay, world);
const p={x:1.3,z:8.5,y:0,heading:0}; const rt=nav.route(p,'r2-1'); console.log(rt.pts.map(q=>`${q.x.toFixed(1)},${q.z.toFixed(1)},${q.y.toFixed(2)}`).join(' | '));
const w=createWalker(world,rt); let last=''; for(let i=0;i<300&&!w.done;i++){ w.step(p,1/30); const s=`${p.x.toFixed(2)},${p.z.toFixed(2)},${p.y.toFixed(2)}`; if(i%10==0||w.stuck) last=s, console.log(i,s); if(w.stuck){ console.log('hit',JSON.stringify(world.hit(p.x,p.z,p.y,0.3))); break; } }
const q={x:3.7,z:4.26,y:1.98}; for (const dz of [0.02,0.08,0.2]){ const nz=q.z+dz; console.log(dz,'hit@y',JSON.stringify(world.hit(q.x,nz,q.y,0.3)),'surf',world.surfaceY(q.x,nz,q.y),'surfaces',world.surfaces(q.x,nz)); }
