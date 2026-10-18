# 結構校正驗收（第三輪 Phase 0，瀏覽器、服務 dist/）：用場景射線與碰撞層實測，不只讀宣告值。
#   S1 穿堂：前排柱徑 0.8–1.1 m；校門側開口淨高 ≥ 7 m（地面往上打射線到第一個面）；操場側開口 ≈ 一層（3.4–3.95 m）；
#           懸挑板外伸（前排柱心 → 板緣）0.5–1.2 m；穿堂南北可走通（校門 → 運動場 自動導覽抵達）。
#   S2 柱子：走廊柱徑 0.5–0.7 m；每根柱在每一層：膠囊（R=0.3）中心距柱心 < 柱半徑＋R 的 16 個方向都判定碰撞（不可穿柱）。
#   S3 走廊邊緣：上層走廊外緣下方打射線，第一個面在樓板面下 0.55–0.95 m（深邊梁）。
#   S4 窗洞：抽樣 40 個窗洞，從外往牆打水平射線：窗洞中心（玻璃）比旁邊窗間牆深 ≥ 0.3 m。
#   S6 鰭片量體：3F 量體正面（鰭片外緣）比 4F 磚面凸出 1.0–1.9 m（設計圖 3F 北牆凸出 1.55 m＋鰭片 0.35 m，扣 4F 磚外皮 0.25 m；照片估計 1.2–1.5 m）。
#   S9 司令台：平台上方雨遮淨高 ≥ 2.6 m；校門 → 司令台 自動導覽走斜坡上到平台（高 1.1 m）。
#   S10 梯級：每跑 13 階、級高 0.150 m。
#   S12 停車場方柱：≥ 20 根，膠囊不可穿（16 方向）；S8 花壇緣 ≥ 5 組。
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
  out.beamDepths=beams;
  // S4 窗洞凹深
  const Wn=d.scn.WINDOWS, rec=[]; for(let k=0;k<Wn.length&&rec.length<40;k+=Math.max(1,Math.floor(Wn.length/40))){ const w=Wn[k], o=[w.x+w.nx*2,w.y,w.z+w.nz*2], dir=[-w.nx,0,-w.nz];
    const a=cast(o,dir,4), side=[w.nz*0.95,0,w.nx*0.95]; const b=cast([o[0]+side[0],o[1],o[2]+side[2]],dir,4); if(a!==null&&b!==null) rec.push(+(a-b).toFixed(3)); }
  out.windows=Wn.length; out.recess=rec;
  // S6 鰭片量體
  const F=d.scn.FINBOX; if(F){ const xm=(F.x0+F.x1)/2+0.45, a=cast([xm,m.LY(2)+1.0,F.z0-3],[0,0,1],6), b=cast([xm,m.LY(3)+2.3,F.z0-3],[0,0,1],6); out.finProj=(a!==null&&b!==null)?+(b-a).toFixed(2):null; }
  // S9 平台上方淨空
  const SG=m.STAGE; if(SG){ const P=SG.plat, cl=[]; for(let x=P.x0+0.5;x<P.x1;x+=1.5) for(let z=P.z0+0.5;z<P.z1;z+=1.5){ const h=cast([x,SG.PH+0.05,z],[0,1,0],10); cl.push(h===null?99:+(h+0.05).toFixed(2)); } out.stageClear=Math.min(...cl); }
  const GC=m.GCOLS||[]; let gm=0; for(const c of GC) for(let k=0;k<16;k++){ const a=k/16*Math.PI*2, dd=0.3+R-0.02; if(!W.hit(c.x+Math.cos(a)*dd,c.z+Math.sin(a)*dd,m.LY(4))) { gm++; break; } }
  out.gcols=GC.length; out.gcolMiss=gm; out.planters=d.scn.planters;
  out.strN=m.STR_N; out.riser=+(m.FH/(2*m.STR_N)).toFixed(3);
  return out; })()"""
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
        check('S4 集賢樓窗洞凹深 ≥ 0.3 m（抽樣）', len(r['recess']) >= 20 and min(r['recess']) >= 0.3, f"{r['windows']} 個窗洞，抽樣 {len(r['recess'])}，凹深 {min(r['recess']) if r['recess'] else None}–{max(r['recess']) if r['recess'] else None} m")
        check('S6 3F 鰭片量體凸出 1.0–1.9 m', r.get('finProj') is not None and 1.0 <= r['finProj'] <= 1.9, r.get('finProj'))
        check('S9 司令台平台上方雨遮淨高 ≥ 2.6 m', r.get('stageClear', 0) >= 2.6, r.get('stageClear'))
        check('S10 梯級：每跑 13 階、級高 0.150 m', r['strN'] == 13 and abs(r['riser'] - 0.15) < 1e-6, (r['strN'], r['riser']))
        check('S8 花壇緣 ≥ 5 組（由設計圖底圖抽出）', r['planters'] >= 5, r['planters'])
        check('S12 停車場方柱 ≥ 20 根且不可穿', r['gcols'] >= 20 and r['gcolMiss'] == 0, f"{r['gcols']} 根，漏 {r['gcolMiss']}")
        # 穿堂南北通行：校門 → 運動場 自動導覽
        await pg.evaluate('__dx.unfreeze()')
        res = await pg.evaluate("""(()=>{ const d=__dx, t=n=>d.TARGETS.find(x=>x.name===n), CT=d.m.CT; d.cancelRoute(); d.teleportTo(t('校門')); d.setDest(t('運動場')); d.startRoute(true);
          let through=false, k=0; for(; k<60*120; k++){ d.tick(1/60); const S=d.S; if(S.x>CT.xl&&S.x<CT.xr&&S.z<CT.face&&S.z>CT.north.z0) through=true; if(!S.walker) break; }
          const g=t('運動場'); return { arrived: Math.hypot(d.S.x-g.x,d.S.z-g.z)<1.5, through, sec: +(k/60).toFixed(1) }; })()""")
        check('S1 穿堂可通行（校門 → 運動場 自動導覽經過穿堂並抵達）', res['arrived'] and res['through'], res)
        res = await pg.evaluate("""(()=>{ const d=__dx, t=n=>d.TARGETS.find(x=>x.name===n); d.cancelRoute(); d.teleportTo(t('校門')); d.setDest(t('司令台')); d.startRoute(true);
          let ymax=0, k=0; for(; k<60*120; k++){ d.tick(1/60); ymax=Math.max(ymax,d.S.y); if(!d.S.walker) break; }
          const g=t('司令台'); return { arrived: Math.hypot(d.S.x-g.x,d.S.z-g.z)<1.5, y:+d.S.y.toFixed(2), sec:+(k/60).toFixed(1) }; })()""")
        check('S9 司令台可走上去（校門 → 司令台 自動導覽經斜坡上平台，y = 1.1 m）', res['arrived'] and abs(res['y'] - 1.1) < 0.05, res)
        if STALE: check('AO（Phase 0 中途未重烘）：簽章不符 → 不套用並警告', ao['status'] == 'mismatch' and any('不符' in w for w in warns), ao)
        else: check('AO 簽章與烘焙一致、已套用', ao['status'] == 'on', ao)
        check('無 pageerror', not errs, errs)
        await b.close()
    print('STRUCTURE', 'FAIL ' + str(fails) if fails else 'PASS'); sys.exit(1 if fails else 0)
asyncio.run(main())
