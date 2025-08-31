[README.md](https://github.com/user-attachments/files/22067362/README.md)
# 極速記帳 PWA v3.3（餐廳＋個人 JACK/WAL）

## 系統架構
- 前端：Vue 3 + LocalForage (瀏覽器 IndexedDB)
- 部署：GitHub Pages (可 PWA 安裝到手機)
- 雲端同步：透過 JSON 檔上傳至 GitHub Pages
- 支援 CSV 匯入/匯出
- Service Worker 實作離線快取

## 功能
1. 餐廳與個人（JACK/WAL）雙帳戶記帳
2. 支出/收入快速輸入，支援自動分類與商家關鍵字規則
3. 憑證拍照上傳，保存收據
4. 轉帳/還款流程，自動沖銷報銷
5. 餐廳 P&L 報表（收入/COGS/人事/水電/行銷/行政...＋比率）
6. 個人預算設定，提供近超支提醒
7. 分類可直接在前端新增/刪除
8. CSV 匯出/匯入（支援合併更新）
9. 多裝置同步（JSON 匯出/匯入）
10. PWA 安裝，支援手機離線使用

## 操作手冊
- **記帳**：選擇帳戶（餐廳/JACK/WAL）、輸入金額與分類，按「記錄」即可
- **轉帳**：選擇來源/目標帳戶與金額，系統自動產生轉帳並沖銷報銷
- **報表**：可切換餐廳或個人，檢視月度收入/支出，下載 CSV，餐廳模式下顯示 P&L 與 KPI
- **設定**：
  - 管理分類（餐廳/個人可直接新增或刪除）
  - 設定預算金額，支出接近或超過預算時會提醒
  - 匯入 CSV 或從雲端 JSON 拉取資料
  - 匯出 JSON 檔，上傳至 GitHub Pages 以同步多裝置
- **版本號**：頁面底部會自動顯示當前版本與日期，方便辨識是否為最新部署

## 部署
1. 將所有檔案放到 GitHub repo 根目錄（含 `.nojekyll`）
2. 在 repo Settings → Pages 啟用 GitHub Pages
3. 透過 `https://username.github.io/repo/` 開啟
