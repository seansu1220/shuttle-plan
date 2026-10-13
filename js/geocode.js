// 地址／地標查詢：輸入座標或 Google 地圖連結時直接解析；
// 有 Google 金鑰時用 Google Geocoding（門牌較準），否則用 OpenStreetMap Nominatim，
// 並把台灣地址逐步放寬（門牌 → 路段 → 村里）重查。

import { APP_CONFIG } from "./config.js";

/** @typedef {import("./types.js").GeocodeCandidate} GeocodeCandidate */

const TAIWAN_BOUNDS = Object.freeze({ minLat: 21.5, maxLat: 26.5, minLng: 118, maxLng: 122.5 });
const NOMINATIM_INTERVAL_MS = 1100; // Nominatim 使用規範：每秒最多 1 次
const MAX_RESULTS = 5;
const PRECISE_PLACE_RANK = 28;

const inTaiwan = (lat, lng) =>
  lat >= TAIWAN_BOUNDS.minLat && lat <= TAIWAN_BOUNDS.maxLat && lng >= TAIWAN_BOUNDS.minLng && lng <= TAIWAN_BOUNDS.maxLng;

/** 全形數字與空白轉半形，去掉多餘空白。 @param {string} text */
export function normalizeQuery(text) {
  return text
    .replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/　/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * 從文字中找出「緯度, 經度」（也適用 Google 地圖連結中的 @緯度,經度）。
 * @param {string} text
 * @returns {GeocodeCandidate|null}
 */
export function parseCoordinateText(text) {
  const match = normalizeQuery(text).match(/(-?\d{1,2}\.\d+)\s*[,，\s]\s*(-?\d{2,3}\.\d+)/);
  if (!match) return null;
  const lat = Number(match[1]);
  const lng = Number(match[2]);
  if (!inTaiwan(lat, lng)) return null;
  return { label: `座標 ${lat.toFixed(6)}, ${lng.toFixed(6)}`, lat, lng, precise: true, source: "座標" };
}

/**
 * 拆解台灣門牌地址，產生由精確到寬鬆的 Nominatim 查詢參數。純函式。
 * @param {string} text
 * @returns {{params: Record<string,string>, precise: boolean}[]}
 */
export function buildNominatimQueries(text) {
  const query = normalizeQuery(text).replace(/\s/g, "");
  const queries = [];
  const numbered = query.match(/^(.*?(?:路|街|大道)(?:[一二三四五六七八九十\d]+段)?)(?:(\d+)巷)?(?:(\d+)弄)?(\d+)(?:之\d+)?號/);
  if (numbered) {
    const [, head, , , houseNumber] = numbered;
    const [, city = "", district = "", road = head] = head.match(/^(.+?[市縣])?(.+?[區鄉鎮市])?(.+)$/) ?? [];
    if (road) {
      queries.push({ params: { street: `${houseNumber} ${road}`, city: district || city, state: city }, precise: true });
    }
    queries.push({ params: { q: query }, precise: true });
    queries.push({ params: { q: head }, precise: false });
  } else {
    queries.push({ params: { q: query }, precise: true });
  }
  const withoutNeighborhood = query.replace(/\d+鄰.*$/, "");
  if (withoutNeighborhood && withoutNeighborhood !== query) queries.push({ params: { q: withoutNeighborhood }, precise: false });

  const seen = new Set();
  return queries
    .map((item) => ({ ...item, params: Object.fromEntries(Object.entries(item.params).filter(([, v]) => v)) }))
    .filter((item) => {
      const key = JSON.stringify(item.params);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

/** @param {string} label @param {string} url */
async function fetchGeoJson(label, url, headers = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), APP_CONFIG.routing.requestTimeoutMs);
  try {
    const response = await fetch(url, { headers, signal: controller.signal });
    if (!response.ok) throw new Error(`${label} 回應 HTTP ${response.status}`);
    return await response.json();
  } catch (error) {
    if (error.name === "AbortError") throw new Error(`${label} 逾時未回應`);
    if (error instanceof TypeError) throw new Error(`${label} 無法連線（${error.message}）`);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/** @param {string} query @returns {Promise<GeocodeCandidate[]>} */
async function googleGeocode(query) {
  const params = new URLSearchParams({
    address: query, key: APP_CONFIG.routing.googleApiKey, language: "zh-TW", region: "tw", components: "country:TW",
  });
  const body = await fetchGeoJson("Google 地址查詢", `https://maps.googleapis.com/maps/api/geocode/json?${params}`);
  if (body.status === "ZERO_RESULTS") return [];
  if (body.status !== "OK") throw new Error(`Google 地址查詢失敗：${body.status} ${body.error_message ?? ""}`.trim());
  return body.results.slice(0, MAX_RESULTS).map((r) => ({
    label: r.formatted_address,
    lat: r.geometry.location.lat,
    lng: r.geometry.location.lng,
    precise: r.geometry.location_type === "ROOFTOP" || r.geometry.location_type === "RANGE_INTERPOLATED",
    source: "Google",
  }));
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Nominatim 顯示名稱是「小 → 大」，反轉成台灣習慣的「大 → 小」並去掉郵遞區號與國名。 @param {string} name */
export function formatNominatimLabel(name) {
  return name.split(",").map((part) => part.trim())
    .filter((part) => part && part !== "臺灣" && part !== "台灣" && !/^\d{3,6}$/.test(part))
    .reverse().join(" ");
}

/** @param {string} query @returns {Promise<GeocodeCandidate[]>} */
async function nominatimGeocode(query) {
  const { viewbox } = APP_CONFIG.geocoding;
  const attempts = buildNominatimQueries(query);
  for (let i = 0; i < attempts.length; i++) {
    if (i > 0) await sleep(NOMINATIM_INTERVAL_MS);
    const params = new URLSearchParams({
      ...attempts[i].params, format: "jsonv2", limit: String(MAX_RESULTS), countrycodes: "tw", "accept-language": "zh-TW", viewbox,
    });
    const results = await fetchGeoJson("OpenStreetMap 地址查詢", `https://nominatim.openstreetmap.org/search?${params}`);
    const candidates = results
      .map((r) => ({
        label: formatNominatimLabel(r.display_name),
        lat: Number(r.lat),
        lng: Number(r.lon),
        // 找不到門牌時 Nominatim 會回傳整條路，因此以 place_rank 判斷：28 以上才是建物／門牌／地標等級
        precise: attempts[i].precise && Number(r.place_rank) >= PRECISE_PLACE_RANK,
        source: "OpenStreetMap",
      }))
      .filter((c) => inTaiwan(c.lat, c.lng));
    if (candidates.length) return candidates;
  }
  return [];
}

/**
 * @param {string} rawQuery
 * @returns {Promise<{candidates: GeocodeCandidate[], failures: string[]}>}
 */
export async function searchPlace(rawQuery) {
  const query = normalizeQuery(rawQuery);
  if (!query) return { candidates: [], failures: [] };
  const coordinate = parseCoordinateText(query);
  if (coordinate) return { candidates: [coordinate], failures: [] };

  const failures = [];
  if (APP_CONFIG.routing.googleApiKey) {
    try {
      const candidates = await googleGeocode(query);
      if (candidates.length) return { candidates, failures };
    } catch (error) {
      failures.push(error.message);
    }
  }
  try {
    return { candidates: await nominatimGeocode(query), failures };
  } catch (error) {
    failures.push(error.message);
    throw new Error(`地址查詢失敗：${failures.join("；")}`);
  }
}
