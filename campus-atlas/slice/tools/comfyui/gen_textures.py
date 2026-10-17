# 用 ComfyUI（HTTP API，無頭）批次生成牆面／地面材質候選：SDXL base 1.0＋環狀填充（可拼貼）。
# 先啟動：~/.local/opt/comfyui/venv/bin/python ~/.local/opt/comfyui/app/main.py --listen 127.0.0.1 --port 8188 --disable-auto-launch
# 用法：python3 tools/comfyui/gen_textures.py OUT_DIR [--seeds 2] [--steps 30]
# 只作原創素材候選；未接入場景。模型授權：CreativeML Open RAIL++-M。
import json, sys, time, urllib.request, os, shutil
OUT = sys.argv[1]; os.makedirs(OUT, exist_ok=True)
opt = lambda k, d: type(d)(sys.argv[sys.argv.index(k) + 1]) if k in sys.argv else d
SEEDS, STEPS, API = opt('--seeds', 2), opt('--steps', 30), 'http://127.0.0.1:8188'
NEG = 'text, watermark, logo, signature, perspective, vanishing point, people, plants, shadows from objects, frame, border, vignette, blurry, 3d render of a room'
PROMPTS = {
  'brick_red':    'seamless texture, flat orthographic photo of red-brown ceramic face brick wall tiles, running bond, thin light grey mortar joints, Taiwanese school building facade, even daylight, high detail',
  'concrete_fair':'seamless texture, flat orthographic photo of fair-faced architectural concrete wall, smooth grey surface, faint formwork panel seams and small tie holes, even daylight, high detail',
  'tile_beige':   'seamless texture, flat orthographic photo of beige glazed ceramic facade tiles, square grid, slight color variation, light mortar joints, even daylight, high detail',
  'floor_terrazzo':'seamless texture, top-down flat photo of light grey terrazzo school corridor floor, small stone chips, polished, even lighting, high detail',
  'paving_outdoor':'seamless texture, top-down flat photo of outdoor interlocking concrete paving blocks, warm grey, herringbone pattern, even daylight, high detail',
}
def wf(prompt, seed, prefix):
    return {
      '1': {'class_type': 'CheckpointLoaderSimple', 'inputs': {'ckpt_name': 'sd_xl_base_1.0.safetensors'}},
      '2': {'class_type': 'CampusSeamlessTiling', 'inputs': {'model': ['1', 0], 'vae': ['1', 2]}},
      '3': {'class_type': 'CLIPTextEncode', 'inputs': {'text': prompt, 'clip': ['1', 1]}},
      '4': {'class_type': 'CLIPTextEncode', 'inputs': {'text': NEG, 'clip': ['1', 1]}},
      '5': {'class_type': 'EmptyLatentImage', 'inputs': {'width': 1024, 'height': 1024, 'batch_size': 1}},
      '6': {'class_type': 'KSampler', 'inputs': {'model': ['2', 0], 'positive': ['3', 0], 'negative': ['4', 0], 'latent_image': ['5', 0], 'seed': seed, 'steps': STEPS, 'cfg': 6.5, 'sampler_name': 'dpmpp_2m', 'scheduler': 'karras', 'denoise': 1.0}},
      '7': {'class_type': 'VAEDecode', 'inputs': {'samples': ['6', 0], 'vae': ['2', 1]}},
      '8': {'class_type': 'SaveImage', 'inputs': {'images': ['7', 0], 'filename_prefix': prefix}},
    }
def post(path, data): return json.loads(urllib.request.urlopen(urllib.request.Request(API + path, json.dumps(data).encode(), {'Content-Type': 'application/json'})).read())
def get(path): return json.loads(urllib.request.urlopen(API + path).read())
log = []
for name, p in PROMPTS.items():
    for k in range(SEEDS):
        seed = 1000 + k * 7919; t0 = time.time(); pid = post('/prompt', {'prompt': wf(p, seed, f'campus_{name}_{seed}')})['prompt_id']
        while True:
            h = get('/history/' + pid)
            if pid in h and h[pid].get('status', {}).get('completed'): break
            if pid in h and h[pid].get('status', {}).get('status_str') == 'error': raise SystemExit('生成失敗：' + json.dumps(h[pid]['status'])[:500])
            time.sleep(1)
        img = [i for o in h[pid]['outputs'].values() for i in o.get('images', [])][0]
        src = os.path.expanduser(f"~/.local/opt/comfyui/app/output/{img.get('subfolder','')}/{img['filename']}").replace('//', '/')
        dst = os.path.join(OUT, f'{name}_{seed}.png'); shutil.copy(src, dst)
        log.append({'name': name, 'seed': seed, 'sec': round(time.time() - t0, 1), 'file': dst}); print(log[-1], flush=True)
json.dump({'model': 'sd_xl_base_1.0 (CreativeML Open RAIL++-M)', 'steps': STEPS, 'size': 1024, 'prompts': PROMPTS, 'negative': NEG, 'items': log}, open(os.path.join(OUT, 'generation.json'), 'w'), ensure_ascii=False, indent=1)
