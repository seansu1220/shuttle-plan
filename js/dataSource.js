// 資料層：從 Google 試算表（或示範 CSV）讀取分隊、接駁點、醫院與設定，並做資料檢查。
// 之後若改用 Firebase，只需替換本檔的 fetchTabText()，其餘模組不受影響。

import { APP_CONFIG } from "./config.js";
import { parseCsvRecords } from "./csv.js";

/** @typedef {import("./types.js").Dataset} Dataset */
/** @typedef {import("./types.js").PlannerSettings} PlannerSettings */

const SAMPLE_FILES = Object.freeze({
  stations: "stations.csv",
  transferPoints: "transfer_points.csv",
  hospitals: "hospitals.csv",
  settings: "settings.csv",
});

// 試算表「設定」分頁的項目名稱 → PlannerSettings 欄位
const SETTING_KEYS = Object.freeze({
  "B分隊準備時間(分鐘)": "bPrepMinutes",
  "碰頭時間相近門檻(分鐘)": "tieThresholdMinutes",
  "開放圖資時間倍率": "openDataTimeFactor",
});

const TAIWAN_BOUNDS = Object.freeze({ minLat: 21.5, maxLat: 26.5, minLng: 118, maxLng: 122.5 });
const DISABLED_WORDS = new Set(["否", "n", "no", "false", "0", "停用", "x"]);

/** @param {keyof typeof SAMPLE_FILES} tabKey */
function buildTabUrl(tabKey) {
  const { spreadsheetId, tabs } = APP_CONFIG.sheet;
  if (!spreadsheetId) return `${APP_CONFIG.sampleDataDir}/${SAMPLE_FILES[tabKey]}`;
  const sheetName = encodeURIComponent(tabs[tabKey]);
  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv&sheet=${sheetName}`;
}

/** @param {keyof typeof SAMPLE_FILES} tabKey */
async function fetchTabText(tabKey) {
  const url = buildTabUrl(tabKey);
  let response;
  try {
    response = await fetch(url, { cache: "no-store" });
  } catch (error) {
    throw new Error(`讀取「${APP_CONFIG.sheet.tabs[tabKey]}」資料失敗：網路無法連線（${error.message}）`);
  }
  if (!response.ok) {
    throw new Error(`讀取「${APP_CONFIG.sheet.tabs[tabKey]}」資料失敗：HTTP ${response.status}，請確認試算表已設為「知道連結的人可檢視」且分頁名稱正確`);
  }
  return response.text();
}

/**
 * 解析座標：支援「座標」欄（Google 地圖複製的「緯度, 經度」）或分開的「緯度」「經度」欄。
 * @param {Record<string,string>} record
 * @returns {{lat:number,lng:number}|null}
 */
export function parseCoordinate(record) {
  let latText = record["緯度"];
  let lngText = record["經度"];
  if (record["座標"]) [latText, lngText] = record["座標"].split(/[,，\s]+/).filter(Boolean);
  const lat = Number(latText);
  const lng = Number(lngText);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const b = TAIWAN_BOUNDS;
  if (lat < b.minLat || lat > b.maxLat || lng < b.minLng || lng > b.maxLng) return null;
  return { lat, lng };
}

/** @param {string|undefined} text */
function isEnabled(text) {
  return !DISABLED_WORDS.has((text ?? "").trim().toLowerCase());
}

/**
 * 共用的列轉換：檢查代碼、名稱、座標、重複代碼，回傳有效項目並把問題寫入 warnings。
 * @param {Record<string,string>[]} records
 * @param {string} tabLabel
 * @param {string[]} warnings
 */
export function normalizePlaces(records, tabLabel, warnings) {
  const seenCodes = new Set();
  const places = [];
  records.forEach((record, index) => {
    const rowLabel = `「${tabLabel}」第 ${index + 2} 列`;
    if (!isEnabled(record["啟用"])) return;
    const code = (record["代碼"] ?? "").trim();
    const name = (record["名稱"] ?? "").trim();
    if (!code || !name) { warnings.push(`${rowLabel}：缺少代碼或名稱，已略過`); return; }
    if (seenCodes.has(code)) { warnings.push(`${rowLabel}：代碼 ${code} 重複，已略過`); return; }
    const coordinate = parseCoordinate(record);
    if (!coordinate) { warnings.push(`${rowLabel}（${name}）：座標格式錯誤或不在台灣範圍，已略過`); return; }
    seenCodes.add(code);
    places.push({ code, name, ...coordinate, note: record["備註"] ?? "", raw: record });
  });
  return places;
}

/**
 * @param {Record<string,string>[]} records
 * @param {string[]} warnings
 * @returns {PlannerSettings}
 */
export function normalizeSettings(records, warnings) {
  const settings = { ...APP_CONFIG.defaults };
  records.forEach((record) => {
    const key = SETTING_KEYS[(record["項目"] ?? "").trim()];
    if (!key) return;
    const value = Number(record["值"]);
    if (Number.isFinite(value) && value >= 0) settings[key] = value;
    else warnings.push(`「設定」${record["項目"]} 的值「${record["值"]}」不是有效數字，改用預設值 ${settings[key]}`);
  });
  if (settings.openDataTimeFactor <= 0) settings.openDataTimeFactor = 1;
  return settings;
}

/**
 * @param {ReturnType<typeof normalizePlaces>} stationPlaces
 * @param {Set<string>} hospitalCodes
 * @param {string[]} warnings
 */
function attachStationHospitals(stationPlaces, hospitalCodes, warnings) {
  return stationPlaces.map(({ raw, ...station }) => {
    const codes = (raw["轄區醫院代碼"] ?? "").split(/[,，、\s]+/).filter(Boolean);
    codes.filter((code) => !hospitalCodes.has(code))
      .forEach((code) => warnings.push(`「分隊」${station.name}：轄區醫院代碼 ${code} 在「醫院」分頁找不到`));
    return { ...station, hospitalCodes: codes.filter((code) => hospitalCodes.has(code)) };
  });
}

const stripRaw = ({ raw, ...place }) => place;

/** @returns {Promise<Dataset>} */
export async function loadDataset() {
  const tabKeys = /** @type {(keyof typeof SAMPLE_FILES)[]} */ (Object.keys(SAMPLE_FILES));
  const texts = await Promise.all(tabKeys.map(fetchTabText));
  const records = Object.fromEntries(tabKeys.map((key, i) => [key, parseCsvRecords(texts[i])]));
  const warnings = [];
  const { tabs } = APP_CONFIG.sheet;

  const hospitals = normalizePlaces(records.hospitals, tabs.hospitals, warnings).map(stripRaw);
  const transferPoints = normalizePlaces(records.transferPoints, tabs.transferPoints, warnings).map(stripRaw);
  const stationPlaces = normalizePlaces(records.stations, tabs.stations, warnings);
  const stations = attachStationHospitals(stationPlaces, new Set(hospitals.map((h) => h.code)), warnings);
  const settings = normalizeSettings(records.settings, warnings);

  return {
    stations, transferPoints, hospitals, settings, warnings,
    source: APP_CONFIG.sheet.spreadsheetId ? "sheet" : "sample",
  };
}
