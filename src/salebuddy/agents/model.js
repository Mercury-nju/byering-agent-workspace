/**
 * agents/model.js
 * Agent 员工模型的纯数据层：默认值、工厂函数、记忆结构。
 * 不依赖浏览器或 Node 环境，gateway-mock（Node）、browser-shim（浏览器）
 * 与 registry.js（渲染层）三方共用，保证协议形状一致。
 */

/** Active core roles shown in the employee roster. */
export const AGENT_TYPE_DEFAULTS = Object.freeze({
  main: {
    role: "Byering · 幕僚长",
    title: "AI 组织负责人",
    responsibilities: ["理解用户目标", "拆解任务", "组织与协调 Agent 团队", "审核交付质量", "向用户汇报"]
  },
  "Browser Agent": {
    role: "线索猎人",
    title: "B2B 线索研究员",
    responsibilities: ["搜索潜在客户", "分析公司主页", "补全联系方式", "验证线索真实性"]
  },
  "Search Agent": {
    role: "数据分析师",
    title: "数据清洗与评估",
    responsibilities: ["清洗重复数据", "线索评分", "数据归因与来源核验", "输出分析结论"]
  },
  "App Agent": {
    role: "销售顾问",
    title: "触达策略制定",
    responsibilities: ["制定触达方案", "设计沟通节奏", "评估转化路径"]
  },
  "File Agent": {
    role: "内容策划",
    title: "内容与文档产出",
    responsibilities: ["生成沟通内容", "撰写报告", "管理文件产出"]
  }
});

/** 反馈/规则的生效范围（PRD 四档）。 */
export const FEEDBACK_SCOPES = Object.freeze(["task", "project", "agent", "organization"]);

/** 记忆分类（PRD：用户记忆/项目记忆/岗位经验/失败记录/用户反馈/最佳实践等）。 */
export const MEMORY_KINDS = Object.freeze([
  "userRules",      // 用户记忆与长期规则
  "projectRules",   // 项目记忆
  "lessons",        // 岗位经验 / 失败记录
  "feedback",       // 用户反馈
  "bestPractices"   // 已验证的最佳实践
]);

/** PRD 九段员工模型的默认骨架。 */
export function createDefaultProfile(agentType) {
  const defaults = AGENT_TYPE_DEFAULTS[agentType] || { role: agentType, title: "", responsibilities: [] };
  const now = new Date().toISOString();
  return {
    agentType,
    identity: { name: defaults.role, avatar: null, title: defaults.title, languageStyle: "", signature: "" },
    soul: { principles: [], deliveryStandard: "", safetyRules: [], honestyRules: [] },
    role: { position: defaults.role, responsibilities: defaults.responsibilities, reportsTo: "main" },
    skills: [],
    tools: [],
    scope: { dataAccess: [], forbiddenZones: [] },
    permission: {
      approvalRequired: [],       // 需要用户审批的操作（如"发送邮件"）
      limits: {},                 // 限额（如 maxEmailsPerRun: 20）
      forbidden: []               // 禁止项（如"删除邮件"、"修改核心代码"）
    },
    budget: { daily: null, monthly: null, perTask: null, modelTier: "standard", maxCalls: null },
    meta: { createdAt: now, updatedAt: now, version: 1 }
  };
}

/** 创建一条记忆记录。 */
export function createMemoryEntry({ kind, text, scope = "agent", source = "user" }) {
  if (!MEMORY_KINDS.includes(kind)) throw new Error(`未知记忆分类: ${kind}`);
  if (!FEEDBACK_SCOPES.includes(scope)) throw new Error(`未知生效范围: ${scope}`);
  return {
    id: `mem-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    kind,
    text: String(text || ""),
    scope,
    source,
    status: "active",            // active | rolled-back | expired
    version: 1,
    history: [],                 // 旧版本快照，支撑回退与来源追踪
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    expiresAt: null
  };
}

/** 编辑一条记忆：旧版本进 history，返回新版本对象。 */
export function reviseMemoryEntry(entry, text) {
  const history = [...(entry.history || []), { text: entry.text, version: entry.version, replacedAt: new Date().toISOString() }];
  return { ...entry, text: String(text || ""), version: entry.version + 1, history, updatedAt: new Date().toISOString() };
}

/** 回退一条记忆到上一个版本；没有历史版本时仅标记 rolled-back。 */
export function rollbackMemoryEntry(entry) {
  const history = [...(entry.history || [])];
  const previous = history.pop();
  if (!previous) return { ...entry, status: "rolled-back", updatedAt: new Date().toISOString() };
  return { ...entry, text: previous.text, version: previous.version, history, status: "active", updatedAt: new Date().toISOString() };
}

/** 深合并 profile patch（仅合并对象，数组整体替换）。 */
export function mergeProfilePatch(profile, patch) {
  const merged = { ...profile };
  for (const [key, value] of Object.entries(patch || {})) {
    if (value && typeof value === "object" && !Array.isArray(value) && profile[key] && typeof profile[key] === "object" && !Array.isArray(profile[key])) {
      merged[key] = mergeProfilePatch(profile[key], value);
    } else {
      merged[key] = value;
    }
  }
  merged.meta = { ...profile.meta, updatedAt: new Date().toISOString(), version: (profile.meta?.version || 0) + 1 };
  return merged;
}

/** Fill absent profile values without overwriting user-edited fields. */
export function fillProfileDefaults(profile = {}, defaults = {}) {
  const clone = (value) => {
    if (Array.isArray(value)) return value.map(clone);
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)]));
    return value;
  };
  const next = clone(profile || {});
  const apply = (target, source) => {
    for (const [key, value] of Object.entries(source || {})) {
      const current = target[key];
      if (value && typeof value === "object" && !Array.isArray(value)) {
        if (!current || typeof current !== "object" || Array.isArray(current)) target[key] = {};
        apply(target[key], value);
      } else if (current == null || (Array.isArray(value) && (!Array.isArray(current) || current.length === 0))) {
        target[key] = clone(value);
      }
    }
  };
  apply(next, defaults);
  return next;
}

/** IDENTITY.md 文本生成（PRD：对外身份信息保存在 IDENTITY.md）。 */
export function renderIdentityMarkdown(profile) {
  const { identity, role } = profile;
  return [
    `# ${identity.name}`,
    "",
    `- 职位: ${identity.title || role.position}`,
    `- 汇报对象: ${role.reportsTo}`,
    `- 语言风格: ${identity.languageStyle || "默认"}`,
    `- 对外签名: ${identity.signature || "无"}`,
    "",
    "## 职责",
    ...role.responsibilities.map((item) => `- ${item}`)
  ].join("\n") + "\n";
}
