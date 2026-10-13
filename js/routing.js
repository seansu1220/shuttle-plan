// 路線服務：依序嘗試 Google Routes API → OpenRouteService → OSRM 公用伺服器，
// 前一個沒設定金鑰或失敗就自動換下一個，並回報實際使用的來源。

import { APP_CONFIG } from "./config.js";

/** @typedef {import("./types.js").LatLng} LatLng */
/** @typedef {import("./types.js").MatrixResult} MatrixResult */
/** @typedef {import("./types.js").RoutingProviderInfo} RoutingProviderInfo */

/** @type {Record<string, RoutingProviderInfo>} */
export const PROVIDERS = Object.freeze({
  google: { id: "google", label: "Google 地圖（含即時路況）", hasLiveTraffic: true },
  ors: { id: "ors", label: "OpenRouteService 開放圖資（無即時路況）", hasLiveTraffic: false },
  osrm: { id: "osrm", label: "OSRM 開放圖資（無即時路況）", hasLiveTraffic: false },
});

/** @param {number} rows @param {number} cols */
const emptyMatrix = (rows, cols) => Array.from({ length: rows }, () => Array(cols).fill(null));

/**
 * 帶逾時的 fetch，錯誤訊息標明是哪個服務。
 * @param {string} label @param {string} url @param {RequestInit} init
 */
async function fetchJson(label, url, init = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), APP_CONFIG.routing.requestTimeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      const detail = body?.error?.message ?? body?.message ?? body?.error ?? "";
      throw new Error(`${label} 回應 HTTP ${response.status} ${detail}`.trim());
    }
    return body;
  } catch (error) {
    if (error.name === "AbortError") throw new Error(`${label} 逾時未回應`);
    if (error instanceof TypeError) throw new Error(`${label} 無法連線（${error.message}）`);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/** @param {LatLng} p */
const googleWaypoint = (p) => ({ waypoint: { location: { latLng: { latitude: p.lat, longitude: p.lng } } } });

/** @param {LatLng[]} origins @param {LatLng[]} destinations @returns {Promise<Omit<MatrixResult,"failures">>} */
async function googleMatrix(origins, destinations) {
  const elements = await fetchJson("Google Routes API",
    "https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": APP_CONFIG.routing.googleApiKey,
        "X-Goog-FieldMask": "originIndex,destinationIndex,duration,distanceMeters,condition",
      },
      body: JSON.stringify({
        origins: origins.map(googleWaypoint),
        destinations: destinations.map(googleWaypoint),
        travelMode: "DRIVE",
        routingPreference: "TRAFFIC_AWARE",
      }),
    });
  if (!Array.isArray(elements)) throw new Error("Google Routes API 回應格式不符");
  const durationsSec = emptyMatrix(origins.length, destinations.length);
  const distancesM = emptyMatrix(origins.length, destinations.length);
  elements.forEach((el) => {
    if (el.condition !== "ROUTE_EXISTS") return;
    // proto3 JSON 會省略值為 0 的欄位，因此索引 0 可能不存在
    const o = el.originIndex ?? 0;
    const d = el.destinationIndex ?? 0;
    durationsSec[o][d] = parseFloat(el.duration ?? "0s");
    distancesM[o][d] = el.distanceMeters ?? 0;
  });
  return { durationsSec, distancesM, provider: PROVIDERS.google };
}

/** @param {LatLng[]} origins @param {LatLng[]} destinations */
async function orsMatrix(origins, destinations) {
  const locations = [...origins, ...destinations].map((p) => [p.lng, p.lat]);
  const body = await fetchJson("OpenRouteService",
    "https://api.openrouteservice.org/v2/matrix/driving-car", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: APP_CONFIG.routing.orsApiKey },
      body: JSON.stringify({
        locations,
        sources: origins.map((_, i) => i),
        destinations: destinations.map((_, i) => origins.length + i),
        metrics: ["duration", "distance"],
      }),
    });
  if (!Array.isArray(body?.durations)) throw new Error("OpenRouteService 回應格式不符");
  return { durationsSec: body.durations, distancesM: body.distances ?? emptyMatrix(origins.length, destinations.length), provider: PROVIDERS.ors };
}

/** @param {LatLng[]} origins @param {LatLng[]} destinations */
async function osrmMatrix(origins, destinations) {
  const coords = [...origins, ...destinations].map((p) => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`).join(";");
  const sources = origins.map((_, i) => i).join(";");
  const dests = destinations.map((_, i) => origins.length + i).join(";");
  const url = `${APP_CONFIG.routing.osrmBaseUrl}/table/v1/driving/${coords}?sources=${sources}&destinations=${dests}&annotations=duration,distance`;
  const body = await fetchJson("OSRM", url);
  if (body?.code !== "Ok" || !Array.isArray(body.durations)) throw new Error(`OSRM 計算失敗：${body?.code ?? "未知錯誤"}`);
  return { durationsSec: body.durations, distancesM: body.distances ?? emptyMatrix(origins.length, destinations.length), provider: PROVIDERS.osrm };
}

/** 依設定組出可用的服務順序 */
function enabledProviders() {
  const { googleApiKey, orsApiKey } = APP_CONFIG.routing;
  return [
    googleApiKey && { info: PROVIDERS.google, run: googleMatrix },
    orsApiKey && { info: PROVIDERS.ors, run: orsMatrix },
    { info: PROVIDERS.osrm, run: osrmMatrix },
  ].filter(Boolean);
}

/**
 * 計算行車時間矩陣，自動切換備援服務。全部失敗時丟出包含各服務錯誤原因的例外。
 * @param {LatLng[]} origins @param {LatLng[]} destinations
 * @returns {Promise<MatrixResult>}
 */
export async function computeMatrix(origins, destinations) {
  const failures = [];
  for (const provider of enabledProviders()) {
    try {
      const result = await provider.run(origins, destinations);
      return { ...result, failures };
    } catch (error) {
      failures.push(`${provider.info.label}：${error.message}`);
    }
  }
  throw new Error(`所有路線服務都無法使用：\n${failures.join("\n")}`);
}
