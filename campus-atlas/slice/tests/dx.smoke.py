import asyncio, json, threading, http.server, socketserver, functools, os, sys
from playwright.async_api import async_playwright
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a): pass
srv=socketserver.TCPServer(('127.0.0.1',0),functools.partial(Q,directory=os.path.join(ROOT,'dist'))); PORT=srv.server_address[1]
threading.Thread(target=srv.serve_forever,daemon=True).start()
SH=os.path.join(ROOT,'shots'); os.makedirs(SH,exist_ok=True)
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(args=['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--no-sandbox'])
        pg=await (await b.new_context(viewport={'width':1280,'height':760})).new_page()
        pg.on('console',lambda m: print('CON',m.type,m.text) if m.type in('error','warning') else None)
        pg.on('pageerror',lambda e: print('PAGEERR',e))
        await pg.goto(f'http://127.0.0.1:{PORT}/dongxin.html'); 
        try: await pg.wait_for_function('window.__dx',timeout=40000)
        except Exception as e: print('timeout'); 
        if await pg.is_visible('#helpclose'): await pg.click('#helpclose')
        async def shot(n): await pg.screenshot(path=f'{SH}/{n}.png')
        await pg.evaluate("document.querySelector('#panel').style.display='none'")
        await pg.evaluate('__dx.setMode("bird")'); await pg.evaluate('__dx.S.birdH=150'); await pg.evaluate('__dx.advance(0.4)'); await shot('dx_bird')
        await pg.evaluate('__dx.setMode("third")')
        await pg.evaluate('(()=>{const d=__dx;d.setDest(d.TARGETS.find(t=>t.name==="301"));d.startRoute(true)})()')
        for k in range(10):
            await pg.evaluate('__dx.advance(3.5)'); await shot(f'dx_nav{k}'); i=await pg.evaluate('JSON.stringify(__dx.info())'); print(k,i)
            if '"done":true' in i or '"walker":false' in i: break
        await b.close()
asyncio.run(main())
