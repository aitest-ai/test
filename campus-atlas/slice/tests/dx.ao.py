# 烘焙 AO（瀏覽器）：正常套用；幾何／排列簽章不符時不套用（?lmsize=2048 讓 uv1 排列不同）；AO 圖載入失敗時維持無 AO；?ao=0 關閉。皆不得有 pageerror。
# 用法：python3 tests/dx.ao.py [--stale-ok]   （服務 dist/，請先 npm run build；預設一律加 ?degrade=0，避免慢機自動降級干擾判定）
#   另測自動降級路徑（不加 ?degrade=0）：init script 讓每幀忙等 70 ms（約 14 FPS），3 秒後應自動關陰影（< 30 FPS）與 AO（< 20 FPS）。
#   --stale-ok：場景幾何已改、AO 尚未重烘（第三輪 Phase 0 中途）：正常情況改為確認「簽章不符 → 不套用並警告」；載入失敗路徑此時無法測（簽章先擋下），標 SKIP。
import asyncio, os, sys, threading, http.server, socketserver, functools, io
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
class H(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *x): pass
srv = socketserver.ThreadingTCPServer(('127.0.0.1', 0), functools.partial(H, directory=os.path.join(ROOT, 'dist')))
threading.Thread(target=srv.serve_forever, daemon=True).start()
ROOTURL = f'http://127.0.0.1:{srv.server_address[1]}/dongxin.html'; BASE = ROOTURL + '?degrade=0'
SLOW_JS = 'const _raf=window.requestAnimationFrame.bind(window);window.requestAnimationFrame=cb=>_raf(t=>{const e=performance.now()+70;while(performance.now()<e);cb(t);});'
STALE = '--stale-ok' in sys.argv
fails = []
def check(name, ok, detail=''):
    print('PASS' if ok else 'FAIL', name, detail); (None if ok else fails.append(name))
async def run(b, q='', block=False, slow=False):
    pg = await b.new_page(viewport={'width': 900, 'height': 600}); errs, warns, infos = [], [], []
    if slow: await pg.add_init_script(SLOW_JS)
    pg.on('console', lambda m: infos.append(m.text[:200]) if m.type == 'info' else None)
    pg.on('pageerror', lambda e: errs.append(str(e)[:200]))
    pg.on('console', lambda m: warns.append(m.text[:200]) if m.type == 'warning' else (errs.append(m.text[:200]) if m.type == 'error' and 'ERR_FAILED' not in m.text else None))
    if block: await pg.route(lambda u: '/ao_' in u, lambda r: r.abort())
    await pg.goto((ROOTURL + q) if slow else (BASE + q.replace('?', '&'))); await pg.wait_for_function('window.__dx', timeout=60000)
    st = await pg.evaluate('__dx.aoReady()'); lm = await pg.evaluate('__dx.lightmap')
    if slow:
        await pg.wait_for_timeout(5000); st = await pg.evaluate('__dx.ao()'); lm = {'renderInfo': await pg.evaluate('__dx.renderInfo()'), 'infos': infos}
    await pg.close(); return st, errs, warns, lm
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox', '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=gl'])
        st, errs, warns, lm = await run(b)
        if STALE: check('正常（AO 待重烘）：簽章不符 → 不套用並警告', st['status'] == 'mismatch' and any('不符' in w for w in warns), str(st))
        else: check('正常：AO 已套用', st['status'] == 'on', f"{st} lightmap {lm['texelsPerMeter']} texel/m、{lm['islands']} 島、uv1 配置 {lm['ms']} ms")
        check('正常：無 pageerror／console error', not errs, str(errs))
        st, errs, warns, _ = await run(b, '?lmsize=2048')
        check('簽章不符：不套用並警告', st['status'] == 'mismatch' and any('不符' in w for w in warns), str(st))
        check('簽章不符：無 pageerror', not errs, str(errs))
        st, errs, warns, _ = await run(b, block=True)
        if STALE: print('SKIP AO 圖載入失敗路徑（AO 待重烘，簽章先擋下）')
        else: check('AO 圖載入失敗：維持無 AO、有警告、無 pageerror', st['status'] == 'failed' and any('[ao]' in w for w in warns) and not errs, f'{st} {errs}')
        st, errs, warns, _ = await run(b, '?ao=0')
        check('?ao=0：關閉', st['status'] == 'off' and not errs, str(st))
        st, errs, warns, x = await run(b, slow=True)
        ri = x['renderInfo']
        check('自動降級（約 14 FPS、未加 ?degrade=0）：陰影自動關閉', ri.get('shadows') is False and ri.get('degraded') is True, f"{ri} {[i for i in x['infos'] if '[lighting]' in i][:1]}")
        if STALE: print('SKIP 自動降級：AO 自動關閉（AO 待重烘，簽章不符時本來就沒套用）', st)
        else: check('自動降級：AO 自動關閉', st['status'] == 'degraded' and any('[ao]' in i for i in x['infos']), f"{st} {[i for i in x['infos'] if '[ao]' in i][:1]}")
        check('自動降級：無 pageerror', not errs, str(errs))
        await b.close()
    print('AO', 'FAIL ' + str(fails) if fails else 'PASS'); sys.exit(1 if fails else 0)
asyncio.run(main())
