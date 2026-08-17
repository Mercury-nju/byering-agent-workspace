import assert from "node:assert/strict";
import test from "node:test";
import { createMaterialStore } from "../src/salebuddy/agents/material-store.js";

function storage() { const map = new Map(); return { getItem: (key) => map.get(key) || null, setItem: (key, value) => map.set(key, value) }; }

test("material store persists binary artifacts for a share page", () => {
  const store = createMaterialStore({ storage: storage() });
  const body = new Uint8Array([80, 75, 3, 4]);
  store.put({ id: "m1", title: "访谈", formatId: "ppt", fileName: "访谈.pptx", mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation", body });
  assert.deepEqual([...store.get("m1").body], [...body]);
});
