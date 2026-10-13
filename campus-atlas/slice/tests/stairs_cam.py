import asyncio, os, threading, http.server, socketserver, functools
from playwright.async_api import async_playwright
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a): pass
srv=socketserver.TCPServer(('127.0.0.1',0),functools.partial(Q,directory=ROOT)); PORT=srv.server_address[1]
threading.Thread(target=srv.serve_forever,daemon=True).start()
THREE=open(os.path.join(ROOT,'vendor/three.min.js'),'rb').read(); SH=os.path.join(ROOT,'shots')
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(args=['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--no-sandbox'])
        pg=await b.new_page(viewport={'width':1100,'height':700})
        await pg.route('https://cdnjs.cloudflare.com/**',lambda r: r.fulfill(body=THREE,content_type='application/javascript'))
        await pg.goto(f'http://127.0.0.1:{PORT}/index.html'); await pg.wait_for_function('window.__slice')
        await pg.evaluate('document.querySelector("#helpclose")&&0'); await pg.evaluate('document.querySelector("#panel").style.display="none"')
        await pg.evaluate('(()=>{const s=__slice;s.S.x=1.3;s.S.z=8.8;s.S.y=0;s.S.yaw=s.S.heading=Math.PI;s.setDest(s.lay.rooms.find(r=>r.id==="r3-1"));s.startRoute(true)})()')
        import json
        prev=None; cams=[]
        for i in range(34):
            await pg.evaluate('__slice.advance(0.45)')
            d=await pg.evaluate('(()=>{const s=__slice;return {p:[s.S.x,s.S.y,s.S.z].map(v=>+v.toFixed(2)),d:+s.S.dSm.toFixed(2)}})()'); cams.append(d)
            if i%3==0: await pg.screenshot(path=f'{SH}/st_{i:02d}.png')
        print(json.dumps(cams))
        await b.close()
asyncio.run(main())
