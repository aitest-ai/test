# 結構校正驗收（第三輪 Phase 0，瀏覽器、服務 dist/）：用場景射線與碰撞層實測，不只讀宣告值。
#   S1 穿堂：前排柱徑 0.8–1.1 m；校門側開口淨高 ≥ 7 m（地面往上打射線到第一個面）；操場側開口 ≈ 一層（3.4–3.95 m）；
#           懸挑板外伸（前排柱心 → 板緣）0.5–1.2 m；穿堂南北可走通（校門 → 運動場 自動導覽抵達）。
#   S2 柱子：走廊柱徑 0.5–0.7 m；每根柱在每一層：膠囊（R=0.3）中心距柱心 < 柱半徑＋R 的 16 個方向都判定碰撞（不可穿柱）。
#   S3 走廊邊緣：上層走廊外緣下方打射線，第一個面在樓板面下 0.55–0.95 m（深邊梁）。
#   AO：簽章與烘焙一致（--stale-ok：Phase 0 中途 AO 尚未重烘，改為確認「簽章不符 → 不套用」）。
# 用法：python3 tests/dx.structure.py [--stale-ok]
import asyncio, os, sys, json, threading, http.server, socketserver, functools
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STALE = '--stale-ok' in sys.argv
class H(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *x): pass
srv = socketserver.ThreadingTCPServer(('127.0.0.1', 0), functools.partial(H, directory=os.path.join(ROOT, 'dist')))
threading.Thread(target=srv.serve_forever, daemon=True).start()
BASE = f'http://127.0.0.1:{srv.server_address[1]}/dongxin.html?degrade=0'
fails = []
def check(name, ok, detail=''):
    print('PASS' if ok else 'FAIL', name, detail); (None if ok else fails.append(name))
PROBE = r"""(()=>{ const d=__dx, T=d.THREE, m=d.m, CT=m.CT, W=d.world, R=W.R, out={};
  d.view([0,200,0],[0,0,0.01]);  // 所有樓層可見
  const root=d._scene.getObjectByName('dongxin'), rc=new T.Raycaster(); root.updateMatrixWorld(true);
  const solid=(h)=>{ const o=h.object, mt=[].concat(o.material)[0]; return o.visible!==false&&!(mt&&mt.transparent)&&!(mt&&mt.isMeshBasicMaterial&&o.geometry.type==='PlaneGeometry'); };
  const cast=(o,dir,far)=>{ rc.set(new T.Vector3(...o),new T.Vector3(...dir)); rc.far=far||100; const hs=rc.intersectObject(root,true).filter(solid); return hs.length?hs[0].distance:null; };
  const P=m.PILLARS;
  out.ctCols=P.filter(p=>p.kind==='ct').map(p=>+(p.r*2).toFixed(3));
  const corr=P.filter(p=>p.kind==='corr'); out.corrN=corr.length; out.corrD=[...new Set(corr.map(p=>+(p.r*2).toFixed(3)))];
  // 不可穿柱：每根柱、每層、16 方向
  let probes=0, miss=[]; for(const p of P){ for(let f=p.f0;f<=p.f1;f++){ const y=m.LY(f); if(W.stairAt(p.x,p.z,1.0)) continue;
      for(let k=0;k<16;k++){ const a=k/16*Math.PI*2, dd=p.r+R-0.02; probes++; if(!W.hit(p.x+Math.cos(a)*dd,p.z+Math.sin(a)*dd,y)) { miss.push([+p.x.toFixed(2),+p.z.toFixed(2),f,k]); break; } } } }
  out.penProbes=probes; out.penMiss=miss.slice(0,5); out.penMissN=miss.length;
  // 穿堂淨高
  const xm=(CT.xs[0]+CT.xs[1])/2, gate=[]; for(let z=CT.zb+0.5; z<CT.edge-0.05; z+=0.5) for(const x of [xm-2,xm,xm+2]) gate.push(cast([x,0.05,z],[0,1,0]));
  out.gateClearMin=Math.min(...gate.map(v=>v===null?99:v))+0.05;
  const N=CT.north, field=[]; for(const fz of [0.25,0.5,0.75]) field.push(cast([(N.x0+N.x1)/2,0.05,N.z0+(N.z1-N.z0)*fz],[0,1,0]));
  out.fieldClear=field.map(v=>v===null?null:+(v+0.05).toFixed(2));
  // 懸挑：柱心往外，從上往下打射線，最後一個打到 7 m 以上結構的位置
  let zmax=null; for(let z=CT.zc; z<CT.zc+4; z+=0.02){ const h=cast([xm,30,z],[0,-1,0],30); if(h!==null&&30-h>6.5) zmax=z; }
  out.overhang=zmax===null?null:+(zmax-CT.zc).toFixed(2);
  // 邊梁：上層走廊外緣外側 0.15 m，從下方 2 m 往上打
  const beams=[]; for(let f=1;f<=3;f++){ for(const e of m.EDGES[f]){ if(e.b-e.a<3) continue; const c=(e.a+e.b)/2, q=e.fix+e.out*0.15, x=e.ax==='x'?c:q, z=e.ax==='x'?q:c, y0=m.LY(f);
      const h=cast([x,y0-2.5,z],[0,1,0],3); if(h!==null) beams.push(+(2.5-h).toFixed(2)); if(beams.length>=12*f) break; } }
  out.beamDepths=beams; return out; })()"""
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox', '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=gl'])
        c = await b.new_context(viewport={'width': 900, 'height': 600}); pg = await c.new_page(); errs, warns = [], []
        pg.on('pageerror', lambda e: errs.append(str(e)[:200])); pg.on('console', lambda m: warns.append(m.text[:200]) if m.type == 'warning' else None)
        await pg.goto(BASE); await pg.wait_for_function('window.__dx', timeout=60000)
        ao = await pg.evaluate('__dx.aoReady()')
        r = await pg.evaluate(PROBE); print(json.dumps(r, ensure_ascii=False))
        check('S1 穿堂前排柱徑 0.8–1.1 m', len(r['ctCols']) == 2 and all(0.8 <= d <= 1.1 for d in r['ctCols']), r['ctCols'])
        check('S2 走廊柱徑 0.5–0.7 m', r['corrN'] > 50 and all(0.5 <= d <= 0.7 for d in r['corrD']), f"{r['corrN']} 根，直徑 {r['corrD']}")
        check('S2 膠囊不可穿柱（每柱每層 16 方向）', r['penMissN'] == 0, f"{r['penProbes']} 次探測，漏 {r['penMissN']} {r['penMiss']}")
        check('S1 校門側開口淨高 ≥ 7 m', r['gateClearMin'] >= 7.0, f"{r['gateClearMin']:.2f} m")
        check('S1 操場側開口 ≈ 一層（3.4–3.95 m）', all(v is not None and 3.4 <= v <= 3.95 for v in r['fieldClear']), r['fieldClear'])
        check('S1 懸挑板外伸（柱心→板緣）0.5–1.2 m', r['overhang'] is not None and 0.5 <= r['overhang'] <= 1.2, r['overhang'])
        bd = r['beamDepths']
        check('S3 走廊外緣深邊梁（樓板面下 0.55–0.95 m）', len(bd) >= 10 and all(0.55 <= v <= 0.95 for v in bd), f"{len(bd)} 處 {sorted(set(bd))}")
        # 穿堂南北通行：校門 → 運動場 自動導覽
        await pg.evaluate('__dx.unfreeze()')
        res = await pg.evaluate("""(()=>{ const d=__dx, t=n=>d.TARGETS.find(x=>x.name===n), CT=d.m.CT; d.cancelRoute(); d.teleportTo(t('校門')); d.setDest(t('運動場')); d.startRoute(true);
          let through=false, k=0; for(; k<60*120; k++){ d.tick(1/60); const S=d.S; if(S.x>CT.xl&&S.x<CT.xr&&S.z<CT.face&&S.z>CT.north.z0) through=true; if(!S.walker) break; }
          const g=t('運動場'); return { arrived: Math.hypot(d.S.x-g.x,d.S.z-g.z)<1.5, through, sec: +(k/60).toFixed(1) }; })()""")
        check('S1 穿堂可通行（校門 → 運動場 自動導覽經過穿堂並抵達）', res['arrived'] and res['through'], res)
        if STALE: check('AO（Phase 0 中途未重烘）：簽章不符 → 不套用並警告', ao['status'] == 'mismatch' and any('不符' in w for w in warns), ao)
        else: check('AO 簽章與烘焙一致、已套用', ao['status'] == 'on', ao)
        check('無 pageerror', not errs, errs)
        await b.close()
    print('STRUCTURE', 'FAIL ' + str(fails) if fails else 'PASS'); sys.exit(1 if fails else 0)
asyncio.run(main())
