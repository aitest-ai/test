#!/usr/bin/env python3
"""Read-only browser inspection; do not capture credentials or copy binary assets."""
import asyncio, datetime, hashlib, json, struct
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit
from playwright.async_api import async_playwright

OUT = Path("inspection-output")
OUT.mkdir(exist_ok=True)
BASE = "https://3dtypsmap.vercel.app/"
PAGES = [BASE, BASE + "?to=24", BASE + "?to=p-court2"]
PATTERNS = {
 "Three.js": ["three.module", "three/examples", "WebGLRenderer", "GLTFLoader", "OrbitControls", "THREE."],
 "React Three Fiber": ["@react-three/fiber", "react-three-fiber"],
 "Babylon.js": ["babylonjs", "BABYLON.", "ArcRotateCamera"],
 "Unity WebGL": ["createUnityInstance", "UnityLoader"],
 "PlayCanvas": ["playcanvas", "pc.Application"],
 "A-Frame": ["aframe", "a-scene"],
 "Rapier": ["@dimforge/rapier", "rapier3d"],
 "Cannon": ["cannon-es", "CANNON.World"],
 "Ammo": ["ammo.js", "Ammo.bt"],
 "GLTF": ["GLTFLoader", "DRACOLoader", "KTX2Loader", ".glb", ".gltf"],
 "Navigation": ["Pathfinding", "navmesh", "recast-navigation"],
}
def sanitized(value):
 p=urlsplit(value)
 query="&".join(q for q in p.query.split("&") if q.startswith("to="))
 return urlunsplit((p.scheme,p.netloc,p.path,query,""))
def model_info(data, path):
 try:
  if path.endswith(".glb") and data[:4]==b"glTF":
   offset=12
   obj=None
   while offset+8<=len(data):
    n,t=struct.unpack_from("<II",data,offset)
    offset+=8
    if t==0x4E4F534A:
     obj=json.loads(data[offset:offset+n].decode("utf-8"));break
    offset+=n
  elif path.endswith(".gltf"):obj=json.loads(data.decode("utf-8"))
  else:obj=None
  if obj is None:return {"note":"No JSON chunk"}
  return {"generator":obj.get("asset",{}).get("generator"),
   "nodes":len(obj.get("nodes",[])),"meshes":len(obj.get("meshes",[])),
   "materials":len(obj.get("materials",[])),"textures":len(obj.get("textures",[])),
   "animations":len(obj.get("animations",[])),
   "extensions":obj.get("extensionsUsed",[]),
   "node_names":[x.get("name","") for x in obj.get("nodes",[])[:40]],
   "mesh_names":[x.get("name","") for x in obj.get("meshes",[])[:40]]}
 except Exception as ex:return {"parse_error":str(ex)[:140]}
async def main():
 network,models,scripts,pages,errors=[],[],[],[],[]
 tasks=[];seen=set()
 async with async_playwright() as p:
  browser=await p.chromium.launch(headless=True,args=["--disable-dev-shm-usage","--enable-webgl","--use-gl=angle","--use-angle=swiftshader"])
  ctx=await browser.new_context(viewport={"width":1440,"height":900})
  async def observe(r):
   if (r.url,r.status) in seen or len(network)>=1800:return
   seen.add((r.url,r.status))
   typ=r.request.resource_type
   mime=r.headers.get("content-type","")
   url=sanitized(r.url)
   item={"url":url,"status":r.status,"resource_type":typ,"content_type":mime}
   network.append(item)
   path=urlsplit(r.url).path.lower()
   model=path.endswith((".glb",".gltf"))
   js=path.endswith((".js",".mjs")) or "javascript" in mime
   if r.status>=400 or not (model or js):return
   try:data=await r.body()
   except Exception as ex:item["body_error"]=str(ex)[:120];return
   item["size_bytes"]=len(data);item["sha256"]=hashlib.sha256(data).hexdigest()
   if model:
    detail={"url":url,"size_bytes":len(data),"sha256":item["sha256"]}
    if len(data)<35000000:detail.update(model_info(data,path))
    models.append(detail)
   elif js and len(data)<3000000:
    source=data.decode("utf-8",errors="replace").lower()
    hit={k:[x for x in a if x.lower() in source] for k,a in PATTERNS.items()}
    scripts.append({"url":url,"size_bytes":len(data),"sha256":item["sha256"],
      "signatures":{k:v for k,v in hit.items() if v}})
  for i,target in enumerate(PAGES):
   page=await ctx.new_page()
   page.on("response",lambda r:tasks.append(asyncio.create_task(observe(r))))
   page.on("pageerror",lambda e:errors.append({"page":i,"error":str(e)[:300]}))
   report={"url":target}
   try:
    rsp=await page.goto(target,wait_until="domcontentloaded",timeout=55000)
    report["status"]=rsp.status if rsp else None
    await page.wait_for_timeout(10000)
    report.update(await page.evaluate("""() => {
      let gl={available:false};
      try{let g=document.createElement('canvas').getContext('webgl2')||
      document.createElement('canvas').getContext('webgl');
      gl={available:!!g,vendor:g?.getParameter(g.VENDOR),renderer:g?.getParameter(g.RENDERER)};}
      catch(e){gl.error=String(e)}
      return {title:document.title,final_url:location.href,
      canvas_count:document.querySelectorAll('canvas').length,webgl:gl,
      script_urls:[...document.querySelectorAll('script[src]')].map(s=>s.src),
      performance_resource_count:performance.getEntriesByType('resource').length,
      inline_script_analysis:(()=>{
        const blocks=[...document.querySelectorAll('script:not([src])')].map(s=>s.textContent||'');
        const code=blocks.join('\\n');
        const terms=['new THREE.BoxGeometry','new THREE.PlaneGeometry','new THREE.CylinderGeometry',
          'new THREE.ExtrudeGeometry','new THREE.BufferGeometry','new THREE.Mesh',
          'new THREE.InstancedMesh','THREE.CanvasTexture','THREE.Raycaster',
          'new THREE.Group','new THREE.Shape','computeBoundingBox','collision',
          'navmesh','findPath','shortestPath','pathfinding','createBuilding',
          'buildBuilding','buildCampus','createCampus','rooms.json','Firestore',
          'stair','corridor','wall','floor','roof','GLTFLoader'];
        const occurrence=Object.fromEntries(terms.map(t=>[t,code.split(t).length-1]));
        const fn=[...code.matchAll(/function\s+([A-Za-z_$][\w$]*)\s*\(/g)]
            .map(x=>x[1]).slice(0,100);
        const geo=[...code.matchAll(/new\s+THREE\.([A-Za-z]+Geometry)/g)]
            .map(x=>x[1]);
        return {block_count:blocks.length,chars:code.length,
          block_lengths:blocks.map(x=>x.length).slice(0,30),
          occurrence,geometry_constructor_counts:Object.fromEntries(
            [...new Set(geo)].map(x=>[x,geo.filter(y=>y===x).length])),
          sample_named_functions:fn};
      })(),
      visible_text:document.body?.innerText?.slice(0,700)||''};
    }"""))
    await page.screenshot(path=str(OUT/("page_"+str(i)+".png")),timeout=25000)
    if i==0:
     for key in ["w","ArrowRight","w"]:
      await page.keyboard.down(key);await page.wait_for_timeout(850);await page.keyboard.up(key)
     await page.wait_for_timeout(2000)
     await page.screenshot(path=str(OUT/"after_movement.png"),timeout=20000)
   except Exception as ex:report["error"]=str(ex)[:600]
   pages.append(report);await page.close()
  if tasks:await asyncio.gather(*tasks,return_exceptions=True)
  await browser.close()
 def save(name,obj):(OUT/name).write_text(json.dumps(obj,ensure_ascii=False,indent=2),encoding="utf-8")
 save("network.json",network);save("scripts.json",scripts);save("models.json",models)
 save("pages.json",pages);save("errors.json",errors)
 summary={"target":BASE,"date_utc":datetime.datetime.now(datetime.timezone.utc).isoformat(),
  "pages":len(pages),"http_200":sum(x.get("status")==200 for x in pages),
  "network_records":len(network),"analyzed_js":len(scripts),"models":len(models),
  "engine_hints":{name:sum(name in s["signatures"] for s in scripts) for name in PATTERNS},
  "errors":len(errors),"note":"Only public metadata; no login sessions, unlicensed asset bundles, or backend code."}
 summary["dom_analyzed"]=sum("inline_script_analysis" in x for x in pages)
 save("summary.json",summary);print(json.dumps(summary,ensure_ascii=False,indent=2))
 if summary["dom_analyzed"] != len(PAGES):raise RuntimeError("Some DOM analyses failed; inspect pages.json")
if __name__=="__main__":asyncio.run(main())
