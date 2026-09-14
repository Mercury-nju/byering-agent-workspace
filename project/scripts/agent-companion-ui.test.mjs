import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  mountCompanionStatus, appendCompanionCards, openCompanionPreferences
} from "../src/salebuddy/ui/agent-companion-ui.js";

// A small injectable DOM: no browser, HTML parser, or application bootstrap.
class FakeNode {
  constructor(tagName, ownerDocument) {
    this.tagName = tagName.toUpperCase();
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.attributes = new Map();
    this.listeners = new Map();
    this.style = {};
    this.disabled = false;
    this.hidden = false;
    this.inert = false;
    this.value = "";
    this.checked = false;
    this.className = "";
    this._text = "";
  }
  set textContent(value) { this.replaceChildren(); this._text = String(value); }
  get textContent() { return this._text + this.children.map(child => child.textContent).join(""); }
  set innerHTML(_) { throw new Error("Untrusted content must never be parsed as HTML"); }
  append(...nodes) { nodes.forEach(node => this.appendChild(node)); }
  appendChild(node) { node.remove(); node.parentNode = this; this.children.push(node); return node; }
  replaceChildren(...nodes) { this.children.forEach(node => { node.parentNode = null; }); this.children = []; this._text = ""; this.append(...nodes); }
  remove() {
    if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(node => node !== this);
    this.parentNode = null;
  }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  removeAttribute(name) { this.attributes.delete(name); }
  hasAttribute(name) { return this.attributes.has(name); }
  contains(node) { return node === this || this.children.some(child => child.contains(node)); }
  get isConnected() { return this.ownerDocument.contains(this); }
  addEventListener(type, handler) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(handler);
  }
  removeEventListener(type, handler) { this.listeners.get(type)?.delete(handler); }
  dispatchEvent(event) {
    event.target ||= this;
    event.preventDefault ||= () => { event.defaultPrevented = true; };
    for (const handler of this.listeners.get(event.type) || []) handler(event);
    if (event.bubbles !== false) this.parentNode?.dispatchEvent(event);
    return !event.defaultPrevented;
  }
  click() { if (!this.disabled) this.dispatchEvent({ type: "click" }); }
  focus() {
    if (!this.isConnected || this.disabled) return;
    for (let node = this; node; node = node.parentNode) if (node.inert || node.hidden) return;
    this.ownerDocument.activeElement = this;
    this.dispatchEvent({ type: "focusin" });
  }
  querySelectorAll(selector) {
    const matches = node => selector.split(",").some(part => {
      const rule = part.trim();
      if (rule.startsWith(".")) return node.className.split(" ").includes(rule.slice(1));
      const attr = rule.match(/^\[([^=\]]+)(?:="([^"]*)")?\]$/);
      if (attr) return node.hasAttribute(attr[1]) && (attr[2] === undefined || node.getAttribute(attr[1]) === attr[2]);
      return node.tagName.toLowerCase() === rule;
    });
    return descendants(this).filter(matches);
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
}

class FakeDocument extends FakeNode {
  constructor() {
    super("document", null);
    this.ownerDocument = this;
    this.head = this.createElement("head");
    this.body = this.createElement("body");
    this.append(this.head, this.body);
    this.activeElement = this.body;
  }
  createElement(tag) { return new FakeNode(tag, this); }
  createElementNS(_namespace, tag) { return this.createElement(tag); }
}

function descendants(root) { return root.children.flatMap(child => [child, ...descendants(child)]); }
function button(root, name) {
  const found = descendants(root).find(node => node.tagName === "BUTTON" && (node.getAttribute("aria-label") === name || node.textContent === name));
  assert.ok(found, `Missing button: ${name}`);
  return found;
}
function labeled(root, name) {
  const found = descendants(root).find(node => node.getAttribute("aria-label") === name);
  assert.ok(found, `Missing control: ${name}`);
  return found;
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const flush = () => new Promise(resolve => setImmediate(resolve));
const fixture = () => ({
  persona: { name: "小伴", description: "认真听你说，也坦诚说出想法。" },
  settings: { tone: "warm", detail: "balanced", remember: true },
  memories: [
    { id: "learned /&1", text: "先给我结论", pinned: false, sourceLabel: "来自聊天" },
    { id: "fixed", text: "用中文交流", pinned: true, sourceLabel: "我告诉你的" }
  ],
  revision: 0
});
function server(initial = fixture()) {
  let state = structuredClone(initial);
  const calls = [];
  const request = async (method, path, body) => {
    calls.push({ method, path, body: structuredClone(body) });
    if (method === "GET") return structuredClone(state);
    assert.equal(body.expectedRevision, state.revision);
    if (Number.isFinite(state.sharedRevision)) assert.equal(body.expectedSharedRevision, state.sharedRevision);
    if (method === "PUT") state.settings = { ...body.settings };
    if (method === "PATCH") {
      const memory = state.memories.find(item => item.id === body.memoryId);
      if (body.text != null) memory.text = body.text;
      if (body.scope && memory.scope !== body.scope) {
        memory.scope = body.scope;
        state.sharedRevision = (state.sharedRevision ?? 0) + 1;
      }
    }
    if (method === "DELETE") {
      const params = new URL(path, "https://example.test").searchParams;
      state.memories = params.has("reset")
        ? state.memories.filter(memory => memory.pinned)
        : state.memories.filter(memory => memory.id !== params.get("memoryId"));
    }
    state.revision += 1;
    return { revision: state.revision };
  };
  return { calls, request };
}

test("status phases have natural copy, real dots, isolated cleanup and no ready placeholder", () => {
  const doc = new FakeDocument();
  const host = doc.createElement("div"); doc.body.append(host);
  const existing = doc.createElement("p"); host.append(existing);
  const cleanup = mountCompanionStatus(host, { phase: "thinking" });
  assert.match(host.textContent, /想一想…/);
  assert.equal(host.querySelectorAll(".sb-companion-dot").length, 3);
  assert.equal(host.querySelector('[role="status"]').getAttribute("aria-live"), "polite");
  const queuedCleanup = mountCompanionStatus(host, { phase: "queued" });
  cleanup();
  assert.match(host.textContent, /等前一句聊完/);
  queuedCleanup(); queuedCleanup();
  assert.deepEqual(host.children, [existing]);
  mountCompanionStatus(host, { phase: "ready" });
  assert.deepEqual(host.children, [existing]);
  assert.equal(doc.head.querySelectorAll("style").length, 1);
});

test("retry locks while pending, catches rejection, and can be retried", async () => {
  const doc = new FakeDocument(), host = doc.createElement("div"); doc.body.append(host);
  const pending = deferred(); let calls = 0;
  mountCompanionStatus(host, { phase: "failed", onRetry: () => { calls += 1; return calls === 1 ? pending.promise : undefined; } });
  assert.match(host.textContent, /这次没能回复/);
  const retry = button(host, "重试"); retry.click(); retry.click();
  assert.equal(calls, 1); assert.equal(retry.disabled, true);
  pending.reject(new Error("internal stack")); await flush();
  assert.equal(retry.disabled, false);
  assert.doesNotMatch(host.textContent, /internal stack/);
  retry.click(); await flush(); assert.equal(calls, 2);
});

test("cards are safe, selectable, message-scoped and never synthesize missing cards", async () => {
  const doc = new FakeDocument(), parent = doc.createElement("div"); doc.body.append(parent);
  appendCompanionCards(parent, { id: "empty" }); assert.equal(parent.children.length, 0);
  const pending = deferred(), calls = [];
  const cleanup = appendCompanionCards(parent, { id: "message-1", metadata: { companion: { cards: [
    { id: "c1", kind: "memory", title: "<img src=x onerror=alert(1)>", detail: "以后都这样聊？", options: [{ id: "yes", label: "记住吧" }, { id: "no", label: "这次就好" }] },
    { id: "c2", kind: "navigate", title: "聊聊习惯", options: [{ id: "open", label: "相处方式" }] },
    { id: "bad", kind: "unknown", title: "must not render", options: [] }
  ] } } }, { onAction: action => { calls.push(action); return pending.promise; } });
  assert.equal(parent.querySelectorAll("img").length, 0);
  assert.doesNotMatch(parent.textContent, /must not render/);
  const yes = button(parent, "记住吧"); yes.click(); button(parent, "这次就好").click();
  assert.deepEqual(calls, [{ cardId: "c1", optionId: "yes", messageId: "message-1" }]);
  assert.equal(yes.getAttribute("aria-pressed"), "false");
  pending.resolve(); await flush();
  assert.equal(yes.getAttribute("aria-pressed"), "true");
  assert.equal(button(parent, "这次就好").getAttribute("aria-pressed"), "false");
  button(parent, "相处方式").click(); await flush();
  assert.equal(calls[1].cardId, "c2");
  cleanup(); assert.equal(parent.children.length, 0);
});

test("card failures keep choices available and cleanup ignores late completion", async () => {
  const doc = new FakeDocument(), parent = doc.createElement("div"); doc.body.append(parent);
  let pending = deferred();
  const cleanup = appendCompanionCards(parent, { id: "m", metadata: { companion: { cards: [
    { id: "c", kind: "memory", title: "偏好", options: [{ id: "o", label: "记住吧" }] }
  ] } } }, { onAction: () => pending.promise });
  const choice = button(parent, "记住吧"); choice.click(); pending.reject(new Error("secret")); await flush();
  assert.equal(choice.disabled, false); assert.equal(choice.getAttribute("aria-pressed"), "false");
  assert.match(parent.textContent, /没能/); assert.doesNotMatch(parent.textContent, /secret/);
  pending = deferred(); choice.click(); cleanup(); pending.resolve(); await flush();
  assert.equal(parent.children.length, 0);
});

test("preferences load only server data, encode agent ids and expose semantic controls", async () => {
  const document = new FakeDocument(), api = server();
  const modal = openCompanionPreferences({ agentId: "a /&?中", request: api.request, document });
  assert.match(modal.element.textContent, /正在加载/); await modal.ready;
  assert.equal(api.calls[0].path, "/v1/agents/companion?agentId=a%20%2F%26%3F%E4%B8%AD");
  assert.equal(modal.element.getAttribute("role"), "dialog");
  assert.equal(modal.element.getAttribute("aria-modal"), "true");
  for (const copy of ["相处方式", "怎么和我说话", "记住我的习惯", "你对我的了解", "先给我结论", "来自聊天", "小伴"]) assert.ok(modal.element.textContent.includes(copy));
  assert.equal(labeled(modal.element, "温暖一点").checked, true);
  assert.equal(labeled(modal.element, "长短适中").checked, true);
  assert.equal(labeled(modal.element, "记住我的习惯").checked, true);
  assert.doesNotMatch(modal.element.textContent, /soul|机器|灵魂|执行次数/i);
  modal.close();
});

test("settings save all fields with revision zero and serialize pending writes", async () => {
  const document = new FakeDocument(), api = server(), pending = deferred();
  const request = (method, ...args) => method === "PUT" ? pending.promise.then(() => api.request(method, ...args)) : api.request(method, ...args);
  const modal = openCompanionPreferences({ agentId: "a", request, document }); await modal.ready;
  labeled(modal.element, "直接一点").checked = true;
  labeled(modal.element, "直接一点").dispatchEvent({ type: "change" });
  labeled(modal.element, "简单说").checked = true;
  labeled(modal.element, "简单说").dispatchEvent({ type: "change" });
  labeled(modal.element, "记住我的习惯").checked = false;
  labeled(modal.element, "记住我的习惯").dispatchEvent({ type: "change" });
  button(modal.element, "保存").click(); button(modal.element, "保存").click();
  assert.equal(button(modal.element, "保存").disabled, true);
  assert.equal(button(modal.element, "忘掉：先给我结论").disabled, true);
  pending.resolve(); await flush();
  assert.deepEqual(api.calls.find(call => call.method === "PUT").body, { settings: { tone: "direct", detail: "brief", remember: false }, expectedRevision: 0 });
  assert.equal(api.calls.filter(call => call.method === "PUT").length, 1);
  assert.equal(labeled(modal.element, "直接一点").checked, true);
  modal.close();
});

test("memory edits validate blank text; forget and learned reset use the latest revision", async () => {
  const document = new FakeDocument(), api = server();
  const modal = openCompanionPreferences({ agentId: "a", request: api.request, document }); await modal.ready;
  button(modal.element, "编辑：先给我结论").click();
  const input = labeled(modal.element, "修改记住的事"); input.value = "   ";
  button(modal.element, "保存修改").click(); await flush();
  assert.equal(api.calls.filter(call => call.method === "PATCH").length, 0);
  input.value = "先说重点，再补细节"; button(modal.element, "保存修改").click(); await flush();
  assert.deepEqual(api.calls.find(call => call.method === "PATCH").body, { memoryId: "learned /&1", text: "先说重点，再补细节", expectedRevision: 0 });
  button(modal.element, "忘掉：先说重点，再补细节").click(); await flush();
  const deletion = api.calls.find(call => call.method === "DELETE");
  assert.match(deletion.path, /&memoryId=learned%20%2F%261$/);
  assert.deepEqual(deletion.body, { expectedRevision: 1 });
  assert.doesNotMatch(modal.element.textContent, /先说重点，再补细节/);
  modal.close();

  const second = server();
  const reset = openCompanionPreferences({ agentId: "a", request: second.request, document }); await reset.ready;
  button(reset.element, "忘掉当前 Agent 记住的事").click();
  assert.equal(second.calls.length, 1);
  button(reset.element, "确认忘掉").click(); await flush();
  assert.deepEqual(second.calls.find(call => call.method === "DELETE"), { method: "DELETE", path: "/v1/agents/companion?agentId=a&reset=1", body: { expectedRevision: 0 } });
  assert.ok(reset.element.textContent.includes("用中文交流"));
  assert.doesNotMatch(reset.element.textContent, /先给我结论/);
  reset.close();
});

test("sharing a memory is explicit, uses both revisions, and can be made private again", async () => {
  const document = new FakeDocument();
  const data = fixture();
  data.sharedRevision = 0;
  data.memories[0].scope = "agent";
  data.memories[0].scopeLabel = "仅当前 Agent";
  const api = server(data);
  const modal = openCompanionPreferences({ agentId: "a", request: api.request, document }); await modal.ready;

  button(modal.element, "共享给其他 Agent").click(); await flush();
  const share = api.calls.find(call => call.method === "PATCH");
  assert.deepEqual(share.body, {
    memoryId: "learned /&1",
    scope: "shared",
    expectedRevision: 0,
    expectedSharedRevision: 0
  });
  assert.ok(modal.element.textContent.includes("仅当前 Agent"));
  button(modal.element, "仅当前 Agent").click(); await flush();
  const unshare = api.calls.filter(call => call.method === "PATCH")[1];
  assert.deepEqual(unshare.body, {
    memoryId: "learned /&1",
    scope: "agent",
    expectedRevision: 1,
    expectedSharedRevision: 1
  });
  assert.ok(modal.element.textContent.includes("共享给其他 Agent"));
  modal.close();
});

test("loading errors and empty memories stay honest and retry performs a fresh GET", async () => {
  const document = new FakeDocument(); let calls = 0;
  const data = fixture(); data.memories = [];
  const modal = openCompanionPreferences({ agentId: "a", document, request: async () => {
    calls += 1; if (calls === 1) throw new Error("private endpoint"); return data;
  } });
  await modal.ready;
  assert.match(modal.element.textContent, /没能加载/); assert.doesNotMatch(modal.element.textContent, /private endpoint|先给我结论/);
  button(modal.element, "重试").click(); await flush();
  assert.equal(calls, 2); assert.match(modal.element.textContent, /还没有记下/);
  assert.equal(button(modal.element, "忘掉当前 Agent 记住的事").disabled, true);
  modal.close();
});

test("failed save preserves the draft and conflict requires an explicit fresh read", async () => {
  const document = new FakeDocument(), api = server(); let fail = true;
  const modal = openCompanionPreferences({ agentId: "a", document, request: async (method, ...args) => {
    if (method === "PUT" && fail) throw Object.assign(new Error("revision conflict"), { status: 409 });
    return api.request(method, ...args);
  } }); await modal.ready;
  labeled(modal.element, "平静一点").checked = true; labeled(modal.element, "平静一点").dispatchEvent({ type: "change" });
  button(modal.element, "保存").click(); await flush();
  assert.equal(labeled(modal.element, "平静一点").checked, true);
  assert.match(modal.element.textContent, /更新/);
  fail = false; button(modal.element, "重新加载").click(); await flush();
  assert.equal(api.calls.filter(call => call.method === "GET").length, 2);
  modal.close();
});

test("focus is trapped, Escape restores focus and inert state, late GET is ignored", async () => {
  const document = new FakeDocument(), launcher = document.createElement("button");
  document.body.style.overflow = "auto"; document.body.append(launcher); launcher.focus();
  const background = document.createElement("aside"); background.inert = true; document.body.append(background);
  const pending = deferred();
  const modal = openCompanionPreferences({ agentId: "a", document, request: () => pending.promise });
  assert.equal(launcher.inert, true);
  const close = button(modal.element, "关闭相处方式"); assert.equal(document.activeElement, close);
  const tab = { type: "keydown", key: "Tab", shiftKey: true };
  close.dispatchEvent(tab); assert.equal(tab.defaultPrevented, true); assert.equal(document.activeElement, close);
  document.dispatchEvent({ type: "keydown", key: "Escape" });
  assert.equal(document.activeElement, launcher); assert.equal(launcher.inert, false); assert.equal(background.inert, true);
  assert.equal(document.body.style.overflow, "auto"); assert.equal(modal.element.isConnected, false);
  pending.resolve(fixture()); await modal.ready;
  assert.equal(modal.element.isConnected, false);
  assert.equal(document.listeners.get("keydown")?.size || 0, 0);
  assert.equal(document.listeners.get("focusin")?.size || 0, 0);
  modal.close();
});

test("loaded dialog wraps Tab and Shift+Tab across enabled controls", async () => {
  const document = new FakeDocument(), api = server();
  const modal = openCompanionPreferences({ agentId: "a", document, request: api.request }); await modal.ready;
  const first = button(modal.element, "关闭相处方式");
  const controls = modal.element.querySelectorAll("button, input, textarea, select").filter(node => !node.disabled && !node.hidden);
  const last = controls.at(-1); last.focus();
  last.dispatchEvent({ type: "keydown", key: "Tab" }); assert.equal(document.activeElement, first);
  first.dispatchEvent({ type: "keydown", key: "Tab", shiftKey: true }); assert.equal(document.activeElement, last);
  modal.close();
});

test("styles contain staggered keyframes, reduced motion, responsive bounds and small card corners", async () => {
  const source = await readFile(new URL("../src/salebuddy/ui/agent-companion-ui.js", import.meta.url), "utf8");
  assert.match(source, /@keyframes sb-companion-typing/);
  assert.match(source, /prefers-reduced-motion:\s*reduce/);
  assert.match(source, /animation:\s*none/);
  assert.match(source, /animation-delay/);
  assert.match(source, /overflow-wrap:\s*anywhere/);
  assert.match(source, /border-radius:\s*8px/);
  assert.doesNotMatch(source, /innerHTML|setInterval|localStorage|fetch\(/);
});

test("unknown phases never render inherited object properties", () => {
  const document = new FakeDocument(), host = document.createElement("div"); document.body.append(host);
  for (const phase of ["toString", "constructor", "invalid", "ready"]) {
    mountCompanionStatus(host, { phase });
    assert.equal(host.textContent, "");
  }
});

test("failed post-write refresh blocks duplicate writes and retry only reads", async () => {
  const document = new FakeDocument(), api = server(); let reads = 0;
  const modal = openCompanionPreferences({ agentId: "a", document, request: async (method, ...args) => {
    if (method === "GET" && ++reads === 2) throw new Error("offline");
    return api.request(method, ...args);
  } }); await modal.ready;
  button(modal.element, "忘掉：先给我结论").click(); await flush();
  assert.match(modal.element.textContent, /还没能确认最新内容/);
  assert.ok(modal.element.textContent.includes("先给我结论"));
  assert.equal(button(modal.element, "忘掉：先给我结论").disabled, true);
  button(modal.element, "重新加载").click(); await flush();
  assert.doesNotMatch(modal.element.textContent, /先给我结论/);
  assert.equal(api.calls.filter(call => call.method === "DELETE").length, 1);
  modal.close();
});

test("unrelated memory writes preserve both the settings draft and the active memory editor", async () => {
  const document = new FakeDocument(), api = server();
  const modal = openCompanionPreferences({ agentId: "a", document, request: api.request }); await modal.ready;
  labeled(modal.element, "直接一点").checked = true; labeled(modal.element, "直接一点").dispatchEvent({ type: "change" });
  button(modal.element, "编辑：先给我结论").click();
  const input = labeled(modal.element, "修改记住的事"); input.value = "还没保存的内容"; input.dispatchEvent({ type: "input" });
  button(modal.element, "忘掉：用中文交流").click(); await flush();
  assert.equal(labeled(modal.element, "修改记住的事").value, "还没保存的内容");
  assert.equal(labeled(modal.element, "直接一点").checked, true);
  assert.equal(api.calls.filter(call => call.method === "PUT" || call.method === "PATCH").length, 0);
  modal.close();
});

test("ordinary memory write failures retain the editor and do not claim a change", async () => {
  const document = new FakeDocument(), api = server(); let reject = true;
  const modal = openCompanionPreferences({ agentId: "a", document, request: async (method, ...args) => {
    if (method === "PATCH" && reject) throw new Error("database details");
    return api.request(method, ...args);
  } }); await modal.ready;
  button(modal.element, "编辑：先给我结论").click();
  const input = labeled(modal.element, "修改记住的事"); input.value = "保留我写的内容"; input.dispatchEvent({ type: "input" });
  button(modal.element, "保存修改").click(); await flush();
  assert.equal(labeled(modal.element, "修改记住的事").value, "保留我写的内容");
  assert.equal(button(modal.element, "保存修改").disabled, false);
  assert.doesNotMatch(modal.element.textContent, /database details|已保存/);
  reject = false; button(modal.element, "保存修改").click(); await flush();
  assert.match(modal.element.textContent, /保留我写的内容/);
  modal.close();
});

test("closing a pending write cannot refresh or reopen the dialog", async () => {
  const document = new FakeDocument(), pending = deferred(); const calls = [];
  const modal = openCompanionPreferences({ agentId: "a", document, request: (method) => {
    calls.push(method); return method === "GET" ? Promise.resolve(fixture()) : pending.promise;
  } }); await modal.ready;
  button(modal.element, "保存").click(); modal.close();
  pending.resolve({ revision: 1 }); await flush();
  assert.deepEqual(calls, ["GET", "PUT"]); assert.equal(modal.element.isConnected, false);
});

test("malformed GET payloads never invent defaults or enable revisionless writes", async () => {
  for (const response of [{}, { ...fixture(), revision: null }, { ...fixture(), memories: null }, { ...fixture(), settings: { tone: "invented" } }]) {
    const document = new FakeDocument(), calls = [];
    const modal = openCompanionPreferences({ agentId: "a", document, request: async method => { calls.push(method); return response; } });
    await modal.ready;
    assert.match(modal.element.textContent, /没能加载/);
    assert.equal(modal.element.querySelectorAll("input").length, 0);
    assert.deepEqual(calls, ["GET"]); modal.close();
  }
});

test("a second dialog cleans up the previous instance and restores the original launcher", async () => {
  const document = new FakeDocument(), launcher = document.createElement("button"); document.body.append(launcher); launcher.focus();
  const oldRequest = deferred(), api = server();
  const first = openCompanionPreferences({ agentId: "first", document, request: () => oldRequest.promise });
  const second = openCompanionPreferences({ agentId: "second", document, request: api.request }); await second.ready;
  assert.equal(first.element.isConnected, false); assert.equal(second.element.isConnected, true);
  assert.equal(document.listeners.get("keydown").size, 1);
  oldRequest.resolve(fixture()); await first.ready;
  first.close(); assert.equal(launcher.inert, true);
  second.close(); assert.equal(document.activeElement, launcher); assert.equal(launcher.inert, false);
});

test("card callbacks catch synchronous throws and structured failure results", async () => {
  for (const onAction of [() => { throw new Error("sync"); }, () => ({ ok: false, error: "failed" })]) {
    const document = new FakeDocument(), parent = document.createElement("div"); document.body.append(parent);
    const cleanup = appendCompanionCards(parent, { id: "m", metadata: { companion: { cards: [
      { id: "c", kind: "memory", title: "习惯", options: [{ id: "o", label: "记住吧" }] }
    ] } } }, { onAction });
    button(parent, "记住吧").click(); await flush();
    assert.match(parent.textContent, /没能完成/);
    assert.equal(button(parent, "记住吧").getAttribute("aria-pressed"), "false");
    assert.equal(button(parent, "记住吧").disabled, false); cleanup();
  }
});
