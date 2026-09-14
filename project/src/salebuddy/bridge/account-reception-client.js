export function receptionBaseUrl() {
  return String(globalThis.__SALEBUDDY_CONFIG__?.controlPlaneUrl || globalThis.document?.querySelector('meta[name="salebuddy-control-plane"]')?.content || "http://127.0.0.1:6681").replace(/\/$/, "");
}
export async function receptionRequest(accountId, { operation = "", method = "GET", body = {} } = {}) {
  const url = `${receptionBaseUrl()}/v1/accounts/reception${operation}?accountId=${encodeURIComponent(accountId)}`;
  const response = await fetch(url, { method, headers: { "content-type": "application/json", accept: "application/json" }, ...(method === "GET" ? {} : { body: JSON.stringify({ ...body, accountId }) }) });
  const result = await response.json();
  if (!response.ok) throw Object.assign(new Error(result.error?.message || "接待配置暂时无法读取"), { code: result.error?.code });
  return result;
}
