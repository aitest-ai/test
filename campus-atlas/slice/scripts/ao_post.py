# AO 烘焙後處理：Blender 輸出的 PNG → 執行期用的灰階 JPEG＋中繼資料（assets/ao/）。
#   - 圖集左上角保留區（lightmap.js 的 reserve，對應 uv1≈(0,0)：沒有配島的面、沒有 uv1 的網格都取樣這裡）強制填白
#   - 「接觸面」修補：AO < --dark（預設 0.12）的 texel 不是真的遮蔽，而是面貼著／埋在別的方塊裡（共面、牆端面貼牆、屋頂與天花板盒重疊），
#     光線一出發就撞到鄰面，烘出全黑；這些面在畫面上會因共面 z-fighting 露出來，成為黑縫、黑條與斑駁。
#     真正的牆角在 1.2 m 遮蔽距離下約 0.4–0.5，不會低於門檻。做法：把這些 texel 標為無效，以周圍有效 texel 的平均值逐圈往內補（--fill 圈），
#     補不到的（整個面都貼著別的面）填白。
#   - 寫入 ao.json：lightmap 簽章（執行期比對，不符就不套用）、密度、烘焙參數
# 用法：python3 scripts/ao_post.py assets-src/ao assets-src/dongxin_raw.lightmap.json assets/ao [--quality 85] [--out-size 2048]
import sys, os, json
import numpy as np
from PIL import Image
src, lmf, out = sys.argv[1:4]; os.makedirs(out, exist_ok=True)
opt = lambda k, d: type(d)(sys.argv[sys.argv.index(k) + 1]) if k in sys.argv else d
Q, DARK, FILL, OUTSIZE = opt('--quality', 85), opt('--dark', 0.12), opt('--fill', 6), opt('--out-size', 0)

def fix_contact(a):
    v = a.astype(np.float32) / 255; bad = v < DARK; n0 = int(bad.sum())
    for _ in range(FILL):
        if not bad.any(): break
        ok = (~bad).astype(np.float32); val = v * ok; S = np.zeros_like(v); C = np.zeros_like(v)
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                S += np.roll(np.roll(val, dy, 0), dx, 1); C += np.roll(np.roll(ok, dy, 0), dx, 1)
        fill = bad & (C > 0); v[fill] = S[fill] / C[fill]; bad &= ~fill
    v[bad] = 1.0
    return (np.clip(v, 0, 1) * 255 + 0.5).astype(np.uint8), n0, int(bad.sum())
lm = json.load(open(lmf)); bake = json.load(open(os.path.join(src, 'bake.json'))); rep = {}
for name in ('ao_main', 'ao_ground'):
    a = np.asarray(Image.open(os.path.join(src, name + '.png')).convert('L')).copy()
    a, n0, nw = fix_contact(a); rep[name] = {'contactTexels': n0, 'filledWhite': nw}
    if name == 'ao_main':
        r = 8; a[:r, :r] = 255      # PNG 第一列＝uv v=0（glTF 慣例，執行期 flipY=false）
    im = Image.fromarray(a)
    if OUTSIZE and name == 'ao_main' and OUTSIZE < a.shape[0]:   # 交付尺寸：uv1 是正規化座標，縮圖後仍對得上（島的邊距與外擴等比例縮小）
        im = im.resize((OUTSIZE, OUTSIZE), Image.BOX); a = np.asarray(im)
    p = os.path.join(out, name + '.jpg'); im.save(p, quality=Q, optimize=True)
    rep[name].update({'size': a.shape[0], 'KB': round(os.path.getsize(p) / 1024, 1), 'mean': round(float(a.mean()) / 255, 3)})
meta = {'post': {'dark': DARK, 'fill': FILL, 'quality': Q, 'outSize': OUTSIZE}, 'signature': lm['signature'], 'lightmap': lm, 'bake': {k: bake[k] for k in ('blender', 'res', 'groundRes', 'samples', 'distance', 'margin', 'sec')}, 'files': rep}
json.dump(meta, open(os.path.join(out, 'ao.json'), 'w'), ensure_ascii=False, indent=1); print(json.dumps(rep))
