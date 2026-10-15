import asyncio, json, os, math
from pathlib import Path
from playwright.async_api import async_playwright
URL=os.getenv("GAME_URL","http://127.0.0.1:8765/")
OUT=Path("qa-output");OUT.mkdir(exist_ok=True)
def separation(a,b):
 return math.dist(a,b)
async def main():
 results={};errors=[]
 async with async_playwright() as p:
  browser=await p.chromium.launch(headless=True,args=["--no-sandbox","--enable-webgl","--use-gl=angle","--use-angle=swiftshader","--disable-dev-shm-usage"])
  page=await browser.new_page(viewport={"width":1500,"height":950})
  page.on("pageerror",lambda err: errors.append(str(err)))
  page.on("console",lambda m: errors.append("console: "+m.text) if m.type=="error" else None)
  response=await page.goto(URL+"?qa=1",wait_until="domcontentloaded",timeout=55000)
  results["http"]=response.status if response else None
  try:
   await page.wait_for_function("window.__baseballLab?.getHealth()?.renderer === true && document.querySelector('#loading').hidden",timeout=38000)
   await page.wait_for_timeout(900)
   pose=await page.evaluate("window.__baseballLab.getHealth().batPose")
   rendered=await page.evaluate("window.__baseballLab.getBatRenderEndpoints()")
   results["bat_mesh_error_at_rest"]=max(separation([pose["grip"][k] for k in ("x","y","z")],rendered["grip"]),separation([pose["tip"][k] for k in ("x","y","z")],rendered["tip"]))
   results["bat_length"]=separation(rendered["grip"],rendered["tip"])
   await page.screenshot(path=str(OUT/"01_bat_rest.png"))
   await page.locator("#pitch-button").click()
   await page.evaluate("window.__baseballLab.debugAdvance(112)")
   result=await page.evaluate("""async () => {
    const lab=window.__baseballLab, mod=await import('./src/physics.js');
    const p=mod.createPitch('fastball','rookie',()=>.5);
    lab.state.phase='flight';lab.state.pitch=p;lab.state.swingCount=0;lab.state.swingTime=-1;lab.state.aim={x:-.4,y:.95};
    let i=0;
    while (p.elapsed < p.flightTime-.18 && i<240) {lab.debugAdvance(1);i++;}
    lab.swing();lab.debugAdvance(28);
    return {phase:lab.state.phase,elapsed:p.elapsed,swingTime:lab.state.swingTime,
     impact:lab.state.batted?.impact,batPose:lab.getHealth().batPose,rendered:lab.getBatRenderEndpoints()};
   }""")
   # Run the next animation frame before comparing a physics state to rendered mesh transforms.\n   await page.wait_for_timeout(350)\n   result["rendered"]=await page.evaluate("window.__baseballLab.getBatRenderEndpoints()")\n   results["swing_phase"]=result["phase"]
   results["swing_time"]=result["swingTime"]
   results["swing_has_real_contact"]=bool(result["impact"])
   results["bat_mesh_error_swing"]=max(separation([result["batPose"]["grip"][k] for k in ("x","y","z")],result["rendered"]["grip"]),separation([result["batPose"]["tip"][k] for k in ("x","y","z")],result["rendered"]["tip"]))
   await page.wait_for_timeout(400)
   await page.screenshot(path=str(OUT/"02_bat_swing.png"))
   await page.evaluate("window.__baseballLab.debugAdvance(1900)")
   results["post_flight_phase"]=await page.evaluate("window.__baseballLab.state.phase")
   await page.wait_for_timeout(250)
   await page.screenshot(path=str(OUT/"03_flight_result.png"))
   await page.set_viewport_size({"width":390,"height":844})
   await page.wait_for_timeout(450)
   await page.screenshot(path=str(OUT/"04_mobile.png"))
   results["mobile_button"]=await page.locator("#mobile-swing").is_visible()
  except Exception as e:
   results["exception"]=str(e)[:1500]
   try:await page.screenshot(path=str(OUT/"error.png"))
   except:pass
  results["errors"]=errors
  results["passed"]=(results.get("http")==200
    and results.get("bat_mesh_error_at_rest",999)<.005
    and results.get("bat_mesh_error_swing",999)<.005
    and abs(results.get("bat_length",0)-.90)<.005
    and results.get("swing_has_real_contact")
    and results.get("mobile_button") and not errors and "exception" not in results)
  (OUT/"results.json").write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding="utf-8")
  print(json.dumps(results,ensure_ascii=False,indent=2))
  await browser.close()
  if not results["passed"]:raise RuntimeError("v0.2 browser checks failed")
if __name__=="__main__":asyncio.run(main())
