const STORAGE_KEY = "salebuddy.materials.v1";
const memory = new Map();

function readStorage(storage) {
  try {
    const raw = storage?.getItem?.(STORAGE_KEY) || memory.get(STORAGE_KEY) || "[]";
    const items = JSON.parse(raw);
    return Array.isArray(items) ? items : [];
  } catch { return []; }
}

function writeStorage(storage, items) {
  const value = JSON.stringify(items.slice(0, 100));
  try { storage?.setItem?.(STORAGE_KEY, value); } catch { /* private mode fallback */ }
  memory.set(STORAGE_KEY, value);
}

function encode(body) {
  if (typeof body === "string") return { kind: "text", value: body };
  if (body instanceof Uint8Array && typeof Buffer !== "undefined") return { kind: "base64", value: Buffer.from(body).toString("base64") };
  if (body instanceof Uint8Array && typeof globalThis.btoa === "function") {
    let binary = "";
    body.forEach((byte) => { binary += String.fromCharCode(byte); });
    return { kind: "base64", value: globalThis.btoa(binary) };
  }
  return { kind: "text", value: String(body || "") };
}

function decode(body) {
  if (!body) return null;
  if (body.kind === "text") return body.value;
  if (typeof Buffer !== "undefined") return Uint8Array.from(Buffer.from(body.value, "base64"));
  if (typeof globalThis.atob === "function") return Uint8Array.from(globalThis.atob(body.value), (char) => char.charCodeAt(0));
  return null;
}

export function createMaterialStore({ storage = globalThis.localStorage } = {}) {
  return {
    put({ id, title, formatId, fileName, mimeType, body } = {}) {
      if (!id || body == null) throw new TypeError("material id and body are required");
      const items = readStorage(storage).filter((item) => item.id !== id);
      const record = { id, title: title || "未命名物料", formatId, fileName, mimeType, body: encode(body), updatedAt: new Date().toISOString() };
      items.unshift(record);
      writeStorage(storage, items);
      return record;
    },
    get(id) {
      const record = readStorage(storage).find((item) => item.id === id);
      return record ? { ...record, body: decode(record.body) } : null;
    }
  };
}
