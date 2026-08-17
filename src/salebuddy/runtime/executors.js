/**
 * Runtime executor registry and parallel scheduler.
 * Adapters are deliberately injected so production integrations can be
 * supplied by the host gateway without coupling the UI to a provider.
 */

function normalizeAdapter(adapter) {
  if (typeof adapter === "function") return adapter;
  if (adapter && typeof adapter.execute === "function") return adapter.execute.bind(adapter);
  return null;
}

export function createExecutorRegistry(adapters = {}) {
  const entries = new Map();
  for (const [id, adapter] of Object.entries(adapters || {})) {
    const execute = normalizeAdapter(adapter);
    if (execute) entries.set(id, execute);
  }
  return {
    register(id, adapter) {
      const execute = normalizeAdapter(adapter);
      if (!id || !execute) throw new TypeError("executor id and execute adapter are required");
      entries.set(String(id), execute);
      return this;
    },
    has(id) { return entries.has(id); },
    list() { return [...entries.keys()]; },
    resolve(id) { return entries.get(id) || null; }
  };
}

export async function runExecutor({ registry, executorId, input, context = {}, signal } = {}) {
  const execute = registry?.resolve?.(executorId);
  if (!execute) {
    return {
      status: "blocked",
      executorId,
      code: "executor_not_configured",
      message: `Executor ${executorId || "unknown"} is not configured`
    };
  }
  if (signal?.aborted) {
    return { status: "cancelled", executorId, code: "aborted" };
  }
  try {
    const value = await execute({ input, context, signal });
    if (value?.status && ["blocked", "cancelled", "failed"].includes(value.status)) {
      return { executorId, ...value };
    }
    return { status: "completed", executorId, output: value };
  } catch (error) {
    return {
      status: "failed",
      executorId,
      code: error?.code || "executor_failed",
      message: error?.message || String(error)
    };
  }
}

export async function runParallelExecutors({ registry, jobs = [], context = {}, signal, onEvent } = {}) {
  const emit = (event) => { try { onEvent?.(event); } catch { /* telemetry must not break execution */ } };
  emit({ type: "parallel.started", count: jobs.length });
  const results = await Promise.all(jobs.map(async (job, index) => {
    const base = { index, skillId: job.skillId || null, executorId: job.executorId };
    emit({ type: "executor.started", ...base });
    const result = await runExecutor({ registry, executorId: job.executorId, input: job.input, context, signal });
    emit({ type: "executor.completed", ...base, status: result.status, code: result.code || null });
    return { ...base, ...result };
  }));
  const status = results.some((item) => item.status === "failed")
    ? "failed"
    : results.some((item) => item.status === "blocked")
      ? "blocked"
      : results.some((item) => item.status === "cancelled")
        ? "cancelled"
        : "completed";
  emit({ type: "parallel.completed", status, results });
  return { status, results };
}
