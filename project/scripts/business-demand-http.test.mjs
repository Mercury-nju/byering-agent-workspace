import assert from "node:assert/strict";
import test from "node:test";

import { createControlPlaneHttpServer } from "../backend/http-server.js";

test("business demand endpoint receives live outreach capacity requests", async (t) => {
  const received = [];
  const server = createControlPlaneHttpServer({
    auth: false,
    businessDemandStore: {
      create(tenantId, payload) {
        const demand = { id: "demand-1", tenantId, ...payload };
        received.push(demand);
        return demand;
      },
      list() { return received; }
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const response = await fetch(`http://127.0.0.1:${server.address().port}/v1/business-demands`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      kind: "live_outreach_capacity",
      agentId: "mkt-live-danmaku-outreach",
      agentName: "直播追单助理",
      accountId: "account-1",
      accountName: "品牌直播间",
      sentCount: 37,
      quotaCode: "DOUYIN_DM_DAILY_LIMIT",
      clientRequestId: "quota-demand-1"
    })
  });

  assert.equal(response.status, 201);
  assert.equal((await response.json()).data.demand.id, "demand-1");
  assert.deepEqual(received[0], {
    id: "demand-1",
    tenantId: null,
    kind: "live_outreach_capacity",
    agentId: "mkt-live-danmaku-outreach",
    agentName: "直播追单助理",
    accountId: "account-1",
    accountName: "品牌直播间",
    sentCount: 37,
    quotaCode: "DOUYIN_DM_DAILY_LIMIT",
    clientRequestId: "quota-demand-1"
  });
});
