import asyncio, json, threading, http.server, socketserver, functools, os, sys
from playwright.async_api import async_playwright
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a): pass
srv=socketserver.TCPServer(('127.0.0.1',0),functools.partial(Q,directory=ROOT)); PORT=srv.server_address[1]
threading.Thread(target=srv.serve_forever,daemon=True).start()
THREE=open(os.path.join(ROOT,'vendor/three.min.js'),'rb').read()
SH=os.path.join(ROOT,'shots'); os.makedirs(SH,exist_ok=True)
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(args=['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--no-sandbox'])
        pg=await (await b.new_context(viewport={'width':1280,'height':760})).new_page()
        pg.on('console',lambda m: print('CON',m.type,m.text) if m.type in('error',) else None)
        pg.on('pageerror',lambda e: print('PAGEERR',e))
        await pg.route('https://cdnjs.cloudflare.com/**',lambda r: r.fulfill(body=THREE,content_type='application/javascript'))
        await pg.goto(f'http://127.0.0.1:{PORT}/dongxin.html')
        await pg.wait_for_function('window.__dx',timeout=60000)
        if await pg.is_visible('#helpclose'): await pg.click('#helpclose')
        await pg.evaluate("document.querySelector('#panel').style.display='none'")
        async def shot(n): await pg.evaluate('__dx.advance(0.6)'); await pg.screenshot(path=f'{SH}/{n}.png')
        # 1 停車場入口：站在入口南側往北看
        await pg.evaluate('(()=>{const d=__dx;const t=d.TARGETS.find(t=>t.name==="停車場入口");d.teleportTo(t);d.S.yaw=d.S.heading=Math.PI;d.S.dist=6.5;d.S.pitch=0.22})()')
        await shot('v5_ramp')
        # 2 教室桌椅（301，門外視角→進入）
        await pg.evaluate('(()=>{const d=__dx;const t=d.TARGETS.find(t=>t.name==="104");d.setDest(t);d.teleportTo(t);d.startRoute(true)})()')
        for k in range(3): await pg.evaluate('__dx.advance(3)')
        await shot('v5_class')
        # 3 三棟外觀：鳥瞰
        await pg.evaluate('__dx.setMode("bird")'); await pg.evaluate('__dx.S.birdH=95;__dx.S.byaw=Math.PI'); await shot('v5_bird')
        await pg.evaluate('__dx.setMode("third")')
        # 4 蒙萌園東牆：站在坡道北側向西看
        await pg.evaluate('(()=>{const d=__dx;d.S.x=d.m.RAMP.x0-2.2;d.S.z=d.m.RAMP.z1+1.0;d.S.y=0;d.S.yaw=d.S.heading=Math.PI*1.5;d.S.dist=7;d.S.pitch=0.15;})()')
        await shot('v5_K')
        # 5 集賢樓/沐風苑：庭院
        await pg.evaluate('(()=>{const d=__dx;const t=d.TARGETS.find(t=>t.name==="早安廣場");d.teleportTo(t);d.S.yaw=d.S.heading=0;d.S.dist=8;d.S.pitch=0.3})()')
        await shot('v5_court')
        print(await pg.evaluate('JSON.stringify(__dx.info())'))
        await b.close()
asyncio.run(main())
