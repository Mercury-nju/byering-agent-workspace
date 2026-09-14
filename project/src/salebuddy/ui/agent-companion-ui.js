import X from "../../../node_modules/lucide/dist/esm/icons/x.mjs";
import Pencil from "../../../node_modules/lucide/dist/esm/icons/pencil.mjs";
import Trash from "../../../node_modules/lucide/dist/esm/icons/trash.mjs";
import defaultAttributes from "../../../node_modules/lucide/dist/esm/defaultAttributes.mjs";

const styles = new WeakMap();
const statuses = new WeakMap();
const dialogs = new WeakMap();
let sequence = 0;

const CSS = `
.sb-companion{font-family:-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;font-size:14px;line-height:1.55;letter-spacing:0;color:#282d30;overflow-wrap:anywhere}
.sb-companion,.sb-companion *{box-sizing:border-box;letter-spacing:0}
.sb-companion [hidden]{display:none!important}
.sb-companion button,.sb-companion input,.sb-companion textarea{font:inherit;color:inherit}
.sb-companion button{cursor:pointer;white-space:normal;overflow-wrap:anywhere;max-width:100%}
.sb-companion button:disabled{cursor:default;opacity:.5}
.sb-companion :focus-visible{outline:2px solid #28685a;outline-offset:3px}
.sb-companion-status{display:flex;align-items:center;flex-wrap:wrap;gap:8px;min-height:28px;color:#626b70;animation:sb-companion-status-in .22s ease-out both}
.sb-companion-dots{display:inline-flex;align-items:center;gap:4px;width:28px;height:20px;flex:none}
.sb-companion-dot{display:block;width:5px;height:5px;border-radius:50%;background:currentColor;animation:sb-companion-typing 1.2s ease-in-out infinite}
.sb-companion-dot:nth-child(2){animation-delay:.16s}
.sb-companion-dot:nth-child(3){animation-delay:.32s}
@keyframes sb-companion-typing{0%,60%,100%{transform:translateY(0);opacity:.4}30%{transform:translateY(-3px);opacity:1}}
@media(prefers-reduced-motion:reduce){.sb-companion-dot{animation:none;transform:none;opacity:.65}}
.sb-companion-command{border:1px solid #d7ddda;border-radius:6px;min-height:36px;padding:6px 12px;background:#fff}
.sb-companion-command:hover:not(:disabled){background:#f3f6f4;border-color:#889c91}
.sb-companion-primary{background:#292e34;color:#fff!important;border-color:#292e34}
.sb-companion-primary:hover:not(:disabled){background:#424951}
.sb-companion-danger{color:#9c343c!important}
.sb-companion-error{color:#9c343c;margin:8px 0 0;font-size:13px}
.sb-companion-error:empty{display:none}
.sb-companion-cards{display:grid;gap:10px;margin-top:10px;width:100%;min-width:0}
.sb-companion-memory-update{display:flex;align-items:center;gap:8px;font-size:11px;color:#7a858e;margin-top:8px}.sb-companion-memory-update button{border:0;background:transparent;text-decoration:underline;padding:2px;color:inherit;font-size:11px}
.sb-companion-arrive{animation:sb-companion-arrive .18s ease-out both}
.sb-companion-completed{display:inline-flex;align-items:center;gap:5px;color:#536a5b;font-size:11px;margin-top:6px}
@keyframes sb-companion-arrive{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}
@keyframes sb-companion-status-in{from{opacity:0;transform:translateY(3px)}to{opacity:1;transform:translateY(0)}}
@media(prefers-reduced-motion:reduce){.sb-companion-arrive,.sb-companion-status{animation:none}}
.sb-companion-card{margin:0;min-width:0;padding:12px 14px;border:1px solid #dce2de;border-radius:8px;background:#fff}
.sb-companion-card legend{padding:0 4px;font-weight:600;font-size:14px;max-width:100%}
.sb-companion-card p{margin:0 0 10px;color:#646c70;font-size:13px;white-space:pre-wrap}
.sb-companion-actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.sb-companion-card [aria-pressed="true"]{background:#eef2f6;border-color:#77899b;color:#304354}
.sb-companion-overlay{position:fixed;inset:0;z-index:12000;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(20,26,23,.32)}
.sb-companion-dialog{width:560px;max-width:100%;max-height:calc(100dvh - 40px);display:flex;flex-direction:column;background:#fff;border:1px solid #dce2de;border-radius:8px;box-shadow:0 16px 60px rgba(20,26,23,.18);min-width:0}
.sb-companion-header{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:18px 22px;border-bottom:1px solid #e5e9e6;flex:none}
.sb-companion-header h2{font-size:18px;line-height:1.4;margin:0;font-weight:650;min-width:0}
.sb-companion-icon{display:inline-flex;align-items:center;justify-content:center;width:36px;height:36px;padding:8px;flex:none;background:transparent;border:0;border-radius:6px;position:relative}
.sb-companion-icon:hover{background:#f0f3f1}
.sb-companion-icon svg{width:18px;height:18px;flex:none}
.sb-companion-tooltip{position:absolute;right:0;bottom:100%;width:max-content;max-width:220px;padding:4px 8px;background:#282d30;color:#fff;border-radius:4px;font-size:12px;line-height:1.5;visibility:hidden;pointer-events:none;z-index:1}
.sb-companion-icon:hover .sb-companion-tooltip,.sb-companion-icon:focus-visible .sb-companion-tooltip{visibility:visible}
.sb-companion-body{padding:0 22px 20px;overflow-y:auto;overscroll-behavior:contain;min-height:0}
.sb-companion-body>section{padding:18px 0;border-bottom:1px solid #e5e9e6}
.sb-companion-body>section:last-child{border-bottom:0}
.sb-companion-body h3{font-size:14px;font-weight:650;margin:0 0 12px}
.sb-companion-persona{margin:18px 0;color:#646c70;white-space:pre-wrap}
.sb-companion-persona strong{display:block;color:#282d30;margin-bottom:4px}
.sb-companion-options{border:0;margin:12px 0 0;padding:0;min-width:0}
.sb-companion-options legend{font-size:12px;color:#646c70;margin-bottom:8px;padding:0}
.sb-companion-segment{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}
.sb-companion-choice{display:flex;align-items:center;gap:7px;min-width:0;min-height:40px;padding:7px 8px;border:1px solid #dce2de;border-radius:6px;cursor:pointer;font-size:13px}
.sb-companion-choice:has(input:checked){background:#eef2f6;border-color:#77899b}
.sb-companion-choice input,.sb-companion-toggle input{accent-color:#28614f;appearance:auto;width:16px;height:16px;min-height:0;margin:0;flex:none}
.sb-companion-toggle{display:flex;align-items:center;gap:10px;cursor:pointer}
.sb-companion-memories{list-style:none;margin:0 0 14px;padding:0}
.sb-companion-memory{padding:12px 0;border-top:1px solid #e5e9e6}
.sb-companion-memory:first-child{border-top:0;padding-top:0}
.sb-companion-memory-line{display:flex;align-items:flex-start;gap:8px}
.sb-companion-memory-copy{flex:1;min-width:0;white-space:pre-wrap}
.sb-companion-memory-copy p{margin:0}
.sb-companion-source{display:block;color:#6d7675;font-size:12px;margin-top:5px}
.sb-companion-memory textarea{display:block;width:100%;resize:vertical;min-height:80px;border:1px solid #b9c8bf;border-radius:6px;padding:10px;margin:0 0 10px;background:#fff}
.sb-companion-empty{color:#6d7675;font-size:13px;margin:0 0 14px}
.sb-companion-footer{border-top:1px solid #e5e9e6;padding:12px 22px;flex:none}
.sb-companion-footer:has(.sb-companion-error:empty){border-top:0;padding-top:0;padding-bottom:0}
.sb-companion-footer .sb-companion-actions{margin:8px 0 0}
.sb-companion-confirm{padding-top:10px}
.sb-companion-confirm p{font-size:13px;margin:0 0 8px}
@media(max-width:480px){.sb-companion-overlay{padding:12px}.sb-companion-dialog{max-height:calc(100dvh - 24px)}.sb-companion-header{padding:14px 16px}.sb-companion-body{padding:0 16px 16px}.sb-companion-footer{padding:12px 16px}.sb-companion-segment{grid-template-columns:minmax(0,1fr)}}
`;

function node(doc, tag, className = "", text) {
  const element = doc.createElement(tag);
  element.className = className;
  if (text != null) element.textContent = String(text);
  return element;
}

function ensureStyles(doc) {
  if (styles.has(doc)) return;
  const style = node(doc, "style", "", CSS);
  doc.head.appendChild(style);
  styles.set(doc, style);
}

function command(doc, label, handler, className = "") {
  const button = node(doc, "button", `sb-companion-command ${className}`, label);
  button.type = "button";
  button.addEventListener("click", handler);
  return button;
}

// Render the existing Lucide node definitions with the host's document, including in tests.
function iconButton(doc, label, definition, handler, tooltip = label) {
  const button = command(doc, "", handler);
  button.className = "sb-companion-icon";
  button.setAttribute("aria-label", label);
  button.title = tooltip;
  const svg = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
  for (const [key, value] of Object.entries(defaultAttributes)) svg.setAttribute(key, value);
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  for (const [tag, attributes] of definition) {
    const part = doc.createElementNS("http://www.w3.org/2000/svg", tag);
    for (const [key, value] of Object.entries(attributes)) part.setAttribute(key, value);
    svg.appendChild(part);
  }
  const hint = node(doc, "span", "sb-companion-tooltip", tooltip);
  hint.setAttribute("aria-hidden", "true");
  button.append(svg, hint);
  return button;
}

function assertSuccess(result) {
  if (result?.ok === false || result?.error) {
    const error = new Error("Companion request failed");
    error.status = result.status ?? result.error?.status;
    throw error;
  }
  return result;
}

/** Mount one phase per host without replacing unrelated children. Returns idempotent cleanup. */
export function mountCompanionStatus(host, { phase = "ready", onRetry } = {}) {
  statuses.get(host)?.();
  const doc = host.ownerDocument || globalThis.document;
  ensureStyles(doc);
  let active = true;
  let busy = false;
  const root = node(doc, "div", "sb-companion sb-companion-status");
  const cleanup = () => {
    active = false;
    root.remove();
    if (statuses.get(host) === cleanup) statuses.delete(host);
  };
  statuses.set(host, cleanup);
  const labels = { thinking: "想一想…", queued: "等前一句聊完", failed: "这次没能回复" };
  if (!Object.hasOwn(labels, phase)) return cleanup;
  root.setAttribute("role", "status");
  root.setAttribute("aria-live", "polite");
  root.setAttribute("aria-atomic", "true");
  if (phase === "thinking") {
    const dots = node(doc, "span", "sb-companion-dots");
    dots.setAttribute("aria-hidden", "true");
    for (let i = 0; i < 3; i += 1) dots.appendChild(node(doc, "span", "sb-companion-dot"));
    root.appendChild(dots);
  }
  root.appendChild(node(doc, "span", "", labels[phase]));
  if (phase === "failed" && typeof onRetry === "function") {
    const error = node(doc, "span", "sb-companion-error");
    const retry = command(doc, "重试", async () => {
      if (!active || busy) return;
      busy = true; retry.disabled = true; error.textContent = "";
      root.setAttribute("aria-busy", "true");
      try { assertSuccess(await onRetry()); }
      catch { if (active) error.textContent = "还是没能回复，再试一次吧。"; }
      finally {
        if (active) { busy = false; retry.disabled = false; root.setAttribute("aria-busy", "false"); }
      }
    });
    root.append(retry, error);
  }
  host.appendChild(root);
  return cleanup;
}

/** Render only supplied companion cards. onAction may return a promise; cleanup ignores late results. */
export function appendCompanionCards(parent, message, { onAction } = {}) {
  const cards = message?.metadata?.companion?.cards;
  if (message?.metadata?.source === "agent-activity" && message.metadata.activityType === "completed") {
    const doc = parent.ownerDocument || globalThis.document; ensureStyles(doc);
    const completed = node(doc, "span", "sb-companion-completed", "已完成"); parent.appendChild(completed);
    return () => completed.remove();
  }
  const memoryUpdate = message?.metadata?.companion?.memoryUpdate;
  const forgotten = message?.metadata?.companion?.memoryForgotten;
  if ((!Array.isArray(cards) || !cards.length) && !memoryUpdate && !forgotten) return () => {};
  const doc = parent.ownerDocument || globalThis.document;
  const root = node(doc, "div", "sb-companion sb-companion-cards");
  let active = true;
  if (forgotten) root.appendChild(node(doc, "div", "sb-companion-memory-update", "相关记忆已忘记"));
  if (memoryUpdate) {
    const notice = node(doc, "div", "sb-companion-memory-update");
    const label = node(doc, "span", "", memoryUpdate.undone ? "这次记忆已撤销" : "记忆已更新"); notice.appendChild(label);
    if (!memoryUpdate.undone) {
      const undo = command(doc, "撤销", async () => {
        undo.disabled = true;
        try { assertSuccess(await onAction({ messageId: message.id, optionId: "undo-memory" })); if (active) { label.textContent = "这次记忆已撤销"; undo.remove(); } }
        catch { if (active) { label.textContent = "记忆已有变化，可以到相处方式中调整"; undo.disabled = false; } }
      }); undo.disabled = typeof onAction !== "function"; notice.appendChild(undo);
    }
    root.appendChild(notice);
  }
  for (const card of cards || []) {
    if (!card || !["memory", "navigate"].includes(card.kind) || card.id == null || typeof card.title !== "string") continue;
    const options = Array.isArray(card.options) ? card.options.filter(option => option?.id != null && typeof option.label === "string") : [];
    if (!options.length) continue;
    const fieldset = node(doc, "fieldset", "sb-companion-card");
    fieldset.setAttribute("data-kind", card.kind);
    fieldset.setAttribute("aria-busy", "false");
    fieldset.appendChild(node(doc, "legend", "", card.title));
    if (typeof card.detail === "string") fieldset.appendChild(node(doc, "p", "", card.detail));
    const actions = node(doc, "div", "sb-companion-actions");
    const error = node(doc, "div", "sb-companion-error"); error.setAttribute("role", "alert");
    const buttons = [];
    let busy = false;
    let selected = card.selected || null;
    for (const option of options) {
      const choice = command(doc, option.label, async () => {
        if (!active || busy || selected || typeof onAction !== "function") return;
        busy = true; error.textContent = "";
        buttons.forEach(button => { button.disabled = true; });
        fieldset.setAttribute("aria-busy", "true");
        try {
          assertSuccess(await onAction({ cardId: card.id, optionId: option.id, messageId: message.id }));
          if (card.kind === "memory") selected = option.id;
          if (active) buttons.forEach(button => button.setAttribute("aria-pressed", String(button === choice)));
        } catch {
          if (active) error.textContent = "这次没能完成，请再选一次。";
        } finally {
          if (active) {
            busy = false; buttons.forEach(button => { button.disabled = Boolean(selected); });
            fieldset.setAttribute("aria-busy", "false");
          }
        }
      });
      choice.setAttribute("aria-pressed", String(selected === option.id));
      choice.disabled = typeof onAction !== "function" || Boolean(selected);
      buttons.push(choice); actions.appendChild(choice);
    }
    fieldset.append(actions, error); root.appendChild(fieldset);
  }
  if (root.children.length) { ensureStyles(doc); parent.appendChild(root); }
  return () => { active = false; root.remove(); };
}

const tones = [["warm", "温暖一点"], ["direct", "直接一点"], ["calm", "平静一点"]];
const details = [["brief", "简单说"], ["balanced", "长短适中"], ["thorough", "详细聊"]];

function snapshot(response) {
  const data = assertSuccess(response);
  const validRevision = typeof data?.revision === "string" ? data.revision.length > 0 : Number.isFinite(data?.revision) && data.revision >= 0;
  const validSharedRevision = data?.sharedRevision === undefined
    || (Number.isFinite(data?.sharedRevision) && data.sharedRevision >= 0);
  if (!validRevision || !tones.some(([value]) => value === data?.settings?.tone)
    || !details.some(([value]) => value === data?.settings?.detail) || typeof data?.settings?.remember !== "boolean"
    || !validSharedRevision || !Array.isArray(data?.memories) || data.memories.some(memory => memory?.id == null || typeof memory.text !== "string")) {
    throw new Error("Invalid companion response");
  }
  return data;
}

/**
 * request(method, path, body?) resolves parsed JSON and rejects HTTP failures.
 * Mutations are serialized and followed by GET; only server data changes the memory list.
 * Optional document injection supports isolated hosts/tests. Returns { element, ready, close }.
 */
export function openCompanionPreferences({ agentId, request, document: doc = globalThis.document } = {}) {
  if (agentId == null || String(agentId).trim() === "" || typeof request !== "function") throw new TypeError("agentId and request are required");
  if (!doc?.body || !doc?.head) throw new TypeError("A document with head and body is required");
  dialogs.get(doc)?.close();
  ensureStyles(doc);
  const path = `/v1/agents/companion?agentId=${encodeURIComponent(agentId)}`;
  const id = `sb-companion-${++sequence}`;
  const opener = doc.activeElement;
  const overflow = doc.body.style.overflow;
  const siblings = [...doc.body.children].map(element => ({ element, inert: element.inert }));
  const overlay = node(doc, "div", "sb-companion sb-companion-overlay");
  const element = node(doc, "div", "sb-companion-dialog");
  element.setAttribute("role", "dialog"); element.setAttribute("aria-modal", "true");
  element.setAttribute("aria-labelledby", `${id}-title`); element.setAttribute("tabindex", "-1");
  const header = node(doc, "header", "sb-companion-header");
  const title = node(doc, "h2", "", "相处方式"); title.setAttribute("id", `${id}-title`);
  const closeButton = iconButton(doc, "关闭相处方式", X, close, "关闭");
  header.append(title, closeButton);
  const content = node(doc, "div", "sb-companion-body");
  const footer = node(doc, "div", "sb-companion-footer");
  const error = node(doc, "p", "sb-companion-error"); error.setAttribute("role", "alert");
  const recovery = node(doc, "div", "sb-companion-actions");
  const retry = command(doc, "重试", () => { if (!busy) void load(); });
  const reload = command(doc, "重新加载", () => { if (!busy) void load(); });
  retry.hidden = true; reload.hidden = true;
  recovery.append(retry, reload); footer.append(error, recovery);
  element.append(header, content, footer); overlay.appendChild(element);
  let closed = false, busy = false, stale = false, state = null, draft = null, editing = null, confirmingReset = false;
  let controls = [];

  function track(control, key, disabled = false) {
    control.setAttribute("data-companion-focus", key);
    controls.push({ control, disabled });
    control.disabled = disabled || busy || stale;
    return control;
  }

  function setBusy(value) {
    busy = value;
    content.setAttribute("aria-busy", String(value));
    controls.forEach(({ control, disabled }) => { control.disabled = value || stale || disabled; });
    retry.disabled = value; reload.disabled = value;
  }

  function clearError() { error.textContent = ""; retry.hidden = true; reload.hidden = true; }

  function focusKey(key) {
    const target = controls.find(({ control }) => control.getAttribute("data-companion-focus") === key && !control.disabled)?.control;
    (target || closeButton).focus();
  }

  function radioGroup(key, label, options) {
    const group = node(doc, "fieldset", "sb-companion-options");
    group.appendChild(node(doc, "legend", "", label));
    const row = node(doc, "div", "sb-companion-segment");
    const inputs = [];
    for (const [value, text] of options) {
      const choice = node(doc, "label", "sb-companion-choice");
      const input = track(node(doc, "input"), `${key}-${value}`);
      input.type = "radio"; input.name = `${id}-${key}`; input.value = value; input.checked = draft[key] === value;
      input.setAttribute("aria-label", text);
      input.addEventListener("change", () => {
        if (closed || busy || stale || !input.checked) return;
        draft[key] = value;
        inputs.forEach(other => { other.checked = other.value === value; });
      });
      inputs.push(input); choice.append(input, node(doc, "span", "", text)); row.appendChild(choice);
    }
    group.appendChild(row); return group;
  }

  function section(titleText) {
    const section = node(doc, "section");
    section.appendChild(node(doc, "h3", "", titleText)); content.appendChild(section); return section;
  }

  function render() {
    controls = []; content.replaceChildren();
    if (state.persona?.name || state.persona?.description) {
      const persona = node(doc, "p", "sb-companion-persona");
      if (state.persona.name) persona.appendChild(node(doc, "strong", "", state.persona.name));
      if (state.persona.description) persona.appendChild(node(doc, "span", "", state.persona.description));
      content.appendChild(persona);
    }
    const speech = section("怎么和我说话");
    speech.append(radioGroup("tone", "语气", tones), radioGroup("detail", "长短", details));
    if (state.settings.ranking && ["mkt-douyin-finder", "mkt-find-people", "mkt-user-research"].includes(agentId)) {
      speech.appendChild(radioGroup("ranking", "同样合适的人，先看谁", [["relevance", "保持原顺序"], ["recent", "最近发作品的"], ["active", "最近常更新的"]]));
    }
    const habits = section("记住我的习惯");
    const label = node(doc, "label", "sb-companion-toggle");
    const remember = track(node(doc, "input"), "remember"); remember.type = "checkbox"; remember.checked = draft.remember;
    remember.setAttribute("aria-label", "记住我的习惯");
    remember.addEventListener("change", () => { if (!closed && !busy && !stale) draft.remember = remember.checked; });
    label.append(remember, node(doc, "span", "", "记住我的习惯")); habits.appendChild(label);
    const saved = section("你对我的了解");
    if (!state.memories.length) saved.appendChild(node(doc, "p", "sb-companion-empty", "还没有记下什么。"));
    const list = node(doc, "ul", "sb-companion-memories");
    for (const memory of state.memories) {
      const row = node(doc, "li", "sb-companion-memory");
      if (editing?.id === memory.id) {
        const input = track(node(doc, "textarea"), `edit-${memory.id}`);
        input.rows = 3; input.value = editing.text; input.setAttribute("aria-label", "修改记住的事");
        input.addEventListener("input", () => { if (!closed && !busy && !stale) editing.text = input.value; });
        const actions = node(doc, "div", "sb-companion-actions");
        actions.append(
          track(command(doc, "保存修改", () => {
            const text = input.value.trim();
            if (!text) { error.textContent = "写点内容再保存吧。"; input.focus(); return; }
            void mutate("PATCH", path, {
              memoryId: memory.id,
              text,
              ...(memory.scope ? { scope: memory.scope } : {})
            }, `edit-button-${memory.id}`);
          }), `save-memory-${memory.id}`),
          track(command(doc, "取消", () => {
            if (closed || busy || stale) return;
            editing = null; clearError(); render(); focusKey(`edit-button-${memory.id}`);
          }), `cancel-memory-${memory.id}`)
        );
        row.append(input, actions);
      } else {
        const line = node(doc, "div", "sb-companion-memory-line");
        const copy = node(doc, "div", "sb-companion-memory-copy"); copy.appendChild(node(doc, "p", "", memory.text));
        const source = [memory.sourceLabel || memory.scopeLabel, memory.pinned ? "已固定" : ""].filter(Boolean).join(" · ");
        if (source) copy.appendChild(node(doc, "small", "sb-companion-source", source));
        const edit = track(iconButton(doc, `编辑：${memory.text}`, Pencil, () => {
          if (closed || busy || stale) return;
          editing = { id: memory.id, text: memory.text }; clearError(); render(); focusKey(`edit-${memory.id}`);
        }, "编辑"), `edit-button-${memory.id}`);
        const forget = track(iconButton(doc, `忘掉：${memory.text}`, Trash, () => {
          void mutate("DELETE", `${path}&memoryId=${encodeURIComponent(memory.id)}`, {}, "reset");
        }, "忘掉"), `forget-${memory.id}`);
        line.append(copy, edit, forget); row.appendChild(line);
        if (memory.scope !== "shared") {
          row.appendChild(track(command(doc, "共享给其他 Agent", () => {
            void mutate("PATCH", path, { memoryId: memory.id, scope: "shared" }, `share-memory-${memory.id}`);
          }), `share-memory-${memory.id}`));
        } else {
          row.appendChild(track(command(doc, "仅当前 Agent", () => {
            void mutate("PATCH", path, { memoryId: memory.id, scope: "agent" }, `private-memory-${memory.id}`);
          }), `private-memory-${memory.id}`));
        }
      }
      list.appendChild(row);
    }
    saved.appendChild(list);
    const reset = track(command(doc, "忘掉当前 Agent 记住的事", () => {
      if (closed || busy || stale) return;
      confirmingReset = true; render(); focusKey("confirm-reset");
    }, "sb-companion-danger"), "reset", !state.memories.some(memory => memory.scope !== "shared" && !memory.pinned));
    saved.appendChild(reset);
    if (confirmingReset) {
      const confirm = node(doc, "div", "sb-companion-confirm");
      confirm.appendChild(node(doc, "p", "", "忘掉当前 Agent 记住的事？共享给其他 Agent 的内容不会删除。"));
      const actions = node(doc, "div", "sb-companion-actions");
      actions.append(
        track(command(doc, "确认忘掉", () => { void mutate("DELETE", `${path}&reset=1`, {}, "reset"); }, "sb-companion-danger"), "confirm-reset"),
        track(command(doc, "先留着", () => { if (!closed && !busy && !stale) { confirmingReset = false; render(); focusKey("reset"); } }), "cancel-reset")
      );
      confirm.appendChild(actions); saved.appendChild(confirm);
    }
    const actions = node(doc, "div", "sb-companion-actions");
    actions.appendChild(track(command(doc, "保存", () => { void mutate("PUT", path, { settings: { ...draft } }, "save"); }, "sb-companion-primary"), "save"));
    content.appendChild(actions);
  }

  async function load() {
    if (closed || busy) return;
    clearError(); setBusy(true);
    if (!state) {
      const loading = node(doc, "p", "sb-companion-empty", "正在加载…");
      loading.setAttribute("role", "status"); content.replaceChildren(loading);
    }
    try {
      const next = snapshot(await request("GET", path));
      if (closed) return;
      state = next; draft = { ...next.settings }; editing = null; confirmingReset = false; stale = false;
      render();
    } catch {
      if (closed) return;
      stale = true;
      if (!state) content.replaceChildren();
      error.textContent = "这次没能加载，请再试一次。"; retry.hidden = false;
    } finally {
      if (!closed) {
        setBusy(false);
        if (!element.contains(doc.activeElement) || doc.activeElement?.disabled || doc.activeElement?.hidden) closeButton.focus();
      }
    }
  }

  async function mutate(method, url, payload, nextFocus) {
    if (closed || busy || stale || !state) return;
    clearError(); setBusy(true);
    let accepted = false;
    try {
      assertSuccess(await request(method, url, {
        ...payload,
        expectedRevision: state.revision,
        ...(Number.isFinite(state.sharedRevision) ? { expectedSharedRevision: state.sharedRevision } : {})
      }));
      accepted = true;
      if (closed) return;
      // A successful write need not return a snapshot. Re-read rather than inventing local state.
      const next = snapshot(await request("GET", path));
      if (closed) return;
      state = next;
      if (method === "PUT") draft = { ...next.settings };
      if (editing && ((method === "PATCH" && payload.memoryId === editing.id)
        || !next.memories.some(memory => memory.id === editing.id))) editing = null;
      confirmingReset = false; render();
    } catch (failure) {
      if (closed) return;
      const conflict = Number(failure?.status ?? failure?.statusCode ?? failure?.response?.status) === 409;
      stale = accepted || conflict;
      error.textContent = accepted ? "还没能确认最新内容，请重新加载。"
        : conflict ? "内容已有更新，请重新加载后再改。" : "这次没能保存，内容还在，请再试一次。";
      reload.hidden = !stale;
    } finally {
      if (!closed) {
        setBusy(false);
        if (stale) reload.focus();
        else if (!element.contains(doc.activeElement) || doc.activeElement?.disabled) focusKey(nextFocus);
      }
    }
  }

  function focusable() {
    return [...element.querySelectorAll("button, input, textarea, select, [tabindex]")].filter(control => {
      if (control.disabled || control.getAttribute("tabindex") === "-1") return false;
      for (let current = control; current && current !== element; current = current.parentNode) {
        if (current.hidden || current.inert) return false;
      }
      return true;
    });
  }

  function onKey(event) {
    if (event.key === "Escape") { event.preventDefault(); close(); return; }
    if (event.key !== "Tab") return;
    const targets = focusable();
    const first = targets[0] || element, last = targets.at(-1) || element;
    if (event.shiftKey && (doc.activeElement === first || !targets.includes(doc.activeElement))) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey && (doc.activeElement === last || !targets.includes(doc.activeElement))) {
      event.preventDefault(); first.focus();
    }
  }

  function onFocus(event) { if (!closed && !element.contains(event.target)) closeButton.focus(); }

  function close() {
    if (closed) return;
    closed = true;
    doc.removeEventListener("keydown", onKey, true); doc.removeEventListener("focusin", onFocus, true);
    overlay.remove();
    siblings.forEach(({ element, inert }) => { element.inert = inert; });
    doc.body.style.overflow = overflow;
    if (dialogs.get(doc)?.element === element) dialogs.delete(doc);
    if (opener?.isConnected) opener.focus();
  }

  siblings.forEach(({ element }) => { element.inert = true; });
  doc.body.style.overflow = "hidden";
  doc.body.appendChild(overlay);
  doc.addEventListener("keydown", onKey, true); doc.addEventListener("focusin", onFocus, true);
  closeButton.focus();
  const modal = { element, close, ready: load() };
  dialogs.set(doc, modal);
  return modal;
}
