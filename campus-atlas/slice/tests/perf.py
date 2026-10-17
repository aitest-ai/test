# 效能與健康探測（Playwright）：開頁 → 收 console / pageerror → 各情境截圖 → 量平均 FPS。
# 用法：python3 tests/perf.py [--url URL] [--soft] [--uncap] [--out tests/perf-out] [--label NAME]
#   未給 --url 時會自己起一個靜態伺服器服務 dist/（請先 npm run build）。
# 結果：<out>/<label>.json 與截圖 <out>/<label>_*.png。
# 退出碼：有 pageerror / console error / 請求失敗，或任一情境 FPS 低於 --min-fps → 1（可放進 CI）。
import argparse, asyncio, json, os, sys, threading, http.server, socketserver, functools, time
from playwright.async_api import async_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ap = argparse.ArgumentParser()
ap.add_argument('--url'); ap.add_argument('--dist', action='store_true', help='（相容用，預設即服務 dist/）')
ap.add_argument('--soft', action='store_true', help='SwiftShader 軟體渲染（預設用 GPU）')
ap.add_argument('--out', default=os.path.join(ROOT, 'tests', 'perf-out')); ap.add_argument('--label')
ap.add_argument('--uncap', action='store_true', help='解除 vsync，量 GPU 真實上限')
ap.add_argument('--secs', type=float, default=5.0)
ap.add_argument('--min-fps', type=float, default=0, help='任一情境低於此值即失敗')
a = ap.parse_args()
label = a.label or ('soft' if a.soft else 'gpu_uncap' if a.uncap else 'gpu')
os.makedirs(a.out, exist_ok=True)

url = a.url
if not url:
    class Q(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *x): pass
    srv = socketserver.TCPServer(('127.0.0.1', 0), functools.partial(Q, directory=os.path.join(ROOT, 'dist')))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    url = f'http://127.0.0.1:{srv.server_address[1]}/dongxin.html'

ARGS = ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] if a.soft else \
       ['--no-sandbox', '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=gl'] + (['--disable-gpu-vsync', '--disable-frame-rate-limit'] if a.uncap else [])
# 量 rAF：真實時間內實際畫了幾幀（vsync 上限通常 60）
FPS_JS = """(secs)=>new Promise(r=>{let n=0,worst=0,last=performance.now();const t0=last;
 function f(t){n++;worst=Math.max(worst,t-last);last=t;if(t-t0<secs*1000)requestAnimationFrame(f);else r({fps:n*1000/(t-t0),worstMs:worst})}
 requestAnimationFrame(f)})"""
T = "const d=__dx;const t=n=>d.TARGETS.find(x=>x.name===n);"

async def main():
    res = {'label': label, 'url': url, 'when': time.strftime('%Y-%m-%d %H:%M:%S'), 'errors': [], 'scenes': {}}
    async with async_playwright() as p:
        b = await p.chromium.launch(headless=True, args=ARGS)
        pg = await b.new_page(viewport={'width': 1440, 'height': 900})
        pg.on('pageerror', lambda e: res['errors'].append('pageerror: ' + str(e)[:300]))
        pg.on('console', lambda m: res['errors'].append(f'console.{m.type}: ' + m.text[:300]) if m.type == 'error' else None)
        pg.on('requestfailed', lambda r: res['errors'].append('requestfailed: ' + r.url))
        t0 = time.time()
        await pg.goto(url, wait_until='domcontentloaded', timeout=60000)
        await pg.wait_for_function('window.__dx', timeout=60000)
        res['loadSec'] = round(time.time() - t0, 2)
        res['renderer'] = await pg.evaluate("""()=>{const c=document.createElement('canvas').getContext('webgl');if(!c)return null;
          const d=c.getExtension('WEBGL_debug_renderer_info');return d?c.getParameter(d.UNMASKED_RENDERER_WEBGL):c.getParameter(c.RENDERER)}""")
        res['three'] = await pg.evaluate('__dx.THREE.REVISION')
        if await pg.is_visible('#help'): await pg.click('#helpclose')
        await pg.wait_for_timeout(800)

        async def scene(name, setup, hold=None):
            await pg.evaluate(T + setup); await pg.wait_for_timeout(700)
            if hold: await pg.focus('#scene'); await pg.keyboard.down(hold)
            r = await pg.evaluate(FPS_JS, a.secs)
            if hold: await pg.keyboard.up(hold)
            r['info'] = await pg.evaluate('__dx.info()')
            r['calls'] = await pg.evaluate('__dx.renderInfo ? __dx.renderInfo() : null')
            await pg.screenshot(path=os.path.join(a.out, f'{label}_{name}.png'))
            res['scenes'][name] = {k: (round(v, 1) if isinstance(v, float) else v) for k, v in r.items()}

        await scene('spawn_third', "d.setMode('third')")
        await scene('walk_third', "d.setMode('third')", hold='KeyW')
        await scene('bird', "d.setMode('bird')")
        await scene('guide_301', "d.setMode('third');d.teleportTo(t('校門'));d.setDest(t('301'));d.startRoute(true)")
        await scene('corridor_2f', "d.cancelRoute();d.teleportTo(t('301'))")
        await b.close()
    fps = [s['fps'] for s in res['scenes'].values()]
    res['fpsMin'] = round(min(fps), 1); res['fpsAvg'] = round(sum(fps) / len(fps), 1)
    res['ok'] = not res['errors'] and res['fpsMin'] >= a.min_fps
    json.dump(res, open(os.path.join(a.out, f'{label}.json'), 'w'), ensure_ascii=False, indent=1)
    print(json.dumps(res, ensure_ascii=False, indent=1))
    print(('PASS' if res['ok'] else 'FAIL'), f"{label}: fps min {res['fpsMin']} / avg {res['fpsAvg']}, errors {len(res['errors'])}", file=sys.stderr)
    return res['ok']

sys.exit(0 if asyncio.run(main()) else 1)
