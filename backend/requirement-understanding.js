const DEFAULT_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3";
// Ark Chat Completions requires the versioned online model ID.
const DEFAULT_MODEL = "doubao-seed-2-1-pro-260628";
const DEFAULT_TIMEOUT_MS = 60000;

const REQUIRED_FIELDS = Object.freeze(["title", "objective", "scope", "deliverable", "guardrail"]);
const TOUCH_PLAN_FIELDS = Object.freeze([
  "audience", "signal", "filter", "timeWindow", "intent", "relationship", "action"
]);
const HIDDEN_REASONING_KEYS = /^(?:analysis|reasoning|chain[_-]?of[_-]?thought|cot|scratchpad|thoughts?|_debug(?:ger)?|llm[_-]?trace)(?:[_-]|$)/i;

export class RequirementUnderstandingError extends Error {
  constructor(message, { code = "REQUIREMENT_UNDERSTANDING_FAILED", statusCode = 502, details = {}, cause } = {}) {
    super(message);
    this.name = "RequirementUnderstandingError";
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    this.cause = cause;
  }
}

/**
 * OpenAI-compatible requirement-understanding client. The model is only
 * allowed to return a structured proposal; it never mutates task state.
 */
export class RequirementUnderstandingService {
  constructor({
    endpoint,
    baseUrl,
    apiKey,
    model,
    fetchImpl = globalThis.fetch,
    timeoutMs = Number(process.env.BYERING_LLM_TIMEOUT_MS || DEFAULT_TIMEOUT_MS),
    now = () => new Date().toISOString()
  } = {}) {
    this.endpoint = resolveEndpoint(endpoint, baseUrl);
    this.apiKey = apiKey ?? process.env.BYERING_LLM_API_KEY ?? process.env.DEEPSEEK_API_KEY ?? process.env.OPENAI_API_KEY ?? "";
    this.model = model || process.env.BYERING_LLM_MODEL || DEFAULT_MODEL;
    this.fetchImpl = fetchImpl;
    this.timeoutMs = Math.max(1000, Number(timeoutMs) || DEFAULT_TIMEOUT_MS);
    this.now = now;
  }

  async understand({ taskId, goal, context = {} } = {}) {
    if (!this.endpoint || !this.apiKey) {
      throw new RequirementUnderstandingError("需求理解模型未配置，任务不会使用本地模板继续执行", {
        code: "REQUIREMENT_MODEL_NOT_CONFIGURED",
        statusCode: 503,
        details: { required: ["BYERING_LLM_API_KEY"] }
      });
    }
    if (typeof this.fetchImpl !== "function") {
      throw new RequirementUnderstandingError("需求理解模型客户端不可用", {
        code: "REQUIREMENT_MODEL_CLIENT_UNAVAILABLE",
        statusCode: 503
      });
    }
    const normalizedGoal = String(goal ?? "").trim();
    if (!normalizedGoal) {
      throw new RequirementUnderstandingError("任务目标不能为空", {
        code: "REQUIREMENT_GOAL_REQUIRED",
        statusCode: 400
      });
    }
    const maxAttempts = Math.max(1, Number(process.env.BYERING_LLM_MAX_ATTEMPTS || 2));
    let lastError = null;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const requestBody = {
        model: this.model,
        temperature: 0,
        // Requirement extraction needs a fast, bounded decision, not a long
        // reasoning trace. The provider still validates and structures output.
        thinking: { type: "disabled" },
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: attempt === 0
              ? REQUIREMENT_SYSTEM_PROMPT
              : `${REQUIREMENT_SYSTEM_PROMPT}\n${REQUIREMENT_REPAIR_PROMPT}`
          },
          {
            role: "user",
            content: JSON.stringify({
              taskId: taskId || null,
              goal: normalizedGoal,
              context: isRecord(context) ? context : {},
              repairAttempt: attempt > 0
            })
          }
        ]
      };
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      let response;
      let raw;
      try {
        try {
          response = await this.fetchImpl(this.endpoint, {
            method: "POST",
            headers: {
              Accept: "application/json",
              "Content-Type": "application/json",
              Authorization: `Bearer ${this.apiKey}`
            },
            body: JSON.stringify(requestBody),
            signal: controller.signal
          });
          raw = await response.text();
        } catch (error) {
          throw new RequirementUnderstandingError(
            error?.name === "AbortError" ? "需求理解模型请求超时" : `需求理解模型请求失败：${error?.message || "连接异常"}`,
            {
              code: error?.name === "AbortError" ? "REQUIREMENT_MODEL_TIMEOUT" : "REQUIREMENT_MODEL_UNAVAILABLE",
              statusCode: 502,
              cause: error
            }
          );
        }
        const responseBody = parseJsonResponse(raw);
        if (!response?.ok) {
          throw new RequirementUnderstandingError("需求理解模型返回错误", {
            code: "REQUIREMENT_MODEL_HTTP_ERROR",
            statusCode: 502,
            details: { providerStatus: response?.status || 0, providerCode: responseBody?.error?.code || null }
          });
        }
        const content = responseBody?.choices?.[0]?.message?.content;
        if (content == null) {
          throw new RequirementUnderstandingError("需求理解模型未返回结构化内容", {
            code: "REQUIREMENT_MODEL_EMPTY_RESPONSE",
            statusCode: 502
          });
        }
        let proposal;
        try {
          proposal = parseModelJson(content);
        } catch (error) {
          throw new RequirementUnderstandingError("需求理解模型返回的内容不是有效 JSON", {
            code: "REQUIREMENT_MODEL_INVALID_JSON",
            statusCode: 502,
            cause: error
          });
        }
        return normalizeRequirementProposal(proposal, {
          source: "model",
          model: this.model,
          provider: providerFromEndpoint(this.endpoint),
          generatedAt: this.now()
        });
      } catch (error) {
        lastError = error;
        if (attempt + 1 >= maxAttempts || !shouldRetryRequirementError(error)) throw error;
      } finally {
        clearTimeout(timer);
      }
    }
    throw lastError || new RequirementUnderstandingError("需求理解模型未返回结果");
  }
}

export function createRequirementUnderstandingService(options = {}) {
  return new RequirementUnderstandingService(options);
}

/** Normalize and validate only the fields the UI/runtime is allowed to use. */
export function normalizeRequirementProposal(input, metadata = {}) {
  if (!isRecord(input)) {
    throw new RequirementUnderstandingError("需求理解结果必须是对象", {
      code: "INVALID_REQUIREMENT_PROPOSAL",
      statusCode: 502
    });
  }
  for (const key of Object.keys(input)) {
    if (HIDDEN_REASONING_KEYS.test(key)) {
      throw new RequirementUnderstandingError("需求理解结果包含禁止保存的内部推理字段", {
        code: "INVALID_REQUIREMENT_PROPOSAL",
        statusCode: 502,
        details: { field: key }
      });
    }
  }
  const values = {};
  for (const field of REQUIRED_FIELDS) {
    const value = cleanText(input[field]);
    if (!value) {
      throw new RequirementUnderstandingError(`需求理解结果缺少 ${field}`, {
        code: "INVALID_REQUIREMENT_PROPOSAL",
        statusCode: 502,
        details: { field }
      });
    }
    values[field] = value;
  }
  const missing = normalizeStringArray(input.missing);
  const assumptions = normalizeStringArray(input.assumptions);
  const confidence = input.confidence == null ? null : normalizeConfidence(input.confidence);
  const touchPlan = normalizeTouchPlan(input.touchPlan);
  return deepFreeze({
    schemaVersion: 1,
    proposalVersion: normalizeProposalVersion(input.proposalVersion ?? metadata.proposalVersion ?? 1),
    source: metadata.source || "model",
    provider: metadata.provider || null,
    model: metadata.model || null,
    generatedAt: metadata.generatedAt || new Date().toISOString(),
    title: values.title,
    objective: values.objective,
    scope: values.scope,
    deliverable: values.deliverable,
    guardrail: values.guardrail,
    missing,
    assumptions,
    confidence,
    ...(touchPlan ? { touchPlan } : {})
  });
}

const REQUIREMENT_SYSTEM_PROMPT = [
  "你是 Byering 的幕僚长，负责把用户的原始任务变成可确认、可执行的业务需求。",
  "只根据用户输入和提供的上下文做结构化理解，不得编造数据、客户数量、账号状态或执行结果。",
  "必须返回一个 JSON 对象，字段必须包含：title、objective、scope、deliverable、guardrail、missing、assumptions、confidence。",
  "如果任务涉及找人、分析、触达或抖音，请额外返回 touchPlan，字段为 source、audience、signal、filter、timeWindow、intent、relationship、action。",
  "信息不足时把缺口写入 missing，不要猜测补齐；confidence 为 0 到 1 的数字。",
  "不要返回 analysis、reasoning、thoughts、chain_of_thought 或任何隐藏推理字段。"
].join("\n");

const REQUIREMENT_REPAIR_PROMPT = [
  "这是一次结构化修复尝试。只返回一个 JSON 对象，不要解释，不要输出 Markdown。",
  "必须同时包含 title、objective、scope、deliverable、guardrail、missing、assumptions、confidence 八个字段。",
  "scope、deliverable、guardrail 可以是字符串或字符串数组，但不能省略或设为空；missing、assumptions 必须是数组；confidence 必须是 0 到 1 的数字。",
  "如果任务涉及抖音、找人、分析或触达，touchPlan 也必须是完整对象；不确定的信息放进 missing，不要编造。"
].join("\n");

function resolveEndpoint(endpoint, baseUrl) {
  const explicit = endpoint || process.env.BYERING_LLM_CHAT_COMPLETIONS_URL;
  if (explicit) return String(explicit).replace(/\/$/, "");
  const base = baseUrl || process.env.BYERING_LLM_BASE_URL || DEFAULT_BASE_URL;
  return `${String(base).replace(/\/$/, "")}/chat/completions`;
}

function providerFromEndpoint(endpoint) {
  try {
    const host = new URL(endpoint).hostname;
    if (host.includes("volces.com") || host.includes("doubao")) return "doubao";
    if (host.includes("deepseek")) return "deepseek";
    if (host.includes("openai")) return "openai";
    return "openai-compatible";
  } catch {
    return "openai-compatible";
  }
}

function parseJsonResponse(raw) {
  try { return raw ? JSON.parse(raw) : {}; } catch { return {}; }
}

function parseModelJson(content) {
  if (isRecord(content)) return content;
  const text = String(content).trim();
  const unfenced = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  return JSON.parse(unfenced);
}

function normalizeTouchPlan(input) {
  if (input == null) return null;
  if (!isRecord(input)) throw invalidField("touchPlan");
  const output = {};
  if (input.source != null) {
    const label = cleanText(isRecord(input.source) ? input.source.label : input.source);
    if (label) output.source = { label };
  }
  for (const field of TOUCH_PLAN_FIELDS) {
    const value = cleanText(input[field]);
    if (value) output[field] = value;
  }
  if (input.missing != null) output.missing = normalizeStringArray(input.missing);
  return Object.keys(output).length ? output : null;
}

function normalizeStringArray(input) {
  if (input == null) return [];
  if (!Array.isArray(input)) return cleanText(input) ? [cleanText(input)] : [];
  return input.map(cleanText).filter(Boolean).slice(0, 32);
}

function normalizeConfidence(input) {
  const value = Number(input);
  if (!Number.isFinite(value) || value < 0 || value > 1) throw invalidField("confidence");
  return value;
}

function normalizeProposalVersion(input) {
  const value = Number(input);
  if (!Number.isInteger(value) || value < 1) throw invalidField("proposalVersion");
  return value;
}

function invalidField(field) {
  return new RequirementUnderstandingError(`需求理解结果字段无效：${field}`, {
    code: "INVALID_REQUIREMENT_PROPOSAL",
    statusCode: 502,
    details: { field }
  });
}

function shouldRetryRequirementError(error) {
  return error instanceof RequirementUnderstandingError
    && new Set([
      "INVALID_REQUIREMENT_PROPOSAL",
      "REQUIREMENT_MODEL_INVALID_JSON",
      "REQUIREMENT_MODEL_EMPTY_RESPONSE",
      "REQUIREMENT_MODEL_HTTP_ERROR",
      "REQUIREMENT_MODEL_UNAVAILABLE"
    ]).has(error.code);
}

function cleanText(value) {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value).trim();
  if (Array.isArray(value)) return value.map(cleanText).filter(Boolean).join("；");
  return "";
}

function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}
