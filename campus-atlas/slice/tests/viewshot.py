# 照片對照截圖：以自由相機（__dx.view）從指定位置拍場景。視角對應 assets/photo-src/ 的照片（位置為依平面圖估計的拍攝點）。
# 用法：python3 tests/viewshot.py OUT_DIR [名稱…] [--query '?ao=0'] [--json '{"名":[[px,py,pz],[tx,ty,tz],fov]}']   （服務 dist/）
import asyncio, os, sys, json, threading, http.server, socketserver, functools
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SC = 0.0756
P = lambda x, y, h: [round(x * SC, 2), h, round(y * SC, 2)]      # 平面圖單位 → 世界座標
VIEWS = {   # 名稱: [相機位置, 注視點, 垂直視角]；對照照片
 'chuantang_front':  [P(1150, 700, 1.5), P(1145, 480, 6.0), 75],     # chuantang_front_cantilever.jpg：校門側廣場往北看穿堂
 'chuantang_above':  [P(1150, 760, 14.0), P(1145, 560, 2.0), 60],    # chuantang_from_above.jpg：對面高處往下看
 'chuantang_inside': [P(1145, 520, 1.5), P(1140, 250, 2.5), 70],     # 穿堂內往操場（照片不入庫，依任務檔描述）
 'jixian_front':     [P(1150, 900, 1.6), P(1150, 560, 9.0), 70],     # jixian_facade_3_4f / courtyard：集賢樓正立面
 'mufeng_corr':      [P(760, 600, 3.9 + 1.5), P(760, 300, 3.9 + 1.5), 70],   # mufeng_corridor_2f.jpg
 'playground_side':  [P(1150, -40, 1.6), P(1150, 280, 6.0), 70],     # jixian_playground_side_finbox.jpg
 'gate':             [P(1245, 1120, 1.6), P(1050, 900, 5.0), 70],
 'bird_chuantang':   [P(1180, 760, 45.0), P(1140, 420, 0.0), 55],
}
async def main():
    a = [x for x in sys.argv[1:]]
    q = a[a.index('--query') + 1] if '--query' in a else ''
    if '--json' in a: VIEWS.update(json.loads(a[a.index('--json') + 1]))
    pos = [x for i, x in enumerate(a) if not x.startswith('--') and (i == 0 or not a[i - 1].startswith('--'))]
    out, names = pos[0], pos[1:] or list(VIEWS)
    os.makedirs(out, exist_ok=True)
    class H(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *x): pass
    srv = socketserver.ThreadingTCPServer(('127.0.0.1', 0), functools.partial(H, directory=os.path.join(ROOT, 'dist')))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    from playwright.async_api import async_playwright
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox', '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=gl'])
        c = await b.new_context(viewport={'width': 1200, 'height': 800}); pg = await c.new_page()
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)[:200]))
        await pg.goto(f'http://127.0.0.1:{srv.server_address[1]}/dongxin.html' + q); await pg.wait_for_function('window.__dx', timeout=60000)
        await pg.add_style_tag(content='body>*:not(#scene){display:none!important}')
        await pg.evaluate('Promise.all([__dx.texturesReady(), __dx.aoReady()])')
        await pg.evaluate('__dx.advance(0.5)')
        for n in names:
            v = VIEWS[n]
            await pg.evaluate(f'__dx.view({json.dumps(v[0])},{json.dumps(v[1])},{v[2]})'); await pg.wait_for_timeout(100)
            await pg.screenshot(path=os.path.join(out, n + '.png'))
        await b.close()
    print('viewshot', len(names), 'errors:', errs)
asyncio.run(main())
