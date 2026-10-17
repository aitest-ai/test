# ComfyUI 自訂節點：把 UNet 與 VAE 的 Conv2d 改成環狀填充（circular padding），生成可四方連續拼貼的紋理。
# 安裝：複製到 ComfyUI/custom_nodes/。注意：直接修改已載入的模型（本專案的批次生成專用）。
import torch

class CampusSeamlessTiling:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"model": ("MODEL",), "vae": ("VAE",)}}
    RETURN_TYPES = ("MODEL", "VAE")
    FUNCTION = "apply"
    CATEGORY = "campus"

    def apply(self, model, vae):
        n = 0
        for m in (model.model.diffusion_model, vae.first_stage_model):
            for mod in m.modules():
                if isinstance(mod, torch.nn.Conv2d) and mod.padding != (0, 0) and mod.padding != 'valid':
                    mod.padding_mode = 'circular'; n += 1
        print(f'[campus_seamless] circular padding on {n} conv layers')
        return (model, vae)

NODE_CLASS_MAPPINGS = {"CampusSeamlessTiling": CampusSeamlessTiling}
NODE_DISPLAY_NAME_MAPPINGS = {"CampusSeamlessTiling": "Campus Seamless Tiling"}
