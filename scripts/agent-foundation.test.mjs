import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  AGENT_IDS,
  createAgentContext,
  getAgentManifest,
  LEGACY_AGENT_ALIASES,
  listAgentManifests,
  proposeMemoryWrite,
  renderAgentSystemContext,
  resolveAgentId,
  selectRelevantMemories
} from "../src/salebuddy/agents/agent-foundation.js";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("agent foundation exposes nine immutable default manifests with matching config bundles", () => {
  const manifests = listAgentManifests();
  assert.equal(manifests.length, 9);
  assert.deepEqual(manifests.map((item) => item.id), AGENT_IDS);
  const containsChinese = /[\u4e00-\u9fff]/;

  for (const agentId of AGENT_IDS) {
    const bundleDir = path.join(projectRoot, "agent-config", "byering", agentId);
    const manifestFile = path.join(bundleDir, "MANIFEST.json");
    const soulFile = path.join(bundleDir, "SOUL.md");
    const policyFile = path.join(bundleDir, "POLICY.md");

    assert.equal(existsSync(manifestFile), true, `${agentId} missing MANIFEST.json`);
    assert.equal(existsSync(soulFile), true, `${agentId} missing SOUL.md`);
    assert.equal(existsSync(policyFile), true, `${agentId} missing POLICY.md`);

    const manifest = JSON.parse(readFileSync(manifestFile, "utf8"));
    const soul = readFileSync(soulFile, "utf8");
    const policy = readFileSync(policyFile, "utf8");
    const context = createAgentContext({
      agentId,
      task: { id: `task-${agentId}`, title: "校验配置同步" }
    });

    assert.deepEqual(getAgentManifest(agentId), manifest);
    assert.equal(soul.trim().length > 0, true, `${agentId} SOUL.md should not be empty`);
    assert.equal(policy.trim().length > 0, true, `${agentId} POLICY.md should not be empty`);
    assert.equal(soul.includes(agentId), true, `${agentId} SOUL.md should contain agent id`);
    assert.equal(policy.includes(agentId), true, `${agentId} POLICY.md should contain agent id`);
    assert.equal(containsChinese.test(soul), true, `${agentId} SOUL.md should contain Chinese text`);
    assert.equal(containsChinese.test(policy), true, `${agentId} POLICY.md should contain Chinese text`);
    assert.equal(soul.includes(context.soul.identity), true, `${agentId} SOUL.md should contain runtime soul identity`);
    assert.equal(soul.includes(context.soul.tone), true, `${agentId} SOUL.md should contain runtime soul tone`);
    for (const principle of context.soul.principles) {
      assert.equal(soul.includes(principle), true, `${agentId} SOUL.md should contain runtime principle: ${principle}`);
    }
    for (const bullet of context.policy.hard) {
      assert.equal(policy.includes(bullet), true, `${agentId} POLICY.md should contain runtime policy: ${bullet}`);
    }
  }
});

test("agent foundation rejects unknown agents with a clear error", () => {
  assert.throws(
    () => getAgentManifest("unknown_agent"),
    /Unknown agent id: unknown_agent/
  );
});

test("resolveAgentId maps legacy UI agent types to canonical ids", () => {
  assert.equal(resolveAgentId("chief_of_staff"), "chief_of_staff");
  assert.equal(resolveAgentId("Browser Agent"), "lead_miner");
  assert.equal(resolveAgentId("Outreach Ops Agent"), "outreach_operator");
  assert.deepEqual(LEGACY_AGENT_ALIASES, {
    main: "chief_of_staff",
    "Strategy Agent": "acquisition_strategist",
    "Browser Agent": "lead_miner",
    "Search Agent": "lead_analyst",
    "Research Agent": "prospect_researcher",
    "App Agent": "sales_consultant",
    "Risk Agent": "risk_specialist",
    "Outreach Agent": "outreach_specialist",
    "Outreach Ops Agent": "outreach_operator"
  });
  assert.equal(getAgentManifest("Browser Agent").id, "lead_miner");
  assert.equal(createAgentContext({ agentId: "main", task: { id: "task-legacy", title: "兼容旧入口" } }).agentId, "chief_of_staff");
});

test("resolveAgentId rejects inherited keys and unsupported legacy aliases", () => {
  for (const input of ["toString", "constructor", "__proto__"]) {
    assert.throws(
      () => resolveAgentId(input),
      new RegExp(`Unknown agent id: ${input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`)
    );
    assert.throws(
      () => getAgentManifest(input),
      new RegExp(`Unknown agent id: ${input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`)
    );
  }

  assert.throws(
    () => resolveAgentId("File Agent"),
    /Unsupported legacy agent alias: File Agent/
  );
  assert.throws(
    () => createAgentContext({
      agentId: "File Agent",
      task: { id: "task-file-agent", title: "旧内容策划入口" }
    }),
    /Unsupported legacy agent alias: File Agent/
  );
  assert.throws(
    () => selectRelevantMemories([], {
      scopes: ["agent"],
      agentId: "File Agent",
      limit: 5
    }),
    /Unsupported legacy agent alias: File Agent/
  );
});

test("selectRelevantMemories filters inactive and expired records, matches scope, and respects ranking plus limit", () => {
  const records = [
    {
      id: "org-latest",
      scope: "organization",
      status: "active",
      summary: "组织层规则",
      relevance: 0.72,
      updatedAt: "2026-08-18T09:00:00.000Z"
    },
    {
      id: "agent-top",
      scope: "agent",
      scopeId: "lead_miner",
      status: "active",
      summary: "线索挖掘偏好",
      relevance: 0.91,
      updatedAt: "2026-08-18T08:00:00.000Z"
    },
    {
      id: "task-top",
      scope: "task",
      taskId: "task-001",
      status: "active",
      summary: "本任务优先级",
      relevance: 0.91,
      updatedAt: "2026-08-18T10:00:00.000Z"
    },
    {
      id: "lead-mid",
      scope: "lead",
      leadId: "lead-001",
      status: "active",
      summary: "客户画像",
      relevance: 0.88,
      updatedAt: "2026-08-18T07:00:00.000Z"
    },
    {
      id: "inactive",
      scope: "agent",
      scopeId: "lead_miner",
      status: "archived",
      relevance: 0.99,
      updatedAt: "2026-08-18T11:00:00.000Z"
    },
    {
      id: "expired",
      scope: "task",
      taskId: "task-001",
      status: "active",
      relevance: 0.95,
      expiresAt: "2025-08-18T00:00:00.000Z",
      updatedAt: "2026-08-18T11:30:00.000Z"
    }
  ];

  const selected = selectRelevantMemories(records, {
    scopes: ["task", "agent", "lead", "organization"],
    agentId: "lead_miner",
    taskId: "task-001",
    leadId: "lead-001",
    limit: 3
  });

  assert.deepEqual(selected.map((item) => item.id), ["task-top", "agent-top", "lead-mid"]);
});

test("selectRelevantMemories canonicalizes legacy agent memory references", () => {
  const records = [
    {
      id: "legacy-scope-id",
      scope: "agent",
      scopeId: "Browser Agent",
      status: "active",
      summary: "旧 UI scopeId 记忆",
      relevance: 0.82
    },
    {
      id: "legacy-agent-id",
      scope: "agent",
      agentId: "Browser Agent",
      status: "active",
      summary: "旧 UI agentId 记忆",
      relevance: 0.81
    }
  ];

  const selected = selectRelevantMemories(records, {
    scopes: ["agent"],
    agentId: "lead_miner",
    limit: 5
  });

  assert.deepEqual(selected.map((item) => item.id), ["legacy-scope-id", "legacy-agent-id"]);
  assert.deepEqual(selected.map((item) => item.agentId), ["lead_miner", "lead_miner"]);
});

test("selectRelevantMemories skips records when scopeId conflicts with explicit scoped identity", () => {
  const records = [
    {
      id: "conflict-agent-scope",
      scope: "agent",
      scopeId: "Browser Agent",
      agentId: "chief_of_staff",
      status: "active",
      summary: "冲突的 agent 记忆",
      relevance: 0.99
    },
    {
      id: "valid-agent-scope",
      scope: "agent",
      scopeId: "Browser Agent",
      agentId: "lead_miner",
      status: "active",
      summary: "一致的 agent 记忆",
      relevance: 0.8
    }
  ];

  const selected = selectRelevantMemories(records, {
    scopes: ["agent"],
    agentId: "lead_miner",
    limit: 5
  });
  const conflictingLookup = selectRelevantMemories(records, {
    scopes: ["agent"],
    agentId: "chief_of_staff",
    limit: 5
  });

  assert.deepEqual(selected.map((item) => item.id), ["valid-agent-scope"]);
  assert.deepEqual(conflictingLookup, []);
});

test("selectRelevantMemories supports project scope hit miss and ordering against organization memories", () => {
  const records = [
    {
      id: "project-top",
      scope: "project",
      projectId: "project-001",
      status: "active",
      summary: "项目层关键要求",
      relevance: 0.83,
      updatedAt: "2026-08-18T09:00:00.000Z"
    },
    {
      id: "project-miss",
      scope: "project",
      projectId: "project-999",
      status: "active",
      summary: "不该命中的项目记忆",
      relevance: 0.99,
      updatedAt: "2026-08-18T12:00:00.000Z"
    },
    {
      id: "org-same-relevance",
      scope: "organization",
      status: "active",
      summary: "组织层共识",
      relevance: 0.83,
      updatedAt: "2026-08-18T11:00:00.000Z"
    },
    {
      id: "agent-lower",
      scope: "agent",
      scopeId: "lead_analyst",
      status: "active",
      summary: "岗位偏好",
      relevance: 0.8,
      updatedAt: "2026-08-18T10:00:00.000Z"
    }
  ];

  const selected = selectRelevantMemories(records, {
    scopes: ["project", "organization", "agent"],
    projectId: "project-001",
    agentId: "lead_analyst",
    limit: 5
  });

  assert.deepEqual(selected.map((item) => item.id), ["project-top", "org-same-relevance", "agent-lower"]);
});

test("selectRelevantMemories includes project scope by default when projectId is present", () => {
  const records = [
    {
      id: "project-default",
      scope: "project",
      projectId: "project-default-1",
      status: "active",
      summary: "默认 project 记忆",
      relevance: 0.77
    },
    {
      id: "org-default",
      scope: "organization",
      status: "active",
      summary: "默认 organization 记忆",
      relevance: 0.6
    }
  ];

  const selected = selectRelevantMemories(records, {
    projectId: "project-default-1",
    limit: 5
  });

  assert.deepEqual(selected.map((item) => item.id), ["project-default", "org-default"]);
});

test("selectRelevantMemories skips invalid records and enforces scope id invariants", () => {
  const records = [
    null,
    "memory",
    12,
    [],
    {
      id: "valid-org",
      status: "active",
      summary: "组织有效记忆",
      relevance: 0.7,
      updatedAt: "2026-08-18T09:00:00.000Z"
    },
    {
      id: "bad-scope",
      scope: "unknown-scope",
      status: "active",
      summary: "无效 scope",
      relevance: 1
    },
    {
      id: "bad-status",
      scope: "organization",
      status: "staged",
      summary: "无效 status",
      relevance: 1
    },
    {
      id: "missing-project-id",
      scope: "project",
      status: "active",
      summary: "缺少 projectId",
      relevance: 1
    },
    {
      id: "missing-task-id",
      scope: "task",
      status: "active",
      summary: "缺少 taskId",
      relevance: 1
    },
    {
      id: "valid-project",
      scope: "project",
      projectId: "project-01",
      status: "active",
      summary: "项目有效记忆",
      relevance: 0.8
    },
    {
      id: "bad-expires-at",
      scope: "organization",
      status: "active",
      summary: "非法 expiresAt 不应保留",
      relevance: 0.99,
      expiresAt: "not-a-date"
    }
  ];

  const selected = selectRelevantMemories(records, {
    scopes: ["organization", "project"],
    projectId: "project-01",
    limit: 5
  });

  assert.deepEqual(selected.map((item) => item.id), ["valid-project", "valid-org"]);
});

test("proposeMemoryWrite only returns a pending proposal envelope", () => {
  const proposal = proposeMemoryWrite({
    agentId: "sales_consultant",
    scope: "lead",
    leadId: "lead-002",
    kind: "objection",
    summary: "客户对报价敏感",
    evidence: [{ type: "call_note", ref: "call-17" }]
  });

  assert.equal(proposal.status, "pending");
  assert.equal(proposal.persisted, false);
  assert.equal(proposal.record.agentId, "sales_consultant");
  assert.equal(proposal.record.scope, "lead");
  assert.equal(proposal.record.leadId, "lead-002");
});

test("proposeMemoryWrite rejects invalid scopes and missing scope identifiers", () => {
  assert.throws(
    () => proposeMemoryWrite({ agentId: "sales_consultant", scope: "unknown", summary: "x" }),
    /Invalid memory scope: unknown/
  );
  assert.throws(
    () => proposeMemoryWrite({ scope: "project", summary: "缺少 projectId" }),
    /Memory scope project requires projectId/
  );
  assert.throws(
    () => proposeMemoryWrite({ scope: "lead", summary: "缺少 leadId" }),
    /Memory scope lead requires leadId/
  );
});

test("renderAgentSystemContext keeps auditable ordering without exposing hidden reasoning", () => {
  const context = createAgentContext({
    agentId: "outreach_specialist",
    task: {
      id: "task-outreach-1",
      title: "跟进高意向客户",
      goal: "形成首轮触达方案"
    },
    policy: {
      hard: [
        "不得伪造客户信息",
        "只输出结论、依据与下一步，不输出隐藏思维链"
      ]
    },
    memory: {
      records: [
        {
          id: "mem-1",
          scope: "agent",
          scopeId: "outreach_specialist",
          status: "active",
          summary: "优先给出一句话开场白",
          relevance: 0.8,
          updatedAt: "2026-08-18T09:00:00.000Z"
        }
      ]
    },
    evidence: [
      { type: "crm", ref: "lead-1", detail: "客户最近浏览了报价页" }
    ]
  });

  const rendered = renderAgentSystemContext(context);
  const order = [
    "## Hard Policy",
    "## Soul",
    "## Manifest",
    "## Task",
    "## Relevant Memory",
    "## Evidence"
  ].map((token) => rendered.indexOf(token));

  assert.equal(order.every((position) => position >= 0), true);
  assert.equal(order.every((position, index) => index === 0 || position > order[index - 1]), true);
  assert.equal(rendered.includes("隐藏思维链"), true);
  assert.equal(rendered.includes("chain-of-thought"), false);
});

test("createAgentContext restores universal hard safety rule for every agent", () => {
  for (const agentId of AGENT_IDS) {
    const context = createAgentContext({
      agentId,
      task: { id: `task-rule-${agentId}`, title: "统一安全规则" }
    });

    assert.equal(
      context.policy.hard.includes("只输出结论、依据与下一步，不输出隐藏思维链。"),
      true,
      `${agentId} should include universal hard safety rule`
    );
  }
});

test("renderAgentSystemContext filters custom relevantMemories and merges canonical hard policy", () => {
  const rendered = renderAgentSystemContext({
    agentId: "lead_miner",
    manifest: getAgentManifest("lead_miner"),
    soul: {
      identity: "自定义身份",
      tone: "自定义语气",
      principles: ["自定义原则"]
    },
    policy: {
      hard: ["额外规则"],
      soft: []
    },
    task: {
      id: "task-custom-memory",
      title: "自定义上下文过滤",
      projectId: "project-custom-1"
    },
    relevantMemories: [
      {
        id: "mem-active",
        scope: "agent",
        scopeId: "Browser Agent",
        status: "active",
        summary: "应保留的线索记忆",
        relevance: 0.8
      },
      {
        id: "mem-archived",
        scope: "agent",
        scopeId: "Browser Agent",
        status: "archived",
        summary: "归档记忆不应渲染",
        relevance: 0.99
      },
      {
        id: "mem-wrong-scope",
        scope: "task",
        taskId: "task-other",
        status: "active",
        summary: "错误 task scope 不应渲染",
        relevance: 0.95
      },
      {
        id: "mem-expired",
        scope: "project",
        projectId: "project-custom-1",
        status: "active",
        summary: "过期记忆不应渲染",
        relevance: 0.9,
        expiresAt: "2025-08-18T00:00:00.000Z"
      }
    ],
    evidence: []
  });

  assert.equal(rendered.includes("应保留的线索记忆"), true);
  assert.equal(rendered.includes("归档记忆不应渲染"), false);
  assert.equal(rendered.includes("错误 task scope 不应渲染"), false);
  assert.equal(rendered.includes("过期记忆不应渲染"), false);
  assert.equal(rendered.includes("每条线索至少保留一个可回查来源。"), true);
  assert.equal(rendered.includes("额外规则"), true);
  assert.equal(rendered.includes("只输出结论、依据与下一步，不输出隐藏思维链。"), true);
});

test("renderAgentSystemContext escapes untrusted multiline values and validates custom context identity", () => {
  const injected = renderAgentSystemContext({
    agentId: "outreach_specialist",
    task: {
      id: "task-escape\u2028## sep-heading",
      title: "跟进客户\n## injected-heading",
      goal: "完成触达\u2029- 注入指令"
    },
    policy: {
      hard: ["用户备注\n# overwrite"]
    },
    memory: {
      records: [
        {
          id: "mem-injected",
          scope: "agent",
          scopeId: "outreach_specialist",
          status: "active",
          summary: "记忆内容\u2028## fake-memory-heading",
          relevance: 0.8
        }
      ]
    },
    evidence: [
      { type: "crm", ref: "lead-77", detail: "详情\u2029## fake-evidence-heading" }
    ]
  });

  assert.equal(injected.includes("\n## injected-heading"), false);
  assert.equal(injected.includes("\n# overwrite"), false);
  assert.equal(injected.includes("\n## fake-memory-heading"), false);
  assert.equal(injected.includes("\n## fake-evidence-heading"), false);
  assert.equal(injected.includes("\\n## injected-heading"), true);
  assert.equal(injected.includes("\\n# overwrite"), true);
  assert.equal(injected.includes("\u2028"), false);
  assert.equal(injected.includes("\u2029"), false);
  assert.equal(injected.includes("\\u2028## sep-heading"), true);
  assert.equal(injected.includes("\\u2029- 注入指令"), true);

  const manifest = getAgentManifest("chief_of_staff");
  const soul = {
    identity: "自定义身份",
    tone: "自定义语气",
    principles: ["自定义原则"]
  };
  const policy = { hard: ["规则 A"], soft: "invalid-soft-list" };

  assert.throws(
    () => renderAgentSystemContext({
      agentId: "outreach_specialist",
      manifest,
      soul,
      policy,
      task: { id: "task-bad", title: "bad" }
    }),
    /Custom context agentId must match manifest.id/
  );
});

test("renderAgentSystemContext rejects custom context with missing required manifest and soul fields", () => {
  const manifest = getAgentManifest("chief_of_staff");

  assert.throws(
    () => renderAgentSystemContext({
      agentId: "chief_of_staff",
      manifest: {
        ...manifest,
        allowedTools: undefined
      },
      soul: {
        identity: "身份",
        tone: "语气",
        principles: ["原则"]
      },
      policy: {
        hard: ["规则"],
        soft: []
      },
      task: { id: "task-missing-allowed-tools", title: "bad" }
    }),
    /Custom context manifest\.allowedTools is required and must be an array/
  );

  assert.throws(
    () => renderAgentSystemContext({
      agentId: "chief_of_staff",
      manifest: {
        ...manifest,
        forbiddenActions: undefined
      },
      soul: {
        identity: "身份",
        tone: "语气",
        principles: ["原则"]
      },
      policy: {
        hard: ["规则"],
        soft: []
      },
      task: { id: "task-missing-forbidden-actions", title: "bad" }
    }),
    /Custom context manifest\.forbiddenActions is required and must be an array/
  );

  assert.throws(
    () => renderAgentSystemContext({
      agentId: "chief_of_staff",
      manifest: {
        ...manifest,
        completionCriteria: undefined
      },
      soul: {
        identity: "身份",
        tone: "语气",
        principles: ["原则"]
      },
      policy: {
        hard: ["规则"],
        soft: []
      },
      task: { id: "task-missing-completion", title: "bad" }
    }),
    /Custom context manifest\.completionCriteria is required and must be an array/
  );

  assert.throws(
    () => renderAgentSystemContext({
      agentId: "chief_of_staff",
      manifest,
      soul: {
        identity: "身份",
        tone: "语气"
      },
      policy: {
        hard: ["规则"],
        soft: []
      },
      task: { id: "task-missing-principles", title: "bad" }
    }),
    /Custom context soul\.principles is required and must be an array/
  );
});

test("renderAgentSystemContext rejects malformed required string fields in custom context", () => {
  const manifest = getAgentManifest("chief_of_staff");
  const soul = {
    identity: "身份",
    tone: "语气",
    principles: ["原则"]
  };
  const policy = {
    hard: ["规则"],
    soft: []
  };

  assert.throws(
    () => renderAgentSystemContext({
      agentId: "chief_of_staff",
      manifest: {
        ...manifest,
        role: 42
      },
      soul,
      policy,
      task: { id: "task-bad-role", title: "bad" }
    }),
    /Custom context manifest\.role must be a non-empty string/
  );

  assert.throws(
    () => renderAgentSystemContext({
      agentId: "chief_of_staff",
      manifest: {
        ...manifest,
        mission: null
      },
      soul,
      policy,
      task: { id: "task-bad-mission", title: "bad" }
    }),
    /Custom context manifest\.mission must be a non-empty string/
  );

  assert.throws(
    () => renderAgentSystemContext({
      agentId: "chief_of_staff",
      manifest: {
        ...manifest,
        reportsTo: {}
      },
      soul,
      policy,
      task: { id: "task-bad-reports", title: "bad" }
    }),
    /Custom context manifest\.reportsTo must be a non-empty string/
  );

  assert.throws(
    () => renderAgentSystemContext({
      agentId: "chief_of_staff",
      manifest,
      soul: {
        ...soul,
        identity: []
      },
      policy,
      task: { id: "task-bad-identity", title: "bad" }
    }),
    /Custom context soul\.identity must be a non-empty string/
  );

  assert.throws(
    () => renderAgentSystemContext({
      agentId: "chief_of_staff",
      manifest,
      soul: {
        ...soul,
        tone: ""
      },
      policy,
      task: { id: "task-bad-tone", title: "bad" }
    }),
    /Custom context soul\.tone must be a non-empty string/
  );
});

test("manifest accessors and created context do not expose mutable global state", () => {
  const manifest = getAgentManifest("chief_of_staff");
  manifest.displayName = "Mutated";
  manifest.allowedTools.push("dangerous_tool");

  const fresh = getAgentManifest("chief_of_staff");
  assert.notEqual(fresh.displayName, "Mutated");
  assert.equal(fresh.allowedTools.includes("dangerous_tool"), false);

  const context = createAgentContext({
    agentId: "chief_of_staff",
    task: { id: "task-immutable", title: "复盘本周 pipeline" },
    memory: {
      records: [
        {
          id: "mem-safe",
          scope: "agent",
          scopeId: "chief_of_staff",
          status: "active",
          summary: "先给判断再给建议",
          relevance: 0.7,
          updatedAt: "2026-08-18T06:00:00.000Z"
        }
      ]
    }
  });

  context.relevantMemories[0].summary = "changed";
  const rerendered = createAgentContext({
    agentId: "chief_of_staff",
    task: { id: "task-immutable", title: "复盘本周 pipeline" },
    memory: {
      records: [
        {
          id: "mem-safe",
          scope: "agent",
          scopeId: "chief_of_staff",
          status: "active",
          summary: "先给判断再给建议",
          relevance: 0.7,
          updatedAt: "2026-08-18T06:00:00.000Z"
        }
      ]
    }
  });

  assert.equal(rerendered.relevantMemories[0].summary, "先给判断再给建议");
});

test("renderAgentSystemContext tolerates cyclic custom data and non-array malformed records", () => {
  const manifest = getAgentManifest("chief_of_staff");
  manifest.self = manifest;
  manifest.loadedAt = new Date("2026-08-18T00:00:00.000Z");
  manifest.outputSchema = { type: "object" };
  manifest.outputSchema.self = manifest.outputSchema;
  manifest.outputSchema.maxCount = 3n;

  const soul = {
    identity: "循环身份",
    tone: "循环语气",
    principles: ["循环原则"],
    createdAt: new Date("2026-08-18T01:00:00.000Z")
  };
  soul.self = soul;

  const rendered = renderAgentSystemContext({
    agentId: "chief_of_staff",
    manifest,
    soul,
    policy: {
      hard: ["规则 1"],
      soft: ["软规则 1"]
    },
    task: { id: "task-cycle", title: "循环测试" },
    relevantMemories: "not-an-array",
    evidence: [{ type: "note", ref: "ev-1", detail: "正常证据" }]
  });

  assert.equal(rendered.includes("循环测试"), true);
  assert.equal(rendered.includes("[Circular]"), true);
  assert.equal(rendered.includes("3n"), true);

  const selected = selectRelevantMemories("not-an-array", {
    scopes: ["organization"],
    limit: 3
  });

  assert.deepEqual(selected, []);
});
