// 主頁面控制：讀取網址參數與資料、處理使用者操作、呼叫計算並顯示結果。
// 計算邏輯在 planner.js，位置輸入在 locationPanel.js，本檔只負責串接與畫面。

import { loadDataset } from "./dataSource.js";
import { computeMatrix } from "./routing.js";
import { planShuttle } from "./planner.js";
import { ShuttleMap } from "./mapView.js";
import { LocationPanel } from "./locationPanel.js";
import { renderResult, renderLoading, renderError } from "./resultView.js";
import { escapeHtml } from "./dom.js";
import { straightDistanceM } from "./format.js";

/** @typedef {import("./types.js").Dataset} Dataset */
/** @typedef {import("./types.js").Hospital} Hospital */
/** @typedef {import("./types.js").LatLng} LatLng */

const $ = (id) => document.getElementById(id);
const NEAREST_HOSPITAL_COUNT = 3;

/** 畫面狀態（僅本模組內部使用） */
const state = {
  /** @type {Dataset|null} */ dataset: null,
  bCode: "",
  hospitalCode: "",
  hospitalChosenByUser: false,
  showAllHospitals: false,
  /** @type {LatLng|null} */ scene: null,
  planSeq: 0,
};

/** @type {ShuttleMap} */
let shuttleMap;

function readUrlParams() {
  const params = new URLSearchParams(location.search);
  state.bCode = params.get("b") ?? "";
  state.hospitalCode = params.get("h") ?? "";
  state.hospitalChosenByUser = Boolean(state.hospitalCode);
}

function writeUrlParams() {
  const params = new URLSearchParams();
  if (state.bCode) params.set("b", state.bCode);
  if (state.hospitalChosenByUser && state.hospitalCode) params.set("h", state.hospitalCode);
  const query = params.toString();
  history.replaceState(null, "", query ? `${location.pathname}?${query}` : location.pathname);
}

const findStation = (code) => state.dataset?.stations.find((s) => s.code === code) ?? null;
const findHospital = (code) => state.dataset?.hospitals.find((h) => h.code === code) ?? null;

/** 醫院依與目前位置的直線距離排序（尚未定位時維持試算表順序） @returns {Hospital[]} */
function hospitalsByDistance() {
  const hospitals = [...(state.dataset?.hospitals ?? [])];
  if (!state.scene) return hospitals;
  return hospitals.sort((a, b) => straightDistanceM(state.scene, a) - straightDistanceM(state.scene, b));
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

function renderStations() {
  renderChips($("bChips"), state.dataset.stations, state.bCode, selectB, "分隊");
  const bStation = findStation(state.bCode);
  $("topbarSub").textContent = bStation ? `支援：${bStation.name}分隊` : "";
}

function renderHospitals() {
  const ordered = hospitalsByDistance();
  if (!state.hospitalChosenByUser || !findHospital(state.hospitalCode)) state.hospitalCode = ordered[0]?.code ?? "";
  const selectedIndex = ordered.findIndex((h) => h.code === state.hospitalCode);
  const visibleCount = state.showAllHospitals ? ordered.length : Math.max(NEAREST_HOSPITAL_COUNT, selectedIndex + 1);
  renderChips($("hChips"), ordered.slice(0, visibleCount), state.hospitalCode, selectHospital);
  if (ordered.length > visibleCount) {
    const more = document.createElement("button");
    more.type = "button";
    more.className = "chip chip-more";
    more.textContent = `其他醫院（${ordered.length - visibleCount}）`;
    more.addEventListener("click", () => { state.showAllHospitals = true; renderHospitals(); });
    $("hChips").appendChild(more);
  }
}

/** @param {string} code */
function selectB(code) {
  state.bCode = code;
  writeUrlParams();
  renderStations();
  runPlan();
  if (state.scene) $("result").scrollIntoView({ behavior: "smooth", block: "start" });
}

/** @param {string} code */
function selectHospital(code) {
  state.hospitalCode = code;
  state.hospitalChosenByUser = true;
  writeUrlParams();
  renderHospitals();
  runPlan();
}

/** @param {LatLng} scene */
function onSceneChanged(scene) {
  state.scene = scene;
  if (!state.dataset) return; // 資料尚未載入，載入後會自動計算
  renderHospitals();
  runPlan();
}

function renderAlerts(messages, level = "warn") {
  $("alerts").innerHTML = messages.length
    ? `<div class="alert alert-${level}">${messages.map(escapeHtml).join("<br>")}</div>`
    : "";
}

/** 找出還缺哪些輸入；全部齊全回傳 null */
function missingInputMessage() {
  if (!findStation(state.bCode)) return "請選擇支援分隊（B）。";
  if (!state.scene) return "等待定位中…也可以輸入地址或在地圖上點選目前位置。";
  if (!findHospital(state.hospitalCode)) return "請選擇送往醫院。";
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
  const scene = state.scene;
  renderLoading($("result"));
  try {
    const plan = await planShuttle({
      scene, bStation, hospital,
      transferPoints: state.dataset.transferPoints,
      settings: state.dataset.settings,
    }, computeMatrix);
    if (seq !== state.planSeq) return; // 使用者已改選，丟棄舊結果
    renderResult($("result"), { plan, scene, bStation, hospital, settings: state.dataset.settings });
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

function describeDataSource(dataset) {
  const source = dataset.source === "sheet" ? "Google 試算表" : "內建示範資料（尚未連結試算表）";
  return `地點資料：${source}；分隊 ${dataset.stations.length}、接駁點 ${dataset.transferPoints.length}、醫院 ${dataset.hospitals.length} 處`;
}

async function init() {
  readUrlParams();
  const locationPanel = new LocationPanel({ onSceneChanged });
  shuttleMap = new ShuttleMap($("map"), { onScenePicked: (p) => locationPanel.handleMapPick(p) });
  locationPanel.attachMap(shuttleMap);
  locationPanel.relocate(); // 與讀取資料同時進行，節省時間

  try {
    state.dataset = await loadDataset();
  } catch (error) {
    console.error("[app.init] 讀取地點資料失敗", error);
    renderAlerts([error.message, "請確認網路連線，或改以無線電由指揮中心協調。"], "error");
    $("topbarSub").textContent = "資料讀取失敗";
    return;
  }
  const { dataset } = state;
  if (state.bCode && !findStation(state.bCode)) {
    dataset.warnings.unshift(`網址中的分隊代碼「${state.bCode}」不存在，請重新選擇支援分隊`);
    state.bCode = "";
  }
  renderAlerts(dataset.source === "sample" ? ["目前使用示範資料，接駁點位置僅供測試。", ...dataset.warnings] : dataset.warnings);
  $("dataSource").textContent = describeDataSource(dataset);
  shuttleMap.showPointsOnly(dataset.transferPoints);
  renderStations();
  renderHospitals();
  runPlan();
}

init();
