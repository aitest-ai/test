import asyncio, json, threading, http.server, socketserver, functools, os, sys
from playwright.async_api import async_playwright
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a): pass
srv=socketserver.TCPServer(('127.0.0.1',0),functools.partial(Q,directory=os.path.join(ROOT,'dist'))); PORT=srv.server_address[1]
threading.Thread(target=srv.serve_forever,daemon=True).start()
V=json.loads(sys.argv[1]) if len(sys.argv)>1 else {}
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(args=['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--no-sandbox'])
        pg=await (await b.new_context(viewport={'width':1280,'height':760})).new_page()
        pg.on('pageerror',lambda e: print('PAGEERR',e))
        await pg.goto(f'http://127.0.0.1:{PORT}/dongxin.html'); await pg.wait_for_function('window.__dx',timeout=60000)
        if await pg.is_visible('#helpclose'): await pg.click('#helpclose')
        await pg.evaluate("document.querySelector('#panel').style.display='none'")
        for n,(x,z,yaw,dist,pitch) in V.items():
            await pg.evaluate(f'(()=>{{const d=__dx;d.cancelRoute&&d.cancelRoute();d.gotoFloor&&d.gotoFloor(2);d.S.x={x};d.S.z={z};d.S.y=2*3.9;d.S.yaw=d.S.heading={yaw};d.S.dist={dist};d.S.pitch={pitch};d.S.yCam=2*3.9}})()')
            await pg.evaluate('__dx.advance(1.5)'); await pg.screenshot(path=f'{SH}/{n}.png')
        await b.close()
asyncio.run(main())
