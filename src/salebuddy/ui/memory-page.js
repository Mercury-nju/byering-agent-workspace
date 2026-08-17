/**
 * Main Agent memory map.
 * The map is a visual index over the same agent.memory.* records used elsewhere.
 */
import { el, openPage } from "./pages.js";
import { mountAgentAvatar } from "./agent-avatar.js";

const STORAGE_KEY = "byering.main-agent-memory-enabled";
const KIND_DEFINITIONS = Object.freeze([
  { kind: "userRules", label: "用户偏好", icon: "◌", tone: "blue", copy: "称呼、表达方式与长期偏好" },
  { kind: "projectRules", label: "项目背景", icon: "□", tone: "violet", copy: "项目目标、客户与业务上下文" },
  { kind: "bestPractices", label: "工作方法", icon: "⌁", tone: "green", copy: "已经验证的流程与交付标准" },
  { kind: "feedback", label: "纠正反馈", icon: "↗", tone: "orange", copy: "你纠正过的判断与表达" },
  { kind: "lessons", label: "经验总结", icon: "✦", tone: "pink", copy: "任务复盘中沉淀的经验" }
]);

const KIND_LABELS = Object.freeze(Object.fromEntries(KIND_DEFINITIONS.map(({ kind, label }) => [kind, label])));
const SCOPE_LABELS = Object.freeze({ task: "本次任务", project: "当前项目", agent: "主 Agent", organization: "整个组织" });
const DEMO_MEMORY_ENTRIES = Object.freeze([
  { id: "demo-memory-preference-1", kind: "userRules", text: "先给结论，再补充依据；重要判断用短句说明。", scope: "agent", source: "demo", status: "active", version: 1, createdAt: "2026-08-10T09:20:00.000Z", updatedAt: "2026-08-10T09:20:00.000Z" },
  { id: "demo-memory-preference-2", kind: "userRules", text: "涉及外部触达、报价或承诺时，先停下来让我确认。", scope: "organization", source: "demo", status: "active", version: 1, createdAt: "2026-08-11T14:10:00.000Z", updatedAt: "2026-08-11T14:10:00.000Z" },
  { id: "demo-memory-project-1", kind: "projectRules", text: "当前重点是把高意向客户推进到有效回复和下一步跟进。", scope: "project", source: "demo", status: "active", version: 1, createdAt: "2026-08-09T11:30:00.000Z", updatedAt: "2026-08-09T11:30:00.000Z" },
  { id: "demo-memory-project-2", kind: "projectRules", text: "销售数据必须保留来源、更新时间和核验状态，不能只给汇总数字。", scope: "project", source: "demo", status: "active", version: 1, createdAt: "2026-08-10T16:45:00.000Z", updatedAt: "2026-08-10T16:45:00.000Z" },
  { id: "demo-memory-method-1", kind: "bestPractices", text: "先去重和核验，再做意向评分；评分后才进入触达队列。", scope: "agent", source: "demo", status: "active", version: 1, createdAt: "2026-08-08T10:05:00.000Z", updatedAt: "2026-08-08T10:05:00.000Z" },
  { id: "demo-memory-method-2", kind: "bestPractices", text: "每个任务结束时沉淀结果、未解决问题和下一步动作，方便继续推进。", scope: "agent", source: "demo", status: "active", version: 1, createdAt: "2026-08-12T18:20:00.000Z", updatedAt: "2026-08-12T18:20:00.000Z" },
  { id: "demo-memory-feedback-1", kind: "feedback", text: "不要把“已安排”写成“已完成”，状态必须和真实证据一致。", scope: "organization", source: "demo", status: "active", version: 1, createdAt: "2026-08-11T09:40:00.000Z", updatedAt: "2026-08-11T09:40:00.000Z" },
  { id: "demo-memory-feedback-2", kind: "feedback", text: "员工进场要用第一人称说话，语气自然一些，不要只播报协议状态。", scope: "agent", source: "demo", status: "active", version: 1, createdAt: "2026-08-12T13:15:00.000Z", updatedAt: "2026-08-12T13:15:00.000Z" },
  { id: "demo-memory-lesson-1", kind: "lessons", text: "当证据不足时，先列出缺口和需要补充的授权，不要用经验补齐事实。", scope: "agent", source: "demo", status: "active", version: 1, createdAt: "2026-08-07T17:50:00.000Z", updatedAt: "2026-08-07T17:50:00.000Z" },
  { id: "demo-memory-lesson-2", kind: "lessons", text: "复杂目标拆成发现、判断、执行、确认四步，用户更容易在关键节点做决定。", scope: "project", source: "demo", status: "active", version: 1, createdAt: "2026-08-12T20:05:00.000Z", updatedAt: "2026-08-12T20:05:00.000Z" }
]);

const CSS = `
.sb-memory-map-page.sb-page{background:#f7f8fa;color:#1f2329}
.sb-memory-map-page .sb-page-head{display:none}
.sb-memory-map-page .sb-page-body{overflow:hidden;background:#f7f8fa}
.sb-memory-map{position:relative;width:100%;height:100%;min-height:620px;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;background:#f7f8fa;color:#1f2329}
.sb-memory-map::before{content:"";position:absolute;inset:0;background-image:radial-gradient(circle,rgba(31,35,41,.12) 1px,transparent 1.1px);background-size:24px 24px;opacity:.5;pointer-events:none}
.sb-memory-toolbar{position:absolute;z-index:8;top:20px;left:22px;right:22px;display:flex;align-items:center;justify-content:space-between;gap:14px;pointer-events:none}
.sb-memory-toolbar-left,.sb-memory-toolbar-right{display:flex;align-items:center;gap:10px;pointer-events:auto}
.sb-memory-icon-button,.sb-memory-pill,.sb-memory-toggle{height:42px;border:1px solid rgba(15,15,15,.1);border-radius:13px;background:rgba(255,255,255,.94);color:#1f2329;box-shadow:0 8px 24px rgba(32,40,48,.08);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);font:inherit;cursor:pointer}
.sb-memory-icon-button{width:42px;display:grid;place-items:center;font-size:23px;font-weight:300;color:#646b73}
.sb-memory-icon-button:hover,.sb-memory-pill:hover,.sb-memory-toggle:hover{border-color:rgba(15,15,15,.2);background:#fff}
.sb-memory-pill{display:flex;align-items:center;gap:9px;padding:0 14px;font-size:14px;font-weight:600}
.sb-memory-pill-icon{font-size:17px;color:#b97717}
.sb-memory-help{width:18px;height:18px;display:grid;place-items:center;border:1px solid rgba(31,35,41,.3);border-radius:50%;font-size:11px;color:#646b73}
.sb-memory-demo-badge{height:26px;display:inline-flex;align-items:center;padding:0 9px;border:1px solid rgba(185,119,23,.2);border-radius:999px;background:rgba(185,119,23,.08);color:#9b610f;font-size:11px;font-weight:650}
.sb-memory-toggle{display:flex;align-items:center;gap:9px;padding:0 14px;font-size:13px;color:#4d535b}
.sb-memory-toggle[data-enabled="true"] .sb-memory-toggle-dot{background:#42d98a;box-shadow:0 0 0 4px rgba(66,217,138,.12),0 0 14px rgba(66,217,138,.55)}
.sb-memory-toggle-dot{width:9px;height:9px;border-radius:50%;background:#737981;transition:background .2s ease,box-shadow .2s ease}
.sb-memory-map-viewport{position:absolute;inset:0;overflow:hidden;touch-action:none;cursor:grab}
.sb-memory-map-viewport[data-dragging="true"]{cursor:grabbing}
.sb-memory-map-scene{position:absolute;left:50%;top:50%;width:1120px;height:860px;transform-origin:50% 50%;transition:transform .18s ease;will-change:transform}
.sb-memory-map-scene[data-panning="true"]{transition:none}
.sb-memory-map-links{position:absolute;inset:0;width:100%;height:100%;overflow:visible;pointer-events:none}
.sb-memory-map-link{fill:none;stroke:rgba(99,108,119,.36);stroke-width:1.2;stroke-linecap:round;stroke-dasharray:2 6}
.sb-memory-map-link[data-active="true"]{stroke:#b97717;stroke-width:1.8;stroke-dasharray:none;filter:drop-shadow(0 0 5px rgba(185,119,23,.22))}
.sb-memory-center{position:absolute;left:50%;top:50%;width:164px;height:164px;transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;border:1px solid rgba(185,119,23,.68);border-radius:28px;background:#fff;box-shadow:0 0 0 1px rgba(185,119,23,.08),0 18px 50px rgba(32,40,48,.12);cursor:pointer}
.sb-memory-center:hover{border-color:#b97717;transform:translate(-50%,-50%) scale(1.025)}
.sb-memory-center-avatar{width:70px;height:70px;border-radius:22px;overflow:hidden;background:#f0f2f5;border:1px solid rgba(31,35,41,.12)}
.sb-memory-center-avatar img{width:100%;height:100%;object-fit:cover}
.sb-memory-center-name{font-size:15px;font-weight:650;color:#1f2329}
.sb-memory-center-meta{font-size:11px;color:#777e87}
.sb-memory-node{position:absolute;width:142px;height:98px;transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;border:1px solid rgba(15,15,15,.1);border-radius:23px;background:#fff;color:#34383f;cursor:pointer;box-shadow:0 12px 30px rgba(32,40,48,.08);transition:transform .18s ease,border-color .18s ease,background .18s ease,box-shadow .18s ease}
.sb-memory-node:hover,.sb-memory-node[data-active="true"]{transform:translate(-50%,-50%) scale(1.045);border-color:rgba(15,15,15,.2);background:#fff;box-shadow:0 14px 34px rgba(32,40,48,.14)}
.sb-memory-node[data-active="true"]{border-color:#b97717;box-shadow:0 0 0 1px rgba(185,119,23,.2),0 12px 30px rgba(32,40,48,.12)}
.sb-memory-node-icon{font-size:20px;line-height:1}
.sb-memory-node-label{font-size:14px;font-weight:600}
.sb-memory-node-count{font-size:11px;color:#777e87}
.sb-memory-node[data-tone="blue"] .sb-memory-node-icon{color:#4c86ce}.sb-memory-node[data-tone="violet"] .sb-memory-node-icon{color:#8468c2}.sb-memory-node[data-tone="green"] .sb-memory-node-icon{color:#299b70}.sb-memory-node[data-tone="orange"] .sb-memory-node-icon{color:#b97717}.sb-memory-node[data-tone="pink"] .sb-memory-node-icon{color:#c35b7e}
.sb-memory-entry-node{position:absolute;width:210px;min-height:74px;transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:flex-start;justify-content:center;gap:6px;padding:12px 15px;border:1px solid rgba(15,15,15,.1);border-radius:16px;background:#fff;color:#34383f;cursor:pointer;box-shadow:0 10px 26px rgba(32,40,48,.07);transition:transform .18s ease,border-color .18s ease,box-shadow .18s ease;text-align:left}
.sb-memory-entry-node:hover,.sb-memory-entry-node[data-active="true"]{transform:translate(-50%,-50%) scale(1.035);border-color:#b97717;box-shadow:0 0 0 1px rgba(185,119,23,.16),0 14px 32px rgba(32,40,48,.12)}
.sb-memory-entry-node-text{display:-webkit-box;width:100%;overflow:hidden;color:#34383f;font-size:12px;font-weight:600;line-height:18px;-webkit-box-orient:vertical;-webkit-line-clamp:2}
.sb-memory-entry-node-meta{width:100%;overflow:hidden;color:#8a9199;font-size:10px;line-height:15px;text-overflow:ellipsis;white-space:nowrap}
.sb-memory-entry-overflow{align-items:center;text-align:center;border-style:dashed;color:#777e87;background:rgba(255,255,255,.78)}
.sb-memory-entry-overflow .sb-memory-entry-node-text{display:block;text-align:center;color:#777e87}
.sb-memory-entry-link{stroke:rgba(99,108,119,.24);stroke-width:1;stroke-dasharray:2 7}
.sb-memory-entry-link[data-active="true"]{stroke:#b97717;stroke-width:1.5;stroke-dasharray:none}
.sb-memory-map-hint{position:absolute;left:24px;bottom:22px;z-index:4;font-size:12px;color:#7b838c;pointer-events:none}
.sb-memory-map-controls{position:absolute;left:22px;bottom:20px;z-index:6;display:flex;flex-direction:column;border:1px solid rgba(15,15,15,.1);border-radius:13px;overflow:hidden;background:rgba(255,255,255,.94);box-shadow:0 8px 24px rgba(32,40,48,.08)}
.sb-memory-map-control{width:42px;height:42px;border:0;border-bottom:1px solid rgba(15,15,15,.08);background:transparent;color:#646b73;font:inherit;font-size:21px;cursor:pointer}.sb-memory-map-control:last-child{border-bottom:0}.sb-memory-map-control:hover{background:rgba(15,15,15,.05);color:#1f2329}
.sb-memory-inspector{position:absolute;z-index:9;top:80px;right:22px;bottom:22px;width:min(360px,calc(100% - 44px));display:flex;flex-direction:column;border:1px solid rgba(15,15,15,.1);border-radius:20px;background:rgba(255,255,255,.96);box-shadow:0 22px 70px rgba(32,40,48,.16);backdrop-filter:blur(22px);-webkit-backdrop-filter:blur(22px);transform:translateX(calc(100% + 28px));transition:transform .24s ease;overflow:hidden}
.sb-memory-inspector[data-open="true"]{transform:translateX(0)}
.sb-memory-inspector-head{display:flex;align-items:flex-start;gap:12px;padding:20px 20px 15px;border-bottom:1px solid rgba(15,15,15,.08)}
.sb-memory-inspector-icon{width:38px;height:38px;display:grid;place-items:center;border-radius:12px;background:rgba(185,119,23,.12);color:#a66a12;font-size:19px;flex:none}
.sb-memory-inspector-copy{min-width:0;flex:1}.sb-memory-inspector-title{font-size:16px;font-weight:650;color:#1f2329}.sb-memory-inspector-subtitle{margin-top:4px;font-size:12px;line-height:18px;color:#777e87}
.sb-memory-inspector-close{width:28px;height:28px;border:0;border-radius:8px;background:transparent;color:#777e87;font:inherit;font-size:20px;cursor:pointer}.sb-memory-inspector-close:hover{background:rgba(15,15,15,.06);color:#1f2329}
.sb-memory-inspector-body{flex:1;min-height:0;overflow:auto;padding:14px 20px 20px}.sb-memory-entry{padding:13px 0;border-bottom:1px solid rgba(15,15,15,.08)}.sb-memory-entry:last-child{border-bottom:0}.sb-memory-entry-text{font-size:13px;line-height:20px;color:#34383f}.sb-memory-entry-meta{display:flex;align-items:center;gap:7px;flex-wrap:wrap;margin-top:8px;color:#777e87;font-size:11px}.sb-memory-tag{padding:3px 7px;border-radius:6px;background:rgba(15,15,15,.06);color:#646b73}.sb-memory-entry-action{margin-left:auto;border:0;background:transparent;color:#a66a12;font:inherit;font-size:11px;cursor:pointer}.sb-memory-entry-action:hover{color:#7d4f0e}.sb-memory-empty{padding:30px 0;text-align:center;color:#777e87;font-size:12px;line-height:20px}
.sb-memory-add{display:flex;gap:8px;padding:14px 20px 18px;border-top:1px solid rgba(15,15,15,.08)}.sb-memory-add input{min-width:0;flex:1;height:36px;padding:0 10px;border:1px solid rgba(15,15,15,.12);border-radius:9px;outline:0;background:#fff;color:#1f2329;font:inherit;font-size:12px}.sb-memory-add input:focus{border-color:rgba(185,119,23,.7);box-shadow:0 0 0 3px rgba(185,119,23,.1)}.sb-memory-add button{height:36px;padding:0 12px;border:0;border-radius:9px;background:#b97717;color:#fff;font:inherit;font-size:12px;font-weight:650;cursor:pointer}.sb-memory-add button:hover{background:#9b610f}
@media(max-width:760px){.sb-memory-toolbar{top:14px;left:14px;right:14px}.sb-memory-toggle{padding:0 10px}.sb-memory-toggle-label{display:none}.sb-memory-map-scene{transform:translate(-50%,-50%) scale(.62)}.sb-memory-inspector{top:72px;right:14px;bottom:14px;width:calc(100% - 28px)}.sb-memory-map-hint{left:14px;bottom:18px}.sb-memory-map-controls{left:auto;right:14px;bottom:18px}}
@media(prefers-reduced-motion:reduce){.sb-memory-map-scene,.sb-memory-inspector,.sb-memory-node,.sb-memory-center{transition:none}}
`;

let styleInjected = false;
function ensureStyle() {
  if (styleInjected) return;
  const tag = document.createElement("style");
  tag.textContent = CSS;
  document.head.appendChild(tag);
  styleInjected = true;
}

function readEnabled() {
  try { return window.localStorage.getItem(STORAGE_KEY) !== "false"; } catch { return true; }
}

function writeEnabled(enabled) {
  try { window.localStorage.setItem(STORAGE_KEY, String(enabled)); } catch { /* storage may be unavailable */ }
}

function countByKind(entries) {
  return Object.fromEntries(KIND_DEFINITIONS.map(({ kind }) => [kind, entries.filter((entry) => entry.kind === kind && entry.status !== "rolled-back").length]));
}

function createLink(svg, x1, y1, x2, y2, active = false, className = "sb-memory-map-link") {
  const line = document.createElementNS("http://www.w3.org/2000/svg", "path");
  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;
  line.setAttribute("d", `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`);
  line.setAttribute("class", className);
  line.dataset.active = String(active);
  svg.appendChild(line);
  return line;
}

function fmtTime(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : `${date.getMonth() + 1}/${date.getDate()}`;
}

export function openMemoryPage({ gateway = null, onClose = null } = {}) {
  ensureStyle();
  const page = openPage({ title: "记忆", onClose });
  page.root.classList.add("sb-memory-map-page");
  const root = el("div", "sb-memory-map notranslate");
  root.setAttribute("translate", "no");
  page.body.appendChild(root);

  const toolbar = el("div", "sb-memory-toolbar");
  const left = el("div", "sb-memory-toolbar-left");
  const back = el("button", "sb-memory-icon-button", "‹");
  back.type = "button";
  back.setAttribute("aria-label", "返回");
  back.addEventListener("click", () => page.close());
  const pill = el("div", "sb-memory-pill");
  pill.append(el("span", "sb-memory-pill-icon", "♧"), el("span", "", "主 Agent 记忆"), el("span", "sb-memory-help", "?"));
  left.append(back, pill);
  const right = el("div", "sb-memory-toolbar-right");
  const demoBadge = el("span", "sb-memory-demo-badge", "演示数据");
  demoBadge.hidden = true;
  const toggle = el("button", "sb-memory-toggle");
  toggle.type = "button";
  toggle.append(el("span", "sb-memory-toggle-dot"), el("span", "sb-memory-toggle-label", "记忆已开启"));
  const setEnabled = (enabled) => {
    toggle.dataset.enabled = String(enabled);
    toggle.querySelector(".sb-memory-toggle-label").textContent = enabled ? "记忆已开启" : "记忆已关闭";
    toggle.setAttribute("aria-pressed", String(enabled));
  };
  setEnabled(readEnabled());
  toggle.addEventListener("click", () => { const enabled = toggle.dataset.enabled !== "true"; setEnabled(enabled); writeEnabled(enabled); });
  right.append(demoBadge, toggle);
  toolbar.append(left, right);
  root.appendChild(toolbar);

  const viewport = el("div", "sb-memory-map-viewport");
  const scene = el("div", "sb-memory-map-scene");
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "sb-memory-map-links");
  svg.setAttribute("viewBox", "0 0 1120 860");
  const centerX = 560;
  const centerY = 430;
  const positions = [[560, 135], [270, 310], [850, 310], [315, 590], [805, 590]];
  const entryPositions = Object.freeze({
    userRules: [[380, 55], [740, 55], [560, 45]],
    projectRules: [[125, 220], [125, 410], [125, 315]],
    bestPractices: [[995, 220], [995, 410], [995, 315]],
    feedback: [[190, 735], [445, 735], [315, 795]],
    lessons: [[675, 735], [930, 735], [805, 795]]
  });
  const nodeByKind = new Map();
  const categoryLinks = new Map();
  const center = el("button", "sb-memory-center");
  center.type = "button";
  center.setAttribute("aria-label", "查看主 Agent 记忆概览");
  const centerAvatar = el("span", "sb-memory-center-avatar");
  mountAgentAvatar(centerAvatar, "main", { alt: "幕僚长头像" });
  center.append(centerAvatar, el("span", "sb-memory-center-name", "幕僚长"), el("span", "sb-memory-center-meta", "主 Agent · 记忆中枢"));
  scene.appendChild(svg);
  scene.appendChild(center);
  KIND_DEFINITIONS.forEach((definition, index) => {
    const node = el("button", "sb-memory-node");
    node.type = "button";
    node.dataset.kind = definition.kind;
    node.dataset.tone = definition.tone;
    node.style.left = `${positions[index][0]}px`;
    node.style.top = `${positions[index][1]}px`;
    node.setAttribute("aria-label", `查看${definition.label}`);
    node.append(el("span", "sb-memory-node-icon", definition.icon), el("span", "sb-memory-node-label", definition.label), el("span", "sb-memory-node-count", "0 条"));
    scene.appendChild(node);
    nodeByKind.set(definition.kind, node);
    const [x, y] = positions[index];
    const link = createLink(svg, centerX + (x < centerX ? -80 : x > centerX ? 80 : 0), centerY + (y < centerY ? -80 : 80), x, y, false);
    link.dataset.kind = definition.kind;
    categoryLinks.set(definition.kind, link);
  });
  viewport.appendChild(scene);
  root.appendChild(viewport);

  const controls = el("div", "sb-memory-map-controls");
  const zoomIn = el("button", "sb-memory-map-control", "+");
  const zoomOut = el("button", "sb-memory-map-control", "−");
  const fit = el("button", "sb-memory-map-control", "⌗");
  [zoomIn, zoomOut, fit].forEach((button) => { button.type = "button"; });
  controls.append(zoomIn, zoomOut, fit);
  root.appendChild(controls);
  root.appendChild(el("div", "sb-memory-map-hint", "拖动画布 · 滚轮缩放 · 点击记忆节点查看详情"));

  const inspector = el("aside", "sb-memory-inspector");
  inspector.dataset.open = "false";
  root.appendChild(inspector);
  let entries = [];
  let selectedKind = null;
  let selectedEntryId = null;
  let scale = window.matchMedia?.("(max-width:760px)").matches ? .62 : 1;
  let offsetX = 0;
  let offsetY = 0;
  let dragging = false;
  let dragStart = null;
  let disposed = false;
  let usingDemoEntries = false;
  const entryNodeById = new Map();

  const applyTransform = () => { scene.style.transform = `translate(calc(-50% + ${offsetX}px), calc(-50% + ${offsetY}px)) scale(${scale})`; scene.dataset.panning = String(dragging); };
  const updateCounts = () => {
    const counts = countByKind(entries);
    for (const definition of KIND_DEFINITIONS) nodeByKind.get(definition.kind).querySelector(".sb-memory-node-count").textContent = `${counts[definition.kind] || 0} 条`;
  };
  const updateGraphState = () => {
    for (const [kind, node] of nodeByKind) node.dataset.active = String(kind === selectedKind);
    for (const [kind, link] of categoryLinks) link.dataset.active = String(kind === selectedKind);
    for (const [entryId, node] of entryNodeById) node.dataset.active = String(entryId === selectedEntryId);
    scene.querySelectorAll(".sb-memory-entry-link").forEach((link) => {
      link.dataset.active = String(link.dataset.kind === selectedKind && (!selectedEntryId || link.dataset.entryId === selectedEntryId));
    });
  };
  const closeInspector = () => { selectedKind = null; selectedEntryId = null; inspector.dataset.open = "false"; updateGraphState(); };
  const renderInspector = () => {
    if (!selectedKind) { closeInspector(); return; }
    const definition = KIND_DEFINITIONS.find((item) => item.kind === selectedKind);
    const selected = entries.filter((entry) => entry.kind === selectedKind && entry.status !== "rolled-back");
    inspector.textContent = "";
    const head = el("div", "sb-memory-inspector-head");
    const icon = el("div", "sb-memory-inspector-icon", definition.icon);
    const copy = el("div", "sb-memory-inspector-copy");
    copy.append(el("div", "sb-memory-inspector-title", definition.label), el("div", "sb-memory-inspector-subtitle", definition.copy));
    const close = el("button", "sb-memory-inspector-close", "×");
    close.type = "button";
    close.setAttribute("aria-label", "关闭记忆详情");
    close.addEventListener("click", closeInspector);
    head.append(icon, copy, close);
    const body = el("div", "sb-memory-inspector-body");
    if (!selected.length) body.appendChild(el("div", "sb-memory-empty", "这里还没有记忆。\n在下方添加一条，主 Agent 会在后续任务中参考它。"));
    selected.slice().reverse().forEach((entry) => {
      const item = el("article", "sb-memory-entry");
      item.dataset.selected = String(entry.id === selectedEntryId);
      item.appendChild(el("div", "sb-memory-entry-text", entry.text || ""));
      const meta = el("div", "sb-memory-entry-meta");
      meta.append(el("span", "sb-memory-tag", SCOPE_LABELS[entry.scope] || entry.scope || "主 Agent"), el("span", "", fmtTime(entry.updatedAt || entry.createdAt)));
      if (gateway && entry.history?.length) {
        const rollback = el("button", "sb-memory-entry-action", "回退");
        rollback.type = "button";
        rollback.addEventListener("click", async () => {
          rollback.disabled = true;
          try { await gateway.action("agent.memory.rollback", { agentType: "main", entryId: entry.id }); await loadEntries(); } catch { rollback.disabled = false; }
        });
        meta.appendChild(rollback);
      }
      const remove = el("button", "sb-memory-entry-action", "删除");
      remove.type = "button";
      remove.addEventListener("click", async () => {
        remove.disabled = true;
        try {
          if (gateway && !usingDemoEntries) await gateway.action("agent.memory.delete", { agentType: "main", entryId: entry.id });
          entries = entries.filter((item) => item.id !== entry.id);
          if (usingDemoEntries) {
            updateCounts();
            renderEntryNodes();
            renderInspector();
          } else await loadEntries();
        } catch { remove.disabled = false; }
      });
      meta.appendChild(remove);
      item.appendChild(meta);
      body.appendChild(item);
    });
    const add = el("form", "sb-memory-add");
    const input = document.createElement("input");
    input.placeholder = `添加${definition.label}…`;
    input.setAttribute("aria-label", `添加${definition.label}`);
    const submit = el("button", "", "添加");
    submit.type = "submit";
    add.append(input, submit);
    add.addEventListener("submit", async (event) => {
      event.preventDefault();
      const text = input.value.trim();
      if (!text) return;
      submit.disabled = true;
      try {
        if (gateway && !usingDemoEntries) await gateway.action("agent.memory.append", { agentType: "main", entry: { kind: selectedKind, text, scope: "agent", source: "user" } });
        else entries.push({ id: `local-${Date.now()}`, kind: selectedKind, text, scope: "agent", source: "user", status: "active", version: 1 });
        input.value = "";
        if (usingDemoEntries) {
          updateCounts();
          renderEntryNodes();
          renderInspector();
        } else await loadEntries();
      } finally { submit.disabled = false; }
    });
    inspector.append(head, body, add);
    inspector.dataset.open = "true";
    updateGraphState();
  };
  const selectKind = (kind) => { selectedKind = kind; selectedEntryId = null; renderInspector(); };
  const selectEntry = (entry) => { selectedKind = entry.kind; selectedEntryId = entry.id; renderInspector(); };
  const renderEntryNodes = () => {
    scene.querySelectorAll(".sb-memory-entry-node,.sb-memory-entry-link").forEach((node) => node.remove());
    entryNodeById.clear();
    KIND_DEFINITIONS.forEach((definition, index) => {
      const related = entries.filter((entry) => entry.kind === definition.kind && entry.status !== "rolled-back");
      const slots = entryPositions[definition.kind] || [];
      related.slice(0, 2).forEach((entry, entryIndex) => {
        const [x, y] = slots[entryIndex];
        const node = el("button", "sb-memory-entry-node");
        node.type = "button";
        node.style.left = `${x}px`;
        node.style.top = `${y}px`;
        node.dataset.entryId = entry.id;
        node.dataset.kind = definition.kind;
        node.title = entry.text || definition.label;
        node.setAttribute("aria-label", `查看记忆：${entry.text || definition.label}`);
        node.append(el("span", "sb-memory-entry-node-text", entry.text || "未命名记忆"), el("span", "sb-memory-entry-node-meta", `${SCOPE_LABELS[entry.scope] || entry.scope || "主 Agent"} · ${fmtTime(entry.updatedAt || entry.createdAt)}`));
        node.addEventListener("click", () => selectEntry(entry));
        scene.appendChild(node);
        entryNodeById.set(entry.id, node);
        const [cx, cy] = positions[index];
        const link = createLink(svg, cx + (x < cx ? -62 : x > cx ? 62 : 0), cy + (y < cy ? -45 : 45), x, y, selectedEntryId === entry.id, "sb-memory-map-link sb-memory-entry-link");
        link.dataset.kind = definition.kind;
        link.dataset.entryId = entry.id;
      });
      if (related.length > 2) {
        const [x, y] = slots[2];
        const node = el("button", "sb-memory-entry-node sb-memory-entry-overflow");
        node.type = "button";
        node.style.left = `${x}px`;
        node.style.top = `${y}px`;
        node.setAttribute("aria-label", `查看${definition.label}的全部记忆`);
        node.append(el("span", "sb-memory-entry-node-text", `还有 ${related.length - 2} 条记忆`), el("span", "sb-memory-entry-node-meta", "点击右侧查看全部"));
        node.addEventListener("click", () => selectKind(definition.kind));
        scene.appendChild(node);
        const [cx, cy] = positions[index];
        const link = createLink(svg, cx + (x < cx ? -62 : x > cx ? 62 : 0), cy + (y < cy ? -45 : 45), x, y, selectedKind === definition.kind, "sb-memory-map-link sb-memory-entry-link");
        link.dataset.kind = definition.kind;
      }
    });
    updateGraphState();
  };
  for (const node of nodeByKind.values()) node.addEventListener("click", () => selectKind(node.dataset.kind));
  center.addEventListener("click", () => { selectedKind = null; renderInspector(); });

  async function loadEntries() {
    if (gateway) {
      try {
        const loaded = (await gateway.action("agent.memory.list", { agentType: "main" }))?.data?.entries || [];
        usingDemoEntries = loaded.length === 0;
        entries = usingDemoEntries ? [...DEMO_MEMORY_ENTRIES] : loaded;
      } catch { usingDemoEntries = true; entries = [...DEMO_MEMORY_ENTRIES]; }
    } else {
      usingDemoEntries = true;
      entries = [...DEMO_MEMORY_ENTRIES];
    }
    demoBadge.hidden = !usingDemoEntries;
    updateCounts();
    renderEntryNodes();
    if (selectedKind) renderInspector();
  }
  zoomIn.addEventListener("click", () => { scale = Math.min(1.45, scale + .1); applyTransform(); });
  zoomOut.addEventListener("click", () => { scale = Math.max(.58, scale - .1); applyTransform(); });
  fit.addEventListener("click", () => { scale = 1; offsetX = 0; offsetY = 0; applyTransform(); });
  viewport.addEventListener("pointerdown", (event) => { if (event.target.closest?.("button")) return; dragging = true; dragStart = { x: event.clientX, y: event.clientY, ox: offsetX, oy: offsetY }; viewport.dataset.dragging = "true"; viewport.setPointerCapture?.(event.pointerId); applyTransform(); });
  viewport.addEventListener("pointermove", (event) => { if (!dragging || !dragStart) return; offsetX = dragStart.ox + event.clientX - dragStart.x; offsetY = dragStart.oy + event.clientY - dragStart.y; applyTransform(); });
  const endDrag = (event) => { if (!dragging) return; dragging = false; dragStart = null; viewport.dataset.dragging = "false"; viewport.releasePointerCapture?.(event.pointerId); applyTransform(); };
  viewport.addEventListener("pointerup", endDrag);
  viewport.addEventListener("pointercancel", endDrag);
  viewport.addEventListener("wheel", (event) => { event.preventDefault(); scale = Math.max(.58, Math.min(1.45, scale + (event.deltaY < 0 ? .06 : -.06))); applyTransform(); }, { passive: false });
  applyTransform();
  loadEntries();
  const originalClose = page.close;
  page.close = () => { disposed = true; originalClose(); };
  return page;
}
