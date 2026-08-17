/**
 * ui/file-center.js
 * 文件中心：任务运行产出的文件（线索清单 CSV / 话术与方案 MD）统一收纳。
 * 数据源是 file-store（localStorage 持久化 + 发布订阅），双栏布局——
 * 左侧按项目组分组的文件列表，右侧预览（sheet 渲染表格 / doc 渲染排版）。
 * 对话里的文件卡点击、导航「文件中心」行都从这里进；
 * initialFileId 传入时直接选中并预览该文件。
 */
import { openPage, el } from "./pages.js";
import { listFiles, getFile, subscribe } from "../agents/file-store.js";
import { displayCreatedBy } from "../brand.js";

const CSS = `
.sb-files{display:flex;height:100%;background:#FAFAFA;font-family:-apple-system,"PingFang SC","Microsoft YaHei",sans-serif}
.sb-files-list{flex:none;width:300px;border-right:1px solid rgba(15,15,15,0.06);overflow-y:auto;background:#fff}
.sb-files-group{padding:16px 14px 4px;font-size:11px;font-weight:600;color:#8A8F99;letter-spacing:.02em}
.sb-files-item{display:flex;align-items:center;gap:10px;padding:10px 14px;cursor:pointer;border-left:2px solid transparent}
.sb-files-item:hover{background:rgba(15,15,15,0.03)}
.sb-files-item.sb-on{background:rgba(76,154,255,0.08);border-left-color:#4C9AFF}
.sb-files-ico{flex:none;width:30px;height:30px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700}
.sb-files-ico.sb-sheet{background:rgba(87,178,106,0.14);color:#2F7D3F}
.sb-files-ico.sb-doc{background:rgba(76,154,255,0.12);color:#3B6BD4}
.sb-files-meta{flex:1;min-width:0}
.sb-files-name{font-size:13px;color:#1F2329;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sb-files-sub{font-size:11px;color:#8A8F99;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sb-files-preview{flex:1;min-width:0;overflow-y:auto;padding:28px 36px}
.sb-files-empty{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;color:#B0B4BB;font-size:13px}
.sb-files-empty b{font-size:15px;color:#8A8F99;font-weight:600}
.sb-files-ph{max-width:760px;margin:0 auto}
.sb-files-ptitle{font-size:19px;font-weight:600;color:#1F2329;margin-bottom:6px;word-break:break-all}
.sb-files-pmeta{font-size:12px;color:#8A8F99;margin-bottom:18px;padding-bottom:14px;border-bottom:1px solid rgba(15,15,15,0.06)}
.sb-files-pmeta span{margin-right:14px}

/* sheet：CSV 表格 */
.sb-files-table{width:100%;border-collapse:collapse;background:#fff;border:1px solid rgba(15,15,15,0.07);border-radius:10px;overflow:hidden;font-size:12.5px}
.sb-files-table th{background:#F5F6F8;color:#5A5E66;font-weight:600;text-align:left;padding:9px 12px;border-bottom:1px solid rgba(15,15,15,0.07);white-space:nowrap}
.sb-files-table td{padding:8px 12px;border-bottom:1px solid rgba(15,15,15,0.045);color:#1F2329}
.sb-files-table tr:last-child td{border-bottom:none}
.sb-files-table tr:hover td{background:rgba(15,15,15,0.02)}
.sb-files-tag{display:inline-block;padding:1px 8px;border-radius:999px;font-size:11px;font-weight:600}
.sb-files-tag.sb-a{background:rgba(232,99,99,0.12);color:#C4453C}
.sb-files-tag.sb-b{background:rgba(232,163,61,0.14);color:#B87A1E}
.sb-files-tag.sb-c{background:rgba(15,15,15,0.06);color:#5A5E66}

/* doc：Markdown 排版 */
.sb-files-doc{max-width:680px;font-size:13.5px;color:#1F2329;line-height:1.8}
.sb-files-doc h1{font-size:20px;font-weight:700;margin:0 0 14px;padding-bottom:10px;border-bottom:1px solid rgba(15,15,15,0.07)}
.sb-files-doc h2{font-size:15.5px;font-weight:600;margin:22px 0 8px;color:#1F2329}
.sb-files-doc p{margin:8px 0}
.sb-files-doc ul{margin:8px 0;padding-left:20px}
.sb-files-doc li{margin:4px 0}
.sb-files-doc blockquote{margin:12px 0;padding:8px 14px;border-left:3px solid rgba(232,163,61,0.6);background:rgba(232,163,61,0.06);border-radius:0 8px 8px 0;color:#5A5E66;font-size:12.5px}
.sb-files-doc strong{font-weight:600;color:#B87A1E}
.sb-files-doc table{width:100%;border-collapse:collapse;margin:12px 0;font-size:12.5px;background:#fff}
.sb-files-doc table th{background:#F5F6F8;padding:8px 12px;text-align:left;border:1px solid rgba(15,15,15,0.07);color:#5A5E66}
.sb-files-doc table td{padding:8px 12px;border:1px solid rgba(15,15,15,0.05)}
`;

let styleInjected = false;
function ensureStyle() {
  if (styleInjected) return;
  const tag = document.createElement("style");
  tag.textContent = CSS;
  document.head.appendChild(tag);
  styleInjected = true;
}

function escapeHtml(text) {
  return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function formatTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const hm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  if (sameDay) return hm;
  return `${d.getMonth() + 1}/${d.getDate()} ${hm}`;
}

/* ── 渲染器：CSV → 表格 ── */
function renderSheet(container, content) {
  const rows = String(content).split("\n").map((line) => line.trim()).filter(Boolean).map((line) => line.split(","));
  if (!rows.length) {
    container.appendChild(el("div", "sb-files-doc", "（空表格）"));
    return;
  }
  const table = el("table", "sb-files-table");
  const thead = document.createElement("thead");
  const htr = document.createElement("tr");
  for (const cell of rows[0]) htr.appendChild(el("th", null, cell));
  thead.appendChild(htr);
  table.appendChild(thead);
  const tbody = document.createElement("tbody");
  for (const row of rows.slice(1)) {
    const tr = document.createElement("tr");
    for (let i = 0; i < rows[0].length; i += 1) {
      const text = row[i] || "";
      const td = document.createElement("td");
      // 意向等级 / 优先级等单字母列做成彩色徽标
      if (/^[ABC]$/.test(text) && /等级|优先级/.test(rows[0][i] || "")) {
        const tag = el("span", `sb-files-tag sb-${text.toLowerCase()}`, text);
        td.appendChild(tag);
      } else {
        td.textContent = text;
      }
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  container.appendChild(table);
}

/* ── 渲染器：Markdown → 排版（自家产出物，语法子集即可） ── */
function renderDoc(container, content) {
  const html = [];
  let inList = false;
  let inTable = false;
  const inline = (text) => escapeHtml(text).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  const closeBlocks = () => {
    if (inList) { html.push("</ul>"); inList = false; }
    if (inTable) { html.push("</table>"); inTable = false; }
  };
  for (const raw of String(content).split("\n")) {
    const line = raw.trimEnd();
    const trimmed = line.trim();
    if (!trimmed) { closeBlocks(); continue; }
    if (trimmed.startsWith("## ")) { closeBlocks(); html.push(`<h2>${inline(trimmed.slice(3))}</h2>`); continue; }
    if (trimmed.startsWith("# ")) { closeBlocks(); html.push(`<h1>${inline(trimmed.slice(2))}</h1>`); continue; }
    if (trimmed.startsWith("> ")) { closeBlocks(); html.push(`<blockquote>${inline(trimmed.slice(2))}</blockquote>`); continue; }
    if (trimmed.startsWith("- ")) {
      if (inTable) { html.push("</table>"); inTable = false; }
      if (!inList) { html.push("<ul>"); inList = true; }
      html.push(`<li>${inline(trimmed.slice(2))}</li>`);
      continue;
    }
    if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
      const cells = trimmed.slice(1, -1).split("|").map((c) => c.trim());
      if (cells.every((c) => /^:?-{2,}:?$/.test(c))) continue; // 分隔行
      if (inList) { html.push("</ul>"); inList = false; }
      const cellTag = inTable ? "td" : "th";
      if (!inTable) { html.push("<table>"); inTable = true; }
      html.push(`<tr>${cells.map((c) => `<${cellTag}>${inline(c)}</${cellTag}>`).join("")}</tr>`);
      continue;
    }
    closeBlocks();
    html.push(`<p>${inline(trimmed)}</p>`);
  }
  closeBlocks();
  const doc = el("div", "sb-files-doc");
  doc.innerHTML = html.join("");
  container.appendChild(doc);
}

/**
 * 打开文件中心页面。
 * options: { initialFileId, onClose }
 */
export function openFileCenterPage({ initialFileId = null, projectId = null, projectName = "", onClose = null } = {}) {
  ensureStyle();
  let selectedId = null;
  let unsubscribe = null;

  const page = openPage({
    title: "文件中心",
    onClose: () => {
      if (unsubscribe) { unsubscribe(); unsubscribe = null; }
      onClose?.();
    }
  });

  const wrap = el("div", "sb-files notranslate");
  wrap.setAttribute("translate", "no");
  const listCol = el("div", "sb-files-list");
  const preview = el("div", "sb-files-preview");
  wrap.append(listCol, preview);
  page.body.appendChild(wrap);

  function renderPreview() {
    preview.textContent = "";
    if (!selectedId) {
      const empty = el("div", "sb-files-empty");
      empty.appendChild(el("b", null, "选择左侧文件预览"));
      empty.appendChild(el("span", null, "表格与文档都支持直接预览"));
      preview.appendChild(empty);
      return;
    }
    const file = getFile(selectedId);
    if (!file) {
      selectedId = null;
      renderPreview();
      return;
    }
    const holder = el("div", "sb-files-ph");
    holder.appendChild(el("div", "sb-files-ptitle", file.name));
    const meta = el("div", "sb-files-pmeta");
    meta.appendChild(el("span", null, `项目组：${file.projectName || "—"}`));
    meta.appendChild(el("span", null, `创建者：${displayCreatedBy(file.createdBy) || "—"}`));
    meta.appendChild(el("span", null, `更新于 ${formatTime(file.updated_at || file.created_at)}`));
    holder.appendChild(meta);
    if (file.type === "sheet") renderSheet(holder, file.content);
    else renderDoc(holder, file.content);
    preview.appendChild(holder);
  }

  function renderList() {
    listCol.textContent = "";
    const files = listFiles().filter((file) => {
      if (projectId) return file.projectId === projectId;
      if (projectName) return file.projectName === projectName;
      return true;
    });
    if (!files.length) {
      const empty = el("div", "sb-files-empty");
      empty.style.padding = "40px 20px";
      empty.appendChild(el("b", null, projectName ? `${projectName}暂无文件` : "还没有文件"));
      empty.appendChild(el("span", null, projectName ? "该项目组的任务产出会出现在这里" : "任务产出的文件会出现在这里"));
      listCol.appendChild(empty);
      return;
    }
    const groups = new Map();
    for (const file of files) {
      const key = file.projectName || "未分组";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(file);
    }
    for (const [projectName, items] of groups) {
      listCol.appendChild(el("div", "sb-files-group", `${projectName} · ${items.length}`));
      for (const file of items) {
        const item = el("div", `sb-files-item${file.id === selectedId ? " sb-on" : ""}`);
        const ico = el("span", `sb-files-ico ${file.type === "sheet" ? "sb-sheet" : "sb-doc"}`, file.type === "sheet" ? "表" : "文");
        const meta = el("div", "sb-files-meta");
        meta.appendChild(el("div", "sb-files-name", file.name));
        meta.appendChild(el("div", "sb-files-sub", `${displayCreatedBy(file.createdBy) || "—"} · ${formatTime(file.updated_at || file.created_at)}`));
        item.append(ico, meta);
        item.addEventListener("click", () => {
          selectedId = file.id;
          renderList();
          renderPreview();
        });
        listCol.appendChild(item);
      }
    }
  }

  if (initialFileId && getFile(initialFileId)) selectedId = initialFileId;
  renderList();
  renderPreview();

  // 任务运行产出新文件时实时刷新列表；正在预览的文件被覆盖更新时同步刷新预览
  unsubscribe = subscribe(() => {
    renderList();
    if (selectedId) renderPreview();
  });

  return page;
}
