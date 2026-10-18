# 任務式導覽與互動提示（第三輪 E，瀏覽器）：
#   任務：開始後進度列顯示第 1／N 站；依序傳送到每一站 → 跳出介紹卡（標題、內容、資料來源）→「下一站」→ 進度前進；最後一站後顯示完成。
#   介紹文字必須來自 data/tour.dongxin.json（只放已查證資料），每張卡都有「資料來源」。
#   互動：站在教室門外 → 出現「E 查看〈教室〉」，按 E 選取該教室；站在樓梯口 → 出現「E 到 xF」，按 E 換樓層；沒有提示時 E 仍是橫移。
# 用法：python3 tests/dx.tour.py   （服務 dist/，請先 npm run build）
import asyncio, os, sys, json, threading, http.server, socketserver, functools
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
class H(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *x): pass
srv = socketserver.ThreadingTCPServer(('127.0.0.1', 0), functools.partial(H, directory=os.path.join(ROOT, 'dist')))
threading.Thread(target=srv.serve_forever, daemon=True).start()
URL = f'http://127.0.0.1:{srv.server_address[1]}/dongxin.html?degrade=0'
TOUR = json.load(open(os.path.join(ROOT, 'data', 'tour.dongxin.json'), encoding='utf-8'))
OUT = os.path.join(ROOT, 'tests', 'perf-out', 'tour'); os.makedirs(OUT, exist_ok=True)
fails = []
def check(name, ok, detail=''):
    print('PASS' if ok else 'FAIL', name, detail); (None if ok else fails.append(name))

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox', '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=gl'])
        pg = await b.new_page(viewport={'width': 1280, 'height': 760}); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)[:200]))
        await pg.goto(URL); await pg.wait_for_function('window.__dx', timeout=60000)
        if await pg.is_visible('#help'): await pg.click('#helpclose')
        ev = pg.evaluate; T = "const d=__dx;const t=n=>d.TARGETS.find(x=>x.name===n);"
        n = len(TOUR['stops'])
        await pg.click('#tourstart'); await ev('__dx.advance(0.2)')
        st = await ev('__dx.tour.state')
        check('任務開始：進度列顯示第 1 站', st['active'] and st['idx'] == 0 and await pg.is_visible('#tour') and f'第 1／{n} 站' in await pg.inner_text('#tourtext'), await pg.inner_text('#tourtext'))
        check(f'任務站點全部找得到（{n} 站，3–5 站）', st['n'] == n and 3 <= n <= 5, st['stops'])
        sel = await ev("__dx.S.selected&&__dx.S.selected.name"); here = await pg.is_visible('#tourcard')
        check('任務開始：已選取第 1 站，並畫出路線（出生點就在第 1 站時直接跳介紹卡）', sel == TOUR['stops'][0] and (here or await ev('!!__dx.S.route')), f'{sel} 已在站上={here}')
        if here: await pg.click('#tcnext'); await ev('__dx.tour.state.idx===1') ; await ev(T + "d.tour.stop();d.tour.start();d.teleportTo(t('早安廣場'));d.advance(0.2)")
        for k, name in enumerate(TOUR['stops']):
            await ev(T + f"d.teleportTo(t({json.dumps(name)}));d.advance(0.3)")
            vis = await pg.is_visible('#tourcard'); it = TOUR['intros'][name]
            title, text, src = (await pg.inner_text('#tctitle'), await pg.inner_text('#tctext'), await pg.inner_text('#tcsrc')) if vis else ('', '', '')
            check(f'第 {k + 1} 站「{name}」抵達：跳出介紹卡', vis and title == it['title'] and text == it['text'], title)
            check(f'第 {k + 1} 站「{name}」介紹卡有資料來源', src.startswith('資料來源：') and it['src'] in src, src)
            fill = await ev("parseFloat(document.querySelector('#tourfill').style.width)")
            check(f'第 {k + 1} 站：進度列 {k}/{n}', abs(fill - k / n * 100) < 0.5, fill)
            if k == 0: await pg.screenshot(path=os.path.join(OUT, 'card.png'))
            await pg.click('#tcnext'); await ev('__dx.advance(0.2)')
            st = await ev('__dx.tour.state')
            check(f'第 {k + 1} 站：按下一站後前進', st['idx'] == k + 1 and not st['card'], st)
        txt = await pg.inner_text('#tourtext'); fill = await ev("parseFloat(document.querySelector('#tourfill').style.width)")
        check('全部抵達：顯示完成、進度 100%', '完成' in txt and abs(fill - 100) < 0.5, f'{txt} {fill}')
        await pg.click('#tourstop'); check('結束任務：進度列隱藏', not await pg.is_visible('#tour'))
        # 互動：教室門外（teleportTo 會站到門外、面向門）
        await ev(T + "d.cancelRoute();d.setDest(null);d.teleportTo(t('301'));d.advance(0.4)")
        h = await pg.inner_text('#hint') if await pg.is_visible('#hint') else ''
        check('教室門外：出現 E 提示', '查看〈301〉' in h, h)
        await pg.screenshot(path=os.path.join(OUT, 'hint_door.png'))
        await pg.focus('#scene'); x0 = await ev('__dx.S.x'); await pg.keyboard.press('KeyE'); await ev('__dx.advance(0.2)')
        check('按 E：選取該教室並顯示資訊卡', await ev("__dx.S.selected&&__dx.S.selected.name") == '301' and await pg.is_visible('#info'))
        check('按 E 互動時不橫移', abs(await ev('__dx.S.x') - x0) < 0.05)
        # 互動：樓梯口（找一座 1F→2F 的梯間，在外框外 0.6 m 找可站的點）
        pos = await ev("""(()=>{const d=__dx,m=d.m;d.setDest(null);for(const s of m.STAIRS){ if(!(s.fl.includes(0)&&s.fl.includes(1))) continue;
          const cx=(s.X0+s.X1)/2, cz=(s.Z0+s.Z1)/2; for(const [x,z] of [[cx,s.Z0-0.6],[cx,s.Z1+0.6],[s.X0-0.6,cz],[s.X1+0.6,cz]]) if(d.world.standOk(x,z,0)) return [x,z]; } return null})()""")
        if pos:
            await ev(f"(()=>{{const d=__dx;d.S.x={pos[0]};d.S.z={pos[1]};d.S.y=0;d.S.yCam=0;d.advance(0.4)}})()")
            h = await pg.inner_text('#hint') if await pg.is_visible('#hint') else ''
            check('樓梯口：出現 E 提示（到 2F）', '到 2F' in h, h)
            await pg.keyboard.press('KeyE'); await ev('__dx.advance(0.3)')
            check('按 E：換到 2F', await ev('__dx.info().floor') == 1, await ev('__dx.info()'))
        else: check('樓梯口：找得到測試位置', False)
        # 沒有提示時 E 仍是橫移
        await ev(T + "d.setDest(null);d.teleportTo(t('運動場'));d.advance(0.4)")
        vis = await pg.is_visible('#hint'); x0, z0 = await ev('[__dx.S.x,__dx.S.z]')
        await pg.keyboard.down('KeyE'); await ev('__dx.advance(0.6)'); await pg.keyboard.up('KeyE'); x1, z1 = await ev('[__dx.S.x,__dx.S.z]')
        check('沒有提示時：E 仍是橫移', not vis and ((x1 - x0) ** 2 + (z1 - z0) ** 2) ** 0.5 > 0.3, f'hint={vis} 移動 {((x1 - x0) ** 2 + (z1 - z0) ** 2) ** 0.5:.2f} m')
        # 非任務：自動導覽抵達有介紹的地點也會跳卡
        await ev(T + "d.setDest(t('司令台'));d.teleportTo(t('穿堂'));d.setDest(t('司令台'));d.startRoute(true)")
        ok = False
        for _ in range(40):
            await ev('__dx.advance(1.0)')
            if await pg.is_visible('#tourcard'): ok = True; break
        check('非任務：自動導覽到「司令台」後跳出介紹卡（按鈕為關閉）', ok and await pg.inner_text('#tcnext') == '關閉', await pg.inner_text('#tctitle') if ok else '')
        check('無 pageerror', not errs, str(errs))
        await b.close()
    print('TOUR', 'FAIL ' + str(fails) if fails else 'PASS'); sys.exit(1 if fails else 0)
asyncio.run(main())
