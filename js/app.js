// 主頁面控制：讀取網址參數與資料、處理使用者操作、呼叫計算並顯示結果。
// 計算邏輯在 planner.js，本檔只負責串接與畫面。

import { APP_CONFIG } from "./config.js";
import { loadDataset } from "./dataSource.js";
import { computeMatrix } from "./routing.js";
import { planShuttle } from "./planner.js";
import { locateOnce } from "./geolocate.js";
import { ShuttleMap } from "./mapView.js";
import { renderResult, renderLoading, renderError } from "./resultView.js";
import { escapeHtml } from "./dom.js";

/** @typedef {import("./types.js").Dataset} Dataset */
/** @typedef {import("./types.js").LatLng} LatLng */

const $ = (id) => document.getElementById(id);

/** 畫面狀態（僅本模組內部使用） */
const state = {
  /** @type {Dataset|null} */ dataset: null,
  aCode: "",
  bCode: "",
  hospitalCode: "",
  /** @type {LatLng|null} */ scene: null,
  planSeq: 0,
};

/** @type {ShuttleMap} */
let shuttleMap;

function readUrlParams() {
  const params = new URLSearchParams(location.search);
  state.aCode = params.get("a") ?? "";
  state.bCode = params.get("b") ?? "";
  state.hospitalCode = params.get("h") ?? "";
}

function writeUrlParams() {
  const params = new URLSearchParams();
  if (state.aCode) params.set("a", state.aCode);
  if (state.bCode) params.set("b", state.bCode);
  if (state.hospitalCode) params.set("h", state.hospitalCode);
  history.replaceState(null, "", `${location.pathname}?${params}`);
}

const findStation = (code) => state.dataset?.stations.find((s) => s.code === code) ?? null;
const findHospital = (code) => state.dataset?.hospitals.find((h) => h.code === code) ?? null;

/** A 分隊轄區醫院；未設定轄區時列出全部醫院 */
function hospitalsForA() {
  const aStation = findStation(state.aCode);
  const all = state.dataset?.hospitals ?? [];
  if (!aStation || aStation.hospitalCodes.length === 0) return all;
  return aStation.hospitalCodes.map(findHospital).filter(Boolean);
}

/**
 * @param {HTMLElement} container
 * @param {{code:string,name:string}[]} items
 * @param {string} selectedCode
 * @param {(code:string) => void} onSelect
 * @param {string} suffix
 */
function renderChips(container, items, selectedCode, onSelect, suffix = "") {
  container.innerHTML = items.length
    ? items.map((item) => `<button type="button" class="chip${item.code === selectedCode ? " selected" : ""}" data-code="${escapeHtml(item.code)}">${escapeHtml(item.name)}${suffix}</button>`).join("")
    : `<p class="muted">沒有可選項目，請先到試算表新增資料。</p>`;
  container.querySelectorAll(".chip").forEach((chip) => chip.addEventListener("click", () => onSelect(chip.dataset.code)));
}

function renderSelectors() {
  const { stations } = state.dataset;
  const aStation = findStation(state.aCode);
  $("aSection").open = !aStation;
  $("aSummary").textContent = aStation ? `出勤分隊（A）：${aStation.name}　點此更換` : "出勤分隊（A）：請選擇";
  $("aBadge").textContent = aStation ? `出勤：${aStation.name}分隊` : "請先選擇出勤分隊";
  renderChips($("aChips"), stations, state.aCode, selectA, "分隊");

  const bOptions = stations.filter((s) => s.code !== state.aCode);
  renderChips($("bChips"), bOptions, state.bCode, selectB, "分隊");

  const hospitals = hospitalsForA();
  if (!hospitals.some((h) => h.code === state.hospitalCode)) state.hospitalCode = hospitals[0]?.code ?? "";
  renderChips($("hChips"), hospitals, state.hospitalCode, selectHospital);
}

/** @param {string} code */
function selectA(code) {
  state.aCode = code;
  if (state.bCode === code) state.bCode = "";
  state.hospitalCode = "";
  onSelectionChanged();
}

/** @param {string} code */
function selectB(code) {
  state.bCode = code;
  onSelectionChanged();
  $("result").scrollIntoView({ behavior: "smooth", block: "start" });
}

/** @param {string} code */
function selectHospital(code) {
  state.hospitalCode = code;
  onSelectionChanged();
}

function onSelectionChanged() {
  writeUrlParams();
  renderSelectors();
  runPlan();
}

function renderAlerts(messages, level = "warn") {
  $("alerts").innerHTML = messages.length
    ? `<div class="alert alert-${level}">${messages.map(escapeHtml).join("<br>")}</div>`
    : "";
}

/** 找出還缺哪些輸入；全部齊全回傳 null */
function missingInputMessage() {
  if (!findStation(state.aCode)) return "請先選擇出勤分隊（A）。";
  if (!findStation(state.bCode)) return "請選擇支援分隊（B）。";
  if (!findHospital(state.hospitalCode)) return "請選擇送往醫院。";
  if (!state.scene) return "等待現場定位中…（也可以在地圖上點選現場位置）";
  return null;
}

async function runPlan() {
  const missing = missingInputMessage();
  if (missing) {
    $("result").innerHTML = `<div class="card muted">${escapeHtml(missing)}</div>`;
    return;
  }
  const seq = ++state.planSeq;
  const bStation = findStation(state.bCode);
  const hospital = findHospital(state.hospitalCode);
  const aStation = findStation(state.aCode);
  renderLoading($("result"));
  try {
    const plan = await planShuttle({
      scene: state.scene, bStation, hospital,
      transferPoints: state.dataset.transferPoints,
      settings: state.dataset.settings,
    }, computeMatrix);
    if (seq !== state.planSeq) return; // 使用者已改選，丟棄舊結果
    renderResult($("result"), { plan, aStation, bStation, hospital, settings: state.dataset.settings });
    const shownCodes = new Set(plan.ranked.slice(0, 3).map((c) => c.point.code));
    shuttleMap.showPlan({
      bStation, hospital, ranked: plan.ranked,
      otherPoints: state.dataset.transferPoints.filter((p) => !shownCodes.has(p.code)),
    });
  } catch (error) {
    if (seq !== state.planSeq) return;
    console.error("[app.runPlan] 計算接駁點失敗", error);
    renderError($("result"), error.message);
  }
}

/** @param {LatLng} p @param {number|null} accuracyM @param {string} statusText */
function setScene(p, accuracyM, statusText) {
  state.scene = { lat: p.lat, lng: p.lng };
  shuttleMap.setScene(state.scene, accuracyM);
  $("geoStatus").textContent = statusText;
  $("geoStatus").classList.toggle("warn", Boolean(accuracyM && accuracyM > APP_CONFIG.geolocation.poorAccuracyMeters));
  runPlan();
}

async function relocate() {
  $("geoStatus").textContent = "定位中…";
  $("geoStatus").classList.remove("warn");
  try {
    const fix = await locateOnce();
    const accuracy = Math.round(fix.accuracyM);
    const poor = accuracy > APP_CONFIG.geolocation.poorAccuracyMeters;
    setScene(fix, fix.accuracyM, `已定位（誤差約 ${accuracy} 公尺）${poor ? "，誤差偏大，請在地圖上拖曳紅色 A 修正" : ""}`);
  } catch (error) {
    console.warn("[app.relocate]", error);
    $("geoStatus").textContent = error.message;
    $("geoStatus").classList.add("warn");
    togglePickMode(true);
  }
}

/** @param {boolean} [force] */
function togglePickMode(force) {
  const enabled = typeof force === "boolean" ? force : !shuttleMap.pickMode;
  shuttleMap.setPickMode(enabled);
  $("pickBtn").classList.toggle("selected", enabled);
  $("pickBtn").textContent = enabled ? "點地圖選位置中…（再按一次取消）" : "在地圖上點選";
  if (enabled) $("map").scrollIntoView({ behavior: "smooth", block: "center" });
}

function describeDataSource(dataset) {
  const source = dataset.source === "sheet" ? "Google 試算表" : "內建示範資料（尚未連結試算表）";
  return `地點資料：${source}；分隊 ${dataset.stations.length}、接駁點 ${dataset.transferPoints.length}、醫院 ${dataset.hospitals.length} 處`;
}

async function init() {
  readUrlParams();
  shuttleMap = new ShuttleMap($("map"), {
    onScenePicked: (p) => {
      togglePickMode(false);
      setScene(p, null, "已手動設定現場位置");
    },
  });
  $("relocateBtn").addEventListener("click", relocate);
  $("pickBtn").addEventListener("click", () => togglePickMode());
  relocate(); // 與讀取資料同時進行，節省時間

  try {
    state.dataset = await loadDataset();
  } catch (error) {
    console.error("[app.init] 讀取地點資料失敗", error);
    renderAlerts([error.message, "請確認網路連線，或改以無線電由指揮中心協調。"], "error");
    $("aBadge").textContent = "資料讀取失敗";
    return;
  }
  const { dataset } = state;
  if (state.aCode && !findStation(state.aCode)) dataset.warnings.unshift(`網址中的分隊代碼「${state.aCode}」不存在，請重新選擇出勤分隊`);
  renderAlerts(dataset.source === "sample" ? ["目前使用示範資料，接駁點位置僅供測試。", ...dataset.warnings] : dataset.warnings);
  $("dataSource").textContent = describeDataSource(dataset);
  shuttleMap.showPointsOnly(dataset.transferPoints);
  renderSelectors();
  runPlan();
}

init();
