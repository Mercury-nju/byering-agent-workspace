import assert from "node:assert/strict";
import test from "node:test";
import { createControlPlaneHttpServer } from "../backend/http-server.js";

test("prospect-only HTTP fixtures remain usable without acquisition discovery", async (t) => {
  const server = createControlPlaneHttpServer({
    auth: false,
    prospectService: { configured: true, async callback() { return { accepted: true, events: [] }; } },
    clueHunterService: { configured: false },
    taskDispatcher: { configured: true }
  });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  t.after(() => server.close());
  const response = await fetch(`http://127.0.0.1:${server.address().port}/v1/connectors/prospect/events?taskId=t&taskRunId=r&conversationId=c`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ itemList: [] })
  });
  assert.equal(response.status, 200);
});
