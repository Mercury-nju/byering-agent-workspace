import assert from "node:assert/strict";
import test from "node:test";

import {
  DouyinDataMcpError,
  createDouyinDataMcpClient,
  douyinDataMcpConfiguration
} from "../src/salebuddy/bridge/douyin-data-mcp.js";

function fakeFetchFactory() {
  const calls = [];
  let seq = 0;
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), options, body: JSON.parse(options.body) });
    const body = calls.at(-1).body;
    if (body.method === "initialize") {
      return new Response(JSON.stringify({
        jsonrpc: "2.0",
        id: body.id,
        result: { protocolVersion: "2025-06-18", capabilities: {}, serverInfo: { name: "fake" } }
      }), { status: 200, headers: { "content-type": "application/json", "mcp-session-id": "session-test" } });
    }
    if (body.method === "notifications/initialized") return new Response(null, { status: 202 });
    if (body.method === "tools/list") {
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: body.id, result: { tools: [{ name: "douyin_get_video_list" }] } }), { status: 200, headers: { "content-type": "application/json" } });
    }
    const result = body.params.name === "douyin_get_video_list"
      ? { task_id: `task-${++seq}`, result: { items: [{ video_id: "v-1" }] }, status: "SUCCESS" }
      : body.params.name === "douyin_get_task_result"
        ? { task_id: "t-1", result: { items: [] }, status: "SUCCESS" }
        : body.params.name === "douyin_create_collection_task"
          ? { task_id: "created-1", status: "PENDING" }
          : { result: { comments: [{ cid: "c-1", text: "请问多少钱？" }] }, status: "SUCCESS" };
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: body.id, result: { content: [{ type: "text", text: JSON.stringify(result) }] } }), { status: 200, headers: { "content-type": "application/json" } });
  };
  return { calls, fetchImpl };
}

test("MCP client negotiates one session and maps public tools", async () => {
  const fake = fakeFetchFactory();
  const client = createDouyinDataMcpClient({ url: "http://mcp.test/mcp", fetchImpl: fake.fetchImpl });
  assert.equal(client.configured, true);
  const videos = await client.getVideoList({ secId: "sec-1", runId: "run-1" });
  const comments = await client.getComments({ videoIds: ["v-1"] });
  assert.equal(videos.result.items[0].video_id, "v-1");
  assert.equal(comments.result.comments[0].cid, "c-1");
  assert.equal(fake.calls.filter((call) => call.body.method === "initialize").length, 1);
  assert.equal(fake.calls.filter((call) => call.body.method === "notifications/initialized").length, 1);
  const videoCall = fake.calls.find((call) => call.body.method === "tools/call");
  assert.equal(videoCall.options.headers["mcp-session-id"], "session-test");
  assert.equal(videoCall.body.params.arguments.sec_id, "sec-1");
  assert.equal(videoCall.body.params.arguments.run_id, "run-1");
  const taskResult = await client.getTaskResult({ taskId: "t-1", pageSize: 20 });
  assert.equal(taskResult.task_id, "t-1");
  const created = await client.createCollectionTask({ type: "comments", videoIds: ["v-1"], secId: "sec-1", runId: "run-2" });
  assert.equal(created.task_id, "created-1");
  const createCall = fake.calls.find((call) => call.body.params.name === "douyin_create_collection_task");
  assert.deepEqual(createCall.body.params.arguments, { type: "comments", video_ids: ["v-1"], sec_id: "sec-1", run_id: "run-2" });
});

test("MCP client parses SSE responses and exposes task tools", async () => {
  let initialize = true;
  const fetchImpl = async (_url, options) => {
    const body = JSON.parse(options.body);
    if (body.method === "notifications/initialized") return new Response(null, { status: 202 });
    if (initialize) {
      initialize = false;
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: body.id, result: { protocolVersion: "2025-06-18" } }), { status: 200, headers: { "content-type": "application/json", "mcp-session-id": "sse-session" } });
    }
    const payload = { jsonrpc: "2.0", id: body.id, result: { content: [{ type: "text", text: JSON.stringify({ task_id: "t-1", status: "SUCCESS" }) }] } };
    return new Response(`event: message\ndata: ${JSON.stringify(payload)}\n\n`, { status: 200, headers: { "content-type": "text/event-stream" } });
  };
  const client = createDouyinDataMcpClient({ url: "http://mcp.test/mcp", fetchImpl });
  const result = await client.getTaskStatus({ taskId: "t-1" });
  assert.equal(result.task_id, "t-1");
});

test("configuration remains opt-in for service factories", async () => {
  assert.deepEqual(douyinDataMcpConfiguration({}), { url: null, timeoutMs: 120000 });
  const client = createDouyinDataMcpClient({ url: null });
  assert.equal(client.configured, false);
  await assert.rejects(client.getTaskStatus({ taskId: "t-1" }), (error) => error instanceof DouyinDataMcpError && error.code === "DOUYIN_DATA_MCP_NOT_CONFIGURED");
});
