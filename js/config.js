// 系統設定：部署前只需要改這個檔案。
// 業務參數（B 分隊準備時間等）可在 Google 試算表的「設定」分頁覆寫，不必改程式。

export const APP_CONFIG = Object.freeze({
  // Google 試算表 ID（網址 /d/ 與 /edit 中間那一串）。
  // 留空 = 使用 data/sample/ 內的示範資料。
  sheet: Object.freeze({
    spreadsheetId: "",
    tabs: Object.freeze({
      stations: "分隊",
      transferPoints: "接駁點",
      hospitals: "醫院",
      settings: "設定",
    }),
  }),

  sampleDataDir: "data/sample",

  routing: Object.freeze({
    // Google Routes API 金鑰；留空則跳過 Google，直接使用免費開放圖資。
    // 金鑰務必在 Google Cloud 設定「HTTP 參照網址限制」與每日用量上限（見 README）。
    googleApiKey: "",
    // OpenRouteService 金鑰（選填，免費申請）；留空則跳過。
    orsApiKey: "",
    osrmBaseUrl: "https://router.project-osrm.org",
    requestTimeoutMs: 12000,
  }),

  // 試算表「設定」分頁沒有填時使用的預設值。
  defaults: Object.freeze({
    bPrepMinutes: 2,
    tieThresholdMinutes: 3,
    openDataTimeFactor: 1.0,
  }),

  map: Object.freeze({
    center: [24.79, 121.32],
    zoom: 11,
  }),

  geolocation: Object.freeze({
    timeoutMs: 15000,
    // 定位誤差超過此公尺數時提醒使用者手動修正位置。
    poorAccuracyMeters: 200,
  }),
});
