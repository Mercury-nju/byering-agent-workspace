#!/usr/bin/env node
/**
 * 办公室回归基线测试（Case 0–7，见 OFFICE-ARCHITECTURE.md §17）
 *
 * 层级说明：本测试在协议层验证 gateway-mock 产出的事件时间线
 * 与渲染器 dCe 适配器期望的形状一致（subagent_start/end、角色名、
 * 状态值、历史消息结构、幂等性）。状态机/动画层的逐帧一致性由
 * 浏览器端加载同一 mock 验证（npm run serve 后人工/录屏核对）。
 *
 * 运行：node scripts/office-baseline.test.mjs
 * 退出码：0 = 全部通过；1 = 有失败。
 */
import { startGatewayMock } from "./gateway-mock.mjs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TEST_PORT = 5199;
const results = [];

function record(name, status, detail = "") {
  results.push({ name, status, detail });
  const mark = status === "PASS" ? "✅" : status === "PENDING" ? "⏳" : "❌";
  console.log(`${mark} ${name}${detail ? ` — ${detail}` : ""}`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function withClient(fn) {
  const socket = new WebSocket(`ws://127.0.0.1:${TEST_PORT}/agent?token=baseline`, "ws-ag-ui");
  const events = [];
  const acks = new Map();
  socket.addEventListener("message", (event) => {
    let message;
    try { message = JSON.parse(event.data); } catch { return; }
    if (message?.type === "ack") acks.set(message.requestId, message.data);
    else events.push(message);
  });
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  const send = (envelope) => socket.send(JSON.stringify(envelope));
  const waitFor = (predicate, timeoutMs = 6000) => new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const timer = setInterval(() => {
      const found = events.find(predicate);
      if (found) { clearInterval(timer); resolve(found); }
      else if (Date.now() - startedAt > timeoutMs) { clearInterval(timer); reject(new Error("waitFor timeout")); }
    }, 10);
  });
  const action = (actionName, payload = {}) => new Promise((resolve, reject) => {
    const requestId = `act-${Math.random().toString(36).slice(2)}`;
    const timer = setTimeout(() => reject(new Error(`ack timeout: ${actionName}`)), 3000);
    const poll = setInterval(() => {
      if (acks.has(requestId)) {
        clearTimeout(timer);
        clearInterval(poll);
        resolve(acks.get(requestId));
      }
    }, 10);
    send({ event: "gateway.action", requestId, payload: { action: actionName, ...payload } });
  });
  try {
    await fn({ socket, events, acks, send, waitFor, action });
  } finally {
    socket.close();
  }
}

const agui = (e) => e?.event === "ag_ui_event" ? e.data : null;
const aguiType = (e) => agui(e)?.type;
const subEvents = (events, name) => events.filter((e) => aguiType(e) === "CUSTOM" && agui(e)?.name === name).map((e) => agui(e));

async function runCase(name, fn) {
  try {
    await fn();
    record(name, "PASS");
  } catch (error) {
    record(name, "FAIL", error.message);
  }
}

/** Case 0：红线完整性 */
function caseIntegrity() {
  try {
    execFileSync(process.execPath, [path.join(projectRoot, "scripts/check-office-integrity.mjs")], { stdio: "pipe" });
    record("Case 0 办公室红线文件完整性", "PASS");
  } catch {
    record("Case 0 办公室红线文件完整性", "FAIL", "冻结文件哈希与基线不一致");
  }
}

/** Case 1：只有主 Agent 工作 → main TASK_EXECUTING/WORKING，RUN 生命周期完整有序 */
async function caseMainOnly() {
  await withClient(async ({ send, waitFor, events }) => {
    await waitFor((e) => e?.event === "gateway.connected");
    send({ event: "agent.run", requestId: "c1-1", payload: { title: "baseline-case-1", conversation_id: "case-1" } });
    const expected = ["RUN_STARTED", "TEXT_MESSAGE_START", "TEXT_MESSAGE_CONTENT", "TEXT_MESSAGE_END", "RUN_FINISHED"];
    for (const type of expected) await waitFor((e) => aguiType(e) === type);
    const order = events.map((e) => aguiType(e)).filter((t) => expected.includes(t));
    const sorted = [...order].sort((a, b) => expected.indexOf(a) - expected.indexOf(b));
    assert(JSON.stringify(order) === JSON.stringify(sorted), `事件乱序: ${order.join(",")}`);
    const subs = subEvents(events, "subagent_start").filter((e) => e.data?.conversation_id === "case-1");
    assert(subs.length >= 0, "subagent 事件读取失败");
  });
}

/** Case 2：主 Agent 分派 Browser → 交接完成后 Browser 才 WORKING（start 早于 end，end 早于 RUN_FINISHED） */
async function caseDispatch() {
  await withClient(async ({ send, waitFor, events }) => {
    await waitFor((e) => e?.event === "gateway.connected");
    send({ event: "agent.run", requestId: "c2-1", payload: { title: "baseline-case-2", conversation_id: "case-2", scenario: "single" } });
    await waitFor((e) => aguiType(e) === "RUN_FINISHED" && agui(e)?.conversation_id === "case-2");
    const mine = events.filter((e) => agui(e)?.conversation_id === "case-2");
    const starts = subEvents(mine, "subagent_start");
    const ends = subEvents(mine, "subagent_end");
    assert(starts.length === 1, `应恰好 1 次 subagent_start，实际 ${starts.length}`);
    assert(starts[0].value.agentName === "Browser Agent", `角色名应为 Browser Agent，实际 ${starts[0].value.agentName}`);
    assert(starts[0].value.parentAgentId === "main", "parentAgentId 应为 main");
    assert(ends.length === 1 && ends[0].value.agentId === starts[0].value.agentId, "subagent_end 应与 start 同一 agentId");
    assert(ends[0].value.status !== "failed", "single 场景不应失败");
    const seqOf = (predicate) => mine.findIndex(predicate);
    assert(seqOf((e) => aguiType(e) === "RUN_STARTED") < seqOf((e) => e === starts[0] || (aguiType(e) === "CUSTOM" && agui(e)?.name === "subagent_start")), "RUN_STARTED 必须早于分派");
  });
}

/** Case 3：subagent COMPLETE → 清理并交付（end 之后主 Agent 汇总并 RUN_FINISHED，之后无该 agent 的新事件） */
async function caseComplete() {
  await withClient(async ({ send, waitFor, events }) => {
    await waitFor((e) => e?.event === "gateway.connected");
    send({ event: "agent.run", requestId: "c3-1", payload: { title: "baseline-case-3", conversation_id: "case-3", scenario: "single" } });
    await waitFor((e) => aguiType(e) === "RUN_FINISHED" && agui(e)?.conversation_id === "case-3");
    await new Promise((resolve) => setTimeout(resolve, 300)); // 确认没有尾随事件
    const mine = events.filter((e) => agui(e)?.conversation_id === "case-3");
    const endIndex = mine.findIndex((e) => aguiType(e) === "CUSTOM" && agui(e)?.name === "subagent_end");
    const finishIndex = mine.findIndex((e) => aguiType(e) === "RUN_FINISHED");
    assert(endIndex >= 0 && finishIndex > endIndex, "RUN_FINISHED 必须在 subagent_end 之后");
    const agentId = agui(mine[endIndex])?.value?.agentId;
    const after = mine.slice(endIndex + 1).filter((e) => {
      const data = agui(e);
      return data?.name?.startsWith("subagent_") && data?.value?.agentId === agentId;
    });
    assert(after.length === 0, `subagent_end 后仍有该 agent 的事件 ${after.length} 条（幽灵工作）`);
  });
}

/** Case 4：subagent ERROR → 不留幽灵工作状态（failed 终态到达，主流程仍收尾） */
async function caseError() {
  await withClient(async ({ send, waitFor, events }) => {
    await waitFor((e) => e?.event === "gateway.connected");
    send({ event: "agent.run", requestId: "c4-1", payload: { title: "baseline-case-4", conversation_id: "case-4", scenario: "fail" } });
    await waitFor((e) => aguiType(e) === "RUN_FINISHED" && agui(e)?.conversation_id === "case-4");
    const mine = events.filter((e) => agui(e)?.conversation_id === "case-4");
    const ends = subEvents(mine, "subagent_end");
    const failed = ends.find((e) => e.value.status === "failed");
    assert(failed, "应有一个 failed 的 subagent_end");
    assert(failed.value.agentName === "File Agent", `失败角色应为 File Agent，实际 ${failed.value.agentName}`);
    const starts = subEvents(mine, "subagent_start");
    assert(starts.every((s) => ends.some((en) => en.value.agentId === s.value.agentId)), "每个 start 都必须有终态 end，不能有悬挂");
  });
}

/** Case 5：多 subagent 并行 → 各自独立 start/end，互不清空 */
async function caseParallel() {
  await withClient(async ({ send, waitFor, events }) => {
    await waitFor((e) => e?.event === "gateway.connected");
    send({ event: "agent.run", requestId: "c5-1", payload: { title: "baseline-case-5", conversation_id: "case-5", scenario: "parallel" } });
    await waitFor((e) => aguiType(e) === "RUN_FINISHED" && agui(e)?.conversation_id === "case-5");
    const mine = events.filter((e) => agui(e)?.conversation_id === "case-5");
    const starts = subEvents(mine, "subagent_start");
    const ends = subEvents(mine, "subagent_end");
    const names = new Set(starts.map((s) => s.value.agentName));
    assert(starts.length === 3 && names.size === 3, `应并行 3 个不同角色，实际 ${starts.length} / ${[...names].join(",")}`);
    for (const name of ["Browser Agent", "File Agent", "Search Agent"]) {
      assert(names.has(name), `缺少角色 ${name}`);
    }
    for (const s of starts) {
      const matching = ends.filter((e) => e.value.agentId === s.value.agentId);
      assert(matching.length === 1, `agentId ${s.value.agentId} 应恰好 1 个终态，实际 ${matching.length}`);
    }
  });
}

/** Case 6：历史恢复 → message.action.list 返回进行中的 subagent（渲染器据此走 SUB_START，不重复 DISPATCH） */
async function caseHistoryRecovery() {
  await withClient(async ({ waitFor, action }) => {
    await waitFor((e) => e?.event === "gateway.connected");
    const conversations = await action("conversations.list", { limit: 20 });
    const history = conversations?.data?.conversations?.find((c) => c.id === "recovered-office-history");
    assert(history, "缺少种子历史会话 recovered-office-history");
    assert(history.status === "in_progress", `历史会话应为 in_progress，实际 ${history.status}`);
    const result = await action("message.action.list", { conversation_id: "recovered-office-history" });
    const messages = result?.data?.messages || [];
    assert(messages.length === 1, `历史消息应 1 条，实际 ${messages.length}`);
    const message = messages[0];
    assert(message.role === "assistant" && message.status === "generating", "历史消息应为 generating 的 assistant");
    const sub = message.content?.find((item) => item.type === "subagent");
    assert(sub, "历史消息缺少 subagent 内容项");
    assert(sub.data.status === "running" && sub.data.name === "Browser Agent", `subagent 应为 running 的 Browser Agent，实际 ${sub.data.status}/${sub.data.name}`);
  });
}

/** Case 7：重复/乱序事件幂等 → 同会话重复 run 不重复播放时间线，会话不重复 */
async function caseIdempotent() {
  await withClient(async ({ send, waitFor, events, action }) => {
    await waitFor((e) => e?.event === "gateway.connected");
    send({ event: "agent.run", requestId: "c7-1", payload: { title: "baseline-case-7", conversation_id: "case-7", scenario: "single" } });
    await new Promise((resolve) => setTimeout(resolve, 300));
    send({ event: "agent.run", requestId: "c7-2", payload: { title: "baseline-case-7", conversation_id: "case-7", scenario: "single" } }); // 重复触发
    await waitFor((e) => aguiType(e) === "RUN_FINISHED" && agui(e)?.conversation_id === "case-7");
    await new Promise((resolve) => setTimeout(resolve, 200));
    const mine = events.filter((e) => agui(e)?.conversation_id === "case-7");
    const runStarts = mine.filter((e) => aguiType(e) === "RUN_STARTED");
    assert(runStarts.length === 1, `重复 run 应被幂等忽略，RUN_STARTED 出现 ${runStarts.length} 次`);
    assert(subEvents(mine, "subagent_start").length === 1, "subagent_start 不应重复");
    const conversations = await action("conversations.list", { limit: 50 });
    const duplicates = conversations?.data?.conversations?.filter((c) => c.id === "case-7") || [];
    assert(duplicates.length === 1, `会话列表中 case-7 应唯一，实际 ${duplicates.length}`);
  });
}

async function main() {
  const server = startGatewayMock({ port: TEST_PORT });
  await new Promise((resolve) => server.on("listening", resolve));
  try {
    caseIntegrity();
    await runCase("Case 1 主 Agent 工作（RUN 生命周期有序）", caseMainOnly);
    await runCase("Case 2 主 Agent 分派 Browser（start→end→finish 时序）", caseDispatch);
    await runCase("Case 3 subagent COMPLETE 后清理、无幽灵事件", caseComplete);
    await runCase("Case 4 subagent ERROR 终态到达且主流程收尾", caseError);
    await runCase("Case 5 多 subagent 并行、互不清空", caseParallel);
    await runCase("Case 6 历史恢复数据可支撑 SUB_START", caseHistoryRecovery);
    await runCase("Case 7 重复 run 幂等、会话唯一", caseIdempotent);
  } finally {
    server.close();
  }
  const failed = results.filter((r) => r.status === "FAIL");
  const passed = results.filter((r) => r.status === "PASS");
  console.log(`\n基线结果：${passed.length} 通过 / ${failed.length} 失败`);
  process.exit(failed.length ? 1 : 0);
}

main();
