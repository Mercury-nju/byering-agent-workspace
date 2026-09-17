import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createControlPlaneHttpServer } from "../backend/http-server.js";
import { createAccountReceptionStore } from "../backend/account-reception-store.js";

test("account memory accepts the logical account id exposed by the account directory", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "account-memory-http-"));
  const store = createAccountReceptionStore({ stateFile: join(dir, "settings.json") });
  const accountId = "douyin-agent:mkt-comment-acquisition";
  const conversationId = `account-memory:mkt-gold-customer-service:${accountId}`;
  const registry = {
    list: () => [{
      agentId: "mkt-douyin-account-runtime",
      accountId,
      sessionId: "session-1",
      status: "online",
      accountIdentity: { uid: "123", secUid: "sec-123", nickname: "测试账号" }
    }],
    getService: () => ({ configured: true })
  };
  const server = createControlPlaneHttpServer({
    auth: false,
    allowLegacyProductExecution: true,
    agentStoreRoot: join(dir, "agent-store"),
    accountReceptionStore: store,
    douyinAgentCloudRegistry: registry
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    rmSync(dir, { recursive: true, force: true });
  });

  const base = `http://127.0.0.1:${server.address().port}`;
  const read = await fetch(`${base}/v1/accounts/reception?accountId=${encodeURIComponent(accountId)}`);
  const readBody = await read.json();
  assert.equal(read.status, 200, JSON.stringify(readBody));
  assert.equal(readBody.revision, 0);

  const context = {
    agentType: "mkt-gold-customer-service",
    accountId,
    conversationId,
    from: "user",
    fromName: "我"
  };
  const proposal = await fetch(`${base}/v1/direct-messages`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...context, text: "私信回复简短一点，以留下联系方式为目标" })
  });
  assert.equal(proposal.status, 201, await proposal.text());
  assert.equal(store.get({ account: { uid: "123" } }).revision, 0);

  const confirmation = await fetch(`${base}/v1/direct-messages`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...context, text: "确认" })
  });
  assert.equal(confirmation.status, 201, await confirmation.text());
  assert.equal(store.get({ account: { secUid: "sec-123" } }).revision, 1);
  assert.equal(store.get({ account: { secUid: "sec-123" } }).settings.goal, "contact");
  assert.equal(store.get({ account: { secUid: "sec-123" } }).settings.length, "short");

  const messages = await fetch(`${base}/v1/direct-messages?${new URLSearchParams({
    agentType: context.agentType,
    accountId,
    conversationId
  })}`).then(result => result.json());
  assert.match(messages.data.messages.at(-1).text, /已按你的确认保存/);
});
