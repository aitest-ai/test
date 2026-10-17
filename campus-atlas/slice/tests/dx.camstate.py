# 鏡頭狀態機驗收（真 Chromium，服務 dist/ 或 --dir 指定的建置）：切換不跳動。
# 逐幀（dt=1/60）記錄鏡頭位置與視線方向，量每次切換：總位移、單幀最大位移、單幀占總位移比例、視線角速度峰值。
# 門檻：位移 > 2 m 的切換，單幀占比 ≤ 15%；視線角速度峰值 ≤ 6 rad/s；狀態標籤正確（third/bird/first/guide）。
import asyncio, os, sys, json, math, threading, http.server, socketserver, functools
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIR = sys.argv[sys.argv.index('--dir') + 1] if '--dir' in sys.argv else os.path.join(ROOT, 'dist')
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
srv = socketserver.TCPServer(('127.0.0.1', 0), functools.partial(Q, directory=DIR)); PORT = srv.server_address[1]
threading.Thread(target=srv.serve_forever, daemon=True).start()
T = "const d=__dx;const t=n=>d.TARGETS.find(x=>x.name===n);"
# (名稱, 前置（不計入，例如傳送）, 切換動作, 預期狀態)
STEPS = [('third→bird', '', "d.setMode('bird')", 'bird'), ('bird→third', '', "d.setMode('third')", 'third'), ('third→first', '', "d.setMode('first')", 'first'),
         ('first→third', '', "d.setMode('third')", 'third'), ('third→guide', '', "d.setDest(t('301'));d.startRoute(true)", 'guide'), ('guide→third', '', "d.cancelRoute()", 'third'),
         ('third→bird(2F 走廊)', "d.teleportTo(t('301'));d.advance(1,1/60);", "d.setMode('bird')", 'bird'), ('bird→third(2F 走廊)', '', "d.setMode('third')", 'third')]
REC = """(n)=>{const d=__dx,out=[];for(let i=0;i<n;i++){d.tick(1/60);const c=d.cam();out.push([...c.p,...c.d]);}return {f:out,info:d.info()}}"""
async def main():
    res = {}; ok = True
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox', '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=gl'])
        pg = await b.new_page(viewport={'width': 1200, 'height': 760}); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(f'http://127.0.0.1:{PORT}/dongxin.html'); await pg.wait_for_function('window.__dx', timeout=60000)
        await pg.evaluate(T + "d.teleportTo(t('穿堂'));d.setMode('third');d.advance(2,1/60)")
        for name, setup, js, want in STEPS:
            if setup: await pg.evaluate("(()=>{" + T + setup + "})()")
            pre = await pg.evaluate(REC, 1)
            await pg.evaluate("(()=>{" + T + js + "})()")
            r = await pg.evaluate(REC, 90)
            fr = [pre['f'][-1]] + r['f']
            steps = [math.dist(fr[i][:3], fr[i - 1][:3]) for i in range(1, len(fr))]
            angs = [math.acos(max(-1, min(1, sum(a * b2 for a, b2 in zip(fr[i][3:], fr[i - 1][3:]))))) * 60 for i in range(1, len(fr))]
            tot = sum(steps); mx = max(steps); frac = mx / tot if tot > 1e-6 else 0
            state = r['info'].get('camState')
            res[name] = {'total_m': round(tot, 2), 'maxStep_m': round(mx, 3), 'maxStepFrac': round(frac, 3), 'maxAngVel': round(max(angs), 2), 'state': state}
            good = (tot <= 2 or frac <= 0.15) and max(angs) <= 6 and (state is None or state == want)
            ok &= good; print(('PASS ' if good else 'FAIL ') + name, res[name])
        await b.close()
    print('pageerrors', errs); ok &= not errs
    print(json.dumps(res, ensure_ascii=False)); print('CAMSTATE', 'PASS' if ok else 'FAIL'); return ok
sys.exit(0 if asyncio.run(main()) else 1)
