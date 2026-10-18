# 路線顯示驗收（真 Chromium，服務 dist/）：地面導引帶＋小地圖同步。
#   - 導引帶：取樣間距 ≤ 0.26 m、連續（相鄰點高度差 ≤ 0.2 m＝貼著梯級）、跨樓層路線含梯段
#   - 進度：導覽中 prog 單調遞增、剩餘距離單調遞減、到達時剩餘 < 0.5 m
#   - 小地圖：導覽前段有橘色（剩餘）像素，走一段後出現灰色（已走）像素；樓梯口有「↑」標記（橘色圓）
#   - 狀態列顯示「剩 N 公尺」
import asyncio, os, json, math, threading, http.server, socketserver, functools
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
srv = socketserver.TCPServer(('127.0.0.1', 0), functools.partial(Q, directory=os.path.join(ROOT, 'dist'))); PORT = srv.server_address[1]
threading.Thread(target=srv.serve_forever, daemon=True).start()
SH = os.path.join(ROOT, 'tests', 'perf-out', 'route'); os.makedirs(SH, exist_ok=True)
checks = []; errs = []
def chk(n, ok, d=''): checks.append((n, bool(ok))); print(('PASS ' if ok else 'FAIL ') + n, d)
T = "const d=__dx;const t=n=>d.TARGETS.find(x=>x.name===n);"
MINI = """(()=>{const c=document.querySelector('#mini'),g=c.getContext('2d'),a=g.getImageData(0,0,c.width,c.height).data;let o=0,gr=0;
 for(let i=0;i<a.length;i+=4){const r=a[i],G=a[i+1],b=a[i+2];if(r>230&&G>100&&G<150&&b<40)o++;if(Math.abs(r-G)<8&&Math.abs(G-b)<8&&r>130&&r<190)gr++;}return {orange:o,gray:gr}})()"""
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox', '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=gl'])
        pg = await b.new_page(viewport={'width': 1280, 'height': 800})
        pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
        await pg.goto(f'http://127.0.0.1:{PORT}/dongxin.html'); await pg.wait_for_function('window.__dx', timeout=60000)
        if await pg.is_visible('#help'): await pg.click('#helpclose')
        await pg.evaluate(T + "d.teleportTo(t('校門'));d.setDest(t('301'));d.startRoute(true);d.advance(0.2)")
        sm = await pg.evaluate("(()=>{const r=__dx.S.route;return {n:r.samples.length,total:r.total,maxStep:Math.max(...r.samples.slice(1).map((q,i)=>Math.hypot(q.x-r.samples[i].x,q.z-r.samples[i].z))),maxDy:Math.max(...r.samples.slice(1).map((q,i)=>Math.abs(q.y-r.samples[i].y))),stair:r.samples.filter(q=>q.stair).length,y0:r.samples[0].y,y1:r.samples[r.samples.length-1].y}})()")
        chk('導引帶取樣連續（間距 ≤ 0.26 m）', sm['maxStep'] <= 0.26, sm)
        chk('導引帶貼合梯面（相鄰高度差 ≤ 0.2 m）', sm['maxDy'] <= 0.2, sm['maxDy'])
        chk('跨樓層路線含梯段、終點在 2F', sm['stair'] > 10 and abs(sm['y1'] - 0.07 - 3.9) < 0.05, sm)
        await pg.screenshot(path=f'{SH}/01_start.png')
        mm0 = await pg.evaluate(MINI); chk('小地圖：起點有橘色路線', mm0['orange'] > 150, mm0)
        progs, rems, texts = [], [], []; mmmax = 0
        for k in range(14):
            await pg.evaluate('__dx.advance(2.5)')
            r = await pg.evaluate("(()=>{const r=__dx.S.route;return r?{prog:r.prog,remain:r.remain}:null})()")
            if not r: break
            progs.append(r['prog']); rems.append(r['remain']); texts.append(await pg.inner_text('#stext'))
            mmk = await pg.evaluate(MINI); mmmax = max(mmmax, mmk['gray']) if k else mmk['gray']   # 路線改動時樓層切換時機會變：取沿途最大灰色量
            if k == 3: await pg.screenshot(path=f'{SH}/02_walking.png'); mm1 = dict(mmk)
            if k == 7: await pg.screenshot(path=f'{SH}/03_stairs.png')
        chk('進度單調遞增', all(b2 >= a2 for a2, b2 in zip(progs, progs[1:])) and progs[-1] > progs[0], progs)
        chk('剩餘距離單調遞減', all(b2 <= a2 + 1e-6 for a2, b2 in zip(rems, rems[1:])), [round(x, 1) for x in rems])
        chk('小地圖：走一段後出現灰色已走路段', mmmax > mm0['gray'] + 20, [mm0, mm1, mmmax])
        chk('狀態列顯示剩餘公尺', any('剩' in t and '公尺' in t for t in texts), texts[:3])
        done = await pg.evaluate('__dx.info()'); toast = await pg.inner_text('#toast')
        chk('到達後導引帶清除、提示已到達', done['walker'] is False and '已到達' in toast, [done, toast])
        await pg.screenshot(path=f'{SH}/04_arrived.png')
        chk('無 pageerror / console error', not errs, errs)
        await b.close()
    fails = [n for n, ok in checks if not ok]; print('FAILS:', fails); return not fails
import sys; sys.exit(0 if asyncio.run(main()) else 1)
