import asyncio, json, os
from pathlib import Path
from playwright.async_api import async_playwright

URL=os.getenv('GAME_URL','http://127.0.0.1:8765/')
OUT=Path('qa-output');OUT.mkdir(exist_ok=True)
async def main():
    checks={};errors=[]
    async with async_playwright() as p:
        browser=await p.chromium.launch(headless=True,args=['--no-sandbox','--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--disable-dev-shm-usage'])
        page=await browser.new_page(viewport={'width':1500,'height':950},device_scale_factor=1)
        page.on('pageerror',lambda e: errors.append(str(e)))
        page.on('console',lambda m: errors.append('console: '+m.text) if m.type=='error' else None)
        resp=await page.goto(URL+('?qa=1' if '?' not in URL else '&qa=1'),wait_until='domcontentloaded',timeout=60000)
        checks['http']=resp.status if resp else None
        try:
            await page.wait_for_function("window.__baseballLab && window.__baseballLab.getHealth().renderer && document.querySelector('#loading').hidden",timeout=50000)
            await page.wait_for_timeout(1200)
            checks['initial_health']=await page.evaluate('window.__baseballLab.getHealth()')
            await page.screenshot(path=str(OUT/'01_field.png'))
            await page.locator('#pitch-button').click()
            await page.evaluate('window.__baseballLab.debugAdvance(125)')
            await page.wait_for_function("window.__baseballLab.state.phase === 'flight'",timeout=15000)
            await page.screenshot(path=str(OUT/'02_incoming_pitch.png'))
            # Correct placement and swing before contact plane to exercise the contact pipeline.
            await page.evaluate("() => {for(let i=0;i<300;i++){if(window.__baseballLab.state.pitch.pos.z>5.2) break;window.__baseballLab.debugAdvance(1)} }")
            await page.evaluate("window.__baseballLab.setAim(window.__baseballLab.state.pitch.pos.x, window.__baseballLab.state.pitch.pos.y)")
            await page.keyboard.press('Space')
            await page.evaluate('window.__baseballLab.debugAdvance(23)')
            await page.wait_for_function("window.__baseballLab.state.phase === 'batted' || window.__baseballLab.state.phase === 'result'",timeout=10000)
            checks['swing_phase']=await page.evaluate('window.__baseballLab.state.phase')
            checks['swing_count']=await page.evaluate('window.__baseballLab.state.swingCount')
            await page.screenshot(path=str(OUT/'03_swing.png'))
            await page.evaluate("() => {for(let i=0;i<1500 && window.__baseballLab.state.phase!=='result';i++)window.__baseballLab.debugAdvance(1)}")
            await page.wait_for_function("window.__baseballLab.state.phase === 'result'",timeout=15000)
            checks['call']=await page.locator('#call-head').inner_text()
            checks['stats']=await page.evaluate("({hits:window.__baseballLab.state.hits,runs:window.__baseballLab.state.runs,strikes:window.__baseballLab.state.strikes})")
            await page.screenshot(path=str(OUT/'04_result.png'))
            await page.locator('.pitch[data-type="curve"]').click()
            await page.locator('.diff[data-difficulty="pro"]').click()
            checks['selection']=await page.evaluate("({type:window.__baseballLab.state.pitchType,difficulty:window.__baseballLab.state.difficulty})")
            await page.set_viewport_size({'width':390,'height':844})
            await page.wait_for_timeout(1100)
            checks['mobile_swing_visible']=await page.locator('#mobile-swing').is_visible()
            await page.screenshot(path=str(OUT/'05_mobile.png'))
        except Exception as e:
            checks['test_error']=str(e)[:1200]
            try:await page.screenshot(path=str(OUT/'error.png'))
            except Exception:pass
        checks['errors']=errors
        checks['passed']=(checks['http']==200 and checks.get('initial_health',{}).get('renderer') is True
          and checks.get('swing_count')==1 and checks.get('selection')=={'type':'curve','difficulty':'pro'}
          and checks.get('mobile_swing_visible') is True and not errors and 'test_error' not in checks)
        (OUT/'results.json').write_text(json.dumps(checks,ensure_ascii=False,indent=2),encoding='utf-8')
        print(json.dumps(checks,ensure_ascii=False,indent=2))
        await browser.close()
        if not checks['passed']:raise RuntimeError('Browser test failed; see qa-output/results.json')
if __name__=='__main__':asyncio.run(main())
