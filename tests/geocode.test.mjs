import { test } from "node:test";
import assert from "node:assert/strict";
import { buildNominatimQueries, parseCoordinateText, normalizeQuery, formatNominatimLabel } from "../js/geocode.js";

test("全形數字與空白轉半形", () => {
  assert.equal(normalizeQuery("  復興區中正路２０號　"), "復興區中正路20號");
});

test("座標文字與 Google 地圖連結可直接解析", () => {
  assert.deepEqual(
    { lat: parseCoordinateText("24.814, 121.35").lat, lng: parseCoordinateText("24.814, 121.35").lng },
    { lat: 24.814, lng: 121.35 },
  );
  const fromLink = parseCoordinateText("https://www.google.com/maps/@24.6858,121.398,15z");
  assert.equal(fromLink.lat, 24.6858);
  assert.equal(fromLink.lng, 121.398);
  assert.equal(parseCoordinateText("121.35, 24.81"), null);
  assert.equal(parseCoordinateText("復興區中正路20號"), null);
});

test("門牌地址：先結構化查門牌，再全文，再放寬到路段", () => {
  const queries = buildNominatimQueries("桃園市復興區中正路20號");
  assert.deepEqual(queries[0], { params: { street: "20 中正路", city: "復興區", state: "桃園市" }, precise: true });
  assert.deepEqual(queries[1], { params: { q: "桃園市復興區中正路20號" }, precise: true });
  assert.deepEqual(queries[2], { params: { q: "桃園市復興區中正路" }, precise: false });
});

test("有段、巷、弄的地址取出正確門牌與路段", () => {
  const queries = buildNominatimQueries("復興區復興路九段12巷3弄5號");
  assert.deepEqual(queries[0].params, { street: "5 復興路九段", city: "復興區" });
  assert.equal(queries.at(-1).params.q, "復興區復興路九段");
  assert.equal(queries.at(-1).precise, false);
});

test("沒有門牌的地標只查一次；含鄰時另外放寬", () => {
  assert.deepEqual(buildNominatimQueries("巴陵橋"), [{ params: { q: "巴陵橋" }, precise: true }]);
  const withNeighborhood = buildNominatimQueries("復興區華陵里10鄰");
  assert.deepEqual(withNeighborhood.map((q) => q.params.q), ["復興區華陵里10鄰", "復興區華陵里"]);
  assert.equal(withNeighborhood[1].precise, false);
});

test("Nominatim 名稱轉成台灣習慣的大到小順序", () => {
  assert.equal(formatNominatimLabel("巴陵橋, 三光里, 復興區, 桃園市, 33644, 臺灣"), "桃園市 復興區 三光里 巴陵橋");
});
