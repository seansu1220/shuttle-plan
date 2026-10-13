# 變更紀錄

## 2026-10-13　第一版：接駁點建議網頁

### 問題描述
偏遠地區 A 分隊出勤沒有 TP 時，需請 B 分隊支援並在接駁點會合。接駁點已預先設定多處，但每次出勤的現場位置與支援分隊都不同，現場難以快速判斷哪個接駁點最適合。

### 解決方式（根本需求）
建立純前端網頁，A 分隊同仁逼 NFC 或掃 QR Code 後，用手機 GPS 取得案發現場，選擇支援分隊與醫院，即時計算各接駁點的行車時間並排序：
- 主要目標為 A、B 兩隊**最快碰頭**（B 分隊盡早上車協助給藥），B 分隊另加準備時間（預設 2 分）。
- 碰頭時間相差在門檻內（預設 3 分）時，改以送醫總時間較短者優先。
- 地點資料（分隊、接駁點、醫院、參數）放在 Google 試算表，可隨時新增與編輯。
- 行車時間優先使用 Google Routes API（含路況），沒有金鑰或失敗時自動改用 OpenRouteService／OSRM 免費開放圖資。

### 新增的檔案
- `index.html`、`js/app.js`、`js/resultView.js`、`js/mapView.js`：主頁（定位、選擇 B 分隊與醫院、建議結果、導航與 LINE 分享、地圖）。
- `tools.html`、`js/tools.js`：管理工具（產生各分隊 NFC／QR Code 網址、Android 直接寫入 NFC、批次列印 QR Code、地圖點選座標、資料檢查）。
- `js/planner.js`：接駁點排序邏輯（純函式）。
- `js/routing.js`：路線服務與自動備援。
- `js/dataSource.js`、`js/csv.js`：讀取試算表／示範 CSV 並檢查資料（座標、重複代碼、停用列、轄區醫院對應）。
- `js/config.js`、`js/types.js`、`js/format.js`、`js/geolocate.js`、`js/dom.js`：設定、型別定義與共用工具。
- `data/sample/*.csv`：示範資料（復興、巴陵、大溪、圳頂、高平、龍潭分隊；國軍桃園總醫院；9 個示範接駁點，座標待確認），同時作為試算表匯入範本。
- `tests/*.test.mjs`：19 項單元測試（`npm test`）。
- `README.md`：試算表建立、GitHub Pages 部署、NFC 寫入、Google 金鑰申請與限制說明。
