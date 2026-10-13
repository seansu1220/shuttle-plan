import { test } from "node:test";
import assert from "node:assert/strict";
import { rankCandidates, buildCandidateLegs, applyTimeFactor, planShuttle } from "../js/planner.js";

const point = (code) => ({ code, name: code, lat: 24.8, lng: 121.3, note: "" });
const legs = (code, sceneMin, bMin, hospMin) => ({
  point: point(code),
  sceneToPointSec: sceneMin === null ? null : sceneMin * 60,
  bToPointSec: bMin * 60,
  pointToHospitalSec: hospMin * 60,
  sceneToPointM: 1000, bToPointM: 1000, pointToHospitalM: 1000,
});
const settings = { bPrepMinutes: 2, tieThresholdMinutes: 3, openDataTimeFactor: 1 };

test("碰頭時間取兩隊較慢者，B 分隊含準備時間", () => {
  const { ranked } = rankCandidates([legs("T1", 10, 5, 30)], settings);
  assert.equal(ranked[0].aArriveSec, 600);
  assert.equal(ranked[0].bArriveSec, 420);
  assert.equal(ranked[0].meetSec, 600);
  assert.equal(ranked[0].totalSec, 600 + 1800);
  assert.equal(ranked[0].waitingTeam, "B");
  assert.equal(ranked[0].waitSec, 180);
});

test("碰頭時間差距超過門檻時，以碰頭快者優先（即使送醫較慢）", () => {
  const { ranked } = rankCandidates([
    legs("FAR_MEET_FAST_HOSP", 20, 18, 5), // 碰頭 20，總 25
    legs("NEAR_MEET_SLOW_HOSP", 10, 8, 30), // 碰頭 10，總 40
  ], settings);
  assert.equal(ranked[0].point.code, "NEAR_MEET_SLOW_HOSP");
  assert.equal(ranked[0].recommended, true);
  assert.equal(ranked[1].recommended, false);
});

test("碰頭時間在門檻內時，改以送醫總時間較短者優先", () => {
  const { ranked } = rankCandidates([
    legs("MEET10_TOTAL40", 10, 8, 30), // 碰頭 10，總 40
    legs("MEET12_TOTAL22", 12, 10, 10), // 碰頭 12（差 2 分 < 門檻 3），總 22
  ], settings);
  assert.equal(ranked[0].point.code, "MEET12_TOTAL22");
});

test("門檻內送醫總時間差不到 1 分鐘時，碰頭較快者優先", () => {
  const { ranked } = rankCandidates([
    { ...legs("MEET11", 11, 1, 25), pointToHospitalSec: 25 * 60 - 20 }, // 碰頭 11，總 35:40
    legs("MEET9", 9, 1, 27), // 碰頭 9，總 36:00
  ], settings);
  assert.equal(ranked[0].point.code, "MEET9");
});

test("門檻外的備案依碰頭時間排序", () => {
  const { ranked } = rankCandidates([
    legs("M30", 30, 1, 1),
    legs("M10", 10, 1, 50),
    legs("M20", 20, 1, 1),
  ], settings);
  assert.deepEqual(ranked.map((c) => c.point.code), ["M10", "M20", "M30"]);
});

test("無法到達的接駁點被排除並另外列出", () => {
  const { ranked, unreachable } = rankCandidates([legs("OK", 10, 5, 5), legs("NO", null, 5, 5)], settings);
  assert.deepEqual(ranked.map((c) => c.point.code), ["OK"]);
  assert.deepEqual(unreachable.map((p) => p.code), ["NO"]);
});

test("全部無法到達時回傳空排名", () => {
  const { ranked } = rankCandidates([legs("NO", null, 5, 5)], settings);
  assert.equal(ranked.length, 0);
});

test("buildCandidateLegs 依矩陣索引對應三段資料", () => {
  const points = [point("T1"), point("T2")];
  const provider = { id: "x", label: "x", hasLiveTraffic: false };
  const meet = { durationsSec: [[100, 200], [300, 400]], distancesM: [[1, 2], [3, 4]], provider, failures: [] };
  const hosp = { durationsSec: [[500], [600]], distancesM: [[5], [6]], provider, failures: [] };
  const result = buildCandidateLegs(points, meet, hosp);
  assert.equal(result[1].sceneToPointSec, 200);
  assert.equal(result[1].bToPointSec, 400);
  assert.equal(result[1].pointToHospitalSec, 600);
  assert.equal(result[0].bToPointM, 3);
});

test("時間倍率只套用在無即時路況的來源，null 保持不變", () => {
  const base = { durationsSec: [[100, null]], distancesM: [[1, 1]], failures: [] };
  const open = applyTimeFactor({ ...base, provider: { hasLiveTraffic: false } }, 1.5);
  assert.deepEqual(open.durationsSec, [[150, null]]);
  const live = applyTimeFactor({ ...base, provider: { hasLiveTraffic: true } }, 1.5);
  assert.deepEqual(live.durationsSec, [[100, null]]);
});

test("planShuttle 串接矩陣服務並回傳建議", async () => {
  const provider = { id: "fake", label: "假服務", hasLiveTraffic: false };
  const calls = [];
  const fakeMatrix = async (origins, destinations) => {
    calls.push([origins.length, destinations.length]);
    if (destinations.length === 1) return { durationsSec: [[600], [60]], distancesM: [[1], [1]], provider, failures: [] };
    return { durationsSec: [[300, 900], [600, 120]], distancesM: [[1, 1], [1, 1]], provider, failures: ["Google：測試失敗"] };
  };
  const plan = await planShuttle({
    scene: { lat: 24.7, lng: 121.4 },
    bStation: { code: "B", name: "B", lat: 24.9, lng: 121.2, hospitalCodes: [], note: "" },
    hospital: { code: "H", name: "H", lat: 24.9, lng: 121.2, note: "" },
    transferPoints: [point("T1"), point("T2")],
    settings,
  }, fakeMatrix);
  // T1：A 5 分、B 2+10=12 分 → 碰頭 12；T2：A 15、B 2+2=4 → 碰頭 15（差 3 分，在門檻內）
  // 總時間 T1 = 12+10 = 22，T2 = 15+1 = 16 → 選 T2
  assert.equal(plan.ranked[0].point.code, "T2");
  assert.deepEqual(calls.sort(), [[2, 2], [2, 1]].sort());
  assert.deepEqual(plan.failures, ["Google：測試失敗"]);
  assert.equal(plan.providers.length, 1);
});

test("沒有接駁點時丟出中文錯誤", async () => {
  await assert.rejects(
    planShuttle({ scene: {}, bStation: {}, hospital: {}, transferPoints: [], settings }, async () => ({})),
    /沒有任何啟用中的接駁點/,
  );
});
