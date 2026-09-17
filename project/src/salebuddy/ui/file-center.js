/**
 * ui/file-center.js
 * 文件中心：任务运行产出的文件（线索清单 CSV / 话术与方案 MD）统一收纳。
 * 数据源是 file-store（localStorage 持久化 + 发布订阅），双栏布局——
 * 左侧按项目组分组的文件列表，右侧预览（sheet 渲染表格 / doc 渲染排版）。
 * 对话里的文件卡点击、导航「文件中心」行都从这里进；
 * initialFileId 传入时直接选中并预览该文件。
 */
import { openPage, el } from "./pages.js";
import { clearNavigationRoute, persistNavigationRoute } from "./navigation-routes.js";
import { addFile, listFiles, getFile, subscribe } from "../agents/file-store.js";
import { displayCreatedBy } from "../brand.js";
import { fetchCanonicalArtifact } from "../bridge/results-client.js";
import { createResultsMockPreviewFiles, isResultsMockPreview } from "./results-mock-preview.js";

const CSS = `
.sb-files{display:flex;height:100%;overflow:hidden;border-radius:16px;background:var(--byering-paper,var(--sb-app-page-bg,#f7f8fb));color:var(--byering-ink,#080808);font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif}
html[data-byering-theme="ai-shuban"] .sb-page--files>.sb-page-body{padding:10px 32px!important}
.sb-files-list{flex:none;width:320px;overflow-y:auto;padding:18px 10px 14px;border-right:1px solid var(--byering-line,rgba(15,15,15,0.08));background:rgba(255,255,255,.92)}
.sb-files-list-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:2px 12px 18px}
.sb-files-list-title{font-size:14px;font-weight:650;color:var(--byering-ink,#080808)}
.sb-files-list-count{color:#8f949c;font-size:11px;font-variant-numeric:tabular-nums}
.sb-files-group{padding:14px 12px 6px;color:#8a8f99;font-size:10px;font-weight:650;letter-spacing:.08em}
.sb-files-item{display:flex;align-items:center;gap:11px;margin:2px 0;padding:10px 10px;border:1px solid transparent;border-radius:10px;cursor:pointer}
.sb-files-item:hover{background:#f7f7f7}
.sb-files-item.sb-on{border-color:#e5e5e5;background:#f1f1f1}
.sb-files-ico{flex:none;width:34px;height:34px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;letter-spacing:-.02em}
.sb-files-ico.sb-sheet{background:#eaf6ee;color:#237243}
.sb-files-ico.sb-doc{background:#edf3ff;color:#3f6fd0}
.sb-files-ico.sb-html{background:#f3f3f3;color:#5d626b;font-size:9px}
.sb-files-meta{flex:1;min-width:0}
.sb-files-name{font-size:13px;color:#24272d;line-height:1.35;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sb-files-sub{margin-top:3px;color:#8a8f99;font-size:11px;line-height:1.35;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sb-files-preview{flex:1;min-width:0;overflow-y:auto;padding:34px clamp(28px,4vw,58px) 48px}
.sb-files-empty{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;color:#a0a5ad;font-size:13px}
.sb-files-empty b{font-size:14px;color:#70757d;font-weight:600}
.sb-files-ph{max-width:960px;margin:0 auto}
.sb-files-html{display:block;width:100%;height:780px;border:1px solid var(--byering-line,#ededed);border-radius:12px;background:#fff;box-shadow:0 8px 24px rgba(0,0,0,.03)}
.sb-files-ptitle{margin-bottom:8px;color:var(--byering-ink,#080808);font-size:23px;font-weight:600;line-height:1.35;word-break:break-all}
.sb-files-pmeta{display:flex;flex-wrap:wrap;gap:4px 18px;margin-bottom:20px;padding-bottom:16px;border-bottom:1px solid var(--byering-line,#ededed);color:#8a8f99;font-size:12px;line-height:1.5}
.sb-files-pmeta span{margin:0}
.sb-files-provenance{display:grid;gap:7px;margin:-4px 0 20px;padding:12px 14px;border:1px solid #dbe6fb;border-radius:10px;background:#f5f8ff;color:#5b687b;font-size:12px;line-height:1.55}
.sb-files-provenance strong{color:#334155;font-weight:650}

/* sheet：CSV 表格 */
.sb-files-table{width:100%;border-collapse:collapse;background:#fff;border:1px solid var(--byering-line,#ededed);border-radius:12px;overflow:hidden;font-size:13px;box-shadow:0 8px 24px rgba(0,0,0,.03)}
.sb-files-table th{background:#fafafa;color:#5a5e66;font-weight:600;text-align:left;padding:11px 13px;border-bottom:1px solid var(--byering-line,#ededed);white-space:nowrap}
.sb-files-table td{padding:10px 13px;border-bottom:1px solid #f0f0f0;color:#24272d}
.sb-files-table tr:last-child td{border-bottom:none}
.sb-files-table tr:hover td{background:#fafafa}
.sb-files-tag{display:inline-block;padding:1px 8px;border-radius:999px;font-size:11px;font-weight:600}
.sb-files-tag.sb-a{background:rgba(232,99,99,0.12);color:#C4453C}
.sb-files-tag.sb-b{background:rgba(232,163,61,0.14);color:#B87A1E}
.sb-files-tag.sb-c{background:rgba(15,15,15,0.06);color:#5A5E66}

/* doc：Markdown 排版 */
.sb-files-doc{max-width:760px;padding:28px 30px 36px;border:1px solid var(--byering-line,#ededed);border-radius:12px;background:#fff;box-shadow:0 8px 24px rgba(0,0,0,.03);font-size:15px;color:#24272d;line-height:1.85}
.sb-files-doc h1{font-size:23px;font-weight:700;margin:0 0 16px;padding-bottom:12px;border-bottom:1px solid var(--byering-line,#ededed)}
.sb-files-doc h2{font-size:17px;font-weight:650;margin:24px 0 9px;color:#24272d}
.sb-files-doc h3{font-size:15px;font-weight:650;margin:19px 0 7px;color:#334155}
.sb-files-doc p{margin:8px 0}
.sb-files-doc ul{margin:8px 0;padding-left:20px}
.sb-files-doc li{margin:4px 0}
.sb-files-doc blockquote{margin:14px 0;padding:10px 14px;border-left:3px solid #b8c9ed;background:#f5f8ff;border-radius:0 8px 8px 0;color:#5a687a;font-size:13px}
.sb-files-doc strong{font-weight:650;color:#4d5d77}
.sb-files-doc table{width:100%;border-collapse:collapse;margin:14px 0;font-size:13px;background:#fff}
.sb-files-doc table th{background:#fafafa;padding:9px 12px;text-align:left;border:1px solid var(--byering-line,#ededed);color:#5a5e66}
.sb-files-doc table td{padding:9px 12px;border:1px solid #f0f0f0}
@media (max-width:860px){.sb-files-list{width:280px}.sb-files-preview{padding-inline:28px}}
@media (max-width:760px){html[data-byering-theme="ai-shuban"] .sb-page--files>.sb-page-body{padding:0!important}.sb-files{display:block;overflow:auto}.sb-files-list{width:100%;max-height:38vh;border-right:0;border-bottom:1px solid var(--byering-line,#ededed)}.sb-files-preview{min-height:62vh;padding:24px 18px 34px}.sb-files-doc{padding:22px 20px 28px}.sb-files-ptitle{font-size:20px}}
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

function displayFileName(file = {}) {
  if (file.projectName === "账号研究" && ["doc", "html"].includes(file.type)) {
    const purpose = file.sourceTaskGoal || file.sourceTaskTitle;
    return purpose ? `${purpose} · 分析报告` : "抖音账号分析报告";
  }
  return file.name || "未命名文件";
}

function cacheCanonicalArtifact(artifact = {}) {
  if (!artifact || typeof artifact !== "object") return null;
  return addFile({
    id: artifact.id || null,
    name: artifact.name || "任务产出",
    type: artifact.type || "doc",
    mimeType: artifact.mimeType || null,
    content: artifact.content || "",
    projectId: artifact.projectId || null,
    projectName: artifact.projectName || "",
    taskId: artifact.taskId || null,
    taskRunId: artifact.taskRunId || null,
    agentId: artifact.agentId || null,
    accountId: artifact.accountId || null,
    reportDate: artifact.reportDate || null,
    artifactKind: artifact.kind || null,
    createdBy: artifact.createdBy || "",
    createdAt: artifact.createdAt || null,
    updatedAt: artifact.updatedAt || artifact.createdAt || null,
    sourceTaskId: artifact.sourceTaskId || null,
    sourceTaskTitle: artifact.sourceTaskTitle || null,
    sourceTaskGoal: artifact.sourceTaskGoal || null,
    sourceResultId: artifact.sourceResultId || null,
    accountCount: artifact.accountCount ?? null,
    accountNames: artifact.accountNames || null,
    summary: artifact.summary || "",
    metadata: artifact.metadata || null
  });
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
    if (trimmed.startsWith("### ")) { closeBlocks(); html.push(`<h3>${inline(trimmed.slice(4))}</h3>`); continue; }
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

function renderHtmlFile(container, content, title) {
  const frame = document.createElement("iframe");
  frame.className = "sb-files-html";
  frame.title = title || "HTML file preview";
  frame.sandbox = "";
  frame.srcdoc = String(content || "");
  container.appendChild(frame);
}

/**
 * 打开文件中心页面。
 * options: { initialFileId, onClose }
 */
export function openFileCenterPage({ initialFileId = null, artifact = null, projectId = null, projectName = "", onClose = null } = {}) {
  persistNavigationRoute("files");
  ensureStyle();
  const mockPreview = isResultsMockPreview();
  const mockFiles = mockPreview ? createResultsMockPreviewFiles() : [];
  let selectedId = null;
  let unsubscribe = null;
  let active = true;

  const page = openPage({
    title: "",
    onClose: () => {
      active = false;
      if (unsubscribe) { unsubscribe(); unsubscribe = null; }
      clearNavigationRoute("files");
      onClose?.();
    }
  });
  page.root.classList.add("sb-page--files");
  page.root.querySelector(".sb-page-head")?.remove();

  const wrap = el("div", "sb-files notranslate");
  wrap.setAttribute("translate", "no");
  const listCol = el("div", "sb-files-list");
  const preview = el("div", "sb-files-preview");
  wrap.append(listCol, preview);
  page.body.appendChild(wrap);

  function visibleFiles() {
    const files = mockPreview ? mockFiles : listFiles();
    return files.filter((file) => {
      if (projectId) return file.projectId === projectId;
      if (projectName) return file.projectName === projectName;
      return true;
    });
  }

  function fileForId(id) {
    return mockFiles.find((file) => file.id === id) || getFile(id);
  }

  function renderPreview() {
    preview.textContent = "";
    if (!selectedId) {
      const empty = el("div", "sb-files-empty");
      empty.appendChild(el("b", null, "选择左侧文件预览"));
      empty.appendChild(el("span", null, "表格与文档都支持直接预览"));
      preview.appendChild(empty);
      return;
    }
    const file = fileForId(selectedId);
    if (!file) {
      selectedId = null;
      renderPreview();
      return;
    }
    const holder = el("div", "sb-files-ph");
    holder.appendChild(el("div", "sb-files-ptitle", displayFileName(file)));
    const meta = el("div", "sb-files-pmeta");
    meta.appendChild(el("span", null, `项目组：${file.projectName || "—"}`));
    meta.appendChild(el("span", null, `创建者：${displayCreatedBy(file.createdBy) || "—"}`));
    meta.appendChild(el("span", null, `更新于 ${formatTime(file.updated_at || file.created_at)}`));
    holder.appendChild(meta);
    if (file.sourceTaskTitle || file.sourceTaskGoal || file.accountCount != null) {
      const provenance = el("div", "sb-files-provenance");
      const appendMeta = (label, value) => {
        const line = el("div");
        line.append(el("strong", null, `${label}：`), document.createTextNode(String(value)));
        provenance.appendChild(line);
      };
      if (file.sourceTaskTitle) appendMeta("来源任务", file.sourceTaskTitle);
      if (file.sourceTaskGoal && file.sourceTaskGoal !== file.sourceTaskTitle) appendMeta("找人目的", file.sourceTaskGoal);
      if (file.accountCount != null) appendMeta("分析账号", `${file.accountCount} 个`);
      holder.appendChild(provenance);
    }
    if (file.type === "sheet") renderSheet(holder, file.content);
    else if (file.type === "html") renderHtmlFile(holder, file.content, file.name);
    else renderDoc(holder, file.content);
    preview.appendChild(holder);
  }

  function renderList() {
    listCol.textContent = "";
    const files = visibleFiles();
    const listHead = el("div", "sb-files-list-head");
    listHead.append(
      el("div", "sb-files-list-title", "最近文件"),
      el("div", "sb-files-list-count", `${files.length} 个`)
    );
    listCol.appendChild(listHead);
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
        const isSheet = file.type === "sheet";
        const isHtml = file.type === "html";
        const ico = el("span", `sb-files-ico ${isSheet ? "sb-sheet" : isHtml ? "sb-html" : "sb-doc"}`, isSheet ? "表" : isHtml ? "HTML" : "文");
        const meta = el("div", "sb-files-meta");
        meta.appendChild(el("div", "sb-files-name", displayFileName(file)));
        const origin = file.sourceTaskTitle || file.sourceTaskGoal || displayCreatedBy(file.createdBy) || "—";
        meta.appendChild(el("div", "sb-files-sub", `${origin} · ${formatTime(file.updated_at || file.created_at)}`));
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

  if (artifact) selectedId = cacheCanonicalArtifact(artifact);
  if (!selectedId && initialFileId && getFile(initialFileId)) selectedId = initialFileId;
  if (!selectedId && mockPreview) selectedId = visibleFiles()[0]?.id || null;
  renderList();
  renderPreview();

  // 任务运行产出新文件时实时刷新列表；正在预览的文件被覆盖更新时同步刷新预览
  unsubscribe = subscribe(() => {
    renderList();
    if (selectedId) renderPreview();
  });

  if (!selectedId && initialFileId) {
    void fetchCanonicalArtifact(initialFileId)
      .then((canonicalArtifact) => {
        if (!active) return;
        selectedId = cacheCanonicalArtifact(canonicalArtifact);
        renderList();
        renderPreview();
      })
      .catch(() => {
        // A legacy local file id is not guaranteed to exist in the control plane.
      });
  }

  return page;
}
