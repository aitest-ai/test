# 照片 vs 模型並排：左＝實景照片（assets/photo-src/），右＝ viewshot.py 的同視角截圖。
# 用法：python3 tests/photo_compare.py SHOT_DIR OUT_DIR 照片名:截圖名 [...]
import sys, os
from PIL import Image, ImageDraw
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
shots, out = sys.argv[1], sys.argv[2]; os.makedirs(out, exist_ok=True)
for pair in sys.argv[3:]:
    ph, sh = pair.split(':')
    a = Image.open(os.path.join(ROOT, 'assets', 'photo-src', ph + '.jpg')).convert('RGB'); b = Image.open(os.path.join(shots, sh + '.png')).convert('RGB')
    H = 600; a = a.resize((round(a.width * H / a.height), H)); b = b.resize((round(b.width * H / b.height), H))
    W = Image.new('RGB', (a.width + b.width + 8, H + 28), 'white'); W.paste(a, (0, 28)); W.paste(b, (a.width + 8, 28))
    d = ImageDraw.Draw(W); d.text((6, 8), '照片 ' + ph, fill='black'); d.text((a.width + 14, 8), '模型 ' + sh, fill='black')
    W.save(os.path.join(out, f'{ph}__{sh}.jpg'), quality=85)
print('compare', len(sys.argv) - 3)
