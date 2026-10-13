# 東新國小 3D 校園（Campus Atlas：切片 v3 ＋ 東新版 v4）

- **東新版**（`dongxin.html`）：把由設計圖推得的真實平面資料（房間、走廊、樓梯、B1、戶外、樹、地點）套上本系統；證據分級與限制見 `docs/DONGXIN.md`，驗收表見 `docs/DONGXIN_ACCEPTANCE.md`。
- **示意切片**（`index.html`）：單棟參數化教室棟，驗證系統本身。

---

## 示意切片說明

一棟**可走進去**的教室棟：半戶外通廊、灰框玻璃教室面、木門、柱與欄杆、開放式雙跑樓梯、碰撞、樓層切換、導航到教室**門口**。

> ⚠ **資料狀態：示意（schematic）。** 尺寸、位置、教室名稱皆未經校方測繪。外觀語彙（紅磚、仿清水混凝土、灰框玻璃、綠色欄杆、半戶外通廊）僅參照已查證的東新國小新校舍照片。**不是**精確還原。

## 執行
```bash
python3 -m http.server 8000     # 在本資料夾；然後開 http://localhost:8000
```
Three.js r128 由 cdnjs 載入（與研究原站同版本，MIT 授權）。

## 操作
W/S 前後、**A/D 轉彎（鏡頭跟著轉）**、Q/E 橫移、Shift 跑、拖曳轉視角、滾輪縮放、V 切視角、Esc 取消導覽。左側選教室 →「帶我去」自動走到門口（含樓梯）；右側切樓層；鳥瞰可剖開樓層並點選教室。

## 架構（資料 / 幾何 / 導航分離）
見 `docs/ANALYSIS.md`。要換成真實平面：改 `src/data/wing.js`（或改為讀 JSON），幾何、碰撞、導航節點自動重算。

## 測試
```bash
node tests/dx.sim.test.mjs              # 東新版無頭：83 地點可達、59 條隨機跨層、5 座梯上下、亂衝零違規
python3 tests/dx.browser.py             # 東新版真 Chromium：21 項檢查＋截圖
python3 tests/dx.cam_metrics.py         # 東新版導航鏡頭量測
node tests/sim.test.mjs                 # 無頭：108 條路線可達、亂走 16 萬步零違規
python3 tests/browser.py                # 真 Chromium：鍵盤/導航/樓層/鳥瞰/搜尋/手機視窗＋截圖
python3 tests/cam_metrics.py            # 導航途中鏡頭位移／角速度指標
```
（`tests/browser.py` 需把 three.min.js 放在 `vendor/` 供離線攔截；`vendor/` 不入版控。）

驗收表見 `docs/ACCEPTANCE.md`。
