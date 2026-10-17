# 畫面一致性：固定視角截圖（隱藏 UI），可與另一組截圖做像素差比對。
# 拍攝：python3 tests/parity.py shoot OUT [--src]   （預設服務 dist/；--src 服務原始碼資料夾，只適用 CDN 版的舊提交）
# 比對：python3 tests/parity.py diff A_DIR B_DIR   → 每張的平均絕對差（0–255）與差異像素比例（需要 numpy、pillow）
import asyncio, os, sys, json, threading, http.server, socketserver, functools
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
POSES = {  # name: JS（在 __dx 上執行；d=__dx、t=依名稱找目標）
 'gate':   "d.setMode('third');d.teleportTo(t('校門'));d.S.yaw=d.S.heading;",
 'corr2f': "d.setMode('third');d.teleportTo(t('301'));d.S.yaw=d.S.heading+Math.PI/2;",
 'class':  "d.setMode('third');d.teleportTo(t('301'));d.S.yaw=d.S.heading;d.world.move(d.S,Math.sin(d.S.heading)*3,Math.cos(d.S.heading)*3);",
 'bird':   "d.setMode('bird');d.teleportTo(t('穿堂'));",
 'first':  "d.setMode('first');d.teleportTo(t('運動場'));d.S.yaw=0.8;d.S.pitch=0.2;",
}

async def shoot(out, dist):
    from playwright.async_api import async_playwright
    class Q(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *x): pass
    srv = socketserver.TCPServer(('127.0.0.1', 0), functools.partial(Q, directory=os.path.join(ROOT, 'dist') if dist else ROOT))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    url = f'http://127.0.0.1:{srv.server_address[1]}/dongxin.html'
    os.makedirs(out, exist_ok=True)
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox', '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=gl'])
        pg = await b.new_page(viewport={'width': 1200, 'height': 760})
        errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.on('console', lambda m: errs.append(m.text) if m.type in ('error', 'warning') else None)
        await pg.goto(url); await pg.wait_for_function('window.__dx', timeout=60000)
        await pg.add_style_tag(content='body>*:not(#scene){display:none!important}')
        for n, js in POSES.items():
            await pg.evaluate("(()=>{const d=__dx;const t=n=>d.TARGETS.find(x=>x.name===n);d.cancelRoute();" + js + "d.advance(2.5,1/60);})()")
            await pg.screenshot(path=os.path.join(out, n + '.png'))
        await b.close()
    print('shot', len(POSES), 'errors/warnings:', errs)

def diff(a, b):
    import numpy as np
    from PIL import Image
    res = {}
    for n in POSES:
        A = np.asarray(Image.open(os.path.join(a, n + '.png')).convert('RGB'), dtype=np.int16)
        B = np.asarray(Image.open(os.path.join(b, n + '.png')).convert('RGB'), dtype=np.int16)
        d = np.abs(A - B)
        res[n] = {'meanAbs': round(float(d.mean()), 2), 'pctOver24': round(float((d.max(axis=2) > 24).mean() * 100), 2),
                  'meanRGB_A': [round(float(x), 1) for x in A.reshape(-1, 3).mean(0)], 'meanRGB_B': [round(float(x), 1) for x in B.reshape(-1, 3).mean(0)]}
        Image.fromarray(np.clip(d * 4, 0, 255).astype('uint8')).save(os.path.join(b, n + '_diff.png'))
    print(json.dumps(res, ensure_ascii=False, indent=1))
    return res

if __name__ == '__main__':
    if sys.argv[1] == 'shoot': asyncio.run(shoot(sys.argv[2], '--src' not in sys.argv))
    else: diff(sys.argv[2], sys.argv[3])
