# 第二輪前後對照：7 個固定視角截圖＋量測（dist 大小、載入時間、draw calls、貼圖記憶體）。
# 用法：python3 tests/shots7.py OUT_DIR [--query '?skin=…'] [--loads 3]   （服務 dist/，請先 npm run build）
#   桌機 5 視角（1200×760，隱藏 UI，沿用 parity.py 的 POSES）＋ 手機直式 2 視角（390×844，保留 UI，看版面）。
#   結果：OUT_DIR/*.png 與 OUT_DIR/metrics.json
import asyncio, os, sys, json, time, threading, http.server, socketserver, functools, statistics
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from parity import POSES

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIST = os.path.join(ROOT, 'dist')
MOBILE = {
 'm_spawn':  "",                                                    # 出生點（校門、第三人稱）
 'm_corr2f': POSES['corr2f'],
}
T = "(()=>{const d=__dx;const t=n=>d.TARGETS.find(x=>x.name===n);d.cancelRoute();%s d.advance(2.5,1/60);})()"
ARGS = ['--no-sandbox', '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=gl']

def dist_size():
    tot, by = 0, {}
    for dp, _, fs in os.walk(DIST):
        for f in fs:
            s = os.path.getsize(os.path.join(dp, f)); tot += s
            k = os.path.relpath(dp, DIST).split(os.sep)[0]; by[k] = by.get(k, 0) + s
    return {'totalKB': tot // 1024, 'byDirKB': {k: v // 1024 for k, v in sorted(by.items())}}

async def main(out):
    q = sys.argv[sys.argv.index('--query') + 1] if '--query' in sys.argv else ''
    loads = int(sys.argv[sys.argv.index('--loads') + 1]) if '--loads' in sys.argv else 3
    class H(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *x): pass
    srv = socketserver.ThreadingTCPServer(('127.0.0.1', 0), functools.partial(H, directory=DIST))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    url = f'http://127.0.0.1:{srv.server_address[1]}/dongxin.html' + q
    os.makedirs(out, exist_ok=True)
    M = {'url': q or '(預設)', 'when': time.strftime('%Y-%m-%d %H:%M:%S'), 'dist': dist_size(), 'errors': [], 'views': {}}
    from playwright.async_api import async_playwright
    async with async_playwright() as p:
        b = await p.chromium.launch(args=ARGS)
        # 載入時間：新的 context（無快取）→ goto 到 __dx 就緒；取中位數。順便記下傳輸量
        lt, lt2, xfer = [], [], []
        for i in range(loads):
            c = await b.new_context(viewport={'width': 1200, 'height': 760}); pg = await c.new_page(); got = [0]
            pg.on('response', lambda r: got.__setitem__(0, got[0] + int(r.headers.get('content-length', 0) or 0)))
            t0 = time.time(); await pg.goto(url, wait_until='domcontentloaded'); await pg.wait_for_function('window.__dx', timeout=60000)
            lt.append(time.time() - t0)
            await pg.evaluate('__dx.texturesReady ? __dx.texturesReady() : null'); lt2.append(time.time() - t0)
            await pg.wait_for_timeout(300); xfer.append(got[0]); await c.close()
        M['loadSec'] = {'median': round(statistics.median(lt), 2), 'all': [round(x, 2) for x in lt]}
        M['loadSecTexturesReady'] = {'median': round(statistics.median(lt2), 2), 'all': [round(x, 2) for x in lt2]}
        M['transferKB'] = max(xfer) // 1024

        async def views(pg, poses, hide_ui, prefix=''):
            if hide_ui: await pg.add_style_tag(content='body>*:not(#scene){display:none!important}')
            for n, js in poses.items():
                await pg.evaluate(T % js); await pg.wait_for_timeout(250)
                ri = await pg.evaluate('__dx.renderInfo()')
                await pg.screenshot(path=os.path.join(out, n + '.png'))
                M['views'][n] = {'calls': ri['calls'], 'triangles': ri['triangles']}

        def hook(pg):
            pg.on('pageerror', lambda e: M['errors'].append('pageerror: ' + str(e)[:200]))
            pg.on('console', lambda m: M['errors'].append(f'{m.type}: ' + m.text[:200]) if m.type in ('error', 'warning') else None)
        c = await b.new_context(viewport={'width': 1200, 'height': 760}); pg = await c.new_page(); hook(pg)
        await pg.goto(url); await pg.wait_for_function('window.__dx', timeout=60000)
        M['textures'] = await pg.evaluate('__dx.texturesReady ? __dx.texturesReady() : null')   # 圖片型紋理載入完成才拍
        await views(pg, POSES, True)
        M['memory'] = await pg.evaluate('__dx.memInfo()'); M['renderer'] = await pg.evaluate("""()=>{const g=document.createElement('canvas').getContext('webgl');const d=g&&g.getExtension('WEBGL_debug_renderer_info');return d?g.getParameter(d.UNMASKED_RENDERER_WEBGL):null}""")
        await c.close()
        c = await b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True); pg = await c.new_page(); hook(pg)
        await pg.goto(url); await pg.wait_for_function('window.__dx', timeout=60000)
        await pg.evaluate('__dx.texturesReady ? __dx.texturesReady() : null')
        if await pg.is_visible('#help'): await pg.click('#helpclose')
        await views(pg, MOBILE, False)
        await c.close(); await b.close()
    json.dump(M, open(os.path.join(out, 'metrics.json'), 'w'), ensure_ascii=False, indent=1)
    print(json.dumps(M, ensure_ascii=False, indent=1))

if __name__ == '__main__':
    asyncio.run(main(sys.argv[1]))
