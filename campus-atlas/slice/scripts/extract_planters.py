# 從設計圖底圖（assets/dongxin_plan.jpg）抽出花壇輪廓 → data/planters.dongxin.json（第三輪 S8）。
# 花壇在底圖上是淺綠底＋「+」點（樹冠為較深的綠圓）：取「綠色明顯高於紅／藍」的像素為花壇，閉運算填掉十字點與線條，
# 去掉小塊，沿遮罩邊界串成折線，Douglas–Peucker 簡化（0.22 m）後 Chaikin 平滑兩次。輸出世界座標（公尺）。
# 只處理校門側廣場與集賢樓中庭（REGION），草地球場等不做花壇緣。
# 用法：python3 scripts/extract_planters.py   （需要 numpy、Pillow）
import json, os, numpy as np
from PIL import Image, ImageFilter
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
D = json.load(open(os.path.join(ROOT, 'data', 'dongxin_geo.json'))); tx, SC = D['tex'], D['SC']
REGION = (56.0, 38.0, 113.0, 92.0)       # x0, z0, x1, z1（m）
RES = 0.15                                # 遮罩格（m）
im = Image.open(os.path.join(ROOT, 'assets', 'dongxin_plan.jpg')).convert('RGB'); W, H = im.size
def w2p(x, z): return ((x / SC - tx['x0']) / (tx['x1'] - tx['x0']) * W, (z / SC - tx['y0']) / (tx['y1'] - tx['y0']) * H)
x0, z0, x1, z1 = REGION; nx, nz = int((x1 - x0) / RES), int((z1 - z0) / RES)
a, b = w2p(x0, z0), w2p(x1, z1)
crop = im.crop((int(a[0]), int(a[1]), int(b[0]), int(b[1]))).resize((nx, nz), Image.BILINEAR)
A = np.asarray(crop, dtype=np.int16); r, g, bl = A[..., 0], A[..., 1], A[..., 2]
m = ((g - r > 8) & (g - bl > 28) & (g > 120)).astype(np.uint8) * 255
mi = Image.fromarray(m).filter(ImageFilter.MaxFilter(9)).filter(ImageFilter.MinFilter(9)).filter(ImageFilter.MinFilter(5)).filter(ImageFilter.MaxFilter(5))   # 閉運算（填十字點、樹冠缺口）再開運算（去細線）
M = np.asarray(mi) > 127
# 連通塊，去掉 < 3 m² 的
lab = np.zeros(M.shape, np.int32); n = 0; sizes = {}
for j in range(nz):
    for i in range(nx):
        if M[j, i] and not lab[j, i]:
            n += 1; st = [(j, i)]; lab[j, i] = n; c = 0
            while st:
                y, x = st.pop(); c += 1
                for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    yy, xx = y + dy, x + dx
                    if 0 <= yy < nz and 0 <= xx < nx and M[yy, xx] and not lab[yy, xx]: lab[yy, xx] = n; st.append((yy, xx))
            sizes[n] = c
keep = {k for k, c in sizes.items() if c * RES * RES >= 3.0}
M = np.isin(lab, list(keep))
# 邊界邊 → 折線
edges = {}
def add(p, q): edges.setdefault(p, []).append(q); edges.setdefault(q, []).append(p)
P = np.pad(M, 1)
for j in range(nz):
    for i in range(nx):
        if not M[j, i]: continue
        if not P[j, i + 1]: add((i, j), (i + 1, j))          # 上
        if not P[j + 2, i + 1]: add((i, j + 1), (i + 1, j + 1))
        if not P[j + 1, i]: add((i, j), (i, j + 1))
        if not P[j + 1, i + 2]: add((i + 1, j), (i + 1, j + 1))
lines = []
while edges:
    s = next(iter(edges)); line = [s]; cur = s
    while True:
        nb = edges.get(cur)
        if not nb: break
        nxt = nb.pop(); edges[nxt].remove(cur)
        if not edges[cur]: del edges[cur]
        if not edges[nxt]: del edges[nxt]
        line.append(nxt); cur = nxt
        if cur == s: break
    if len(line) > 8: lines.append(line)
def rdp(pts, eps):
    if len(pts) < 3: return pts
    a, b = np.array(pts[0], float), np.array(pts[-1], float); ab = b - a; L = np.hypot(*ab)
    cr = lambda u, v: u[0] * v[1] - u[1] * v[0]
    d = [abs(cr(ab, np.array(p, float) - a)) / L if L > 1e-9 else np.hypot(*(np.array(p, float) - a)) for p in pts]
    k = int(np.argmax(d))
    if d[k] > eps: return rdp(pts[:k + 1], eps)[:-1] + rdp(pts[k:], eps)
    return [pts[0], pts[-1]]
def chaikin(pts, closed):
    out = []; n = len(pts)
    for k in range(n if closed else n - 1):
        p, q = np.array(pts[k]), np.array(pts[(k + 1) % n]); out += [tuple(0.75 * p + 0.25 * q), tuple(0.25 * p + 0.75 * q)]
    return out if closed else [pts[0]] + out + [pts[-1]]
out = []
for ln in lines:
    closed = ln[0] == ln[-1]
    w = [(x0 + i * RES, z0 + j * RES) for i, j in ln]
    if closed: w = w[:-1]
    s = rdp(w + ([w[0]] if closed else []), 0.22)
    if closed: s = s[:-1]
    if len(s) < 3: continue
    s = chaikin(chaikin(s, closed), closed)
    per = sum(np.hypot(s[k + 1][0] - s[k][0], s[k + 1][1] - s[k][1]) for k in range(len(s) - 1))
    if per < 4: continue
    out.append({'closed': closed, 'pts': [[round(x, 2), round(z, 2)] for x, z in s]})
json.dump({'source': 'assets/dongxin_plan.jpg（設計圖底圖的花壇色塊）', 'region': REGION, 'res': RES, 'planters': out}, open(os.path.join(ROOT, 'data', 'planters.dongxin.json'), 'w'), ensure_ascii=False)
print('planters', len(out), 'points', sum(len(p['pts']) for p in out))
