/**
 * Grouped sidebar navigation.
 *
 * Native React rows stay in their original parents. SaleBuddy owns only the
 * proxy/group DOM, visual slot attributes, active state, and lifecycle.
 */
import { openRoomsPage } from "./rooms-page.js";
import { openContactsPage } from "./contacts-page.js";
import { openAgentSquarePage } from "./agent-square.js";
import { openKnowledgePage } from "./knowledge-page.js";
import { openMemoryPage } from "./memory-page.js";
import { openFileCenterPage } from "./file-center.js";
import { openResourceCenterPage } from "./resource-center.js";
import { openKanbanPage } from "./kanban.js";
import { getCurrentPage, closeCurrentPage } from "./pages.js";
import { PRODUCT_VISIBILITY } from "./product-visibility.js";
import { mountGroupAvatar } from "./agent-avatar.js";

export const NAV_EVENT = "salebuddy:navigation-state";
export const NAV_SURFACE_COLOR = "#FAFAFA";
export const ACCOUNT_EVENT = "salebuddy:account-action";

export const NAV_LAYOUT = Object.freeze({
  primaryRow: 40,
  iconBox: 20,
  projectRow: 32,
  childIndent: 28
});

export const NAV_MODES = Object.freeze([
  "newTask",
  "office",
  "kanban",
  "skills",
  "contacts",
  "agentSquare",
  "files",
  "resources",
  "kbDocs",
  "kbMemory"
]);

const NAV_MODE_SET = new Set(NAV_MODES);
const KNOWLEDGE_MODES = new Set(["kbDocs", "kbMemory"]);
const NAV_BLUEPRINT = Object.freeze([
  Object.freeze({ id: "work", items: Object.freeze(["office", "contacts", "kanban"]) }),
  Object.freeze({ id: "capabilities", items: Object.freeze(["agentSquare", "skills", "files"]) }),
  Object.freeze({ id: "knowledge", items: Object.freeze(["kbDocs", "kbMemory"]) })
]);
const DEFAULT_KNOWLEDGE_STATE = Object.freeze({ userExpanded: false, activeMode: null });

export function navigationBlueprint() {
  return NAV_BLUEPRINT;
}

export function reduceNavigationState(current, detail) {
  if (!NAV_MODE_SET.has(detail?.mode) || typeof detail.active !== "boolean") return current;
  if (detail.active) return detail.mode;
  return detail.mode === current ? null : current;
}

export function knowledgeExpanded(state = DEFAULT_KNOWLEDGE_STATE) {
  return KNOWLEDGE_MODES.has(state.activeMode) || state.userExpanded === true;
}

export function reduceKnowledgeState(current = DEFAULT_KNOWLEDGE_STATE, action) {
  if (action?.type === "toggle") {
    if (KNOWLEDGE_MODES.has(current.activeMode)) return current;
    return { ...current, userExpanded: !knowledgeExpanded(current) };
  }
  if (action?.type === "activate" && NAV_MODE_SET.has(action.mode)) {
    return { ...current, activeMode: action.mode };
  }
  return current;
}

export function canForwardNative(mode, node) {
  return node?.isConnected === true && (mode !== "kanban" || node.dataset?.sbKanban === "1");
}

const STYLE_ID = "salebuddy-nav-framework-style";
const OWNER_ID = "salebuddy-nav-framework-owner";
const ACTIVE_CLASS = "sb-nav-on";

const CSS = `
/* Geometry is sourced from NAV_LAYOUT so room and navigation owners share one contract. */
[data-sb-nav-root="1"]{background:${NAV_SURFACE_COLOR}!important;border-radius:36px!important;overflow:hidden!important}
[data-sb-nav-root="1"] [class*="_sidebarInner_"]{border-radius:inherit!important;overflow:hidden!important}
[data-sb-nav-root="1"] [data-sb-nav-fixed-top="1"]{display:flex!important;flex-direction:column!important;gap:4px;width:100%!important}
[data-sb-nav-root="1"] [data-sb-nav-slot="newTask"]{order:1;width:calc(100% - 2px)!important;min-height:${NAV_LAYOUT.primaryRow}px!important;box-sizing:border-box!important;display:flex!important;align-items:center!important;justify-content:flex-start!important;gap:10px!important;padding:0 10px!important;text-align:left!important;background:transparent!important;color:#34383f!important;border:0!important;border-radius:9px!important;margin:2px 0!important;box-shadow:none!important;transition:background-color 140ms ease,color 140ms ease!important}
[data-sb-nav-root="1"] [data-sb-nav-slot="newTask"] > :first-child{width:18px!important;height:18px!important;flex:0 0 18px!important;margin:0 1px!important}
[data-sb-nav-root="1"] [data-sb-nav-slot="newTask"]:hover{background:rgba(23,25,29,.045)!important;color:#111318!important}
[data-sb-nav-root="1"] [data-sb-nav-slot="newTask"].sb-nav-on{background:rgba(23,25,29,.075)!important;color:#111318!important;font-weight:550!important}
[data-sb-nav-root="1"] [data-sb-nav-slot="newTask"] [class*="_label_"],[data-sb-nav-root="1"] [data-sb-nav-slot="newTask"] span{color:inherit!important}
[data-sb-nav-root="1"] [data-sb-nav-slot="search"]{order:2}

[data-sb-nav-root="1"] [data-sb-nav-content-root="1"]{display:flex!important;flex-direction:column!important;min-height:100%}
[data-sb-nav-root="1"] [data-sb-nav-conversation-section="1"]{display:contents!important}
[data-sb-nav-root="1"] [data-sb-nav-conversation-section="1"]>[class*="_sectionLabel_"]{display:none!important}
[data-sb-nav-owner="1"],[data-sb-nav-owner="1"] [data-sb-group="work"]{display:contents!important}
[data-sb-nav-owner="1"] [data-sb-nav-slot="work-label"]{order:10}
[data-sb-nav-owner="1"] [data-sb-nav-projects="1"]{order:27;display:none;margin:8px 8px 6px 0;padding-top:8px;border-top:1px solid rgba(23,25,29,.08)}
[data-sb-nav-owner="1"] [data-sb-nav-projects="1"].sb-has-items{display:block}
[data-sb-nav-owner="1"] .sb-nav-project-heading{height:22px;display:flex;align-items:center;justify-content:space-between;padding:0 10px;color:#969BA4;font-size:10px;font-weight:650;letter-spacing:.1em}
[data-sb-nav-owner="1"] .sb-nav-project-count{color:#B0B4BB;font-size:10px;font-weight:500;letter-spacing:0}
[data-sb-nav-owner="1"] .sb-nav-project-list{display:grid;gap:2px}
[data-sb-nav-owner="1"] .sb-nav-project-row{width:100%;min-height:42px;box-sizing:border-box;display:flex;align-items:center;gap:9px;padding:4px 10px;border:0;border-radius:9px;background:transparent;color:#34383F;font:inherit;text-align:left;cursor:pointer;transition:background-color 140ms ease,color 140ms ease}
[data-sb-nav-owner="1"] .sb-nav-project-row:hover{background:rgba(23,25,29,.045)}
[data-sb-nav-owner="1"] .sb-nav-project-row.sb-nav-project-on{background:rgba(23,25,29,.075);color:#111318}
[data-sb-nav-owner="1"] .sb-nav-project-mark{width:52px;height:30px;flex:none;position:relative;display:block;border-radius:15px;background:transparent;overflow:hidden}
[data-sb-nav-owner="1"] .sb-nav-project-mark.sb-nav-project-mark-on{background:transparent}
[data-sb-nav-owner="1"] .sb-nav-project-copy{min-width:0;flex:1;display:flex;flex-direction:column;gap:2px}
[data-sb-nav-owner="1"] .sb-nav-project-name,[data-sb-nav-owner="1"] .sb-nav-project-meta{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
[data-sb-nav-owner="1"] .sb-nav-project-name{font-size:12px;font-weight:600;line-height:15px;color:inherit}
[data-sb-nav-owner="1"] .sb-nav-project-meta{font-size:10px;line-height:13px;color:#9299A2}
[data-sb-nav-owner="1"] .sb-nav-project-state{flex:none;font-size:9px;color:#57A967;white-space:nowrap}
[data-sb-nav-owner="1"] .sb-nav-project-state.sb-nav-project-state-idle{color:#A4A9B1}
[data-sb-nav-root="1"] [data-sb-nav-slot="office"]{order:11}
[data-sb-nav-root="1"] [data-sb-mode="office"]{height:${NAV_LAYOUT.primaryRow}px!important;min-height:${NAV_LAYOUT.primaryRow}px!important;box-sizing:border-box!important}
[data-sb-nav-owner="1"] [data-sb-nav-slot="contacts"]{order:12}
[data-sb-nav-owner="1"] [data-sb-nav-slot="kanban"]{order:13}
[data-sb-nav-owner="1"] [data-sb-nav-slot="history-label"]{order:14}
[data-sb-nav-root="1"] [data-sb-nav-slot="history"]{order:15}
[data-sb-nav-root="1"] [data-sb-nav-plugin-section="1"]{order:19;margin:0!important}
[data-sb-nav-owner="1"] [data-sb-group="capabilities"]{order:20}
[data-sb-nav-root="1"] [data-sb-nav-local-section="1"]{order:25}
[data-sb-nav-owner="1"] [data-sb-group="account"]{order:30!important;margin-top:auto!important;padding-top:12px!important;border-top:1px solid rgba(23,25,29,.08);position:relative}

[data-sb-nav-owner="1"]{font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;color:#24272d}
[data-sb-nav-owner="1"] .sb-nav-group{margin:8px 8px 0 0}
[data-sb-nav-owner="1"] .sb-nav-group-label{height:24px;display:flex;align-items:center;padding:0 10px;font-size:10px;font-weight:650;letter-spacing:.12em;color:#969ba4;text-transform:uppercase;user-select:none}
[data-sb-nav-owner="1"] .sb-nav-row{min-height:${NAV_LAYOUT.primaryRow}px;box-sizing:border-box;display:flex;align-items:center;gap:10px;padding:0 10px;margin:2px 0;border-radius:9px;cursor:pointer;font-size:13px;color:#34383f;transition:background-color 140ms ease,color 140ms ease;outline:none}
[data-sb-nav-owner="1"] .sb-nav-row:hover{background:rgba(23,25,29,.045)}
[data-sb-nav-owner="1"] .sb-nav-row:focus-visible{box-shadow:0 0 0 2px rgba(54,95,220,.28)}
[data-sb-nav-owner="1"] .sb-nav-row.${ACTIVE_CLASS}{background:rgba(23,25,29,.075);color:#111318;font-weight:550}
[data-sb-nav-owner="1"] .sb-nav-row[aria-disabled="true"]{color:#b4b8bf;cursor:not-allowed;background:transparent}
[data-sb-nav-owner="1"] .sb-nav-icon{width:${NAV_LAYOUT.iconBox}px;height:${NAV_LAYOUT.iconBox}px;flex:none;display:grid;place-items:center;color:currentColor}
[data-sb-nav-owner="1"] .sb-nav-icon svg{width:${NAV_LAYOUT.iconBox}px;height:${NAV_LAYOUT.iconBox}px;display:block}
[data-sb-nav-owner="1"] .sb-nav-label{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
[data-sb-nav-owner="1"] .sb-nav-recent-label{height:24px;display:flex;align-items:end;padding:0 10px 4px;margin:2px 8px 0;font-size:10px;letter-spacing:.08em;color:#a4a8af}
[data-sb-nav-owner="1"] .sb-nav-knowledge-toggle{width:100%;border:0;background:transparent;font:inherit;text-align:left}
[data-sb-nav-owner="1"] .sb-nav-knowledge-arrow{font-size:12px;color:#858a93;line-height:1}
[data-sb-nav-owner="1"] .sb-nav-knowledge-children[hidden]{display:none!important}
[data-sb-nav-owner="1"] .sb-nav-knowledge-children .sb-nav-row{padding-left:${NAV_LAYOUT.childIndent}px;min-height:${NAV_LAYOUT.primaryRow}px}
[data-sb-nav-owner="1"] .sb-nav-account{width:100%;min-height:54px;border:0;background:transparent;font:inherit;text-align:left;display:flex;align-items:center;gap:9px;padding:7px 10px;border-radius:9px;color:#34383f;cursor:pointer;transition:background-color 140ms ease}
[data-sb-nav-owner="1"] .sb-nav-account:hover{background:rgba(23,25,29,.045)}
[data-sb-nav-owner="1"] .sb-nav-account:focus-visible{box-shadow:0 0 0 2px rgba(54,95,220,.28);outline:none}
[data-sb-nav-owner="1"] .sb-nav-account-avatar{width:30px;height:30px;flex:none;display:grid;place-items:center;border-radius:50%;background:#c2185b;color:#fff;font-size:14px;font-weight:650;line-height:1}
[data-sb-nav-owner="1"] .sb-nav-account-copy{display:flex;flex:1;min-width:0;flex-direction:column;gap:1px}
[data-sb-nav-owner="1"] .sb-nav-account-name,[data-sb-nav-owner="1"] .sb-nav-account-email{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
[data-sb-nav-owner="1"] .sb-nav-account-name{font-size:13px;font-weight:600;line-height:18px;color:#30343a}
[data-sb-nav-owner="1"] .sb-nav-account-email{font-size:10px;line-height:14px;color:#8d929a}
[data-sb-nav-owner="1"] .sb-nav-account-chevron{flex:none;font-size:12px;line-height:1;color:#858a93}
[data-sb-nav-owner="1"] .sb-nav-account-menu{position:absolute;left:8px;right:8px;bottom:61px;z-index:20;display:flex;flex-direction:column;gap:2px;padding:6px;border:1px solid rgba(255,255,255,.78);border-radius:10px;background:rgba(255,255,255,.82);box-shadow:0 10px 28px rgba(23,25,29,.13);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px)}
[data-sb-nav-owner="1"] .sb-nav-account-menu[hidden]{display:none!important}
[data-sb-nav-owner="1"] .sb-nav-account-action{width:100%;height:32px;border:0;border-radius:7px;background:transparent;padding:0 9px;color:#34383f;font:inherit;font-size:12px;text-align:left;cursor:pointer}
[data-sb-nav-owner="1"] .sb-nav-account-action:hover{background:rgba(23,25,29,.06)}
[data-sb-nav-owner="1"] .sb-nav-account-action[data-sb-account-action="logout"]{color:#b3264b}
@media (prefers-reduced-motion:reduce){[data-sb-nav-owner="1"] .sb-nav-row,[data-sb-nav-root="1"] [data-sb-nav-slot="newTask"]{transition:none}}
`;

const ITEM_DEFINITIONS = Object.freeze({
  kanban: { label: "看板", icon: "board", native: true },
  contacts: { label: "成员", icon: "contacts" },
  skills: { label: "技能广场", icon: "skills", native: true },
  agentSquare: { label: "Agent 广场", icon: "agents" },
  files: { label: "文件中心", icon: "files" },
  resources: { label: "资源中心", icon: "resources" },
  kbDocs: { label: "文档", icon: "docs" },
  kbMemory: { label: "记忆", icon: "memory" }
});

const ICONS = Object.freeze({
  board: '<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><rect x="2" y="3" width="16" height="14" rx="4" fill="currentColor"/><path d="M6.5 7.2h2v5.6h-2zm5 0h2v3.6h-2z" fill="white"/></svg>',
  contacts: '<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><rect x="3" y="2.5" width="14" height="15" rx="4" fill="currentColor"/><circle cx="10" cy="8" r="2.2" fill="white"/><path d="M6.6 14c.7-1.8 1.9-2.7 3.4-2.7s2.7.9 3.4 2.7" stroke="white" stroke-width="1.3" stroke-linecap="round"/></svg>',
  skills: '<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m10 2 2.1 4.3L17 7l-3.5 3.4.8 4.8-4.3-2.3-4.3 2.3.8-4.8L3 7l4.9-.7z" fill="currentColor"/><circle cx="10" cy="9" r="1.6" fill="white"/></svg>',
  agents: '<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M3 7.5h14V16a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" fill="currentColor"/><path d="M4 3h12l2 4H2z" fill="currentColor"/><rect x="8.3" y="11" width="3.4" height="7" rx="1" fill="white"/></svg>',
  files: '<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M2.5 5A2.5 2.5 0 0 1 5 2.5h3l2 2H15A2.5 2.5 0 0 1 17.5 7v7.5A2.5 2.5 0 0 1 15 17H5a2.5 2.5 0 0 1-2.5-2.5z" fill="currentColor"/></svg>',
  resources: '<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M3 5.5A2.5 2.5 0 0 1 5.5 3h9A2.5 2.5 0 0 1 17 5.5v9a2.5 2.5 0 0 1-2.5 2.5h-9A2.5 2.5 0 0 1 3 14.5z" fill="currentColor"/><path d="M6.5 13.5h7M6.5 10h7M6.5 6.5h3" stroke="white" stroke-width="1.3" stroke-linecap="round"/></svg>',
  docs: '<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M4 2h8l4 4v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1" fill="currentColor"/><path d="M6.5 9h7m-7 3h7m-7 3h4" stroke="white" stroke-width="1.2" stroke-linecap="round"/></svg>',
  memory: '<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M10 2a6 6 0 0 1 4.2 10.3c-.8.8-1.2 1.6-1.2 2.7H7c0-1.1-.4-1.9-1.2-2.7A6 6 0 0 1 10 2" fill="currentColor"/><path d="M8 18h4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M8 8.5h4" stroke="white" stroke-width="1.3" stroke-linecap="round"/></svg>'
});

let activeInstance = null;
const mountedNavigationDocuments = new WeakSet();

export function isNavigationRuntimeMounted(mountedDocument = globalThis.document) {
  return Boolean(mountedDocument && mountedNavigationDocuments.has(mountedDocument));
}

function normalizedText(node) {
  return (node?.textContent || "").replace(/\s+/g, "").trim();
}

function isActiveClassToken(name) {
  return /(?:^|[_-])(?:selfActive|active)(?:$|[_-])/i.test(name || "");
}

function stripActiveClasses(className) {
  return (className || "").split(/\s+/).filter((name) => name && !isActiveClassToken(name)).join(" ");
}

function findRows(section) {
  if (!section) return [];
  const candidates = section.querySelectorAll('[dt-eid="sidebar_tab"], [data-dt-eid="sidebar_tab"], [class*="_menuItem_"]');
  return [...new Set([...candidates]
    .filter((candidate) => !candidate.closest?.("[data-sb-nav-owner]"))
    .map((candidate) => (
      candidate.closest?.('[dt-eid="sidebar_tab"], [data-dt-eid="sidebar_tab"]') || candidate
    )))];
}

function findRowByLabels(section, labels) {
  return findRows(section).find((row) => labels.has(normalizedText(row))) || null;
}

function findConversationSection(root) {
  return root?.querySelector('div[class*="_conversationSection_"], section[class*="_conversationSection_"], [class*="_conversationSection_"]') || null;
}

function findPluginSection(root) {
  return root?.querySelector('[class*="_pluginSection_"]') || null;
}

function findNewTask(root) {
  return root?.querySelector('[dt-eid="sidebar_new_chat_btn"], [data-dt-eid="sidebar_new_chat_btn"], [class*="_newChatRow_"]') || null;
}

function findSearch(root, fixedTop) {
  if (!root?.contains(fixedTop)) return null;
  const direct = fixedTop?.querySelector('[class*="_searchRow_"]');
  if (direct) return direct;
  return findRowByLabels(fixedTop, new Set(["搜索"])) || null;
}

function findOffice(root) {
  return findRowByLabels(findConversationSection(root), new Set(["办公室"]));
}

function findNativeTarget(root, mode) {
  if (mode === "newTask") return findNewTask(root);
  if (mode === "office") return findOffice(root);
  if (mode === "kanban") return findRowByLabels(findPluginSection(root), new Set(["自动任务", "看板"]));
  if (mode === "skills") return findRowByLabels(findPluginSection(root), new Set(["技能广场"]));
  return null;
}

function findHistoryList(root) {
  const section = findConversationSection(root);
  return section?.querySelector('[class*="_listArea_"], [class*="_conversationList_"], [data-sb-history]') || null;
}

export function locateSidebar(mountedDocument) {
  const newTasks = mountedDocument.querySelectorAll('[dt-eid="sidebar_new_chat_btn"], [data-dt-eid="sidebar_new_chat_btn"], [class*="_newChatRow_"]');
  for (const newTask of newTasks) {
    const root = newTask.closest?.('[class*="_sidebar_"]');
    const fixedTop = newTask.closest?.('[class*="_fixedTop_"]');
    if (!root || !fixedTop || !root.contains(fixedTop)) continue;
    for (const scroll of root.querySelectorAll('[class*="_scrollArea_"]')) {
      const plugin = findPluginSection(scroll);
      const localData = scroll.querySelector('[class*="_localDataSection_"]');
      const conversation = findConversationSection(scroll);
      const contentRoot = plugin?.parentElement;
      if (!contentRoot || !localData || !conversation) continue;
      if (localData.parentElement !== contentRoot || conversation.parentElement !== contentRoot) continue;
      if (!scroll.contains(contentRoot)) continue;
      return { root, fixedTop, scroll, contentRoot, plugin, localData, conversation, newTask };
    }
  }
  return null;
}

function hasNativeActiveState(row) {
  if (!row?.isConnected) return false;
  const reactClassIsActive = [...row.classList].some((name) => name !== ACTIVE_CLASS && isActiveClassToken(name));
  if (reactClassIsActive) return true;
  return row.dataset.sbNavActiveOwned !== "1" && row.getAttribute("aria-current") === "page";
}

function defaultOpeners() {
  return {
    rooms: (options) => openRoomsPage(options),
    contacts: (options) => openContactsPage(options),
    kanban: (options) => openKanbanPage(options),
    agentSquare: (options) => openAgentSquarePage(options),
    knowledge: (kind, options) => openKnowledgePage(kind, options),
    memory: (options) => openMemoryPage(options),
    files: (options) => openFileCenterPage(options),
    resources: (options) => openResourceCenterPage(options)
  };
}

/** Mount one document-level navigation owner. */
export function mountNavFramework({ gateway, teamLive, openers: openerOverrides } = {}) {
  const mountedDocument = globalThis.document;
  const mountedWindow = globalThis.window;
  const MutationObserverClass = globalThis.MutationObserver;
  if (activeInstance?.document === mountedDocument && !activeInstance.disposed) return activeInstance.api;
  if (activeInstance && !activeInstance.disposed) activeInstance.api.unmount();
  mountedNavigationDocuments.add(mountedDocument);

  const openers = { ...defaultOpeners(), ...openerOverrides };
  let disposed = false;
  let owner = null;
  let location = null;
  let activeMode = null;
  let lastNativeActive = null;
  let pageRoute = null;
  let knowledgeState = { ...DEFAULT_KNOWLEDGE_STATE };
  let knowledgeToggle = null;
  let knowledgeArrow = null;
  let knowledgeChildren = null;
  let accountSection = null;
  let accountToggle = null;
  let accountMenu = null;
  let accountName = null;
  let accountEmail = null;
  let accountSignedIn = true;
  let projectSection = null;
  let projectLabel = null;
  let projectCount = null;
  let projectList = null;
  let projectRooms = [];
  let projectActiveId = null;
  let projectRefreshTimer = null;
  let projectRefreshRevision = 0;
  let observer = null;
  const proxyRows = new Map();
  const hiddenNative = new Map();
  const trackedNativeAttributes = new Map();
  const trackedNativeStyles = new Map();

  let styleTag = mountedDocument.querySelector(`#${STYLE_ID}`);
  if (!styleTag) {
    styleTag = mountedDocument.createElement("style");
    styleTag.id = STYLE_ID;
    styleTag.textContent = CSS;
    mountedDocument.head.appendChild(styleTag);
  }

  function createElement(tag, className, text) {
    const element = mountedDocument.createElement(tag);
    if (className) element.className = className;
    if (text != null) element.textContent = text;
    return element;
  }

  function currentTarget(mode) {
    return findNativeTarget(location?.root, mode);
  }

  function emit(mode, active) {
    mountedDocument.dispatchEvent(new mountedWindow.CustomEvent(NAV_EVENT, { detail: { mode, active } }));
  }

  function clearActive() {
    if (activeMode) emit(activeMode, false);
  }

  function snapshotAttribute(node, name) {
    if (!node) return;
    let originals = trackedNativeAttributes.get(node);
    if (!originals) {
      originals = new Map();
      trackedNativeAttributes.set(node, originals);
    }
    if (!originals.has(name)) originals.set(name, node.getAttribute(name));
  }

  function trackAttribute(node, name, value) {
    if (!node) return;
    snapshotAttribute(node, name);
    if (value == null) node.removeAttribute(name);
    else node.setAttribute(name, value);
  }

  function setVisualSlot(node, slot, order) {
    if (!node) return;
    trackAttribute(node, "data-sb-nav-slot", slot);
    trackStyle(node, "order", String(order));
  }

  function trackStyle(node, property, value) {
    if (!node) return;
    let originals = trackedNativeStyles.get(node);
    if (!originals) {
      originals = new Map();
      trackedNativeStyles.set(node, originals);
    }
    if (!originals.has(property)) originals.set(property, node.style[property]);
    if (value == null) delete node.style[property];
    else node.style[property] = value;
  }

  function hideNativeRow(row) {
    if (!row || hiddenNative.has(row)) return;
    hiddenNative.set(row, {
      display: row.style.display,
      ariaHidden: row.getAttribute("aria-hidden")
    });
    row.style.display = "none";
    row.setAttribute("aria-hidden", "true");
  }

  function restoreHiddenRow(row) {
    const original = hiddenNative.get(row);
    if (!original) return;
    if (original.display == null) delete row.style.display;
    else row.style.display = original.display;
    if (original.ariaHidden == null) row.removeAttribute("aria-hidden");
    else row.setAttribute("aria-hidden", original.ariaHidden);
    hiddenNative.delete(row);
  }

  function restoreNativeRows() {
    for (const row of [...hiddenNative.keys()]) restoreHiddenRow(row);
  }

  function restoreTrackedNode(node) {
    const attributes = trackedNativeAttributes.get(node);
    if (attributes) {
      for (const [name, value] of attributes) {
        if (value == null) node.removeAttribute(name);
        else node.setAttribute(name, value);
      }
      trackedNativeAttributes.delete(node);
    }
    node.classList.remove(ACTIVE_CLASS);
    const styles = trackedNativeStyles.get(node);
    if (styles) {
      for (const [property, value] of styles) {
        if (value == null) delete node.style[property];
        else node.style[property] = value;
      }
      trackedNativeStyles.delete(node);
    }
  }

  function restoreNativeAttributes() {
    const nodes = new Set([...trackedNativeAttributes.keys(), ...trackedNativeStyles.keys()]);
    for (const node of nodes) restoreTrackedNode(node);
  }

  function releaseStaleOwnership(nextRoot) {
    for (const row of [...hiddenNative.keys()]) {
      if (!row.isConnected || !nextRoot?.contains(row)) restoreHiddenRow(row);
    }
    const nodes = new Set([...trackedNativeAttributes.keys(), ...trackedNativeStyles.keys()]);
    for (const node of nodes) {
      if (!node.isConnected || !nextRoot?.contains(node)) restoreTrackedNode(node);
    }
  }

  function icon(name) {
    const wrap = createElement("span", "sb-nav-icon");
    wrap.innerHTML = ICONS[name] || "";
    return wrap;
  }

  /**
   * Claim the single custom page route before opening a new page.
   * openPage() closes the previous page synchronously; the previous page's
   * onClose must not clear state belonging to the new route.
   */
  function claimPageRoute(mode, cleanup = null) {
    if (pageRoute) {
      pageRoute.replaced = true;
      const previousCleanup = pageRoute.cleanup;
      pageRoute = null;
      previousCleanup?.();
    }
    const route = { mode, cleanup, replaced: false };
    pageRoute = route;
    return () => {
      if (route.replaced || pageRoute !== route) return;
      route.replaced = true;
      pageRoute = null;
      route.cleanup?.();
      if (mode && activeMode === mode) emit(mode, false);
    };
  }

  function openChildFromContacts(mode, opener, options = {}) {
    const onClose = claimPageRoute(mode);
    emit("contacts", false);
    emit(mode, true);
    opener({
      ...options,
      onClose
    });
  }

  function openRoomsFromContacts(room) {
    const onClose = claimPageRoute(null);
    clearActive();
    openers.rooms({ gateway, teamLive, initialRoom: room, onClose });
  }

  function openCustom(mode) {
    if (activeMode === mode && getCurrentPage()) return;
    const onClose = claimPageRoute(mode);
    emit(mode, true);
    if (mode === "contacts") {
      openers.contacts({
        gateway,
        teamLive,
        onOpenRoom: (room) => openRoomsFromContacts(room),
        onOpenData: (room) => openChildFromContacts("kanban", openers.kanban, {
          gateway,
          teamLive,
          initialRoom: room
        }),
        onOpenFiles: (room) => openChildFromContacts("files", openers.files, {
          projectId: room?.id || null,
          projectName: room?.name || ""
        }),
        onRecruit: () => {
          const recruitClose = claimPageRoute("agentSquare");
          emit("agentSquare", true);
          openers.agentSquare({ teamLive, onChat: (agentType) => openChatWith(agentType), onClose: recruitClose });
        },
        onClose
      });
    } else if (mode === "agentSquare") {
      openers.agentSquare({ teamLive, onChat: (agentType) => openChatWith(agentType), onClose });
    } else if (mode === "files") {
      openers.files({ onClose });
    } else if (mode === "resources") {
      openers.resources({ onClose });
    } else if (mode === "kbMemory") {
      openers.memory({ gateway, onClose });
    } else if (mode === "kbDocs") {
      openers.knowledge(mode === "kbDocs" ? "docs" : "memory", { gateway, teamLive, onClose });
    }
  }

  function forwardNative(mode, proxy) {
    const target = currentTarget(mode);
    const ready = canForwardNative(mode, target);
    proxy.setAttribute("aria-disabled", ready ? "false" : "true");
    if (!ready) return;
    target.click();
  }

  function buildRow(mode, sourceClass = "") {
    const definition = ITEM_DEFINITIONS[mode];
    const row = createElement("div", `${stripActiveClasses(sourceClass)} sb-nav-row`.trim());
    row.dataset.sbMode = mode;
    row.setAttribute("role", "button");
    row.setAttribute("tabindex", "0");
    row.append(icon(definition.icon), createElement("span", "sb-nav-label", definition.label));
    const activate = (event) => {
      event.preventDefault?.();
      event.stopPropagation?.();
      if (definition.native) forwardNative(mode, row);
      else openCustom(mode);
    };
    row.addEventListener("click", activate);
    row.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") activate(event);
    });
    proxyRows.set(mode, row);
    return row;
  }

  function group(id, label) {
    const section = createElement("section", "sb-nav-group");
    section.dataset.sbGroup = id;
    if (label) section.appendChild(createElement("div", "sb-nav-group-label", label));
    return section;
  }

  function projectMemberCount(room) {
    const count = Array.isArray(room?.members) ? room.members.filter(Boolean).length : 0;
    return `${count || 1} 位成员`;
  }

  function renderProjectGroups() {
    if (!projectSection || !projectLabel || !projectCount || !projectList) return;
    const hasRooms = projectRooms.length > 0;
    projectSection.classList.toggle("sb-has-items", hasRooms);
    projectSection.hidden = !hasRooms;
    projectLabel.textContent = "项目组";
    projectCount.textContent = hasRooms ? String(projectRooms.length) : "";
    projectList.textContent = "";
    for (const room of projectRooms) {
      const row = createElement("button", `sb-nav-project-row${room.id === projectActiveId ? " sb-nav-project-on" : ""}`);
      row.type = "button";
      row.dataset.sbProjectId = room.id;
      const latest = room.lastMessage ? String(room.lastMessage).replace(/^([^：:]{1,16})[：:]/u, "") : "等待首条任务消息";
      row.title = [room.name || "项目组", room.goal || "", latest ? `最新：${latest}` : ""].filter(Boolean).join(" · ");
      const active = room.status === "active";
      const mark = createElement("span", `sb-nav-project-mark${active ? " sb-nav-project-mark-on" : ""}`);
      mountGroupAvatar(mark, [...new Set([room.owner, ...(room.members || [])].filter(Boolean))], { alt: `${room.name || "项目组"}成员头像`, layout: "horizontal", background: "transparent" });
      const copy = createElement("span", "sb-nav-project-copy");
      const name = createElement("span", "sb-nav-project-name", room.name || "未命名项目组");
      const taskSummary = room.goal || latest;
      const meta = createElement("span", "sb-nav-project-meta", `${projectMemberCount(room)} · ${taskSummary}`);
      copy.append(name, meta);
      const state = createElement("span", `sb-nav-project-state${active ? "" : " sb-nav-project-state-idle"}`, active ? "进行中" : "已完成");
      row.append(mark, copy, state);
      row.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const onClose = claimPageRoute("contacts");
        projectActiveId = room.id;
        renderProjectGroups();
        if (disposed) return;
        clearActive();
        emit("contacts", true);
        openers.contacts({
          gateway,
          teamLive,
          initialRoom: room,
          onOpenRoom: (nextRoom) => openRoomsFromContacts(nextRoom),
          onOpenData: (nextRoom) => openChildFromContacts("kanban", openers.kanban, {
            gateway,
            teamLive,
            initialRoom: nextRoom
          }),
          onOpenFiles: (nextRoom) => openChildFromContacts("files", openers.files, {
            projectId: nextRoom?.id || null,
            projectName: nextRoom?.name || ""
          }),
          onRecruit: () => {
            const recruitClose = claimPageRoute("agentSquare");
            emit("agentSquare", true);
            openers.agentSquare({ teamLive, onChat: (agentType) => openChatWith(agentType), onClose: recruitClose });
          },
          onClose
        });
        // Keep the office's current-room state in sync without delaying the UI transition.
        Promise.resolve(gateway?.action?.("room.office.switch", { roomId: room.id })).catch(() => {});
      });
      projectList.appendChild(row);
    }
  }

  async function refreshProjectGroups() {
    if (disposed || !gateway?.action || !projectSection) return;
    const revision = ++projectRefreshRevision;
    try {
      const [result, current] = await Promise.all([
        gateway.action("room.action.list"),
        gateway.action("room.office.current").catch(() => null)
      ]);
      if (disposed || revision !== projectRefreshRevision || !projectSection?.isConnected) return;
      projectRooms = Array.isArray(result?.data?.rooms) ? result.data.rooms : [];
      if (projectActiveId && !projectRooms.some((room) => room.id === projectActiveId)) projectActiveId = null;
      if (!projectActiveId) projectActiveId = current?.data?.roomId || null;
      renderProjectGroups();
    } catch {
      // A disconnected gateway leaves the last known project groups visible.
    }
  }

  function emitAccountAction(action) {
    mountedDocument.dispatchEvent(new mountedWindow.CustomEvent(ACCOUNT_EVENT, {
      detail: { action, signedIn: accountSignedIn }
    }));
    const nativeProfile = mountedDocument.querySelector('[dt-eid="sidebar_user_profile_open"], [data-dt-eid="sidebar_user_profile_open"]');
    if (nativeProfile && action === "settings") nativeProfile.click();
    try {
      if (action === "logout") mountedWindow.marvis?.logout?.();
      if (action === "login") mountedWindow.marvis?.login?.();
    } catch {
      // Native auth bridge is optional in the browser preview.
    }
  }

  function renderAccount() {
    if (!accountToggle?.isConnected) return;
    const signedIn = accountSignedIn;
    accountName.textContent = signedIn ? "HongYang Li" : "登录账户";
    accountEmail.textContent = signedIn ? "lihongyangnju@gmail.com" : "点击登录继续";
    accountToggle.querySelector(".sb-nav-account-avatar").textContent = signedIn ? "H" : "↗";
    accountToggle.setAttribute("aria-label", signedIn ? "账户 HongYang Li" : "登录账户");
    accountToggle.setAttribute("aria-expanded", String(!accountMenu.hidden));
    const action = accountMenu.querySelector('[data-sb-account-action="logout"], [data-sb-account-action="login"]');
    if (action) {
      action.dataset.sbAccountAction = signedIn ? "logout" : "login";
      action.textContent = signedIn ? "退出登录" : "登录";
    }
  }

  function closeAccountMenu() {
    if (!accountMenu) return;
    accountMenu.hidden = true;
    renderAccount();
  }

  function buildOwner(contentRoot) {
    const menuClass = findOffice(location?.root)?.className || "";
    owner = createElement("div");
    owner.id = OWNER_ID;
    owner.dataset.sbNavOwner = "1";
    owner.style.display = "contents";

    const work = group("work");
    work.style.display = "contents";
    const workLabel = createElement("div", "sb-nav-group-label", "工作");
    workLabel.dataset.sbNavSlot = "work-label";
    workLabel.style.order = "10";
    work.append(workLabel, buildRow("contacts", menuClass), buildRow("kanban", menuClass));
    proxyRows.get("contacts").dataset.sbNavSlot = "contacts";
    proxyRows.get("contacts").style.order = "12";
    proxyRows.get("kanban").dataset.sbNavSlot = "kanban";
    proxyRows.get("kanban").style.order = "13";
    const recentLabel = createElement("div", "sb-nav-recent-label", "最近任务");
    recentLabel.dataset.sbNavSlot = "history-label";
    recentLabel.style.order = "14";
    work.appendChild(recentLabel);

    const capabilities = group("capabilities", "能力与资产");
    capabilities.dataset.sbNavSlot = "capabilities";
    capabilities.style.order = "20";
    for (const mode of ["agentSquare", "skills", "files", "kbMemory"]) capabilities.appendChild(buildRow(mode, menuClass));

    projectSection = createElement("div", "sb-nav-projects");
    projectSection.dataset.sbNavProjects = "1";
    projectSection.style.order = "27";
    projectLabel = createElement("span", "sb-nav-project-label", "项目组");
    projectCount = createElement("span", "sb-nav-project-count");
    const projectHeading = createElement("div", "sb-nav-project-heading");
    projectHeading.append(projectLabel, projectCount);
    projectList = createElement("div", "sb-nav-project-list");
    projectSection.append(projectHeading, projectList);

    accountSection = group("account");
    accountSection.dataset.sbNavSlot = "account";
    accountSection.style.order = "30";
    accountToggle = createElement("button", "sb-nav-account");
    accountToggle.type = "button";
    accountToggle.dataset.sbAccountToggle = "1";
    accountToggle.appendChild(createElement("span", "sb-nav-account-avatar", "H"));
    const accountCopy = createElement("span", "sb-nav-account-copy");
    accountName = createElement("span", "sb-nav-account-name", "HongYang Li");
    accountEmail = createElement("span", "sb-nav-account-email", "lihongyangnju@gmail.com");
    accountCopy.append(accountName, accountEmail);
    accountToggle.append(accountCopy, createElement("span", "sb-nav-account-chevron", "▸"));
    accountMenu = createElement("div", "sb-nav-account-menu");
    accountMenu.hidden = true;
    accountMenu.dataset.sbAccountMenu = "1";
    const settingsAction = createElement("button", "sb-nav-account-action", "账户设置");
    settingsAction.type = "button";
    settingsAction.dataset.sbAccountAction = "settings";
    const authAction = createElement("button", "sb-nav-account-action", "退出登录");
    authAction.type = "button";
    authAction.dataset.sbAccountAction = "logout";
    accountMenu.append(settingsAction, authAction);
    accountToggle.addEventListener("click", (event) => {
      event.stopPropagation();
      accountMenu.hidden = !accountMenu.hidden;
      renderAccount();
    });
    accountMenu.addEventListener("click", (event) => {
      const action = event.target.closest?.("[data-sb-account-action]")?.dataset.sbAccountAction;
      if (!action) return;
      event.stopPropagation();
      if (action === "logout") accountSignedIn = false;
      if (action === "login") accountSignedIn = true;
      closeAccountMenu();
      emitAccountAction(action);
    });
    accountSection.append(accountToggle, accountMenu);

    owner.append(work, capabilities, projectSection, accountSection);
    renderAccount();
    contentRoot.appendChild(owner);
    renderProjectGroups();
    refreshProjectGroups();
  }

  function renderKnowledge() {
    if (!knowledgeToggle?.isConnected) return;
    const expanded = knowledgeExpanded(knowledgeState);
    if (knowledgeToggle.getAttribute("aria-expanded") !== String(expanded)) knowledgeToggle.setAttribute("aria-expanded", String(expanded));
    const arrow = expanded ? "▾" : "▸";
    if (knowledgeArrow.textContent !== arrow) knowledgeArrow.textContent = arrow;
    if (knowledgeChildren.hidden !== !expanded) knowledgeChildren.hidden = !expanded;
  }

  function renderActive() {
    observer?.disconnect();
    const root = location?.root;
    const rows = root ? root.querySelectorAll("[data-sb-mode]") : [];
    for (const row of rows) {
      const selected = row.dataset.sbMode === activeMode;
      row.classList.toggle(ACTIVE_CLASS, selected);
      if (selected) {
        if (trackedNativeAttributes.has(row)) trackAttribute(row, "aria-current", "page");
        else row.setAttribute("aria-current", "page");
        if (trackedNativeAttributes.has(row)) trackAttribute(row, "data-sb-nav-active-owned", "1");
        else row.dataset.sbNavActiveOwned = "1";
      } else {
        if (trackedNativeAttributes.has(row)) trackAttribute(row, "aria-current", null);
        else row.removeAttribute("aria-current");
        if (trackedNativeAttributes.has(row)) trackAttribute(row, "data-sb-nav-active-owned", null);
        else delete row.dataset.sbNavActiveOwned;
      }
    }
    if (root) {
      for (const row of root.querySelectorAll('[aria-current="page"]')) {
        if (row.dataset.sbMode !== activeMode) {
          if (owner?.contains(row)) row.removeAttribute("aria-current");
          else trackAttribute(row, "aria-current", null);
          if (owner?.contains(row)) delete row.dataset.sbNavActiveOwned;
          else trackAttribute(row, "data-sb-nav-active-owned", null);
        }
      }
    }
    renderKnowledge();
    if (!disposed) observeSidebar();
  }

  function observeSidebar() {
    observer?.observe(mountedDocument.body, {
      childList: true,
      subtree: true
    });
    if (!location?.root?.isConnected) return;
    observer?.observe(location.root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "aria-current", "data-sb-kanban"]
    });
  }

  function updateAvailability() {
    for (const mode of ["kanban", "skills"]) {
      const row = proxyRows.get(mode);
      if (!row?.isConnected) continue;
      row.setAttribute("aria-disabled", String(!canForwardNative(mode, currentTarget(mode))));
    }
  }

  function markNativeSlots() {
    const { root, fixedTop, contentRoot, plugin, localData, conversation, newTask } = location;
    const search = findSearch(root, fixedTop);
    const office = findOffice(root);
    const history = findHistoryList(root);
    for (const row of new Set([newTask, ...findRows(root)])) snapshotAttribute(row, "aria-current");
    trackAttribute(root, "data-sb-nav-root", "1");
    trackAttribute(fixedTop, "data-sb-nav-fixed-top", "1");
    trackAttribute(contentRoot, "data-sb-nav-content-root", "1");
    trackAttribute(plugin, "data-sb-nav-plugin-section", "1");
    trackAttribute(localData, "data-sb-nav-local-section", "1");
    trackAttribute(conversation, "data-sb-nav-conversation-section", "1");
    if (newTask) {
      trackAttribute(newTask, "data-sb-mode", "newTask");
      setVisualSlot(newTask, "newTask", 1);
    }
    if (search) setVisualSlot(search, "search", 2);
    if (office) {
      trackAttribute(office, "data-sb-mode", "office");
      setVisualSlot(office.parentElement || office, "office", 11);
      if (PRODUCT_VISIBILITY.office) restoreHiddenRow(office);
      else hideNativeRow(office);
    }
    const recentLabel = owner?.querySelector('[data-sb-nav-slot="history-label"]');
    const hasHistory = Boolean(history && normalizedText(history));
    if (recentLabel) {
      recentLabel.hidden = !hasHistory;
      recentLabel.style.display = hasHistory ? "" : "none";
    }
    if (history) {
      setVisualSlot(history, "history", 15);
      trackAttribute(history, "hidden", hasHistory ? null : "");
    }
    trackStyle(plugin, "order", "19");
    trackStyle(localData, "order", "25");
    trackAttribute(localData, "hidden", "");
    trackAttribute(localData, "aria-hidden", "true");
    trackStyle(localData, "display", "none");
    trackStyle(conversation, "display", "contents");
  }

  function hideDuplicatePluginRows() {
    hideNativeRow(currentTarget("kanban"));
    hideNativeRow(currentTarget("skills"));
  }

  function repairCurrent() {
    if (disposed || !location?.root?.isConnected) return;
    const { contentRoot } = location;
    releaseStaleOwnership(location.root);
    trackStyle(contentRoot, "display", "flex");
    trackStyle(contentRoot, "flexDirection", "column");
    trackStyle(contentRoot, "minHeight", "100%");
    if (!owner?.isConnected || owner.parentElement !== contentRoot) {
      owner?.remove();
      proxyRows.clear();
      knowledgeToggle = null;
      knowledgeArrow = null;
      knowledgeChildren = null;
      accountSection = null;
      accountToggle = null;
      accountMenu = null;
      accountName = null;
      accountEmail = null;
      projectSection = null;
      projectLabel = null;
      projectCount = null;
      projectList = null;
      buildOwner(contentRoot);
    }
    markNativeSlots();
    hideDuplicatePluginRows();
    updateAvailability();
    renderKnowledge();
  }

  function relocateSidebar() {
    if (disposed) return false;
    const next = locateSidebar(mountedDocument);
    if (next?.root === location?.root && next?.contentRoot === location?.contentRoot) return false;
    owner?.remove();
    owner = null;
    proxyRows.clear();
    knowledgeToggle = null;
    knowledgeArrow = null;
    knowledgeChildren = null;
    accountSection = null;
    accountToggle = null;
    accountMenu = null;
    accountName = null;
    accountEmail = null;
    releaseStaleOwnership(next?.root || null);
    location = next;
    lastNativeActive = null;
    if (location) repairCurrent();
    return true;
  }

  function syncNativeActive() {
    // Native React rows can retain an active class while a SaleBuddy page is
    // open. They are hidden/owned by the framework and must not steal the
    // active route back from the custom page on the next mutation.
    if (activeMode && !["newTask", "office", "skills"].includes(activeMode)) {
      return;
    }
    const candidates = ["newTask", "office", "skills"];
    const next = candidates.find((mode) => hasNativeActiveState(currentTarget(mode))) || null;
    if (next === lastNativeActive) return;
    const previous = lastNativeActive;
    lastNativeActive = next;
    if (next) emit(next, true);
    else if (previous) emit(previous, false);
  }

  function onNavigation(event) {
    const next = reduceNavigationState(activeMode, event.detail);
    if (next === activeMode && !NAV_MODE_SET.has(event.detail?.mode)) return;
    activeMode = next;
    knowledgeState = activeMode
      ? reduceKnowledgeState(knowledgeState, { type: "activate", mode: activeMode })
      : { ...knowledgeState, activeMode: null };
    renderActive();
  }

  function onDocumentClick(event) {
    if (accountMenu && !accountMenu.hidden && !accountSection?.contains(event.target)) closeAccountMenu();
    if (owner?.contains(event.target)) return;
    const nativeMode = ["newTask", "office", "kanban", "skills"].find((mode) => currentTarget(mode)?.contains(event.target));
    if (nativeMode) {
      if (nativeMode !== "kanban" || canForwardNative("kanban", currentTarget("kanban"))) {
        lastNativeActive = nativeMode;
        emit(nativeMode, true);
      }
      return;
    }
    const search = findSearch(location?.root, location?.fixedTop);
    const history = findHistoryList(location?.root);
    if (search?.contains(event.target) || history?.contains(event.target)) clearActive();
  }

  function onPopState() {
    clearActive();
  }

  function openChatWith(agentType) {
    const onClose = claimPageRoute("contacts");
    openers.contacts({
      gateway,
      teamLive,
      initialFriend: agentType,
      onOpenRoom: (room) => openRoomsFromContacts(room),
      onOpenData: (room) => openChildFromContacts("kanban", openers.kanban, {
        gateway,
        teamLive,
        initialRoom: room
      }),
      onOpenFiles: (room) => openChildFromContacts("files", openers.files, {
        projectId: room?.id || null,
        projectName: room?.name || ""
      }),
      onClose
    });
    emit("contacts", true);
  }

  mountedDocument.addEventListener(NAV_EVENT, onNavigation);
  mountedDocument.addEventListener("click", onDocumentClick, true);
  mountedWindow.addEventListener("popstate", onPopState);

  observer = new MutationObserverClass((records = []) => {
    const previousRoot = location?.root || null;
    const previousContentRoot = location?.contentRoot || null;
    const shouldRelocate = !previousRoot?.isConnected
      || !previousContentRoot?.isConnected
      || records.some((record) => !previousRoot?.contains(record.target));
    const relocated = shouldRelocate ? relocateSidebar() : false;
    const currentRoot = location?.root || null;
    const touchesCurrent = relocated || records.some((record) => currentRoot?.contains(record.target));
    if (!touchesCurrent) return;
    repairCurrent();
    syncNativeActive();
    renderActive();
  });

  relocateSidebar();
  syncNativeActive();
  renderActive();
  if (gateway?.action) projectRefreshTimer = mountedWindow.setInterval(refreshProjectGroups, 3000);

  const api = {
    openChatWith,
    unmount() {
      if (disposed) return;
      disposed = true;
      mountedNavigationDocuments.delete(mountedDocument);
      observer.disconnect();
      mountedDocument.removeEventListener(NAV_EVENT, onNavigation);
      mountedDocument.removeEventListener("click", onDocumentClick, true);
      mountedWindow.removeEventListener("popstate", onPopState);
      if (projectRefreshTimer != null) mountedWindow.clearInterval(projectRefreshTimer);
      projectRefreshRevision += 1;
      if (globalThis.document === mountedDocument) closeCurrentPage();
      if (pageRoute) {
        pageRoute.replaced = true;
        const cleanup = pageRoute.cleanup;
        pageRoute = null;
        cleanup?.();
      }
      owner?.remove();
      restoreNativeRows();
      restoreNativeAttributes();
      styleTag?.remove();
      proxyRows.clear();
      if (activeInstance?.api === api) activeInstance = null;
    }
  };

  activeInstance = {
    api,
    document: mountedDocument,
    get disposed() { return disposed; }
  };
  return api;
}
