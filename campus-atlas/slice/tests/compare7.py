# 前後對照圖：兩組 shots7.py 截圖 → 每視角「左舊右新」一張，加一張總覽。
# 用法：python3 tests/compare7.py BEFORE_DIR AFTER_DIR OUT_DIR [--overview NAME.jpg] [--labels 舊,新]
import os, sys
from PIL import Image, ImageDraw, ImageFont
A, B, OUT = sys.argv[1:4]; os.makedirs(OUT, exist_ok=True)
ov = sys.argv[sys.argv.index('--overview') + 1] if '--overview' in sys.argv else os.path.join(OUT, 'overview.jpg')
lab = (sys.argv[sys.argv.index('--labels') + 1] if '--labels' in sys.argv else '改前,改後').split(',')
VIEWS = [('gate', '校門'), ('corr2f', '2F 走廊'), ('class', '教室'), ('bird', '鳥瞰'), ('first', '運動場（第一人稱）'), ('m_spawn', '手機・出生點'), ('m_corr2f', '手機・2F 走廊')]
def font(sz):
    for f in ['/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc', '/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc', '/usr/share/fonts/noto-cjk/NotoSansCJK-Regular.ttc']:
        if os.path.exists(f): return ImageFont.truetype(f, sz)
    return ImageFont.load_default()
F = font(26); pairs = []
for n, title in VIEWS:
    pa, pb = os.path.join(A, n + '.png'), os.path.join(B, n + '.png')
    if not (os.path.exists(pa) and os.path.exists(pb)): continue
    a, b = Image.open(pa).convert('RGB'), Image.open(pb).convert('RGB')
    if n.startswith('m_'): a, b = a.resize((a.width // 2, a.height // 2)), b.resize((b.width // 2, b.height // 2))
    W, H = a.width + b.width + 12, a.height + 44; im = Image.new('RGB', (W, H), 'white'); im.paste(a, (0, 44)); im.paste(b, (a.width + 12, 44))
    d = ImageDraw.Draw(im); d.text((8, 6), f'{title}・{lab[0]}', fill='#333', font=F); d.text((a.width + 20, 6), f'{title}・{lab[1]}', fill='#333', font=F)
    im.save(os.path.join(OUT, n + '.jpg'), quality=85); pairs.append(im)
# 總覽：桌機 5 組（縮到寬 1200）一欄，手機 2 組並排在最後
desk = [p for p, (n, _) in zip(pairs, VIEWS) if not n.startswith('m_')]; mob = [p for p, (n, _) in zip(pairs, VIEWS) if n.startswith('m_')]
desk = [p.resize((1200, int(p.height * 1200 / p.width))) for p in desk]
mobrow = None
if mob:
    mob = [p.resize((594, int(p.height * 594 / p.width))) for p in mob]; mobrow = Image.new('RGB', (1200, max(p.height for p in mob)), 'white')
    for i, p in enumerate(mob): mobrow.paste(p, (i * 606, 0))
rows = desk + ([mobrow] if mobrow else []); S = Image.new('RGB', (1200, sum(r.height + 8 for r in rows)), 'white'); y = 0
for r in rows: S.paste(r, (0, y)); y += r.height + 8
S.save(ov, quality=82); print('wrote', len(pairs), 'pairs +', ov, S.size)
