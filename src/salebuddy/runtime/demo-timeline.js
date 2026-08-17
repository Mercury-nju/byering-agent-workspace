/**
 * Investor-demo event source.
 * The timeline is the simulation contract; playback delays only pace the UI.
 * A real Gateway can replace this source with the same event envelope later.
 */

const SLOT_FALLBACKS = ["线索猎人", "数据分析师", "内容策划", "销售顾问"];
const SLOT_TYPES = ["Browser Agent", "Search Agent", "File Agent", "App Agent"];
const RUNTIME_MEMBER_NAMES = new Map([
  ["Browser Agent", { name: "线索猎人", title: "线索发现" }],
  ["Search Agent", { name: "数据分析师", title: "数据分析" }],
  ["File Agent", { name: "内容策划", title: "内容整理" }],
  ["App Agent", { name: "销售顾问", title: "触达执行" }],
  ["mkt-lead-miner", { name: "周砚", title: "线索挖掘机" }],
  ["mkt-follow-up", { name: "跟跟", title: "跟进管家" }],
  ["mkt-market-scout", { name: "小探", title: "市场情报员" }],
  ["mkt-cold-writer", { name: "阿触", title: "冷启动外联" }]
]);

function projectMemberDirectory(projectMembers = []) {
  return projectMembers.filter((id) => id && id !== "main").map((id) => ({
    id,
    name: RUNTIME_MEMBER_NAMES.get(id)?.name || id,
    title: RUNTIME_MEMBER_NAMES.get(id)?.title || id
  }));
}

// Demo pacing is deliberately slower than a production event stream so a presenter can
// narrate each Goal -> Task -> Plan -> AgentRun transition without changing event order.
export const DEMO_PACING = 1.35;

const ACCESS_SETUPS = Object.freeze({
  leads: Object.freeze({
    provider: "抖音账号",
    account: "Byering 汽车销售账号",
    description: "先连接一个抖音账号，Byering 才能读取互动并在你确认后执行私信触达。",
    scopes: Object.freeze(["直播互动与评论", "粉丝主页与历史互动", "私信发送（每次触达前仍需确认）"])
  }),
  content: Object.freeze({
    provider: "内容账号",
    account: "Byering 内容运营账号",
    description: "先连接内容账号，Byering 才能读取选题、作品表现和评论反馈。",
    scopes: Object.freeze(["作品与数据表现", "评论与互动", "发布排期（发布前仍需确认）"])
  }),
  generic: Object.freeze({
    provider: "项目资料",
    account: "潜在客户拓展项目组",
    description: "先确认项目资料范围，Byering 只读取你明确授权的内容。",
    scopes: Object.freeze(["项目共享文件", "已连接业务数据", "执行记录与交付物"])
  })
});

/** Initial access contract for a zero-to-one demo. No provider is READY by default. */
export function getDemoAccessSetup(scriptKey = "generic") {
  return ACCESS_SETUPS[scriptKey] || ACCESS_SETUPS.generic;
}

/**
 * 在任何外部授权前，把 Goal 对应的技能和执行责任公开给用户。
 * 这份结构同时供对话卡片和后续真实 Gateway 的 assignment 事件复用。
 */
export function buildAssignmentPlan({ script, runtimeDefinition, projectMembers = [] } = {}) {
  if (!script || !runtimeDefinition) return [];
  const projectAgents = projectMemberDirectory(projectMembers);
  return script.subs.map((step, index) => {
    const skill = runtimeDefinition.skills[index] || {};
    const projectAgent = projectAgents.length ? projectAgents[index % projectAgents.length] : null;
    return {
      index,
      skillId: skill.id || step.skill || `skill-${index + 1}`,
      skill: skill.name || step.skill || step.role || "执行步骤",
      role: skill.role || step.role || "按计划执行并回报证据",
      agentType: projectAgent?.id || SLOT_TYPES[index] || skill.executor || "LLM + Policy",
      agentName: projectAgent?.name || SLOT_FALLBACKS[index] || runtimeDefinition.agent?.name || "项目执行 Agent",
      executor: projectAgent ? `${projectAgent.title} + Policy` : SLOT_TYPES[index] || skill.executor || "LLM + Policy",
      acceptance: "提交结构化结果并绑定执行证据"
    };
  });
}

function protocol(type, event = {}) {
  return { ...event, protocolType: type };
}

function isFailureDemo(text = "") {
  return /模拟失败|故障演示|失败|超时|异常/.test(String(text));
}

function wantsHumanTakeover(text = "") {
  return /人工接管|投诉|要求人工|转人工/.test(String(text));
}

function buildRunHeader({ taskText, online, script }) {
  const onlineNote = online
    ? "我会补充外部公开信息，并为每条新增结论保留来源和时间。"
    : "我先基于当前项目组已连接资料执行，外部信息不会默认当成事实。";
  return [
    { delayMs: 0, t: "run-started", ...protocol("RUN_STARTED", { runId: "demo-run" }) },
    { delayMs: 240, t: "user", text: taskText, online },
    { delayMs: 900, t: "chief", ...protocol("TEXT_MESSAGE_CONTENT", { text: `${onlineNote} ${script.decompose}` }) },
    { delayMs: 1500, t: "brief", ...protocol("TEXT_MESSAGE_END", { brief: script.brief }) },
    { delayMs: 2200, t: "progress-start", ...protocol("START", { sceneAction: "START" }) }
  ];
}

function buildSkillTimeline({ script, runtimeDefinition, taskText, projectMembers = [] }) {
  const events = [];
  let delayMs = 2500;
  const failure = isFailureDemo(taskText);
  const takeover = wantsHumanTakeover(taskText);

  script.subs.forEach((step, index) => {
    if (failure && index > 1) return;
    const skill = runtimeDefinition.skills[index] || {};
    const projectPlan = buildAssignmentPlan({ script: { subs: [step] }, runtimeDefinition: { skills: [skill] }, projectMembers })[0];
    const agentName = projectPlan?.agentName || SLOT_FALLBACKS[index] || runtimeDefinition.agent.name;
    const agentType = projectPlan?.agentType || SLOT_TYPES[index] || skill.executor || "LLM + Policy";
    const conversationId = `demo-conv-${runtimeDefinition.agent.id}-${index + 1}`;
    const base = { i: index, skillId: skill.id, skill: skill.name, agentName, agentType, conversationId };

    events.push({ delayMs, t: "chief", ...protocol("TEXT_MESSAGE_CONTENT", { ...base, text: step.assign }) });
    delayMs += 380;
    events.push({
      delayMs,
      t: "dispatch",
      ...protocol("DISPATCH", {
        ...base,
        fromAgent: "main",
        toAgent: agentType,
        text: `幕僚长将「${skill.name}」分派给 ${agentName}，任务上下文已绑定。`
      })
    });
    delayMs += 420;
    events.push({
      delayMs,
      t: "sub-start",
      ...protocol("SUB_START", {
        ...base,
        text: `${agentName} 已入场，开始执行「${skill.name}」。`
      })
    });
    delayMs += 380;
    events.push({ t: "sub-accepted", delayMs, ...base });
    delayMs += 420;
    events.push({ t: "sub-started", delayMs, ...base });
    delayMs += 520;

    step.lines.forEach((text, lineIndex) => {
      events.push({
        delayMs,
        t: "sub-log",
        ...base,
        text,
        lineIndex,
        evidence: [{ type: "event", label: `${skill.name} 执行证据`, ref: `${conversationId}-evidence-${lineIndex + 1}` }]
      });
      delayMs += 720;
    });

    if (failure && index === 1) {
      events.push({
        delayMs,
        t: "sub-error",
        ...protocol("ERROR", {
          ...base,
          text: `${agentName} 的 Executor 返回超时：外部数据源响应超过 8 秒，当前结果未写入业务系统。`,
          errorCode: "UPSTREAM_TIMEOUT"
        })
      });
      events.push({
        delayMs: delayMs + 500,
        t: "task-error",
        ...protocol("RUN_ERROR", {
          text: "任务已暂停：保留已完成证据，未完成步骤不会伪造结果；可以重试或转人工处理。",
          errorCode: "UPSTREAM_TIMEOUT"
        })
      });
      return;
    }

    const completionText = step.completion || `我已经完成「${skill.name}」，结果和工作依据都整理好了。`;
    events.push({ delayMs, t: "sub-done", ...protocol("COMPLETE", { ...base, text: completionText }) });
    delayMs += 360;
    events.push({ delayMs, t: "artifact-sub", i: index, ...base });
    delayMs += 520;
  });

  if (!failure) {
    if (takeover) {
      events.push({
        delayMs,
        t: "handoff",
        ...protocol("HUMAN_TAKEOVER", {
          text: "检测到客户要求人工或存在投诉风险，已停止自动触达，完整上下文交给人工负责人。",
          reason: "customer_requested_human"
        })
      });
      delayMs += 520;
    }
    events.push({
      delayMs,
      t: "chief",
      ...protocol("TEXT_MESSAGE_CONTENT", {
        text: "各子任务已完成，有一个对外动作需要你确认："
      })
    });
    events.push({ delayMs: delayMs + 300, t: "approval-show", ...protocol("APPROVAL_REQUESTED", { approval: { id: "approval-demo", ...script.approval } }) });
  }

  return events;
}

export function buildDemoTimeline({ taskText = "", online = false, script, runtimeDefinition, projectMembers = [] } = {}) {
  if (!script || !runtimeDefinition) return [];
  return [...buildRunHeader({ taskText, online, script }), ...buildSkillTimeline({ script, runtimeDefinition, taskText, projectMembers })];
}

export function buildApprovalTimeline({ approved, script, taskText = "" } = {}) {
  const action = script?.approval?.title || "对外动作";
  if (!approved) {
    return [
      { delayMs: 0, t: "approval-resolved", ...protocol("APPROVAL_REJECTED", { ok: false, approval: { id: "approval-demo", ...script?.approval } }) },
      { delayMs: 520, t: "task-blocked", ...protocol("CANCEL", { text: `已驳回「${action}」，任务停在人工修改队列，不会继续对外执行。`, reason: "approval_rejected" }) }
    ];
  }
  return [
    { delayMs: 0, t: "approval-resolved", ...protocol("APPROVAL_APPROVED", { ok: true, approval: { id: "approval-demo", ...script?.approval } }) },
    { delayMs: 520, t: "chief", ...protocol("TEXT_MESSAGE_CONTENT", { text: `已批准「${action}」，按审批范围执行；超出范围的动作仍需人工确认。` }) },
    { delayMs: 1000, t: "run-finished", ...protocol("RUN_FINISHED", { text: "任务已完成，所有产出和执行证据已归档。" }) },
    { delayMs: 1100, t: "summary", taskText }
  ];
}

export const DEMO_PROTOCOL_EVENTS = Object.freeze([
  "RUN_STARTED", "TEXT_MESSAGE_START", "TEXT_MESSAGE_CONTENT", "TEXT_MESSAGE_END", "RUN_FINISHED", "RUN_ERROR",
  "DISPATCH", "SUB_START", "COMPLETE", "ERROR", "CANCEL", "HUMAN_TAKEOVER"
]);
