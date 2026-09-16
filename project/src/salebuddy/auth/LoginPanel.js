import { createAuthAdapter } from "./adapter.js";

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

  let phoneFields = null;

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

    function updateCountdownLabel() {
      codeButton.textContent = `${countdown}s 后重发`;
      codeButton.style.setProperty("--sb-auth-countdown-progress", (countdown / 60).toFixed(3));
    }

    function resetCodeButton() {
      if (timer) clearInterval(timer);
      timer = null;
      countdown = 0;
      codeButton.disabled = false;
      codeButton.classList.remove("is-sending", "is-counting");
      codeButton.style.removeProperty("--sb-auth-countdown-progress");
      codeButton.textContent = "获取验证码";
    }

    codeButton.addEventListener("click", async () => {
      if (!phone.input.value.trim() || countdown > 0) return;
      codeButton.disabled = true;
      codeButton.classList.add("is-sending");
      codeButton.textContent = "发送中";
      let result = null;
      try {
        result = simulate
          ? await new Promise((resolve) => setTimeout(() => resolve({ status: "ok", simulated: true }), 420))
          : await adapter.requestCode({ method: "phone", phone: phone.input.value.trim() });
      } catch {
        result = null;
      }
      codeButton.classList.remove("is-sending");
      if (result?.status === "ok") {
        countdown = 60;
        codeButton.classList.add("is-counting");
        updateCountdownLabel();
        timer = setInterval(() => {
          countdown -= 1;
          if (countdown > 0) updateCountdownLabel();
          else resetCodeButton();
        }, 1000);
      } else {
        resetCodeButton();
        showStatus("验证码服务暂未连接，请使用客户端认证入口。", "info");
      }
    });
    codeRow.append(code.input, codeButton);
    code.wrapper.appendChild(codeRow);
    phoneFields = { phone, code, getTimer: () => timer };
    formFields.replaceChildren(phone.wrapper, code.wrapper);
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
    const payload = {
      method: "phone",
      phone: phoneFields.phone.input.value.trim(),
      code: phoneFields.code.input.value.trim()
    };
    const result = await adapter.login(payload);
    submit.disabled = false;
    submit.textContent = "继续";
    if (result?.status === "ok") onAuthenticated?.(result);
    else if (result?.status === "native_opened") showStatus("正在打开客户端认证…", "info");
    else showStatus("认证服务尚未连接，请在客户端中完成登录。", "info");
  }

  form.addEventListener("submit", (event) => { event.preventDefault(); submitPayload(); });

  renderPhone();
  form.append(formFields, status, agreement, submit);
  const footer = documentRef.createElement("p");
  footer.className = "sb-auth-footer-copy";
  footer.textContent = "Byering · 为线索而生，为转化而造";
  inner.append(brand, title, entryNote, form, footer);
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
