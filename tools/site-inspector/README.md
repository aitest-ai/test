# 3DTYPSMap 雲端檢查工具

目標：https://3dtypsmap.vercel.app/

使用 GitHub Actions 的 Chromium 瀏覽器打開 3 個公開網址，取得網路請求紀錄、JS 技術特徵、公開 GLB/GLTF 模型的結構摘要，以及畫面截圖。僅分析公開資源，不使用登入帳號、跳過網站保護、提交表單或保存模型與完整 JS 原始碼。

本分支的 workflow 在推送時自動執行。到 GitHub Actions 查看 Inspect 3DTYPSMap read-only 工作項目的 Artifacts，可取得 3dtypsmap-inspection 壓縮檔。

提醒：技術特徵是線索而非證明，須以資源內容核對。GitHub 雲端環境的 IP、WebGL 與網路安全限制可能造成擷取失敗。
