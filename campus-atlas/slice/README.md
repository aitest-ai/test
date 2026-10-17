# 東新國小 3D 校園（Campus Atlas：切片 v3 ＋ 東新版 v4）

- **東新版**（`dongxin.html`）：把由設計圖推得的真實平面資料（房間、走廊、樓梯、B1、戶外、樹、地點）套上本系統；證據分級與限制見 `docs/DONGXIN.md`，驗收表見 `docs/DONGXIN_ACCEPTANCE.md`。
- **示意切片**（`index.html`）：單棟參數化教室棟，驗證系統本身。

---

## 示意切片說明

一棟**可走進去**的教室棟：半戶外通廊、灰框玻璃教室面、木門、柱與欄杆、開放式雙跑樓梯、碰撞、樓層切換、導航到教室**門口**。

> ⚠ **資料狀態：示意（schematic）。** 尺寸、位置、教室名稱皆未經校方測繪。外觀語彙（紅磚、仿清水混凝土、灰框玻璃、綠色欄杆、半戶外通廊）僅參照已查證的東新國小新校舍照片。**不是**精確還原。

## 執行
```bash
npm ci                 # 第一次：安裝 three（本地依賴，不再走 CDN）與 Vite
npm run dev            # 開發伺服器；開 http://localhost:5173/dongxin.html（東新版）或 /（示意切片）
npm run build          # 輸出 dist/（純靜態，可放任何主機）；npm run preview 可預覽
npm run build:single   # 東新版單一 HTML（資料、底圖內嵌）→ dongxin_single.html，可直接以 file:// 開啟
```
Three.js 由 npm 安裝（`three@0.186`，MIT）。為了讓畫面與先前 r128 版一致，渲染器維持線性色彩輸出、燈光強度 ×π（見 `src/main_dx.js` 開頭註解）。

## 操作
W/S 前後、**A/D 轉彎（鏡頭跟著轉）**、Q/E 橫移、Shift 跑、拖曳轉視角、滾輪縮放、V 切視角、Esc 取消導覽。左側選教室 →「帶我去」自動走到門口（含樓梯）；右側切樓層；鳥瞰可剖開樓層並點選教室。

## 架構（資料 / 幾何 / 導航分離）
見 `docs/ANALYSIS.md`。要換成真實平面：改 `src/data/wing.js`（或改為讀 JSON），幾何、碰撞、導航節點自動重算。

## 測試
```bash
npm test                                # 無頭（Node）：sim.test.mjs ＋ dx.sim.test.mjs
npm run build && python3 tests/dx.browser.py   # 東新版真 Chromium：21 項檢查＋截圖（服務 dist/）
python3 tests/perf.py [--soft|--uncap]  # 效能：5 情境 FPS、console 錯誤、截圖 → tests/perf-out/
python3 tests/parity.py shoot DIR       # 固定視角截圖；parity.py diff A B 做像素差比對
node tests/sim.test.mjs                 # 示意切片無頭：108 條路線可達、亂走 16 萬步零違規
python3 tests/browser.py                # 示意切片真 Chromium
```
Python 測試需要 `pip install playwright`（`parity.py diff` 另需 numpy、pillow）。

驗收表見 `docs/ACCEPTANCE.md`。
