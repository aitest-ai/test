import asyncio, json, threading, http.server, socketserver, functools, os, math
from playwright.async_api import async_playwright
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a): pass
srv=socketserver.TCPServer(('127.0.0.1',0),functools.partial(Q,directory=os.path.join(ROOT,'dist'))); PORT=srv.server_address[1]
threading.Thread(target=srv.serve_forever,daemon=True).start()
SH=os.path.join(ROOT,'shots'); os.makedirs(SH,exist_ok=True)
log={'console':[],'pageerrors':[],'checks':[]}
def chk(name,ok,detail=''):
    log['checks'].append({'name':name,'ok':bool(ok),'detail':str(detail)}); print(('PASS ' if ok else 'FAIL ')+name, detail)
T="const d=__dx;const t=n=>d.TARGETS.find(x=>x.name===n);"
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(args=['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--no-sandbox'])
        ctx=await b.new_context(viewport={'width':1280,'height':760}); pg=await ctx.new_page()
        pg.on('console',lambda m: log['console'].append(f'{m.type}: {m.text}') if m.type in('error','warning') else None)
        pg.on('pageerror',lambda e: log['pageerrors'].append(str(e)))
        pg.on('requestfailed',lambda r: log['console'].append('requestfailed: '+r.url))
        await pg.goto(f'http://127.0.0.1:{PORT}/dongxin.html'); await pg.wait_for_function('window.__dx',timeout=40000)
        chk('help 首次顯示',await pg.is_visible('#help'))
        await pg.click('#helpclose')
        async def shot(n): await pg.screenshot(path=f'{SH}/dx_{n}.png')
        async def ev(js): return await pg.evaluate(js)
        chk('WebGL 可用',await ev('!!document.createElement("canvas").getContext("webgl")'))
        n=await ev('__dx.TARGETS.length'); chk('載入東新資料：房間+地點數',n>=80,n)
        await ev('__dx.advance(0.5)'); await shot('01_spawn_gate')
        i=await ev('__dx.info()'); chk('出生在校門 (1F, y=0)',i['floor']==0 and abs(i['y'])<1e-6,i)
        # 鍵盤 W：走向鐘塔
        await pg.focus('#scene'); await pg.keyboard.down('KeyW')
        for _ in range(8): await pg.wait_for_timeout(200); await ev('__dx.advance(0.5)')
        await pg.keyboard.up('KeyW'); i0=await ev('__dx.info()'); chk('鍵盤 W 可前進',math.hypot(i0['x']-94.2,i0['z']-80.9)>3,i0)
        # 撞牆：2F 站在 301 門外面向教室，按住 W 直走穿過門撞到教室後牆；再轉身走向走廊外緣（欄杆邊）
        await ev(T+"d.teleportTo(t('301'));d.advance(0.3)")
        await pg.keyboard.down('KeyW')
        for _ in range(14): await pg.wait_for_timeout(100); await ev('__dx.advance(0.5)')
        await pg.keyboard.up('KeyW'); i1=await ev('__dx.info()'); hit=await ev('(()=>{const d=__dx;return !!d.world.hit(d.S.x,d.S.z,d.S.y,0.29)})()')
        rm=await ev("(()=>{const d=__dx,r=d.m.ROOMS.find(r=>r.name==='301');return [d.S.x>r.X0&&d.S.x<r.X1&&d.S.z>r.Z0&&d.S.z<r.Z1, r.X0,r.X1,r.Z0,r.Z1]})()")
        chk('2F：按住 W 走進教室直到撞後牆：停在室內、不穿牆、高度不變',(not hit) and rm[0] and abs(i1['y']-3.9)<1e-6,[i1,rm]); await shot('02_wall_classroom')
        await ev(T+"d.teleportTo(t('301'));d.S.yaw=d.S.heading+Math.PI;d.advance(0.3)")
        await pg.keyboard.down('KeyW')
        for _ in range(14): await pg.wait_for_timeout(100); await ev('__dx.advance(0.5)')
        await pg.keyboard.up('KeyW'); i2=await ev('__dx.info()'); hit2=await ev('(()=>{const d=__dx;return !!d.world.hit(d.S.x,d.S.z,d.S.y,0.29)})()')
        chk('2F：按住 W 走向走廊外緣：停在欄杆邊、不墜落、不穿牆',(not hit2) and abs(i2['y']-3.9)<1e-6,i2); await shot('02_wall_rail')
        # 導航：校門 → 301（2F，走樓梯）
        await ev(T+"d.teleportTo(t('校門'));d.setDest(t('301'));d.startRoute(true)")
        for k,sec in enumerate([6,6,6,6,6,6,4]):
            await ev(f'__dx.advance({sec})'); await shot(f'03_nav_301_{k}')
            if (await ev('__dx.info()'))['done'] is None: break
        r=await ev(T+"[d.S.x-t('301').x,d.S.z-t('301').z,d.S.y-d.m.LY(t('301').f)]")
        chk('自動導航：校門→301（2F，經樓梯）到達',math.hypot(r[0],r[1])<0.6 and abs(r[2])<0.05,r); await shot('04_arrived_301')
        # 導航：→ B1 地下停車場
        await ev(T+"d.setDest(t('地下停車場'));d.startRoute(true)")
        for k in range(8):
            await ev('__dx.advance(6)')
            if (await ev('__dx.info()'))['done'] is None: break
        r=await ev(T+"[d.S.x-t('地下停車場').x,d.S.z-t('地下停車場').z,d.S.y]")
        chk('自動導航：→ B1 地下停車場到達',math.hypot(r[0],r[1])<0.6 and abs(r[2]+3.9)<0.05,r); await shot('05_arrived_B1')
        # 樓層按鈕
        for k,lab in [(3,'4F'),(2,'3F'),(1,'2F'),(0,'1F'),(4,'B1')]:
            await pg.click(f'#floors button[data-k="{k}"]'); await ev('__dx.advance(0.6)'); i=await ev('__dx.info()')
            chk(f'樓層按鈕 {lab}',i['floor']==k and abs(i['y']-(-3.9 if k==4 else k*3.9))<0.01,i)
            if k in (3,4): await shot(f'06_floor_{lab}')
        # 手動爬樓梯：在 1F 梯口朝梯間內按住 W
        r=await ev("""(()=>{const d=__dx,m=d.m,s=m.STAIRS.find(s=>s.id==='S3');const yaw=s.along==='x'?s.sgn*Math.PI/2:(s.sgn>0?0:Math.PI);
          d.cancelRoute();d.S.x=s.ent.x;d.S.z=s.ent.z;d.S.y=m.LY(0);d.S.yaw=d.S.heading=yaw;d.setMode('third');return s.id})()""")
        await pg.keyboard.down('KeyW')
        for _ in range(10): await pg.wait_for_timeout(150); await ev('__dx.advance(0.4)')
        await pg.keyboard.up('KeyW'); i=await ev('__dx.info()'); chk('手動按 W 走上樓梯（一跑到平台）',i['y']>1.8,i); await shot('07_manual_stair')
        # 手動撞牆 + 轉彎：按 A 轉彎，鏡頭跟著轉
        yaw0=await ev('__dx.S.yaw'); await pg.keyboard.down('KeyA'); await ev('__dx.advance(0.6)'); await pg.keyboard.up('KeyA'); yaw1=await ev('__dx.S.yaw')
        chk('按 A 轉彎時視角（yaw）跟著轉',abs(yaw1-yaw0)>0.5,[yaw0,yaw1])
        # 模式與鳥瞰
        await ev(T+"d.teleportTo(t('早安廣場'))"); await pg.click('#modes button[data-m="first"]'); await ev('__dx.advance(0.3)'); await shot('08_first_person')
        await pg.click('#modes button[data-m="bird"]'); await ev('__dx.S.birdH=120;__dx.advance(0.3)'); await shot('09_bird_all')
        await pg.click('#floors button[data-k="1"]'); await ev('__dx.advance(0.3)'); await shot('10_bird_cut_2F')
        # 鳥瞰點選教室：點畫面中心附近應選到某房間或無；用 raycast 確認 API
        await pg.click('#floors button[data-k="all"]')
        await pg.click('#modes button[data-m="third"]')
        # 搜尋
        await pg.fill('#q','圖書'); await pg.wait_for_timeout(100); n=await ev('document.querySelectorAll("#list .item").length'); chk('搜尋「圖書」有結果',n>=1,n); await shot('11_search')
        await ev('document.querySelector("#list .item").click()'); chk('選取後顯示資訊卡',await pg.is_visible('#info'))
        await pg.click('#tp'); await ev('__dx.advance(1.2)'); await shot('12_teleport_lib')
        # 小地圖有內容
        px=await ev("""(()=>{const c=document.getElementById('mini'),g=c.getContext('2d'),d=g.getImageData(0,0,c.width,c.height).data;const s=new Set();for(let i=0;i<d.length;i+=40)s.add(d[i]+','+d[i+1]+','+d[i+2]);return s.size})()""")
        chk('小地圖有繪製內容',px>20,px)
        PV="(()=>{const r=document.querySelector('#panel').getBoundingClientRect();return r.right>0&&r.left<innerWidth})()"
        chk('桌機 1280px：清單預設顯示',await ev(PV))
        # 手機
        await pg.set_viewport_size({'width':390,'height':780}); await ev('__dx.advance(0.4)'); await shot('13_mobile')
        # 版面：桌機（1280）清單常駐；小視窗（< 1100 px）清單預設收合（第二輪 D）
        c2=await b.new_context(viewport={'width':1000,'height':700}); p2=await c2.new_page(); p2.on('pageerror',lambda e: log['pageerrors'].append(str(e)))
        await p2.goto(f'http://127.0.0.1:{PORT}/dongxin.html'); await p2.wait_for_function('window.__dx',timeout=40000); await p2.wait_for_timeout(400)
        chk('小視窗 1000px：清單預設收合',not await p2.evaluate(PV)); await c2.close()
        chk('無 pageerror',len(log['pageerrors'])==0,log['pageerrors'][:3])
        errs=[c for c in log['console'] if c.startswith('error') or c.startswith('requestfailed')]; chk('console 無 error／請求失敗',len(errs)==0,errs[:3])
        await b.close()
    json.dump(log,open(f'{SH}/dx_browser_log.json','w'),ensure_ascii=False,indent=1)
    print('FAILS:',[c['name'] for c in log['checks'] if not c['ok']])
asyncio.run(main())
