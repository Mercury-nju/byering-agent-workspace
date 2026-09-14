import { receptionBaseUrl } from "./account-reception-client.js";

function headers({ json = false } = {}) {
  const config = globalThis.__SALEBUDDY_CONFIG__ || {};
  const key = config.controlPlaneApiKey || globalThis.document?.querySelector('meta[name="salebuddy-control-plane-api-key"]')?.content;
  const header = (config.controlPlaneApiKeyHeader || "authorization").toLowerCase();
  return {
    accept: "application/json",
    ...(json ? { "content-type": "application/json" } : {}),
    ...(key ? { [header]: header === "authorization" ? `Bearer ${key}` : key } : {})
  };
}

export async function fetchCanonicalResultRuns({ signal, limit = 100 } = {}) {
  const response = await fetch(`${receptionBaseUrl()}/v1/results?limit=${encodeURIComponent(String(limit))}`, {
    signal,
    cache: "no-store",
    headers: headers()
  });
  if (!response.ok) throw new Error("Results unavailable");
  const payload = await response.json();
  return {
    observedAt: payload?.observedAt || null,
    runs: Array.isArray(payload?.runs) ? payload.runs : [],
    prospects: Array.isArray(payload?.prospects) ? payload.prospects : []
  };
}

export async function fetchCanonicalArtifact(artifactId, { signal } = {}) {
  const id = String(artifactId || "").trim();
  if (!id) throw new Error("Artifact id is required");
  const response = await fetch(`${receptionBaseUrl()}/v1/artifacts/${encodeURIComponent(id)}`, {
    signal,
    cache: "no-store",
    headers: headers()
  });
  if (!response.ok) throw new Error("Task artifact unavailable");
  const payload = await response.json();
  if (!payload?.artifact || typeof payload.artifact !== "object") throw new Error("Task artifact unavailable");
  return payload.artifact;
}

export async function saveCanonicalProspectRecords(records, { signal } = {}) {
  const response = await fetch(`${receptionBaseUrl()}/v1/results/prospects`, {
    method: "PUT",
    signal,
    cache: "no-store",
    headers: headers({ json: true }),
    body: JSON.stringify({ records: Array.isArray(records) ? records : [] })
  });
  if (!response.ok) throw new Error("Customer assets unavailable");
  const payload = await response.json();
  return Array.isArray(payload?.prospects) ? payload.prospects : [];
}
