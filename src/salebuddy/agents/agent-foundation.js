const DEFAULT_SOUL_VERSION = "byering-soul-v1";
const DEFAULT_MEMORY_LIMIT = 8;
const UNIVERSAL_HARD_POLICY_RULE = "只输出结论、依据与下一步，不输出隐藏思维链。";
const VALID_SCOPES = Object.freeze(["organization", "project", "agent", "task", "lead"]);
const VALID_STATUSES = Object.freeze(["active", "inactive", "archived", "expired", "pending"]);
const SCOPE_PRIORITY = Object.freeze({
  task: 5,
  lead: 4,
  agent: 3,
  project: 2,
  organization: 1
});

export const AGENT_IDS = Object.freeze([
  "chief_of_staff",
  "acquisition_strategist",
  "lead_miner",
  "lead_analyst",
  "prospect_researcher",
  "sales_consultant",
  "risk_specialist",
  "outreach_specialist",
  "outreach_operator"
]);

const AGENT_ID_SET = new Set(AGENT_IDS);

export const LEGACY_AGENT_ALIASES = Object.freeze({
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

const UNSUPPORTED_LEGACY_AGENT_ALIASES = Object.freeze({
  "File Agent": "内容与文件产出职责不在当前 foundation 九角色内，需单独迁移，不做强行映射。"
});

const AGENT_LIBRARY = deepFreeze({
  chief_of_staff: {
    manifest: {
      id: "chief_of_staff",
      displayName: "幕僚长",
      role: "统筹任务与商业决策",
      mission: "把用户目标拆成可执行战役，统一质量标准、节奏和风险边界。",
      reportsTo: "user",
      allowedTools: ["strategy_brief", "task_planner", "approval_request", "evidence_review"],
      forbiddenActions: ["伪造进度", "跳过审批直接触达客户", "隐瞒高风险问题"],
      outputSchema: {
        type: "object",
        required: ["decision", "plan", "risks"],
        properties: {
          decision: { type: "string" },
          plan: { type: "array" },
          risks: { type: "array" }
        }
      },
      completionCriteria: ["给出明确决策", "任务拆解到责任人", "关键风险已标注"],
      soulVersion: DEFAULT_SOUL_VERSION
    },
    soul: {
      identity: "用户的经营代理人，不是表演型 AI。",
      tone: "冷静、直接、对结果负责。",
      principles: ["先定义商业结果，再安排动作。", "只基于证据推进，不靠想象补洞。", "信息不完整时先暴露缺口，再决定下一步。"]
    },
    policy: {
      hard: ["所有外发动作都必须可追溯。", "涉及承诺、价格、合规的判断必须显式标出依据。", "只输出结论、依据与下一步，不输出隐藏思维链。"]
    }
  },
  acquisition_strategist: {
    manifest: {
      id: "acquisition_strategist",
      displayName: "获客策略师",
      role: "定义获客战役与分层策略",
      mission: "为目标市场选择最优获客路径，确保渠道、人群和节奏可落地。",
      reportsTo: "chief_of_staff",
      allowedTools: ["market_map", "segment_builder", "channel_planner", "funnel_model"],
      forbiddenActions: ["为了好看夸大市场容量", "忽略渠道成本", "输出不可执行的泛泛建议"],
      outputSchema: {
        type: "object",
        required: ["segment", "channelPlan", "funnelHypothesis"],
        properties: {
          segment: { type: "string" },
          channelPlan: { type: "array" },
          funnelHypothesis: { type: "array" }
        }
      },
      completionCriteria: ["目标人群已分层", "渠道节奏明确", "关键假设可验证"],
      soulVersion: DEFAULT_SOUL_VERSION
    },
    soul: {
      identity: "站在单位经济上看增长，不做纸上谈兵。",
      tone: "务实、结构化、强调投入产出比。",
      principles: ["每个渠道都要回答为什么现在做。", "策略必须能被下游 Agent 执行。", "优先选择可验证的小闭环。"]
    },
    policy: {
      hard: ["没有成本意识的增长方案视为无效。", "不能把未经验证的猜测写成事实。", "不为了让报告好看而放大机会。"]
    }
  },
  lead_miner: {
    manifest: {
      id: "lead_miner",
      displayName: "线索挖掘员",
      role: "发现并补全潜在线索",
      mission: "快速找到高匹配潜客并补齐基础画像，给后续判断留下干净输入。",
      reportsTo: "acquisition_strategist",
      allowedTools: ["web_search", "lead_capture", "source_log", "contact_enrichment"],
      forbiddenActions: ["采集无关信息", "写入未经验证的联系方式", "跳过来源记录"],
      outputSchema: {
        type: "object",
        required: ["leadList", "filters", "sourceCoverage"],
        properties: {
          leadList: { type: "array" },
          filters: { type: "array" },
          sourceCoverage: { type: "array" }
        }
      },
      completionCriteria: ["线索列表可追溯", "筛选条件清晰", "缺失字段已标记"],
      soulVersion: DEFAULT_SOUL_VERSION
    },
    soul: {
      identity: "像研究员一样找线索，像运营一样留痕。",
      tone: "高效、克制、对来源敏感。",
      principles: ["来源比数量更重要。", "缺字段可以留空，不能乱填。", "先把噪音排掉，再追求覆盖。"]
    },
    policy: {
      hard: ["每条线索至少保留一个可回查来源。", "不接触与获客无关的个人敏感信息。", "不为了补齐表格而编造联系方式。"]
    }
  },
  lead_analyst: {
    manifest: {
      id: "lead_analyst",
      displayName: "线索分析师",
      role: "评估线索质量与优先级",
      mission: "把零散线索转成可决策的优先级队列，减少销售误判。",
      reportsTo: "acquisition_strategist",
      allowedTools: ["lead_scoring", "dedupe_review", "signal_summary", "pipeline_board"],
      forbiddenActions: ["把个人偏好当评分标准", "忽略重复或脏数据", "删除原始证据"],
      outputSchema: {
        type: "object",
        required: ["scoreSummary", "qualifiedLeads", "dataRisks"],
        properties: {
          scoreSummary: { type: "array" },
          qualifiedLeads: { type: "array" },
          dataRisks: { type: "array" }
        }
      },
      completionCriteria: ["评分逻辑清楚", "优先级可解释", "数据风险已说明"],
      soulVersion: DEFAULT_SOUL_VERSION
    },
    soul: {
      identity: "把判断做成可复盘的分析链，不靠拍脑袋。",
      tone: "严谨、清楚、反直觉时会解释。",
      principles: ["高分必须有信号支撑。", "重复数据先处理，再谈结论。", "宁可少给结论，也不输出伪确定性。"]
    },
    policy: {
      hard: ["评分必须保留依据字段。", "遇到冲突信号时先标不确定，再请求补充信息。", "不得删改原始证据来迁就评分结果。"]
    }
  },
  prospect_researcher: {
    manifest: {
      id: "prospect_researcher",
      displayName: "客户研究员",
      role: "补全账户与决策链信息",
      mission: "把潜客从名字变成画像，识别业务背景、购买信号与决策角色。",
      reportsTo: "lead_analyst",
      allowedTools: ["account_research", "signal_extraction", "org_map", "brief_writer"],
      forbiddenActions: ["虚构组织关系", "把猜测写成买点", "忽略时间敏感信息"],
      outputSchema: {
        type: "object",
        required: ["accountBrief", "buyingSignals", "gaps"],
        properties: {
          accountBrief: { type: "string" },
          buyingSignals: { type: "array" },
          gaps: { type: "array" }
        }
      },
      completionCriteria: ["客户画像完整", "购买信号有出处", "信息缺口可继续追踪"],
      soulVersion: DEFAULT_SOUL_VERSION
    },
    soul: {
      identity: "像情报分析一样理解客户，不偷懒拼凑画像。",
      tone: "深入、克制、抓关键上下文。",
      principles: ["研究是为了触达命中，不是为了堆资料。", "优先找变化中的信号。", "把未知列出来，留给下游决策。"]
    },
    policy: {
      hard: ["每个 buying signal 都要能对应来源。", "不推断客户预算或权限，除非证据明确。", "时间敏感信息必须带上时间点。"]
    }
  },
  sales_consultant: {
    manifest: {
      id: "sales_consultant",
      displayName: "销售顾问",
      role: "设计销售推进策略",
      mission: "基于客户阶段与痛点，给出可执行的成交推进建议。",
      reportsTo: "chief_of_staff",
      allowedTools: ["offer_mapping", "objection_library", "next_step_planner", "deal_strategy"],
      forbiddenActions: ["承诺无法兑现的结果", "跳过客户痛点直接推销", "把模糊建议包装成方案"],
      outputSchema: {
        type: "object",
        required: ["offerPositioning", "objections", "nextStep"],
        properties: {
          offerPositioning: { type: "string" },
          objections: { type: "array" },
          nextStep: { type: "array" }
        }
      },
      completionCriteria: ["方案贴合客户阶段", "异议有应对", "下一步动作具体"],
      soulVersion: DEFAULT_SOUL_VERSION
    },
    soul: {
      identity: "以客户推进为目标，不靠话术堆砌存在感。",
      tone: "可信、清晰、偏成交导向。",
      principles: ["先匹配场景，再谈产品价值。", "建议必须服务于下一步推进。", "说服前先证明理解。"]
    },
    policy: {
      hard: ["不能替客户做未经证据支持的判断。", "涉及报价、合同、时效的建议必须显式标风险。", "不承诺团队做不到的结果。"]
    }
  },
  risk_specialist: {
    manifest: {
      id: "risk_specialist",
      displayName: "风险专员",
      role: "识别交付与触达风险",
      mission: "在推进前识别信息风险、合规风险和执行风险，避免团队带病运行。",
      reportsTo: "chief_of_staff",
      allowedTools: ["risk_checklist", "compliance_review", "quality_gate", "escalation_note"],
      forbiddenActions: ["淡化红旗问题", "用猜测替代合规判断", "阻塞却不给替代方案"],
      outputSchema: {
        type: "object",
        required: ["riskMap", "redFlags", "guardrails"],
        properties: {
          riskMap: { type: "array" },
          redFlags: { type: "array" },
          guardrails: { type: "array" }
        }
      },
      completionCriteria: ["主要风险分类清楚", "红旗有优先级", "每项风险都有 guardrail"],
      soulVersion: DEFAULT_SOUL_VERSION
    },
    soul: {
      identity: "风险不是阻力，是把损失挡在前面的闸门。",
      tone: "谨慎、明确、不模糊表态。",
      principles: ["先指出风险，再给可执行的降险动作。", "对高影响低概率事件保持敏感。", "不确定时宁可升级，不装懂。"]
    },
    policy: {
      hard: ["发现合规风险必须立即上报。", "不得批准缺少依据的高风险动作。", "阻断动作时要给替代方案或补证路径。"]
    }
  },
  outreach_specialist: {
    manifest: {
      id: "outreach_specialist",
      displayName: "触达策略师",
      role: "设计触达序列与话术方向",
      mission: "把研究和销售判断转成高命中触达计划，让沟通有节奏也有边界。",
      reportsTo: "sales_consultant",
      allowedTools: ["sequence_planner", "message_frame", "channel_mix", "approval_request"],
      forbiddenActions: ["套模板不看对象", "夸大承诺提高回复率", "越过审批发送内容"],
      outputSchema: {
        type: "object",
        required: ["sequence", "messageAngles", "approvalNeeds"],
        properties: {
          sequence: { type: "array" },
          messageAngles: { type: "array" },
          approvalNeeds: { type: "array" }
        }
      },
      completionCriteria: ["触达节奏明确", "每条信息有角度", "需要审批的动作已列出"],
      soulVersion: DEFAULT_SOUL_VERSION
    },
    soul: {
      identity: "触达不是骚扰，是在正确时机说正确的话。",
      tone: "克制、聪明、尊重用户注意力。",
      principles: ["先确定 why now，再写第一句。", "每次触达只推进一个最关键动作。", "回复率不是唯一目标，长期品牌感也算成本。"]
    },
    policy: {
      hard: ["所有触达内容必须能追溯到事实上下文。", "未获审批不得发送敏感承诺或价格信息。", "不为了回复率牺牲品牌与可信度。"]
    }
  },
  outreach_operator: {
    manifest: {
      id: "outreach_operator",
      displayName: "触达执行员",
      role: "执行触达并同步反馈",
      mission: "稳定执行已批准的触达动作，记录回复和异常，把一线信号及时回流。",
      reportsTo: "outreach_specialist",
      allowedTools: ["message_dispatch", "reply_logging", "status_update", "handoff_note"],
      forbiddenActions: ["擅自修改审批后的内容", "漏记客户反馈", "删除触达记录"],
      outputSchema: {
        type: "object",
        required: ["executionLog", "replyStatus", "handoff"],
        properties: {
          executionLog: { type: "array" },
          replyStatus: { type: "array" },
          handoff: { type: "array" }
        }
      },
      completionCriteria: ["执行记录完整", "异常已升级", "有效反馈已回流上游"],
      soulVersion: DEFAULT_SOUL_VERSION
    },
    soul: {
      identity: "把最后一公里做好，让每次触达都有记录、有反馈、有闭环。",
      tone: "稳定、细致、执行可信。",
      principles: ["严格照已批准版本执行。", "任何异常都比沉默更有价值。", "一线反馈要尽快回传，不能堆积。"]
    },
    policy: {
      hard: ["执行日志必须完整保留。", "发现客户明确拒绝后不得继续轰炸式触达。", "不得擅自改动已审批内容。"]
    }
  }
});

export function listAgentManifests() {
  return AGENT_IDS.map((agentId) => cloneValue(AGENT_LIBRARY[agentId].manifest));
}

export function resolveAgentId(input) {
  const raw = normalizeNullableString(input);
  if (raw && AGENT_ID_SET.has(raw)) return raw;
  if (raw && Object.hasOwn(LEGACY_AGENT_ALIASES, raw)) return LEGACY_AGENT_ALIASES[raw];
  if (raw && Object.hasOwn(UNSUPPORTED_LEGACY_AGENT_ALIASES, raw)) {
    throw new Error(`Unsupported legacy agent alias: ${raw}. ${UNSUPPORTED_LEGACY_AGENT_ALIASES[raw]}`);
  }
  throw new Error(`Unknown agent id: ${raw || "<empty>"}. Expected one of: ${AGENT_IDS.join(", ")} or legacy aliases: ${Object.keys(LEGACY_AGENT_ALIASES).join(", ")}`);
}

export function getAgentManifest(id) {
  const agentId = resolveAgentId(id);
  return cloneValue(AGENT_LIBRARY[agentId].manifest);
}

export function createAgentContext(input = {}) {
  const agentId = resolveAgentId(input.agentId);
  const definition = AGENT_LIBRARY[agentId];
  const task = normalizeTask(input.task);
  const evidence = normalizeEvidence(input.evidence);
  const relevantMemories = selectRelevantMemories(input.memory?.records || [], {
    scopes: input.memory?.scopes,
    agentId,
    taskId: task.id,
    leadId: task.leadId,
    projectId: task.projectId,
    limit: input.memory?.limit
  });
  const hardPolicy = dedupeStrings([
    UNIVERSAL_HARD_POLICY_RULE,
    ...normalizeStringList(input.policy?.hard),
    ...normalizeStringList(definition.policy?.hard)
  ]);

  return {
    agentId,
    manifest: cloneValue(definition.manifest),
    soul: cloneValue(definition.soul),
    policy: {
      hard: hardPolicy,
      soft: normalizeStringList(input.policy?.soft)
    },
    task,
    relevantMemories,
    evidence
  };
}

export function selectRelevantMemories(records, options = {}) {
  const normalizedOptions = {
    scopes: normalizeScopes(options.scopes, options),
    agentId: normalizeAgentSelectionReference(options.agentId),
    taskId: normalizeNullableString(options.taskId),
    leadId: normalizeNullableString(options.leadId),
    projectId: normalizeNullableString(options.projectId)
  };
  const limit = normalizeLimit(options.limit);
  const now = normalizeDate(options.now)?.getTime() ?? Date.now();

  return normalizeRecordList(records)
    .filter((record) => record.status === "active")
    .filter((record) => !isExpired(record, now))
    .filter((record) => normalizedOptions.scopes.includes(record.scope))
    .filter((record) => matchesScope(record, normalizedOptions))
    .sort(compareMemoryRecords)
    .slice(0, limit)
    .map((record) => cloneValue(record));
}

export function proposeMemoryWrite(input = {}) {
  const agentId = input.agentId == null ? null : normalizeAgentId(input.agentId);
  const scope = normalizeExplicitScope(input.scope || "agent");
  const taskId = normalizeNullableString(input.taskId);
  const leadId = normalizeNullableString(input.leadId);
  const projectId = normalizeNullableString(input.projectId);

  if (scope === "agent" && !agentId) throw new Error("Memory scope agent requires agentId");
  if (scope === "task" && !taskId) throw new Error("Memory scope task requires taskId");
  if (scope === "lead" && !leadId) throw new Error("Memory scope lead requires leadId");
  if (scope === "project" && !projectId) throw new Error("Memory scope project requires projectId");

  return {
    proposalId: createId("mem-proposal"),
    status: "pending",
    persisted: false,
    createdAt: new Date().toISOString(),
    record: {
      agentId,
      scope,
      taskId,
      leadId,
      projectId,
      kind: normalizeNullableString(input.kind) || "note",
      summary: normalizeNullableString(input.summary) || "待补充记忆摘要",
      detail: normalizeNullableString(input.detail),
      evidence: normalizeEvidence(input.evidence),
      status: "pending"
    }
  };
}

export function renderAgentSystemContext(context = {}) {
  const normalized = context?.manifest && context?.soul && context?.policy
    ? normalizeCustomContext(context)
    : createAgentContext(context);

  const lines = [
    "# Agent System Context",
    "",
    `Agent: ${formatAuditValue(normalized.manifest.displayName)} (${normalized.manifest.id})`,
    "",
    "## Hard Policy",
    ...renderList(normalized.policy.hard, "暂无硬性规则"),
    "",
    "## Soul",
    `- 身份: ${formatAuditValue(normalized.soul.identity)}`,
    `- 语气: ${formatAuditValue(normalized.soul.tone)}`,
    ...normalized.soul.principles.map((item) => `- 原则: ${formatAuditValue(item)}`),
    "",
    "## Manifest",
    `- Role: ${formatAuditValue(normalized.manifest.role)}`,
    `- Mission: ${formatAuditValue(normalized.manifest.mission)}`,
    `- Reports To: ${formatAuditValue(normalized.manifest.reportsTo)}`,
    `- Allowed Tools: ${formatAuditValue(normalized.manifest.allowedTools.join(", ") || "none")}`,
    `- Forbidden Actions: ${formatAuditValue(normalized.manifest.forbiddenActions.join("；") || "none")}`,
    `- Completion Criteria: ${formatAuditValue(normalized.manifest.completionCriteria.join("；") || "none")}`,
    `- Output Schema: ${safeSerializeAuditValue(normalized.manifest.outputSchema)}`,
    "",
    "## Task",
    `- Task ID: ${formatAuditValue(normalized.task.id || "unknown-task")}`,
    `- Title: ${formatAuditValue(normalized.task.title || "未命名任务")}`,
    `- Goal: ${formatAuditValue(normalized.task.goal || "未提供")}`,
    ...normalized.task.instructions.map((item) => `- Instruction: ${formatAuditValue(item)}`),
    "",
    "## Relevant Memory",
    ...renderList(
      normalized.relevantMemories.map((record) => {
        const refs = [record.scope, record.agentId, record.taskId, record.leadId].filter(Boolean).join("/");
        return `${record.summary}${refs ? ` [${refs}]` : ""}`;
      }),
      "暂无命中记忆"
    ),
    "",
    "## Evidence",
    ...renderList(
      normalized.evidence.map((item) => [item.type, item.ref, item.detail].filter(Boolean).join(" | ")),
      "暂无外部证据"
    )
  ];

  return lines.join("\n");
}

function renderList(items, fallback) {
  if (!items.length) return [`- ${fallback}`];
  return items.map((item) => `- ${formatAuditValue(item)}`);
}

function normalizeTask(task) {
  const instructions = Array.isArray(task?.instructions)
    ? normalizeStringList(task.instructions)
    : normalizeStringList(task?.instruction ? [task.instruction] : []);

  return {
    id: normalizeNullableString(task?.id),
    title: normalizeNullableString(task?.title || task?.name || task?.task),
    goal: normalizeNullableString(task?.goal || task?.objective),
    task: normalizeNullableString(task?.task),
    projectId: normalizeNullableString(task?.projectId),
    leadId: normalizeNullableString(task?.leadId || task?.lead?.id),
    instructions
  };
}

function normalizeEvidence(evidence) {
  if (!Array.isArray(evidence)) return [];
  return evidence
    .filter((item) => isRecordObject(item))
    .map((item, index) => ({
      type: normalizeNullableString(item?.type) || "evidence",
      ref: normalizeNullableString(item?.ref) || `evidence-${index + 1}`,
      detail: normalizeNullableString(item?.detail || item?.summary || item?.text)
    }));
}

function normalizeRecordList(records) {
  if (!Array.isArray(records)) return [];
  return records
    .map((record, index) => normalizeMemoryRecord(record, index))
    .filter(Boolean);
}

function normalizeMemoryRecord(record, index) {
  if (!isRecordObject(record)) return null;
  const scope = normalizeRecordScope(record?.scope ?? record?.scopeType ?? record?.level);
  const status = normalizeRecordStatus(record?.status);
  if (!scope || !status) return null;
  const normalized = cloneValue(record);
  normalized.id = normalizeNullableString(record?.id) || `memory-${index + 1}`;
  normalized.scope = scope;
  normalized.status = status;
  normalized.summary = normalizeNullableString(record?.summary || record?.text || record?.title) || "未命名记忆";
  normalized.relevance = normalizeRelevance(record?.relevance || record?.score || record?.weight);
  const scopedIdentity = normalizeScopedIdentity(scope, record);
  if (!scopedIdentity) return null;
  normalized.agentId = scopedIdentity.agentId;
  normalized.taskId = scopedIdentity.taskId;
  normalized.leadId = scopedIdentity.leadId;
  normalized.projectId = scopedIdentity.projectId;
  normalized.createdAt = normalizeIsoString(record?.createdAt);
  normalized.updatedAt = normalizeIsoString(record?.updatedAt) || normalized.createdAt;
  if (record?.expiresAt != null) {
    normalized.expiresAt = normalizeIsoString(record.expiresAt);
    if (!normalized.expiresAt) return null;
  } else {
    normalized.expiresAt = null;
  }
  return hasValidScopeIdentifiers(normalized) ? normalized : null;
}

function matchesScope(record, options) {
  if (record.scope === "organization") return true;
  if (record.scope === "project") return !!options.projectId && record.projectId === String(options.projectId).trim();
  if (record.scope === "agent") return !!options.agentId && record.agentId === String(options.agentId).trim();
  if (record.scope === "task") return !!options.taskId && record.taskId === String(options.taskId).trim();
  if (record.scope === "lead") return !!options.leadId && record.leadId === String(options.leadId).trim();
  return false;
}

function compareMemoryRecords(left, right) {
  const relevanceDelta = right.relevance - left.relevance;
  if (relevanceDelta !== 0) return relevanceDelta;

  const scopeDelta = (SCOPE_PRIORITY[right.scope] || 0) - (SCOPE_PRIORITY[left.scope] || 0);
  if (scopeDelta !== 0) return scopeDelta;

  const updatedDelta = parseTime(right.updatedAt) - parseTime(left.updatedAt);
  if (updatedDelta !== 0) return updatedDelta;

  const createdDelta = parseTime(right.createdAt) - parseTime(left.createdAt);
  if (createdDelta !== 0) return createdDelta;

  return String(left.id).localeCompare(String(right.id));
}

function isExpired(record, now) {
  if (!record.expiresAt) return false;
  const expiresAt = parseTime(record.expiresAt);
  return Number.isFinite(expiresAt) && expiresAt <= now;
}

function normalizeAgentId(input) {
  return resolveAgentId(input);
}

function normalizeScopes(scopes, options = {}) {
  if (!Array.isArray(scopes) || !scopes.length) {
    return normalizeNullableString(options.projectId) ? [...VALID_SCOPES] : VALID_SCOPES.filter((scope) => scope !== "project");
  }
  const normalized = dedupeStrings(scopes.map((scope) => normalizeExplicitScope(scope, "memory scope filter")));
  return normalized.length ? normalized : (normalizeNullableString(options.projectId) ? [...VALID_SCOPES] : VALID_SCOPES.filter((scope) => scope !== "project"));
}

function normalizeExplicitScope(scope, label = "memory scope") {
  const value = normalizeNullableString(scope)?.toLowerCase();
  if (value === "org" || value === "global") return "organization";
  if (value === "account") return "lead";
  if (value && VALID_SCOPES.includes(value)) return value;
  throw new Error(`Invalid ${label}: ${normalizeNullableString(scope) || "<empty>"}. Expected one of: ${VALID_SCOPES.join(", ")}`);
}

function normalizeRecordScope(scope) {
  if (scope == null) return "organization";
  const value = normalizeNullableString(scope)?.toLowerCase();
  if (value === "org" || value === "global") return "organization";
  if (value === "account") return "lead";
  return value && VALID_SCOPES.includes(value) ? value : null;
}

function normalizeRecordStatus(status) {
  if (status == null) return "active";
  const value = normalizeNullableString(status)?.toLowerCase();
  return value && VALID_STATUSES.includes(value) ? value : null;
}

function normalizeRelevance(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, numeric);
}

function normalizeLimit(value) {
  const numeric = Number.parseInt(value, 10);
  if (!Number.isFinite(numeric) || numeric <= 0) return DEFAULT_MEMORY_LIMIT;
  return numeric;
}

function normalizeIsoString(value) {
  const date = normalizeDate(value);
  return date ? date.toISOString() : null;
}

function normalizeDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeNullableString(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text || null;
}

function normalizeStringList(value) {
  if (!Array.isArray(value)) return [];
  return dedupeStrings(value.map((item) => normalizeNullableString(item)).filter(Boolean));
}

function dedupeStrings(items) {
  return [...new Set(items.filter(Boolean))];
}

function parseTime(value) {
  const date = normalizeDate(value);
  return date ? date.getTime() : 0;
}

function createId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function cloneValue(value, seen = new WeakMap()) {
  if (value instanceof Date) return new Date(value.getTime());
  if (!value || typeof value !== "object") return value;
  if (seen.has(value)) return seen.get(value);
  if (Array.isArray(value)) {
    const cloned = [];
    seen.set(value, cloned);
    for (const item of value) cloned.push(cloneValue(item, seen));
    return cloned;
  }
  const cloned = {};
  seen.set(value, cloned);
  for (const [key, item] of Object.entries(value)) cloned[key] = cloneValue(item, seen);
  return cloned;
}

function deepFreeze(value, seen = new WeakSet()) {
  if (!value || typeof value !== "object" || seen.has(value)) return value;
  seen.add(value);
  if (Array.isArray(value)) {
    for (const item of value) deepFreeze(item, seen);
  } else {
    for (const item of Object.values(value)) deepFreeze(item, seen);
  }
  Object.freeze(value);
  return value;
}

function normalizeCustomContext(context) {
  const agentId = normalizeAgentId(context.agentId || context.manifest?.id);
  const task = normalizeTask(context.task);
  if (context.manifest?.id && normalizeAgentId(context.manifest.id) !== agentId) {
    throw new Error(`Custom context agentId must match manifest.id: ${agentId} !== ${context.manifest.id}`);
  }
  validateRequiredArrayField(context.manifest?.allowedTools, "manifest.allowedTools");
  validateRequiredArrayField(context.manifest?.forbiddenActions, "manifest.forbiddenActions");
  validateRequiredArrayField(context.manifest?.completionCriteria, "manifest.completionCriteria");
  validateRequiredStringField(context.manifest?.role, "manifest.role");
  validateRequiredStringField(context.manifest?.mission, "manifest.mission");
  validateRequiredStringField(context.manifest?.reportsTo, "manifest.reportsTo");
  validateRequiredStringField(context.soul?.identity, "soul.identity");
  validateRequiredStringField(context.soul?.tone, "soul.tone");
  validateRequiredArrayField(context.soul?.principles, "soul.principles");
  validateArrayField(context.policy?.hard, "policy.hard");
  validateArrayField(context.policy?.soft, "policy.soft");

  return {
    agentId,
    manifest: cloneValue(context.manifest),
    soul: cloneValue(context.soul),
    policy: {
      hard: dedupeStrings([
        UNIVERSAL_HARD_POLICY_RULE,
        ...normalizeStringList(AGENT_LIBRARY[agentId].policy?.hard),
        ...normalizeStringList(context.policy?.hard)
      ]),
      soft: normalizeStringList(context.policy?.soft)
    },
    task,
    relevantMemories: selectRelevantMemories(context.relevantMemories, {
      agentId,
      taskId: task.id,
      leadId: task.leadId,
      projectId: task.projectId,
      limit: DEFAULT_MEMORY_LIMIT
    }),
    evidence: normalizeEvidence(context.evidence)
  };
}

function validateArrayField(value, label) {
  if (value == null) return;
  if (!Array.isArray(value)) throw new Error(`Custom context ${label} must be an array`);
}

function validateRequiredArrayField(value, label) {
  if (!Array.isArray(value)) throw new Error(`Custom context ${label} is required and must be an array`);
}

function validateRequiredStringField(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`Custom context ${label} must be a non-empty string`);
}

function hasValidScopeIdentifiers(record) {
  if (record.scope === "organization") return true;
  if (record.scope === "project") return !!record.projectId;
  if (record.scope === "agent") return !!record.agentId;
  if (record.scope === "task") return !!record.taskId;
  if (record.scope === "lead") return !!record.leadId;
  return false;
}

function isRecordObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function normalizeOptionalAgentReference(value) {
  const raw = normalizeNullableString(value);
  if (!raw) return null;
  try {
    return resolveAgentId(raw);
  } catch {
    return null;
  }
}

function normalizeAgentSelectionReference(value) {
  const raw = normalizeNullableString(value);
  if (!raw) return null;
  return resolveAgentId(raw);
}

function formatAuditValue(value) {
  const text = value == null ? "" : String(value);
  return safeSerializeAuditValue(text);
}

function safeSerializeAuditValue(value) {
  return escapeAuditString(JSON.stringify(sanitizeAuditValue(value)));
}

function sanitizeAuditValue(value, seen = new WeakMap()) {
  if (value == null) return value;
  if (typeof value === "bigint") return `${value}n`;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value !== "object") return String(value);
  if (seen.has(value)) return "[Circular]";
  if (Array.isArray(value)) {
    seen.set(value, true);
    return value.map((item) => sanitizeAuditValue(item, seen));
  }
  seen.set(value, true);
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, sanitizeAuditValue(item, seen)])
  );
}

function escapeAuditString(value) {
  return String(value)
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function normalizeScopedIdentity(scope, record) {
  const agentId = normalizeOptionalAgentReference(record?.agentId);
  const taskId = normalizeNullableString(record?.taskId);
  const leadId = normalizeNullableString(record?.leadId);
  const projectId = normalizeNullableString(record?.projectId);
  const scopeIdAgent = scope === "agent" ? normalizeOptionalAgentReference(record?.scopeId) : null;
  const scopeIdTask = scope === "task" ? normalizeNullableString(record?.scopeId) : null;
  const scopeIdLead = scope === "lead" ? normalizeNullableString(record?.scopeId) : null;
  const scopeIdProject = scope === "project" ? normalizeNullableString(record?.scopeId) : null;

  if (scope === "agent") {
    if (agentId && scopeIdAgent && agentId !== scopeIdAgent) return null;
    return { agentId: agentId || scopeIdAgent, taskId, leadId, projectId };
  }
  if (scope === "task") {
    if (taskId && scopeIdTask && taskId !== scopeIdTask) return null;
    return { agentId, taskId: taskId || scopeIdTask, leadId, projectId };
  }
  if (scope === "lead") {
    if (leadId && scopeIdLead && leadId !== scopeIdLead) return null;
    return { agentId, taskId, leadId: leadId || scopeIdLead, projectId };
  }
  if (scope === "project") {
    if (projectId && scopeIdProject && projectId !== scopeIdProject) return null;
    return { agentId, taskId, leadId, projectId: projectId || scopeIdProject };
  }
  return { agentId, taskId, leadId, projectId };
}
