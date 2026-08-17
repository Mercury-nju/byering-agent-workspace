/**
 * ui/sidebar-customization.js
 *
 * Small presentation-only adjustments for the native settings sidebar.
 * The native renderer owns these nodes and may recreate them after navigation,
 * so the sweep is idempotent and is backed by a MutationObserver.
 *
 * 原生底部账户入口整体隐藏：导航框架提供统一的账户信息与登录/退出入口。
 */
import { locateSidebar } from "./nav-framework.js";

const MENU_ITEM_SELECTOR = '[class*="_menuItem_"], [role="menuitem"]';
const ITEMS_TO_HIDE = new Set(["成果中心", "车型配置", "应用", "文档", "图库", "此电脑"]);
const STYLE_ID = "salebuddy-sidebar-customization-style";
let activeInstance = null;

const CSS = `
[class*="_sidebarInner_"]>[class*="_footer_"]{display:none !important}
/* 未登录态的登录入口一律不展示（工作台即已登录）：
   Token 统计卡（含「登录查看」）、对话列表的「登录查看历史对话」空态 */
[class*="_tokenOverview_"]{display:none !important}
[class*="_listArea_"] [class*="_emptyState_"]{display:none !important}
/* 登录弹窗兜底隐藏：主修复在 static-server 对 wy()（ensure-login）做了
   短路 patch，弹窗本不会被创建；此规则仅作双保险，防其他入口残留 */
[class*="_loginModal_"]{display:none !important}
`;

function ensureStyle(ownerDocument) {
  const existing = ownerDocument.querySelector(`#${STYLE_ID}`);
  if (existing) return { tag: existing, owned: false };
  const tag = ownerDocument.createElement("style");
  tag.id = STYLE_ID;
  tag.textContent = CSS;
  ownerDocument.head.appendChild(tag);
  return { tag, owned: true };
}

function normalizedText(value) {
  return (value || "").replace(/\s+/g, "").trim();
}

function findTextLeaf(root, label) {
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let current;
  while ((current = walker.nextNode())) {
    if (normalizedText(current.nodeValue) === label) return current;
  }
  return null;
}

function renameMenuItem(item) {
  if (!item) return;
  const textNode = findTextLeaf(item, "对话策略");
  if (!textNode) return;
  textNode.nodeValue = "知识库";
}

function isPrimaryItem(item) {
  return item.getAttribute("dt-eid") !== "second_sidebar_tab"
    && item.getAttribute("data-dt-eid") !== "second_sidebar_tab";
}

function exactHiddenLabel(item) {
  if (item.closest('[data-sb-nav-owner="1"]')) return null;
  if (!isPrimaryItem(item)) return null;
  for (const label of ITEMS_TO_HIDE) {
    if (findTextLeaf(item, label)) return label;
  }
  return null;
}

function hideMenuItem(item, originals) {
  if (!item || originals.has(item)) return;
  originals.set(item, {
    hidden: item.hidden,
    display: item.style.display,
    ariaHidden: item.getAttribute("aria-hidden")
  });
  item.hidden = true;
  item.style.display = "none";
  item.setAttribute("aria-hidden", "true");
}

function restoreMenuItem(item, originals) {
  const original = originals.get(item);
  if (!original) return;
  item.hidden = original.hidden;
  if (original.display == null) delete item.style.display;
  else item.style.display = original.display;
  if (original.ariaHidden == null) item.removeAttribute("aria-hidden");
  else item.setAttribute("aria-hidden", original.ariaHidden);
  originals.delete(item);
}

function sweepSidebar(sidebar, originals) {
  const candidates = sidebar.querySelectorAll(MENU_ITEM_SELECTOR);
  const toHide = new Set();
  for (const item of candidates) {
    if (exactHiddenLabel(item)) {
      toHide.add(item);
      const group = item.closest('[class*="_menuGroup_"]');
      if (group) {
        for (const child of group.querySelectorAll(MENU_ITEM_SELECTOR)) toHide.add(child);
      }
    }
    renameMenuItem(item);
  }
  return toHide;
}

function releaseDetached(originals) {
  for (const item of [...originals.keys()]) {
    if (!item.isConnected) restoreMenuItem(item, originals);
  }
}

function sweepAll(ownerDocument, originals) {
  releaseDetached(originals);
  const toHide = new Set();
  const sidebar = locateSidebar(ownerDocument)?.scroll;
  if (sidebar) for (const item of sweepSidebar(sidebar, originals)) toHide.add(item);
  for (const item of [...originals.keys()]) {
    if (!toHide.has(item)) restoreMenuItem(item, originals);
  }
  for (const item of toHide) hideMenuItem(item, originals);
}

/**
 * Start the idempotent sidebar adjustment.
 * Returns an unmount handle for the source-layer lifecycle.
 */
export function mountSidebarCustomization({ intervalMs = 500 } = {}) {
  const mountedDocument = globalThis.document;
  const mountedWindow = globalThis.window;
  const MutationObserverClass = globalThis.MutationObserver;
  if (activeInstance?.document === mountedDocument && !activeInstance.disposed) return activeInstance.api;
  if (activeInstance && !activeInstance.disposed) activeInstance.api.unmount();
  const instance = { document: mountedDocument, disposed: false, api: null };
  const { tag: styleTag, owned: ownsStyle } = ensureStyle(mountedDocument);
  const originals = new Map();
  const sweep = () => sweepAll(mountedDocument, originals);
  sweep();
  const observer = new MutationObserverClass(sweep);
  observer.observe(mountedDocument.body, { childList: true, characterData: true, subtree: true });
  const timer = mountedWindow.setInterval(sweep, intervalMs);

  console.log("[SaleBuddy] 侧边栏菜单已调整");
  const api = {
    unmount() {
      if (instance.disposed) return;
      instance.disposed = true;
      observer.disconnect();
      mountedWindow.clearInterval(timer);
      for (const item of [...originals.keys()]) restoreMenuItem(item, originals);
      if (ownsStyle) styleTag.remove();
      if (activeInstance === instance) activeInstance = null;
    }
  };
  instance.api = api;
  activeInstance = instance;
  return api;
}
