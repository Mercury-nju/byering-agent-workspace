import test from "node:test";
import assert from "node:assert/strict";
import {
  CHIEF_AGENT_TYPE,
  CHIEF_CONVERSATION_ID,
  chiefDmPayload,
  dmPayloadFor,
  normalizeChiefMessages
} from "../src/salebuddy/agents/chief-conversation.js";
import { readFile } from "node:fs/promises";

test("chief conversation uses one durable identity for both entry points", () => {
  assert.equal(CHIEF_AGENT_TYPE, "main");
  assert.equal(CHIEF_CONVERSATION_ID, "chief-of-staff");
  assert.deepEqual(
    chiefDmPayload({ from: "user", text: "开始今天的工作" }),
    {
      agentType: "main",
      conversationId: "chief-of-staff",
      from: "user",
      text: "开始今天的工作"
    }
  );
  assert.deepEqual(
    dmPayloadFor("chief_of_staff", { from: "user", text: "查看进展" }),
    {
      agentType: "main",
      conversationId: "chief-of-staff",
      from: "user",
      text: "查看进展"
    }
  );
});

test("chief messages normalize remote and local shapes without losing order", () => {
  const messages = normalizeChiefMessages([
    { id: "a", from: "main", fromName: "幕僚长", text: "已收到", createdAt: "2026-09-02T10:00:00.000Z" },
    { id: "b", from: "user", fromName: "我", text: "继续", createdAt: "2026-09-02T10:01:00.000Z" }
  ]);
  assert.deepEqual(messages.map(({ role, text }) => ({ role, text })), [
    { role: "assistant", text: "已收到" },
    { role: "user", text: "继续" }
  ]);
});

test("the members page keeps the chief conversation read-only with respect to task creation", async () => {
  const source = await readFile(new URL("../src/salebuddy/ui/contacts-page.js", import.meta.url), "utf8");
  const sendFlow = source.slice(source.indexOf("async function send()"), source.indexOf("sendBtn.addEventListener", source.indexOf("async function send()")));
  assert.match(sendFlow, /chiefTaskMode/);
  assert.doesNotMatch(sendFlow, /startSkillTask/);
  assert.doesNotMatch(sendFlow, /chiefDecisionId/);
  assert.match(sendFlow, /source: "chief-conversation", entry: "members"/);
});
