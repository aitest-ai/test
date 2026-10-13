import asyncio, os, threading, http.server, socketserver, functools, json, math
from playwright.async_api import async_playwright
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a): pass
srv=socketserver.TCPServer(('127.0.0.1',0),functools.partial(Q,directory=ROOT)); PORT=srv.server_address[1]
threading.Thread(target=srv.serve_forever,daemon=True).start()
THREE=open(os.path.join(ROOT,'vendor/three.min.js'),'rb').read()
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(args=['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--no-sandbox'])
        pg=await b.new_page(viewport={'width':800,'height':500})
        await pg.route('https://cdnjs.cloudflare.com/**',lambda r: r.fulfill(body=THREE,content_type='application/javascript'))
        await pg.goto(f'http://127.0.0.1:{PORT}/dongxin.html'); await pg.wait_for_function('window.__dx')
        ROUTES=[("校門","301"),("校門","403"),("校門","地下停車場"),("地下停車場","電腦教室"),("301","運動場")]
        for a,bn in ROUTES:
            res=await pg.evaluate("""([a,bn])=>{const s=__dx,out=[];const f=n=>s.TARGETS.find(t=>t.name===n);
              s.teleportTo(f(a)); s.advance(0.2); s.setDest(f(bn)); s.startRoute(true);
              for(let i=0;i<60*120;i++){ s.tick(1/60); if(i===0) s.advance(0.001); const c=s.cam(); out.push([c.p[0],c.p[1],c.p[2],c.d[0],c.d[1],c.d[2],s.S.x,s.S.y,s.S.z,s.S.walker?1:0]); if(!s.S.walker && i>20) break;}
              return out;}""",[a,bn])
            n=len(res); dist=lambda a_,b_: math.dist(a_,b_)
            step=[dist(res[i][:3],res[i-1][:3]) for i in range(1,n)]
            ang=[math.acos(max(-1,min(1,sum(res[i][3+k]*res[i-1][3+k] for k in range(3)))))*60 for i in range(1,n)]
            rel=[dist(r[:3],r[6:9]) for r in res]
            ys=[abs(res[i][7]-res[i-1][7]) for i in range(1,n)]
            print(json.dumps({'route':a+'→'+bn,'frames':n,'maxCamStep_m/frame':round(max(step),3),'maxViewAngVel_rad/s':round(max(ang),2),'p95AngVel':round(sorted(ang)[int(len(ang)*.95)],2),'camToChar':[round(min(rel),2),round(max(rel),2)],'maxCharDy_m/frame':round(max(ys),3),'end':[round(v,1) for v in res[-1][6:9]]},ensure_ascii=False))
            hi=[i for i in range(len(ang)) if ang[i]>4]; print('   frames>4rad/s:',len(hi),'of',len(ang),' >6:',len([i for i in hi if ang[i]>6]))
            groups=[]; 
            for i in hi:
                if groups and i-groups[-1][-1]<=3: groups[-1].append(i)
                else: groups.append([i])
            print('   clusters',[(g[0]+1,len(g),round(max(ang[i] for i in g),1),[round(v,1) for v in res[g[0]+1][6:9]],round(rel[g[0]+1],2)) for g in groups[:8]])
        await b.close()
asyncio.run(main())
