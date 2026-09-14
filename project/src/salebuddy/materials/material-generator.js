/**
 * Browser-safe material builders. HTML, PDF and infographic are generated as
 * real documents. PPT is delegated to the gateway OOXML adapter; the browser
 * fallback stays blocked rather than representing it with plain text bytes.
 */

const MIME = Object.freeze({
  html: "text/html;charset=utf-8",
  pdf: "application/pdf",
  infographic: "image/svg+xml",
  ppt: "application/vnd.openxmlformats-officedocument.presentationml.presentation"
});

export function materialMime(formatId) { return MIME[formatId] || "application/octet-stream"; }

function escapeHtml(value) {
  return String(value || "").replace(/[&<>\"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[char]));
}

function textLines({ title, transcript = "", duration = 0 }) {
  return [title || "未命名访谈物料", "倾耳 · 录音转物料", `录音时长：${duration} 秒`, "", transcript || "本次录音未提供转写文本。"];
}

function buildHtml(input) {
  const lines = textLines(input);
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>${escapeHtml(lines[0])}</title><style>body{font-family:system-ui,sans-serif;max-width:900px;margin:48px auto;padding:0 24px;color:#20242b}h1{font-size:32px}p{line-height:1.8;white-space:pre-wrap}</style></head><body><h1>${escapeHtml(lines[0])}</h1><p>${escapeHtml(lines.slice(1).join("\n"))}</p></body></html>`;
}

function buildSvg(input) {
  const lines = textLines(input);
  const safe = escapeHtml(lines[0]);
  const body = escapeHtml(lines.slice(1).join("\n"));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675"><rect width="1200" height="675" fill="#f7f8fa"/><rect x="64" y="64" width="1072" height="547" rx="20" fill="#17191d"/><rect x="112" y="112" width="976" height="4" fill="#f06b5d"/><text x="112" y="202" fill="#fff" font-size="42" font-family="Arial, sans-serif">${safe}</text><text x="112" y="270" fill="#c6cad1" font-size="22" font-family="Arial, sans-serif"><![CDATA[${body}]]></text><text x="112" y="560" fill="#8f98a6" font-size="18" font-family="Arial, sans-serif">倾耳 · 录音转物料</text></svg>`;
}

function buildPdf(input) {
  const lines = textLines(input).map((line) => String(line).replace(/[()\\]/g, "\\$&"));
  const stream = ["BT", "/F1 18 Tf", "72 740 Td", ...lines.map((line) => `(${line}) Tj 0 -26 Td`), "ET"].join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${new TextEncoder().encode(stream).length} >>\nstream\n${stream}\nendstream`
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => { offsets[index + 1] = pdf.length; pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => { pdf += `${String(offset).padStart(10, "0")} 00000 n \n`; });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(pdf);
}

export function buildMaterialArtifact({ formatId, title, transcript, duration } = {}) {
  const input = { title, transcript, duration };
  if (formatId === "html") return { formatId, mimeType: MIME.html, body: buildHtml(input), ready: true };
  if (formatId === "pdf") return { formatId, mimeType: MIME.pdf, body: buildPdf(input), ready: true };
  if (formatId === "infographic") return { formatId, mimeType: MIME.infographic, body: buildSvg(input), ready: true };
  return { formatId, mimeType: MIME.ppt, body: null, ready: false, code: "ppt_converter_not_configured" };
}
