import asyncio, os, threading, http.server, socketserver, functools, json, math, sys
from playwright.async_api import async_playwright
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a): pass
srv=socketserver.TCPServer(('127.0.0.1',0),functools.partial(Q,directory=os.path.join(ROOT,'dist'))); PORT=srv.server_address[1]
threading.Thread(target=srv.serve_forever,daemon=True).start()
A,B,F0,F1=sys.argv[1],sys.argv[2],int(sys.argv[3]),int(sys.argv[4])
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(args=['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--no-sandbox'])
        pg=await b.new_page(viewport={'width':800,'height':500})
        await pg.goto(f'http://127.0.0.1:{PORT}/dongxin.html'); await pg.wait_for_function('window.__dx')
        res=await pg.evaluate("""([a,bn,f0,f1])=>{const s=__dx,out=[];const f=n=>s.TARGETS.find(t=>t.name===n);
              s.teleportTo(f(a)); s.advance(0.2); s.setDest(f(bn)); s.startRoute(true);
              for(let i=0;i<f1;i++){ s.tick(1/60); if(i>=f0){ const c=s.cam(),S=s.S; out.push([i,+c.p[0].toFixed(2),+c.p[1].toFixed(2),+c.p[2].toFixed(2),+c.d[0].toFixed(2),+c.d[1].toFixed(2),+c.d[2].toFixed(2),+S.x.toFixed(2),+S.y.toFixed(2),+S.z.toFixed(2),+S.yaw.toFixed(2),+S.heading.toFixed(2),S.occ?1:0]);} }
              return out;}""",[A,B,F0,F1])
        print('i  camxyz  dir  playerxyz yaw heading occ')
        for r in res: print(r)
        await b.close()
asyncio.run(main())
