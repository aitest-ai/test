# 交付用貼圖：ComfyUI 輸出的 1024² 可拼貼 PNG → 場景用 JPEG（預設 512²）。
# 縮圖時先 3×3 環狀拼貼再縮、取中央，邊緣像素也取樣到對側，縮小後仍可無縫拼貼（直接縮會在邊緣產生接縫）。
# 色調：mean=#rrggbb 把平均色對齊到原本程式化紋理的底色（換上圖片後整體色調不變，只多了細節）；contrast=k 以平均色為中心縮放對比；
#       despeckle=a 把比周圍暗很多的小點（混凝土氣孔）以比例 a 拉回周圍亮度（環狀模糊，不破壞拼貼）。
# 用法：python3 tools/comfyui/prep_textures.py SRC_DIR OUT_DIR name=srcfile[,size=512][,mean=#b9b8b2][,contrast=0.8][,despeckle=0.7] ...
import sys, os, json
import numpy as np
from PIL import Image, ImageFilter
src, out = sys.argv[1], sys.argv[2]; os.makedirs(out, exist_ok=True); rep = {}
def wrap_blur(a, r):   # 環狀邊界的高斯模糊
    h, w = a.shape[:2]; big = np.tile(a, (3, 3, 1)).astype(np.uint8)
    b = np.asarray(Image.fromarray(big).filter(ImageFilter.GaussianBlur(r)), dtype=np.float32); return b[h:2 * h, w:2 * w]
for spec in sys.argv[3:]:
    name, rest = spec.split('=', 1); parts = rest.split(','); f = parts[0]; o = dict(p.split('=') for p in parts[1:])
    size = int(o.get('size', 512))
    im = Image.open(os.path.join(src, f)).convert('RGB'); w, h = im.size
    big = Image.new('RGB', (w * 3, h * 3)); [big.paste(im, (x * w, y * h)) for x in range(3) for y in range(3)]
    a = np.asarray(big.resize((size * 3, size * 3), Image.LANCZOS).crop((size, size, size * 2, size * 2)), dtype=np.float32)
    m0 = a.reshape(-1, 3).mean(0); r = {'from': f, 'size': size, 'meanIn': m0.round().tolist(), 'stdIn': a.reshape(-1, 3).std(0).round(1).tolist()}
    if 'despeckle' in o:
        bl = wrap_blur(a, 3); L = a.mean(2, keepdims=True); BL = bl.mean(2, keepdims=True)
        k = np.clip((BL - L - 12) / 30, 0, 1) * float(o['despeckle']); a = a * (1 - k) + bl * k; r['despeckled'] = round(float((k > 0.05).mean() * 100), 2)
    if 'mean' in o:
        t = np.array([int(o['mean'][i:i + 2], 16) for i in (1, 3, 5)], dtype=np.float32); m = a.reshape(-1, 3).mean(0)
        c = float(o.get('contrast', 1)); a = t + (a * (t / m) - t) * c
    elif 'contrast' in o: m = a.reshape(-1, 3).mean(0); a = m + (a - m) * float(o['contrast'])
    a = np.clip(a, 0, 255).astype(np.uint8)
    p = os.path.join(out, name + '.jpg'); Image.fromarray(a).save(p, quality=85, optimize=True, progressive=True)
    r.update(meanOut=a.reshape(-1, 3).mean(0).round().tolist(), stdOut=a.reshape(-1, 3).std(0).round(1).tolist(), KB=round(os.path.getsize(p) / 1024, 1)); rep[name] = r
print(json.dumps(rep, ensure_ascii=False))
