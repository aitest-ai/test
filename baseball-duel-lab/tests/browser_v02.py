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
   # Confirm the actual rendered bat uses the very same endpoints as batPose during a swing.
   await page.evaluate("() => {window.__baseballLab.state.swingTime=.2;window.__baseballLab.state.swingCount=1}")
   await page.wait_for_timeout(800)
   pose=await page.evaluate("window.__baseballLab.getHealth().batPose")
   rendered=await page.evaluate("window.__baseballLab.getBatRenderEndpoints()")
   results["bat_mesh_error_swing"]=max(
    separation([pose["grip"][k] for k in ("x","y","z")],rendered["grip"]),
    separation([pose["tip"][k] for k in ("x","y","z")],rendered["tip"]))
   results["pose_debug"]={"grip":pose["grip"],"tip":pose["tip"],"rendered":rendered}
   await page.screenshot(path=str(OUT/"02_bat_swing.png"))
   # Search for a deterministic, truly physical contact in the offline physics module.
   candidate=await page.evaluate("""async () => {
     const mod=await import('./src/physics.js');
     for(let lead=.12;lead<=.34;lead+=.015)
     for(let x=-.7;x<=.6;x+=.15)
     for(let y=.7;y<=1.4;y+=.075){
       const p=mod.createPitch('fastball','rookie',()=>.5);let t=0;
       for(let i=0;i<240&&!p.crossing;i++){
         mod.stepPitch(p,mod.FIXED_DT);t+=mod.FIXED_DT;
         const u=(t-p.flightTime+lead)/.34;
         if(u>=0&&u<=1){
           const hit=mod.batContact(p,{x,y},u,Math.max(0,u-mod.FIXED_DT/.34),mod.FIXED_DT);
           if(hit)return {lead,x,y,exitKmh:hit.exitKmh};
         }
       }
     }
     return null;
   }""")
   results["physics_candidate"]=candidate
   if not candidate:raise RuntimeError("No physically possible baseball/bat contact")
   # Replay identical coordinates through the FULL gameplay loop.
   replay=await page.evaluate("""async candidate => {
     const lab=window.__baseballLab,mod=await import('./src/physics.js');
     const p=mod.createPitch('fastball','rookie',()=>.5);
     lab.state.phase='flight';lab.state.pitch=p;lab.state.swingCount=0;lab.state.swingTime=-1;
     lab.setAim(candidate.x,candidate.y);
     let n=0;
     while(p.elapsed<p.flightTime-candidate.lead && n<240){lab.debugAdvance(1);n++;}
     lab.swing();lab.debugAdvance(42);
     return {phase:lab.state.phase,hit:!!lab.state.batted,
       exitKmh:lab.state.batted?.exitKmh||null,elapsed:p.elapsed};
   }""",candidate)
   results["gameplay_replay"]=replay
   results["swing_has_real_contact"]=replay["hit"]
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
