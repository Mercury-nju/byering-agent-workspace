import { createAuthAdapter } from "./adapter.js";
import { createLoginMethodTabs } from "./LoginMethodTabs.js";

function field(documentRef, { label, type, name, placeholder, autocomplete, inputMode }) {
  const wrapper = documentRef.createElement("label");
  wrapper.className = "sb-auth-field";
  const caption = documentRef.createElement("span");
  caption.textContent = label;
  const input = documentRef.createElement("input");
  input.type = type;
  input.name = name;
  input.placeholder = placeholder;
  input.autocomplete = autocomplete;
  input.required = true;
  if (inputMode) input.inputMode = inputMode;
  wrapper.append(caption, input);
  return { wrapper, input };
}

export function createLoginPanel({
  documentRef = globalThis.document,
  adapter = createAuthAdapter(),
  onAuthenticated,
  simulate = true
} = {}) {
  const root = documentRef.createElement("section");
  root.className = "sb-auth-login-panel";
  const inner = documentRef.createElement("div");
  inner.className = "sb-auth-login-inner";

  const brand = documentRef.createElement("div");
  brand.className = "sb-auth-login-brand";
  const brandMark = documentRef.createElement("img");
  brandMark.src = new URL("../../../assets/byering-logo-mark.png", import.meta.url).href;
  brandMark.alt = "";
  const brandName = documentRef.createElement("span");
  brandName.textContent = "Byering";
  brand.append(brandMark, brandName);

  const title = documentRef.createElement("h1");
  title.textContent = "登录 / 注册";
  const subtitle = documentRef.createElement("p");
  subtitle.className = "sb-auth-login-subtitle";
  subtitle.textContent = "进入你的增长工作台";
  const entryNote = documentRef.createElement("p");
  entryNote.className = "sb-auth-entry-note";
  entryNote.textContent = "首次使用？验证后将自动创建账号";

  const form = documentRef.createElement("form");
  form.className = "sb-auth-form";
  form.noValidate = true;
  const formFields = documentRef.createElement("div");
  formFields.className = "sb-auth-form-fields";
  const status = documentRef.createElement("p");
  status.className = "sb-auth-form-status";
  status.setAttribute("role", "status");
  status.hidden = true;

  const agreement = documentRef.createElement("label");
  agreement.className = "sb-auth-agreement";
  const checkbox = documentRef.createElement("input");
  checkbox.type = "checkbox";
  checkbox.required = true;
  agreement.append(checkbox, documentRef.createTextNode("我已阅读并同意"));
  const agreementLink = documentRef.createElement("a");
  agreementLink.href = "#";
  agreementLink.textContent = "用户协议与隐私政策";
  agreementLink.addEventListener("click", (event) => event.preventDefault());
  agreement.append(agreementLink);

  const submit = documentRef.createElement("button");
  submit.type = "submit";
  submit.className = "sb-auth-submit";
  submit.textContent = "继续";

  let activeMethod = "phone";
  let phoneFields = null;
  let emailFields = null;

  function showStatus(message, tone = "info") {
    status.hidden = false;
    status.dataset.tone = tone;
    status.textContent = message;
  }

  function renderPhone() {
    const phone = field(documentRef, { label: "手机号", type: "tel", name: "phone", placeholder: "请输入手机号", autocomplete: "tel", inputMode: "numeric" });
    const code = field(documentRef, { label: "验证码", type: "text", name: "code", placeholder: "请输入验证码", autocomplete: "one-time-code", inputMode: "numeric" });
    const codeRow = documentRef.createElement("div");
    codeRow.className = "sb-auth-code-row";
    const codeButton = documentRef.createElement("button");
    codeButton.type = "button";
    codeButton.className = "sb-auth-code-button";
    codeButton.textContent = "获取验证码";
    let countdown = 0;
    let timer = null;
    codeButton.addEventListener("click", async () => {
      if (!phone.input.value.trim() || countdown > 0) return;
      codeButton.disabled = true;
      const result = await adapter.requestCode({ method: "phone", phone: phone.input.value.trim() });
      if (result?.status === "ok") {
        countdown = 60;
        codeButton.textContent = `${countdown}s 后重发`;
        timer = setInterval(() => {
          countdown -= 1;
          codeButton.textContent = countdown > 0 ? `${countdown}s 后重发` : "获取验证码";
          if (!countdown) { clearInterval(timer); timer = null; codeButton.disabled = false; }
        }, 1000);
      } else {
        codeButton.disabled = false;
        showStatus("验证码服务暂未连接，请使用客户端认证入口。", "info");
      }
    });
    codeRow.append(code.input, codeButton);
    code.wrapper.appendChild(codeRow);
    phoneFields = { phone, code, getTimer: () => timer };
    formFields.replaceChildren(phone.wrapper, code.wrapper);
  }

  function renderEmail() {
    const email = field(documentRef, { label: "邮箱", type: "email", name: "email", placeholder: "请输入邮箱地址", autocomplete: "email" });
    const password = field(documentRef, { label: "密码", type: "password", name: "password", placeholder: "请输入密码", autocomplete: "current-password" });
    emailFields = { email, password };
    formFields.replaceChildren(email.wrapper, password.wrapper);
  }

  function switchMethod(method) {
    activeMethod = method;
    if (method === "phone") renderPhone();
    else renderEmail();
    status.hidden = true;
  }

  async function submitPayload() {
    if (simulate) {
      onAuthenticated?.({ status: "ok", simulated: true });
      return;
    }
    if (!checkbox.checked) {
      showStatus("请先同意用户协议与隐私政策。", "warning");
      return;
    }
    if (!form.reportValidity()) return;
    submit.disabled = true;
    submit.textContent = "连接中…";
    const payload = activeMethod === "phone"
      ? { method: "phone", phone: phoneFields.phone.input.value.trim(), code: phoneFields.code.input.value.trim() }
      : { method: "email", email: emailFields.email.input.value.trim(), password: emailFields.password.input.value };
    const result = await adapter.login(payload);
    submit.disabled = false;
    submit.textContent = "继续";
    if (result?.status === "ok") onAuthenticated?.(result);
    else if (result?.status === "native_opened") showStatus("正在打开客户端认证…", "info");
    else showStatus("认证服务尚未连接，请在客户端中完成登录。", "info");
  }

  const tabs = createLoginMethodTabs({ documentRef, active: "phone", onChange: switchMethod });
  form.addEventListener("submit", (event) => { event.preventDefault(); submitPayload(); });

  renderPhone();
  form.append(formFields, status, agreement, submit);
  const footer = documentRef.createElement("p");
  footer.className = "sb-auth-footer-copy";
  footer.textContent = "Byering · 为线索而生，为转化而造";
  inner.append(brand, title, subtitle, entryNote, tabs.root, form, footer);
  root.appendChild(inner);

  return {
    root,
    destroy() {
      const timer = phoneFields?.getTimer?.();
      if (timer) clearInterval(timer);
      root.remove();
    }
  };
}
