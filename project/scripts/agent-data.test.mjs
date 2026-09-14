#!/usr/bin/env node
/**
 * Agent 员工模型数据层测试（model.js / agent-store.mjs / gateway agent.* action）
 * 运行：node scripts/agent-data.test.mjs
 */
import { mkdtempSync, existsSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createDefaultProfile,
  createMemoryEntry,
  reviseMemoryEntry,
  rollbackMemoryEntry,
  mergeProfilePatch,
  fillProfileDefaults,
  renderIdentityMarkdown,
  AGENT_TYPE_DEFAULTS,
  MEMORY_KINDS,
  FEEDBACK_SCOPES
} from "../src/salebuddy/agents/model.js";
import { createAgentStore } from "./agent-store.mjs";
import { startGatewayMock } from "./gateway-mock.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const results = [];
const record = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`);
};
const assert = (condition, message) => { if (!condition) throw new Error(message); };
async function run(name, fn) {
  try { await fn(); record(name, true); }
  catch (error) { record(name, false, error.message); }
}

// ── model.js 单元 ─────────────────────────────────────────────
await run("model: 六类角色均有默认档案骨架（九段结构）", () => {
  for (const agentType of Object.keys(AGENT_TYPE_DEFAULTS)) {
    const profile = createDefaultProfile(agentType);
    for (const section of ["identity", "soul", "role", "skills", "tools", "scope", "permission", "budget", "meta"]) {
      assert(profile[section] !== undefined, `${agentType} 缺少 ${section}`);
    }
    assert(profile.role.reportsTo === "main", "汇报关系应指向 main");
  }
});

await run("model: 记忆条目校验分类与四档生效范围", () => {
  assert(MEMORY_KINDS.length >= 5, "记忆分类应覆盖 PRD 五类");
  assert(FEEDBACK_SCOPES.join(",") === "task,project,agent,organization", "四档生效范围顺序固定");
  const entry = createMemoryEntry({ kind: "feedback", text: "报告先给结论", scope: "organization" });
  assert(entry.status === "active" && entry.version === 1, "新记忆初始状态错误");
  let threw = false;
  try { createMemoryEntry({ kind: "nope", text: "x" }); } catch { threw = true; }
  assert(threw, "非法记忆分类应抛错");
});

await run("model: 记忆修订留痕、回退恢复上一版本", () => {
  let entry = createMemoryEntry({ kind: "userRules", text: "v1 规则" });
  entry = reviseMemoryEntry(entry, "v2 规则");
  assert(entry.version === 2 && entry.history.length === 1 && entry.history[0].text === "v1 规则", "修订未留痕");
  entry = rollbackMemoryEntry(entry);
  assert(entry.text === "v1 规则" && entry.status === "active", "回退未恢复上一版本");
  entry = rollbackMemoryEntry(entry); // 无更多历史 → 标记 rolled-back
  assert(entry.status === "rolled-back", "无历史时应标记 rolled-back");
});

await run("model: profile patch 深合并、数组整体替换、版本递增", () => {
  const profile = createDefaultProfile("Browser Agent");
  const next = mergeProfilePatch(profile, { identity: { name: "新名字" }, skills: ["搜索"] });
  assert(next.identity.name === "新名字" && next.identity.title === profile.identity.title, "深合并失败");
  assert(next.skills.length === 1, "数组应整体替换");
  assert(next.meta.version === profile.meta.version + 1, "版本未递增");
});

await run("model: profile defaults fill empty fields without overwriting edits", () => {
  const profile = { skills: ["用户自定义技能"], scope: { dataAccess: ["自定义数据"] } };
  const next = fillProfileDefaults(profile, {
    skills: ["默认技能"],
    scope: { dataAccess: ["默认数据"], forbiddenZones: ["敏感数据"] },
    permission: { forbidden: ["删除数据"] }
  });
  assert(next.skills[0] === "用户自定义技能", "不应覆盖用户技能");
  assert(next.scope.dataAccess[0] === "自定义数据", "不应覆盖用户数据范围");
  assert(next.scope.forbiddenZones[0] === "敏感数据" && next.permission.forbidden[0] === "删除数据", "缺省字段未补齐");
});

await run("model: IDENTITY.md 文本包含姓名职位与职责", () => {
  const md = renderIdentityMarkdown(createDefaultProfile("Search Agent"));
  assert(md.includes("线索分析师") && md.includes("汇报对象: main"), "IDENTITY.md 内容不完整");
});

// ── agent-store 磁盘持久化 ────────────────────────────────────
const storeRoot = mkdtempSync(path.join(tmpdir(), "salebuddy-agents-"));
try {
  const store = createAgentStore(storeRoot);

  await run("store: getProfile 自动落盘并生成云电脑目录", () => {
    const profile = store.getProfile("Browser Agent");
    const dir = path.join(storeRoot, encodeURIComponent("Browser Agent"));
    assert(profile.identity.name === "线索猎人", "默认档案岗位名错误");
    for (const sub of ["profile.json", "IDENTITY.md", "workspace/inbox", "workspace/output", "workspace/tmp", "workspace/logs"]) {
      assert(existsSync(path.join(dir, sub)), `缺少 ${sub}`);
    }
  });

  await run("store: updateProfile 持久化并同步重写 IDENTITY.md", () => {
    store.updateProfile("Browser Agent", { identity: { signature: "—— 你的线索猎人" } });
    const dir = path.join(storeRoot, encodeURIComponent("Browser Agent"));
    const persisted = JSON.parse(readFileSync(path.join(dir, "profile.json"), "utf8"));
    assert(persisted.identity.signature === "—— 你的线索猎人", "profile.json 未更新");
    assert(readFileSync(path.join(dir, "IDENTITY.md"), "utf8").includes("你的线索猎人"), "IDENTITY.md 未同步");
  });

  await run("store: 记忆追加/修订/回退全链路", () => {
    const entry = store.appendMemory("Browser Agent", { kind: "feedback", text: "优先筛选 SaaS 画像", scope: "agent", source: "user" });
    assert(store.listMemory("Browser Agent").length === 1, "追加未生效");
    store.reviseMemory("Browser Agent", entry.id, "优先筛选 SaaS 与制造业画像");
    assert(store.listMemory("Browser Agent")[0].text.includes("制造业"), "修订未生效");
    store.rollbackMemory("Browser Agent", entry.id);
    assert(store.listMemory("Browser Agent")[0].text === "优先筛选 SaaS 画像", "回退未生效");
    assert(store.listMemory("Browser Agent", "feedback").length === 1, "按分类过滤失败");
    assert(store.listMemory("Browser Agent", "lessons").length === 0, "空分类应返回空数组");
  });

  await run("store: 权限更新独立于档案其余部分", () => {
    store.updatePermission("Browser Agent", { approvalRequired: ["发送邮件"], limits: { maxEmailsPerRun: 20 } });
    const permission = store.getPermission("Browser Agent");
    assert(permission.approvalRequired.includes("发送邮件") && permission.limits.maxEmailsPerRun === 20, "权限未持久化");
    assert(store.getProfile("Browser Agent").identity.signature === "—— 你的线索猎人", "权限更新破坏了档案其他字段");
  });

  await run("store: marketplace profiles hydrate the complete runtime structure", () => {
    const profile = store.getProfile("mkt-lead-miner");
    for (const section of ["identity", "soul", "role", "skills", "tools", "scope", "permission", "budget", "meta"]) {
      assert(profile[section] !== undefined, `市场 Agent 缺少 ${section}`);
    }
    assert(profile.soul.deliveryStandard && profile.scope.forbiddenZones.length, "市场 Agent 缺少原则或禁区");
    store.updateProfile("mkt-lead-miner", { scope: { dataAccess: ["用户指定数据"] } });
    assert(store.getProfile("mkt-lead-miner").scope.dataAccess[0] === "用户指定数据", "用户配置被默认值覆盖");
  });
} finally {
  rmSync(storeRoot, { recursive: true, force: true });
}

// ── gateway agent.* action 端到端 ─────────────────────────────
const TEST_PORT = 5198;
const server = startGatewayMock({ port: TEST_PORT });
await new Promise((resolve) => server.on("listening", resolve));
try {
  const socket = new WebSocket(`ws://127.0.0.1:${TEST_PORT}/agent?token=agent-data`, "ws-ag-ui");
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  let seq = 0;
  const pending = new Map();
  socket.addEventListener("message", (event) => {
    let message;
    try { message = JSON.parse(event.data); } catch { return; }
    if (message?.type === "ack" && pending.has(message.requestId)) {
      pending.get(message.requestId)(message.data);
      pending.delete(message.requestId);
    }
  });
  const action = (actionName, payload = {}) => new Promise((resolve, reject) => {
    const requestId = `ad-${++seq}`;
    pending.set(requestId, resolve);
    setTimeout(() => reject(new Error(`ack timeout: ${actionName}`)), 3000);
    socket.send(JSON.stringify({ event: "gateway.action", requestId, payload: { action: actionName, ...payload } }));
  });

  await run("gateway: agent.profile.get 返回九段档案", async () => {
    const result = await action("agent.profile.get", { agentType: "File Agent" });
    const profile = result?.data?.profile;
    assert(profile?.identity?.name === "内容策划", `档案岗位名错误: ${profile?.identity?.name}`);
    assert(profile?.permission && profile?.budget, "档案缺少权限或预算段");
  });

  await run("gateway: profile.update → get 读回一致", async () => {
    await action("agent.profile.update", { agentType: "File Agent", patch: { identity: { languageStyle: "简洁直接" } } });
    const result = await action("agent.profile.get", { agentType: "File Agent" });
    assert(result?.data?.profile?.identity?.languageStyle === "简洁直接", "更新未读回");
    // 清理测试痕迹：删除 mock 在 project/agents 下为 File Agent 生成的目录
    rmSync(path.join(projectRoot, "agents", encodeURIComponent("File Agent")), { recursive: true, force: true });
  });

  await run("gateway: memory.append → list → rollback", async () => {
    const appended = await action("agent.memory.append", { agentType: "main", entry: { kind: "feedback", text: "数据必须附来源", scope: "organization" } });
    const entryId = appended?.data?.entry?.id;
    assert(entryId, "append 未返回 entry.id");
    const listed = await action("agent.memory.list", { agentType: "main", kind: "feedback" });
    assert(listed?.data?.entries?.some((entry) => entry.id === entryId), "list 未包含新记忆");
    const rolled = await action("agent.memory.rollback", { agentType: "main", entryId });
    assert(rolled?.data?.entry?.status === "rolled-back", "无历史版本时应标记 rolled-back");
    rmSync(path.join(projectRoot, "agents", encodeURIComponent("main")), { recursive: true, force: true });
  });

  socket.close();
} finally {
  server.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n数据层结果：${results.length - failed.length} 通过 / ${failed.length} 失败`);
process.exit(failed.length ? 1 : 0);
