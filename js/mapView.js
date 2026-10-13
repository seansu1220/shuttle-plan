// 地圖顯示（Leaflet，全域變數 L 由 CDN 載入）。只負責畫圖與回報使用者操作，不含計算邏輯。

import { APP_CONFIG } from "./config.js";

/** @typedef {import("./types.js").LatLng} LatLng */
/** @typedef {import("./types.js").RankedCandidate} RankedCandidate */

/** @param {string} className @param {string} text */
const pinIcon = (className, text = "") => L.divIcon({
  className: "",
  html: `<div class="pin ${className}">${text}</div>`,
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

/** @param {LatLng} p */
const toLeaflet = (p) => [p.lat, p.lng];

export class ShuttleMap {
  /**
   * @param {HTMLElement} element
   * @param {{onScenePicked: (p: LatLng) => void}} handlers 使用者拖曳或點選現場位置時呼叫
   */
  constructor(element, handlers) {
    this.handlers = handlers;
    this.pickMode = false;
    this.map = L.map(element, { zoomControl: true }).setView(APP_CONFIG.map.center, APP_CONFIG.map.zoom);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap 貢獻者",
    }).addTo(this.map);
    this.planLayer = L.layerGroup().addTo(this.map);
    this.sceneMarker = null;
    this.accuracyCircle = null;
    this.map.on("click", (event) => {
      if (!this.pickMode) return;
      const picked = { lat: event.latlng.lat, lng: event.latlng.lng };
      this.setScene(picked, null);
      this.handlers.onScenePicked(picked);
    });
  }

  /** @param {boolean} enabled */
  setPickMode(enabled) {
    this.pickMode = enabled;
    this.map.getContainer().classList.toggle("picking", enabled);
  }

  /** @param {LatLng} p @param {number|null} accuracyM */
  setScene(p, accuracyM) {
    if (!this.sceneMarker) {
      this.sceneMarker = L.marker(toLeaflet(p), { draggable: true, icon: pinIcon("pin-scene", "A"), zIndexOffset: 1000 })
        .addTo(this.map)
        .bindTooltip("案發現場（可拖曳修正）");
      this.sceneMarker.on("dragend", () => {
        const { lat, lng } = this.sceneMarker.getLatLng();
        this.clearAccuracy();
        this.handlers.onScenePicked({ lat, lng });
      });
    } else {
      this.sceneMarker.setLatLng(toLeaflet(p));
    }
    this.clearAccuracy();
    if (accuracyM) this.accuracyCircle = L.circle(toLeaflet(p), { radius: accuracyM, weight: 1, fillOpacity: 0.08 }).addTo(this.map);
    this.map.setView(toLeaflet(p), Math.max(this.map.getZoom(), 13));
  }

  clearAccuracy() {
    if (this.accuracyCircle) this.accuracyCircle.remove();
    this.accuracyCircle = null;
  }

  /**
   * @param {{bStation: LatLng & {name:string}, hospital: LatLng & {name:string}, ranked: RankedCandidate[], otherPoints: (LatLng & {name:string})[]}} plan
   */
  showPlan({ bStation, hospital, ranked, otherPoints }) {
    this.planLayer.clearLayers();
    const bounds = [];
    const add = (p, icon, tip) => { L.marker(toLeaflet(p), { icon }).bindTooltip(tip).addTo(this.planLayer); bounds.push(toLeaflet(p)); };

    otherPoints.forEach((p) => L.marker(toLeaflet(p), { icon: pinIcon("pin-point-dim") }).bindTooltip(p.name).addTo(this.planLayer));
    ranked.slice(0, 3).forEach((c, i) => add(c.point, pinIcon(i === 0 ? "pin-best" : "pin-backup", String(i + 1)), `${i + 1}. ${c.point.name}`));
    add(bStation, pinIcon("pin-b", "B"), `${bStation.name}分隊`);
    add(hospital, pinIcon("pin-hospital", "H"), hospital.name);
    if (this.sceneMarker) bounds.push(this.sceneMarker.getLatLng());
    if (bounds.length) this.map.fitBounds(bounds, { padding: [40, 40] });
  }

  /** @param {(LatLng & {name:string})[]} points */
  showPointsOnly(points) {
    this.planLayer.clearLayers();
    points.forEach((p) => L.marker(toLeaflet(p), { icon: pinIcon("pin-point-dim") }).bindTooltip(p.name).addTo(this.planLayer));
  }

  invalidateSize() {
    this.map.invalidateSize();
  }
}
