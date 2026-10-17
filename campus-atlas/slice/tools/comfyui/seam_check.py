# 接縫檢查：比較「右邊緣↔左邊緣」「下邊緣↔上邊緣」的像素差，與影像內部相鄰行列差的比值（≈1 表示看不出接縫）；並輸出 2×2 拼貼圖。
# 用法：python3 tools/comfyui/seam_check.py DIR OUT_SHEET.jpg [--jpg-dir DIR2]
import sys, os, glob, json
import numpy as np
from PIL import Image
D, SHEET = sys.argv[1], sys.argv[2]; JD = sys.argv[sys.argv.index('--jpg-dir') + 1] if '--jpg-dir' in sys.argv else None
res, tiles = {}, []
for f in sorted(glob.glob(os.path.join(D, '*.png'))):
    a = np.asarray(Image.open(f).convert('RGB'), dtype=np.float32)
    inner = (np.abs(np.diff(a, axis=1)).mean() + np.abs(np.diff(a, axis=0)).mean()) / 2
    seam = (np.abs(a[:, 0] - a[:, -1]).mean() + np.abs(a[0] - a[-1]).mean()) / 2
    n = os.path.splitext(os.path.basename(f))[0]; res[n] = {'seamOverInner': round(float(seam / inner), 2)}
    t = Image.open(f).convert('RGB').resize((256, 256)); g = Image.new('RGB', (512, 512)); [g.paste(t, (x, y)) for x in (0, 256) for y in (0, 256)]; tiles.append(g)
    if JD: os.makedirs(JD, exist_ok=True); Image.open(f).convert('RGB').resize((512, 512), Image.LANCZOS).save(os.path.join(JD, n + '.jpg'), quality=85)
cols = 4; rows = (len(tiles) + cols - 1) // cols; S = Image.new('RGB', (cols * 512, rows * 512), 'white')
for i, t in enumerate(tiles): S.paste(t, ((i % cols) * 512, (i // cols) * 512))
S.resize((cols * 256, rows * 256)).save(SHEET, quality=85); print(json.dumps(res, ensure_ascii=False))
