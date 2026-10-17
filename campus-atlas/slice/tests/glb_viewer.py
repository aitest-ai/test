# 資產管線驗收：壓縮後的 glb 能在瀏覽器以 KTX2Loader＋MeshoptDecoder 載入、貼圖確實是 KTX2、無錯誤；截圖。
# 用法：npm run build && python3 tests/glb_viewer.py assets-out/dongxin.glb
import asyncio, os, sys, json, shutil, threading, http.server, socketserver, functools
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); GLB = sys.argv[1] if len(sys.argv) > 1 else 'assets-out/dongxin.glb'; Q_ = sys.argv[2] if len(sys.argv) > 2 else ''
os.makedirs(os.path.join(ROOT, 'dist', 'models'), exist_ok=True); shutil.copy(os.path.join(ROOT, GLB), os.path.join(ROOT, 'dist', 'models', 'test.glb'))
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
srv = socketserver.TCPServer(('127.0.0.1', 0), functools.partial(Q, directory=os.path.join(ROOT, 'dist'))); threading.Thread(target=srv.serve_forever, daemon=True).start()
OUT = os.path.join(ROOT, 'tests', 'perf-out', 'glb'); os.makedirs(OUT, exist_ok=True)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox', '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=gl']); pg = await b.new_page(viewport={'width': 1200, 'height': 760}); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
        await pg.goto(f'http://127.0.0.1:{srv.server_address[1]}/glb-viewer.html?src=models/test.glb' + Q_); await pg.wait_for_function('window.__glb && (window.__glb.ready || window.__glb.error)', timeout=60000)
        st = await pg.evaluate('({...window.__glb, view: undefined})'); await pg.wait_for_timeout(500)
        await pg.screenshot(path=os.path.join(OUT, os.path.basename(GLB) + Q_.replace('&', '_').replace('=', '') + '_overview.png'))
        await pg.evaluate('__glb.view(100,6,92, 75,4,60)'); await pg.wait_for_timeout(300); await pg.screenshot(path=os.path.join(OUT, os.path.basename(GLB) + Q_.replace('&', '_').replace('=', '') + '_gate.png'))
        await b.close()
    ok = st.get('ready') and not errs and st.get('compressedTextures', 0) == st.get('textures', -1) and 'EXT_meshopt_compression' in st.get('extensions', [])
    print(json.dumps(st, ensure_ascii=False), errs); print('GLB', 'PASS' if ok else 'FAIL'); return ok
sys.exit(0 if asyncio.run(main()) else 1)
