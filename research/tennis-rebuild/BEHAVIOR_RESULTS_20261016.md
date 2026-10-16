# REA 實際操作驗證結果（2026-10-16）

研究目標：https://badmintonduel.com/

## 兩次工作流程
- [第一輪：首頁、新手教學與靜態分析](https://github.com/aitest-ai/test/actions/runs/38828534555)
- [第二輪：英文介面下的遊戲操作與靜態分析](https://github.com/aitest-ai/test/actions/runs/38829419432)

REA 6.4.0 在兩輪都成功執行 \`list-browser-targets\`、\`inspect-web-page\`、\`analyze-web-bundle\`（退出碼 0）。

第二輪的瀏覽器成功進入 AI 單打球場，畫面顯示 0:0、Net Magician AI、Easy / Beach / 7 pts；但**尚無一球完成及得分變更的重播證據**。

雙打模式和私人房間仍未成功進入。兩輪都未實際觀察到 WebSocket 建立；這表示測試未涵蓋即時連線，**不是**原網站不支援多人。

技術問題：網站依環境切換中英介面，按鈕點擊有時觸發了遊戲狀態變更，但 Playwright locator 因導航或 React UI 重新掛載而超時。應用 DOM/畫面狀態判斷成功，而不是只看 click return。

## 下一步
1. 記錄單打完整一球、得分變化、回合流程。
2. 定位 AI 雙打切換入口並檢查隊友站位。
3. 用兩個自有隔離瀏覽器建立私人房間、加入、離開；僅存事件時間與訊息數量。
4. 比較原站行為並**獨立重新實作**網球版，使用網球專屬拍面碰撞、上下旋、落地反彈及網球計分。

操作程式：[observe_matches.py](../tennis-rebuild/observe_matches.py)；截圖及結果請見上方 Actions artifacts。
