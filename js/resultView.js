// 計算結果的畫面呈現。

import { escapeHtml, shareOrCopy } from "./dom.js";
import {
  formatMinutes, formatKm, formatClockAfter, navigationUrl, describeWaiting, buildShareText,
} from "./format.js";

/** @typedef {import("./types.js").PlanResult} PlanResult */
/** @typedef {import("./types.js").RankedCandidate} RankedCandidate */
/** @typedef {import("./types.js").Station} Station */
/** @typedef {import("./types.js").LatLng} LatLng */
/** @typedef {import("./types.js").Hospital} Hospital */
/** @typedef {import("./types.js").PlannerSettings} PlannerSettings */

const BACKUP_COUNT = 2;

/** @param {HTMLElement} container */
export function renderLoading(container) {
  container.innerHTML = `<div class="card result-loading">計算行車時間中…</div>`;
}

/** @param {HTMLElement} container @param {string} message */
export function renderError(container, message) {
  container.innerHTML = `<div class="alert alert-error"><strong>無法計算接駁點</strong><br>${escapeHtml(message).replace(/\n/g, "<br>")}<br>請稍後重試，或改以無線電由指揮中心協調。</div>`;
}

/** @param {RankedCandidate} best @param {Date} computedAt @param {PlannerSettings} settings */
function bestCardHtml(best, computedAt, settings) {
  const { point, legs } = best;
  return `
    <div class="card best">
      <div class="best-label">建議接駁點</div>
      <div class="best-name">${escapeHtml(point.name)}</div>
      ${point.note ? `<div class="best-note">${escapeHtml(point.note)}</div>` : ""}
      <div class="best-meet">約 <strong>${formatClockAfter(computedAt, best.meetSec)}</strong> 碰頭（${formatMinutes(best.meetSec)}後）</div>
      <div class="best-wait">${escapeHtml(describeWaiting(best))}</div>
      <dl class="legs">
        <div><dt>A 目前位置 → 接駁點</dt><dd>${formatMinutes(best.aArriveSec)}<small>${formatKm(legs.sceneToPointM)}</small></dd></div>
        <div><dt>B 分隊 → 接駁點</dt><dd>${formatMinutes(best.bArriveSec)}<small>含準備 ${settings.bPrepMinutes} 分・${formatKm(legs.bToPointM)}</small></dd></div>
        <div><dt>接駁點 → 醫院</dt><dd>${formatMinutes(best.pointToHospitalSec)}<small>${formatKm(legs.pointToHospitalM)}</small></dd></div>
        <div><dt>預估到院</dt><dd>${formatClockAfter(computedAt, best.totalSec)}<small>共 ${formatMinutes(best.totalSec)}</small></dd></div>
      </dl>
      <div class="button-row">
        <a class="btn btn-primary" href="${navigationUrl(point)}" target="_blank" rel="noopener">導航到接駁點</a>
        <button type="button" class="btn" data-share="0">傳給 B 分隊</button>
      </div>
    </div>`;
}

/** @param {RankedCandidate} candidate @param {number} index */
function backupItemHtml(candidate, index) {
  return `
    <li class="backup">
      <div class="backup-main">
        <span class="backup-rank">${index + 2}</span>
        <div>
          <div class="backup-name">${escapeHtml(candidate.point.name)}</div>
          <div class="muted">碰頭 ${formatMinutes(candidate.meetSec)}・到院共 ${formatMinutes(candidate.totalSec)}</div>
        </div>
      </div>
      <div class="backup-actions">
        <a class="btn btn-small" href="${navigationUrl(candidate.point)}" target="_blank" rel="noopener">導航</a>
        <button type="button" class="btn btn-small" data-share="${index + 1}">傳送</button>
      </div>
    </li>`;
}

/** @param {PlanResult} plan */
function sourceNoteHtml(plan) {
  const labels = plan.providers.map((p) => p.label).join("、");
  const noTraffic = plan.providers.some((p) => !p.hasLiveTraffic);
  const unreachable = plan.unreachable.length
    ? `<br>無法算出路線、已排除：${plan.unreachable.map((p) => escapeHtml(p.name)).join("、")}` : "";
  const failures = plan.failures.length
    ? `<br>備援紀錄：${plan.failures.map(escapeHtml).join("；")}` : "";
  return `<p class="source-note">路線來源：${escapeHtml(labels)}${noTraffic ? "，時間僅供參考" : ""}；計算於 ${formatClockAfter(plan.computedAt, 0)}${unreachable}${failures}</p>`;
}

/**
 * @param {HTMLElement} container
 * @param {{plan: PlanResult, scene: LatLng, bStation: Station, hospital: Hospital, settings: PlannerSettings}} info
 */
export function renderResult(container, { plan, scene, bStation, hospital, settings }) {
  if (plan.ranked.length === 0) {
    renderError(container, "所有接駁點都無法算出行車路線，請確認現場位置是否正確。");
    return;
  }
  const [best, ...rest] = plan.ranked;
  const backups = rest.slice(0, BACKUP_COUNT);
  container.innerHTML = `
    ${bestCardHtml(best, plan.computedAt, settings)}
    ${backups.length ? `<div class="card"><h3>備案</h3><ul class="backups">${backups.map(backupItemHtml).join("")}</ul></div>` : ""}
    ${sourceNoteHtml(plan)}`;

  container.querySelectorAll("[data-share]").forEach((button) => {
    button.addEventListener("click", () => handleShare(button, plan.ranked[Number(button.dataset.share)], {
      scene, bName: bStation.name, hospitalName: hospital.name, computedAt: plan.computedAt,
    }));
  });
}

/** @param {HTMLButtonElement} button @param {RankedCandidate} candidate */
async function handleShare(button, candidate, info) {
  const text = buildShareText({ ...info, candidate });
  const original = button.textContent;
  try {
    const outcome = await shareOrCopy(text);
    if (outcome === "copied") button.textContent = "已複製，可貼到 LINE";
  } catch (error) {
    console.error("[resultView.handleShare] 分享失敗", error);
    window.prompt("請手動複製以下內容：", text);
  }
  setTimeout(() => { button.textContent = original; }, 2500);
}
