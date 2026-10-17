import asyncio, os, threading, http.server, socketserver, functools, json, math, sys
from playwright.async_api import async_playwright
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a): pass
srv=socketserver.TCPServer(('127.0.0.1',0),functools.partial(Q,directory=os.path.join(ROOT,'dist'))); PORT=srv.server_address[1]
threading.Thread(target=srv.serve_forever,daemon=True).start()
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(args=['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--no-sandbox'])
        pg=await b.new_page(viewport={'width':800,'height':500})
        await pg.goto(f'http://127.0.0.1:{PORT}/index.html'); await pg.wait_for_function('window.__slice')
        res=await pg.evaluate('''(()=>{const s=__slice,out=[];
          s.setDest(s.lay.rooms.find(r=>r.id==="r3-4")); s.startRoute(true);
          for(let i=0;i<30*40;i++){ s.advance(1/30,1/30); const c=s.cam(); out.push([i,+c.p[0].toFixed(2),+c.p[1].toFixed(2),+c.p[2].toFixed(2),+s.S.x.toFixed(2),+s.S.y.toFixed(2),+s.S.z.toFixed(2),+s.S.yaw.toFixed(2)]); if(!s.S.walker && i>20) break;}
          return out;})()''')
        for r in res[int(sys.argv[1]):int(sys.argv[1])+10]: print(r)
        await b.close()
asyncio.run(main())
