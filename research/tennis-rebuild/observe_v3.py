import asyncio, json, os, re, datetime, urllib.parse
from pathlib import Path
from playwright.async_api import async_playwright

OUT=Path("tennis-v3-evidence");OUT.mkdir(exist_ok=True)
SITE="https://badmintonduel.com/"
REPORT={"started":datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "scenes":[],"actions":[],"websocket":[],"errors":[],"rea":[],"limits":[]}
def save():
    (OUT/"report.json").write_text(json.dumps(REPORT,indent=2,ensure_ascii=False),encoding="utf-8")
def domain_path(u):
    try:
        p=urllib.parse.urlsplit(u)
        return urllib.parse.urlunsplit((p.scheme,p.netloc,p.path,"",""))
    except:return "[invalid]"
def log(page,who):
    page.on("pageerror",lambda e:REPORT["errors"].append({"page":who,"error":str(e)[:250]}))
    def socket(ws):
        data={"page":who,"host_path":domain_path(ws.url),"sent":0,"received":0}
        REPORT["websocket"].append(data)
        ws.on("framesent",lambda f:data.__setitem__("sent",data["sent"]+1))
        ws.on("framereceived",lambda f:data.__setitem__("received",data["received"]+1))
    page.on("websocket",socket)
async def snapshot(page,name,shot=False,private=False):
    try:
        d=await page.evaluate("""() => {
          const visible=n=>n.getClientRects().length>0 && getComputedStyle(n).visibility!=='hidden';
          const ctl=[...document.querySelectorAll('button,[role=button],input,select,label')].filter(visible);
          return {body:(document.body.innerText||'').slice(0,3000),
            elements:ctl.slice(0,90).map(n=>({tag:n.tagName,type:n.type||'',
              label:(n.innerText||n.getAttribute('aria-label')||n.getAttribute('placeholder')||'').trim().slice(0,100),
              disabled:!!n.disabled})),
            canvas:[...document.querySelectorAll('canvas')].map(n=>[n.width,n.height]),
            url:location.origin+location.pathname };
        }""")
        if private:
            d["body"]="[PRIVATE ROOM CONTENT REDACTED]"
            d["elements"]=[x for x in d["elements"] if not re.search("room|code|join|invite|房間|邀請|代碼",x["label"],re.I)]
        REPORT["scenes"].append({"name":name,**d});save()
        if shot and not private:await page.screenshot(path=str(OUT/(name+".png")),timeout=10000)
        return d
    except Exception as e:
        REPORT["errors"].append({"scene":name,"error":str(e)[:400]});return {}
async def tap(page,name,patterns,wait=900):
    # DOM dispatch is intentional: React/3D remount may detach Playwright's click target,
    # although the original click has already changed state.
    result=await page.evaluate("""patterns=>{
       const visible=n=>n.getClientRects().length>0&&getComputedStyle(n).visibility!=='hidden';
       const bs=[...document.querySelectorAll('button,[role=button]')].filter(visible);
       for(const pattern of patterns){
        const r=new RegExp(pattern,'i');
        const b=bs.find(n=>r.test((n.innerText||n.getAttribute('aria-label')||'').trim()));
        if(b&&!b.disabled){const label=(b.innerText||b.getAttribute('aria-label')||'').trim().slice(0,110);b.click();return {matched:true,label}}
       }
       return {matched:false,available:bs.map(n=>(n.innerText||'').trim().slice(0,45)).slice(0,24)}
    }""",patterns)
    REPORT["actions"].append({"step":name,**result});save()
    await page.wait_for_timeout(wait)
    return result["matched"]
async def start(page,who):
    try:
        resp=await page.goto(SITE,wait_until="domcontentloaded",timeout=48000)
        REPORT["actions"].append({"step":who+"_visit","http":resp.status if resp else None})
    except Exception as e:REPORT["errors"].append({"step":who+"_visit","error":str(e)[:250]})
    await page.wait_for_timeout(2800)
    await snapshot(page,who+"_before")
    if os.environ.get("DIRECT_HOME")=="1" and who in ("doubles","host","guest"):
        REPORT["limits"].append("Direct programmatic DOM click from initial page, without completing ordinary welcome/tutorial interaction; validates exposed UI state only")
        return
    await tap(page,who+"_enter",[r"Enter Now",r"先進去"],1100)
    await tap(page,who+"_tutorial",[r"Got It.*Play",r"知道了.*開打",r"Got it"],1800)
    # First-run tutorial may automatically start a default singles AI match.
    current=(await page.locator("body").inner_text())[:700]
    if re.search(r"You\s*\d+\s*:\s*\d+",current,re.I) or ("Opponent:" in current and "AI" in current):
        await tap(page,who+"_pause_game",[r"❚❚",r"^Pause"],750)
        await snapshot(page,who+"_pause_menu",shot=False,private=who in ("host","guest"))
        await tap(page,who+"_back_to_menu",[r"Main Menu",r"Back to Menu",r"Exit Match",r"Return to Menu",r"^Home",r"Leave Match",r"回主選單",r"返回主選單"],1500)
    # Do not accidentally trigger ad/install prompts.
    await snapshot(page,who+"_home",shot=who in ("single","doubles"))
async def run_rea():
    env=os.environ.copy()
    env["REA_BROWSER_OBSERVE_ENABLED"]="true"
    env["REA_BROWSER_ALLOWED_ORIGINS_JSON"]=json.dumps(["https://badmintonduel.com"])
    env["REA_BROWSER_CDP_ENDPOINTS_JSON"]=json.dumps(["http://127.0.0.1:9222"])
    async def invoke(args,timeout=50):
        try:
            p=await asyncio.create_subprocess_exec("rea",*args,stdout=asyncio.subprocess.PIPE,stderr=asyncio.subprocess.PIPE,env=env)
            stdout,stderr=await asyncio.wait_for(p.communicate(),timeout=timeout)
            d=json.loads(stdout)
            result={"op":args[0],"exit":p.returncode,"evidence_id":d.get("evidence_id"),"status":d.get("status")}
            REPORT["rea"].append(result);return d
        except Exception as e:
            REPORT["rea"].append({"op":args[0],"error":str(e)[:300]});return {}
    targets=await invoke(["list-browser-targets","http://127.0.0.1:9222","--json"])
    def find(x):
        if isinstance(x,dict):
            if "badmintonduel.com" in str(x.get("url","")):
                for k in ("id","target_id","targetId"):
                    if isinstance(x.get(k),str):return x[k]
            for v in x.values():
                y=find(v)
                if y:return y
        elif isinstance(x,list):
            for v in x:
                y=find(v)
                if y:return y
        return None
    target=find(targets)
    if target:
        await invoke(["inspect-web-page","http://127.0.0.1:9222",target,"--observation-ms","1200","--json"],70)
        await invoke(["analyze-web-bundle","http://127.0.0.1:9222",target,"--json"],70)
    else:REPORT["limits"].append("REA did not discover a target")
async def singles(page):
    # Main menu: 'Play! vs AI · Singles...'; clicking loads game directly.
    await tap(page,"single_start_ai",[r"^Play!",r"vs AI"],4500)
    await snapshot(page,"single_court",shot=True)
    initial=await page.locator("body").inner_text()
    scores=[]
    def score(s):
        m=re.search(r"You\s*(\d+)\s*:\s*(\d+)",s,re.I)
        return [int(m.group(1)),int(m.group(2))] if m else None
    scores.append(score(initial))
    # Exercise the visible playfield with standard mouse and keyboard interactions.
    # Never infer a successful rally only from an animation.
    await page.keyboard.press("Space")
    for i in range(18):
        if i in (3,7,11,15):
            await page.mouse.move(1020,600)
            await page.mouse.down()
            await page.mouse.move(1020-75+(i%2)*65,440,steps=5)
            await page.mouse.up()
        if i%4==0:await page.keyboard.press("j")
        await page.wait_for_timeout(1100)
        scores.append(score(await page.locator("body").inner_text()))
    await snapshot(page,"single_after_20s",shot=True)
    result={"samples":scores,"score_changed":any(x!=scores[0] for x in scores if x is not None),
            "found_score":scores[0] is not None}
    REPORT["single_verification"]=result
async def settings_doubles(page):
    # Verified UI: Play! opens Match Settings; the ordinary "Settings" is NOT where Singles/Doubles lives.
    await tap(page,"match_config_open",[r"^Play!",r"vs AI"],1050)
    cfg=await snapshot(page,"match_config",shot=False)
    has_doubles="Doubles (you + AI partner)" in cfg.get("body","")
    chosen=await tap(page,"select_doubles",[r"^Doubles \(you \+ AI partner\)",r"^Doubles"],700)
    selected=await snapshot(page,"match_config_after_doubles",shot=False)
    # Verify the current settings text, not only the clicked button.
    setting_text=selected.get("body","")
    active=bool(re.search(r"Current settings\s*Doubles",setting_text,re.I))
    await tap(page,"confirm_match_play",[r"^Play!$",r"開始比賽",r"Start Match"],3500)
    court=await snapshot(page,"doubles_court",shot=True)
    await page.wait_for_timeout(4000)
    await snapshot(page,"doubles_playing",shot=True)
    body=(await page.locator("body").inner_text())[:1500]
    REPORT["doubles_verification"]={
        "double_option_visible":has_doubles,
        "double_selected_click":chosen,
        "current_settings_confirm_doubles":active,
        "scoreboard_found":bool(re.search(r"You\s*\d+\s*:\s*\d+",body,re.I)),
        "court_canvas_count":len(court.get("canvas",[])),
        "cannot_assert_four_players_without_scene_analysis":True
    }

async def online_private(host,guest):
    await tap(host,"online_open",[r"^Online",r"線上對戰"],1200)
    await snapshot(host,"online_menu",shot=True)
    text=(await host.locator("body").inner_text())[:3000]
    # Only self-created private rooms. Avoid public matchmaking and chat.
    if not re.search(r"Create|Host|Private|建立房間|私人",text,re.I):
        REPORT["private_verification"]={"status":"blocked","reason":"no private create flow observed"};return
    await tap(host,"private_create",[r"^Create Room",r"^Host Room",r"^Create Private",r"建立房間",r"開房"],1300)
    await snapshot(host,"created_room_private",private=True)
    raw=(await host.locator("body").inner_text())[:2800]
    code_match=re.search(r"(?:Room Code|Invite Code|房間碼|邀請碼)\s*[:：]?\s*([A-Z0-9]{4,10})",raw,re.I)
    if not code_match:
        REPORT["private_verification"]={"status":"partial","reason":"own room opened, code unavailable"};return
    code=code_match.group(1)
    # Invite code is never persisted. The guest is another user-owned test context.
    await start(guest,"guest")
    await tap(guest,"guest_online",[r"^Online",r"線上對戰"],750)
    await tap(guest,"guest_join_option",[r"^Join Room",r"^Join",r"加入房間"],550)
    fill=await guest.evaluate("""code=>{
      const es=[...document.querySelectorAll('input')].filter(n=>n.getClientRects().length>0);
      const field=es.find(n=>/code|room|房間|邀請/i.test(n.placeholder))||es.find(n=>n.type==='text');
      if(!field)return false;
      const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;
      setter.call(field,code);field.dispatchEvent(new Event('input',{bubbles:true}));return true
    }""",code)
    if fill:await tap(guest,"guest_join_confirm",[r"^Join Room",r"^Join",r"加入",r"確認"],1200)
    await snapshot(host,"host_after_guest",private=True)
    await snapshot(guest,"guest_joined_private",private=True)
    REPORT["private_verification"]={"status":"join_attempted" if fill else "join_input_missing",
        "join_input_filled":bool(fill),"websockets_recorded":len(REPORT["websocket"]),
        "note":"No room codes/chat/payloads exported; only self-controlled clients"}
async def main():
    async with async_playwright() as p:
        path=p.chromium.executable_path
        proc=await asyncio.create_subprocess_exec(path,"--headless=new","--no-sandbox","--disable-dev-shm-usage",
            "--remote-debugging-port=9222","--remote-debugging-address=127.0.0.1",
            "--user-data-dir=/tmp/rea-tennis-v3-"+str(os.getpid()),
            "--enable-webgl","--use-gl=angle","--use-angle=swiftshader",SITE,
            stdout=asyncio.subprocess.DEVNULL,stderr=asyncio.subprocess.DEVNULL)
        try:
            browser=None
            for _ in range(30):
                try:browser=await p.chromium.connect_over_cdp("http://127.0.0.1:9222",timeout=1800);break
                except Exception:await asyncio.sleep(.6)
            if not browser:raise RuntimeError("CDP connection failed")
            main=browser.contexts[0].pages[0]
            log(main,"single")
            if os.environ.get("FOCUS_MODES")!="1":
                await start(main,"single")
                if os.environ.get("SKIP_REA")!="1":await run_rea()
                try:await singles(main)
                except Exception as e:REPORT["errors"].append({"section":"single","error":str(e)[:250]})
            else:
                REPORT["limits"].append("Focused modes-only continuation; singles already demonstrated score transition in previous evidence")
            selected=os.getenv("FOCUS_ONLY","both")
            if selected in ("both","doubles"):
                c2=await browser.new_context(viewport={"width":1280,"height":820})
                doubles=await c2.new_page();log(doubles,"doubles")
                await start(doubles,"doubles")
                try:await settings_doubles(doubles)
                except Exception as e:REPORT["errors"].append({"section":"doubles","error":str(e)[:300]})
            if selected in ("both","private"):
                c3=await browser.new_context(viewport={"width":1280,"height":820})
                c4=await browser.new_context(viewport={"width":1280,"height":820})
                host=await c3.new_page();guest=await c4.new_page()
                log(host,"host");log(guest,"guest")
                await start(host,"host")
                try:await online_private(host,guest)
                except Exception as e:REPORT["errors"].append({"section":"private","error":str(e)[:300]})
            await browser.close()
        finally:
            save()
            try:proc.terminate();await asyncio.wait_for(proc.wait(),timeout=4)
            except:proc.kill()
    print(json.dumps({k:v for k,v in REPORT.items() if k not in ("scenes","actions")},ensure_ascii=False,indent=2))
if __name__=="__main__":
    try:asyncio.run(asyncio.wait_for(main(),timeout=165))
    except asyncio.TimeoutError:print("AUDIT TIMED OUT: partial evidence saved; no equivalence claim",flush=True)
