#!/usr/bin/env python3
"""Public, guest-only browser analysis of badmintonduel.com.
A separate Chromium process is shared with REA via loopback CDP.
No sign-in, game-room join, chat, or proprietary source redistribution.
"""
import asyncio, datetime, hashlib, json, os, re, shlex, subprocess, urllib.parse
from pathlib import Path
from playwright.async_api import async_playwright

BASE="https://badmintonduel.com/"
ENDPOINT="http://127.0.0.1:9222"
OUT=Path("study-output")
OUT.mkdir(exist_ok=True)
SIGNATURES={
"Three.js": ["three.min.js","WebGLRenderer","THREE.", "three.module.js"],
"React Three Fiber":["@react-three/fiber","react-three-fiber"],
"Babylon.js":["BABYLON.","babylonjs"],
"Unity WebGL":["createUnityInstance","UnityLoader","data.unityweb"],
"PlayCanvas":["pc.Application","playcanvas"],
"Godot Web":["godot","engine.startgame","godot.wasm"],
"WebGL":["getContext('webgl","getContext(\"webgl","webgl2"],
"WebGPU":["navigator.gpu"],
"Rapier":["rapier3d","rapier_wasm"],
"Cannon":["cannon-es","CANNON.World"],
"Ammo":["Ammo.bt","ammo.wasm"],
"Socket.IO":["socket.io","socket.io-client"],
"Colyseus":["colyseus"],
"Photon":["photonengine","loadbalancingclient"],
"Firebase":["firebase","firestore"],
"Supabase":["supabase"],
"WebSocket":["WebSocket(","new WebSocket","wss://"],
"WebRTC":["RTCPeerConnection"],
"GLTF":["GLTFLoader",".glb",".gltf"],
"Animation":["AnimationMixer","skinnedmesh","skeleton","mixamo"],
"Physics terms":["velocity","gravity","collision","spin","angularVelocity","trajectory"],
"Badminton terms":["shuttle","smash","racket","serve","swing","doubles"],
}
def scrub(url):
 try:
  u=urllib.parse.urlsplit(url)
  return urllib.parse.urlunsplit((u.scheme,u.netloc,u.path,"",""))
 except:return "[malformed URL]"
def write(name,content):
 (OUT/name).write_text(json.dumps(content,ensure_ascii=False,indent=2),encoding="utf-8")
async def command(*args,timeout=55,env=None):
 try:
  p=await asyncio.create_subprocess_exec(*args,stdout=asyncio.subprocess.PIPE,stderr=asyncio.subprocess.PIPE,env=env)
  stdout,stderr=await asyncio.wait_for(p.communicate(),timeout=timeout)
  return {"exit_code":p.returncode,"stdout":stdout.decode(errors="replace")[:5000000],"stderr":stderr.decode(errors="replace")[:25000]}
 except asyncio.TimeoutError:
  try:p.kill();await p.communicate()
  except:pass
  return {"error":"timeout","args":list(args),"seconds":timeout}
 except Exception as e:return {"error":str(e)[:300],"args":list(args)}

async def main():
 network=[];scripts=[];sockets=[];errors=[];responses=[]
 total_script_bytes=[0]
 started=datetime.datetime.now(datetime.timezone.utc).isoformat()
 env=os.environ.copy()
 env["REA_BROWSER_OBSERVE_ENABLED"]="true"
 env["REA_BROWSER_CDP_ENDPOINTS_JSON"]=json.dumps([ENDPOINT])
 env["REA_BROWSER_ALLOWED_ORIGINS_JSON"]=json.dumps(["https://badmintonduel.com","https://www.badmintonduel.com"])
 env["REA_BROWSER_ALLOWED_HOSTS_JSON"]=json.dumps(["badmintonduel.com","www.badmintonduel.com"])
 async with async_playwright() as p:
  binary=p.chromium.executable_path
  proc=await asyncio.create_subprocess_exec(
   binary,"--headless=new","--no-sandbox","--disable-dev-shm-usage",
   "--remote-debugging-port=9222","--remote-debugging-address=127.0.0.1",
   "--user-data-dir=/tmp/rea-badminton-"+str(os.getpid()),
   "--no-first-run","--no-default-browser-check","--disable-background-networking",
   "--enable-webgl","--use-gl=angle","--use-angle=swiftshader",
   "--window-size=1440,900",BASE,
   stdout=asyncio.subprocess.DEVNULL,stderr=asyncio.subprocess.DEVNULL)
  try:
   browser=None
   for _ in range(35):
    try:browser=await p.chromium.connect_over_cdp(ENDPOINT,timeout=1200);break
    except:await asyncio.sleep(.5)
   if not browser:
    write("failure.json",{"error":"CDP endpoint could not be reached"});return
   ctx=browser.contexts[0]
   page=ctx.pages[0] if ctx.pages else await ctx.new_page()
   page.on("pageerror",lambda e:errors.append({"type":"pageerror","message":str(e)[:350]}))
   page.on("console",lambda m:errors.append({"type":"console.error","message":m.text[:350]}) if m.type=="error" else None)
   def on_ws(ws):
    item={"url":scrub(ws.url),"sent_count":0,"received_count":0}
    sockets.append(item)
    ws.on("framesent",lambda payload:item.__setitem__("sent_count",item["sent_count"]+1))
    ws.on("framereceived",lambda payload:item.__setitem__("received_count",item["received_count"]+1))
   page.on("websocket",on_ws)
   async def on_resp(r):
    if len(network)>1500:return
    clean=scrub(r.url)
    typ=r.request.resource_type
    headers=r.headers
    entry={"url":clean,"status":r.status,"kind":typ,"mime":headers.get("content-type",""),"size":headers.get("content-length")}
    network.append(entry)
    path=urllib.parse.urlsplit(r.url).path.lower()
    isjs=path.endswith((".js",".mjs")) or "javascript" in entry["mime"]
    if not(isjs and r.ok):return
    try:
     content=await r.body()
     if len(content)>5000000 or total_script_bytes[0]+len(content)>35000000:return
     total_script_bytes[0]+=len(content)
     source=content.decode("utf-8",errors="replace")
     source_lower=source.lower()
     matches={k:[needle for needle in terms if needle.lower() in source_lower] for k,terms in SIGNATURES.items()}
     script={"url":clean,"size_bytes":len(content),"sha256":hashlib.sha256(content).hexdigest(),
       "markers":{k:v for k,v in matches.items() if v},
       "source_mapping_url_present": "sourceMappingURL=" in source}
     scripts.append(script)
    except Exception as ex: entry["body_error"]=str(ex)[:140]
   page.on("response",lambda r:responses.append(asyncio.create_task(on_resp(r))))
   try:
    response=await page.goto(BASE,wait_until="domcontentloaded",timeout=40000)
    http=response.status if response else None
    await page.wait_for_timeout(13500)
   except Exception as e:
    http=None;errors.append({"type":"navigate","message":str(e)[:350]})
   page_report={"requested_url":BASE,"http_status":http,"final_url":scrub(page.url)}
   try:
    page_report.update(await page.evaluate("""() => ({
      title: document.title,
      canvasCount: document.querySelectorAll('canvas').length,
      iframeCount: document.querySelectorAll('iframe').length,
      scriptCount: document.scripts.length,
      scripts:[...document.querySelectorAll('script[src]')].map(s=>s.src.replace(/[?#].*$/,'')),
      headings:[...document.querySelectorAll('h1,h2,h3')].slice(0,30).map(x=>x.innerText.slice(0,120)),
      buttonNames:[...document.querySelectorAll('button,[role=button]')].slice(0,50).map(x=>(x.innerText||x.getAttribute('aria-label')||'').slice(0,75)),
      bodyText:(document.body?.innerText||'').slice(0,5000),
      inlineScriptLengths:[...document.querySelectorAll('script:not([src])')].map(s=>s.textContent.length).slice(0,40),
      webgl2: (()=>{try{return !!document.createElement('canvas').getContext('webgl2')}catch{return false}})()
    })"""))
   except Exception as e:page_report["dom_error"]=str(e)[:200]
   try:await page.screenshot(path=str(OUT/"homepage.png"),timeout=16000)
   except Exception as e:errors.append({"type":"screenshot","message":str(e)[:180]})
   # Inspect guest-only UI states, without logging in or joining public rooms.
   page_report["offline_ui_stages"]=[]
   try:
    enter=page.get_by_role("button",name=re.compile("先進去"))
    if await enter.count() and await enter.first.is_visible():
     await enter.first.click(timeout=5000)
     await page.wait_for_timeout(3500)
     await page.screenshot(path=str(OUT/"main_menu.png"),timeout=18000)
     page_report["offline_ui_stages"].append({"stage":"menu","visible_text":(await page.locator("body").inner_text())[:3500]})
    # First-time tutorial is a modal that covers the offline start button.
    for close_word in ("知道了，開打！","知道了"):
     modal_button=page.get_by_role("button",name=re.compile(re.escape(close_word)))
     if await modal_button.count() and await modal_button.first.is_visible():
      await modal_button.first.click(timeout=5000)
      await page.wait_for_timeout(1500)
      await page.screenshot(path=str(OUT/"menu_after_tutorial.png"),timeout=17000)
      page_report["offline_ui_stages"].append({"stage":"tutorial_closed",
          "visible_text":(await page.locator("body").inner_text())[:2500]})
      break
    buttons=page.get_by_role("button",name=re.compile("開打"))
    for idx in range(min(await buttons.count(),8)):
     btn=buttons.nth(idx)
     if await btn.is_visible():
      label=await btn.inner_text()
      if "對 AI" in label:
       await btn.click(timeout=5000)
       await page.wait_for_timeout(5500)
       await page.screenshot(path=str(OUT/"offline_match_setup.png"),timeout=18000)
       page_report["offline_ui_stages"].append({"stage":"offline_start","clicked_button":label[:100],
           "visible_text":(await page.locator("body").inner_text())[:3500]})
       break
   except Exception as ex:
    page_report["offline_ui_error"]=str(ex)[:250]
   # Discover REA target IDs instead of assuming a Playwright target id.
   lst=await command("rea","list-browser-targets",ENDPOINT,"--json",timeout=42,env=env)
   write("rea_targets.json",lst)
   target=None
   try:
    payload=json.loads(lst.get("stdout",""))
    def crawl(x):
     if isinstance(x,dict):
      url=x.get("url","")
      if isinstance(url,str) and "badmintonduel.com" in url:
       for key in ("id","target_id","targetId"):
        if isinstance(x.get(key),str):return x[key]
      for y in x.values():
       z=crawl(y)
       if z:return z
     elif isinstance(x,list):
      for y in x:
       z=crawl(y)
       if z:return z
     return None
    target=crawl(payload)
   except Exception as e:errors.append({"type":"rea_target_parse","message":str(e)[:250]})
   if target:
    capture=await command("rea","inspect-web-page",ENDPOINT,target,"--observation-ms","3500","--json",timeout=85,env=env)
    write("rea_inspect.json",capture)
    bundle=await command("rea","analyze-web-bundle",ENDPOINT,target,"--json",timeout=85,env=env)
    write("rea_bundle.json",bundle)
   else:
    write("rea_inspect.json",{"error":"REA target not found","target_list_exit":lst.get("exit_code")})
   # Wait for public assets and report; no automatic match join, sign-in, or messaging.
   await page.wait_for_timeout(3500)
   if responses:await asyncio.gather(*responses,return_exceptions=True)
   write("pages.json",page_report)
   write("network.json",network)
   write("scripts.json",scripts)
   write("websocket_metadata.json",sockets)
   write("errors.json",errors)
   summary={"started_utc":started,"requested_url":BASE,"http_status":http,
     "final_url":scrub(page.url),"title":page_report.get("title"),
     "network_responses":len(network),"scripts_analyzed":len(scripts),
     "websocket_connections":len(sockets),"rea_target_found":bool(target),
     "rea_inspect_exit":capture.get("exit_code") if target else None,
     "rea_bundle_exit":bundle.get("exit_code") if target else None,
     "engine_hints":{k:sum(k in s["markers"] for s in scripts) for k in SIGNATURES},
     "canvas_count":page_report.get("canvasCount"),"page_errors":len(errors),
     "scope":"Public unauthenticated site, read-only REA observation plus Playwright navigation. No chat, account or game rooms."}
   write("summary.json",summary)
   print(json.dumps(summary,ensure_ascii=False,indent=2))
   await browser.close()
  finally:
   try:proc.terminate();await asyncio.wait_for(proc.wait(),timeout=4)
   except Exception:proc.kill()
if __name__=="__main__":asyncio.run(main())
