import test from "node:test";
import assert from "node:assert/strict";
import { createControlPlane } from "../backend/control-plane.js";
import { createControlPlaneHttpServer } from "../backend/http-server.js";
import {
  RequirementUnderstandingError,
  createRequirementUnderstandingService,
  normalizeRequirementProposal
} from "../backend/requirement-understanding.js";

test("requirement service turns the model JSON into a validated proposal", async () => {
  const service = createRequirementUnderstandingService({
    endpoint: "https://llm.test/chat/completions",
    apiKey: "test-key",
    model: "test-model",
    fetchImpl: async (url, request) => {
      assert.equal(url, "https://llm.test/chat/completions");
      assert.equal(request.method, "POST");
      assert.equal(request.headers.Authorization, "Bearer test-key");
      const body = JSON.parse(request.body);
      assert.equal(body.model, "test-model");
      assert.equal(body.temperature, 0);
      assert.deepEqual(body.thinking, { type: "disabled" });
      assert.equal(body.response_format.type, "json_object");
      assert.match(body.messages.at(-1).content, /预算信号/);
      return new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({
          title: "抖音购车潜客触达",
          objective: "找出有明确购车意向的潜客并准备首触",
          scope: "抖音互动、车型表达、预算信号与公开资料",
          deliverable: "候选清单、证据摘要和首触建议",
          guardrail: "只读检索；发送前必须人工审批",
          touchPlan: {
            source: "抖音互动",
            audience: "有车型和预算信号的买车客户",
            signal: "近期评论或私信表达购车需求",
            filter: "排除已拒绝、重复和无证据账号",
            timeWindow: "近30天",
            action: "生成首触草稿并等待审批"
          }
        }) } }]
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
  });

  const proposal = await service.understand({ taskId: "task-1", goal: "帮我找有车型和预算信号的买车客户" });
  assert.equal(proposal.schemaVersion, 1);
  assert.equal(proposal.source, "model");
  assert.equal(proposal.objective, "找出有明确购车意向的潜客并准备首触");
  assert.equal(proposal.touchPlan.audience, "有车型和预算信号的买车客户");
  assert.equal(proposal.missing.length, 0);
  assert.equal(proposal.analysis, undefined);
});

test("missing model configuration fails closed instead of returning a template", async () => {
  const service = createRequirementUnderstandingService({ endpoint: "", apiKey: "" });
  await assert.rejects(
    () => service.understand({ taskId: "task-1", goal: "找潜客" }),
    (error) => error instanceof RequirementUnderstandingError && error.code === "REQUIREMENT_MODEL_NOT_CONFIGURED"
  );
});

test("proposal validation rejects hidden reasoning fields", () => {
  assert.throws(
    () => normalizeRequirementProposal({
      title: "需求",
      objective: "目标",
      scope: "范围",
      deliverable: "结果",
      guardrail: "边界",
      analysis_trace: "不得持久化"
    }),
    (error) => error.code === "INVALID_REQUIREMENT_PROPOSAL"
  );
});

test("proposal validation accepts list-shaped model fields", () => {
  const proposal = normalizeRequirementProposal({
    title: "列表字段需求",
    objective: ["筛选线索", "准备触达"],
    scope: ["抖音互动", "公开资料"],
    deliverable: ["候选清单", "证据摘要"],
    guardrail: ["审批前不发送", "不编造结果"]
  });
  assert.equal(proposal.objective, "筛选线索；准备触达");
  assert.equal(proposal.scope, "抖音互动；公开资料");
  assert.equal(proposal.deliverable, "候选清单；证据摘要");
  assert.equal(proposal.guardrail, "审批前不发送；不编造结果");
});

test("requirement service retries an incomplete model proposal with a repair prompt", async () => {
  let calls = 0;
  const service = createRequirementUnderstandingService({
    endpoint: "https://llm.test/chat/completions",
    apiKey: "test-key",
    model: "test-model",
    fetchImpl: async (_url, request) => {
      calls += 1;
      const body = JSON.parse(request.body);
      if (calls === 1) {
        return new Response(JSON.stringify({
          choices: [{ message: { content: JSON.stringify({
            title: "不完整提案",
            objective: "筛选潜客",
            deliverable: "候选清单",
            guardrail: "审批前不发送"
          }) } }]
        }), { status: 200 });
      }
      assert.equal(body.messages.at(-1).content.includes('"repairAttempt":true'), true);
      assert.match(body.messages[0].content, /结构化修复尝试/);
      return new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({
          title: "修复后的提案",
          objective: "筛选潜客",
          scope: ["抖音公开互动"],
          deliverable: ["候选清单"],
          guardrail: ["审批前不发送"]
        }) } }]
      }), { status: 200 });
    }
  });
  const proposal = await service.understand({ taskId: "retry-1", goal: "找潜客" });
  assert.equal(calls, 2);
  assert.equal(proposal.title, "修复后的提案");
  assert.equal(proposal.scope, "抖音公开互动");
});

test("control plane persists and replays the model proposal event", async () => {
  const calls = [];
  const plane = createControlPlane({
    idFactory: (() => { let n = 0; return () => `req-${++n}`; })(),
    requirementService: {
      async understand(input) {
        calls.push(input);
        return normalizeRequirementProposal({
          title: "真实需求理解",
          objective: "确认可执行目标",
          scope: "已授权数据",
          deliverable: "带依据的结果",
          guardrail: "不执行外部动作"
        }, { source: "model", model: "test-model" });
      }
    }
  });

  const created = await plane.dispatchAsync({
    type: "task.create",
    taskId: "task-req-1",
    commandId: "cmd-req-1",
    idempotencyKey: "idem-req-1",
    payload: { goal: "找潜客", projectId: "room-leads" }
  });
  assert.equal(created.accepted, true);
  assert.equal(created.data.requirement.source, "model");
  assert.equal(plane.getTaskSnapshot("task-req-1").requirements.status, "PROPOSED");
  assert.equal(plane.getTaskSnapshot("task-req-1").requirements.proposal.objective, "确认可执行目标");
  assert.deepEqual(plane.listTaskEvents("task-req-1").map((event) => event.type), [
    "task.created",
    "task.requirement.proposed"
  ]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].goal, "找潜客");

  const replay = await plane.dispatchAsync({
    type: "task.create",
    taskId: "task-req-1",
    commandId: "cmd-req-1",
    idempotencyKey: "idem-req-1",
    payload: { goal: "找潜客", projectId: "room-leads" }
  });
  assert.equal(replay.data.requirement.title, "真实需求理解");
  assert.equal(calls.length, 1);
});

test("requirement edits generate a new proposal and preserve the edit event", async () => {
  let count = 0;
  const plane = createControlPlane({
    idFactory: (() => { let n = 0; return () => `edit-${++n}`; })(),
    requirementService: {
      async understand() {
        count += 1;
        return normalizeRequirementProposal({
          title: `proposal-${count}`,
          objective: `objective-${count}`,
          scope: "scope",
          deliverable: "deliverable",
          guardrail: "guardrail"
        }, { source: "model", model: "test-model" });
      }
    }
  });
  await plane.dispatchAsync({ type: "task.create", taskId: "task-edit-1", commandId: "cmd-create", idempotencyKey: "idem-create", payload: { goal: "初始目标" } });
  await plane.dispatchAsync({
    type: "task.requirement.edit",
    taskId: "task-edit-1",
    expectedVersion: 0,
    commandId: "cmd-edit",
    idempotencyKey: "idem-edit",
    payload: { text: "修改后的目标" }
  });
  const snapshot = plane.getTaskSnapshot("task-edit-1");
  assert.equal(snapshot.goal, "修改后的目标");
  assert.equal(snapshot.requirements.proposal.title, "proposal-2");
  assert.equal(snapshot.requirements.proposal.proposalVersion, 2);
  assert.equal(count, 2);
  assert.deepEqual(plane.listTaskEvents("task-edit-1").map((event) => event.type), [
    "task.created",
    "task.requirement.proposed",
    "task.requirement.edited",
    "task.requirement.proposed"
  ]);
});

test("confirming an older requirement proposal is rejected after an edit", async () => {
  const plane = createControlPlane({
    idFactory: (() => { let n = 0; return () => `stale-${++n}`; })(),
    requirementService: {
      async understand({ goal }) {
        return normalizeRequirementProposal({
          title: "版本化需求",
          objective: goal,
          scope: "公开资料",
          deliverable: "可核验结果",
          guardrail: "不执行外部动作"
        }, { source: "model", model: "test-model" });
      }
    }
  });
  const created = await plane.dispatchAsync({
    type: "task.create",
    taskId: "task-stale-1",
    commandId: "cmd-stale-create",
    idempotencyKey: "idem-stale-create",
    payload: { goal: "初始目标" }
  });
  assert.equal(created.data.requirement.proposalVersion, 1);
  const started = plane.dispatch({
    type: "task.run.start",
    taskId: created.taskId,
    expectedVersion: 0,
    commandId: "cmd-stale-start",
    idempotencyKey: "idem-stale-start",
    payload: { requirementsConfirmed: false }
  });
  await plane.dispatchAsync({
    type: "task.requirement.edit",
    taskId: created.taskId,
    expectedVersion: started.currentVersion,
    commandId: "cmd-stale-edit",
    idempotencyKey: "idem-stale-edit",
    payload: { text: "修改后的目标" }
  });
  const snapshot = plane.getTaskSnapshot(created.taskId);
  assert.equal(snapshot.requirements.proposal.proposalVersion, 2);
  assert.throws(
    () => plane.dispatch({
      type: "task.requirement.confirm",
      taskId: created.taskId,
      expectedVersion: snapshot.version,
      commandId: "cmd-stale-confirm",
      idempotencyKey: "idem-stale-confirm",
      payload: { proposalVersion: 1 }
    }),
    (error) => error.code === "REQUIREMENT_PROPOSAL_STALE"
  );
});

test("HTTP task creation waits for the real requirement Agent", async (t) => {
  const server = createControlPlaneHttpServer({
    controlPlane: createControlPlane({
      requirementService: {
        async understand({ goal }) {
          return normalizeRequirementProposal({
            title: "HTTP proposal",
            objective: goal,
            scope: "公开资料",
            deliverable: "可核验结果",
            guardrail: "不执行外部动作"
          }, { source: "model", model: "test-model" });
        }
      }
    })
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const response = await fetch(`${base}/v1/tasks`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ taskId: "http-task-1", goal: "真实理解这条任务" })
  });
  assert.equal(response.status, 202);
  const body = await response.json();
  assert.equal(body.data.requirement.source, "model");
  assert.equal((await (await fetch(`${base}/v1/tasks/http-task-1/events`)).json()).events.at(-1).type, "task.requirement.proposed");
});

test("HTTP task creation fails closed when the Agent is disabled", async (t) => {
  const server = createControlPlaneHttpServer({ controlPlane: createControlPlane({ requirementService: null }) });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const response = await fetch(`http://127.0.0.1:${server.address().port}/v1/tasks`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ goal: "不得使用前端模板" })
  });
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error.code, "REQUIREMENT_AGENT_NOT_CONFIGURED");
});

test("model failures are recorded as replayable requirement events", async () => {
  const plane = createControlPlane({
    idFactory: (() => { let n = 0; return () => `failure-${++n}`; })(),
    requirementService: createRequirementUnderstandingService({ endpoint: "https://llm.test/chat/completions", apiKey: "" })
  });
  await assert.rejects(
    () => plane.dispatchAsync({ type: "task.create", taskId: "task-failure-1", commandId: "cmd-failure", idempotencyKey: "idem-failure", payload: { goal: "需要真实模型" } }),
    (error) => error.code === "REQUIREMENT_MODEL_NOT_CONFIGURED"
  );
  const snapshot = plane.getTaskSnapshot("task-failure-1");
  assert.equal(snapshot.requirements.status, "FAILED");
  assert.equal(plane.listTaskEvents("task-failure-1").at(-1).type, "task.requirement.failed");
});

test("requirement confirmation cannot bypass the persisted proposal", async () => {
  const plane = createControlPlane({ idFactory: (() => { let n = 0; return () => `guard-${++n}`; })() });
  const created = plane.dispatch({ type: "task.create", taskId: "task-guard-1", commandId: "cmd-guard-create", idempotencyKey: "idem-guard-create", payload: { goal: "确认前必须理解" } });
  plane.dispatch({ type: "task.run.start", taskId: created.taskId, expectedVersion: 0, commandId: "cmd-guard-start", idempotencyKey: "idem-guard-start", payload: { requirementsConfirmed: false } });
  assert.throws(
    () => plane.dispatch({ type: "task.requirement.confirm", taskId: created.taskId, expectedVersion: 1, commandId: "cmd-guard-confirm", idempotencyKey: "idem-guard-confirm", payload: {} }),
    (error) => error.code === "REQUIREMENT_PROPOSAL_REQUIRED"
  );
  assert.equal(plane.getTaskSnapshot(created.taskId).state, "WAITING_REQUIREMENT");
});

test("requirement confirmation emits server-authoritative assignment and access gates", async () => {
  const plane = createControlPlane({
    idFactory: (() => { let n = 0; return () => `gate-${++n}`; })(),
    requirementService: {
      async understand() {
        return normalizeRequirementProposal({
          title: "抖音潜客触达",
          objective: "找到有车型和预算信号的买车客户",
          scope: "抖音互动与公开资料",
          deliverable: "候选清单与首触草稿",
          guardrail: "发送前必须审批"
        }, { source: "model" });
      }
    }
  });
  const created = await plane.dispatchAsync({
    type: "task.create",
    taskId: "task-server-gates",
    commandId: "cmd-server-gates-create",
    idempotencyKey: "idem-server-gates-create",
    payload: { goal: "找车主" }
  });
  const started = plane.dispatch({
    type: "task.run.start",
    taskId: created.taskId,
    expectedVersion: 0,
    commandId: "cmd-server-gates-start",
    idempotencyKey: "idem-server-gates-start",
    payload: { requirementsConfirmed: false }
  });
  const confirmed = plane.dispatch({
    type: "task.requirement.confirm",
    taskId: created.taskId,
    expectedVersion: started.currentVersion,
    commandId: "cmd-server-gates-confirm",
    idempotencyKey: "idem-server-gates-confirm",
    payload: {
      requiresAccess: true,
      provider: "抖音账号",
      account: "Byering 汽车销售账号",
      scopes: ["直播互动与评论", "私信发送（审批后）"]
    }
  });

  assert.equal(confirmed.state, "WAITING_ACCESS");
  assert.equal(confirmed.currentSeq, 6);
  assert.deepEqual(plane.listTaskEvents(created.taskId).map((event) => event.type), [
    "task.created",
    "task.requirement.proposed",
    "task.run.started",
    "task.requirement.confirmed",
    "task.assignment.proposed",
    "access.authorization.requested"
  ]);
  const snapshot = plane.getTaskSnapshot(created.taskId);
  assert.equal(snapshot.assignment.status, "PROPOSED");
  assert.equal(snapshot.assignment.assignments[0].agentName, "幕僚长");
  assert.equal(snapshot.assignment.assignments[2].agentName, "线索挖掘员");
  assert.equal(snapshot.accessRequest.status, "REQUIRED");
  assert.equal(snapshot.accessRequest.provider, "抖音账号");
  assert.equal(snapshot.accessRequest.account, "Byering 汽车销售账号");
  assert.deepEqual(snapshot.accessRequest.scopes, ["直播互动与评论", "私信发送（审批后）"]);
});

test("public video and comment analysis stays runnable without an account gate", async () => {
  const plane = createControlPlane({
    idFactory: (() => { let n = 0; return () => `public-gate-${++n}`; })(),
    requirementService: {
      async understand() {
        return normalizeRequirementProposal({
          title: "公开抖音账号分析",
          objective: "抓取公开视频和评论并识别购车意向潜客",
          scope: "公开视频、公开评论和公开作者信息",
          deliverable: "视频清单、评论证据、候选潜客与筛选依据",
          guardrail: "仅使用公开信息；当前阶段不登录账号、不执行私信或评论触达",
          touchPlan: {
            source: "抖音公开视频和评论",
            action: "提交项目组确认后再决定是否进行合规后续触达"
          }
        }, { source: "model" });
      }
    }
  });
  const created = await plane.dispatchAsync({
    type: "task.create",
    taskId: "task-public-gate",
    commandId: "cmd-public-gate-create",
    idempotencyKey: "idem-public-gate-create",
    payload: { goal: "分析指定抖音账号的公开视频和评论，找出购车意向潜客" }
  });
  const started = plane.dispatch({
    type: "task.run.start",
    taskId: created.taskId,
    expectedVersion: 0,
    commandId: "cmd-public-gate-start",
    idempotencyKey: "idem-public-gate-start",
    payload: { requirementsConfirmed: false }
  });
  const confirmed = plane.dispatch({
    type: "task.requirement.confirm",
    taskId: created.taskId,
    expectedVersion: started.currentVersion,
    commandId: "cmd-public-gate-confirm",
    idempotencyKey: "idem-public-gate-confirm",
    payload: {
      // A stale client hint must not be able to force public work into RPA.
      requiresAccess: true,
      provider: "抖音账号",
      account: "Byering 汽车销售账号"
    }
  });

  assert.equal(confirmed.state, "RUNNING");
  const snapshot = plane.getTaskSnapshot(created.taskId);
  assert.equal(snapshot.workflow.id, "find_only");
  assert.equal(snapshot.workflow.requiresAccess, false);
  assert.equal(snapshot.accessRequest.status, "NOT_REQUIRED");
  assert.deepEqual(plane.listTaskEvents(created.taskId).map((event) => event.type), [
    "task.created",
    "task.requirement.proposed",
    "task.run.started",
    "task.requirement.confirmed",
    "task.assignment.proposed"
  ]);
});

test("control plane rejects access grants without a verified browser workspace", () => {
  const plane = createControlPlane({ idFactory: (() => { let n = 0; return () => `access-${++n}`; })() });
  const created = plane.dispatch({
    type: "task.create",
    taskId: "task-access-unverified",
    commandId: "cmd-access-create",
    idempotencyKey: "idem-access-create",
    payload: { goal: "访问授权" }
  });
  assert.throws(
    () => plane.dispatch({
      type: "access.grant",
      taskId: created.taskId,
      commandId: "cmd-access-grant",
      idempotencyKey: "idem-access-grant",
      expectedVersion: 0,
      payload: { browserSessionId: "fake-session", scopes: ["私信发送"] }
    }),
    (error) => error.code === "BROWSER_SESSION_VERIFICATION_REQUIRED"
  );
});

test("async access grant checks the browser workspace and rejects a fake session", async () => {
  const browserWorkspace = {
    async authorize(sessionId) {
      if (sessionId !== "real-session") {
        const error = new Error("session not found");
        error.code = "SESSION_NOT_FOUND";
        error.statusCode = 404;
        throw error;
      }
      return { sessionId, state: "READY", taskId: "task-access-real", provider: "douyin" };
    }
  };
  const plane = createControlPlane({
    browserWorkspace,
    requirementService: {
      async understand() {
        return normalizeRequirementProposal({
          title: "需求",
          objective: "目标",
          scope: "范围",
          deliverable: "结果",
          guardrail: "边界"
        }, { source: "model" });
      }
    }
  });
  const created = await plane.dispatchAsync({
    type: "task.create",
    taskId: "task-access-real",
    commandId: "cmd-access-real-create",
    idempotencyKey: "idem-access-real-create",
    payload: { goal: "访问授权" }
  });
  const started = plane.dispatch({
    type: "task.run.start",
    taskId: created.taskId,
    expectedVersion: 0,
    commandId: "cmd-access-real-start",
    idempotencyKey: "idem-access-real-start",
    payload: { requirementsConfirmed: false }
  });
  const accessRequired = plane.dispatch({
    type: "task.requirement.confirm",
    taskId: created.taskId,
    expectedVersion: started.currentVersion,
    commandId: "cmd-access-real-confirm",
    idempotencyKey: "idem-access-real-confirm",
    payload: { requiresAccess: true }
  });
  await assert.rejects(
    () => plane.dispatchAsync({
      type: "access.grant",
      taskId: created.taskId,
      expectedVersion: accessRequired.currentVersion,
      commandId: "cmd-access-fake",
      idempotencyKey: "idem-access-fake",
      payload: { browserSessionId: "fake-session", scopes: ["私信发送"] }
    }),
    (error) => error.code === "SESSION_NOT_FOUND"
  );
});

test("async access grant rejects a logged-in session for the wrong account", async () => {
  const browserWorkspace = {
    async authorize() {
      return {
        sessionId: "real-session",
        state: "READY",
        taskId: "task-account-bind",
        provider: "douyin",
        accountLabel: "另一台抖音账号"
      };
    }
  };
  const plane = createControlPlane({
    browserWorkspace,
    requirementService: {
      async understand() {
        return normalizeRequirementProposal({
          title: "账号绑定",
          objective: "核验账号",
          scope: "抖音",
          deliverable: "核验结果",
          guardrail: "不发送"
        }, { source: "model" });
      }
    }
  });
  const created = await plane.dispatchAsync({
    type: "task.create",
    taskId: "task-account-bind",
    commandId: "cmd-account-create",
    idempotencyKey: "idem-account-create",
    payload: { goal: "核验账号" }
  });
  const started = plane.dispatch({
    type: "task.run.start",
    taskId: created.taskId,
    expectedVersion: 0,
    commandId: "cmd-account-start",
    idempotencyKey: "idem-account-start",
    payload: { requirementsConfirmed: false }
  });
  await plane.dispatch({
    type: "task.requirement.confirm",
    taskId: created.taskId,
    expectedVersion: started.currentVersion,
    commandId: "cmd-account-confirm",
    idempotencyKey: "idem-account-confirm",
    payload: {
      requiresAccess: true,
      provider: "抖音账号",
      account: "Byering 汽车销售账号",
      scopes: ["读取互动"]
    }
  });
  await assert.rejects(
    () => plane.dispatchAsync({
      type: "access.grant",
      taskId: created.taskId,
      expectedVersion: 2,
      commandId: "cmd-account-grant",
      idempotencyKey: "idem-account-grant",
      payload: { browserSessionId: "real-session", scopes: ["读取互动"] }
    }),
    (error) => error.code === "BROWSER_SESSION_ACCOUNT_MISMATCH"
  );
});
