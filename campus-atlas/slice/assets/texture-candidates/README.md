# 材質候選（ComfyUI 生成，原創生成材質（示意））

- 產生：`tools/comfyui/gen_textures.py`（ComfyUI 0.41.0 無頭 HTTP API、SDXL base 1.0、30 步 dpmpp_2m karras、1024²），自訂節點 `tools/comfyui/campus_seamless.py` 把 UNet 與 VAE 的卷積改為環狀填充，輸出可四方連續拼貼。此處存 512² JPEG 縮圖；提示詞與種子見 `generation.json`（第一輪）與 `generation_round2.json`（第二輪）。
- 授權：模型為 CreativeML Open RAIL++-M；提示詞只描述通用建材，未指定任何既有作品或品牌，作為**原創素材候選**。
- **不是**東新國小的實拍材質，也不代表實際色票。

## 狀態
| 候選 | 狀態 |
|---|---|
| `brick_red_8919` | **已接入**（紅磚面磚）→ `assets/textures/brick_red.jpg` |
| `concrete_fair_1000` | **已接入**（仿清水混凝土，疊模板縫與繫結孔）→ `assets/textures/concrete_fair.jpg` |
| `floor_terrazzo_1000` | **已接入**（室內地磚／磨石子，疊 1 m 分割條）→ `assets/textures/floor_terrazzo.jpg` |
| `paving_outdoor_8919` | **已接入**（戶外鋪面，以細節層疊在地面底圖的鋪面色上）→ `assets/textures/paving_outdoor.jpg` |
| `wood_door_8919`（第二輪） | **已接入**（木門）→ `assets/textures/wood_door.jpg` |
| `tile_beige_*`、`tile_beige_v2_*`（第二輪重生成） | 不採用：格線歪斜、斜向排列、黑色粗縫或混入白磚；米黃面磚維持程式化 |
| `metal_louver_*`（第二輪） | 不採用：三張都生成成斜向魚鱗狀，不是水平百葉；金屬百葉維持程式化 |
| 其餘（`*_1000`／`*_8919` 另一張、`wood_door_1000/16838`） | 備選，未接入 |

交付檔由 `tools/comfyui/prep_textures.py` 產生：環狀縮圖到 512²（保持可拼貼）、平均色對齊原本程式化紋理的底色、混凝土氣孔淡化。
