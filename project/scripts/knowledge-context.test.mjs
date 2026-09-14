import assert from "node:assert/strict";
import test from "node:test";
import { buildKnowledgeContext, collectAgentKnowledge, createAgentKnowledgeProvider } from "../backend/knowledge-context.js";

test("knowledge context includes agent entries and shared main-agent entries", async () => {
  const store = {
    listMemory(agentType) {
      if (agentType === "mkt-dm-inbox") return [{ id: "agent-1", kind: "projectRules", scope: "agent", status: "active", text: "只介绍已确认的服务范围。", updatedAt: "2026-09-03T10:00:00.000Z" }];
      return [
        { id: "main-1", kind: "projectRules", scope: "project", status: "active", text: "当前项目服务企业客户。", updatedAt: "2026-09-03T09:00:00.000Z" },
        { id: "main-2", kind: "lessons", scope: "task", status: "active", text: "不应被其他 Agent 继承。", updatedAt: "2026-09-03T11:00:00.000Z" },
        { id: "main-3", kind: "feedback", scope: "organization", status: "rolled-back", text: "已回退的规则。", updatedAt: "2026-09-03T12:00:00.000Z" }
      ];
    }
  };
  const entries = collectAgentKnowledge({ agentStore: store, agentId: "mkt-dm-inbox" });
  assert.deepEqual(entries.map((entry) => entry.id), ["agent-1", "main-1"]);
  assert.match(buildKnowledgeContext(entries), /当前项目服务企业客户/);
  assert.match(buildKnowledgeContext(entries), /只介绍已确认的服务范围/);

  const context = await createAgentKnowledgeProvider({ agentStore: store })({ agentId: "mkt-dm-inbox" });
  assert.equal(context.entries.length, 2);
  assert.equal(context.agentId, "mkt-dm-inbox");
  assert.match(context.context, /项目背景/);
});

test("knowledge context is bounded and never returns rolled-back records", () => {
  const entries = Array.from({ length: 50 }, (_, index) => ({
    id: `entry-${index}`,
    kind: "bestPractices",
    scope: "agent",
    status: "active",
    text: "x".repeat(500),
    updatedAt: new Date(2026, 8, 3, 12, index % 60).toISOString()
  }));
  const context = buildKnowledgeContext(entries, { maxEntries: 6, maxChars: 1000 });
  assert.ok(context.length <= 1000);
  assert.equal((context.match(/工作方法/g) || []).length, 2);
});
