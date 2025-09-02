# 極速記帳 v3.4（Jack & Was 版）

這個版本整合了：
- 三口袋（餐廳/Jack/Was）即時淨值（含預支/代墊正確呈現）
- 記帳表單：日期、付費/入帳口袋、付款人
- 分類 icon → 點分類 → 選項目；無項目可手動新增並寫回 `catalog/items`
- Firebase Realtime Database 同步
- `catalog.json`：餐廳收入 + 六大支出群組；個人收入三大類 + 個人支出九大類

## 一、部署
1. 把專案檔放在同一資料夾（index.html / style.css / app.js / sw.js / manifest.json）。
2. 編輯 `app.js` 的 `firebaseConfig`（本檔已放入你的專案參數）。
3. Firebase Console → Realtime Database → 規則需允許 `auth != null`；前端已 `signInAnonymously()`。

## 二、建立 catalog
到 `/rooms/{space}/catalog` → 三點 → Import JSON → 上傳本 repo 的 `catalog.json`。
> 注意：items 的 key 已經把 `/` 換成 `_`，可直接匯入。

## 三、使用方式
- 在頂部輸入共享代號（例如 `jackwal`）→ **連線**。
- 選「支出/收入」、日期、口袋/付款人、分類和項目、金額，按 **送出**。
- 個人刷卡代買餐廳：選餐廳分類、`付款人=JACK/WAL`，系統自動建立代墊影子轉帳與 `dues`。

## 四、口袋計算邏輯（摘要）
- 餐廳支出：餐廳口袋－。
- 餐廳付**個人分類**：餐廳口袋不變、個人口袋－（視為預支）。
- 個人付**餐廳分類**：個人口袋－、產生代墊影子轉帳（個人→餐廳_銀行）並累加 `dues`。
- 個人付**個人分類**：個人口袋－。
- 收入：進入所選口袋＋。

## 五、可自行擴充
- `catalog.json` 可增加更多分類 / 項目。
- 可在 `app.js` 的 `renderRecent()` 換成進階報表 / 月結。

— Made with ❤
