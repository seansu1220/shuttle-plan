// DOM 小工具。

const HTML_ESCAPES = Object.freeze({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" });

/** 試算表內容可能含特殊字元，插入 HTML 前一律跳脫。 @param {unknown} value */
export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);
}

/**
 * 分享文字：優先用手機原生分享（可選 LINE），不支援時複製到剪貼簿。
 * @param {string} text
 * @returns {Promise<"shared"|"copied"|"cancelled">}
 */
export async function shareOrCopy(text) {
  if (navigator.share) {
    try {
      await navigator.share({ text });
      return "shared";
    } catch (error) {
      if (error.name === "AbortError") return "cancelled";
      console.warn("[dom.shareOrCopy] 原生分享失敗，改用複製", error);
    }
  }
  await copyText(text);
  return "copied";
}

/** @param {string} text */
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch (error) {
    // 舊瀏覽器或非 HTTPS：退回 execCommand
    const area = document.createElement("textarea");
    area.value = text;
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    if (!ok) throw new Error(`無法複製到剪貼簿（${error.message}）`);
  }
}
