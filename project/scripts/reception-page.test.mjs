import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { normalizeReception, receptionWindow, RECEPTION_ROLES, RECEPTION_ROLE_DETAILS, RECEPTION_GOALS } from "../src/salebuddy/agents/account-reception.js";
import { markReceptionConfigured } from "../src/salebuddy/ui/account-reception-config-state.js";
import { BUSINESS_MATERIAL_ACCEPT, BUSINESS_MATERIAL_MAX_CHARS, readBusinessMaterialFile } from "../src/salebuddy/ui/business-material-import.js";

class Node {
  constructor(tag) { this.tagName = tag; this.children = []; this.listeners = {}; this.attributes = {}; this.value = ""; }
  set textContent(text) { this.text = String(text); this.children = []; }
  get textContent() { return (this.text || "") + this.children.map(child => child.textContent).join(""); }
  append(...nodes) { this.children.push(...nodes); }
  appendChild(node) { this.children.push(node); return node; }
  setAttribute(key, value) { this.attributes[key] = value; }
  addEventListener(event, listener) { this.listeners[event] = listener; }
  all() { return this.children.flatMap(node => [node, ...node.all()]); }
  querySelectorAll(selector) { return this.all().filter(node => selector.split(",").includes(node.tagName)); }
  trigger(event) { if (this.disabled) return; return this.listeners[event]?.({ target: this }); }
}
const source = readFileSync(new URL("../src/salebuddy/ui/account-reception-page.js", import.meta.url), "utf8");
const code = source.slice(source.indexOf("const CSS =")).replace("export function openAccountReceptionPage", "function openAccountReceptionPage");
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
function memoryStorage() {
  const values = new Map();
  return {
    getItem: key => values.get(key) || null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key)
  };
}
function mount({ offline = false, accounts = null, onConnectAccount = null, renderEmpty = null, storage = memoryStorage(), receptionRequestImpl = null } = {}) {
  const body = new Node("body"), calls = [];
  const el = (tag, className, text) => { const node = new Node(tag); node.className = className || ""; if (text != null) node.textContent = text; return node; };
  const account = { id: "account", name: "我的账号" };
  const context = { el, document: { createElement: tag => new Node(tag), getElementById: () => null, head: new Node("head") },
    openPage: () => ({ body, close() {} }), mountPersonAvatar: (container, person = {}) => {
      if (!person.avatar) return false;
      const image = new Node("img");
      image.src = person.avatar;
      image.setAttribute("src", person.avatar);
      container.appendChild(image);
      return true;
    }, normalizeReception, receptionWindow, RECEPTION_ROLES, RECEPTION_ROLE_DETAILS, RECEPTION_GOALS,
    inboxStrategyStore: { get: () => null }, markReceptionConfigured, receptionBaseUrl: () => "http://local", BUSINESS_MATERIAL_ACCEPT, readBusinessMaterialFile, localStorage: storage,
    fetch: async () => ({ json: async () => ({ accounts: [] }) }),
    receptionRequest: async (id, options = {}) => {
      calls.push({ id, options });
      if (receptionRequestImpl) return receptionRequestImpl(id, options, calls);
      if (offline && options.method !== "PUT") throw new TypeError("Failed to fetch");
      if (options.operation === "/preview") return { action: "reply", reply: "试聊回复", sent: false };
      if (options.method === "PUT") return { revision: 2, settings: options.body.settings };
      return { revision: 1, settings: normalizeReception({ knowledge: "周一可预约" }) };
    },
    confirm: () => false,
    BUSINESS_MATERIAL_MAX_CHARS
  };
  const open = runInNewContext(code + "\nopenAccountReceptionPage", context);
  const page = open({ getAccounts: raw => raw ? [] : accounts || [account], onConnectAccount, renderEmpty });
  return { body, calls, page, storage };
}

test("reception page turns a missing account into a guided connection entry", () => {
  let connectCount = 0;
  const { body, page } = mount({ accounts: [], onConnectAccount: () => { connectCount += 1; } });
  assert.match(body.textContent, /先连接一个抖音账号/);
  assert.match(body.textContent, /连接账号.*设置接待.*开始承接/);
  assert.doesNotMatch(body.textContent, /暂时无法读取这个账号的接待方式/);
  const connect = body.all().find(node => node.tagName === "button" && node.textContent === "连接抖音账号");
  connect.trigger("click");
  assert.equal(connectCount, 1);
  page.close();
});

test("strategy management can replace its initial account state after the backend confirms no private reception", async () => {
  let renders = 0;
  const { body, page } = mount({
    renderEmpty: (root) => {
      renders += 1;
      root.appendChild(new Node("management-empty"));
      root.children[root.children.length - 1].textContent = "先启动私信承接";
    }
  });
  await tick();
  assert.equal(renders, 1);
  assert.match(body.textContent, /先启动私信承接/);
  assert.doesNotMatch(body.textContent, /先连接一个抖音账号/);
  page.close();
});

test("reception page loads server data, saves a revisioned persona and previews without sending", async () => {
  const { body, calls, page } = mount(); await tick();
  assert.match(body.textContent, /对外身份/);
  assert.match(body.textContent, /热情店长.*专业客服.*金牌销售.*耐心小助手.*合作经理.*自定义人设/);
  assert.match(body.textContent, /希望对方最终完成什么/);
  assert.match(body.textContent, /回答问题.*留下联系方式.*预约到店.*填写问卷/);
  assert.doesNotMatch(body.textContent, /希望聊到哪一步|先解答问题|征求联系方式/);
  assert.doesNotMatch(body.textContent, /说话感觉|怎么称呼对方/);
  assert.doesNotMatch(body.textContent, /人设决定对外呈现的角色感和表达方式/);
  assert.match(body.textContent, /接待时段/);
  assert.doesNotMatch(body.textContent, /时区|Asia\/Shanghai/);
  assert.doesNotMatch(source, /field\(time, "时区", zone\)/);
  assert.doesNotMatch(body.textContent, /需要你处理的对话|刷新对话|暂时没有接待记录/);
  const knowledge = body.all().find(node => node.tagName === "textarea" && node.rows === 6);
  knowledge.value = "周一可预约"; knowledge.trigger("input");
  const save = body.all().find(node => node.tagName === "button" && node.textContent === "保存接待方式");
  await save.trigger("click");
  const request = calls.find(call => call.options.method === "PUT");
  assert.equal(request.options.body.expectedRevision, 1);
  assert.equal(request.options.body.settings.knowledge, "周一可预约");
  const message = body.all().find(node => node.tagName === "textarea" && node.attributes["aria-label"] === "试聊消息");
  message.value = "怎么预约"; message.trigger("input");
  await body.all().find(node => node.tagName === "button" && node.textContent === "试试看").trigger("click");
  assert.match(body.textContent, /试聊回复/);
  assert.equal(calls.filter(call => call.options.operation === "/preview").length, 1);
  assert.ok(calls.every(call => [undefined, "/preview"].includes(call.options.operation)));
  assert.equal(calls.filter(call => call.options.operation === "/conversations").length, 0);
  page.close();
});

test("custom persona opens editable fields and saves the account-facing identity", async () => {
  const { body, calls, page } = mount(); await tick();
  const custom = body.all().find(node => node.tagName === "input" && node.type === "radio" && node.value === "custom");
  assert.ok(custom);
  custom.trigger("change");

  assert.match(body.textContent, /自定义人设设置/);
  const name = body.all().find(node => node.tagName === "input" && node.attributes["aria-label"] === "自定义身份");
  const brand = body.all().find(node => node.tagName === "input" && node.attributes["aria-label"] === "代表的品牌或店铺");
  const description = body.all().find(node => node.tagName === "textarea" && node.attributes["aria-label"] === "自定义表达方式");
  assert.ok(name);
  assert.equal(brand, undefined);
  assert.ok(description);

  name.value = "懂装修的邻家顾问"; name.trigger("input");
  description.value = "像熟悉的朋友一样自然沟通，先回答问题，再给出下一步建议。"; description.trigger("input");
  const save = body.all().find(node => node.tagName === "button" && node.textContent === "保存接待方式");
  await save.trigger("click");

  const request = calls.find(call => call.options.method === "PUT");
  assert.equal(request.options.body.settings.persona.role, "custom");
  assert.equal(request.options.body.settings.persona.name, "懂装修的邻家顾问");
  assert.equal(request.options.body.settings.persona.brand, "");
  assert.equal(request.options.body.settings.persona.description, "像熟悉的朋友一样自然沟通，先回答问题，再给出下一步建议。");
  page.close();
});

test("reception page makes the active account and account switcher explicit", async () => {
  const { body, calls, page } = mount({
    accounts: [
      { id: "account", name: "一以万真", handle: "@16764616", avatar: "https://example.com/avatar.png" },
      { id: "second", name: "另一家店", handle: "second-shop" }
    ]
  });
  await tick();
  assert.match(body.textContent, /当前接待账号/);
  assert.match(body.textContent, /一以万真@16764616/);
  assert.doesNotMatch(source, /sb-reception-account-select/);
  const accountAvatar = body.all().find(node => node.className === "sb-reception-account-avatar");
  assert.equal(accountAvatar.children[0].tagName, "img");
  assert.equal(accountAvatar.children[0].attributes.src, "https://example.com/avatar.png");
  const trigger = body.all().find(node => node.tagName === "button" && node.attributes["aria-label"] === "切换接待账号");
  assert.ok(trigger);
  assert.equal(trigger.attributes["aria-haspopup"], "listbox");
  trigger.trigger("click");
  await tick();
  const options = body.all().filter(node => node.tagName === "button" && node.attributes.role === "option");
  assert.equal(options.length, 2);
  options.find(node => /另一家店/.test(node.attributes["aria-label"])).trigger("click");
  await tick();
  assert.ok(calls.some(call => call.id === "second"));
  page.close();
});

test("reception page renders direct flat setting panels without accordion controls", async () => {
  const { body, page } = mount();
  await tick();

  assert.doesNotMatch(body.textContent, /私信接待策略/);
  assert.doesNotMatch(body.textContent, /为每个已授权账号定义接待方式/);
  assert.doesNotMatch(body.textContent, /策略概览/);
  assert.doesNotMatch(body.textContent, /点击一项展开编辑/);
  assert.doesNotMatch(body.textContent, /选择接待人设/);
  assert.doesNotMatch(body.textContent, /接待设置/);
  assert.match(body.textContent, /当前接待账号/);
  assert.match(body.textContent, /对外身份/);
  assert.match(body.textContent, /接待时段/);
  assert.match(body.textContent, /对话目标/);
  assert.match(body.textContent, /人工交接/);
  assert.doesNotMatch(body.textContent, /按账号独立保存/);
  assert.doesNotMatch(body.textContent, /对外称呼|代表的店铺或品牌/);
  assert.match(source, /sb-reception-account-bar/);
  assert.match(source, /justify-content:flex-start/);
  assert.match(source, /grid-template-areas:"account \." "main trial"/);
  assert.match(source, /sb-reception-settings-grid/);
  assert.match(source, /section\(settingsGrid, "time", "接待时段"\)/);
  assert.match(source, /section\(settingsGrid, "chat", "对话目标"\)/);
  assert.match(source, /section\(settingsGrid, "reply", "回复方式"\)/);
  assert.doesNotMatch(source, /sb-reception-settings-column/);
  assert.doesNotMatch(source, /sb-reception-strategy-hero/);
  assert.match(source, /section\(main, "persona", "对外身份"\)/);
  assert.match(source, /section\(main, "knowledge", "业务资料"\)/);
  assert.doesNotMatch(source, /section\(conversationColumn, "knowledge", "业务资料"\)/);
  assert.match(source, /sb-reception-knowledge-grid/);
  assert.match(source, /sb-reception-trial-composer/);
  assert.match(source, /data-reception-section/);
  assert.doesNotMatch(source, /el\("details", "sb-reception-section"\)/);
  page.close();
});

test("reception page parses a business-material file and only writes it after confirmation", async () => {
  const { body, calls, page } = mount(); await tick();
  const fileInput = body.all().find(node => node.tagName === "input" && node.type === "file");
  fileInput.files = [{ name: "产品资料.csv", text: async () => "产品,价格\n标准版,299" }];
  await fileInput.trigger("change");
  assert.match(body.textContent, /产品资料\.csv/);
  assert.match(body.textContent, /已解析/);
  const parsedText = body.all().find(node => node.tagName === "textarea" && node.attributes["aria-label"] === "待导入的业务资料");
  assert.match(parsedText.value, /产品：标准版；价格：299/);
  parsedText.value += "\n售后：7天无理由";
  parsedText.trigger("input");
  body.all().find(node => node.tagName === "button" && node.textContent === "替换当前资料").trigger("click");
  const save = body.all().find(node => node.tagName === "button" && node.textContent === "保存接待方式");
  await save.trigger("click");
  const request = calls.find(call => call.options.method === "PUT");
  assert.match(request.options.body.settings.knowledge, /产品：标准版；价格：299/);
  assert.match(request.options.body.settings.knowledge, /售后：7天无理由/);
  page.close();
});

test("business material import rejects content that would be silently truncated on save", async () => {
  await assert.rejects(
    () => readBusinessMaterialFile({ name: "超长资料.txt", text: async () => "x".repeat(BUSINESS_MATERIAL_MAX_CHARS + 1) }),
    error => error?.code === "BUSINESS_MATERIAL_TOO_LARGE" && /30000/.test(error.message)
  );
});

test("reception page keeps an account-scoped editor available when the control plane is offline", async () => {
  const { body, calls, page } = mount({ offline: true }); await tick();
  assert.match(body.textContent, /对外身份/);
  assert.match(body.textContent, /暂时离线/);
  const knowledge = body.all().find(node => node.tagName === "textarea" && node.rows === 6);
  knowledge.value = "离线账号策略"; knowledge.trigger("input");
  const save = body.all().find(node => node.tagName === "button" && node.textContent === "保存接待方式");
  await save.trigger("click");
  assert.equal(calls.filter(call => call.options.method === "PUT").length, 0);
  assert.match(body.textContent, /已保存到这个账号的本机策略/);
  page.close();
});

test("replays a pending offline strategy only when the server revision has not changed", async () => {
  const storage = memoryStorage();
  const baseSettings = normalizeReception({ knowledge: "云端旧资料" });
  const first = mount({
    storage,
    receptionRequestImpl: async (_id, options) => {
      if (options.method === "PUT") throw new TypeError("Failed to fetch");
      return { revision: 1, settings: baseSettings };
    }
  });
  await tick();
  const knowledge = first.body.all().find(node => node.tagName === "textarea" && node.rows === 6);
  knowledge.value = "离线保存的资料";
  knowledge.trigger("input");
  await first.body.all().find(node => node.tagName === "button" && node.textContent === "保存接待方式").trigger("click");
  assert.match(first.body.textContent, /已保存到这个账号的本机策略/);
  first.page.close();

  const second = mount({
    storage,
    receptionRequestImpl: async (_id, options) => {
      if (options.method === "PUT") return { revision: 2, settings: options.body.settings };
      return { revision: 1, settings: baseSettings };
    }
  });
  await tick();
  await tick();
  const sync = second.calls.find(call => call.options.method === "PUT");
  assert.equal(sync.options.body.expectedRevision, 1);
  assert.equal(sync.options.body.settings.knowledge, "离线保存的资料");
  assert.match(second.body.textContent, /已同步离线策略/);
  second.page.close();
});

test("does not overwrite a newer cloud strategy with a pending offline draft", async () => {
  const storage = memoryStorage();
  const first = mount({
    storage,
    receptionRequestImpl: async (_id, options) => {
      if (options.method === "PUT") throw new TypeError("Failed to fetch");
      return { revision: 1, settings: normalizeReception({ knowledge: "旧策略" }) };
    }
  });
  await tick();
  const knowledge = first.body.all().find(node => node.tagName === "textarea" && node.rows === 6);
  knowledge.value = "本机草稿";
  knowledge.trigger("input");
  await first.body.all().find(node => node.tagName === "button" && node.textContent === "保存接待方式").trigger("click");
  first.page.close();

  const second = mount({
    storage,
    receptionRequestImpl: async (_id, options) => {
      if (options.method === "PUT") throw new Error("不应自动覆盖云端");
      return { revision: 2, settings: normalizeReception({ knowledge: "云端新策略" }) };
    }
  });
  await tick();
  await tick();
  assert.equal(second.calls.filter(call => call.options.method === "PUT").length, 0);
  assert.match(second.body.textContent, /云端策略已更新/);
  assert.match(second.body.textContent, /本机草稿/);
  second.page.close();
});
