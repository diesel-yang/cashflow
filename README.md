# 極速記帳 v3.3（build v17 完整版）

本版為可立即部署的手機優化靜態網頁 App（PWA 雛形），支援 **餐廳 + 個人（JACK / WAL / 共同 J+W）** 共用記帳、日期欄位、憑證拍照/上傳、轉帳清單、以及 **P&L 損益表**（含毛利與毛利率）。

---

## 功能總覽
### 記帳
- 欄位：日期、對象（餐廳 / JACK / WAL / **J+W 共支**）、收入/支出、分類、金額、商家、備註、**報銷**、**憑證拍照/上傳**（儲存 `receipt_url`）。
- **J+W 共同支出**：自動拆成 2 筆，JACK & WAL 各半（四捨五入處理小數）。
- 下方顯示 **本月明細**（即時更新）。

### 轉帳 / 還款
- from → to → 金額 → 建立；下方顯示 **本月轉帳紀錄**（即時）。

### 報表（P&L）
- **月份選擇器**（YYYY-MM）。
- 結構：**Revenue → COGS → Gross Profit（毛利/毛利率） → Personnel → Utilities → Marketing → Logistics → Admin → Tax → Transport → Finance → Misc → Net Income（淨利）**。
- 開關：**明細展開**、**按類型小計**（同類彙總）。

### 設定
- **分類管理**：內建完整餐廳常用分類，可 **新增 / 刪除**。
- **快捷管理**：新增/覆寫、刪除、上下移動（按「編輯」會自動捲到表單並高亮 1.5 秒）。
- **🔄 重置所有資料**（含確認視窗，清 LocalStorage / IndexedDB / Cache / Service Worker）。

---

## P&L 與 COGS 說明
- **P&L（損益表，Profit & Loss）**：在一段期間內的 **收入 − 成本/費用 = 淨利**。
- **COGS（銷貨成本）**：與製作/販售商品 **直接相關** 的成本，如：食材、包材、飲品原料等。
- **毛利（Gross Profit）**：Revenue − COGS。
- **毛利率（Gross Margin %）**：Gross Profit ÷ Revenue × 100%。

---

## 專案架構
index.html       # 主畫面（四分頁）
style.css        # 手機優化樣式
app.js           # 核心邏輯（記帳/轉帳/報表/分類/快捷/重置）
manifest.json    # PWA 設定（雛形）
sw.js            # Service Worker（雛形）
README.md        # 使用說明

資料儲存於瀏覽器 `localStorage`（離線可用）。
- `cashflow_cats`：分類清單
- `cashflow_records`：記帳紀錄
- `cashflow_transfers`：轉帳紀錄
- `cashflow_quicks`：快捷清單

---

## 安裝 / 部署
### GitHub Pages
1. 新增 repo，將整個資料夾的檔案上傳。
2. **Settings → Pages**：Branch 選 `main`、資料夾選根目錄，Save。
3. 等待數十秒後，造訪 Pages 網址即可。
4. 若畫面未更新，在網址後加 `?v=17.0` 或強制重新整理。

### Netlify / Vercel
- 建立新專案，Deploy 目錄為根目錄（不需 build）。

---

## 使用快速上手
1. **記帳**  
   - 選日期、對象、收入/支出、分類、金額，可（選填）商家/備註/報銷。  
   - 若要保存發票或收據，點「上傳/拍照憑證」。  
   - 完成後按「記錄」，下方「本月明細」立即出現。  
   - **J+W 共支** 會自動拆成 JACK/WAL 兩筆。

2. **轉帳**  
   - 選擇 from/to 和金額 → 「建立轉帳」，下方「轉帳紀錄」立即顯示。  

3. **報表**  
   - 用月份選擇器切月份。  
   - 先看上方 KPI：營收、毛利、毛利率；再看各區塊與淨利。  
   - 勾 **「明細展開」** 看每一筆；勾 **「按類型小計」** 看類別彙總。

4. **設定**  
   - 新增/刪除分類；管理快捷；需要清空資料就按「🔄 重置」。

---

## 常見問題（FAQ）
- **Q：為什麼報表都是 0？**  
  A：可能當月沒有資料。先在「記帳」頁新增幾筆，再回來看。
- **Q：憑證去哪裡？**  
  A：保存在每筆紀錄的 `receipt_url`（Base64），在明細可點「憑證」連結查看。
- **Q：要怎麼同步到另一台裝置？**  
  A：本版以本機儲存為主。可後續加入 **CSV 匯出/匯入** 或 **GitHub Pages JSON 同步**（可擴充）。
- **Q：J+W 怎麼算？**  
  A：記一筆金額 X 時，自動拆成 JACK（X/2）與 WAL（X/2，含四捨五入修正）。
- **Q：點了重置，怎麼又跳回初始？**  
  A：重置會清空所有本機資料與快取，頁面會自動重新載入。

---

## 範例資料格式
```json
{
  "ts": 1735756800000,
  "date": "2025-09-01",
  "scope": "restaurant",
  "type": "expense",
  "category": "食材-蔬果",
  "amount": 650,
  "merchant": "傳統市場",
  "note": "青菜",
  "reimburse": false,
  "receipt_url": "data:image/jpeg;base64,..." 
}

## 後續擴充建議
	•	CSV 匯入/匯出、GitHub Pages JSON 同步
	•	報銷/轉帳 淨額化 與 P&L 交互沖銷
	•	自動分類規則管理（前端可編輯）
	•	自動備份到雲端（例如 GitHub/Gist、S3、Drive API）

## 頁面底部顯示版本號：v17（用來確認載入是否為最新版）。
