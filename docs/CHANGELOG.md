# 變更紀錄

## 2026-10-14　移除出勤分隊選擇、新增地址輸入

### 問題描述
1. 使用者回饋：不需要選擇出勤分隊（A），只需要支援分隊與目前所在位置。
2. 目前位置只能用 GPS 或地圖點選，希望也能直接輸入地址。
3. 實測發現建議結果偶有不直覺：碰頭較慢的接駁點只因送醫快了幾秒就排第一。
4. 管理工具頁的「直接寫入 NFC」按鈕在不支援的瀏覽器也會顯示。

### 根本原因
1. 第一版以 A 分隊決定轄區醫院與 NFC 網址，與實際使用流程不符。
2. 未實作地址查詢。
3. 門檻內以送醫總時間「秒數」比較，幾秒差距也會翻轉排序。
4. `.btn` 的 `display` 樣式覆蓋了 `hidden` 屬性。

### 修改內容
- `index.html`、`js/app.js`：移除出勤分隊區塊與 `?a=` 參數，步驟改為「支援分隊 → 目前位置 → 醫院」；醫院依與目前位置距離排序，預設最近一家，超過 3 家時可展開。
- `js/locationPanel.js`（新增）：把 GPS 定位、地址搜尋、地圖點選獨立成模組。
- `js/geocode.js`（新增）：地址／地標／座標／Google 地圖連結查詢；有 Google 金鑰時用 Geocoding API，否則用 OpenStreetMap Nominatim，台灣門牌地址先結構化查詢，再逐步放寬到路段、村里，並以 place_rank 標示「概略位置」。
- `js/planner.js`：門檻內送醫總時間改以分鐘比較，相同時碰頭較快者優先。
- `js/format.js`：啟動網址改為通用網址（可選 `?b=`）；分享訊息改附案發現場位置連結。
- `tools.html`、`js/tools.js`：NFC／QR 改為所有救護車共用同一網址；列印改為 6 張通用 QR Code；新增「指揮中心用：預先指定支援分隊的連結」。
- `js/dataSource.js`、`js/types.js`、`data/sample/stations.csv`：移除分隊的「轄區醫院代碼」欄位；新增 `GeocodeCandidate` 型別。
- `js/config.js`：新增地址查詢優先範圍設定。
- `css/style.css`：地址輸入與候選清單樣式；`[hidden]` 一律隱藏。
- `tests/geocode.test.mjs`（新增）與既有測試更新，共 26 項通過。
- `README.md`：同步更新使用說明與 Google 金鑰需啟用 Geocoding API。

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
