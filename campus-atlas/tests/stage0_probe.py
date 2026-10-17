import asyncio,json,sys
from pathlib import Path
from playwright.async_api import async_playwright
OUT=Path(sys.argv[1]); OUT.mkdir(parents=True,exist_ok=True)
EXE="/home/ntue/.cache/ms-playwright/chromium-1217/chrome-linux/chrome"
FPS_JS="""()=>new Promise(r=>{let n=0;const t0=performance.now();function f(){n++;if(performance.now()-t0<5000)requestAnimationFrame(f);else r(n*1000/(performance.now()-t0))}requestAnimationFrame(f)})"""
async def run(p,label,args):
  res={"label":label,"errors":[]}
  try: b=await p.chromium.launch(headless=True,args=args)
  except Exception: b=await p.chromium.launch(headless=True,args=args,executable_path=EXE)
  pg=await b.new_page(viewport={"width":1440,"height":900})
  pg.on("pageerror",lambda e:res["errors"].append("pageerror: "+str(e)[:300]))
  pg.on("console",lambda m:res["errors"].append("console.error: "+m.text[:300]) if m.type=="error" else None)
  await pg.goto("http://127.0.0.1:8765/",wait_until="domcontentloaded",timeout=60000)
  try:
    await pg.wait_for_function("window.__campus && window.__campus.getHealth().rendered>0",timeout=40000)
    res["health"]=await pg.evaluate("window.__campus.getHealth()")
  except Exception as e: res["errors"].append("init timeout: "+str(e)[:200])
  res["renderer"]=await pg.evaluate("""()=>{const c=document.createElement('canvas').getContext('webgl');if(!c)return null;const d=c.getExtension('WEBGL_debug_renderer_info');return d?c.getParameter(d.UNMASKED_RENDERER_WEBGL):c.getParameter(c.RENDERER)}""")
  await pg.screenshot(path=str(OUT/f"stage0_{label}_welcome.png"))
  try:
    await pg.locator("#start-overview").click(timeout=5000); await pg.wait_for_timeout(1500)
  except Exception as e: res["errors"].append("start-overview: "+str(e)[:120])
  res["fps_overview"]=round(await pg.evaluate(FPS_JS),1)
  await pg.screenshot(path=str(OUT/f"stage0_{label}_overview.png"))
  try:
    await pg.locator("#mode-walk").click(timeout=5000); await pg.wait_for_timeout(800)
    await pg.keyboard.down("w"); res["fps_walk"]=round(await pg.evaluate(FPS_JS),1); await pg.keyboard.up("w")
    await pg.screenshot(path=str(OUT/f"stage0_{label}_walk.png"))
  except Exception as e: res["errors"].append("walk: "+str(e)[:120])
  await b.close(); return res
async def main():
  async with async_playwright() as p:
    out=[await run(p,"gpu",["--no-sandbox","--enable-gpu","--ignore-gpu-blocklist","--use-angle=gl","--enable-unsafe-swiftshader"]),
         await run(p,"swiftshader",["--no-sandbox","--use-angle=swiftshader","--enable-unsafe-swiftshader"])]
  print(json.dumps(out,ensure_ascii=False,indent=1))
asyncio.run(main())
