/**
 * ui/pages.js (v2)
 * 主内容区页面容器：通讯录、项目组等页面共用。
 * 不是弹窗——docked 覆盖在主内容区（侧边栏右侧的整个区域），
 * 无遮罩、无动画、无关闭按钮；点击原生导航项或新建对话时自然切走。
 */

const CSS = `
.sb-page{position:fixed;top:0;right:0;bottom:0;z-index:9040;background:#FAFAFA;display:flex;flex-direction:column;font-family:-apple-system,"PingFang SC","Microsoft YaHei",sans-serif}
.sb-page-head{flex:none;height:60px;display:flex;align-items:center;gap:12px;padding:0 28px;border-bottom:1px solid rgba(15,15,15,0.06)}
.sb-page-back{border:none;background:none;font-size:13px;color:#5A5E66;cursor:pointer;padding:6px 10px;border-radius:8px;display:flex;align-items:center;gap:4px}
.sb-page-back:hover{background:rgba(15,15,15,0.05);color:#1F2329}
.sb-page-title{font-size:17px;font-weight:600;color:#1F2329;flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sb-page-body{flex:1;overflow-y:auto}
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
  const area = document.querySelector('[class*="_scrollArea_"]');
  return area ? Math.round(area.getBoundingClientRect().right) : 0;
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
  root.style.left = `${sidebarRight()}px`;

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
  const onResize = () => { root.style.left = `${sidebarRight()}px`; };
  window.addEventListener("resize", onResize);

  // 点击原生导航（对话板块 / 插件板块 / 本地数据 / 新建对话按钮）时自然切走。
  // 注入的 SaleBuddy 导航行都 stopPropagation，不会触发这里。
  const onNavAway = (event) => {
    if (root.contains(event.target)) return;
    if (event.target.closest?.('[class*="_scrollArea_"]') || event.target.closest?.('[dt-eid="sidebar_new_chat_btn"], [data-dt-eid="sidebar_new_chat_btn"]')) {
      page.close();
    }
  };
  document.addEventListener("mousedown", onNavAway);

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
      window.removeEventListener("resize", onResize);
      document.removeEventListener("mousedown", onNavAway);
      root.remove();
      if (currentPage === page) currentPage = null;
      onClose?.();
    }
  };
  currentPage = page;
  return page;
}
