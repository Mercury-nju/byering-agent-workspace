/**
 * Real Douyin account authorization shell.
 * The backend owns the browser workspace; this view only reports observed
 * login state and never turns a local click into a fake success.
 */

const CSS = `
.sb-dy-auth-root{position:fixed;inset:0;z-index:9800;display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(31,35,41,.28);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);font-family:-apple-system,"PingFang SC","Microsoft YaHei",sans-serif}
.sb-dy-auth-window{width:min(940px,calc(100vw - 32px));height:min(820px,calc(100vh - 24px));display:flex;flex-direction:column;overflow:hidden;border:1px solid rgba(15,15,15,.12);border-radius:16px;background:#F4F6F8;box-shadow:0 28px 80px rgba(15,15,15,.28);animation:sb-dy-auth-in .22s ease-out both}
@keyframes sb-dy-auth-in{from{opacity:0;transform:translateY(10px) scale(.98)}to{opacity:1;transform:none}}
.sb-dy-auth-head{display:flex;align-items:center;gap:9px;height:44px;padding:0 14px;background:#1F2329;color:#D9DEE6;flex:none}
.sb-dy-auth-dots{display:flex;gap:5px}.sb-dy-auth-dots i{width:8px;height:8px;border-radius:50%;background:#D04D46}.sb-dy-auth-dots i:nth-child(2){background:#E8A33D}.sb-dy-auth-dots i:nth-child(3){background:#57B26A}
.sb-dy-auth-title{font-size:12px;font-weight:650}.sb-dy-auth-live{display:inline-flex;align-items:center;gap:5px;margin-left:auto;color:#8FDC9A;font-size:10px}.sb-dy-auth-live i{width:6px;height:6px;border-radius:50%;background:#57B26A;box-shadow:0 0 0 3px rgba(87,178,106,.14)}
.sb-dy-auth-close{margin-left:10px;border:0;background:transparent;color:#AEB6C2;font-size:19px;line-height:1;cursor:pointer;padding:2px 5px;border-radius:6px}.sb-dy-auth-close:hover{background:rgba(255,255,255,.1);color:#fff}
.sb-dy-auth-toolbar{display:flex;align-items:center;gap:8px;padding:8px 12px;border-bottom:1px solid rgba(15,15,15,.08);background:#fff;color:#8A8F99;font-size:10px;flex:none}.sb-dy-auth-nav{font-size:13px;color:#B0B4BB}.sb-dy-auth-url{flex:1;min-width:0;padding:6px 10px;border-radius:7px;background:#F2F4F6;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.sb-dy-auth-lock{color:#57B26A}
.sb-dy-auth-screen{flex:1;min-height:0;overflow:auto;background:#fff}.sb-dy-auth-page{min-height:100%;display:flex;flex-direction:column}
.sb-dy-auth-brand{display:flex;align-items:center;justify-content:space-between;padding:17px 28px;border-bottom:1px solid rgba(15,15,15,.06)}.sb-dy-auth-brand strong{font-size:20px;letter-spacing:.04em;color:#14171C}.sb-dy-auth-brand span{color:#8A8F99;font-size:11px}
.sb-dy-auth-progress{display:flex;align-items:center;justify-content:center;gap:0;padding:19px 28px 6px}.sb-dy-auth-step{display:flex;align-items:center;gap:6px;color:#A0A6AE;font-size:11px;white-space:nowrap}.sb-dy-auth-step i{display:grid;place-items:center;width:22px;height:22px;border-radius:50%;background:#EEF1F4;color:#8A8F99;font-style:normal;font-size:10px}.sb-dy-auth-step.sb-active{color:#1F2329;font-weight:650}.sb-dy-auth-step.sb-active i{background:#1F2329;color:#fff}.sb-dy-auth-step.sb-done{color:#2F7D3F}.sb-dy-auth-step.sb-done i{background:rgba(87,178,106,.14);color:#2F7D3F}.sb-dy-auth-line{width:58px;height:1px;margin:0 10px;background:#E4E7EA}
.sb-dy-auth-main{width:min(760px,calc(100% - 48px));margin:18px auto 30px}.sb-dy-auth-kicker{color:#7C848E;font-size:11px;letter-spacing:.08em}.sb-dy-auth-heading{margin:6px 0 0;color:#1F2329;font-size:24px;line-height:1.35}.sb-dy-auth-copy{margin:8px 0 20px;color:#707984;font-size:13px;line-height:1.7}
.sb-dy-auth-account{display:flex;align-items:center;gap:12px;padding:13px 14px;border:1px solid rgba(15,15,15,.09);border-radius:11px;background:#FAFBFC}.sb-dy-auth-mark{display:grid;place-items:center;width:38px;height:38px;border-radius:10px;background:#1F2329;color:#fff;font-size:18px;font-weight:700}.sb-dy-auth-account-main{min-width:0}.sb-dy-auth-account-main strong{display:block;color:#1F2329;font-size:13px}.sb-dy-auth-account-main span{display:block;margin-top:3px;color:#8A8F99;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sb-dy-auth-loginbox{margin-top:12px;padding:14px;border:1px solid rgba(15,15,15,.08);border-radius:11px;background:#fff}.sb-dy-auth-loginrow{display:flex;align-items:center;justify-content:space-between;gap:12px;color:#5A6472;font-size:12px}.sb-dy-auth-loginrow strong{color:#1F2329;font-size:12px}.sb-dy-auth-status{display:inline-flex;align-items:center;gap:5px;color:#B87A1E;font-size:11px}.sb-dy-auth-status i{width:6px;height:6px;border-radius:50%;background:currentColor}.sb-dy-auth-cloudview{position:relative;margin-top:12px;overflow:hidden;border:1px solid rgba(15,15,15,.1);border-radius:10px;background:#F4F6F8}.sb-dy-auth-cloudview iframe{display:block;width:100%;height:clamp(360px,52vh,560px);border:0;background:#fff}.sb-dy-auth-cloudview-toggle{position:absolute;top:10px;right:10px;z-index:3;display:grid;place-items:center;width:34px;height:34px;padding:0;border:1px solid rgba(15,15,15,.14);border-radius:8px;background:rgba(255,255,255,.94);box-shadow:0 4px 12px rgba(15,15,15,.14);color:#1F2329;font:inherit;font-size:17px;line-height:1;cursor:pointer}.sb-dy-auth-cloudview-toggle:hover{background:#fff;box-shadow:0 6px 16px rgba(15,15,15,.18)}.sb-dy-auth-cloudview.is-expanded{position:fixed;inset:18px;z-index:10000;display:flex;flex-direction:column;margin:0;border-radius:14px;box-shadow:0 28px 80px rgba(15,15,15,.38)}.sb-dy-auth-cloudview.is-expanded iframe{height:auto;min-height:0;flex:1}.sb-dy-auth-cloudview.is-expanded .sb-dy-auth-cloudview-toggle{top:12px;right:12px}.sb-dy-auth-screen.sb-dy-auth-screen-expanded{overflow:hidden}.sb-dy-auth-cloudview-fallback{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 12px;color:#6C7480;font-size:11px}.sb-dy-auth-cloudview-actions{display:flex;align-items:center;gap:8px;flex:none}.sb-dy-auth-cloudview-button{height:28px;padding:0 9px;border:1px solid rgba(59,107,212,.25);border-radius:7px;background:#fff;color:#3B6BD4;font:inherit;font-size:11px;font-weight:650;cursor:pointer}.sb-dy-auth-cloudview-button:hover{background:#F5F8FF}.sb-dy-auth-cloudview-button:disabled{opacity:.55;cursor:wait}
.sb-dy-auth-notice{margin-top:13px;padding:11px 12px;border-radius:9px;background:#F5F8FF;color:#5C6B82;font-size:11px;line-height:1.65}.sb-dy-auth-notice strong{color:#3B6BD4}
.sb-dy-auth-actions{display:flex;justify-content:flex-end;gap:9px;margin-top:18px}.sb-dy-auth-btn{height:36px;padding:0 15px;border:1px solid rgba(15,15,15,.12);border-radius:8px;background:#fff;color:#5A5E66;font:inherit;font-size:12px;font-weight:600;cursor:pointer}.sb-dy-auth-btn:hover{background:#F5F6F8}.sb-dy-auth-btn.sb-primary{border-color:#1F2329;background:#1F2329;color:#fff}.sb-dy-auth-btn.sb-primary:hover{background:#3F434A}.sb-dy-auth-btn:disabled{opacity:.55;cursor:wait}
.sb-dy-auth-scope-list{display:grid;gap:8px;margin:16px 0 0;padding:0;list-style:none}.sb-dy-auth-scope-list li{display:flex;align-items:flex-start;gap:9px;color:#3F4752;font-size:12px;line-height:1.55}.sb-dy-auth-scope-list li::before{content:"✓";display:grid;place-items:center;width:17px;height:17px;flex:none;border-radius:50%;background:rgba(76,154,255,.12);color:#3B6BD4;font-weight:700}
.sb-dy-auth-boundary{display:grid;gap:6px;margin-top:15px;padding:12px;border:1px dashed rgba(76,154,255,.32);border-radius:9px;background:#FBFCFF;color:#6C7787;font-size:11px;line-height:1.55}.sb-dy-auth-boundary strong{color:#3B6BD4;font-size:11px}
.sb-dy-auth-success{display:flex;flex-direction:column;align-items:center;text-align:center;padding:36px 20px}.sb-dy-auth-check{display:grid;place-items:center;width:54px;height:54px;border-radius:50%;background:rgba(87,178,106,.14);color:#2F7D3F;font-size:27px}.sb-dy-auth-success .sb-dy-auth-heading{font-size:22px}.sb-dy-auth-success .sb-dy-auth-copy{max-width:390px;margin-bottom:0}
@keyframes sb-dy-auth-pulse{0%,100%{opacity:.45;transform:scale(.86)}50%{opacity:1;transform:scale(1)}}
.sb-dy-auth-cloudview-fallback{flex-wrap:wrap}.sb-dy-auth-cloudview-fallback>span{flex:1;min-width:220px}
.sb-dy-auth-status i{animation:sb-dy-auth-pulse 1.2s ease-in-out infinite}
@media(max-width:640px){.sb-dy-auth-root{padding:12px}.sb-dy-auth-window{width:100%;height:100%;border-radius:12px}.sb-dy-auth-main{width:calc(100% - 32px)}.sb-dy-auth-brand{padding-left:18px;padding-right:18px}.sb-dy-auth-progress{padding-left:12px;padding-right:12px}.sb-dy-auth-line{width:22px;margin:0 6px}.sb-dy-auth-cloudview.is-expanded{inset:8px;border-radius:10px}}
@media(prefers-reduced-motion:reduce){.sb-dy-auth-status i{animation:none}}
@media(prefers-reduced-motion:reduce){.sb-dy-auth-window{animation:none}}
`;

let styleInjected = false;
let activeWindow = null;

function ensureStyle() {
  if (styleInjected) return;
  const style = document.createElement("style");
  style.textContent = CSS;
  document.head.appendChild(style);
  styleInjected = true;
}

function node(tag, className, text) {
  const item = document.createElement(tag);
  if (className) item.className = className;
  if (text != null) item.textContent = text;
  return item;
}

function localCloudViewerUrl(session) {
  if (!session?.agentId || typeof globalThis.location === "undefined" || !globalThis.location.origin || globalThis.location.origin === "null") return null;
  const url = new URL("/cloud-view.html", globalThis.location.origin);
  url.searchParams.set("agentId", session.agentId);
  if (session.accountId) url.searchParams.set("accountId", String(session.accountId));
  url.searchParams.set("embedded", "1");
  const target = session.view_url || session.viewUrlRaw || session.rawViewUrl;
  if (typeof target === "string" && /^wss?:\/\//i.test(target)) url.searchParams.set("targetUrl", target);
  const page = session.view_page_url || session.viewPageUrl || session.login_url || session.loginUrl || session.cloudViewUrl;
  if (typeof page === "string" && /^https?:\/\//i.test(page) && !url.searchParams.has("targetUrl")) url.searchParams.set("viewPageUrl", page);
  const expiresAt = session.view_url_expires_at || session.viewUrlExpiresAt;
  if (expiresAt) url.searchParams.set("expiresAt", String(expiresAt));
  const backendUrl = globalThis.__SALEBUDDY_CONFIG__?.controlPlaneUrl
    || document.querySelector('meta[name="salebuddy-control-plane"]')?.content;
  if (backendUrl) url.searchParams.set("backend", String(backendUrl));
  return url.toString();
}

function isDouyinSession(session) {
  return session?.source === "douyin-mcp" || session?.provider === "douyin";
}

function embeddedViewerUrl(session) {
  const localUrl = localCloudViewerUrl(session);
  if (localUrl) return localUrl;
  // Douyin authorization must stay inside the product-owned cloud viewer.
  // Generic browser-workspace providers may still use their provider page.
  if (isDouyinSession(session)) return null;
  return session?.cloudViewUrl || session?.viewUrl || session?.view_url || null;
}

function sessionToolbarLabel(session) {
  if (isDouyinSession(session) || localCloudViewerUrl(session)) return "当前云电脑授权画面";
  return session?.pageUrl || session?.authUrl || "等待浏览器工作区";
}

function stepper(active) {
  const wrap = node("div", "sb-dy-auth-progress");
  const steps = [["1", "登录抖音"], ["2", "核对权限"], ["3", "返回 Byering"]];
  steps.forEach(([number, label], index) => {
    const step = node("div", `sb-dy-auth-step${index < active ? " sb-done" : index === active ? " sb-active" : ""}`);
    step.append(node("i", null, index < active ? "✓" : number), node("span", null, label));
    wrap.appendChild(step);
    if (index < steps.length - 1) wrap.appendChild(node("span", "sb-dy-auth-line"));
  });
  return wrap;
}

export function openDouyinAuthorization({ account, scopes = [], session = null, checkAuthorization, refreshCloudView, onAuthorized, onCancelled } = {}) {
  ensureStyle();
  activeWindow?.close("replaced");

  const root = node("div", "sb-dy-auth-root");
  const windowEl = node("section", "sb-dy-auth-window");
  windowEl.setAttribute("role", "dialog");
  windowEl.setAttribute("aria-label", "抖音账号云电脑授权");
  const head = node("header", "sb-dy-auth-head");
  const dots = node("div", "sb-dy-auth-dots");
  dots.append(node("i"), node("i"), node("i"));
  head.appendChild(dots);
  head.appendChild(node("span", "sb-dy-auth-title", "云电脑 · Browser Agent"));
  const live = node("span", "sb-dy-auth-live");
  live.append(node("i"), node("span", null, "LIVE"));
  head.appendChild(live);
  const closeButton = node("button", "sb-dy-auth-close", "×");
  closeButton.type = "button";
  closeButton.setAttribute("aria-label", "关闭云电脑");
  head.appendChild(closeButton);
  const toolbar = node("div", "sb-dy-auth-toolbar");
  toolbar.append(node("span", "sb-dy-auth-nav", "‹"), node("span", "sb-dy-auth-nav", "›"), node("span", "sb-dy-auth-nav", "↻"));
  toolbar.append(node("span", "sb-dy-auth-lock", "⌑"), node("span", "sb-dy-auth-url", sessionToolbarLabel(session)));
  const screen = node("div", "sb-dy-auth-screen");
  windowEl.append(head, toolbar, screen);
  root.appendChild(windowEl);
  document.body.appendChild(root);

  let closed = false;
  let authorizationSnapshot = session;
  // Always resolve the product-owned viewer first; never mount the supplier page directly.
  let currentCloudViewUrl = embeddedViewerUrl(session);
  let releaseCloudView = () => {};
  let expandedCloudView = null;
  let cloudViewHost = null;
  let cloudViewAnchor = null;
  let cloudViewToggle = null;
  const setCloudViewExpanded = (expanded) => {
    const cloudView = expandedCloudView;
    screen.classList.toggle("sb-dy-auth-screen-expanded", Boolean(expanded && cloudView));
    if (!cloudView?.isConnected) {
      expandedCloudView = null;
      cloudViewHost = null;
      cloudViewAnchor = null;
      cloudViewToggle = null;
      screen.classList.remove("sb-dy-auth-screen-expanded");
      return;
    }
    cloudView.classList.toggle("is-expanded", expanded);
    if (expanded) {
      root.appendChild(cloudView);
    } else if (cloudViewHost?.isConnected) {
      cloudViewHost.insertBefore(cloudView, cloudViewAnchor?.isConnected ? cloudViewAnchor : null);
    }
    if (cloudViewToggle?.isConnected) {
      cloudViewToggle.textContent = expanded ? "⤢" : "⛶";
      cloudViewToggle.setAttribute("aria-label", expanded ? "还原云电脑" : "放大云电脑");
      cloudViewToggle.setAttribute("aria-expanded", String(expanded));
      cloudViewToggle.title = expanded ? "还原云电脑" : "放大云电脑";
    }
  };
  const toggleCloudViewExpanded = (event) => {
    event?.preventDefault();
    event?.stopPropagation();
    setCloudViewExpanded(!expandedCloudView?.classList.contains("is-expanded"));
  };
  const close = (reason = "cancelled") => {
    if (closed) return;
    closed = true;
    setCloudViewExpanded(false);
    releaseCloudView();
    document.removeEventListener("keydown", onKeyDown);
    root.remove();
    if (activeWindow?.root === root) activeWindow = null;
    if (reason !== "authorized" && reason !== "replaced") onCancelled?.({ reason });
  };
  const onKeyDown = (event) => {
    if (event.key === "Escape") close("escape");
  };
  document.addEventListener("keydown", onKeyDown);
  closeButton.addEventListener("click", () => close("closed"));
  root.addEventListener("mousedown", (event) => { if (event.target === root) close("outside"); });

  const header = (kicker, title, copy) => {
    const main = node("main", "sb-dy-auth-main");
    main.append(node("div", "sb-dy-auth-kicker", kicker), node("h1", "sb-dy-auth-heading", title), node("p", "sb-dy-auth-copy", copy));
    return main;
  };
  const accountCard = () => {
    const accountCard = node("div", "sb-dy-auth-account");
    accountCard.append(node("div", "sb-dy-auth-mark", "抖"));
    const accountMain = node("div", "sb-dy-auth-account-main");
    accountMain.append(node("strong", null, "抖音账号"), node("span", null, account || "等待识别抖音账号"));
    accountCard.appendChild(accountMain);
    return accountCard;
  };
  const actionButton = (label, handler, primary = false) => {
    const button = node("button", `sb-dy-auth-btn${primary ? " sb-primary" : ""}`, label);
    button.type = "button";
    button.addEventListener("click", handler);
    return button;
  };
  const brand = (label) => {
    const item = node("div", "sb-dy-auth-brand");
    item.append(node("strong", null, "抖音"), node("span", null, label));
    return item;
  };

  function renderLogin() {
    screen.replaceChildren(brand("账号安全中心"));
    screen.appendChild(stepper(0));
    const main = header("真实云电脑", "在云电脑内完成抖音登录", "Byering 已为当前抖音账号启动独立云电脑。请在下方云电脑屏幕中扫码或登录，登录态只保存在该账号的云电脑内。");
    main.appendChild(accountCard());
    const cloudViewUrl = currentCloudViewUrl;
    if (cloudViewUrl) {
      const cloudView = node("div", "sb-dy-auth-cloudview");
      const iframe = document.createElement("iframe");
      iframe.src = cloudViewUrl;
      iframe.title = "抖音云电脑登录窗口";
      iframe.allow = "clipboard-read; clipboard-write";
      cloudView.appendChild(iframe);
      const expandButton = node("button", "sb-dy-auth-cloudview-toggle", "⛶");
      expandButton.type = "button";
      expandButton.setAttribute("aria-label", "放大云电脑");
      expandButton.setAttribute("aria-expanded", "false");
      expandButton.title = "放大云电脑";
      expandButton.addEventListener("click", toggleCloudViewExpanded);
      cloudView.appendChild(expandButton);
      cloudView.addEventListener("dblclick", (event) => {
        if (event.target.closest?.("button,a")) return;
        toggleCloudViewExpanded(event);
      });
      // Best effort for viewers that expose pointer events on the iframe element.
      iframe.addEventListener("dblclick", toggleCloudViewExpanded);
      expandedCloudView = cloudView;
      cloudViewHost = main;
      cloudViewAnchor = document.createComment("sb-dy-auth-cloudview-anchor");
      main.appendChild(cloudViewAnchor);
      releaseCloudView = () => {
        setCloudViewExpanded(false);
        if (iframe.isConnected) {
          iframe.src = "about:blank";
          iframe.remove();
        }
        if (expandedCloudView === cloudView) {
          expandedCloudView = null;
          cloudViewHost = null;
          cloudViewAnchor = null;
          cloudViewToggle = null;
        }
      };
      cloudViewToggle = expandButton;
      const fallback = node("div", "sb-dy-auth-cloudview-fallback");
      fallback.append(node("span", null, "二维码登录页会在云电脑内打开。请直接在上方画面扫码登录，并保持在同一台云电脑内完成授权。"));
      const actions = node("div", "sb-dy-auth-cloudview-actions");
      if (typeof refreshCloudView === "function") {
        const reconnect = node("button", "sb-dy-auth-cloudview-button", "重新连接画面");
        reconnect.type = "button";
        reconnect.addEventListener("click", async () => {
          reconnect.disabled = true;
          reconnect.textContent = "正在重新连接…";
          try {
            const refreshed = await refreshCloudView();
            const refreshedSession = typeof refreshed === "string"
              ? { ...session, cloudViewUrl: refreshed }
              : { ...session, ...refreshed };
            const nextUrl = embeddedViewerUrl(refreshedSession);
            if (!nextUrl) throw new Error("云电脑没有返回新的画面链接");
            currentCloudViewUrl = nextUrl;
            iframe.src = nextUrl;
          } catch (error) {
            reconnect.textContent = error?.message || "重新连接失败";
          } finally {
            if (reconnect.isConnected) {
              reconnect.disabled = false;
              if (reconnect.textContent === "正在重新连接…") reconnect.textContent = "重新连接画面";
            }
          }
        });
        actions.appendChild(reconnect);
      }
      fallback.appendChild(actions);
      cloudView.appendChild(fallback);
      main.appendChild(cloudView);
    }
    const loginBox = node("div", "sb-dy-auth-loginbox");
    const row = node("div", "sb-dy-auth-loginrow");
    const status = node("span", "sb-dy-auth-status");
    const workerOnline = session?.worker?.online;
    const initialStatus = workerOnline === false ? "云端 RPA Worker 尚未上线" : "等待抖音登录";
    status.append(node("i"), node("span", null, initialStatus));
    row.append(node("strong", null, "浏览器状态"), status);
    loginBox.appendChild(row);
    const notice = node("div", "sb-dy-auth-notice");
    notice.append(document.createTextNode("首次提供该账号的云电脑通常需要 2-3 分钟。登录完成后点击“检查登录状态”。只有 MCP 从云电脑检测到真实抖音会话，"), node("strong", null, "才会允许继续任务"), document.createTextNode("。如果云端 RPA Worker 尚未上线，请保持页面打开并稍后重新检查，不要改用本地浏览器。"));
    loginBox.appendChild(notice);
    main.appendChild(loginBox);
    const actions = node("div", "sb-dy-auth-actions");
    actions.appendChild(actionButton("取消", () => close("cancelled")));
    const check = actionButton("检查登录状态", async () => {
      check.disabled = true;
      check.textContent = "正在检查…";
      status.querySelector("span:last-child").textContent = "正在检查真实会话";
      try {
        if (typeof checkAuthorization !== "function") throw new Error("真实浏览器工作区未接入");
        const result = await checkAuthorization();
        if (result?.state !== "READY") throw new Error("尚未检测到抖音登录状态");
        authorizationSnapshot = result;
        releaseCloudView();
        status.querySelector("span:last-child").textContent = "已检测到真实登录";
        renderPermission();
      } catch (error) {
        status.querySelector("span:last-child").textContent = "尚未检测到登录";
        notice.replaceChildren(document.createTextNode(error?.message || "请先在当前授权窗口里的云电脑完成登录，再重新检查。"));
        check.disabled = false;
        check.textContent = "重新检查登录状态";
      }
    }, true);
    actions.appendChild(check);
    main.appendChild(actions);
    screen.appendChild(main);
  }

  function renderPermission() {
    setCloudViewExpanded(false);
    releaseCloudView();
    screen.replaceChildren(brand("授权管理"));
    screen.appendChild(stepper(1));
    const main = header("授权请求", "确认 Byering 的访问范围", "真实登录态已由 Douyin MCP 从云电脑核验。请核对本次任务需要使用的数据和动作，未在下面列出的内容不会进入任务上下文。");
    main.appendChild(accountCard());
    const list = node("ul", "sb-dy-auth-scope-list");
    scopes.forEach((scope) => list.appendChild(node("li", null, scope)));
    main.appendChild(list);
    const boundary = node("div", "sb-dy-auth-boundary");
    boundary.append(node("strong", null, "权限边界"), node("span", null, "只读取已授权账号的数据；私信发送仍需在 Byering 内逐次确认。你可以随时在设置中撤销授权。"));
    main.appendChild(boundary);
    const actions = node("div", "sb-dy-auth-actions");
    actions.appendChild(actionButton("拒绝并关闭", () => close("denied")));
    const confirm = actionButton("确认授权", async () => {
      confirm.disabled = true;
      confirm.textContent = "正在再次核验…";
      try {
        if (typeof checkAuthorization !== "function") throw new Error("真实浏览器工作区未接入");
        const result = await checkAuthorization();
        if (result?.state !== "READY") throw new Error("抖音登录态已失效，请回到当前授权窗口里的云电脑重新登录");
        authorizationSnapshot = result;
        renderSuccess();
      } catch (error) {
        const notice = node("div", "sb-dy-auth-notice", error?.message || "账号状态发生变化，请重新检查登录状态");
        main.insertBefore(notice, actions);
        confirm.disabled = false;
        confirm.textContent = "重新核验并确认";
      }
    }, true);
    actions.appendChild(confirm);
    main.appendChild(actions);
    screen.appendChild(main);
  }

  function renderSuccess() {
    setCloudViewExpanded(false);
    releaseCloudView();
    screen.replaceChildren(brand("授权管理"));
    screen.appendChild(stepper(2));
    const main = header("授权完成", "账号已安全连接", "登录态已核验，云电脑通道已绑定本次任务。任务尚未开始，返回后还需要确认本次任务的最小访问范围。");
    main.classList.add("sb-dy-auth-success");
    main.insertBefore(node("div", "sb-dy-auth-check", "✓"), main.firstChild);
    main.appendChild(accountCard());
    const actions = node("div", "sb-dy-auth-actions");
    actions.appendChild(actionButton("返回 Byering", () => {
      if (closed) return;
      closed = true;
      document.removeEventListener("keydown", onKeyDown);
      root.remove();
      if (activeWindow?.root === root) activeWindow = null;
      onAuthorized?.({ session: authorizationSnapshot });
    }, true));
    main.appendChild(actions);
    screen.appendChild(main);
  }

  activeWindow = { root, close };
  renderLogin();
  return { close: () => close("closed") };
}
