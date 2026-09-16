/**
 * ui/pages.js (v2)
 * 主内容区页面容器：通讯录、项目组等页面共用。
 * 不是弹窗——docked 覆盖在主内容区（侧边栏右侧的整个区域），
 * 无遮罩、无动画、无关闭按钮；由统一导航状态负责切换页面。
 */

const CSS = `
:root{--sb-app-page-bg:#f7f8fb;--sb-app-subtle-bg:#f3f6fb}
.sb-page{position:fixed;top:0;right:0;bottom:0;z-index:9040;background:var(--sb-app-page-bg);display:flex;flex-direction:column;font-family:-apple-system,"PingFang SC","Microsoft YaHei",sans-serif}
.sb-page-head{flex:none;height:60px;display:flex;align-items:center;gap:12px;padding:0 28px;border-bottom:1px solid rgba(15,15,15,0.06)}
.sb-page-back{border:none;background:none;font-size:13px;color:#5A5E66;cursor:pointer;padding:6px 10px;border-radius:8px;display:flex;align-items:center;gap:4px}
.sb-page-back:hover{background:rgba(15,15,15,0.05);color:#1F2329}
.sb-page-title{font-size:17px;font-weight:600;color:#1F2329;flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sb-page-body{flex:1;overflow-y:auto;background:var(--sb-app-page-bg)}
.sb-page-body>:where(.sb-as,.sb-chat,.sb-cs,.sb-files,.sb-memory-map,.sb-prospect-page,.sb-realtime-page){background:var(--sb-app-page-bg)}
.sb-page-body>.sb-realtime-page .sb-rw-cloud-wrap,.sb-page-body>.sb-realtime-page .sb-rw-cloud-live-wrap{background:var(--sb-app-subtle-bg)}
`;

let styleInjected = false;
function ensureStyle() {
  if (styleInjected) return;
  const tag = document.createElement("style");
  tag.textContent = CSS;
  document.head.appendChild(tag);
  styleInjected = true;
}

export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function sidebarRight() {
  const areas = document.querySelectorAll('[class*="_scrollArea_"]');
  for (const area of areas) {
    const rect = area.getBoundingClientRect();
    if (rect.width > 0 && rect.right > 0) return Math.round(rect.right);
  }
  return 0;
}

function isMobileViewport() {
  return typeof window.matchMedia === "function"
    && window.matchMedia("(max-width: 760px)").matches;
}

/**
 * The host sidebar can mount after a direct page route has already rendered.
 * Keep retrying until its right edge is measurable so the page does not cover it.
 */
function dockToSidebar(root) {
  let observer = null;
  let retryTimer = null;
  let retries = 0;

  const sync = () => {
    if (isMobileViewport()) {
      root.style.left = "0";
      return true;
    }
    const right = sidebarRight();
    if (!right) return false;
    root.style.left = `${right}px`;
    return true;
  };

  const stop = () => {
    observer?.disconnect();
    observer = null;
    if (retryTimer) window.clearInterval(retryTimer);
    retryTimer = null;
  };

  if (sync()) return stop;

  observer = new MutationObserver(sync);
  observer.observe(document.body, { childList: true, subtree: true });
  retryTimer = window.setInterval(() => {
    retries += 1;
    if (sync() || retries >= 50) stop();
  }, 100);

  return stop;
}

let currentPage = null;

export function closeCurrentPage() {
  if (currentPage) currentPage.close();
}

export function getCurrentPage() {
  return currentPage;
}

/**
 * 打开一个主内容区页面（同时间只有一个；再开会替换）。
 * options: { title, onBack, onClose }
 * 返回 { root, body, close, setTitle, showBack }。
 */
export function openPage({ title = "", onBack = null, onClose = null } = {}) {
  ensureStyle();
  closeCurrentPage();

  const root = el("div", "sb-page");
  const stopDocking = dockToSidebar(root);

  const head = el("div", "sb-page-head");
  const titleEl = el("div", "sb-page-title", title);
  let backBtn = null;
  if (onBack) {
    backBtn = el("button", "sb-page-back", "‹ 返回");
    backBtn.addEventListener("click", onBack);
    head.appendChild(backBtn);
  }
  head.appendChild(titleEl);

  const body = el("div", "sb-page-body");
  root.append(head, body);
  document.body.appendChild(root);

  // 窗口缩放时跟随侧边栏右缘
  const onResize = () => {
    if (isMobileViewport()) {
      root.style.left = "0";
      return;
    }
    const right = sidebarRight();
    if (right > 0) root.style.left = `${right}px`;
  };
  window.addEventListener("resize", onResize);

  const page = {
    root,
    body,
    setTitle(next) { titleEl.textContent = next; },
    /** 切换返回按钮（进入子视图时显示，回列表时隐藏） */
    showBack(visible, handler) {
      if (visible) {
        if (!backBtn) {
          backBtn = el("button", "sb-page-back", "‹ 返回");
          head.insertBefore(backBtn, titleEl);
        } else {
          const fresh = backBtn.cloneNode(true);
          backBtn.replaceWith(fresh);
          backBtn = fresh;
        }
        if (handler) backBtn.addEventListener("click", handler);
      } else if (backBtn) {
        backBtn.remove();
        backBtn = null;
      }
    },
    close() {
      if (currentPage !== page && !root.isConnected) return;
      stopDocking();
      window.removeEventListener("resize", onResize);
      root.remove();
      if (currentPage === page) currentPage = null;
      onClose?.();
    }
  };
  currentPage = page;
  return page;
}
