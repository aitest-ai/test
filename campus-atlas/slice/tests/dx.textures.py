# 圖片型紋理（瀏覽器）：正常載入全部換上圖片；圖片請求全部失敗時自動退回程式化紋理、無 pageerror、畫面不是空白；?skin=demo-alt 仍可用。
# 用法：python3 tests/dx.textures.py   （服務 dist/，請先 npm run build）
import asyncio, os, sys, threading, http.server, socketserver, functools, io, json
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
class H(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *x): pass
srv = socketserver.ThreadingTCPServer(('127.0.0.1', 0), functools.partial(H, directory=os.path.join(ROOT, 'dist')))
threading.Thread(target=srv.serve_forever, daemon=True).start()
BASE = f'http://127.0.0.1:{srv.server_address[1]}/dongxin.html'
ARGS = ['--no-sandbox', '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=gl']
# 圖片型紋理清單由材質 JSON 決定（第三輪 A 加入實景照片紋理後數量會變）
SPEC = json.load(open(os.path.join(ROOT, 'data', 'materials.dongxin.json'), encoding='utf-8'))
TEX = tuple(os.path.splitext(t['image']['src'])[0] for t in SPEC['textures'] if t.get('image')); N = len(TEX)
fails = []
def check(name, ok, detail=''):
    print('PASS' if ok else 'FAIL', name, detail); (None if ok else fails.append(name))

async def run(b, query='', block=False):
    pg = await b.new_page(viewport={'width': 1000, 'height': 640}); errs, warns, blocked = [], [], []
    pg.on('pageerror', lambda e: errs.append(str(e)[:200]))
    pg.on('console', lambda m: (errs if m.type == 'error' else warns).append(m.text[:200]) if m.type in ('error', 'warning') else None)
    if block:
        async def deny(route):
            blocked.append(route.request.url); await route.abort()
        await pg.route(lambda u: any(t in u for t in TEX), deny)
    await pg.goto(BASE + query); await pg.wait_for_function('window.__dx', timeout=60000)
    st = await pg.evaluate('__dx.texturesReady()')
    await pg.evaluate("(()=>{const d=__dx;d.cancelRoute();d.setMode('third');d.advance(1,1/30);})()")
    png = await pg.locator('#scene').screenshot()
    from PIL import Image, ImageStat
    std = sum(ImageStat.Stat(Image.open(io.BytesIO(png)).convert('RGB')).stddev) / 3
    await pg.close(); return st, errs, warns, blocked, std

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=ARGS)
        st, errs, warns, _, std = await run(b)
        check(f'正常：{N} 張圖片型紋理全部載入', st == {k: 'image' for k in st} and len(st) == N, str(st))
        check('正常：無 pageerror／console error', not errs, str(errs))
        st, errs, warns, blocked, std = await run(b, block=True)
        check('圖片全部失敗：攔截到圖片請求', len(blocked) >= N, f'{len(blocked)} 個')
        check('圖片全部失敗：全部退回程式化紋理', st == {k: 'fallback' for k in st} and len(st) == N, str(st))
        check('圖片全部失敗：無 pageerror', not [e for e in errs if 'ERR_FAILED' not in e], str(errs))
        check('圖片全部失敗：有清楚的警告', sum('程式化備援' in w for w in warns) == N, str([w for w in warns if '備援' in w][:1]))
        check('圖片全部失敗：畫面不是空白', std > 15, f'像素標準差 {std:.1f}')
        st, errs, warns, _, std = await run(b, '?skin=demo-alt')
        check('?skin=demo-alt：無圖片型紋理、正常渲染', st == {} and not errs and std > 15, f'{st} {errs} std {std:.1f}')
        await b.close()
    print('TEXTURES', 'FAIL ' + str(fails) if fails else 'PASS')
    sys.exit(1 if fails else 0)
asyncio.run(main())
