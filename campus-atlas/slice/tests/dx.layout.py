# 版面（瀏覽器）：
#   1. 手機直式 390×844（觸控）：三種狀態（一般、選了教室有資訊卡、導覽中）下，HUD 元素兩兩不重疊，且都在畫面內；搖桿可推動角色。
#   2. 視窗寬 < 1100 px：左側清單預設收合，☰ 打開、✕ 關閉；≥ 1100 px（桌機）：清單預設顯示（行為不變）。
# 用法：python3 tests/dx.layout.py [OUT_DIR]   （服務 dist/；截圖存 OUT_DIR，預設 tests/perf-out/layout）
import asyncio, os, sys, json, threading, http.server, socketserver, functools, math
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'tests', 'perf-out', 'layout'); os.makedirs(OUT, exist_ok=True)
class H(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *x): pass
srv = socketserver.ThreadingTCPServer(('127.0.0.1', 0), functools.partial(H, directory=os.path.join(ROOT, 'dist')))
threading.Thread(target=srv.serve_forever, daemon=True).start()
BASE = f'http://127.0.0.1:{srv.server_address[1]}/dongxin.html?ao=0'
ARGS = ['--no-sandbox', '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=gl']
HUD = ['#top', '#info', '#status', '#floors', '#modes', '#where', '#mini', '#joy', '#panel']
RECTS = """(sel)=>sel.map(s=>{const e=document.querySelector(s);if(!e)return null;const cs=getComputedStyle(e);if(e.hidden||cs.display==='none'||cs.visibility==='hidden')return null;
 const r=e.getBoundingClientRect();if(r.width<1||r.height<1||r.right<=0||r.left>=innerWidth)return null;return [s,Math.round(r.left),Math.round(r.top),Math.round(r.right),Math.round(r.bottom)]}).filter(Boolean)"""
fails, report = [], {}
def check(name, ok, detail=''):
    print('PASS' if ok else 'FAIL', name, detail); (None if ok else fails.append(name))
def overlaps(rs, W, H):
    bad = []
    for i in range(len(rs)):
        a = rs[i]
        if a[1] < 0 or a[2] < 0 or a[3] > W or a[4] > H: bad.append(f'{a[0]} 超出畫面 {a[1:]}')
        for b in rs[i + 1:]:
            ix, iy = min(a[3], b[3]) - max(a[1], b[1]), min(a[4], b[4]) - max(a[2], b[2])
            if ix > 0 and iy > 0: bad.append(f'{a[0]}×{b[0]} 重疊 {ix}×{iy}px')
    return bad

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=ARGS)
        # ---- 1. 手機直式 ----
        W, Hh = 390, 844
        c = await b.new_context(viewport={'width': W, 'height': Hh}, device_scale_factor=2, is_mobile=True, has_touch=True); pg = await c.new_page()
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)[:200]))
        await pg.goto(BASE); await pg.wait_for_function('window.__dx', timeout=60000)
        if await pg.is_visible('#help'): await pg.click('#helpclose')
        await pg.evaluate("__dx.advance(0.5)")
        states = {
          'm_default': "d.cancelRoute();d.setDest&&null;",
          'm_info': "d.cancelRoute();d.setDest(t('301'));",
          'm_nav': "d.cancelRoute();d.teleportTo(t('校門'));d.setDest(t('301'));d.startRoute(true);d.advance(1,1/30);",
        }
        for n, js in states.items():
            await pg.evaluate("(()=>{const d=__dx;const t=n=>d.TARGETS.find(x=>x.name===n);" + js + "d.advance(0.3,1/30);})()"); await pg.wait_for_timeout(400)
            rs = await pg.evaluate(RECTS, HUD); bad = overlaps(rs, W, Hh); report[n] = {'rects': rs, 'problems': bad}
            await pg.screenshot(path=os.path.join(OUT, n + '.png'))
            check(f'手機 390×844 {n}：HUD 不重疊、不出界', not bad, bad or [r[0] for r in rs])
        # 搖桿：在搖桿上拖曳（觸控），角色要移動
        await pg.evaluate("(()=>{const d=__dx;const t=n=>d.TARGETS.find(x=>x.name===n);d.cancelRoute();d.teleportTo(t('校門'));d.advance(0.3)})()")
        await pg.evaluate("document.querySelector('#info')&&(document.querySelector('#info').hidden=true)")
        jb = await pg.evaluate("(()=>{const r=document.querySelector('#joy').getBoundingClientRect();return [r.left+r.width/2,r.top+r.height/2]})()")
        p0 = await pg.evaluate('[__dx.S.x,__dx.S.z]')
        cdp = await c.new_cdp_session(pg)
        async def touch(t, x, y): await cdp.send('Input.dispatchTouchEvent', {'type': t, 'touchPoints': [] if t == 'touchEnd' else [{'x': x, 'y': y, 'id': 1}]})
        await touch('touchStart', jb[0], jb[1])
        for k in range(1, 6): await touch('touchMove', jb[0], jb[1] - 8 * k); await pg.wait_for_timeout(30)
        for _ in range(10): await touch('touchMove', jb[0], jb[1] - 40); await pg.wait_for_timeout(100)
        await touch('touchEnd', 0, 0); p1 = await pg.evaluate('[__dx.S.x,__dx.S.z]')
        moved = math.hypot(p1[0] - p0[0], p1[1] - p0[1]); check('手機：拖曳搖桿可前進', moved > 0.5, f'{moved:.2f} m')
        check('手機：無 pageerror', not errs, errs)
        await c.close()
        # ---- 2. 面板預設狀態 ----
        for w, expect_open in [(1000, False), (760, False), (1099, False), (1100, True), (1280, True)]:
            c = await b.new_context(viewport={'width': w, 'height': 760}); pg = await c.new_page()
            await pg.goto(BASE); await pg.wait_for_function('window.__dx', timeout=60000)
            if await pg.is_visible('#help'): await pg.click('#helpclose')
            await pg.wait_for_timeout(400)
            vis = lambda: pg.evaluate("(()=>{const r=document.querySelector('#panel').getBoundingClientRect();return r.right>0&&r.left<innerWidth})()")
            v0 = await vis()
            check(f'寬 {w}px：清單預設{"顯示" if expect_open else "收合"}', v0 == expect_open, v0)
            if not expect_open:
                await pg.click('#pbtn'); await pg.wait_for_timeout(400); v1 = await vis()
                closer = await pg.is_visible('#pclose')
                if closer: await pg.click('#pclose')
                await pg.wait_for_timeout(400); v2 = await vis()
                check(f'寬 {w}px：☰ 打開、✕ 關閉', v1 and closer and not v2, [v1, closer, v2])
                if w == 1000:
                    await pg.screenshot(path=os.path.join(OUT, 'w1000_default.png')); await pg.click('#pbtn'); await pg.wait_for_timeout(400); await pg.screenshot(path=os.path.join(OUT, 'w1000_open.png'))
            elif w == 1280: await pg.screenshot(path=os.path.join(OUT, 'w1280_default.png'))
            await c.close()
        await b.close()
    json.dump(report, open(os.path.join(OUT, 'layout.json'), 'w'), ensure_ascii=False, indent=1)
    print('LAYOUT', 'FAIL ' + str(fails) if fails else 'PASS'); sys.exit(1 if fails else 0)
asyncio.run(main())
