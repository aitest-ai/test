#!/usr/bin/env python3
"""Read-only REA plus controlled guest interaction on a public badminton app.

Only this tester's own actions and (if available) self-created private rooms.
Do not scrape chat, look at third-party private rooms, collect payload values,
download original binary assets, or impersonate a real player.
"""
import asyncio, datetime, json, os, re, urllib.parse
from pathlib import Path
from playwright.async_api import async_playwright

BASE="https://badmintonduel.com/"
CDP="http://127.0.0.1:9222"
OUT=Path("tennis-evidence")
OUT.mkdir(exist_ok=True)
EVENTS=[]
SOCKETS=[]
ERRORS=[]
RESOURCE_TYPES={}
STAGES=[]
REA_COMMANDS=[]
def out(name,obj):
    (OUT/name).write_text(json.dumps(obj,ensure_ascii=False,indent=2),encoding="utf-8")
def remove_query(url):
    try:
        p=urllib.parse.urlsplit(url)
        return urllib.parse.urlunsplit((p.scheme,p.netloc,p.path,"",""))
    except:return "[invalid URL]"
def redacted(text):
    # Room codes/invite URLs are intentionally never included in artifacts.
    return re.sub(r'(?i)(code|room|邀請碼|房間碼)\s*[:：#]?\s*[A-Z0-9]{4,12}',r'\1: [REDACTED]',text)
async def run_rea(*args,timeout=55):
    env=os.environ.copy()
    env["REA_BROWSER_OBSERVE_ENABLED"]="true"
    env["REA_BROWSER_ALLOWED_ORIGINS_JSON"]=json.dumps(["https://badmintonduel.com","https://www.badmintonduel.com"])
    env["REA_BROWSER_CDP_ENDPOINTS_JSON"]=json.dumps([CDP])
    try:
        process=await asyncio.create_subprocess_exec("rea",*args,stdout=asyncio.subprocess.PIPE,stderr=asyncio.subprocess.PIPE,env=env)
        stdout,stderr=await asyncio.wait_for(process.communicate(),timeout)
        item={"command":args[0],"status":process.returncode,"bytes":len(stdout),
              "stderr_sample":redacted(stderr.decode(errors="replace")[:320])}
        # For evidence privacy: no raw REA record, only operation IDs/counts, statuses.
        try:
            parsed=json.loads(stdout)
            def summary(p):
                if not isinstance(p,dict):return {}
                return {"operation":p.get("operation"),"evidence_id":p.get("evidence_id"),
                       "status":p.get("status"),"error":p.get("error") if isinstance(p.get("error"),str) else None}
            item["parsed_metadata"]=summary(parsed)
            if args[0]=="list-browser-targets":
                item["_transient"]=parsed
        except Exception:
            item["json_parse"]="unavailable"
        REA_COMMANDS.append({k:v for k,v in item.items() if k!="_transient"})
        return item
    except Exception as e:
        item={"command":args[0],"error":str(e)[:250]}
        REA_COMMANDS.append(item);return item
async def inspect(page,stage,screenshot=True,private=False):
    try:
        state=await page.evaluate("""() => {
          const visible = n => !!(n.getClientRects().length) && getComputedStyle(n).visibility !== 'hidden';
          const els=[...document.querySelectorAll('button,a,[role="button"],input,select')].filter(visible).slice(0,90);
          return {
           title:document.title,
           buttons:els.map(n=>({tag:n.tagName,role:n.getAttribute('role'),
              label:(n.innerText||n.getAttribute('aria-label')||n.getAttribute('title')||n.getAttribute('placeholder')||'').trim().slice(0,90),
              disabled:n.disabled||false})),
           canvases:[...document.querySelectorAll('canvas')].map(n=>({width:n.width,height:n.height})).slice(0,5),
           bodyText:(document.body?.innerText||'').slice(0,2200),
           url:location.origin+location.pathname,
           frameCount:performance.getEntriesByType('resource').length
          };
        }""")
        if private:
            state.pop("bodyText",None)
            state["buttons"]=[x for x in state["buttons"] if not re.search(r'code|token|邀請碼|房間碼',x["label"],re.I)]
        else:state["bodyText"]=redacted(state.pop("bodyText",""))
        state["stage"]=stage
        STAGES.append(state)
        if screenshot and not private:
            await page.screenshot(path=str(OUT/(stage+".png")),timeout=14000)
        return state
    except Exception as e:
        ERRORS.append({"stage":stage,"reason":str(e)[:320]})
        return {"stage":stage,"error":str(e)[:200]}
async def click(page,phrases,tag,delay=1100):
    for word in phrases:
        locator=page.get_by_role("button",name=re.compile(word,re.I))
        for idx in range(min(await locator.count(),12)):
            ob=locator.nth(idx)
            try:
                if await ob.is_visible() and await ob.is_enabled():
                    label=(await ob.inner_text())[:90]
                    await ob.click(timeout=3300)
                    await page.wait_for_timeout(delay)
                    EVENTS.append({"step":tag,"button":redacted(label),"status":"clicked"})
                    return True
            except Exception as e:
                ERRORS.append({"stage":tag,"reason":str(e)[:120]})
    EVENTS.append({"step":tag,"status":"button_unavailable","patterns":phrases})
    return False
def watch(page,owner):
    page.on("pageerror",lambda e:ERRORS.append({"stage":owner,"pageerror":str(e)[:280]}))
    page.on("websocket",lambda ws: register_ws(ws,owner))
    page.on("response",lambda r:RESOURCE_TYPES.__setitem__(r.request.resource_type,RESOURCE_TYPES.get(r.request.resource_type,0)+1))
def register_ws(ws,owner):
    item={"owner":owner,"url":remove_query(ws.url),"sent":0,"received":0}
    SOCKETS.append(item)
    ws.on("framesent",lambda frame:item.__setitem__("sent",item["sent"]+1))
    ws.on("framereceived",lambda frame:item.__setitem__("received",item["received"]+1))
async def open_start(page,tag):
    try:
        response=await page.goto(BASE,wait_until="domcontentloaded",timeout=47000)
        EVENTS.append({"step":tag,"http":response.status if response else None})
    except Exception as e:
        ERRORS.append({"stage":tag,"navigation":str(e)[:240]})
    await page.wait_for_timeout(3500)
    await inspect(page,tag+"_landing",screenshot=False)
    await click(page,[r"^Enter Now$",r"先進去",r"進入遊戲",r"進入"],tag+"_enter")
    await inspect(page,tag+"_entered",screenshot=False)
    await click(page,[r"Got It.*Play",r"知道了.*開打",r"知道了",r"開始體驗",r"略過"],tag+"_tutorial")
    await inspect(page,tag+"_menu")
async def offline(page,tag,doubles=False):
    # AI / offline only. The English UI uses "Play! vs AI · Singles..." at the root.
    selected=await click(page,[r"^Play!",r"對 AI 開打",r"單打.*AI",r"AI.*單打"],tag+"_open_ai",2300)
    await inspect(page,tag+"_setup",screenshot=False)
    if doubles:
        await click(page,[r"^Doubles$",r"雙打",r"2v2"],tag+"_doubles_toggle",1400)
    else:
        await click(page,[r"^Singles$",r"單打",r"1v1"],tag+"_singles_toggle",800)
    await inspect(page,tag+"_mode",screenshot=False)
    # May be already in play. Do not press an Online or matchmaking button.
    available=(await page.locator("body").inner_text())[:2500]
    if re.search(r"vs AI|單機|對 AI|Practice|AI Match|訓練",available,re.I):
        await click(page,[r"^Start Match",r"^Start Game",r"^Play Now",r"Play vs AI",r"開始比賽",r"開始遊戲",r"^Start$"],tag+"_start",2300)
    scene=await inspect(page,tag+"_court")
    for key in ["u","j","k","l"]:
        try:
            await page.keyboard.press(key)
            await page.wait_for_timeout(450)
        except:pass
    await inspect(page,tag+"_action")
    text=(await page.locator("body").inner_text())[:2500]
    return {"stage":tag,"requested_doubles":doubles,"canvas_count":len(scene.get("canvases",[])),
        "match_ui_signals":list({m.group(0) for m in re.finditer(r'\b(?:serve|rally|score|love|game point|match point)\b|比分|回合|發球',text,re.I)})[:12],
        "progressed_to_match":"court" if selected else "not_verified"}

async def private_room(first,second):
    # This is strictly private self-testing. Never join strangers' listings.
    await inspect(first,"room_creator_before",screenshot=False,private=True)
    clicked=await click(first,[r"^Online",r"線上對戰",r"線上房間",r"和朋友",r"自訂房間"],"room_online",1500)
    await inspect(first,"room_creator_mode",screenshot=False,private=True)
    available=(await first.locator("body").inner_text())[:2500]
    if not clicked and not re.search(r'建立房間|私人房間|邀請碼|Create Room|Private Room|Invite|Room Code',available,re.I):
        return {"status":"blocked","reason":"No private-room entry found, no public matchmaking performed"}
    # Requires positive evidence this is a private/invite flow.
    if not re.search(r'私人|邀請|建立房間|開房|好友房|Create Room|Private Room|Invite',available,re.I):
        return {"status":"blocked","reason":"Cannot verify private-room flow safely"}
    created=await click(first,[r"^Create Room",r"^Host Room",r"^Private Room",r"建立私人房",r"建立房間",r"開房"],"room_create",2200)
    if not created:return {"status":"blocked","reason":"Private room creation control unavailable"}
    await inspect(first,"room_creator_created",screenshot=False,private=True)
    raw=(await first.locator("body").inner_text())[:2400]
    # Recover only the tester's own invite code IN MEMORY. Never write it to disk.
    hit=re.search(r'(?:房間碼|邀請碼|房間代碼|Room Code|code)\s*[:：]?\s*([A-Z0-9]{4,10})',raw,re.I)
    if not hit:
        return {"status":"partial","reason":"Room created but own code not detected","sockets":len(SOCKETS)}
    code=hit.group(1)
    await open_start(second,"guest_B")
    await click(second,[r"^Online",r"^Join Room",r"線上對戰",r"加入房間",r"和朋友"],"guest_B_online",1000)
    await inspect(second,"guest_B_join_ui",screenshot=False,private=True)
    fields=second.locator("input")
    joined=False
    for idx in range(min(await fields.count(),8)):
        fld=fields.nth(idx)
        try:
            if await fld.is_visible():
                ph=(await fld.get_attribute("placeholder") or "")
                if re.search(r'房間|代碼|邀請|code|room',ph,re.I) or await fields.count()==1:
                    await fld.fill(code)
                    joined=await click(second,[r"^Join Room",r"^Join",r"加入房間",r"加入",r"確認"],"guest_B_join",2200)
                    break
        except Exception as e:ERRORS.append({"stage":"guest_B_join","reason":str(e)[:180]})
    await inspect(first,"room_creator_peer_joined",screenshot=False,private=True)
    await inspect(second,"guest_B_joined",screenshot=False,private=True)
    return {"status":"two_clients_attempted" if joined else "partial",
            "own_room_created":True,"second_client_clicked_join":joined,
            "notes":"Private code stored only transiently; websocket frame payloads intentionally excluded"}
async def main():
    started=datetime.datetime.now(datetime.timezone.utc).isoformat()
    async with async_playwright() as p:
        binary=p.chromium.executable_path
        process=await asyncio.create_subprocess_exec(binary,"--headless=new","--no-sandbox",
            "--disable-dev-shm-usage","--remote-debugging-address=127.0.0.1",
            "--remote-debugging-port=9222",
            "--user-data-dir=/tmp/rea-tennis-"+str(os.getpid()),"--enable-webgl",
            "--use-gl=angle","--use-angle=swiftshader",BASE,
            stdout=asyncio.subprocess.DEVNULL,stderr=asyncio.subprocess.DEVNULL)
        browser=None
        try:
            for i in range(45):
                try:browser=await p.chromium.connect_over_cdp(CDP,timeout=1800);break
                except Exception:await asyncio.sleep(.5)
            if not browser:raise RuntimeError("Cannot connect to Chromium CDP")
            context=browser.contexts[0]
            page=context.pages[0] if context.pages else await context.new_page()
            watch(page,"primary")
            # Bind REA to the actual active page; no stale target IDs.
            await open_start(page,"single")
            ids=await run_rea("list-browser-targets",CDP,"--json",timeout=35)
            target=None
            raw=ids.get("_transient",{})
            def find_target(v):
                if isinstance(v,dict):
                    if "badmintonduel.com" in str(v.get("url","")):
                        for key in ("id","target_id","targetId"):
                            if isinstance(v.get(key),str):return v[key]
                    for y in v.values():
                        ans=find_target(y)
                        if ans:return ans
                if isinstance(v,list):
                    for y in v:
                        ans=find_target(y)
                        if ans:return ans
                return None
            target=find_target(raw)
            if target:
                # Full diagnostic Evidence stays in REA, not republished here.
                await run_rea("inspect-web-page",CDP,target,"--observation-ms","1500","--json",timeout=55)
                await run_rea("analyze-web-bundle",CDP,target,"--json",timeout=75)
            else:ERRORS.append({"stage":"rea","reason":"target_not_found"})
            result_single=await offline(page,"single",False)
            # New isolated browser context prevents inherited local selections.
            double_context=await browser.new_context(viewport={"width":1360,"height":840})
            dp=await double_context.new_page();watch(dp,"doubles")
            await open_start(dp,"doubles")
            result_doubles=await offline(dp,"doubles",True)
            # Use new isolated contexts for BOTH our own private test peers.
            creator_context=await browser.new_context(viewport={"width":1200,"height":750})
            guest_context=await browser.new_context(viewport={"width":1200,"height":750})
            creator=await creator_context.new_page();guest=await guest_context.new_page()
            watch(creator,"private_A");watch(guest,"private_B")
            await open_start(creator,"private_A")
            try:result_private=await private_room(creator,guest)
            except Exception as e:
                result_private={"status":"error","reason":str(e)[:250]}
            await page.wait_for_timeout(1600)
            await browser.close()
            report={"started_utc":started,"site":BASE,"scope":"self-operated guest sessions only",
                "rea_target_found":bool(target),"rea_operations":REA_COMMANDS,
                "offline_single":result_single,"offline_double":result_doubles,
                "private_two_peer":result_private,
                "websockets":SOCKETS,"response_resource_types":RESOURCE_TYPES,
                "stages":len(STAGES),"errors":len(ERRORS),
                "limitations":["No private server code or protocol payload capture",
                     "A button click is not proof of completed rally, doubles match or network sync",
                     "Original artwork, source code and model binaries are not saved"],
                "status":"observed_with_limitations"}
            out("summary.json",report)
            out("ui_stages.json",STAGES)
            out("actions.json",EVENTS)
            out("issues.json",ERRORS)
            print(json.dumps(report,ensure_ascii=False,indent=2))
        finally:
            try:
                process.terminate();await asyncio.wait_for(process.wait(),timeout=5)
            except:process.kill()
if __name__=="__main__":asyncio.run(main())
