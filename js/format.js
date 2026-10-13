// 顯示用格式化與連結產生（純函式）。

/** @typedef {import("./types.js").LatLng} LatLng */
/** @typedef {import("./types.js").RankedCandidate} RankedCandidate */

/** @param {number} seconds */
export function formatMinutes(seconds) {
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) return `${minutes} 分`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} 小時 ${rest} 分` : `${hours} 小時`;
}

/** @param {number|null} meters */
export function formatKm(meters) {
  if (typeof meters !== "number") return "—";
  return `${(meters / 1000).toFixed(1)} 公里`;
}

/** @param {Date} base @param {number} seconds */
export function formatClockAfter(base, seconds) {
  const target = new Date(base.getTime() + seconds * 1000);
  return target.toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit", hour12: false });
}

/** Google 地圖導航連結（手機會直接開啟 Google 地圖 App） @param {LatLng} p */
export function navigationUrl(p) {
  return `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}&travelmode=driving`;
}

/** @param {LatLng} p */
export function placeUrl(p) {
  return `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}`;
}

/**
 * 產生寫入 NFC／QR Code 的啟動網址；bCode 不為空時預先指定支援分隊（指揮中心傳連結用）。
 * @param {string} baseUrl 網站根目錄網址 @param {string} bCode
 */
export function buildLaunchUrl(baseUrl, bCode) {
  const url = new URL(baseUrl);
  url.search = "";
  if (bCode) url.searchParams.set("b", bCode);
  return url.href;
}

/** 兩點直線距離（公尺），僅用於排序選單等非關鍵用途。 @param {LatLng} a @param {LatLng} b */
export function straightDistanceM(a, b) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}

/** @param {RankedCandidate} candidate */
export function describeWaiting(candidate) {
  if (!candidate.waitingTeam || candidate.waitSec < 60) return "兩隊約同時抵達";
  const other = candidate.waitingTeam === "A" ? "B" : "A";
  return `${candidate.waitingTeam} 分隊先到，約等 ${other} 分隊 ${formatMinutes(candidate.waitSec)}`;
}

/**
 * 給 B 分隊（或指揮中心）的 LINE 訊息。
 * @param {{scene: LatLng, bName: string, hospitalName: string, candidate: RankedCandidate, computedAt: Date}} info
 */
export function buildShareText({ scene, bName, hospitalName, candidate, computedAt }) {
  const { point } = candidate;
  return [
    "【偏遠救護接駁】",
    `支援分隊：${bName}分隊`,
    `接駁點：${point.name}${point.note ? `（${point.note}）` : ""}`,
    `預估碰頭：約 ${formatClockAfter(computedAt, candidate.meetSec)}（${formatMinutes(candidate.meetSec)}後）`,
    `B 分隊到達需：${formatMinutes(candidate.bArriveSec)}（含準備）`,
    `送醫：${hospitalName}`,
    `接駁點導航：${navigationUrl(point)}`,
    `案發現場位置：${placeUrl(scene)}`,
  ].join("\n");
}
