import asyncio, json, sys, threading, http.server, socketserver, functools, os
from playwright.async_api import async_playwright
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
H=functools.partial(http.server.SimpleHTTPRequestHandler, directory=ROOT)
class Q(H.func):
    def log_message(self,*a): pass
srv=socketserver.TCPServer(('127.0.0.1',0),functools.partial(Q,directory=ROOT)); PORT=srv.server_address[1]
threading.Thread(target=srv.serve_forever,daemon=True).start()
THREE=open(os.path.join(ROOT,'vendor/three.min.js'),'rb').read()
SH=os.path.join(ROOT,'shots'); os.makedirs(SH,exist_ok=True)
log={'console':[],'pageerrors':[],'checks':[]}
def chk(name,ok,detail=''):
    log['checks'].append({'name':name,'ok':bool(ok),'detail':str(detail)}); print(('PASS ' if ok else 'FAIL ')+name, detail)
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(args=['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--no-sandbox'])
        ctx=await b.new_context(viewport={'width':1280,'height':760})
        pg=await ctx.new_page()
        pg.on('console',lambda m: log['console'].append(f'{m.type}: {m.text}') if m.type in('error','warning') else None)
        pg.on('pageerror',lambda e: log['pageerrors'].append(str(e)))
        await pg.route('https://cdnjs.cloudflare.com/**',lambda r: r.fulfill(body=THREE,content_type='application/javascript'))
        await pg.goto(f'http://127.0.0.1:{PORT}/index.html'); await pg.wait_for_function('window.__slice',timeout=20000)
        await pg.click('#helpclose') if await pg.is_visible('#helpclose') else None
        async def shot(n): await pg.screenshot(path=f'{SH}/{n}.png')
        gl=await pg.evaluate('!!document.createElement("canvas").getContext("webgl")'); chk('WebGL 可用',gl)
        await pg.evaluate('__slice.advance(0.5)'); await shot('01_spawn')
        # 鍵盤實測：按住 W 走向校舍
        await pg.focus('#scene'); 
        await pg.keyboard.down('KeyW')
        for _ in range(6): await pg.wait_for_timeout(250); await pg.evaluate('__slice.advance(0.4)')
        await pg.keyboard.up('KeyW'); i=await pg.evaluate('__slice.info()'); chk('鍵盤 W 可前進',i['z']<28,i); await shot('02_walk_forward')
        # 導航到 3-4（跨層）
        await pg.evaluate('(()=>{const s=__slice;s.setDest(s.lay.rooms.find(r=>r.id==="r3-4"));s.startRoute(true)})()')
        shots=[3,6,9,12,16,20]
        t=0
        for k,sec in enumerate([3,3,3,3,4,5]):
            await pg.evaluate(f'__slice.advance({sec})'); await shot(f'03_nav_{k}')
            i=await pg.evaluate('__slice.info()'); 
            if i['done'] is None: break
        i=await pg.evaluate('__slice.info()'); r=await pg.evaluate('(()=>{const s=__slice;const r=s.lay.rooms.find(r=>r.id==="r3-4");return [s.S.x-r.sill.x,s.S.z-r.sill.z,s.S.y-r.sill.y]})()')
        chk('自動導航跨層到 3F 教室門口',abs(r[0])<0.3 and abs(r[1])<0.3 and abs(r[2])<0.05,r)
        await shot('04_arrived_3F')
        # 樓層按鈕、模式
        await pg.click('#floors button[data-k="0"]'); await pg.evaluate('__slice.advance(0.6)'); i=await pg.evaluate('__slice.info()'); chk('切到 1F',i['floor']==0 and i['y']==0,i); await shot('05_floor1_corridor')
        await pg.click('#modes button[data-m="first"]'); await pg.evaluate('__slice.advance(0.3)'); await shot('06_first_person')
        await pg.click('#modes button[data-m="bird"]'); await pg.evaluate('__slice.advance(0.3)'); await shot('07_bird_all')
        await pg.click('#floors button[data-k="1"]'); await pg.evaluate('__slice.advance(0.3)'); await shot('08_bird_cut2F')
        await pg.click('#floors button[data-k="0"]'); await pg.evaluate('__slice.advance(0.3)'); await shot('09_bird_cut1F')
        await pg.click('#modes button[data-m="third"]')
        await pg.fill('#q','2-3'); await pg.wait_for_timeout(100); n=await pg.evaluate('document.querySelectorAll("#list .item").length'); chk('搜尋 2-3 有結果',n==1,n); await shot('10_search')
        await pg.evaluate('document.querySelector("#list .item").click()'); chk('選取後顯示資訊卡',await pg.is_visible('#info'))
        await pg.click('#tp'); await pg.evaluate('__slice.advance(0.5)'); await shot('11_teleport_door')
        # 手機視窗
        await pg.set_viewport_size({'width':390,'height':780}); await pg.evaluate('__slice.advance(0.3)'); await shot('12_mobile')
        chk('無 pageerror',len(log['pageerrors'])==0,log['pageerrors'][:3])
        errs=[c for c in log['console'] if c.startswith('error')]; chk('console 無 error',len(errs)==0,errs[:3])
        await b.close()
    json.dump(log,open(f'{SH}/browser_log.json','w'),ensure_ascii=False,indent=1)
    print('FAILS:',[c['name'] for c in log['checks'] if not c['ok']])
asyncio.run(main())
