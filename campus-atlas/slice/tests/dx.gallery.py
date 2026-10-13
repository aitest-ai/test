import asyncio, json, threading, http.server, socketserver, functools, os, sys
from playwright.async_api import async_playwright
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a): pass
srv=socketserver.TCPServer(('127.0.0.1',0),functools.partial(Q,directory=ROOT)); PORT=srv.server_address[1]
threading.Thread(target=srv.serve_forever,daemon=True).start()
THREE=open(os.path.join(ROOT,'vendor/three.min.js'),'rb').read()
SH=os.path.join(ROOT,'shots'); os.makedirs(SH,exist_ok=True)
VIEWS=json.loads(sys.argv[1]) if len(sys.argv)>1 else []
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(args=['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--no-sandbox'])
        pg=await (await b.new_context(viewport={'width':1100,'height':680})).new_page()
        pg.on('console',lambda m: print('CON',m.type,m.text) if m.type in('error','warning') else None)
        pg.on('pageerror',lambda e: print('PAGEERR',e))
        await pg.route('https://cdnjs.cloudflare.com/**',lambda r: r.fulfill(body=THREE,content_type='application/javascript'))
        await pg.goto(f'http://127.0.0.1:{PORT}/dongxin.html'); await pg.wait_for_function('window.__dx',timeout=40000)
        if await pg.is_visible('#helpclose'): await pg.click('#helpclose')
        await pg.evaluate("document.querySelector('#panel').style.display='none'")
        for name,js in VIEWS:
            await pg.evaluate(js); await pg.evaluate('__dx.advance(1.2)'); await pg.screenshot(path=f'{SH}/{name}.png'); print(name, await pg.evaluate('JSON.stringify(__dx.info())'))
        await b.close()
asyncio.run(main())
