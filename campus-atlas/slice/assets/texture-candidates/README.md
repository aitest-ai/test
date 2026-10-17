# 材質候選（ComfyUI 生成，**未接入場景**）

- 產生：`tools/comfyui/gen_textures.py`（ComfyUI 0.41.0 無頭 HTTP API、SDXL base 1.0、30 步 dpmpp_2m karras、1024²），自訂節點 `tools/comfyui/campus_seamless.py` 把 UNet 與 VAE 的卷積改為環狀填充，輸出可四方連續拼貼。此處存 512² JPEG 縮圖；提示詞與種子見 `generation.json`。
- 授權：模型為 CreativeML Open RAIL++-M；提示詞只描述通用建材，未指定任何既有作品或品牌，作為**原創素材候選**。
- 狀態：僅供挑選。可用候選：`brick_red_8919`、`concrete_fair_1000`、`floor_terrazzo_*`、`paving_outdoor_8919`；`tile_beige_*` 品質不足。要接入時，在材質 JSON 新增一張 `image` 型紋理即可（尚未實作圖片型紋理，現有紋理全為程式生成）。
- **不是**東新國小的實拍材質，也不代表實際色票。
