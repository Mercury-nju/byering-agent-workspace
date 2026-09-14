import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createProspectRecordStore } from "../backend/prospect-record-store.js";

test("prospect records persist by tenant and retain the newest customer lifecycle state", () => {
  const directory = mkdtempSync(join(tmpdir(), "prospect-record-store-"));
  const stateFile = join(directory, "prospects.json");
  try {
    const store = createProspectRecordStore({ stateFile });
    store.upsert("tenant-a", [{
      id: "lead-1",
      name: "小林",
      status: "已回复",
      updatedAt: "2026-09-12T10:00:00.000Z"
    }]);
    store.upsert("tenant-a", [{
      id: "lead-1",
      name: "小林",
      status: "已转化",
      conversionStatus: "已转化",
      updatedAt: "2026-09-12T11:00:00.000Z"
    }]);
    store.upsert("tenant-b", [{
      id: "lead-1",
      name: "另一位客户",
      status: "待触达",
      updatedAt: "2026-09-12T12:00:00.000Z"
    }]);

    const restored = createProspectRecordStore({ stateFile });
    assert.deepEqual(restored.list("tenant-a"), [{
      id: "lead-1",
      name: "小林",
      status: "已转化",
      conversionStatus: "已转化",
      updatedAt: "2026-09-12T11:00:00.000Z"
    }]);
    assert.deepEqual(restored.list("tenant-b"), [{
      id: "lead-1",
      name: "另一位客户",
      status: "待触达",
      updatedAt: "2026-09-12T12:00:00.000Z"
    }]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("prospect records can be deleted without crossing tenant boundaries", () => {
  const directory = mkdtempSync(join(tmpdir(), "prospect-record-delete-"));
  const stateFile = join(directory, "prospects.json");
  try {
    const store = createProspectRecordStore({ stateFile });
    store.upsert("tenant-a", [{ id: "a-1" }, { id: "a-2" }]);
    store.upsert("tenant-b", [{ id: "b-1" }]);
    assert.equal(store.remove("tenant-a", ["a-1"]).deleted, 1);
    assert.deepEqual(store.list("tenant-a").map((item) => item.id), ["a-2"]);
    assert.deepEqual(store.list("tenant-b").map((item) => item.id), ["b-1"]);
    assert.equal(store.remove("tenant-a").deleted, 1);
    assert.deepEqual(store.list("tenant-a"), []);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
