// 手機 GPS 定位包裝：回傳 Promise，錯誤訊息轉成中文說明。

import { APP_CONFIG } from "./config.js";

/**
 * @typedef {Object} GeoFix
 * @property {number} lat
 * @property {number} lng
 * @property {number} accuracyM
 */

const ERROR_MESSAGES = Object.freeze({
  1: "定位權限被拒絕：請到手機設定允許瀏覽器使用位置，或在地圖上手動點選現場位置",
  2: "目前無法取得位置（GPS 訊號不足），請到空曠處重試，或在地圖上手動點選",
  3: "定位逾時，請重試，或在地圖上手動點選現場位置",
});

/** @returns {Promise<GeoFix>} */
export function locateOnce() {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(new Error("此瀏覽器不支援定位，請在地圖上手動點選現場位置"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracyM: position.coords.accuracy,
      }),
      (error) => reject(new Error(ERROR_MESSAGES[error.code] ?? `定位失敗：${error.message}`)),
      { enableHighAccuracy: true, timeout: APP_CONFIG.geolocation.timeoutMs, maximumAge: 0 },
    );
  });
}
