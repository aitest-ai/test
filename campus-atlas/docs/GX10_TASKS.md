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
- [ ] 在 campus-atlas 下 `python3 -m http.server` 實際跑一次，截圖並記錄 FPS 與 console 錯誤，寫入執行紀錄。

## 階段 1：工程基礎（GX10 實作，Claude 審查）
- [ ] 導入 Vite + TypeScript（或先維持純 JS 但改 ES module + 本地 three 依賴，取代 CDN r128）。
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
