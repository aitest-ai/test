import asyncio, os, threading, http.server, socketserver, functools, json, math
from playwright.async_api import async_playwright
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a): pass
srv=socketserver.TCPServer(('127.0.0.1',0),functools.partial(Q,directory=os.path.join(ROOT,'dist'))); PORT=srv.server_address[1]
threading.Thread(target=srv.serve_forever,daemon=True).start()
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(args=['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--no-sandbox'])
        pg=await b.new_page(viewport={'width':800,'height':500})
        await pg.goto(f'http://127.0.0.1:{PORT}/index.html'); await pg.wait_for_function('window.__slice')
        res=await pg.evaluate('''(()=>{const s=__slice,out=[];
          s.setDest(s.lay.rooms.find(r=>r.id==="r3-4")); s.startRoute(true);
          for(let i=0;i<30*40;i++){ s.advance(1/30,1/30); const c=s.cam(); out.push([c.p[0],c.p[1],c.p[2],c.d[0],c.d[1],c.d[2],s.S.x,s.S.y,s.S.z,s.S.walker?1:0]); if(!s.S.walker && i>20) break;}
          return out;})()''')
        # 指標：鏡頭位置每幀位移、加速度(二階差分)、視線角速度，以及鏡頭相對角色距離
        n=len(res); dist=lambda a,b: math.dist(a,b)
        step=[dist(res[i][:3],res[i-1][:3]) for i in range(1,n)]
        acc=[dist([res[i][k]-2*res[i-1][k]+res[i-2][k] for k in range(3)],[0,0,0]) for i in range(2,n)]
        ang=[math.acos(max(-1,min(1,sum(res[i][3+k]*res[i-1][3+k] for k in range(3)))))*30 for i in range(1,n)]
        rel=[dist(r[:3],r[6:9]) for r in res]
        print(json.dumps({'frames':n,'maxStep_m/frame':round(max(step),3),'maxAccel':round(max(acc),3),'p95Accel':round(sorted(acc)[int(len(acc)*.95)],3),'maxViewAngVel_rad/s':round(max(ang),2),'p95AngVel':round(sorted(ang)[int(len(ang)*.95)],2),'camToChar_min':round(min(rel),2),'camToChar_max':round(max(rel),2)}))
        worst=sorted(range(len(acc)),key=lambda i:-acc[i])[:5]; print('worst accel frames',[(i+2,round(acc[i],3),[round(v,2) for v in res[i+2][6:9]]) for i in worst])
        await b.close()
asyncio.run(main())
