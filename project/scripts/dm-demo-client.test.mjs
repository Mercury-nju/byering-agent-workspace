import assert from "node:assert/strict";
import test from "node:test";
import { createDemoDmGateway, DEMO_DM_SEED_VERSION } from "../src/salebuddy/agents/dm-demo-client.js";

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

test("local demo gateway seeds business memory for an investor conversation", async () => {
  const gateway = createDemoDmGateway({ delayMs: 0 });
  const agentType = "mkt-comment-acquisition";
  const conversationId = "investor-demo-stateful";
  const list = () => gateway.action("dm.message.list", { agentType });
  const send = async text => {
    await gateway.action("dm.message.send", { agentType, conversationId, from: "user", fromName: "我", text });
    await wait(10);
    const messages = (await list()).data.messages;
    return messages.filter(message => message.conversationId === conversationId).at(-1);
  };

  const seeded = (await list()).data.messages;
  assert.equal(DEMO_DM_SEED_VERSION, "20260914-business-memory-2");
  assert.ok(seeded.some(message => /4,286|138 位/.test(message.text)), "缺少带具体指标的业务记忆");

  const metrics = await send("昨天的数据怎么样？转化了多少线索？");
  assert.match(metrics.text, /4,286/);
  assert.match(metrics.text, /0%/);

  await send("为什么转化率低？");
  const proposal = await send("后面要怎么解决？");
  assert.equal(proposal.metadata.demoProposal.status, "pending");
  assert.match(proposal.text, /确认/);

  const applied = await send("可以，立即生效");
  assert.match(applied.text, /已生效/);
  assert.equal(applied.metadata.demoConfigApplied.touchWindow, "2 小时内");
  gateway.dispose();
});

test("local demo gateway restores a pending proposal after reopening the page", async () => {
  const agentType = "mkt-dm-inbox";
  const conversationId = "investor-demo-reopen";
  const send = async (gateway, text) => {
    await gateway.action("dm.message.send", { agentType, conversationId, from: "user", fromName: "我", text });
    await wait(10);
    const messages = (await gateway.action("dm.message.list", { agentType })).data.messages;
    return messages.filter(message => message.conversationId === conversationId).at(-1);
  };

  const firstSession = createDemoDmGateway({ delayMs: 0 });
  await send(firstSession, "后面怎么解决？");
  firstSession.dispose();

  const reopenedSession = createDemoDmGateway({ delayMs: 0 });
  const applied = await send(reopenedSession, "可以，立即生效");
  assert.match(applied.text, /已生效/);
  assert.equal(applied.metadata.demoConfigApplied.replySla, "15 分钟");
  reopenedSession.dispose();
});

test("local demo gateway keeps conversations isolated and supports chief decisions", async () => {
  const gateway = createDemoDmGateway({ delayMs: 0 });
  const browserConversation = "browser-demo";
  await gateway.action("dm.message.send", {
    agentType: "mkt-find-people",
    conversationId: browserConversation,
    from: "user",
    text: "昨天公开找人找得怎么样？"
  });
  await wait(10);

  const browserMessages = (await gateway.action("dm.message.list", { agentType: "mkt-find-people" })).data.messages;
  const searchMessages = (await gateway.action("dm.message.list", { agentType: "mkt-intent-analyst" })).data.messages;
  assert.ok(browserMessages.some(message => message.conversationId === browserConversation));
  assert.ok(searchMessages.length > 0);
  assert.ok(!searchMessages.some(message => message.conversationId === browserConversation));

  const decision = await gateway.action("chief.message.decide", { message: "查看所有 Agent 和任务状态" });
  assert.equal(decision.data.decision.responseMode, "status_card");
  assert.match(decision.data.message, /当前任务总览/);
  gateway.dispose();
});
