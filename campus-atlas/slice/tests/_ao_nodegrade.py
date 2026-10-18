# 烘焙 AO（瀏覽器）：正常套用；幾何／排列簽章不符時不套用（?lmsize=2048 讓 uv1 排列不同）；AO 圖載入失敗時維持無 AO；?ao=0 關閉。皆不得有 pageerror。
# 用法：python3 tests/dx.ao.py   （服務 dist/，請先 npm run build）
import asyncio, os, sys, threading, http.server, socketserver, functools, io
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
class H(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *x): pass
srv = socketserver.ThreadingTCPServer(('127.0.0.1', 0), functools.partial(H, directory=os.path.join(ROOT, 'dist')))
threading.Thread(target=srv.serve_forever, daemon=True).start()
BASE = f'http://127.0.0.1:{srv.server_address[1]}/dongxin.html'
fails = []
def check(name, ok, detail=''):
    print('PASS' if ok else 'FAIL', name, detail); (None if ok else fails.append(name))
async def run(b, q='', block=False):
    pg = await b.new_page(viewport={'width': 900, 'height': 600}); errs, warns = [], []
    pg.on('pageerror', lambda e: errs.append(str(e)[:200]))
    pg.on('console', lambda m: warns.append(m.text[:200]) if m.type == 'warning' else (errs.append(m.text[:200]) if m.type == 'error' and 'ERR_FAILED' not in m.text else None))
    if block: await pg.route(lambda u: '/ao_' in u, lambda r: r.abort())
    await pg.goto(BASE + q); await pg.wait_for_function('window.__dx', timeout=60000)
    st = await pg.evaluate('__dx.aoReady()'); lm = await pg.evaluate('__dx.lightmap')
    await pg.close(); return st, errs, warns, lm
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox', '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=gl'])
        st, errs, warns, lm = await run(b, '?degrade=0')
        check('正常：AO 已套用', st['status'] == 'on', f"{st} lightmap {lm['texelsPerMeter']} texel/m、{lm['islands']} 島、uv1 配置 {lm['ms']} ms")
        check('正常：無 pageerror／console error', not errs, str(errs))
        st, errs, warns, _ = await run(b, '?lmsize=2048')
        check('簽章不符：不套用並警告', st['status'] == 'mismatch' and any('不符' in w for w in warns), str(st))
        check('簽章不符：無 pageerror', not errs, str(errs))
        st, errs, warns, _ = await run(b, block=True)
        check('AO 圖載入失敗：維持無 AO、有警告、無 pageerror', st['status'] == 'failed' and any('[ao]' in w for w in warns) and not errs, f'{st} {errs}')
        st, errs, warns, _ = await run(b, '?ao=0')
        check('?ao=0：關閉', st['status'] == 'off' and not errs, str(st))
        await b.close()
    print('AO', 'FAIL ' + str(fails) if fails else 'PASS'); sys.exit(1 if fails else 0)
asyncio.run(main())
