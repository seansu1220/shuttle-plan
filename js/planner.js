// 接駁點排序邏輯。
// 主要目標：A、B 兩隊最快碰頭（讓 B 分隊盡早上車協助給藥）；
// 碰頭時間相近（門檻內）時，改以送醫總時間較短者優先。
// rankCandidates / buildCandidateLegs 為純函式；planShuttle 負責串接路線服務（以參數注入，便於測試）。

/** @typedef {import("./types.js").LatLng} LatLng */
/** @typedef {import("./types.js").Station} Station */
/** @typedef {import("./types.js").Hospital} Hospital */
/** @typedef {import("./types.js").TransferPoint} TransferPoint */
/** @typedef {import("./types.js").PlannerSettings} PlannerSettings */
/** @typedef {import("./types.js").MatrixResult} MatrixResult */
/** @typedef {import("./types.js").CandidateLegs} CandidateLegs */
/** @typedef {import("./types.js").RankedCandidate} RankedCandidate */
/** @typedef {import("./types.js").PlanResult} PlanResult */

/**
 * @param {TransferPoint[]} points
 * @param {MatrixResult} meetMatrix 起點 [現場, B 分隊] → 終點 各接駁點
 * @param {MatrixResult} hospitalMatrix 起點 各接駁點 → 終點 [醫院]
 * @returns {CandidateLegs[]}
 */
export function buildCandidateLegs(points, meetMatrix, hospitalMatrix) {
  return points.map((point, i) => ({
    point,
    sceneToPointSec: meetMatrix.durationsSec[0]?.[i] ?? null,
    bToPointSec: meetMatrix.durationsSec[1]?.[i] ?? null,
    pointToHospitalSec: hospitalMatrix.durationsSec[i]?.[0] ?? null,
    sceneToPointM: meetMatrix.distancesM[0]?.[i] ?? null,
    bToPointM: meetMatrix.distancesM[1]?.[i] ?? null,
    pointToHospitalM: hospitalMatrix.distancesM[i]?.[0] ?? null,
  }));
}

/** @param {CandidateLegs} legs */
const isReachable = (legs) =>
  [legs.sceneToPointSec, legs.bToPointSec, legs.pointToHospitalSec].every((v) => typeof v === "number");

/**
 * @param {CandidateLegs} legs @param {number} bPrepSec
 * @returns {RankedCandidate}
 */
function scoreCandidate(legs, bPrepSec) {
  const aArriveSec = legs.sceneToPointSec;
  const bArriveSec = bPrepSec + legs.bToPointSec;
  const meetSec = Math.max(aArriveSec, bArriveSec);
  const diff = aArriveSec - bArriveSec;
  return {
    point: legs.point,
    aArriveSec,
    bArriveSec,
    meetSec,
    pointToHospitalSec: legs.pointToHospitalSec,
    totalSec: meetSec + legs.pointToHospitalSec,
    waitingTeam: diff < 0 ? "A" : diff > 0 ? "B" : null,
    waitSec: Math.abs(diff),
    recommended: false,
    legs,
  };
}

/**
 * @param {CandidateLegs[]} legsList
 * @param {Pick<PlannerSettings,"bPrepMinutes"|"tieThresholdMinutes">} settings
 * @returns {{ranked: RankedCandidate[], unreachable: TransferPoint[]}}
 */
export function rankCandidates(legsList, settings) {
  const unreachable = legsList.filter((l) => !isReachable(l)).map((l) => l.point);
  const scored = legsList.filter(isReachable).map((l) => scoreCandidate(l, settings.bPrepMinutes * 60));
  if (scored.length === 0) return { ranked: [], unreachable };

  const bestMeet = Math.min(...scored.map((c) => c.meetSec));
  const tieLimit = bestMeet + settings.tieThresholdMinutes * 60;
  const inTieGroup = (c) => c.meetSec <= tieLimit;

  const ranked = [...scored].sort((x, y) => {
    const groupDiff = Number(inTieGroup(y)) - Number(inTieGroup(x));
    if (groupDiff !== 0) return groupDiff;
    if (inTieGroup(x)) return x.totalSec - y.totalSec || x.meetSec - y.meetSec;
    return x.meetSec - y.meetSec || x.totalSec - y.totalSec;
  });
  ranked[0] = { ...ranked[0], recommended: true };
  return { ranked, unreachable };
}

/**
 * 無即時路況的開放圖資常低估山路時間，乘上設定倍率校正。
 * @param {MatrixResult} matrix @param {number} factor
 * @returns {MatrixResult}
 */
export function applyTimeFactor(matrix, factor) {
  if (matrix.provider.hasLiveTraffic || factor === 1) return matrix;
  const durationsSec = matrix.durationsSec.map((row) => row.map((v) => (typeof v === "number" ? v * factor : v)));
  return { ...matrix, durationsSec };
}

/**
 * @param {{scene: LatLng, bStation: Station, hospital: Hospital, transferPoints: TransferPoint[], settings: PlannerSettings}} input
 * @param {(origins: LatLng[], destinations: LatLng[]) => Promise<MatrixResult>} computeMatrix
 * @returns {Promise<PlanResult>}
 */
export async function planShuttle(input, computeMatrix) {
  const { scene, bStation, hospital, transferPoints, settings } = input;
  if (transferPoints.length === 0) throw new Error("沒有任何啟用中的接駁點，請先到試算表新增");

  const [meetRaw, hospitalRaw] = await Promise.all([
    computeMatrix([scene, bStation], transferPoints),
    computeMatrix(transferPoints, [hospital]),
  ]);
  const meetMatrix = applyTimeFactor(meetRaw, settings.openDataTimeFactor);
  const hospitalMatrix = applyTimeFactor(hospitalRaw, settings.openDataTimeFactor);

  const legs = buildCandidateLegs(transferPoints, meetMatrix, hospitalMatrix);
  const { ranked, unreachable } = rankCandidates(legs, settings);
  const providers = [meetMatrix.provider, hospitalMatrix.provider]
    .filter((p, i, list) => list.findIndex((q) => q.id === p.id) === i);

  return {
    ranked,
    unreachable,
    providers,
    failures: [...new Set([...meetMatrix.failures, ...hospitalMatrix.failures])],
    computedAt: new Date(),
  };
}
