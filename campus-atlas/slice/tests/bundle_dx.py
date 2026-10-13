# 把東新版打包成單一 HTML（資料與底圖內嵌），供 Artifact／離線開啟
import re, base64, json, os
R=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
rd=lambda p: open(os.path.join(R,p),encoding='utf-8').read()
b64=lambda p: 'data:image/jpeg;base64,'+base64.b64encode(open(os.path.join(R,p),'rb').read()).decode()
mods=['src/nav/navgraph.js','src/scene/batch.js','src/scene/materials.js','src/scene/character.js','src/dongxin/model.js','src/dongxin/world.js','src/dongxin/nav.js','src/dongxin/scene.js','src/main_dx.js']
code=[]
for p in mods:
    s=rd(p); s=re.sub(r'^import .*?;\s*$','',s,flags=re.M); s=re.sub(r'^export (default )?','',s,flags=re.M); code.append('/* '+p+' */\n'+s)
js='\n'.join(code)
js=js.replace("await (await fetch('./data/dongxin_geo.json')).json()","window.__DXDATA")
js=js.replace("'./assets/dongxin_plan_soft.jpg'","window.__PLAN_SOFT").replace("'./assets/dongxin_plan.jpg'","window.__PLAN")
d=json.load(open(os.path.join(R,'data/dongxin_geo.json')))
html=rd('dongxin.html')
html=re.sub(r'<link rel="stylesheet"[^>]*>','<style>'+rd('src/ui/style.css')+'</style>',html)
pre='<script>window.__DXDATA=%s;window.__PLAN=%s;window.__PLAN_SOFT=%s;</script>'%(json.dumps(d,separators=(',',':'),ensure_ascii=False),json.dumps(b64('assets/dongxin_plan.jpg')),json.dumps(b64('assets/dongxin_plan_soft.jpg')))
html=html.replace('<script type="module" src="./src/main_dx.js"></script>',pre+'<script type="module">\n'+js+'\n</script>')
open(os.path.join(R,'dongxin_single.html'),'w',encoding='utf-8').write(html)
print(len(html)//1024,'KB')
