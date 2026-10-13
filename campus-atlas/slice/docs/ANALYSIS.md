# 技術證據分級與原型缺陷盤點

## A. 證據分級（來源：研究交接包 `01_原始擷取證據/` 與 `技術調查報告_證據與推論.md`）

| 等級 | 內容 |
|---|---|
| **資料直接觀察** | 3 個頁面 HTTP 200；71 筆去重資源紀錄；Three.js r128、GLTFLoader、SkeletonUtils、meshopt_decoder、Firebase App/Firestore Lite 12.19.0；`rooms.json`、`firebase-config.json` 請求；35 個人物 GLB（每個 metadata 報 4 組動畫）；內嵌 JS 486,754 字元中解析到的函式**名稱**（`buildWing`、`buildGround`、`buildLiftTower`、`addWall`、`gableRoof`、`buildGrid`、`findPath`、`collide`、`pointBlocked`、`bodyBlocked`、`paintFloorMap`、`texFacade`…）；pageerror = 0 |
| **有根據的推論（高信心）** | 校舍幾何大多由程式生成（有幾何函式名稱＋`new THREE.*Geometry` 出現次數＋資源紀錄中沒有校舍 GLB）；教室資料與 3D 幾何分離（`rooms.json` 獨立請求）；碰撞與路徑是獨立函式 |
| **尚未證實** | `findPath` 是 A*／BFS／Dijkstra 哪一種；樓梯垂直動線的實作；碰撞網格形式；Firestore 資料結構與權限；實際操作手感（歡迎畫面未被點擊）；任何三角形數／幀率 |
| **不能宣稱** | 已取得原站完整原始碼、可轉用 35 個人物模型、大勇國小配置可挪作東新國小 |

本切片**只借用工程方向**（程式化校舍、資料／幾何／導航分離、碰撞獨立於視覺、路網含樓層轉換邊），沒有複製原站任何程式、模型、貼圖或配置。

## B. 技術上最值得採用的架構

```
data/      WING 參數（尺寸、教室、梯間）──只放資料，可換成 JSON
model/     layout.js：由參數衍生 牆 / 碰撞體 / 洞口 / 梯間 / 導航節點（不依賴 Three.js）
physics/   collision.js：2D 圓 × AABB（含 y 範圍）＋「可站立表面」查詢（樓板、梯級）
nav/       navgraph.js：節點圖＋Dijkstra，樓層用明確的「梯跑邊」；walker 沿航點行走
scene/     buildingFactory.js 等：只讀 layout 畫圖（Batch 合併同材質方塊）
ui/ main.js 輸入、鏡頭、搜尋、樓層鈕
tests/     sim.test.mjs（無頭：可達性／不穿牆／亂走）、browser.py（真 Chromium）
```
關鍵設計：**碰撞與導航都不讀 Three 物件**，所以能在 Node 跑 16 萬步亂走測試。

## C. 現有原型（campus-atlas-v2）缺陷

依 `src/app.js` 實際程式（`isBlocked`、`movePlayer`、`routeDestination`、`findPath`）核對：

### 高優先
| # | 領域 | 缺陷 | 證據 |
|---|---|---|---|
| H1 | 幾何 | 校舍是單純長方體量體；無室內牆、走廊、樓梯；README 自述「外露樓梯造型不可供實際步行」 | `buildBuilding`、README |
| H2 | 碰撞 | 只有 2D AABB 障礙物，無 y 軸、無樓板／梯級；角色無法「站在」任何高度 | `isBlocked`、`movePlayer` |
| H3 | 導航 | 2 m 格網 BFS、無樓層；教室目的地是「建築正面前 3.2 m」而非門口 | `findPath`、`routeDestination` |
| H4 | 垂直動線 | 沒有樓梯與樓層轉換邊，無法跨層導航 | 同上 |
| H5 | 資料耦合 | 幾何直接由 `school.buildings` 的方塊參數產生，教室位置由均分推得；沒有獨立導航圖 | `allRooms()` |

### 中優先
| # | 領域 | 缺陷 |
|---|---|---|
| M1 | 走廊 | 沒有半戶外通廊（欄杆、柱、邊梁）與教室走廊面（窗格、門、氣窗） |
| M2 | 鏡頭 | 步行模式拖曳只改 heading，無鏡頭碰撞／平滑；樓梯鏡頭未處理 |
| M3 | UI | 樓層鈕只在鳥瞰隱藏上層；步行時不能切樓層到走廊 |
| M4 | 貼圖 | 紋理簡單，無磚縫／混凝土模板縫等語彙 |
| M5 | 測試 | 只有 smoke（能渲染、能走 4.1 m）；沒有路線可達性、穿牆、樓層連通測試 |
| M6 | 觸控 | 有搖桿但沒有針對樓梯／轉彎的鏡頭跟隨 |

## D. 本切片尚未解決（誠實清單）
- 所有尺寸、位置、教室名稱皆為**示意**；沒有校方測繪。
- 只做一棟；沒有操場、校門、多棟連通；室內沒有可互動物件。
- 樓梯為雙跑（U 形）示意，梯級尺寸（踢高 18 cm、踏深 28 cm）是常見建築值，不是東新國小實測。
- 鏡頭進入梯口時仍有一次約 0.8–1.1 m 的單幀位移（撞牆收近），已由 10.5 降到此值；尚非完美。
- 平坦的紅磚材質為 Canvas 程式生成，不是校舍照片貼圖（避免授權問題）。
