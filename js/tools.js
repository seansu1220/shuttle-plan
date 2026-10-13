// 管理工具頁：產生各分隊啟動網址、QR Code、寫入 NFC、座標選取與資料檢查。

import { APP_CONFIG } from "./config.js";
import { loadDataset } from "./dataSource.js";
import { escapeHtml, copyText } from "./dom.js";
import { buildLaunchUrl } from "./format.js";

/** @typedef {import("./types.js").Dataset} Dataset */

const $ = (id) => document.getElementById(id);
const QR_SIZE = 220;

/** 預設網站網址＝本頁所在資料夾 */
const defaultBaseUrl = () => new URL("./", location.href).href;

function currentUrl() {
  return buildLaunchUrl($("baseUrl").value.trim() || defaultBaseUrl(), $("aSelect").value, $("bSelect").value);
}

/** @param {HTMLElement} element @param {string} text */
function drawQr(element, text, size = QR_SIZE) {
  element.innerHTML = "";
  if (typeof QRCode === "undefined") {
    element.textContent = "QR Code 元件載入失敗，請確認網路連線";
    return;
  }
  new QRCode(element, { text, width: size, height: size, correctLevel: QRCode.CorrectLevel.M });
}

function refreshUrl() {
  const url = currentUrl();
  $("urlBox").textContent = url;
  drawQr($("qrBox"), url);
}

/** @param {Dataset} dataset */
function fillSelectors(dataset) {
  const options = dataset.stations.map((s) => `<option value="${escapeHtml(s.code)}">${escapeHtml(s.name)}分隊（${escapeHtml(s.code)}）</option>`).join("");
  $("aSelect").innerHTML = options;
  $("bSelect").innerHTML = `<option value="">不指定（由現場同仁選擇）</option>${options}`;
}

function downloadQr() {
  const canvas = $("qrBox").querySelector("canvas");
  if (!canvas) return;
  const link = document.createElement("a");
  link.href = canvas.toDataURL("image/png");
  link.download = `接駁_${$("aSelect").selectedOptions[0]?.textContent ?? "QR"}.png`;
  link.click();
}

async function writeNfc() {
  const url = currentUrl();
  $("nfcStatus").textContent = "請把 NFC 標籤貼近手機背面…";
  try {
    const writer = new NDEFReader();
    await writer.write({ records: [{ recordType: "url", data: url }] });
    $("nfcStatus").textContent = `寫入成功：${url}`;
  } catch (error) {
    console.error("[tools.writeNfc] 寫入 NFC 失敗", error);
    $("nfcStatus").textContent = `寫入失敗：${error.message}（請確認手機 NFC 已開啟、標籤未鎖定）`;
  }
}

/** @param {Dataset} dataset */
function printAll(dataset) {
  const base = $("baseUrl").value.trim() || defaultBaseUrl();
  $("printArea").innerHTML = `<div class="print-grid">${dataset.stations.map((s) => `
    <div class="print-item">
      <div class="print-name">${escapeHtml(s.name)}分隊　偏遠救護接駁</div>
      <div class="qr-box" data-url="${escapeHtml(buildLaunchUrl(base, s.code, ""))}"></div>
      <div class="url-box">${escapeHtml(buildLaunchUrl(base, s.code, ""))}</div>
    </div>`).join("")}</div>`;
  $("printArea").querySelectorAll("[data-url]").forEach((el) => drawQr(el, el.dataset.url, 180));
  document.body.classList.add("print-all");
  setTimeout(() => { window.print(); document.body.classList.remove("print-all"); }, 300);
}

function setupPickMap() {
  const map = L.map($("pickMap")).setView(APP_CONFIG.map.center, APP_CONFIG.map.zoom);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "&copy; OpenStreetMap 貢獻者" }).addTo(map);
  let marker = null;
  map.on("click", (event) => {
    const text = `${event.latlng.lat.toFixed(6)}, ${event.latlng.lng.toFixed(6)}`;
    if (marker) marker.setLatLng(event.latlng); else marker = L.marker(event.latlng).addTo(map);
    $("pickedCoord").textContent = text;
  });
  return map;
}

/** @param {{code:string,name:string,lat:number,lng:number,note:string}[]} rows @param {string} extraHeader @param {(row:any)=>string} extraCell */
function tableHtml(rows, extraHeader = "", extraCell = () => "") {
  if (rows.length === 0) return `<p class="muted">（無資料）</p>`;
  const head = `<tr><th>代碼</th><th>名稱</th><th>座標</th>${extraHeader ? `<th>${extraHeader}</th>` : ""}<th>備註</th></tr>`;
  const body = rows.map((r) => `<tr><td>${escapeHtml(r.code)}</td><td>${escapeHtml(r.name)}</td><td>${r.lat.toFixed(5)}, ${r.lng.toFixed(5)}</td>${extraHeader ? `<td>${escapeHtml(extraCell(r))}</td>` : ""}<td>${escapeHtml(r.note)}</td></tr>`).join("");
  return `<div class="table-wrap"><table class="data">${head}${body}</table></div>`;
}

/** @param {Dataset} dataset */
function renderDataCheck(dataset) {
  const { settings, warnings } = dataset;
  const source = dataset.source === "sheet" ? "Google 試算表" : "內建示範資料（js/config.js 尚未設定試算表 ID）";
  const hospitalName = (code) => dataset.hospitals.find((h) => h.code === code)?.name ?? code;
  $("dataCheck").innerHTML = `
    <p>資料來源：${source}</p>
    ${warnings.length ? `<div class="alert alert-warn">${warnings.map(escapeHtml).join("<br>")}</div>` : `<p>✅ 沒有發現資料問題</p>`}
    <p>設定：B 分隊準備 ${settings.bPrepMinutes} 分鐘；碰頭相近門檻 ${settings.tieThresholdMinutes} 分鐘；開放圖資時間倍率 ${settings.openDataTimeFactor}</p>
    <h3>分隊</h3>${tableHtml(dataset.stations, "轄區醫院", (s) => s.hospitalCodes.map(hospitalName).join("、") || "（全部醫院）")}
    <h3>接駁點</h3>${tableHtml(dataset.transferPoints)}
    <h3>醫院</h3>${tableHtml(dataset.hospitals)}`;
}

async function init() {
  $("baseUrl").value = defaultBaseUrl();
  setupPickMap();
  $("copyCoordBtn").addEventListener("click", () => copyText($("pickedCoord").textContent).catch((e) => alert(e.message)));

  let dataset;
  try {
    dataset = await loadDataset();
  } catch (error) {
    console.error("[tools.init] 讀取資料失敗", error);
    $("alerts").innerHTML = `<div class="alert alert-error">${escapeHtml(error.message)}</div>`;
    $("dataCheck").textContent = "讀取失敗";
    return;
  }
  fillSelectors(dataset);
  renderDataCheck(dataset);
  refreshUrl();
  ["baseUrl", "aSelect", "bSelect"].forEach((id) => $(id).addEventListener("input", refreshUrl));
  $("copyUrlBtn").addEventListener("click", () => copyText(currentUrl()).then(() => { $("copyUrlBtn").textContent = "已複製"; }).catch((e) => alert(e.message)));
  $("downloadQrBtn").addEventListener("click", downloadQr);
  $("printAllBtn").addEventListener("click", () => printAll(dataset));
  if ("NDEFReader" in window) {
    $("writeNfcBtn").hidden = false;
    $("writeNfcBtn").addEventListener("click", writeNfc);
  } else {
    $("nfcStatus").textContent = "此瀏覽器無法直接寫入 NFC（僅 Android Chrome 支援），請用 NFC Tools App 寫入上面的網址。";
  }
}

init();
