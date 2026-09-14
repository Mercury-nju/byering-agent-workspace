const DOUYIN_PROFILE_URL_PATTERN = /https?:\/\/(?:www\.)?douyin\.com\/user\/[^\s,，;；)）]+/gi;

function cleanProfileUrl(value) {
  const source = String(value || "").trim().replace(/[.,!?。！？]+$/g, "");
  if (!source) return null;
  try {
    const url = new URL(source);
    if (!/^https?:$/.test(url.protocol) || !/^(?:www\.)?douyin\.com$/i.test(url.hostname)) return null;
    if (!/^\/user\/[^/?#]+/i.test(url.pathname)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function extractDouyinProfileUrls(value = "") {
  const source = String(value || "");
  const candidates = source.match(DOUYIN_PROFILE_URL_PATTERN) || [];
  return [...new Set(candidates.map(cleanProfileUrl).filter(Boolean))];
}

export async function readPrivateOutreachFile(file) {
  if (!file) return { name: "", urls: [] };
  const name = String(file.name || "未命名文件");
  const extension = name.split(".").pop()?.toLowerCase() || "";
  if (["txt", "csv", "tsv"].includes(extension)) {
    return { name, urls: extractDouyinProfileUrls(await file.text()) };
  }
  if (["xlsx", "xls"].includes(extension)) {
    const XLSX = await import("../../../node_modules/xlsx/xlsx.mjs");
    const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
    const values = workbook.SheetNames.flatMap((sheetName) => {
      const sheet = workbook.Sheets[sheetName];
      return XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "" }).flat();
    });
    return { name, urls: extractDouyinProfileUrls(values.join("\n")) };
  }
  throw Object.assign(new Error("暂支持 TXT、CSV、TSV、XLS 和 XLSX 文件"), { code: "PRIVATE_OUTREACH_FILE_TYPE_UNSUPPORTED" });
}

export function mergePrivateOutreachUrls(...groups) {
  return [...new Set(groups.flatMap((group) => Array.isArray(group) ? group : extractDouyinProfileUrls(group)))];
}
