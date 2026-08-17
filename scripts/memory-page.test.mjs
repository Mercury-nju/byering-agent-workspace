import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../src/salebuddy/ui/memory-page.js", import.meta.url), "utf8");

test("memory map renders concrete memory records as outward graph nodes", () => {
  assert.match(source, /const DEMO_MEMORY_ENTRIES/);
  assert.match(source, /sb-memory-entry-node/);
  assert.match(source, /const entryPositions =/);
  assert.match(source, /const renderEntryNodes = \(\) =>/);
  assert.match(source, /sb-memory-entry-link/);
  assert.match(source, /entryNodeById\.set\(entry\.id, node\)/);
});

test("memory map keeps the inspector as an auxiliary detail surface", () => {
  assert.match(source, /selectEntry = \(entry\) =>/);
  assert.match(source, /点击记忆节点查看详情/);
  assert.match(source, /还有 \$\{related\.length - 2\} 条记忆/);
});
