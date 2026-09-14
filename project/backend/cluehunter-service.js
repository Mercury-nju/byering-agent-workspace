import {
  CLUEHUNTER_ACTIONS,
  ClueHunterConnectorError,
  createClueHunterConnector
} from "../src/salebuddy/bridge/cluehunter-connector.js";

const OPERATIONS = Object.freeze(["lease", "ack", "authorize", "status", "submit"]);
const REQUIRED_OPERATIONS = Object.freeze(["lease", "ack", "authorize", "status"]);
const CONTEXT_FIELDS = Object.freeze(["taskId", "taskRunId", "conversationId", "agentId"]);
const SECRET_KEY = /(?:authorization|(?:access|refresh)?[_-]?token|password|passwd|cookie|secret|csrf|jwt)/i;
const RESULT_VALUES = new Set(["SUCCESS", "FAIL", "FAIL_RETRY", "ISSUED"]);

export class ClueHunterServiceError extends Error {
  constructor(message, { code = "CLUEHUNTER_SERVICE_ERROR", statusCode = 400, details = {} } = {}) {
    super(message);
    this.name = "ClueHunterServiceError";
    this.code = code;
    this.statusCode = statusCode;
    Object.assign(this, details);
    this.details = details;
  }
}

function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function redactDetails(value) {
  if (Array.isArray(value)) return value.map(redactDetails);
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !SECRET_KEY.test(key) && key !== "cause")
    .map(([key, item]) => [key, redactDetails(item)]));
}

function nonEmpty(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function requiredString(input, field) {
  const value = nonEmpty(input[field]);
  if (!value) {
    throw new ClueHunterServiceError(`${field} is required`, {
      code: "CLUEHUNTER_INPUT_INVALID",
      statusCode: 400,
      details: { field }
    });
  }
  return value;
}

function normalizeInput(value) {
  if (!isRecord(value)) {
    throw new ClueHunterServiceError("ClueHunter request body must be a JSON object", {
      code: "CLUEHUNTER_INPUT_INVALID",
      statusCode: 400
    });
  }
  return { ...value };
}

function validateBaseInput(input) {
  const normalized = normalizeInput(input);
  requiredString(normalized, "uid");
  for (const field of CONTEXT_FIELDS) requiredString(normalized, field);
  const hasSkillId = Boolean(nonEmpty(normalized.skillId || normalized.skill_id));
  const hasSkillRunId = Boolean(nonEmpty(normalized.skillRunId || normalized.skill_run_id));
  if (hasSkillId !== hasSkillRunId) {
    throw new ClueHunterServiceError("skillId and skillRunId must be provided together", {
      code: "CLUEHUNTER_INPUT_INVALID",
      statusCode: 400,
      details: { field: "skillId" }
    });
  }
  return normalized;
}

function rejectClientCredentials(input) {
  for (const field of Object.keys(input)) {
    if (field === "token" || field === "tokenProvider" || SECRET_KEY.test(field)) {
      throw new ClueHunterServiceError(`${field} cannot be provided by the client`, {
        code: "CLUEHUNTER_CREDENTIALS_FORBIDDEN",
        statusCode: 400,
        details: { field }
      });
    }
  }
}

function validateOperationInput(operation, value) {
  if (!OPERATIONS.includes(operation)) {
    throw new ClueHunterServiceError(`Unsupported ClueHunter operation: ${operation}`, {
      code: "CLUEHUNTER_OPERATION_INVALID",
      statusCode: 404,
      details: { operation }
    });
  }
  const input = validateBaseInput(value);
  rejectClientCredentials(input);
  if (operation === "ack") {
    requiredString(input, "ackId");
    if (input.actionType === undefined && input.action_type === undefined) {
      throw new ClueHunterServiceError("actionType is required", {
        code: "CLUEHUNTER_INPUT_INVALID",
        statusCode: 400,
        details: { field: "actionType" }
      });
    }
    const actionType = Number(input.actionType ?? input.action_type);
    if (!Number.isInteger(actionType) || !Object.hasOwn(CLUEHUNTER_ACTIONS, actionType)) {
      throw new ClueHunterServiceError("actionType is not supported", {
        code: "CLUEHUNTER_INPUT_INVALID",
        statusCode: 400,
        details: { field: "actionType", actionType: input.actionType ?? input.action_type }
      });
    }
    const result = requiredString(input, "result").toUpperCase();
    if (!RESULT_VALUES.has(result)) {
      throw new ClueHunterServiceError("result is not supported", {
        code: "CLUEHUNTER_INPUT_INVALID",
        statusCode: 400,
        details: { field: "result", result }
      });
    }
  }
  if (operation === "submit") {
    requiredString(input, "idempotencyKey");
    if (input.actionType === undefined && input.action_type === undefined && !nonEmpty(input.action)) {
      throw new ClueHunterServiceError("actionType or action is required", {
        code: "CLUEHUNTER_INPUT_INVALID",
        statusCode: 400,
        details: { field: "actionType" }
      });
    }
    if (input.actionType !== undefined || input.action_type !== undefined) {
      const actionType = Number(input.actionType ?? input.action_type);
      if (!Number.isInteger(actionType) || !Object.hasOwn(CLUEHUNTER_ACTIONS, actionType)) {
        throw new ClueHunterServiceError("actionType is not supported", {
          code: "CLUEHUNTER_INPUT_INVALID",
          statusCode: 400,
          details: { field: "actionType", actionType: input.actionType ?? input.action_type }
        });
      }
    }
  }
  return input;
}

function readEnv(env) {
  const source = env && typeof env === "object" ? env : {};
  return {
    baseUrl: nonEmpty(source.BYERING_CLUEHUNTER_BASE_URL),
    secret: nonEmpty(source.BYERING_CLUEHUNTER_SIGNING_SECRET),
    authorizationToken: nonEmpty(source.BYERING_CLUEHUNTER_AUTH_TOKEN),
    paths: { submit: nonEmpty(source.BYERING_CLUEHUNTER_SUBMIT_PATH) }
  };
}

function configurationError(cause = null) {
  return new ClueHunterServiceError("ClueHunter connector is not configured", {
    code: "CLUEHUNTER_NOT_CONFIGURED",
    statusCode: 503,
    details: cause ? { reason: cause.code || cause.message } : {}
  });
}

function validateConnector(connector) {
  if (!connector || typeof connector !== "object") return false;
  return REQUIRED_OPERATIONS.every((operation) => typeof connector[operation] === "function");
}

function connectorErrorStatus(code) {
  if (["UPSTREAM_UNAVAILABLE", "CONFIG_INVALID", "TOKEN_INVALID", "TOKEN_PROVIDER_FAILED", "SUBMIT_NOT_CONFIGURED"].includes(code)) return 503;
  if (["UPSTREAM_HTTP_ERROR", "UPSTREAM_REJECTED", "UPSTREAM_EMPTY", "RESPONSE_EMPTY", "RESPONSE_INVALID", "ACK_RESPONSE_AMBIGUOUS", "ACK_RESULT_MISMATCH", "SUBMIT_RESPONSE_AMBIGUOUS", "SUBMIT_RESPONSE_INVALID"].includes(code)) return 502;
  if (["UNKNOWN_ACTION", "RESULT_REQUIRED", "CONTEXT_REQUIRED", "ACK_ID_REQUIRED", "ACK_INVALID", "IDEMPOTENCY_KEY_REQUIRED", "SUBMIT_ACTION_REQUIRED", "TENANT_REQUIRED", "UID_INVALID", "QUEUE_REQUIRED"].includes(code)) return 400;
  return 502;
}

/**
 * Server-only facade for the legacy ClueHunter execution service.
 *
 * It intentionally remains usable when deployment configuration is absent so
 * the HTTP layer can return a deterministic 503 instead of simulating work.
 */
export function createClueHunterService({ connector = null, env = process.env, connectorFactory = createClueHunterConnector } = {}) {
  let configuredConnector = null;
  let setupError = null;

  if (connector != null) {
    if (!validateConnector(connector)) setupError = configurationError(new Error("connector must implement lease, ack, authorize, and status"));
    else configuredConnector = connector;
  } else {
    const configuration = readEnv(env);
    if (!configuration.baseUrl || !configuration.secret) {
      setupError = configurationError();
    } else {
      try {
        configuredConnector = connectorFactory(configuration);
        if (!validateConnector(configuredConnector)) setupError = configurationError(new Error("connector factory returned an incomplete connector"));
      } catch (error) {
        setupError = configurationError(error);
      }
    }
  }

  async function execute(operation, value) {
    const input = validateOperationInput(operation, value);
    if (!configuredConnector) throw setupError || configurationError();
    if (operation === "submit" && typeof configuredConnector.submit !== "function") {
      throw new ClueHunterServiceError("ClueHunter submit contract is not configured", {
        code: "SUBMIT_NOT_CONFIGURED",
        statusCode: 503,
        details: { required: "BYERING_CLUEHUNTER_SUBMIT_PATH" }
      });
    }
    try {
      return await configuredConnector[operation](input);
    } catch (error) {
      if (error instanceof ClueHunterServiceError) throw error;
      if (error instanceof ClueHunterConnectorError) {
        throw new ClueHunterServiceError(error.message, {
          code: error.code || "CLUEHUNTER_OPERATION_FAILED",
          statusCode: connectorErrorStatus(error.code),
          details: redactDetails(error.details || {})
        });
      }
      throw new ClueHunterServiceError("ClueHunter operation failed", {
        code: "CLUEHUNTER_OPERATION_FAILED",
        statusCode: 502,
        details: { operation, cause: error?.code || error?.message || "unknown" }
      });
    }
  }

  return Object.freeze({
    configured: Boolean(configuredConnector),
    lease: (input) => execute("lease", input),
    ack: (input) => execute("ack", input),
    authorize: (input) => execute("authorize", input),
    status: (input) => execute("status", input),
    submit: (input) => execute("submit", input)
  });
}
