/**
 * Grouped sidebar navigation.
 *
 * Native React rows stay in their original parents. SaleBuddy owns only the
 * proxy/group DOM, visual slot attributes, active state, and lifecycle.
 */
import { openContactsPage } from "./contacts-page.js";
import { openAgentSquarePage } from "./agent-square.js?v=20260915-live-danmaku-only-1";
import { openMemoryPage } from "./memory-page.js";
import { openFileCenterPage } from "./file-center.js";
import { openConversationStrategyPage } from "./conversation-strategy.js?v=20260914-grid-alignment-1";
import { openProspectCenterPage } from "./prospect-center.js?v=20260909-results-structure-2";
import { openRealtimeWorkPage } from "./realtime-work.js";
import { NAV_PAGE_ROUTES, persistNavigationRoute, clearNavigationRoute } from "./navigation-routes.js";
import { getCurrentPage, closeCurrentPage } from "./pages.js";
import { PRODUCT_VISIBILITY } from "./product-visibility.js";

export { NAV_PAGE_ROUTES };

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
  "skills",
  "contacts",
  "agentSquare",
  "kbMemory",
  "conversationStrategy"
]);

const EXTRA_NAV_MODES = new Set(["realtimeWork", "prospects", "discoveredPeople", "files"]);
const NAV_MODE_SET = new Set([...NAV_MODES, ...EXTRA_NAV_MODES]);
const KNOWLEDGE_MODES = new Set(["kbMemory", "conversationStrategy"]);
const VISIBLE_KNOWLEDGE_MODES = Object.freeze(["kbMemory", "conversationStrategy"]);
const NAV_BLUEPRINT = Object.freeze([
  Object.freeze({ id: "work", items: Object.freeze(["office", "contacts", "agentSquare", "realtimeWork", "prospects", "discoveredPeople", "files"]) }),
  Object.freeze({ id: "configuration", items: VISIBLE_KNOWLEDGE_MODES })
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
  return node?.isConnected === true;
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
${PRODUCT_VISIBILITY.conversation ? "" : `[data-sb-nav-root="1"] [data-sb-nav-slot="newTask"],[data-sb-nav-root="1"] [data-sb-nav-slot="search"],[data-sb-nav-root="1"] [data-sb-nav-slot="history"]{display:none!important}`}
${PRODUCT_VISIBILITY.skills ? "" : `[data-sb-nav-owner="1"] [data-sb-mode="skills"]{display:none!important}`}

[data-sb-nav-root="1"] [data-sb-nav-content-root="1"]{display:flex!important;flex-direction:column!important;min-height:100%}
[data-sb-nav-root="1"] [data-sb-nav-conversation-section="1"]{display:contents!important}
[data-sb-nav-root="1"] [data-sb-nav-conversation-section="1"]>[class*="_sectionLabel_"]{display:none!important}
[data-sb-nav-owner="1"],[data-sb-nav-owner="1"] [data-sb-group="work"]{display:contents!important}
[data-sb-nav-owner="1"] [data-sb-nav-slot="work-label"]{order:10}
[data-sb-nav-root="1"] [data-sb-nav-slot="office"]{order:11}
[data-sb-nav-root="1"] [data-sb-mode="office"]{height:${NAV_LAYOUT.primaryRow}px!important;min-height:${NAV_LAYOUT.primaryRow}px!important;box-sizing:border-box!important}
[data-sb-nav-owner="1"] [data-sb-mode="agentSquare"]{order:12}
[data-sb-nav-owner="1"] [data-sb-extra-mode="realtimeWork"]{order:13}
[data-sb-nav-owner="1"] .sb-nav-results-group{order:14;margin:2px 8px 0 0}
[data-sb-nav-owner="1"] .sb-nav-results-toggle{width:100%;height:${NAV_LAYOUT.primaryRow}px;box-sizing:border-box;display:flex;align-items:center;gap:10px;padding:0 10px;border:0;border-radius:9px;background:transparent;color:#34383f;font:inherit;font-size:13px;text-align:left;cursor:pointer;transition:background-color 140ms ease,color 140ms ease}
[data-sb-nav-owner="1"] .sb-nav-results-toggle:hover{background:rgba(23,25,29,.045);color:#111318}
[data-sb-nav-owner="1"] .sb-nav-results-toggle.sb-nav-on{background:rgba(23,25,29,.075);color:#111318;font-weight:550}
[data-sb-nav-owner="1"] .sb-nav-results-toggle .sb-nav-label{font-weight:inherit}
[data-sb-nav-owner="1"] .sb-nav-results-arrow{margin-left:auto;color:#858a93;font-size:12px;line-height:1}
[data-sb-nav-owner="1"] .sb-nav-results-children{display:grid;gap:2px;margin-top:2px}
[data-sb-nav-owner="1"] .sb-nav-results-children[hidden]{display:none!important}
[data-sb-nav-owner="1"] .sb-nav-results-children .sb-nav-row{min-height:36px;padding-left:38px;font-size:12px}
[data-sb-nav-owner="1"] .sb-nav-results-children .sb-nav-icon{width:16px;height:16px}
[data-sb-nav-owner="1"] .sb-nav-results-children .sb-nav-icon svg{width:16px;height:16px}
[data-sb-nav-owner="1"] [data-sb-nav-slot="history-label"]{order:17}
[data-sb-nav-root="1"] [data-sb-nav-slot="history"]{order:18}
[data-sb-nav-root="1"] [data-sb-nav-plugin-section="1"]{order:19;margin:0!important}
[data-sb-nav-owner="1"] [data-sb-group="team"]{order:20}
[data-sb-nav-owner="1"] [data-sb-group="configuration"]{order:21}
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
[data-sb-nav-owner="1"] .sb-nav-knowledge-children .sb-nav-row{padding-left:10px;min-height:${NAV_LAYOUT.primaryRow}px}
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
  realtimeWork: { label: "实时工作", icon: "realtimeWork" },
  prospects: { label: "潜客线索", icon: "prospects" },
  discoveredPeople: { label: "发现的人", icon: "discovered" },
  files: { label: "文件中心", icon: "files" },
  contacts: { label: "对话", icon: "contacts" },
  skills: { label: "技能广场", icon: "skills", native: true },
  agentSquare: { label: "Agent 中心", icon: "agentCenter" },
  kbMemory: { label: "记忆", icon: "memory" },
  conversationStrategy: { label: "对话策略", icon: "strategy" }
});

const ICONS = Object.freeze({
  prospects: '<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><circle cx="9" cy="9" r="5.5" stroke="currentColor" stroke-width="2"/><path d="m13.2 13.2 4 4M6.7 9h4.6M9 6.7v4.6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
  discovered: '<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><circle cx="8" cy="7" r="3.1" stroke="currentColor" stroke-width="1.7"/><path d="M2.8 16c.7-2.7 2.4-4.1 5.2-4.1s4.5 1.4 5.2 4.1M14 9.2a2.5 2.5 0 1 0 0-5M13.8 12.1c1.9.2 3.1 1.4 3.5 3.4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
  files: '<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M4 2.5h7.2L16 7.3v10.2H4a1.5 1.5 0 0 1-1.5-1.5V4A1.5 1.5 0 0 1 4 2.5Z" fill="currentColor"/><path d="M11 2.8v4.7h4.6M6.5 10h6.5M6.5 13h5" stroke="white" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  realtimeWork: '<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><rect x="2.5" y="3" width="15" height="10.5" rx="2" fill="currentColor"/><path d="M7 17h6M10 13.5V17" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="15" cy="6" r="1.5" fill="#fff"/></svg>',
  contacts: '<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><rect x="3" y="2.5" width="14" height="15" rx="4" fill="currentColor"/><circle cx="10" cy="8" r="2.2" fill="white"/><path d="M6.6 14c.7-1.8 1.9-2.7 3.4-2.7s2.7.9 3.4 2.7" stroke="white" stroke-width="1.3" stroke-linecap="round"/></svg>',
  skills: '<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m10 2 2.1 4.3L17 7l-3.5 3.4.8 4.8-4.3-2.3-4.3 2.3.8-4.8L3 7l4.9-.7z" fill="currentColor"/><circle cx="10" cy="9" r="1.6" fill="white"/></svg>',
  agentCenter: '<svg viewBox="0 0 20 20" fill="none" aria-hidden="true" data-sb-agent-avatar="1"><path d="M10.1 1.6c4.4 0 7.4 3.6 7.4 8.2 0 4.9-2.8 8.3-7.6 8.3-4.6 0-7.5-3-7.5-7.5 0-4.8 3.1-8.7 7.7-9Z" fill="currentColor"/><path d="M6.3 7.1c.7-.4 1.5-.1 1.8.6l.8 1.9c.3.7 0 1.5-.7 1.8-.7.3-1.5 0-1.8-.7l-.8-1.8c-.3-.7 0-1.5.7-1.8Z" fill="white" data-sb-agent-eye="1"/><path d="M11.6 5.9c.7-.3 1.5 0 1.8.7l.8 1.8c.3.7 0 1.5-.7 1.8-.7.3-1.5 0-1.8-.7l-.8-1.8c-.3-.7 0-1.5.7-1.8Z" fill="white" data-sb-agent-eye="1"/></svg>',
  memory: '<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M10 2a6 6 0 0 1 4.2 10.3c-.8.8-1.2 1.6-1.2 2.7H7c0-1.1-.4-1.9-1.2-2.7A6 6 0 0 1 10 2" fill="currentColor"/><path d="M8 18h4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M8 8.5h4" stroke="white" stroke-width="1.3" stroke-linecap="round"/></svg>',
  strategy: '<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M4 3.5h12a1.5 1.5 0 0 1 1.5 1.5v10A1.5 1.5 0 0 1 16 16.5H4A1.5 1.5 0 0 1 2.5 15V5A1.5 1.5 0 0 1 4 3.5Z" stroke="currentColor" stroke-width="1.5"/><path d="M5.5 7h9M5.5 10h6M5.5 13h3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>'
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
  if (mode === "skills") return findRowByLabels(findPluginSection(root), new Set(["技能广场"]));
  if (mode === "conversationStrategy") return findRowByLabels(findPluginSection(root), new Set(["知识库", "对话策略"]));
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
    realtimeWork: (options) => openRealtimeWorkPage(options),
    prospects: (options) => openProspectCenterPage(options),
    discoveredPeople: (options) => openProspectCenterPage({
      ...options,
      initialSurface: "people",
      standaloneDiscovery: true
    }),
    contacts: (options) => openContactsPage(options),
    agentSquare: (options) => openAgentSquarePage(options),
    memory: (options) => openMemoryPage(options),
    conversationStrategy: (options) => openConversationStrategyPage(options),
    files: (options) => openFileCenterPage(options)
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
  let resultsToggle = null;
  let resultsArrow = null;
  let resultsChildren = null;
  let resultsExpanded = false;
  let accountSection = null;
  let accountToggle = null;
  let accountMenu = null;
  let accountName = null;
  let accountEmail = null;
  let accountSignedIn = true;
  let observer = null;
  const proxyRows = new Map();
  const hiddenNative = new Map();
  const trackedNativeAttributes = new Map();
  const trackedNativeStyles = new Map();
  const neutralizedNativeActiveTokens = new Map();

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

  function restoreNeutralizedNativeActiveTokens() {
    for (const [row, tokens] of neutralizedNativeActiveTokens) {
      if (row.isConnected && tokens.length) row.classList.add(...tokens);
      neutralizedNativeActiveTokens.delete(row);
    }
  }

  function syncNativeActiveVisuals() {
    const nativeModes = ["newTask", "office", "skills"];
    const customPageActive = activeMode && !nativeModes.includes(activeMode);
    if (!customPageActive) {
      restoreNeutralizedNativeActiveTokens();
      return;
    }
    for (const mode of nativeModes) {
      const row = currentTarget(mode);
      if (!row || owner?.contains(row)) continue;
      const activeTokens = [...row.classList].filter((name) => name !== ACTIVE_CLASS && isActiveClassToken(name));
      if (!activeTokens.length) continue;
      const stored = neutralizedNativeActiveTokens.get(row) || [];
      neutralizedNativeActiveTokens.set(row, [...new Set([...stored, ...activeTokens])]);
      row.classList.remove(...activeTokens);
    }
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
      clearNavigationRoute(mode);
      if (mode && activeMode === mode) emit(mode, false);
    };
  }

  function openCustom(mode, options = {}) {
    if (["prospects", "discoveredPeople", "files"].includes(mode)) resultsExpanded = true;
    persistNavigationRoute(mode, options);
    if (activeMode === mode && getCurrentPage()) return;
    const onClose = claimPageRoute(mode);
    emit(mode, true);
    if (mode === "contacts") {
      openers.contacts({
        gateway,
        teamLive,
        onRecruit: () => {
          persistNavigationRoute("agentSquare");
          const recruitClose = claimPageRoute("agentSquare");
          emit("agentSquare", true);
          openers.agentSquare({ gateway, teamLive, onChat: (agentType) => openChatWith(agentType), onClose: recruitClose });
        },
        onClose
      });
    } else if (mode === "prospects" || mode === "discoveredPeople") {
      openers[mode]({
        ...options,
        ...(mode === "discoveredPeople" ? { initialSurface: "people", standaloneDiscovery: true } : {}),
        onClose
      });
    } else if (mode === "realtimeWork") {
      openers.realtimeWork({ ...options, teamLive, onClose });
    } else if (mode === "agentSquare") {
      openers.agentSquare({ ...options, gateway, teamLive, onChat: (agentType) => openChatWith(agentType), onClose });
    } else if (mode === "files") {
      openers.files({ ...options, onClose });
    } else if (mode === "kbMemory") {
      openers.memory({ gateway, onClose });
    } else if (mode === "conversationStrategy") {
      openers.conversationStrategy({
        ...options,
        gateway,
        teamLive,
        onUseAgent: () => openCustom("agentSquare", { initialAgentId: "mkt-dm-inbox" }),
        onClose
      });
    }
  }

  function forwardNative(mode, proxy) {
    const target = currentTarget(mode);
    const ready = canForwardNative(mode, target);
    proxy.setAttribute("aria-disabled", ready ? "false" : "true");
    if (!ready) return;
    persistNavigationRoute(mode);
    target.click();
  }

  function buildRow(mode, sourceClass = "") {
    const definition = ITEM_DEFINITIONS[mode];
    const row = createElement("div", `${stripActiveClasses(sourceClass)} sb-nav-row`.trim());
    // Keep native mode selectors stable while exposing custom first-level entries separately.
    if (EXTRA_NAV_MODES.has(mode)) row.dataset.sbExtraMode = mode;
    else row.dataset.sbMode = mode;
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

  function updateContext(next = {}) {
    if (Object.prototype.hasOwnProperty.call(next, "gateway")) gateway = next.gateway;
    if (Object.prototype.hasOwnProperty.call(next, "teamLive")) teamLive = next.teamLive;
    getCurrentPage()?.setGateway?.(gateway);
    return api;
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
    // Keep the work group as a semantic marker, but make its visible rows
    // direct children of the navigation owner. Nested display: contents
    // nodes are flattened inconsistently by the native sidebar renderer.
    const contacts = buildRow("contacts", menuClass);
    contacts.dataset.sbNavSlot = "contacts";
    const agentCenter = buildRow("agentSquare", menuClass);
    const realtimeWork = buildRow("realtimeWork", menuClass);
    resultsToggle = createElement("button", "sb-nav-results-toggle");
    resultsToggle.type = "button";
    resultsToggle.setAttribute("aria-controls", "sb-nav-results-children");
    resultsToggle.append(icon("prospects"), createElement("span", "sb-nav-label", "成果中心"));
    resultsArrow = createElement("span", "sb-nav-results-arrow", "▾");
    resultsToggle.appendChild(resultsArrow);
    resultsChildren = createElement("div", "sb-nav-results-children");
    resultsChildren.id = "sb-nav-results-children";
    const prospects = buildRow("prospects", menuClass);
    const discoveredPeople = buildRow("discoveredPeople", menuClass);
    const files = buildRow("files", menuClass);
    resultsChildren.append(prospects, discoveredPeople, files);
    const resultsGroup = createElement("section", "sb-nav-results-group");
    resultsGroup.dataset.sbResultsGroup = "1";
    resultsGroup.style.order = "15";
    resultsGroup.append(resultsToggle, resultsChildren);
    resultsToggle.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      resultsExpanded = !resultsExpanded;
      renderResultsGroup();
    });
    const skills = buildRow("skills", menuClass);
    contacts.style.order = "12";
    agentCenter.style.order = "13";
    realtimeWork.style.order = "14";
    skills.style.order = "16";
    const recentLabel = createElement("div", "sb-nav-recent-label", "最近任务");
    recentLabel.dataset.sbNavSlot = "history-label";
    recentLabel.style.order = "18";

    const configuration = group("configuration", "知识库");
    configuration.dataset.sbNavSlot = "configuration";
    configuration.style.order = "21";
    knowledgeChildren = createElement("div", "sb-nav-knowledge-children");
    for (const mode of VISIBLE_KNOWLEDGE_MODES) knowledgeChildren.appendChild(buildRow(mode, menuClass));
    configuration.appendChild(knowledgeChildren);

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

    // The empty group remains queryable for state/style compatibility. Its
    // visual children are appended directly so flex ordering is deterministic.
    owner.append(work, workLabel, contacts, agentCenter, realtimeWork, resultsGroup, skills, recentLabel, configuration, accountSection);
    renderAccount();
    contentRoot.appendChild(owner);
  }

  function renderKnowledge() {
    if (!knowledgeToggle?.isConnected) return;
    const expanded = knowledgeExpanded(knowledgeState);
    if (knowledgeToggle.getAttribute("aria-expanded") !== String(expanded)) knowledgeToggle.setAttribute("aria-expanded", String(expanded));
    const arrow = expanded ? "▾" : "▸";
    if (knowledgeArrow.textContent !== arrow) knowledgeArrow.textContent = arrow;
    if (knowledgeChildren.hidden !== !expanded) knowledgeChildren.hidden = !expanded;
  }

  function renderResultsGroup() {
    if (!resultsToggle?.isConnected || !resultsChildren?.isConnected) return;
    const expanded = resultsExpanded;
    resultsToggle.setAttribute("aria-expanded", String(expanded));
    resultsArrow.textContent = expanded ? "▾" : "▸";
    resultsChildren.hidden = !expanded;
  }

  function renderActive() {
    observer?.disconnect();
    syncNativeActiveVisuals();
    const root = location?.root;
    const rows = root ? root.querySelectorAll("[data-sb-mode], [data-sb-extra-mode]") : [];
    for (const row of rows) {
      const rowMode = row.dataset.sbMode || row.dataset.sbExtraMode;
      const selected = rowMode === activeMode;
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
        const rowMode = row.dataset.sbMode || row.dataset.sbExtraMode;
        if (rowMode !== activeMode) {
          if (owner?.contains(row)) row.removeAttribute("aria-current");
          else trackAttribute(row, "aria-current", null);
          if (owner?.contains(row)) delete row.dataset.sbNavActiveOwned;
          else trackAttribute(row, "data-sb-nav-active-owned", null);
        }
      }
    }
    renderKnowledge();
    renderResultsGroup();
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
      attributeFilter: ["class", "aria-current"]
    });
  }

  function updateAvailability() {
    for (const mode of ["skills"]) {
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
      setVisualSlot(history, "history", 19);
      trackAttribute(history, "hidden", hasHistory ? null : "");
    }
    trackStyle(plugin, "order", "20");
    trackStyle(localData, "order", "25");
    trackAttribute(localData, "hidden", "");
    trackAttribute(localData, "aria-hidden", "true");
    trackStyle(localData, "display", "none");
    trackStyle(conversation, "display", "contents");
  }

  function hideDuplicatePluginRows() {
    hideNativeRow(currentTarget("skills"));
    hideNativeRow(currentTarget("conversationStrategy"));
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
      resultsToggle = null;
      resultsArrow = null;
      resultsChildren = null;
      accountSection = null;
      accountToggle = null;
      accountMenu = null;
      accountName = null;
      accountEmail = null;
      buildOwner(contentRoot);
    }
    markNativeSlots();
    hideDuplicatePluginRows();
    updateAvailability();
    renderKnowledge();
    renderResultsGroup();
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
    resultsToggle = null;
    resultsArrow = null;
    resultsChildren = null;
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
    const mode = event.detail?.mode;
    if (event.detail?.active && ["newTask", "office", "skills"].includes(mode)) {
      // Native surfaces and SaleBuddy pages share the same content slot. Close
      // the custom route before the native view paints so two work surfaces
      // cannot remain visible at the same time.
      // Let the page's own onClose callback publish its inactive transition.
      // This is also important for opener test doubles that do not mount a DOM page.
      closeCurrentPage();
    }
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
    const nativeMode = ["newTask", "office", "skills"].find((mode) => currentTarget(mode)?.contains(event.target));
    if (nativeMode) {
      lastNativeActive = nativeMode;
      persistNavigationRoute(nativeMode);
      emit(nativeMode, true);
      return;
    }
    const search = findSearch(location?.root, location?.fixedTop);
    const history = findHistoryList(location?.root);
    if (search?.contains(event.target) || history?.contains(event.target)) clearActive();
  }

  function onPopState() {
    clearActive();
  }

  function openChatWith(agentOrContext, context = {}) {
    const handoff = agentOrContext && typeof agentOrContext === "object"
      ? agentOrContext
      : { ...context, agentId: agentOrContext };
    const agentType = handoff.agentId || handoff.agentType;
    persistNavigationRoute("contacts");
    const onClose = claimPageRoute("contacts");
    openers.contacts({
      gateway,
      teamLive,
      initialFriend: agentType,
      initialConversationContext: {
        agentId: agentType || null,
        taskId: handoff.taskId || null,
        taskRunId: handoff.taskRunId || null,
        accountId: handoff.accountId || null
      },
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

  const api = {
    openChatWith,
    updateContext,
    openContacts: (options = {}) => openCustom("contacts", options),
    openAgentSquare: (options = {}) => openCustom("agentSquare", options),
    openRealtimeWork: (options = {}) => openCustom("realtimeWork", options),
    openProspects: (options = {}) => openCustom("prospects", options),
    openDiscoveredPeople: (options = {}) => openCustom("discoveredPeople", options),
    openFiles: (options = {}) => openCustom("files", options),
    openMemory: (options = {}) => openCustom("kbMemory", options),
    openConversationStrategy: (options = {}) => openCustom("conversationStrategy", options),
    unmount() {
      if (disposed) return;
      disposed = true;
      mountedNavigationDocuments.delete(mountedDocument);
      observer.disconnect();
      mountedDocument.removeEventListener(NAV_EVENT, onNavigation);
      mountedDocument.removeEventListener("click", onDocumentClick, true);
      mountedWindow.removeEventListener("popstate", onPopState);
      if (globalThis.document === mountedDocument) closeCurrentPage();
      if (pageRoute) {
        pageRoute.replaced = true;
        const cleanup = pageRoute.cleanup;
        pageRoute = null;
        cleanup?.();
      }
      owner?.remove();
      restoreNeutralizedNativeActiveTokens();
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
