#!/usr/bin/env python3
# 第三輪 A：由實景照片（assets/photo-src/，使用者提供、已同意當公開材質）產生可拼貼貼圖 → assets/textures/
#   python3 scripts/photo_textures.py            （需要 Pillow + numpy）
# 作法：裁照片中「單一材料、沒有接縫」的區塊 → 透視壓縮的地坪先拉回正確長寬比 → 去掉原本的細縫（比中值暗的細線換成中值）
#       → 鏡像交叉混合做成無縫 → 依實測尺寸重畫接縫（接縫顏色也從照片取樣）。
# 照片解析度不足以拍出磚縫的（集賢樓面磚每層只有約 4 px）：磚面色彩與明暗取自照片像素，磚縫依頻譜量得的比例重畫。
# 每張貼圖的來源區域、量法與平均色印在最後的報告（寫進 materials.dongxin.json 的 evidence 與執行紀錄）。
import json, os, sys
import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets', 'photo-src'); OUT = os.path.join(ROOT, 'assets', 'textures')
rng = np.random.default_rng(7)
REPORT = {}

def load(name, box):
    return np.asarray(Image.open(os.path.join(SRC, name)).convert('RGB').crop(box)).astype(np.float32)

def resize(a, w, h):
    return np.asarray(Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)).resize((w, h), Image.LANCZOS)).astype(np.float32)

def deseam(a, size=9, thr=10):
    # 去掉照片裡原有的接縫／細線：比局部中值暗 thr 以上的像素換成中值
    med = np.asarray(Image.fromarray(a.astype(np.uint8)).filter(ImageFilter.MedianFilter(size))).astype(np.float32)
    dark = (med.mean(2) - a.mean(2)) > thr
    a = a.copy(); a[dark] = med[dark]; return a

def flatten(a, sigma):
    # 去掉大範圍的光照漸層（陰影、曝光），保留顆粒：除以模糊版本再乘回平均
    blur = np.asarray(Image.fromarray(a.astype(np.uint8)).filter(ImageFilter.GaussianBlur(sigma))).astype(np.float32) + 1
    return a / blur * a.reshape(-1, 3).mean(0)

def seamless(a):
    # 半幅位移後，用十字羽化遮罩把原圖與位移圖混合：邊界處取位移圖（其邊界是原圖中央、連續），中央取原圖
    h, w, _ = a.shape; sh = np.roll(np.roll(a, h // 2, 0), w // 2, 1)
    y = np.abs(np.linspace(-1, 1, h))[:, None]; x = np.abs(np.linspace(-1, 1, w))[None, :]
    m = np.clip((np.maximum(x, y) - 0.55) / 0.4, 0, 1)[..., None]
    return a * (1 - m) + sh * m

def save(a, name, q=82):
    im = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)); p = os.path.join(OUT, name)
    im.save(p, quality=q, optimize=True, progressive=True); return os.path.getsize(p)

def lines(a, ppm, step, color, width_m, axis, alpha=1.0, offset=0.0):
    # 在 a 上每 step 公尺畫一條接縫（axis 0＝水平線、1＝垂直線），寬 width_m 公尺，反鋸齒
    h, w, _ = a.shape; n = h if axis == 0 else w
    pos = np.arange(n) + 0.5; d = np.abs(((pos / ppm - offset) / step + 0.5) % 1 - 0.5) * step * ppm   # 到最近接縫的距離（px）
    cov = np.clip(width_m * ppm / 2 + 0.5 - d, 0, 1) * alpha
    cov = cov[:, None, None] if axis == 0 else cov[None, :, None]
    return a * (1 - cov) + np.array(color, np.float32) * cov

def expose(a, target):
    # 取樣區常在陰影裡：整體縮放到同一張照片受光區的中位色（target），保留紋理
    return a * (np.array(target, np.float32) / a.reshape(-1, 3).mean(0))

def grain(s, W, H):
    # 照片取樣太小（地坪透視壓縮後只有數十 px 高），直接放大會出現條紋／糊塊：只取平均色與顆粒強度（高頻標準差），畫等向細顆粒
    hp = s - np.asarray(Image.fromarray(np.clip(s, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(3))).astype(np.float32); sd = float(hp.std())
    g = rng.normal(0, 1, (H // 2, W // 2)).astype(np.float32); g = resize(np.repeat(g[..., None], 3, 2) * 40 + 128, W, H)[..., :1] - 128
    return s.reshape(-1, 3).mean(0) + g / max(float(g.std()), 1e-3) * sd

def mean_hex(a): c = a.reshape(-1, 3).mean(0); return '#%02x%02x%02x' % tuple(int(round(v)) for v in c)

# ---------- 集賢樓面磚 brick_jixian：0.96 × 0.84 m ＝ 4 塊 × 12 層（模數 24 × 7 cm，含 1 cm 縫） ----------
def brick():
    # 量測：jixian_facade_courtyard.jpg 的磚面 (655,170)-(785,270)（樹上方、兩窗柱之間，近正視）
    #   垂直頻譜主週期 4.2 px／層、水平 7.2 px（半塊，順砌錯半）→ 磚長 14.4 px；窗台列間距 235 px ＝ 層高 3.9 m → 60 px/m
    #   → 每層 7.0 cm、磚長 24 cm，與「約 24 × 6 cm＋1 cm 縫」一致
    reg = load('jixian_facade_courtyard.jpg', (655, 170, 785, 270))
    W = H = 512; ppm = W / 0.96; bw, bh, j = 0.24, 0.07, 0.009
    # 照片像素（每像素已是磚與縫的混合）：取亮度中段當磚色樣本，最亮且低彩度的一成當縫色
    px = reg.reshape(-1, 3); lum = px.mean(1); sat = px.max(1) - px.min(1)
    body = px[(lum > np.percentile(lum, 20)) & (lum < np.percentile(lum, 85))]
    mortar = px[(sat < np.percentile(sat, 15))].mean(0) * 1.04
    # 低頻明暗（色差、髒污）：照片磚面放大後高斯模糊，只取相對亮度
    low = flatten(reg, 30); low = resize(low, W, H); low = np.asarray(Image.fromarray(low.astype(np.uint8)).filter(ImageFilter.GaussianBlur(14))).astype(np.float32)
    low = seamless(low).mean(2, keepdims=True); low = low / low.mean()
    a = np.zeros((H, W, 3), np.float32)
    rows = int(round(0.84 / bh)); cols = int(round(0.96 / bw))
    yy, xx = np.mgrid[0:H, 0:W]; ym = yy / ppm; xm = xx / ppm
    r = np.floor(ym / bh).astype(int); off = (r % 2) * bw / 2; c = np.floor(((xm + off) % 0.96) / bw).astype(int)
    colors = body[rng.integers(0, len(body), (rows, cols))]                     # 每塊磚一個照片取樣色
    a[:] = colors[r % rows, c % cols]
    grain = rng.normal(0, 4.0, (H, W, 1)).astype(np.float32); a += grain        # 磚面細顆粒
    a *= low
    # 縫：水平縫（每層下緣）與錯半的垂直縫
    dy = np.abs(((ym / bh) + 0.5) % 1 - 0.5) * bh; dx = np.abs((((xm + off) / bw) + 0.5) % 1 - 0.5) * bw
    cov = np.clip(j * ppm / 2 + 0.5 - np.minimum(dy, dx) * ppm, 0, 1)[..., None]
    a = a * (1 - cov) + mortar * cov
    REPORT['brick_jixian'] = dict(src='jixian_facade_courtyard.jpg (655,170)-(785,270)', repeatMeters=[0.96, 0.84],
        how='頻譜量得每層 4.2 px、磚長 14.4 px；窗台列距 235 px＝3.9 m → 每層 7 cm、磚長 24 cm；磚色為照片像素取樣、明暗取自照片，縫依比例重畫',
        photoMean=mean_hex(reg), mortar=mean_hex(mortar[None, None]), bytes=save(a, 'brick_jixian.jpg'))

# ---------- 清水混凝土 concrete_formwork：1.2 × 2.4 m 一片模板，對拉孔每 0.6 m ----------
def concrete():
    # 表面：stair_wall_material.jpg 右側梯牆 (610,60)-(780,560)（無孔區，斜看但混凝土質感各向同性）
    # 對拉孔：同一張照片 (595,250) 附近的實孔，縮到孔徑約 3 cm；分格依 tower_exterior_corner_formwork.jpg（孔距約 0.6 m、模板 1.2 × 2.4 m）
    W, H = 512, 1024; ppm = W / 1.2
    s = load('stair_wall_material.jpg', (610, 60, 780, 560)); s = deseam(s, 7, 12); s = flatten(s, 40)
    a = seamless(resize(s, W, H))
    # 對拉孔：照片中孔心色（(588,243)-(602,257) 的中位色 80,78,75），孔徑 3 cm，外圈 1 cm 淺色收邊（照片可見塑膠蓋邊）
    base = a.reshape(-1, 3).mean(0); hc = np.array([80, 78, 75], np.float32); rim = base * 0.9
    yy, xx = np.mgrid[0:H, 0:W]
    for gx in (0.3, 0.9):
        for gy in (0.3, 0.9, 1.5, 2.1):
            r = np.hypot(xx / ppm - gx, yy / ppm - gy)
            c1 = np.clip((0.015 - r) * ppm + 0.5, 0, 1)[..., None]; c2 = np.clip((0.022 - r) * ppm + 0.5, 0, 1)[..., None] - c1
            a = a * (1 - c1 - c2) + hc * c1 + rim * c2
    seam = base * 0.78
    a = lines(a, ppm, 1.2, seam, 0.004, 1, 0.55); a = lines(a, ppm, 2.4, seam, 0.004, 0, 0.55)
    REPORT['concrete_formwork'] = dict(src='stair_wall_material.jpg (610,60)-(780,560)；孔 (583,238)-(607,262)', repeatMeters=[1.2, 2.4],
        how='表面與孔取自照片；模板分格 1.2 × 2.4 m、孔距 0.6 m、孔徑約 3 cm 依 tower_exterior_corner_formwork / 任務檔量測', photoMean=mean_hex(s), bytes=save(a, 'concrete_formwork.jpg'))

# ---------- 走廊淺灰石英磚 tile_corridor：1.2 m ＝ 2 × 2 塊 60 cm ----------
def tile():
    # mufeng_corridor_2f.jpg 地坪 (252,712)-(328,758)（單塊磚內、無縫）：透視壓縮約 2.2 倍（磚實為正方，照片中前後向約短 2.2 倍），先拉回
    # 亮度對齊同照片受光地坪 (20,450)-(700,844) 的中位色 156,155,156，再提亮 10%（穿堂與走廊受光面，雲端驗收：應為淺灰）
    W = H = 512; ppm = W / 1.2
    s = load('mufeng_corridor_2f.jpg', (252, 712, 328, 758)); s = resize(s, 76, 100); s = deseam(s, 9, 8); s = flatten(s, 25); s = expose(s, (172, 171, 171))
    a = grain(s, W, H)
    a *= 1.0 + rng.normal(0, 0.012, (2, 2))[(np.arange(H) * 2 // H)[:, None], (np.arange(W) * 2 // W)[None, :]][..., None]  # 每塊磚些微色差
    joint = np.array([108, 108, 110], np.float32)                                # 照片中細縫的深灰（估計）
    a = lines(a, ppm, 0.6, joint, 0.003, 0); a = lines(a, ppm, 0.6, joint, 0.003, 1)
    REPORT['tile_corridor'] = dict(src='mufeng_corridor_2f.jpg (252,712)-(328,758)', repeatMeters=1.2, how='平均色與顆粒強度取自照片（受光區亮度）；60 cm 方磚、細縫 3 mm',
        photoMean=mean_hex(s), bytes=save(a, 'tile_corridor.jpg'))

# ---------- 電腦教室白色架高地板 floor_raised_white：1.2 m ＝ 2 × 2 片 60 cm ----------
def raised():
    W = H = 512; ppm = W / 1.2
    # computer_room.jpg (300,812)-(420,840)（單片內）：透視壓縮約 2.5 倍先拉回；亮度對齊受光區 (30,760)-(420,844) 中位色 166,167,172 再提亮 15%（照片曝光偏暗，實物為白色）
    s = load('computer_room.jpg', (300, 812, 420, 840)); s = resize(s, 120, 70); s = deseam(s, 9, 10); s = flatten(s, 25); s = expose(s, (191, 192, 198))
    a = grain(s, W, H)
    joint = np.array([70, 72, 76], np.float32)                                   # 照片 computer_room.jpg 中板縫近黑灰（取樣 (180,700) 附近）
    a = lines(a, ppm, 0.6, joint, 0.006, 0); a = lines(a, ppm, 0.6, joint, 0.006, 1)
    REPORT['floor_raised_white'] = dict(src='computer_room.jpg (300,812)-(420,840)', repeatMeters=1.2, how='平均色與顆粒強度取自照片；60 cm 架高地板、深色細縫 6 mm（照片估計）',
        photoMean=mean_hex(s), bytes=save(a, 'floor_raised_white.jpg'))

# ---------- 中庭灰連鎖磚 pave_interlock：0.8 × 0.8 m ＝ 4 × 8 塊 20 × 10 cm 順砌 ----------
def pave():
    W = H = 512; ppm = W / 0.8
    s = load('jixian_facade_courtyard.jpg', (20, 700, 300, 844)); s = resize(s, 280, 330); s = deseam(s, 11, 8); s = flatten(s, 10)
    a = seamless(resize(s, W, H))
    yy, xx = np.mgrid[0:H, 0:W]; ym = yy / ppm; xm = xx / ppm; bw, bh = 0.2, 0.1
    r = np.floor(ym / bh).astype(int); off = (r % 2) * bw / 2; c = np.floor(((xm + off) % 0.8) / bw).astype(int)
    tone = 1.0 + rng.normal(0, 0.035, (8, 4)); a *= tone[r % 8, c % 4][..., None]   # 每塊磚的色差（照片中明顯）
    joint = a.reshape(-1, 3).mean(0) * 0.7
    dy = np.abs(((ym / bh) + 0.5) % 1 - 0.5) * bh; dx = np.abs((((xm + off) / bw) + 0.5) % 1 - 0.5) * bw
    cov = np.clip(0.004 * ppm / 2 + 0.5 - np.minimum(dy, dx) * ppm, 0, 1)[..., None]
    a = a * (1 - cov) + joint * cov
    REPORT['pave_interlock'] = dict(src='jixian_facade_courtyard.jpg (20,700)-(300,844)', repeatMeters=0.8, how='表面取自照片；10 × 20 cm 順砌（任務檔 1-7）、縫色為表面平均的 0.7 倍',
        photoMean=mean_hex(s), bytes=save(a, 'pave_interlock.jpg'))

# ---------- 櫃體木紋貼皮 wood_veneer_light：0.45 × 0.9 m（一扇櫃門） ----------
def veneer():
    W, H = 256, 512
    s = load('computer_room.jpg', (1405, 244, 1469, 326)); s = flatten(s, 30); s = expose(s, (176, 154, 126))   # 對齊整面吊櫃 (1340,250)-(1480,350) 平均 145,127,104，再提亮 20%（吊櫃在背光面）
    a = resize(s, W, H)
    a = np.concatenate([a, a[::-1]], 0); a = resize(a, W, H)                     # 上下鏡像接起來，垂直方向無縫；木紋本身是直紋
    h = a.shape[1]; a = seamless(a) * 0.5 + a * 0.5
    REPORT['wood_veneer_light'] = dict(src='computer_room.jpg (1405,244)-(1469,326)（櫃門面板，兩道門縫之間）', repeatMeters=[0.45, 0.9],
        how='直紋淺木貼皮；寬 0.45 m＝照片中一扇門寬（門縫距約 70 px，以吊櫃高估計）', photoMean=mean_hex(s), bytes=save(a, 'wood_veneer_light.jpg'))

# ---------- 灰色花崗石 granite_grey：0.6 × 0.3 m ----------
def granite():
    W, H = 512, 256
    s = load('jixian_facade_courtyard.jpg', (820, 770, 1240, 800)); s = flatten(s, 20)     # 花壇緣下半（上半有雨水濕痕）
    tiles = [s[:, i * 60:(i + 1) * 60] for i in range(7)]
    a = np.concatenate([np.concatenate(tiles[i:i + 2], 1) for i in (0, 2, 4)], 0)          # 拼成 120 × 90 px 再放大
    a = seamless(resize(a, W, H))
    REPORT['granite_grey'] = dict(src='jixian_facade_courtyard.jpg (820,770)-(1240,800)（花壇緣花崗石）', repeatMeters=[0.6, 0.3],
        how='細顆粒灰色花崗石，用於窗台、花壇緣、司令台平台貼面', photoMean=mean_hex(s), bytes=save(a, 'granite_grey.jpg'))

if __name__ == '__main__':
    only = set(sys.argv[1:])
    for f in (brick, concrete, tile, raised, pave, veneer, granite):
        if not only or f.__name__ in only: f()
    print(json.dumps(REPORT, ensure_ascii=False, indent=1))
    print('total KB', round(sum(v['bytes'] for v in REPORT.values()) / 1024, 1))
