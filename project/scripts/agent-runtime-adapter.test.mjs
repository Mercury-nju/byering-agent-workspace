import assert from "node:assert/strict";
import test from "node:test";

import {
  LEGACY_DISPLAY_NAMES,
  SCENARIO_AGENT_ALIASES,
  UNSUPPORTED_RUNTIME_AGENT_ALIASES,
  buildAgentContextFromRuntime,
  legacyAgentTypeFor,
  normalizeAgentEventPayload,
  normalizeAgentReference,
  normalizeSubagentPayload,
  resolveRuntimeAgentId
} from "../src/salebuddy/agents/agent-runtime-adapter.js";
import { AGENT_IDS, LEGACY_AGENT_ALIASES } from "../src/salebuddy/agents/agent-foundation.js";

test("all nine legacy types resolve to stable canonical ids and display metadata", () => {
  const entries = Object.entries(LEGACY_AGENT_ALIASES);
  assert.equal(entries.length, AGENT_IDS.length);

  for (const [legacyType, canonicalId] of entries) {
    const ref = normalizeAgentReference({ agentType: legacyType });
    assert.equal(ref.canonicalId, canonicalId);
    assert.equal(ref.agentId, canonicalId);
    assert.equal(ref.legacyType, legacyType);
    assert.equal(ref.agentType, legacyType);
    assert.equal(ref.displayName, LEGACY_DISPLAY_NAMES[legacyType]);
    assert.equal(ref.display.name, LEGACY_DISPLAY_NAMES[legacyType]);
    assert.ok(ref.manifest.allowedTools.length > 0);
  }
});
test("task, project, and lead runtime scopes are selected for canonical context", () => {
  const context = buildAgentContextFromRuntime({
    agent: { id: "lead_hunter", name: "线索猎人", role: "监控互动并推进留资" },
    task: {
      taskRunId: "run-001",
      taskText: "找高意向客户",
      project: { id: "project-001" },
      lead: { id: "lead-001" }
    },
    memoryRecords: [
      { id: "organization", scope: "organization", status: "active", summary: "组织规则", relevance: 0.1 },
      { id: "project", scope: "project", projectId: "project-001", status: "active", summary: "项目规则", relevance: 0.2 },
      { id: "task", scope: "task", taskId: "run-001", status: "active", summary: "任务规则", relevance: 0.3 },
      { id: "lead", scope: "lead", leadId: "lead-001", status: "active", summary: "客户规则", relevance: 0.4 },
      { id: "other-project", scope: "project", projectId: "other", status: "active", summary: "别的项目", relevance: 1 }
    ]
  });

  assert.equal(context.agentId, "lead_miner");
  assert.equal(context.legacyType, "Browser Agent");
  assert.equal(context.task.id, "run-001");
  assert.equal(context.task.projectId, "project-001");
  assert.equal(context.task.leadId, "lead-001");
  assert.deepEqual(
    context.relevantMemories.map((item) => item.id),
    ["lead", "task", "project", "organization"]
  );
});

test("subagent payload maps scenario id while retaining renderer display fields", () => {
  const payload = {
    id: "skill-run-001",
    agentId: "lead_hunter",
    agentType: "Browser Agent",
    agentName: "线索猎人",
    role: "监控互动并推进留资",
    status: "running",
    text: "开始观察互动",
    reasoning: "private value must never leave the adapter"
  };
  const normalized = normalizeSubagentPayload(payload);

  assert.equal(normalized.agentId, "lead_miner");
  assert.equal(normalized.canonicalAgentId, "lead_miner");
  assert.equal(normalized.legacyType, "Browser Agent");
  assert.equal(normalized.agentType, "Browser Agent");
  assert.equal(normalized.agentName, "线索猎人");
  assert.equal(normalized.role, "监控互动并推进留资");
  assert.equal(normalized.reasoning, undefined);
  assert.equal(payload.agentId, "lead_hunter");
  assert.equal(payload.reasoning, "private value must never leave the adapter");
});

test("event payload normalizes nested agent identity without changing event fields", () => {
  const event = {
    t: "sub-start",
    type: "skill.started",
    sequence: 2,
    agent: { id: "outreach_strategist", name: "触达策略师", role: "生成首触方案" },
    text: "准备触达"
  };
  const normalized = normalizeAgentEventPayload(event);

  assert.equal(normalized.t, "sub-start");
  assert.equal(normalized.type, "skill.started");
  assert.equal(normalized.sequence, 2);
  assert.equal(normalized.agentId, "outreach_specialist");
  assert.equal(normalized.legacyType, "Outreach Agent");
  assert.equal(normalized.agentType, "Outreach Agent");
  assert.equal(normalized.agentName, "触达策略师");
  assert.equal(normalized.agent.canonicalAgentId, "outreach_specialist");
  assert.equal(normalized.agent.name, "触达策略师");
  assert.equal(event.agent.id, "outreach_strategist");
});

test("event payload accepts a legacy agent string and exposes reverse identity", () => {
  const normalized = normalizeAgentEventPayload({
    t: "sub-start",
    agent: "Search Agent",
    text: "开始分析"
  });

  assert.equal(normalized.agentId, "lead_analyst");
  assert.equal(normalized.agentType, "Search Agent");
  assert.equal(normalized.agent.displayName, "数据分析师");
  assert.equal(legacyAgentTypeFor("result_analyst"), "Search Agent");
});

test("scenario compatibility remains explicit and unsupported roles fail closed", () => {
  for (const [scenarioId, canonicalId] of Object.entries(SCENARIO_AGENT_ALIASES)) {
    assert.equal(resolveRuntimeAgentId(scenarioId), canonicalId);
  }
  for (const unsupported of Object.keys(UNSUPPORTED_RUNTIME_AGENT_ALIASES)) {
    assert.throws(
      () => resolveRuntimeAgentId(unsupported),
      new RegExp(`Unsupported (?:runtime )?agent alias: ${unsupported.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`)
    );
  }
});

test("unknown and inherited ids are rejected consistently", () => {
  for (const input of ["unknown_agent", "toString", "constructor", "__proto__"]) {
    assert.throws(() => resolveRuntimeAgentId(input), /Unknown agent id:/);
    assert.throws(() => normalizeAgentReference({ agentType: input }), /Unknown agent id:/);
  }
  assert.throws(() => normalizeSubagentPayload({ agentType: "File Agent" }), /Unsupported runtime agent alias|Unsupported legacy agent alias/);
  assert.throws(() => buildAgentContextFromRuntime({ agent: { agentType: "File Agent" } }), /Unsupported runtime agent alias|Unsupported legacy agent alias/);
});

test("normalization does not mutate runtime inputs", () => {
  const agent = {
    agentType: "Search Agent",
    identity: { name: "数据分析师", avatar: { src: "/avatar.png" } },
    role: { position: "自定义分析", responsibilities: ["评分"] }
  };
  const task = {
    id: "task-immutable",
    project: { id: "project-immutable" },
    lead: { id: "lead-immutable" },
    chainOfThought: "private"
  };
  const memories = [{ id: "m-1", scope: "task", taskId: "task-immutable", status: "active", summary: "记忆", meta: { tags: ["a"] } }];
  const before = JSON.stringify({ agent, task, memories });
  const context = buildAgentContextFromRuntime({ agent, task, memoryRecords: memories });
  context.agent.display.avatar.src = "/changed.png";
  context.relevantMemories[0].meta.tags.push("b");

  assert.equal(JSON.stringify({ agent, task, memories }), before);
  assert.equal(context.task.chainOfThought, undefined);
  assert.equal(context.relevantMemories[0].meta.tags.includes("b"), true);
});
