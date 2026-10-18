# 把程式化校舍匯出成 glb（真 Chromium + three GLTFExporter）：assets-src/dongxin_raw.glb
# 用法：npm run build && python3 scripts/export_glb.py [--skin demo-alt]
import asyncio, base64, os, sys, json, threading, http.server, socketserver, functools
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
skin = sys.argv[sys.argv.index('--skin') + 1] if '--skin' in sys.argv else None
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
srv = socketserver.TCPServer(('127.0.0.1', 0), functools.partial(Q, directory=os.path.join(ROOT, 'dist'))); threading.Thread(target=srv.serve_forever, daemon=True).start()
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox', '--use-angle=gl']); pg = await b.new_page()
        await pg.goto(f'http://127.0.0.1:{srv.server_address[1]}/dongxin.html' + (f'?skin={skin}' if skin else '')); await pg.wait_for_function('window.__dx', timeout=60000)
        lm = await pg.evaluate('__dx.lightmap')   # lightmap uv1 的參數與幾何簽章（AO 烘焙要對上執行期）
        b64 = await pg.evaluate("""async()=>{const buf=await __dx.exportGLB();let s='';const u=new Uint8Array(buf);for(let i=0;i<u.length;i+=0x8000)s+=String.fromCharCode.apply(null,u.subarray(i,i+0x8000));return btoa(s)}""")
        await b.close()
    out = os.path.join(ROOT, 'assets-src', f'dongxin{"_" + skin if skin else ""}_raw.glb'); os.makedirs(os.path.dirname(out), exist_ok=True)
    open(out, 'wb').write(base64.b64decode(b64)); print(out, os.path.getsize(out) // 1024, 'KB')
    import json; json.dump(lm, open(out.replace('.glb', '.lightmap.json'), 'w'), indent=1); print('lightmap', lm)
asyncio.run(main())
