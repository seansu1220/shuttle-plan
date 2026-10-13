// 簡易 CSV 解析（支援雙引號包覆、欄位內逗號與換行、"" 跳脫）。純函式。

/**
 * @param {string} text
 * @returns {string[][]}
 */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  const source = text.replace(/^﻿/, "");

  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (inQuotes) {
      if (ch === '"' && source[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else field += ch;
      continue;
    }
    if (ch === '"') inQuotes = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && source[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += ch;
  }
  if (field !== "" || row.length > 0) { row.push(field); rows.push(row); }
  return rows.filter((cells) => cells.some((cell) => cell.trim() !== ""));
}

/**
 * 以第一列為標題，轉成物件陣列；標題為空的欄位（試算表多出來的空欄）會略過。
 * @param {string} text
 * @returns {Record<string, string>[]}
 */
export function parseCsvRecords(text) {
  const [header, ...body] = parseCsv(text);
  if (!header) return [];
  const keys = header.map((key) => key.trim());
  return body.map((cells) => {
    const record = {};
    keys.forEach((key, index) => {
      if (key) record[key] = (cells[index] ?? "").trim();
    });
    return record;
  });
}
