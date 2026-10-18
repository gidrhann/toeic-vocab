# 多益互動單字卡

11,154 個多益單字的 SRS 間隔重複互動單字卡（純 HTML / CSS / JavaScript，免安裝、免後端）。

## 使用
直接雙擊 `index.html` 即可使用；進度會自動存在瀏覽器 localStorage。
（想用本機伺服器：`npx http-server -p 8765` 後開 http://localhost:8765/）

## 功能
- **SRS 間隔重複**：忘記了／困難／記得／太簡單，按鈕上直接顯示下次出現時間；可復原上一張
- **真人發音**：單字優先播放線上真人錄音，找不到時退回瀏覽器語音；例句可朗讀
- **鍵盤操作**：`Space` 翻面／記得、`1–4` 評分、`S` 單字發音、`E` 例句發音、`T` 考試技巧、`Z` 復原
- **自動儲存**進度，可匯出／匯入 JSON
- **字庫**：虛擬捲動，搜尋英文或中文，上萬筆零延遲
- **統計**：連續天數、14 天學習量、未來 7 天待複習、各分數區間進度
- **客製範圍**：每日新字數、星級、TOEIC 分數區間、主題分類、單字／片語、卡片方向

## 資料來源
[kknono668/toeic-vocab-tw](https://huggingface.co/datasets/kknono668/toeic-vocab-tw)（CC BY-SA 4.0），
原始檔放在 `data/raw/`，用 `node tools/build-data.js` 去重並精簡成 `data/vocab.js`。
