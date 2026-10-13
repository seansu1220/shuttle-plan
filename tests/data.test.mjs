import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseCsv, parseCsvRecords } from "../js/csv.js";
import { normalizePlaces, normalizeSettings, parseCoordinate } from "../js/dataSource.js";
import { buildLaunchUrl, buildShareText, formatMinutes } from "../js/format.js";

test("CSV 解析支援引號、逗號、跳脫引號與 BOM", () => {
  const rows = parseCsv('﻿代碼,名稱\r\nT1,"羅浮橋, 北橫"\nT2,"說""明"\n\n');
  assert.deepEqual(rows, [["代碼", "名稱"], ["T1", "羅浮橋, 北橫"], ["T2", '說"明']]);
});

test("試算表多出的空白欄位會被忽略", () => {
  const records = parseCsvRecords('"代碼","名稱","",""\n"T1","A","",""');
  assert.deepEqual(records, [{ 代碼: "T1", 名稱: "A" }]);
});

test("座標支援「座標」單欄與緯度經度分欄，超出台灣範圍視為錯誤", () => {
  assert.deepEqual(parseCoordinate({ 座標: "24.8, 121.3" }), { lat: 24.8, lng: 121.3 });
  assert.deepEqual(parseCoordinate({ 座標: "24.8，121.3" }), { lat: 24.8, lng: 121.3 });
  assert.deepEqual(parseCoordinate({ 緯度: "24.8", 經度: "121.3" }), { lat: 24.8, lng: 121.3 });
  assert.equal(parseCoordinate({ 座標: "121.3, 24.8" }), null);
  assert.equal(parseCoordinate({ 座標: "abc" }), null);
});

test("資料檢查：略過停用、缺欄、重複代碼與錯誤座標，並產生警告", () => {
  const warnings = [];
  const places = normalizePlaces([
    { 代碼: "T1", 名稱: "甲", 座標: "24.8, 121.3", 啟用: "是" },
    { 代碼: "T2", 名稱: "乙", 座標: "24.8, 121.3", 啟用: "否" },
    { 代碼: "", 名稱: "丙", 座標: "24.8, 121.3" },
    { 代碼: "T1", 名稱: "丁", 座標: "24.8, 121.3" },
    { 代碼: "T5", 名稱: "戊", 座標: "0, 0" },
  ], "接駁點", warnings);
  assert.deepEqual(places.map((p) => p.code), ["T1"]);
  assert.equal(warnings.length, 3);
});

test("設定分頁覆寫預設值，非數字時保留預設並警告", () => {
  const warnings = [];
  const settings = normalizeSettings([
    { 項目: "B分隊準備時間(分鐘)", 值: "4" },
    { 項目: "碰頭時間相近門檻(分鐘)", 值: "abc" },
  ], warnings);
  assert.equal(settings.bPrepMinutes, 4);
  assert.equal(settings.tieThresholdMinutes, 3);
  assert.equal(warnings.length, 1);
});

test("示範資料全部通過檢查", () => {
  const dir = new URL("../data/sample/", import.meta.url);
  for (const [file, label] of [["stations.csv", "分隊"], ["transfer_points.csv", "接駁點"], ["hospitals.csv", "醫院"]]) {
    const warnings = [];
    const places = normalizePlaces(parseCsvRecords(readFileSync(new URL(file, dir), "utf8")), label, warnings);
    assert.deepEqual(warnings, [], `${file} 有警告`);
    assert.ok(places.length > 0);
  }
});

test("啟動網址只帶 a、b 參數", () => {
  assert.equal(buildLaunchUrl("https://x.github.io/shuttle/?old=1", "FX", ""), "https://x.github.io/shuttle/?a=FX");
  assert.equal(buildLaunchUrl("https://x.github.io/shuttle/", "FX", "BL"), "https://x.github.io/shuttle/?a=FX&b=BL");
});

test("分享文字包含接駁點、導航連結", () => {
  const text = buildShareText({
    aName: "巴陵", bName: "復興", hospitalName: "國軍桃園總醫院", computedAt: new Date(2026, 0, 1, 10, 0),
    candidate: { point: { name: "羅浮橋", note: "", lat: 24.8, lng: 121.36 }, meetSec: 900, bArriveSec: 600 },
  });
  assert.match(text, /接駁點：羅浮橋/);
  assert.match(text, /10:15/);
  assert.match(text, /destination=24.8,121.36/);
});

test("時間格式化", () => {
  assert.equal(formatMinutes(20), "1 分");
  assert.equal(formatMinutes(25 * 60), "25 分");
  assert.equal(formatMinutes(90 * 60), "1 小時 30 分");
});
