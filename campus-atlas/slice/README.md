# 東新國小 3D 校園（Campus Atlas：東新版＋示意切片）

- **東新版**（`dongxin.html`，主產品）：把由設計圖推得的平面資料（房間、走廊、樓梯、B1、戶外、樹、地點）套上本系統；證據分級與限制見 `docs/DONGXIN.md`，驗收表見 `docs/DONGXIN_ACCEPTANCE.md`。
- **示意切片**（`index.html`）：單棟參數化教室棟，驗證系統本身。
- **資產管線檢視頁**（`glb-viewer.html?src=…`）：檢查壓縮後的 glb（KTX2＋meshopt）。

> ⚠ **資料狀態：示意（schematic），未經校方測繪，不是精確還原。** 房間位置由使用者上傳的設計圖格網化推得（每格約 0.30 m），房間名稱暫定；外觀語彙參照已查證的新校舍照片與校方簡報。完整清單見下方「仍為示意／已證實」。

## 執行
```bash
npm ci                 # 第一次：安裝 three（本地依賴，不走 CDN）與 Vite
npm run dev            # 開發伺服器：http://localhost:5173/dongxin.html（東新版）、/（示意切片）
npm run build          # 輸出 dist/（純靜態）；npm run preview 可預覽
npm run build:single   # 東新版單一 HTML（資料、底圖內嵌）→ dongxin_single.html，可用 file:// 開啟
```
網址參數：`?skin=demo-alt`（換膜示範）、`?shadows=0`（關陰影）、`?degrade=0`（停用低 FPS 自動關陰影，量測用）。

## 操作
W/S 前後、**A/D 轉彎（鏡頭跟著轉）**、Q/E 橫移、Shift 跑、拖曳轉視角、滾輪縮放、V 切視角（第三人稱→第一人稱→鳥瞰，平滑過渡）、Esc 取消導覽。左側選教室／地點 →「帶我去」沿地面導引帶自動走過去（含樓梯與地下室），小地圖同步顯示已走／剩餘路段；右側切樓層；鳥瞰可剖開樓層並點選教室。

## 架構
```
data/dongxin_geo.json        資料（設計圖推得的格網）       data/materials.*.json   材質（換膜）
src/dongxin/model.js         資料 → 房間／走廊／樓梯／門／可走格（無 three 依賴）
src/dongxin/world.js         碰撞：膠囊 × 簡化碰撞體（不可走格 AABB＋解析式梯面）
src/dongxin/pathgrid.js      導航：路徑網格（淨空成本、樓梯入口圖、可轉乘）
src/dongxin/nav.js           組成含樓梯航點的路線
src/dongxin/scene.js         場景工廠（只認材質「角色」）
src/dongxin/app/             stage（渲染）、lighting（曝光／陰影）、player、camera（狀態機）、input、guide、routeline
src/dongxin/ui/              panel、minimap
src/materials/               紋理產生器＋材質庫（由 JSON 建材質）
src/main_dx.js               組裝＋主迴圈＋window.__dx 測試掛鉤
scripts/                     glb 匯出、壓縮（KTX2／meshopt）、Blender 無頭處理、單檔建置
tools/blender、tools/comfyui Blender（Docker arm64）與 ComfyUI 材質候選工具
```
碰撞與導航都不讀 three 物件，所以能在 Node 跑大量模擬測試。示意切片的架構見 `docs/ANALYSIS.md`。

## 測試
```bash
npm test                                # Node：sim、dx.sim（84 目標可達）、dx.collision（穿牆／卡角）、dx.nav（樓梯選擇／淨空／轉乘）、materials
npm run build                           # 以下瀏覽器測試都服務 dist/
python3 tests/dx.browser.py             # 東新版 21 項檢查
python3 tests/dx.route.py               # 地面導引帶＋小地圖同步
python3 tests/dx.camstate.py            # 鏡頭狀態機：切換不跳動
python3 tests/dx.cam_metrics.py         # 導覽途中鏡頭位移／角速度
python3 tests/perf.py [--soft|--uncap] [--min-fps N]   # 5 情境 FPS、console 錯誤、截圖 → tests/perf-out/
python3 tests/parity.py shoot DIR [--query '?skin=…']  # 固定視角截圖；parity.py diff A B 像素差
python3 tests/glb_viewer.py assets-out/dongxin.glb     # 壓縮後 glb 能以 KTX2 載入
python3 tests/browser.py                # 示意切片
```
Python 測試依賴見 `tests/requirements.txt`。

## 資產管線
```bash
npm run assets:export      # 程式化校舍 → assets-src/dongxin_raw.glb（three GLTFExporter）
npm run assets:compress    # 去重／合併／量化／meshopt＋貼圖 KTX2（toktx）→ assets-out/dongxin.glb（8.8 MB → 1.7 MB）
npm run assets:blender     # Blender 4.0（Docker arm64）整理法線／UV＋烘焙 AO → 壓縮 → assets-out/dongxin_ao.glb
scripts/install_ktx.sh     # 安裝 toktx（KTX-Software 4.4.2，免 sudo）
```
執行期仍用程式化建模；glb 是管線輸出，尚未取代即時場景。

---

## 本輪實際改動（2026-10-17，分支 `campus-quality-pass-20261017`）
詳細數據與驗收見 `../docs/GX10_TASKS.md` 的執行紀錄。
1. **工程**：Vite 8＋three 0.186（npm 本地依賴，取代 CDN r128；與 r128 畫面像素一致）；`main_dx.js` 拆成 stage／player／camera／input／guide／ui（拆前拆後逐像素相同）；Playwright 效能／健康腳本。
2. **碰撞**：膠囊（R=0.3）× 簡化碰撞體，精確圓×AABB 判定＋貼牆滑動＋凸角繞行。斜推牆最大穿入 0.297 m → 0.007 m；凸角擦邊卡住 834/834 → 0/834。
3. **導航**：路徑網格（淨空成本＋樓梯入口圖 Dijkstra，支援轉乘）。選錯樓梯 4/600 → 0；平均淨空 2.17 → 2.33 m；每條路線 3.7 → 2.0 ms。
4. **路線顯示**：貼地面與梯級的導引帶＋流動箭頭、走過即隱藏；小地圖同步已走／剩餘、梯口樓層標記；狀態列剩餘公尺。
5. **鏡頭狀態機**：third／guide／first／bird，切換 0.8 秒平滑過渡（單幀位移占比 100% → 3.1%）。
6. **材質庫**：材質 JSON（紋理參數＋材質＋場景角色對照），`?skin=` 換膜；預設畫面逐像素不變。
7. **燈光**：統一曝光係數＋跟隨式柔和陰影＋低 FPS 自動關陰影。GPU 60 FPS（≥ 階段 0 的八成）。
8. **資產管線**：glb 匯出、KTX2／meshopt 壓縮、Blender 無頭 AO 烘焙（aarch64 以 Docker 解決）、ComfyUI 可拼貼材質候選（未接入）。

## 仍為示意／已證實
| 項目 | 狀態 | 依據 |
|---|---|---|
| 場地外框、各層房間矩形、梯間位置、走廊範圍、樹位、地點座標 | **圖面推得（A 級）**：取自使用者上傳的設計圖，格網化（約 0.30 m）後的近似值 | `data/dongxin_geo.json` |
| 棟名（集賢樓／沐風苑／蒙萌園）與外牆語彙（磚紅面磚、清水混凝土灰、米黃面磚＋藍屋簷） | **已證實（語彙）**：校方簡報＋使用者照片＋使用者說明；個別房間的棟別歸屬由位置推定 | `docs/DONGXIN.md` |
| 比例尺 0.0756 m/px、層高 3.9 m、樓層對應、門的位置、走廊連通修復 | **推論（B 級）**：為了可走而做的建模決定 | `src/dongxin/model.js` |
| 房間名稱、精確尺寸、樓梯踏步（踢高約 18 cm、雙跑 U 形）、教室桌椅排列 | **示意** | — |
| 材質紋理與顏色 | **示意**：全為程式生成，不是照片貼圖、不是實測色票；ComfyUI 候選亦為生成素材 | `data/materials.*.json` |
| 陰影方向與強度 | **示意**：固定的太陽方向，不對應實際方位與時間 | `src/dongxin/app/lighting.js` |
| B1 內部、停車場坡道尺寸、校門細節 | **示意**（B1 幾乎是空的；坡道未接入導航） | `docs/DONGXIN.md` |
| 碰撞與導航的正確性 | **已驗證（對模型而言）**：自動測試量測，不代表與實地一致 | `tests/` |
| 手機觸控 | **未在實體手機測試**（只有版面截圖） | — |
| Vercel 預覽 | **待使用者處理**：見執行紀錄「Vercel 預覽」 | `../docs/GX10_TASKS.md` |
