/**
 * Simulated Douyin OAuth flow rendered inside a cloud-computer window.
 * The window is intentionally explicit: opening the page, signing in, reviewing
 * scopes, and returning to Byering are separate user-controlled transitions.
 */

const CSS = `
.sb-dy-auth-root{position:fixed;inset:0;z-index:9800;display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(31,35,41,.28);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);font-family:-apple-system,"PingFang SC","Microsoft YaHei",sans-serif}
.sb-dy-auth-window{width:min(760px,calc(100vw - 32px));height:min(620px,calc(100vh - 32px));display:flex;flex-direction:column;overflow:hidden;border:1px solid rgba(15,15,15,.12);border-radius:16px;background:#F4F6F8;box-shadow:0 28px 80px rgba(15,15,15,.28);animation:sb-dy-auth-in .22s ease-out both}
@keyframes sb-dy-auth-in{from{opacity:0;transform:translateY(10px) scale(.98)}to{opacity:1;transform:none}}
.sb-dy-auth-head{display:flex;align-items:center;gap:9px;height:44px;padding:0 14px;background:#1F2329;color:#D9DEE6;flex:none}
.sb-dy-auth-dots{display:flex;gap:5px}.sb-dy-auth-dots i{width:8px;height:8px;border-radius:50%;background:#D04D46}.sb-dy-auth-dots i:nth-child(2){background:#E8A33D}.sb-dy-auth-dots i:nth-child(3){background:#57B26A}
.sb-dy-auth-title{font-size:12px;font-weight:650}.sb-dy-auth-live{display:inline-flex;align-items:center;gap:5px;margin-left:auto;color:#8FDC9A;font-size:10px}.sb-dy-auth-live i{width:6px;height:6px;border-radius:50%;background:#57B26A;box-shadow:0 0 0 3px rgba(87,178,106,.14)}
.sb-dy-auth-close{margin-left:10px;border:0;background:transparent;color:#AEB6C2;font-size:19px;line-height:1;cursor:pointer;padding:2px 5px;border-radius:6px}.sb-dy-auth-close:hover{background:rgba(255,255,255,.1);color:#fff}
.sb-dy-auth-toolbar{display:flex;align-items:center;gap:8px;padding:8px 12px;border-bottom:1px solid rgba(15,15,15,.08);background:#fff;color:#8A8F99;font-size:10px;flex:none}.sb-dy-auth-nav{font-size:13px;color:#B0B4BB}.sb-dy-auth-url{flex:1;min-width:0;padding:6px 10px;border-radius:7px;background:#F2F4F6;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.sb-dy-auth-lock{color:#57B26A}
.sb-dy-auth-screen{flex:1;min-height:0;overflow:auto;background:#fff}.sb-dy-auth-page{min-height:100%;display:flex;flex-direction:column}
.sb-dy-auth-brand{display:flex;align-items:center;justify-content:space-between;padding:17px 28px;border-bottom:1px solid rgba(15,15,15,.06)}.sb-dy-auth-brand strong{font-size:20px;letter-spacing:.04em;color:#14171C}.sb-dy-auth-brand span{color:#8A8F99;font-size:11px}
.sb-dy-auth-progress{display:flex;align-items:center;justify-content:center;gap:0;padding:19px 28px 6px}.sb-dy-auth-step{display:flex;align-items:center;gap:6px;color:#A0A6AE;font-size:11px;white-space:nowrap}.sb-dy-auth-step i{display:grid;place-items:center;width:22px;height:22px;border-radius:50%;background:#EEF1F4;color:#8A8F99;font-style:normal;font-size:10px}.sb-dy-auth-step.sb-active{color:#1F2329;font-weight:650}.sb-dy-auth-step.sb-active i{background:#1F2329;color:#fff}.sb-dy-auth-step.sb-done{color:#2F7D3F}.sb-dy-auth-step.sb-done i{background:rgba(87,178,106,.14);color:#2F7D3F}.sb-dy-auth-line{width:58px;height:1px;margin:0 10px;background:#E4E7EA}
.sb-dy-auth-main{width:min(520px,calc(100% - 48px));margin:18px auto 30px}.sb-dy-auth-kicker{color:#7C848E;font-size:11px;letter-spacing:.08em}.sb-dy-auth-heading{margin:6px 0 0;color:#1F2329;font-size:24px;line-height:1.35}.sb-dy-auth-copy{margin:8px 0 20px;color:#707984;font-size:13px;line-height:1.7}
.sb-dy-auth-account{display:flex;align-items:center;gap:12px;padding:13px 14px;border:1px solid rgba(15,15,15,.09);border-radius:11px;background:#FAFBFC}.sb-dy-auth-mark{display:grid;place-items:center;width:38px;height:38px;border-radius:10px;background:#1F2329;color:#fff;font-size:18px;font-weight:700}.sb-dy-auth-account-main{min-width:0}.sb-dy-auth-account-main strong{display:block;color:#1F2329;font-size:13px}.sb-dy-auth-account-main span{display:block;margin-top:3px;color:#8A8F99;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sb-dy-auth-loginbox{margin-top:12px;padding:14px;border:1px solid rgba(15,15,15,.08);border-radius:11px;background:#fff}.sb-dy-auth-loginrow{display:flex;align-items:center;justify-content:space-between;gap:12px;color:#5A6472;font-size:12px}.sb-dy-auth-loginrow strong{color:#1F2329;font-size:12px}.sb-dy-auth-status{display:inline-flex;align-items:center;gap:5px;color:#B87A1E;font-size:11px}.sb-dy-auth-status i{width:6px;height:6px;border-radius:50%;background:currentColor}
.sb-dy-auth-notice{margin-top:13px;padding:11px 12px;border-radius:9px;background:#F5F8FF;color:#5C6B82;font-size:11px;line-height:1.65}.sb-dy-auth-notice strong{color:#3B6BD4}
.sb-dy-auth-actions{display:flex;justify-content:flex-end;gap:9px;margin-top:18px}.sb-dy-auth-btn{height:36px;padding:0 15px;border:1px solid rgba(15,15,15,.12);border-radius:8px;background:#fff;color:#5A5E66;font:inherit;font-size:12px;font-weight:600;cursor:pointer}.sb-dy-auth-btn:hover{background:#F5F6F8}.sb-dy-auth-btn.sb-primary{border-color:#1F2329;background:#1F2329;color:#fff}.sb-dy-auth-btn.sb-primary:hover{background:#3F434A}.sb-dy-auth-btn:disabled{opacity:.55;cursor:wait}
.sb-dy-auth-scope-list{display:grid;gap:8px;margin:16px 0 0;padding:0;list-style:none}.sb-dy-auth-scope-list li{display:flex;align-items:flex-start;gap:9px;color:#3F4752;font-size:12px;line-height:1.55}.sb-dy-auth-scope-list li::before{content:"✓";display:grid;place-items:center;width:17px;height:17px;flex:none;border-radius:50%;background:rgba(76,154,255,.12);color:#3B6BD4;font-weight:700}
.sb-dy-auth-boundary{display:grid;gap:6px;margin-top:15px;padding:12px;border:1px dashed rgba(76,154,255,.32);border-radius:9px;background:#FBFCFF;color:#6C7787;font-size:11px;line-height:1.55}.sb-dy-auth-boundary strong{color:#3B6BD4;font-size:11px}
.sb-dy-auth-success{display:flex;flex-direction:column;align-items:center;text-align:center;padding:36px 20px}.sb-dy-auth-check{display:grid;place-items:center;width:54px;height:54px;border-radius:50%;background:rgba(87,178,106,.14);color:#2F7D3F;font-size:27px}.sb-dy-auth-success .sb-dy-auth-heading{font-size:22px}.sb-dy-auth-success .sb-dy-auth-copy{max-width:390px;margin-bottom:0}
@media(max-width:640px){.sb-dy-auth-root{padding:12px}.sb-dy-auth-window{width:100%;height:100%;border-radius:12px}.sb-dy-auth-main{width:calc(100% - 32px)}.sb-dy-auth-brand{padding-left:18px;padding-right:18px}.sb-dy-auth-progress{padding-left:12px;padding-right:12px}.sb-dy-auth-line{width:22px;margin:0 6px}}
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

export function openDouyinAuthorization({ account, scopes = [], onAuthorized, onCancelled } = {}) {
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
  toolbar.append(node("span", "sb-dy-auth-lock", "⌑"), node("span", "sb-dy-auth-url", "https://www.douyin.com/login?source=byering"));
  const screen = node("div", "sb-dy-auth-screen");
  windowEl.append(head, toolbar, screen);
  root.appendChild(windowEl);
  document.body.appendChild(root);

  let closed = false;
  let timer = null;
  const close = (reason = "cancelled") => {
    if (closed) return;
    closed = true;
    if (timer) clearTimeout(timer);
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
    accountMain.append(node("strong", null, "抖音账号"), node("span", null, account || "Byering 汽车销售账号"));
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
    const main = header("账号登录", "登录抖音账号", "这是一个隔离的云电脑浏览器窗口。请先完成账号登录，Byering 不会读取浏览器密码。");
    main.appendChild(accountCard());
    const loginBox = node("div", "sb-dy-auth-loginbox");
    const row = node("div", "sb-dy-auth-loginrow");
    const status = node("span", "sb-dy-auth-status");
    status.append(node("i"), node("span", null, "等待确认"));
    row.append(node("strong", null, "登录方式"), status);
    loginBox.appendChild(row);
    const notice = node("div", "sb-dy-auth-notice");
    notice.append(document.createTextNode("请确认这是你要连接的业务账号。登录后还会单独展示权限范围，"), node("strong", null, "不会自动开始任务"), document.createTextNode("。"));
    loginBox.appendChild(notice);
    main.appendChild(loginBox);
    const actions = node("div", "sb-dy-auth-actions");
    actions.appendChild(actionButton("取消", () => close("cancelled")));
    const login = actionButton("确认登录并继续", () => {
      login.disabled = true;
      login.textContent = "正在校验登录…";
      timer = setTimeout(renderPermission, 900);
    }, true);
    actions.appendChild(login);
    main.appendChild(actions);
    screen.appendChild(main);
  }

  function renderPermission() {
    screen.replaceChildren(brand("授权管理"));
    screen.appendChild(stepper(1));
    const main = header("授权请求", "确认 Byering 的访问范围", "登录已完成。请核对本次任务需要使用的数据和动作，未在下面列出的内容不会进入任务上下文。");
    main.appendChild(accountCard());
    const list = node("ul", "sb-dy-auth-scope-list");
    scopes.forEach((scope) => list.appendChild(node("li", null, scope)));
    main.appendChild(list);
    const boundary = node("div", "sb-dy-auth-boundary");
    boundary.append(node("strong", null, "权限边界"), node("span", null, "只读取已授权账号的数据；私信发送仍需在 Byering 内逐次确认。你可以随时在设置中撤销授权。"));
    main.appendChild(boundary);
    const actions = node("div", "sb-dy-auth-actions");
    actions.appendChild(actionButton("拒绝并关闭", () => close("denied")));
    actions.appendChild(actionButton("确认授权", renderSuccess, true));
    main.appendChild(actions);
    screen.appendChild(main);
  }

  function renderSuccess() {
    screen.replaceChildren(brand("授权管理"));
    screen.appendChild(stepper(2));
    const main = header("授权完成", "账号已安全连接", "授权结果已写回 Byering，但任务尚未开始。返回后还需要确认本次任务的最小访问范围。");
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
      onAuthorized?.();
    }, true));
    main.appendChild(actions);
    screen.appendChild(main);
  }

  activeWindow = { root, close };
  renderLogin();
  return { close: () => close("closed") };
}
