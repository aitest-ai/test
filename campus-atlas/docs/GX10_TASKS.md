# GX10 任務清單：校園導覽品質提升（campus-quality-pass）

分支：`campus-quality-pass-20261017`（由 `campus-atlas-dongxin-v4-20261013` 分出，不動 main）
分工：Claude（雲端）負責設計、審查、改程式與規劃；GX10 上的 Claude Code 負責安裝工具、重運算、實測，再推回本分支。
交接方式：每輪 GX10 完成後，把結果寫在本檔最下方「執行紀錄」，並 push。

## 硬性原則（不可違反）
- 未經證實的尺寸、房間、位置一律標「示意」，不得宣稱精確還原。
- 優先順序：不穿牆 > 比例正確 > 渲染穩定 > 視覺美化。
- 每一輪都要有可玩的 demo（Vercel 預覽可開）。
- 只用新分支，不覆蓋 main 或其他 campus-atlas 分支。
- 參考站只當技術參考，不複製其美術與模型。
- 需要 sudo 或大量下載前，先告訴使用者。

## 現況（來自 README，v2）
- Three.js r128 CDN、程式化建築、WASD 第三人稱、基本建築阻擋、BFS 格網尋路、小地圖、觸控搖桿。
- 主要檔案：`src/app.js`（約 33KB，需拆分）、`src/dongxinFacade.js`、`src/schoolData.js`、`src/style.css`。
- 已知弱點：碰撞為基本阻擋、建築為直線量體、尋路為格網 BFS、單一大檔 app.js。

## 階段 0：盤點（GX10）
- [x] 回報：`nvidia-smi`、`node -v`、`python3 -V`、blender / ollama / docker 是否已安裝。
- [x] 在 campus-atlas 下 `python3 -m http.server` 實際跑一次，截圖並記錄 FPS 與 console 錯誤，寫入執行紀錄。

## 階段 1：工程基礎（GX10 實作，Claude 審查）
- [x] 導入 Vite + TypeScript（或先維持純 JS 但改 ES module + 本地 three 依賴，取代 CDN r128）。
- [ ] 把 `app.js` 拆成：scene / player / collision / navigation / ui / data，行為不變，先確保 demo 仍可玩。
- [ ] 加 Playwright 腳本：開頁、截圖、收 console 錯誤、量平均 FPS，輸出到 `tests/`。

## 階段 2：碰撞與導航（核心）
- [ ] 角色改為膠囊體碰撞，建築使用簡化碰撞體（不用視覺網格）；選項：Rapier 或自寫 AABB 掃掠。驗收：貼牆斜走不穿牆、不卡角。
- [ ] 導航由格網 BFS 改為 navmesh / 路徑網格（如 recast-navigation-js 或 three-pathfinding），並支援樓層與樓梯連接（示意）。
- [ ] 路線顯示：從 A 地點到 B 地點的地面導引線 + 小地圖同步。
- [ ] 角色與相機狀態機（鳥瞰 / 第三人稱 / 導覽中），切換不跳動。

## 階段 3：模型與材質品質
- [ ] 建立統一材質庫（紅磚、清水混凝土、鋁窗、玻璃、地磚…），資料驅動，方便各校「換膜」。
- [ ] 安裝 gltf-transform / gltfpack / toktx，建立資產壓縮腳本；若導入 glb，貼圖用 KTX2。
- [ ] Blender 無頭腳本：批次整理模型（法線、UV）、烘焙 AO，輸出 glb。裝不起來或不相容 aarch64 就記錄原因。
- [ ] 燈光與陰影：統一曝光、柔和陰影，驗收以 FPS 不低於階段 0 的八成為準。
- [ ] 可選（先確認 aarch64 CUDA 可用）：ComfyUI 生成牆面/地面材質候選，僅作原創素材。

## 階段 4：預覽與交付
- [ ] Vercel 預覽網址寫入執行紀錄。
- [ ] 更新 README：本輪「實際改動」與「仍為示意 / 已證實」清單。

## 執行紀錄（GX10 填寫，最新在最上面）

### 2026-10-17 階段 1-1：Vite＋本地 three（取代 CDN r128）
- `slice/` 改用 **Vite 8 + three 0.186（npm 本地依賴）**，純 JS ES module（暫不上 TypeScript：先保證行為不變，型別之後可用 JSDoc / `checkJs` 漸進導入）。
- 所有模組 `import * as THREE from 'three'`；HTML 移除 cdnjs `<script>`；`dongxin_geo.json` 改為 import（少一次 fetch）、底圖用 `new URL(..., import.meta.url)`。
- **畫面一致性**：r155 起光照單位改變、色彩管理預設開啟。處理方式：`ColorManagement.enabled=false`、`outputColorSpace=Linear`、燈光強度 ×π。新增 `tests/parity.py` 固定 5 視角比對 r128 與新版：平均差 0.00–0.71（0–255），差異 >24 的像素 **0%**（r128 自身重拍差異為 0）。`THREE.Clock` 改 `THREE.Timer`（避免棄用警告）。
- 指令：`npm run dev / build / preview / build:single`。`build:single` 取代舊 `tests/bundle_dx.py`，產生可 `file://` 開啟的單檔（3.1 MB，實測 84 目標載入、無錯誤）。沒用 vite-plugin-singlefile（其相依 braces 有 high 漏洞），改自寫 `scripts/singlefile.mjs`；`npm audit` 0 漏洞。
- Python 瀏覽器測試改服務 `dist/`、不再攔截 CDN（`vendor/three.min.js` 不再需要）。`vercel.json` 改為 Vite 建置（`npm ci` → `npm run build` → `dist/`）。
- 驗證：`npm test`（sim ALL PASS、dx.sim 149/149）；`dx.browser.py` 21/21；`browser.py`（示意切片）全過；console 0 錯誤 0 警告。
- 環境：Python Playwright 1.64 需要 chromium-1248，已下載（約 120 MB，放在 `~/.cache/ms-playwright`）。

### 2026-10-17 階段 0-3：補量東新版基準＋目標修正
**目標修正**：上方「現況」依頂層 v2 README 撰寫，但 v3～v7 的實際開發都在 `slice/`（東新版 `dongxin.html` / `src/main_dx.js`）：已有資料／物理／導航模組分離、格網碰撞、跨樓層樓梯導航與測試。v2（`src/app.js`）已停止開發。因此**之後各階段一律以 `slice/` 東新版為對象**；v2 原地保留不動。

既有測試基準（未改程式前）：`node tests/dx.sim.test.mjs` 149/149；`node tests/sim.test.mjs` ALL PASS；`tests/dx.browser.py`（Chromium）21/21，無 pageerror / console error。

新增 `slice/tests/perf.py`（之後各階段共用）：5 個情境（出生點第三人稱、按住 W 行走、鳥瞰、導航 校門→301、2F 走廊），1440×900，每情境 5 秒 rAF 計數。

| 模式 | 出生 | 行走 | 鳥瞰 | 導航中 | 2F 走廊 | 載入 |
|---|---|---|---|---|---|---|
| GPU（vsync） | 60.0 | 60.2 | 60.0 | 60.1 | 60.0 | 1.4 s |
| GPU 解除 vsync（`--uncap`） | 1558 | 1528 | 1404 | 1536 | 1378 | — |
| SwiftShader | 10.6 | 12.0 | 13.1 | 11.4 | 10.2 | 4.4 s |

- console / pageerror：**0**。three r128（CDN）。
- **階段 3 FPS 驗收基準**：GPU vsync 60 → 下限 48；為了看得出差異，另以 `--uncap` 最低情境 1378 的八成（≈1100）與 SwiftShader 最低 10.2 的八成（≈8.2）作輔助指標。
- 數據與截圖：`docs/stage0/dongxin_*.json|png`。

### 2026-10-17 階段 0-2：本地實測（`python3 -m http.server 8765`）
探測腳本：`tests/stage0_probe.py`（Playwright，1440×900 視窗，畫布 1122×828；FPS 以 5 秒 rAF 計數）。截圖在 `docs/stage0/`。

| 模式 | WebGL 渲染器 | 鳥瞰 FPS | 步行（按住 W）FPS |
|---|---|---|---|
| GPU（`--use-angle=gl`） | ANGLE NVIDIA GB10 / OpenGL 4.5 | **60.2** | **60.1** |
| 軟體（SwiftShader） | SwiftShader Vulkan 1.3 | 13.4 | 16.9 |

- 場景健康值：`rendered 1757`、建築 4、房間 35、照片立面 1，鳥瞰 / 步行模式切換正常。
- Console 錯誤：僅 1 筆 `404 /favicon.ico`（伺服器日誌證實），**無 JS pageerror**。
- 注意：60 FPS 是 rAF 的 vsync 上限，GPU 實際餘裕未量到；階段 3「不低於八成」以 GPU 模式 60 FPS 為基準 → 至少 48 FPS。SwiftShader 數值可作低階裝置參考。
- 觀察：仍從 cdnjs 載 three r128（`index.html:64`），需連網才能跑，階段 1 改本地依賴時處理。

### 2026-10-17 階段 0-1：環境盤點
| 項目 | 結果 |
|---|---|
| 架構 | aarch64（Linux 6.17.0-1014-nvidia），RAM 121 GiB |
| `nvidia-smi` | NVIDIA GB10，Driver 580.142，CUDA 13.0（統一記憶體，顯存欄顯示 Not Supported） |
| `node -v` | v22.22.2（npm 10.9.7） |
| `python3 -V` | Python 3.12.3 |
| blender | **未安裝**（階段 3 需要；安裝前會先詢問） |
| ollama | 已安裝，0.23.2 |
| docker | 已安裝，29.2.1 |
| Playwright | 系統 Python 無 `playwright` 模組；`~/.cache/ms-playwright` 已有 chromium-1217 / headless_shell。本輪在暫存 venv 安裝 playwright 1.64.0（未動系統環境） |
| Chromium | `/snap/bin/chromium`、`/usr/bin/chromium-browser` |
