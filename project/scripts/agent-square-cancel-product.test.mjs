import assert from "node:assert/strict";
import test from "node:test";
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

import { createControlPlaneHttpServer } from "../backend/http-server.js";
import { createControlPlane } from "../backend/control-plane.js";
import { createStaticServer } from "./static-server.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const playwrightPath = join(root, "components/MarvisAgent/skills/agent-browser/scripts/node_modules/playwright-core/index.mjs");
const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const canRunBrowserProductTest = existsSync(playwrightPath) && existsSync(chromePath);

async function listen(server) {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${server.address().port}`;
}

async function close(server) {
  server.closeAllConnections?.();
  await new Promise((resolve) => server.close(resolve));
}

test("Agent Square keeps reuse available and realtime work owns task cancellation", { skip: !canRunBrowserProductTest }, async (t) => {
  const task = {
    key: "browser-product-cancel-key",
    context: {
      agentId: "mkt-comment-acquisition",
      taskId: "browser-product-cancel-task",
      taskRunId: "browser-product-cancel-run",
      accountId: "browser-product-account"
    },
    state: "running",
    runtimeAlive: true,
    listening: false,
    lastError: null,
    resumeBlocked: null
  };
  let stopCalls = 0;
  const acquisitionService = {
    listTasks: () => [task],
    listRuntimeTasks: () => [task],
    status: (key) => {
      assert.equal(key, task.key);
      return task;
    },
    async stop(key, reason) {
      assert.equal(key, task.key);
      assert.equal(reason, "user_cancelled");
      stopCalls += 1;
      task.state = "stopped";
      task.runtimeAlive = false;
      task.lastError = null;
      task.resumeBlocked = null;
      return task;
    }
  };
  const controlPlane = createControlPlane();
  controlPlane.dispatch({
    type: "task.create",
    taskId: task.context.taskId,
    taskRunId: task.context.taskRunId,
    agentId: task.context.agentId,
    payload: { goal: "持续获取潜在客户" }
  });

  const staticServer = createStaticServer({ port: 0 });
  const rendererBaseUrl = await listen(staticServer);
  const apiServer = createControlPlaneHttpServer({
    auth: false,
    controlPlane,
    douyinAcquisitionService: acquisitionService,
    allowedOrigins: [rendererBaseUrl]
  });
  const apiBaseUrl = await listen(apiServer);
  t.after(async () => {
    await close(apiServer);
    await close(staticServer);
  });

  const { chromium } = await import(pathToFileURL(playwrightPath).href);
  const browser = await chromium.launch({ headless: true, executablePath: chromePath });
  const context = await browser.newContext();
  await context.addInitScript((controlPlaneUrl) => {
    globalThis.__SALEBUDDY_CONFIG__ = { controlPlaneUrl, agentGatewayUrl: null };
  }, apiBaseUrl);
  const page = await context.newPage();
  t.after(async () => {
    await context.close();
    await browser.close();
  });

  const cardSelector = '[data-sb-agent-id="mkt-comment-acquisition"]';
  await page.goto(`${rendererBaseUrl}/?page=agent-square`, { waitUntil: "domcontentloaded" });
  const card = page.locator(cardSelector).first();
  await card.waitFor({ state: "visible" });
  await card.getByRole("button", { name: "立即使用" }).waitFor({ state: "visible" });
  assert.equal(await card.getByRole("button", { name: "取消任务" }).count(), 0);

  await page.goto(`${rendererBaseUrl}/?page=realtime-work`, { waitUntil: "domcontentloaded" });
  const manageButton = page.getByRole("button", { name: "运行更多 Agent" });
  await manageButton.waitFor({ state: "visible" });
  await manageButton.click();
  const manager = page.getByRole("dialog", { name: "管理运行中的 Agent" });
  await manager.waitFor({ state: "visible" });
  await manager.getByRole("button", { name: "取消任务" }).click();
  await manager.waitFor({ state: "hidden" });

  assert.equal(stopCalls, 1);
  const status = await fetch(`${apiBaseUrl}/v1/office/status`).then((response) => response.json());
  const cancelledWork = status.works.find((work) => work.agentType === task.context.agentId);
  assert.equal(cancelledWork.state, "idle");
  assert.equal(cancelledWork.metadata.activeTaskCount, 0);
  assert.equal(cancelledWork.metadata.resumeBlocked, null);
  assert.equal(cancelledWork.metadata.error, null);

  const activeAgentCards = page.locator(".sb-rw-team:not(.sb-rw-completed-team) .sb-rw-agent-name");
  assert.equal(await activeAgentCards.filter({ hasText: "获客专家" }).count(), 0);
});
