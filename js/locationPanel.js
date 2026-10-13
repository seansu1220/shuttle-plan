// 「目前所在位置」區塊：GPS 定位、地址／地標搜尋、地圖點選。
// 位置確定後透過 onSceneChanged 回呼通知主程式，本模組不含接駁計算。

import { APP_CONFIG } from "./config.js";
import { locateOnce } from "./geolocate.js";
import { searchPlace } from "./geocode.js";
import { escapeHtml } from "./dom.js";

/** @typedef {import("./types.js").LatLng} LatLng */
/** @typedef {import("./types.js").GeocodeCandidate} GeocodeCandidate */
/** @typedef {import("./mapView.js").ShuttleMap} ShuttleMap */

const $ = (id) => document.getElementById(id);

export class LocationPanel {
  /** @param {{onSceneChanged: (scene: LatLng) => void}} handlers */
  constructor(handlers) {
    this.handlers = handlers;
    /** @type {ShuttleMap|null} */ this.map = null;
    /** @type {GeocodeCandidate[]} */ this.candidates = [];
    $("relocateBtn").addEventListener("click", () => this.relocate());
    $("pickBtn").addEventListener("click", () => this.togglePickMode());
    $("addressForm").addEventListener("submit", (event) => {
      event.preventDefault();
      this.search($("addressInput").value);
    });
  }

  /** @param {ShuttleMap} map */
  attachMap(map) {
    this.map = map;
  }

  /** 使用者在地圖上點選或拖曳 A 後呼叫 @param {LatLng} p */
  handleMapPick(p) {
    this.togglePickMode(false);
    this.applyScene(p, null, "已在地圖上設定位置");
  }

  /** @param {string} text @param {boolean} warn */
  setStatus(text, warn = false) {
    $("geoStatus").textContent = text;
    $("geoStatus").classList.toggle("warn", warn);
  }

  /** @param {LatLng} p @param {number|null} accuracyM @param {string} statusText @param {boolean} warn */
  applyScene(p, accuracyM, statusText, warn = false) {
    const scene = { lat: p.lat, lng: p.lng };
    this.map?.setScene(scene, accuracyM);
    this.setStatus(statusText, warn);
    this.handlers.onSceneChanged(scene);
  }

  async relocate() {
    this.setStatus("定位中…");
    try {
      const fix = await locateOnce();
      const accuracy = Math.round(fix.accuracyM);
      const poor = accuracy > APP_CONFIG.geolocation.poorAccuracyMeters;
      this.applyScene(fix, fix.accuracyM, `已用 GPS 定位（誤差約 ${accuracy} 公尺）${poor ? "，誤差偏大，請輸入地址或在地圖上拖曳紅色 A 修正" : ""}`, poor);
    } catch (error) {
      console.warn("[locationPanel.relocate]", error);
      this.setStatus(`${error.message}。也可以直接輸入地址。`, true);
    }
  }

  /** @param {string} query */
  async search(query) {
    if (!query.trim()) return;
    $("addressBtn").disabled = true;
    $("addressResults").innerHTML = `<li class="muted">查詢中…</li>`;
    try {
      const { candidates, failures } = await searchPlace(query);
      if (failures.length) console.warn("[locationPanel.search] 部分查詢服務失敗", failures);
      this.renderCandidates(candidates);
    } catch (error) {
      console.error("[locationPanel.search] 地址查詢失敗", error);
      $("addressResults").innerHTML = `<li class="alert alert-error">${escapeHtml(error.message)}</li>`;
    } finally {
      $("addressBtn").disabled = false;
    }
  }

  /** @param {GeocodeCandidate[]} candidates */
  renderCandidates(candidates) {
    this.candidates = candidates;
    if (candidates.length === 0) {
      $("addressResults").innerHTML = `<li class="muted">找不到這個地點。可以改輸入村里名、路名或附近地標（例如「華陵里」「復興路九段」「巴陵橋」），或直接在地圖上點選。</li>`;
      return;
    }
    if (candidates.length === 1 && candidates[0].precise) {
      this.chooseCandidate(0);
      return;
    }
    $("addressResults").innerHTML = `<li class="muted">請選擇正確的地點：</li>${candidates.map((c, i) => `
      <li><button type="button" class="address-option" data-index="${i}">
        <span>${escapeHtml(c.label)}</span>
        ${c.precise ? "" : `<span class="badge-approx">概略位置</span>`}
      </button></li>`).join("")}`;
    $("addressResults").querySelectorAll("[data-index]").forEach((button) => {
      button.addEventListener("click", () => this.chooseCandidate(Number(button.dataset.index)));
    });
  }

  /** @param {number} index */
  chooseCandidate(index) {
    const candidate = this.candidates[index];
    if (!candidate) return;
    $("addressResults").innerHTML = "";
    const approxNote = candidate.precise ? "" : "（只找到路段或村里的概略位置，請在地圖上拖曳紅色 A 到正確位置）";
    this.applyScene(candidate, null, `已設定：${candidate.label}${approxNote}`, !candidate.precise);
    if (!candidate.precise) $("map").scrollIntoView({ behavior: "smooth", block: "center" });
  }

  /** @param {boolean} [force] */
  togglePickMode(force) {
    if (!this.map) return;
    const enabled = typeof force === "boolean" ? force : !this.map.pickMode;
    this.map.setPickMode(enabled);
    $("pickBtn").classList.toggle("selected", enabled);
    $("pickBtn").textContent = enabled ? "點地圖選位置中…（再按一次取消）" : "在地圖上點選";
    if (enabled) $("map").scrollIntoView({ behavior: "smooth", block: "center" });
  }
}
