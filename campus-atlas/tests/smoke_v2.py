import asyncio,json,os
from pathlib import Path
from playwright.async_api import async_playwright

URL="http://127.0.0.1:8765/"
OUT=Path("qa-output")
OUT.mkdir(exist_ok=True)
async def main():
 issues=[];checks={}
 async with async_playwright() as p:
  browser=await p.chromium.launch(headless=True,args=["--no-sandbox","--enable-webgl","--use-gl=angle","--use-angle=swiftshader","--disable-dev-shm-usage"])
  page=await browser.new_page(viewport={"width":1440,"height":900},device_scale_factor=1)
  page.on("pageerror",lambda x:issues.append({"type":"pageerror","message":str(x)[:600]}))
  page.on("console",lambda x:issues.append({"type":"console","message":x.text[:300]}) if x.type=="error" else None)
  resp=await page.goto(URL,wait_until="domcontentloaded",timeout=55000)
  checks["http_status"]=resp.status if resp else None
  try:
   await page.wait_for_function("window.__campus && window.__campus.getHealth().rendered > 0",timeout=38000)
   checks["health"]=await page.evaluate("window.__campus.getHealth()")
   checks["webgl"]=await page.evaluate("!!document.querySelector('#scene canvas')")
   checks["reference_facades"]=checks["health"].get("photoFacades",0)
   await page.screenshot(path=str(OUT/"00_welcome.png"),timeout=15000)
   await page.locator("#start-overview").click()
   await page.wait_for_timeout(1300)
   await page.screenshot(path=str(OUT/"01_overview.png"),timeout=15000)
   await page.locator(".building-item").first.click()
   await page.wait_for_timeout(1400)
   checks["building_selected"]=await page.locator("#selection-card").is_visible()
   checks["floor_buttons"]=await page.locator("#floor-switcher .floor-btn").count()
   await page.locator("#floor-switcher .floor-btn").nth(2).click()
   await page.wait_for_timeout(850)
   checks["floor_active"]=await page.locator("#floor-switcher .floor-btn.active").inner_text()
   checks["sliced_roofs_hidden"]=await page.evaluate("window.__campus.getHealth().roofsHidden")
   await page.screenshot(path=str(OUT/"02_floor_2.png"),timeout=15000)
   await page.locator("#mode-walk").click()
   before=await page.evaluate("({...window.__campus.state.player})")
   await page.keyboard.down("w")
   await page.wait_for_timeout(1800)
   await page.keyboard.up("w")
   await page.wait_for_timeout(250)
   after=await page.evaluate("({...window.__campus.state.player})")
   checks["walk_before"]=before;checks["walk_after"]=after
   checks["walk_distance"]=round(((after['x']-before['x'])**2+(after['z']-before['z'])**2)**.5,2)
   await page.screenshot(path=str(OUT/"03_walk.png"),timeout=15000)
   await page.locator("#mode-overview").click()
   await page.locator("#search").fill("資訊教室")
   await page.wait_for_timeout(450)
   checks["search_result_count"]=await page.locator("#room-list .room-item").count()
   await page.locator("#room-list .room-item").first.click()
   await page.wait_for_timeout(700)
   checks["selected_room"]=await page.locator("#selection-title").inner_text()
   await page.screenshot(path=str(OUT/"04_room_search.png"),timeout=15000)
   await page.locator("#go-to").click()
   await page.wait_for_timeout(350)
   checks["route_status"]=await page.locator("#route-status").inner_text()
   await page.screenshot(path=str(OUT/"05_navigation.png"),timeout=15000)
  except Exception as e:
   checks["qa_exception"]=str(e)[:1000]
   try:await page.screenshot(path=str(OUT/"error_state.png"),timeout=10000)
   except:pass
  checks["title"]=await page.title()
  checks["page_errors"]=issues
  checks["passed"]=(checks.get("http_status")==200 and checks.get("webgl") is True and
    checks.get("building_selected") is True and checks.get("reference_facades")==1 and checks.get("selected_room")=="資訊教室" and
    checks.get("floor_active")=="2F" and checks.get("sliced_roofs_hidden")==1 and checks.get("walk_distance",0)>.15 and
    checks.get("page_errors")==[])
  if checks["passed"]:
   await page.set_viewport_size({"width":390,"height":844})
   await page.locator("#mode-overview").click()
   await page.wait_for_timeout(900)
   await page.screenshot(path=str(OUT/"06_mobile.png"),timeout=15000)
  (OUT/"results.json").write_text(json.dumps(checks,ensure_ascii=False,indent=2),encoding="utf-8")
  print(json.dumps(checks,ensure_ascii=False,indent=2))
  await browser.close()
  if not checks.get("passed"):raise RuntimeError("Campus Atlas smoke test failed; check qa-output/results.json")
if __name__=="__main__":asyncio.run(main())
