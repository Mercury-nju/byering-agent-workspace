import assert from "node:assert/strict";
import test from "node:test";

import { createControlPlaneHttpServer } from "../backend/http-server.js";

test("control plane exposes the Douyin finder connector and stores its result", async () => {
  const runs = new Map();
  let finished = false;
  let releaseRun;
  const hold = new Promise(resolve => { releaseRun = resolve; });
  const server = createControlPlaneHttpServer({
    auth: false,
    douyinFinderRuns: runs,
    douyinFinderService: {
      configured: true,
      discoveryConfigured: false,
      async run(input) {
        await hold;
        finished = true;
        return { source: "douyin-agent-data", status: "SUCCEEDED", taskId: input.taskId || "finder-test", counts: { input: 1, resolved: 1, matched: 1, failed: 0 }, accounts: [{ score: 88 }] };
      }
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const { port } = server.address();
    const base = `http://127.0.0.1:${port}`;
    const health = await fetch(`${base}/healthz`).then((response) => response.json());
    assert.equal(health.capabilities.douyinFinder, true);
    assert.equal(health.capabilities.douyinFinderAccountDiscovery, false);
    assert.equal(health.capabilities.douyinFinderAccountValidation, true);
    const response = await fetch(`${base}/v1/connectors/douyin-finder/run`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ taskId: "finder-test", goal: "找教育培训账号", inputs: ["https://www.douyin.com/user/example"] })
    });
    assert.equal(response.status, 202);
    const accepted = await response.json();
    assert.equal(accepted.accepted, true);
    assert.equal(accepted.status, "RUNNING");
    assert.equal(finished, false);
    const running = await fetch(`${base}/v1/connectors/douyin-finder/runs/finder-test`).then((value) => value.json());
    assert.equal(running.status, "RUNNING");
    releaseRun();
    let stored = running;
    for (let attempt = 0; attempt < 20 && stored.status === "RUNNING"; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
      stored = await fetch(`${base}/v1/connectors/douyin-finder/runs/finder-test`).then((value) => value.json());
    }
    assert.equal(stored.status, "SUCCEEDED");
    assert.equal(stored.counts.matched, 1);
  } finally {
    releaseRun();
    await new Promise((resolve) => server.close(resolve));
  }
});

test("control plane stores finder progress before the final result", async () => {
  const runs = new Map();
  let releaseRun;
  const hold = new Promise((resolve) => { releaseRun = resolve; });
  const server = createControlPlaneHttpServer({
    auth: false,
    douyinFinderRuns: runs,
    douyinFinderService: {
      configured: true,
      discoveryConfigured: true,
      async run(input) {
        input.onProgress({
          stage: "searching",
          message: "正在搜索第 1 页",
          counts: { discovered: 12, screened: 4, searchPages: 1 }
        });
        await hold;
        return { status: "SUCCEEDED", counts: { delivered: 4 }, accounts: [] };
      }
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    await fetch(`${base}/v1/connectors/douyin-finder/run`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ taskId: "finder-progress", goal: "找教育培训账号" })
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const progress = await fetch(`${base}/v1/connectors/douyin-finder/runs/finder-progress`).then((response) => response.json());
    assert.equal(progress.status, "RUNNING");
    assert.equal(progress.stage, "searching");
    assert.equal(progress.counts.discovered, 12);
    assert.equal(progress.counts.screened, 4);
    releaseRun();
  } finally {
    releaseRun();
    await new Promise((resolve) => server.close(resolve));
  }
});

test("control plane rejects competitor discovery before creating an async run without a business account", async () => {
  const runs = new Map();
  let serviceCalled = false;
  const server = createControlPlaneHttpServer({
    auth: false,
    douyinFinderRuns: runs,
    douyinFinderService: {
      configured: true,
      async run() {
        serviceCalled = true;
        return { status: "SUCCEEDED", accounts: [] };
      }
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const response = await fetch(`${base}/v1/connectors/douyin-finder/run`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        taskId: "finder-competitor-preflight",
        goal: "公域找人\n同行、品牌或商家"
      })
    });
    assert.equal(response.status, 400);
    const payload = await response.json();
    assert.equal(payload.error.code, "DOUYIN_FINDER_BUSINESS_ACCOUNT_REQUIRED");
    assert.match(payload.error.message, /账号主页链接/);
    assert.equal(serviceCalled, false);
    assert.equal(runs.has("finder-competitor-preflight"), false);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
