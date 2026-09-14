const SECRET_KEY = /(?:authorization|(?:access|refresh)?[_-]?token|password|passwd|cookie|secret|csrf|jwt)/i;

function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function cleanText(value, max = 800) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function safeValue(value, depth = 0) {
  if (depth > 5 || value == null) return undefined;
  if (["string", "number", "boolean"].includes(typeof value)) return value;
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => safeValue(item, depth + 1)).filter((item) => item !== undefined);
  if (!isRecord(value)) return undefined;
  const output = {};
  for (const [key, item] of Object.entries(value)) {
    if (SECRET_KEY.test(key) || key.startsWith("_")) continue;
    const normalized = safeValue(item, depth + 1);
    if (normalized !== undefined) output[key] = normalized;
  }
  return output;
}

function outputFacts(payload = {}) {
  const source = isRecord(payload) ? payload : {};
  const fields = [
    "summary", "result", "resultSnapshot", "artifact", "artifacts", "evidence", "links",
    "candidates", "leads", "qualifiedLeads", "candidateIds", "count", "source", "sourceScope",
    "outcome", "message", "text"
  ];
  const output = {};
  for (const field of fields) {
    const value = safeValue(source[field]);
    if (value !== undefined) output[field] = value;
  }
  return output;
}

function targetStep(task = {}, target = {}) {
  const steps = Array.isArray(task.assignment?.execution?.steps) ? task.assignment.execution.steps : [];
  const reference = typeof target === "string" ? { agentId: target } : (isRecord(target) ? target : {});
  const stepId = cleanText(reference.stepId, 160);
  const taskRunId = cleanText(reference.taskRunId, 160);
  const agentId = cleanText(reference.agentId, 160);
  if (stepId) {
    const byStepId = steps.find((step) => step?.id === stepId);
    // A caller that supplies a step must never fall back to another step.
    if (!byStepId || (taskRunId && byStepId.taskRunId !== taskRunId)) return null;
    return byStepId;
  }

  return (taskRunId && steps.find((step) => step?.taskRunId === taskRunId))
    || (agentId && steps.find((step) => step?.agentId === agentId && step?.status !== "COMPLETED"))
    || null;
}

function predecessorSteps(task = {}, target = {}) {
  const steps = Array.isArray(task.assignment?.execution?.steps) ? task.assignment.execution.steps : [];
  const matched = targetStep(task, target);
  if (!matched) return [];
  const dependencies = new Set(Array.isArray(matched.dependsOn) ? matched.dependsOn : []);
  return steps.filter((step) => dependencies.has(step?.agentId) && step?.status === "COMPLETED" && step?.handoff);
}

export function buildAssignmentHandoff({ task = {}, step = {}, payload = {}, createdAt, successorSteps = [] } = {}) {
  const outputs = outputFacts(payload);
  return {
    schemaVersion: 1,
    taskId: cleanText(task.taskId, 160) || null,
    parentTaskRunId: cleanText(task.taskRunId, 160) || null,
    goal: cleanText(task.goal, 800) || null,
    from: {
      agentId: cleanText(step.agentId, 160) || null,
      agentName: cleanText(step.agentName, 160) || null,
      stepId: cleanText(step.id, 160) || null,
      taskRunId: cleanText(step.taskRunId, 160) || null
    },
    toAgentIds: successorSteps.map((successor) => cleanText(successor?.agentId, 160)).filter(Boolean),
    completedAt: createdAt || null,
    outputs,
    constraints: {
      requiresAccess: task.workflow?.requiresAccess === true,
      sourceScope: safeValue(task.configuration?.executionConfig?.sourceScope) || null,
      approvalMode: cleanText(task.configuration?.executionConfig?.approvalMode, 80) || null
    }
  };
}

export function handoffsForAssignmentExecution(task = {}, target = {}) {
  return predecessorSteps(task, target).map((step) => safeValue(step.handoff)).filter(Boolean);
}

export function companionTaskFacts(snapshot = {}, { agentId = "", taskRunId = "" } = {}) {
  if (!isRecord(snapshot)) return null;
  const steps = Array.isArray(snapshot.assignment?.execution?.steps) ? snapshot.assignment.execution.steps : [];
  const matched = steps.find((step) => step?.taskRunId === taskRunId)
    || steps.find((step) => step?.agentId === agentId && ["PENDING", "RUNNING"].includes(step?.status))
    || null;
  return {
    taskId: cleanText(snapshot.taskId, 160) || null,
    taskRunId: cleanText(taskRunId || matched?.taskRunId || snapshot.taskRunId, 160) || null,
    goal: cleanText(snapshot.goal, 800) || null,
    state: cleanText(snapshot.state, 80) || null,
    agentId: cleanText(agentId, 160) || null,
    stage: matched ? {
      stepId: cleanText(matched.id, 160) || null,
      status: cleanText(matched.status, 80) || null,
      dependsOn: Array.isArray(matched.dependsOn) ? [...matched.dependsOn] : []
    } : null,
    incomingHandoffs: handoffsForAssignmentExecution(snapshot, {
      agentId,
      taskRunId: taskRunId || matched?.taskRunId || "",
      stepId: matched?.id || ""
    }),
    resultSnapshot: safeValue(snapshot.resultSnapshot) || null
  };
}
