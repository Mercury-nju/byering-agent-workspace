import { receptionBaseUrl } from "./account-reception-client.js";

export async function companionRequest(method, path, body) {
  const config = globalThis.__SALEBUDDY_CONFIG__ || {};
  const key = config.controlPlaneApiKey || globalThis.document?.querySelector('meta[name="salebuddy-control-plane-api-key"]')?.content;
  const header = (config.controlPlaneApiKeyHeader || "authorization").toLowerCase();
  const verb = String(method || "GET").toUpperCase();
  const readOnly = verb === "GET" || verb === "HEAD";
  const url = new URL(`${receptionBaseUrl()}${path}`);
  if (readOnly && body && typeof body === "object") {
    for (const [name, value] of Object.entries(body)) {
      if (value == null || value === "") continue;
      url.searchParams.set(name, typeof value === "string" ? value : JSON.stringify(value));
    }
  }
  const response = await fetch(url, { method: verb, signal: AbortSignal.timeout(12000),
    headers: { ...(readOnly ? {} : { "content-type": "application/json" }), ...(key ? { [header]: header === "authorization" ? `Bearer ${key}` : key } : {}) },
    ...(!readOnly && body ? { body: JSON.stringify(body) } : {}) });
  const result = await response.json();
  if (!response.ok) throw Object.assign(new Error(result?.error?.message || "暂时没能保存，请再试一次"), { statusCode: response.status });
  return result;
}

export function latestCompanionPhase(messages) {
  const users = messages.filter(message => message.from === "user" && message.metadata?.companionReply);
  const pending = users.find(message => ["thinking", "queued"].includes(message.metadata.companionReply.phase));
  const recent = pending || users.at(-1);
  return { phase: recent?.metadata?.companionReply?.phase || "ready", messageId: recent?.id };
}

export async function companionCardAction(agentId, input, { onConfigure, onOpenWork } = {}) {
  const result = await companionRequest("POST", "/v1/direct-messages/action", { agentId, ...input });
  if (result.destination === "configure") onConfigure?.(agentId);
  if (result.destination === "progress") onOpenWork?.(agentId);
  return result;
}
