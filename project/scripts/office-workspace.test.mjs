import test from "node:test";
import assert from "node:assert/strict";
import { createOfficeWorkspace } from "../src/salebuddy/ui/office-workspace.js";
import { OFFICE_START_ACTIONS } from "../src/salebuddy/ui/office-workspace-state.js";
import { readFileSync } from "node:fs";

class Element {
  constructor(tag) { this.tagName = tag; this.children = []; this.style = {}; this.dataset = {}; this.listeners = {}; this.attributes = {}; this.isConnected = true; this.value = ""; this.scrollHeight = 100; this.scrollTop = 0; this.clientHeight = 100; }
  set textContent(value) { this.text = String(value); this.children = []; }
  get textContent() { return (this.text || "") + this.children.map(child => child.textContent).join(""); }
  append(...nodes) { nodes.forEach(node => this.appendChild(node)); }
  appendChild(node) { node.parentElement = this; this.children.push(node); return node; }
  remove() { if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(child => child !== this); this.isConnected = false; }
  setAttribute(key, value) { this.attributes[key] = value; }
  removeAttribute(key) { delete this.attributes[key]; }
  addEventListener(type, listener) { this.listeners[type] = listener; }
  get classList() { return { add: value => { this.className = value; }, remove: () => { this.className = ""; } }; }
  get firstElementChild() { return this.children[0]; }
  all() { return this.children.flatMap(child => [child, ...child.all()]); }
  querySelector(selector) { return this.all().find(child => selector.startsWith("#") ? child.id === selector.slice(1) : selector === "iframe" ? child.tagName === "iframe" : child.className?.split(" ").includes(selector.slice(1))) || null; }
}
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
function setup(t, gateway, options = {}) {
  const prior = globalThis.document;
  const head = new Element("head");
  globalThis.document = { createElement: tag => new Element(tag), createElementNS: (_ns, tag) => new Element(tag), getElementById: id => head.all().find(node => node.id === id), head, hidden: false };
  t.after(() => { globalThis.document = prior; });
  const host = new Element("aside");
  const controller = createOfficeWorkspace({ gateway, getWork: () => ({ state: "working" }), getWorks: () => [], getResults: () => [], getActivity: () => [], mountAvatar: () => {}, viewerUrl: id => `http://local/cloud-view.html?agentId=${id}`, pollMs: 100000, ...options });
  t.after(() => controller.unmount());
  controller.mount(host);
  return { host, controller };
}

test("office without work offers three meaningful ways to start instead of an empty viewer", t => {
  const { host } = setup(t);
  assert.match(host.textContent, /今天想做点什么/);
  assert.match(host.textContent, /找一批客户/);
  assert.match(host.textContent, /帮我接待私信/);
  assert.match(host.textContent, /分析候选人/);
  assert.doesNotMatch(host.textContent, /选择一个人物|查看工作画面和对话/);
  assert.doesNotMatch(host.textContent, /幕僚长|当前 Agent 团队|成员名单/);
  assert.equal(host.querySelector("iframe"), null);
});

test("office start actions lead with Douyin customer acquisition manager", () => {
  assert.equal(OFFICE_START_ACTIONS[0].agentId, "mkt-comment-acquisition");
  assert.equal(OFFICE_START_ACTIONS[0].label, "找一批客户");
});

test("office start panel uses spacing instead of repeated divider lines", () => {
  const source = readFileSync(new URL("../src/salebuddy/ui/office-workspace.js", import.meta.url), "utf8");
  assert.match(source, /\.sb-ow-start-options\{display:grid;gap:4px\}/);
  assert.doesNotMatch(source, /\.sb-ow-start-option\{[^}]*border-bottom/);
  assert.doesNotMatch(source, /\.sb-ow-recent\{[^}]*border-top/);
});

test("office home does not surface an unavailable status from an inactive Agent", t => {
  const task = { agentType: "mkt-comment-acquisition", metadata: { officeStatus: "unknown", officeStatusPhase: "unavailable" } };
  const { host } = setup(t, null, { getWork: () => task, getWorks: () => [task], onRetryStatus: () => assert.fail("inactive status must not expose a retry action") });
  assert.match(host.textContent, /今天想做点什么/);
  assert.doesNotMatch(host.textContent, /暂时无法获取工作状态|重新获取/);
  assert.equal(host.querySelector(".sb-ow-notice"), null);
});

test("selecting an Agent reuses its task capture channel above the conversation and switches cleanly", async t => {
  const { host, controller } = setup(t, { action: async () => ({ data: { messages: [] } }) });
  controller.select("mkt-comment-acquisition"); await tick();
  const first = host.querySelector("iframe");
  assert.match(first.src, /agentId=mkt-comment-acquisition/);
  assert.equal(first.attributes["aria-hidden"], "true");
  assert.equal(first.tabIndex, -1);
  controller.refresh(); assert.equal(host.querySelector("iframe"), first);
  controller.select("mkt-dm-inbox"); await tick();
  assert.match(host.querySelector("iframe").src, /agentId=mkt-dm-inbox/);
  assert.equal(first.src, "about:blank");
  assert.match(host.textContent, /私信客服/);
});

test("cloud workspaces reserve the task area for the current task capture without duplicate status copy", t => {
  const { host, controller } = setup(t, { action: async () => ({ data: { messages: [] } }) });
  controller.select("mkt-dm-inbox");
  assert.equal(host.querySelector(".sb-ow-work-head"), null);
  assert.doesNotMatch(host.textContent, /云电脑实时画面|正在连接|已连接|检查账号连接/);
  const source = readFileSync(new URL("../src/salebuddy/ui/office-workspace.js", import.meta.url), "utf8");
  assert.match(source, /data-mode="work"\]\[data-view="live"\].*grid-template-rows:auto minmax\(0,2fr\) minmax\(0,3fr\)/);
  assert.match(source, /const showLiveWorkspace = liveWork && usesCloudWorkspace/);
  assert.doesNotMatch(source, /data-mode="idle"|data-recording|showStart|showsRecording/);
  assert.doesNotMatch(source, /sb-ow-replay-head|heading\?\.append/);
});

test("idle cloud agents stay in direct conversation without a viewer or task CTA", t => {
  const { host, controller } = setup(t, null, { getWork: () => null });
  controller.select("mkt-cold-writer");
  const workspace = host.querySelector("#sb-office-workspace");
  assert.equal(workspace.dataset.mode, "chat");
  assert.equal(workspace.dataset.view, "chat");
  assert.equal(host.querySelector("iframe"), null);
  assert.equal(host.querySelector(".sb-ow-work"), null);
  assert.equal(host.querySelector(".sb-ow-start"), null);
  assert.equal(host.querySelector(".sb-ow-start-primary"), null);
  assert.match(host.textContent, /接下来想做点什么？直接发消息告诉我。/);
  assert.ok(host.all().find(node => node.tagName === "textarea"));
});

test("idle guidance does not duplicate a real private-message conversation", async t => {
  const { host, controller } = setup(t, { action: async () => ({ data: { messages: [{ id: "agent-message", from: "mkt-cold-writer", text: "我已经准备好了，请直接告诉我目标。", metadata: { companion: { phase: "ready" } } }] } }) }, { getWork: () => null });
  controller.select("mkt-cold-writer");
  await tick();
  assert.match(host.textContent, /我已经准备好了，请直接告诉我目标。/);
  assert.doesNotMatch(host.textContent, /接下来想做点什么？直接发消息告诉我。/);
});

test("idle cloud agents cannot render a replay placeholder", () => {
  const source = readFileSync(new URL("../src/salebuddy/ui/office-workspace.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /\[data-mode="idle"\]|\[data-recording="true"\]/);
  assert.match(source, /if \(showLiveWorkspace\) \{/);
});

test("analysis Agent starts as a direct conversation without a fake cloud image", t => {
  const { host, controller } = setup(t, null, { getWork: () => null });
  controller.select("mkt-intent-analyst");
  assert.equal(host.querySelector("iframe"), null);
  assert.equal(host.all().find(node => node.tagName === "textarea")?.placeholder, "说说你想分析哪些候选人，或选择成果中的名单");
  assert.match(host.textContent, /接下来想做点什么？直接发消息告诉我。/);
  assert.doesNotMatch(host.textContent, /选择账号分析|最近一次成果/);
  assert.doesNotMatch(host.textContent, /工作中|210|150/);
});

test("analysis Agent remains a pure conversation while its task runs in the background", t => {
  const work = { agentType: "mkt-intent-analyst", state: "working", task: "分析候选人意向", phase: "整理意向依据" };
  const { host, controller } = setup(t, null, { getWork: id => id === work.agentType ? work : null, getWorks: () => [work] });
  controller.select("mkt-intent-analyst");
  assert.equal(host.querySelector("iframe"), null);
  assert.equal(host.querySelector(".sb-ow-work"), null);
  assert.equal(host.querySelector(".sb-ow-start"), null);
  assert.ok(host.all().find(node => node.tagName === "textarea"));
});

test("a single active task opens automatically while idle selections do not open cloud connections", t => {
  const work = { agentType: "mkt-dm-inbox", state: "working", metadata: { taskState: "running" } };
  const { host, controller } = setup(t, null, { getWork: id => id === work.agentType ? work : null, getWorks: () => [work] });
  assert.match(host.textContent, /工作中/);
  assert.match(host.querySelector("iframe").src, /mkt-dm-inbox/);
  controller.select("mkt-comment-acquisition");
  assert.equal(host.querySelector("iframe"), null);
  assert.equal(host.querySelector(".sb-ow-start"), null);
  assert.match(host.textContent, /接下来想做点什么？直接发消息告诉我。/);
  controller.refresh();
  assert.equal(host.querySelector("iframe"), null);
});

test("working and authorization-offline states use distinct office surfaces", t => {
  let task = { agentType: "mkt-dm-inbox", state: "working", metadata: { longRunning: true, taskState: "running" } };
  const { host, controller } = setup(t, null, { getWork: () => task, getWorks: () => [task], onConfigure: () => {}, onOpenWork: () => {} });
  assert.ok(host.querySelector("iframe"));
  assert.match(host.textContent, /工作中/);
  assert.doesNotMatch(host.textContent, /需处理|正在监听/);

  task = { ...task, metadata: { taskState: "degraded" }, lastError: "抖音授权已失效" };
  controller.refresh();
  assert.equal(host.querySelector("iframe"), null);
  assert.match(host.textContent, /账号已掉线/);
  assert.match(host.textContent, /右上角调整任务/);
  assert.equal(host.querySelector(".sb-ow-replay-overlay"), null);
  assert.equal(host.querySelector(".sb-ow-start-primary"), null);
});

test("idle actions navigate to the right Agent without starting an execution", t => {
  const opened = [];
  const { host } = setup(t, { action: () => assert.fail("must not execute") }, { onConfigure: id => opened.push(id) });
  const button = host.all().find(node => node.tagName === "button" && node.textContent.includes("找一批客户"));
  button.listeners.click();
  assert.deepEqual(opened, ["mkt-comment-acquisition"]);
});

test("recent results link to the exact source result and continuing analysis preserves that source", t => {
  const record = { id: "r1", agentId: "mkt-find-people", taskId: "t1", status: "completed", title: "上次找到的候选人", items: [{ secUid: "user1" }] };
  const opened = [], analyzed = [];
  const { host } = setup(t, null, { getResults: () => [record], onOpenResult: run => opened.push(run), onAnalyze: run => analyzed.push(run) });
  host.all().find(node => node.tagName === "button" && node.textContent === "查看结果").listeners.click();
  host.all().find(node => node.tagName === "button" && node.textContent === "继续分析").listeners.click();
  assert.equal(opened[0], record); assert.equal(analyzed[0], record);
});

test("new work opens automatically and completion keeps the Agent conversation available", t => {
  let task = null;
  const { host, controller } = setup(t, null, { getWorks: () => task ? [task] : [], getWork: () => task });
  assert.match(host.textContent, /今天想做点什么/);
  task = { agentType: "mkt-dm-inbox", state: "working" }; controller.refresh();
  const frame = host.querySelector("iframe"); assert.ok(frame);
  assert.match(host.textContent, /工作中/);
  assert.match(host.textContent, /暂无成功工作的录屏/);
  assert.doesNotMatch(host.textContent, /本次任务工作片段|最近 15 秒|实时/);
  task = { ...task, state: "done" }; controller.refresh();
  assert.equal(host.querySelector("iframe"), null); assert.equal(frame.src, "about:blank");
  assert.match(host.textContent, /上一项工作已经完成。接下来想做点什么？直接发消息告诉我。/);
  assert.doesNotMatch(host.textContent, /本次任务工作片段|最近 15 秒/);
  assert.equal(host.querySelector(".sb-ow-work-start"), null);
  assert.ok(host.all().find(node => node.tagName === "textarea"));
});

test("paused and authorization-blocked tasks remain direct conversations", t => {
  let task = { agentType: "mkt-dm-inbox", state: "working", metadata: { taskState: "paused", taskId: "paused-task" } };
  const { host, controller } = setup(t, null, { getWorks: () => [task], getWork: () => task, onConfigure: () => {} });
  controller.select("mkt-dm-inbox");
  assert.match(host.textContent, /暂时没有任务/);
  assert.equal(host.querySelector("iframe"), null);
  task = { ...task, metadata: { taskState: "degraded" }, lastError: "抖音授权已失效" }; controller.refresh();
  assert.equal(host.querySelector("iframe"), null);
  assert.equal(host.querySelector(".sb-ow-start-primary"), null);
  assert.match(host.textContent, /右上角调整任务/);
});

test("idle views without results do not create placeholder statistics or result links", t => {
  const { host, controller } = setup(t, null, { getWork: () => null });
  assert.doesNotMatch(host.textContent, /最近一次成果|查看结果|0 位|210|150/);
  controller.select("mkt-comment-acquisition");
  assert.equal(host.querySelector("iframe"), null);
  assert.doesNotMatch(host.textContent, /最近一次成果/);
  assert.ok(host.all().find(node => node.tagName === "textarea"));
});

test("sending stays bound to selected Agent and does not fabricate an assistant reply", async t => {
  const calls = [];
  const { host, controller } = setup(t, { action: async (name, payload) => { calls.push({ name, payload }); return { accepted: true, data: { messages: [] } }; } });
  controller.select("mkt-intent-analyst"); await tick();
  const input = host.all().find(node => node.tagName === "textarea"); input.value = "现在找到了哪些人？";
  await host.all().find(node => node.attributes["aria-label"] === "发送消息").listeners.click();
  const sent = calls.find(call => call.name === "dm.message.send");
  assert.equal(sent.payload.agentType, "mkt-intent-analyst"); assert.equal(sent.payload.from, "user");
  assert.equal(sent.payload.text, "现在找到了哪些人？");
  assert.doesNotMatch(host.textContent, /收到，我会继续/);
});

test("late messages from the previous Agent never replace the new conversation", async t => {
  let finish;
  const { host, controller } = setup(t, { action: async (_name, payload) => payload.agentType === "mkt-comment-acquisition" ? new Promise(resolve => { finish = resolve; }) : { data: { messages: [{ id: "b", from: "mkt-dm-inbox", text: "新账号回复", metadata: { companion: { inReplyTo: "new-user" } } }] } } });
  controller.select("mkt-comment-acquisition"); await tick();
  controller.select("mkt-dm-inbox"); await tick();
  finish({ data: { messages: [{ id: "a", from: "mkt-comment-acquisition", text: "旧账号回复" }] } }); await tick();
  assert.match(host.textContent, /新账号回复/); assert.doesNotMatch(host.textContent, /旧账号回复/);
});

test("leaving the office releases the viewer but preserves the selected Agent and draft", t => {
  let visible = true;
  const { host, controller } = setup(t, null, { isVisible: () => visible });
  controller.select("mkt-dm-inbox");
  const frame = host.querySelector("iframe");
  host.all().find(node => node.tagName === "textarea").value = "保留这条草稿";
  visible = false; controller.refresh();
  assert.equal(frame.src, "about:blank");
  visible = true; controller.refresh();
  assert.match(host.querySelector("iframe").src, /mkt-dm-inbox/);
  assert.equal(host.all().find(node => node.tagName === "textarea").value, "保留这条草稿");
});

test("send failure keeps the draft and displays an error instead of a success reply", async t => {
  const { host, controller } = setup(t, { action: async name => { if (name === "dm.message.send") throw new Error("发送通道不可用"); return { data: { messages: [] } }; } });
  controller.select("mkt-dm-inbox"); await tick();
  const input = host.all().find(node => node.tagName === "textarea"); input.value = "我的问题";
  await host.all().find(node => node.attributes["aria-label"] === "发送消息").listeners.click();
  assert.equal(input.value, "我的问题"); assert.match(host.textContent, /发送通道不可用/);
});

test("office clicks select the inline workspace instead of navigating to the member list", () => {
  const runtime = readFileSync(new URL("../src/salebuddy/ui/office-agent-runtime.js", import.meta.url), "utf8");
  assert.match(runtime, /onOpenAgent = agentId => \{[\s\S]*?workspace.select\(agentId\)/);
  assert.match(runtime, /workspace.mount\(panelHost\)/);
  assert.doesNotMatch(runtime, /renderRosterPanel|当前 Agent 团队|sb-office-runtime-list/);
  const index = readFileSync(new URL("../src/salebuddy/index.js", import.meta.url), "utf8");
  const office = index.slice(index.indexOf("const officeAgentRuntimeReady"), index.indexOf("const agentCardChatReady"));
  assert.doesNotMatch(office, /openChatWith/);
});

test("gateway readiness enables the composer without recreating the live viewer", async t => {
  const { host, controller } = setup(t);
  controller.select("mkt-dm-inbox");
  const frame = host.querySelector("iframe"), send = host.all().find(node => node.attributes["aria-label"] === "发送消息");
  assert.equal(send.disabled, true);
  controller.setGateway({ action: async () => ({ data: { messages: [] } }) }); await tick();
  assert.equal(send.disabled, true);
  const input = host.all().find(node => node.tagName === "textarea"); input.value = "hello"; input.listeners.input();
  assert.equal(send.disabled, false); assert.equal(host.querySelector("iframe"), frame);
});

test("office keeps a visible connection state and preserves the draft when chat is unavailable", async t => {
  const { host, controller } = setup(t, null);
  controller.select("mkt-dm-inbox");
  await tick();
  assert.match(host.textContent, /对话连接尚未就绪/);
  const input = host.all().find(node => node.tagName === "textarea");
  input.value = "先保留这句话";
  input.listeners.input();
  await host.all().find(node => node.attributes["aria-label"] === "发送消息").listeners.click();
  assert.equal(input.value, "先保留这句话");
  assert.match(host.textContent, /这条消息还在输入框里/);
});

test("unknown persisted work returns to direct conversation without a fabricated status card", async t => {
  const task = { metadata: { officeStatus: "unknown", officeStatusPhase: "unavailable", taskId: "old-task" } };
  const { host, controller } = setup(t, { action: async () => ({ data: { messages: [] } }) }, {
    getWork: () => task,
    getActivity: () => [{ id: "old", from: "mkt-comment-acquisition", text: "old progress", createdAt: "2026-09-07T01:00:00Z", metadata: { source: "agent-activity", taskId: "old-task" } }] });
  controller.select("mkt-comment-acquisition"); await tick();
  assert.equal(host.querySelector("#sb-office-workspace").dataset.mode, "chat");
  assert.equal(host.querySelector("#sb-office-workspace").dataset.view, "chat");
  assert.equal(host.querySelector(".sb-ow-task"), null);
  assert.equal(host.querySelector("iframe"), null);
  assert.equal(host.querySelector(".sb-ow-notice"), null);
  assert.doesNotMatch(host.textContent, /暂时无法获取工作状态|重新获取/);
  assert.match(host.textContent, /接下来想做点什么？直接发消息告诉我。/);
});

test("successful sends remain visible while the remote history is eventually consistent", async t => {
  const { host, controller } = setup(t, { action: async () => ({ accepted: true, data: { messages: [] } }) });
  controller.select("mkt-dm-inbox"); await tick();
  const input = host.all().find(node => node.tagName === "textarea"); input.value = "message to keep"; input.listeners.input();
  await host.all().find(node => node.attributes["aria-label"] === "发送消息").listeners.click();
  await tick();
  assert.match(host.textContent, /message to keep/); assert.equal(input.value, "");
  assert.equal(host.all().find(node => node.attributes["aria-label"] === "发送消息").disabled, true);
});

test("status changes during send do not enable a duplicate send or lose the draft", async t => {
  let finish;
  let task = { state: "working" };
  const { host, controller } = setup(t, { action: async name => name === "dm.message.send" ? new Promise(resolve => { finish = resolve; }) : { data: { messages: [] } } }, { getWork: () => task });
  controller.select("mkt-dm-inbox"); await tick();
  let input = host.all().find(node => node.tagName === "textarea"); input.value = "keep during transition"; input.listeners.input();
  const pending = host.all().find(node => node.attributes["aria-label"] === "发送消息").listeners.click();
  task = { metadata: { officeStatus: "unknown", officeStatusPhase: "unavailable" } }; controller.refresh();
  input = host.all().find(node => node.tagName === "textarea");
  assert.equal(input.value, "keep during transition");
  assert.equal(host.all().find(node => node.attributes["aria-label"] === "发送消息").disabled, true);
  finish({ accepted: true }); await pending;
  assert.equal(input.value, ""); assert.match(host.textContent, /keep during transition/);
});

test("office workspace polls the embedded cloud viewer for a missed connection state", () => {
  const source = readFileSync(new URL("../src/salebuddy/ui/office-workspace.js", import.meta.url), "utf8");
  assert.match(source, /byering-cloud-viewer-status-request/);
  assert.match(source, /frame\.addEventListener\("load", \(\) => \{ requestViewerStatus\(\)/);
  assert.match(source, /const viewerStatusTimer = globalThis\.setInterval\?\.\(requestViewerStatus, 2_000\)/);
  assert.match(source, /globalThis\.clearInterval\?\.\(viewerStatusTimer\)/);
});

test("workspace reserves more height for conversation and clips all four rounded corners", () => {
  const source = readFileSync(new URL("../src/salebuddy/ui/office-workspace.js", import.meta.url), "utf8");
  assert.match(source, /grid-template-rows:auto minmax\(0,2fr\) minmax\(0,3fr\)/);
  assert.match(source, /data-mode="work"\]\[data-view="live"\].*grid-template-rows:auto minmax\(0,2fr\) minmax\(0,3fr\)/);
  assert.match(source, /\.sb-office-workspace-host\{[^}]*border-radius:16px!important/);
  assert.match(source, /#\$\{ID\}\{[^}]*border-radius:16px;overflow:hidden/);
  assert.match(source, /\.sb-ow-screen\{[^}]*flex:1;[^}]*min-height:0;[^}]*display:flex;[^}]*align-items:center;[^}]*justify-content:center;[^}]*border-radius:6px/);
  assert.match(source, /data-mode="work"\]\[data-view="live"\] \.sb-ow-screen\{[^}]*aspect-ratio:4\/3/);
  assert.match(source, /\.sb-ow-screen iframe\{[^}]*width:100%;[^}]*height:100%;[^}]*aspect-ratio:auto/);
  assert.doesNotMatch(source, /\.sb-ow-screen iframe\{[^}]*aspect-ratio:16\/9/);
  assert.match(source, /\.sb-ow-compose\{[^}]*flex-shrink:0/);
  assert.match(source, /\.sb-ow-message\{[^}]*flex-shrink:0/);
  assert.doesNotMatch(source, /height:clamp\(200px,36vh,400px\)|\.sb-ow-screen\{height:200px\}/);
});

test("cloud workspaces replay the latest successful task for the latest fifteen seconds", () => {
  const source = readFileSync(new URL("../src/salebuddy/ui/office-workspace.js", import.meta.url), "utf8");
  assert.match(source, /const REPLAY_WINDOW_MS = 15_000/);
  assert.match(source, /const REPLAY_SAMPLE_MS = 3_000/);
  assert.match(source, /const REPLAY_FRAME_LIMIT = Math\.ceil\(REPLAY_WINDOW_MS \/ REPLAY_SAMPLE_MS\)/);
  assert.match(source, /successfulOnly: true/);
  assert.match(source, /暂无成功工作的录屏/);
  assert.match(source, /result\?\.snapshots\) \? result\.snapshots\.slice\(0, REPLAY_FRAME_LIMIT\)/);
  assert.match(source, /本次任务工作片段/);
  assert.match(source, /当前工作画面/);
  assert.match(source, /暂无成功工作的录屏/);
  assert.doesNotMatch(source, /实时工作画面|实时云电脑|实时连接/);
  assert.doesNotMatch(source, /最近 \$\{REPLAY_WINDOW_MS \/ 1000\} 秒/);
  assert.doesNotMatch(source, /上次工作画面/);
  assert.match(source, /listOfficeReplay\(agentId, \{ limit: 30, latestOnly: true, successfulOnly: true \}\)/);
  assert.match(source, /saveOfficeReplaySnapshot\(\{ \.\.\.context, imageData: event\.data\.imageData \}\)/);
  assert.match(source, /byering-cloud-viewer-capture/);
  assert.doesNotMatch(source, /placeholder screenshot|模拟截图|demo screenshot/i);
});

test("cloud replay marks terminal successful work and never records terminal tasks", () => {
  const source = readFileSync(new URL("../src/salebuddy/ui/office-workspace.js", import.meta.url), "utf8");
  assert.match(source, /markOfficeReplayTask/);
  assert.match(source, /outcome: isSuccessfulReplayWork\(work\) \? "success" : "unknown"/);
  assert.match(source, /function isSuccessfulReplayWork\(work\)/);
  assert.match(source, /if \(!isSuccessfulReplayWork\(work\)\) return/);
  assert.match(source, /CLOUD_AGENTS\.has\(selected\) && officeWorkState\(work\)\.kind === "working" && !taskFinished/);
});

test("office work replays recorded WebM segments and only falls back to screenshots when recording is unavailable", () => {
  const source = readFileSync(new URL("../src/salebuddy/ui/office-workspace.js", import.meta.url), "utf8");
  assert.match(source, /const REPLAY_SEGMENT_MS = 5_000/);
  assert.match(source, /const REPLAY_SEGMENT_LIMIT = Math\.ceil\(REPLAY_WINDOW_MS \/ REPLAY_SEGMENT_MS\)/);
  assert.match(source, /byering-cloud-viewer-recording-start/);
  assert.match(source, /byering-cloud-recording-segment/);
  assert.match(source, /saveOfficeReplayVideo/);
  assert.match(source, /loadOfficeReplayVideo/);
  assert.match(source, /document\.createElement\("video"\)/);
  assert.match(source, /const justConnected = event\.data\.status === "connected" && viewerConnectionStatus !== "connected"/);
  assert.match(source, /event\.data\.status === "recording-unavailable"\) requestReplayCapture\(\)/);
  assert.match(source, /if \(replay\.videoNode\?\.ended\) advance\(\)/);
});

test("non-working guidance is kept in the private-message stream", () => {
  const source = readFileSync(new URL("../src/salebuddy/ui/office-workspace.js", import.meta.url), "utf8");
  assert.match(source, /function idleConversationPrompt\(agentId\)/);
  assert.match(source, /Idle guidance stays in the direct-message stream/);
  assert.match(source, /metadata: \{ source: "office-conversation" \}/);
  assert.doesNotMatch(source, /if \(showStart\)|appendReplay\(content/);
});

test("the higher-specificity office theme preserves the workspace radius in every mode", () => {
  const theme = readFileSync(new URL("../src/salebuddy/ui/ai-shuban-theme.js", import.meta.url), "utf8");
  const marker = '.office-dashboard [class*="_rightPanel_"]{';
  const start = theme.indexOf(marker);
  assert.ok(start >= 0);
  const panelRule = theme.slice(start, theme.indexOf("}", start));
  assert.doesNotMatch(panelRule, /border-radius:0!important/);
  assert.match(panelRule, /border-radius:var\(--sb-office-workspace-radius,0px\)!important/);
  const workspace = readFileSync(new URL("../src/salebuddy/ui/office-workspace.js", import.meta.url), "utf8");
  assert.match(workspace, /\.sb-office-workspace-host\{[^}]*--sb-office-workspace-radius:16px/);
  for (const mode of ["home", "chat"]) {
    const ruleStart = workspace.indexOf(`[data-mode="${mode}"]{`);
    const rule = workspace.slice(ruleStart, workspace.indexOf("}", ruleStart));
    assert.doesNotMatch(rule, /border-radius:0/);
  }
});
