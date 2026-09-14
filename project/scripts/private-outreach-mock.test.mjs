import assert from "node:assert/strict";
import test from "node:test";
import {
  createPrivateOutreachMockData,
  createPrivateOutreachMockResult,
  isPrivateOutreachMockPreview
} from "../src/salebuddy/ui/private-outreach-mock.js";

test("private outreach mock exposes a usable account and analyzed prospects", () => {
  const data = createPrivateOutreachMockData();

  assert.equal(data.account.mock, true);
  assert.equal(data.account.agentId, "mkt-cold-writer");
  assert.ok(data.account.identity?.uniqueId);
  assert.ok(data.records.length >= 3);
  assert.ok(data.records.every((record) => record.status === "待确认触达"));
  assert.ok(data.records.every((record) => record.contactability?.allowed === true));
  assert.ok(data.records.every((record) => record.source?.accountId === data.account.id));
  assert.ok(data.records.every((record) => record.evidence?.[0]?.quote));
  assert.ok(new Set(data.records.map((record) => record.source?.sourceScope)).size >= 2);
});

test("private outreach mock result returns one platform receipt per target", () => {
  const { records } = createPrivateOutreachMockData();
  const entries = records.map((record) => ({
    ...record,
    recordId: record.id,
    secId: record.secId,
    secUid: record.secUid,
    nickname: record.name,
    status: "pending"
  }));

  const result = createPrivateOutreachMockResult(entries, "你好，方便了解一下购车需求吗？");

  assert.equal(result.total, entries.length);
  assert.equal(result.sent, entries.length);
  assert.equal(result.failed, 0);
  assert.equal(result.unknown, 0);
  assert.equal(result.status, "completed");
  assert.equal(result.entries.length, entries.length);
  assert.ok(result.entries.every((entry) => entry.status === "sent"));
  assert.ok(result.entries.every((entry) => entry.providerResult?.mock === true));
  assert.ok(result.entries.every((entry) => entry.providerResult?.message === "你好，方便了解一下购车需求吗？"));
});

test("private outreach mock is limited to local style preview", () => {
  assert.equal(isPrivateOutreachMockPreview({ search: "?page=agent-square&preview=style", hostname: "127.0.0.1" }), true);
  assert.equal(isPrivateOutreachMockPreview({ search: "?page=agent-square&preview=style", hostname: "example.com" }), false);
  assert.equal(isPrivateOutreachMockPreview({ search: "?page=agent-square", hostname: "127.0.0.1" }), false);
});
