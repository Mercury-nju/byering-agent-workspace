import test from "node:test";
import assert from "node:assert/strict";
import { beginWork, endAllWork, finishWork, getWork, listWorks, pushActivity, reportWorkError, updateWork } from "../src/salebuddy/agents/work-live.js";

test("work errors are visible in the live activity stream", () => {
  endAllWork();
  beginWork("mkt-cold-writer", { task: "给指定抖音用户发送一条私信", phase: "准备发送私信", progress: 58 });
  reportWorkError("mkt-cold-writer", "私信触达未完成：目标用户暂不支持私信");
  const work = getWork("mkt-cold-writer");
  assert.equal(work.lastError, "私信触达未完成：目标用户暂不支持私信");
  assert.deepEqual(work.activities, ["私信触达未完成：目标用户暂不支持私信"]);
  endAllWork();
});

test("acquisition task status is normalized at the live-work boundary", () => {
  endAllWork();
  beginWork("mkt-comment-acquisition", { metadata: { acquisitionTaskState: "degraded" } });
  assert.equal(getWork("mkt-comment-acquisition").runtimeState, "RUNNING");
  assert.equal(getWork("mkt-comment-acquisition").health, "DEGRADED");
  updateWork("mkt-comment-acquisition", { metadata: { acquisitionTaskState: "running" } });
  assert.equal(listWorks()[0].runtimeState, "RUNNING");
  assert.equal(listWorks()[0].health, "OK");
  endAllWork();
});

test("acquisition live metadata preserves identity, cloud state, retries, and indeterminate progress", () => {
  endAllWork();
  beginWork("mkt-live-lead-miner", {
    task: "监听真实直播互动",
    phase: "连接直播间",
    progress: 73,
    metadata: {
      taskId: "task-live-1",
      taskRunId: "run-live-1",
      accountId: "account-live-1",
      cloudState: "connecting",
      taskState: "running",
      retryCount: 2
    }
  });
  const work = getWork("mkt-live-lead-miner");
  assert.deepEqual(
    Object.fromEntries(["taskId", "taskRunId", "accountId", "cloudState", "taskState", "retryCount", "progressMode"].map((key) => [key, work.metadata[key]])),
    {
      taskId: "task-live-1",
      taskRunId: "run-live-1",
      accountId: "account-live-1",
      cloudState: "connecting",
      taskState: "running",
      retryCount: 2,
      progressMode: "indeterminate"
    }
  );
  assert.equal(work.progress, 73, "raw progress may be retained but must not be rendered without provider mode");
  endAllWork();
});

test("acquisition live metadata accepts provider progress only when explicitly sourced", () => {
  endAllWork();
  beginWork("mkt-comment-acquisition", {
    progress: 41,
    metadata: { taskId: "task-comment-1", progressSource: "provider", progressMode: "provider" }
  });
  assert.equal(getWork("mkt-comment-acquisition").metadata.progressMode, "provider");
  endAllWork();
});

test("waiting receipt metadata remains a live non-error state", () => {
  endAllWork();
  beginWork("mkt-dm-inbox", { task: "发送一条私信", phase: "等待平台回执", metadata: { cloudWatch: "waiting_receipt", receiptPending: true } });
  const work = getWork("mkt-dm-inbox");
  assert.equal(work.lastError, undefined);
  assert.equal(work.metadata.cloudWatch, "waiting_receipt");
  assert.equal(work.metadata.receiptPending, true);
  endAllWork();
});

test("different Agents keep independent live work records", () => {
  endAllWork();
  beginWork("mkt-dm-inbox", { task: "持续承接私信", metadata: { accountKey: "douyin:sec-user-1" } });
  beginWork("mkt-cold-writer", { task: "执行单独触达", metadata: { accountKey: "douyin:sec-user-1" } });

  assert.deepEqual(
    listWorks().map((work) => work.agentType),
    ["mkt-dm-inbox", "mkt-cold-writer"]
  );
  assert.equal(getWork("mkt-dm-inbox").task, "持续承接私信");
  assert.equal(getWork("mkt-cold-writer").task, "执行单独触达");
  endAllWork();
});

test("the same Agent keeps independent task state for two Douyin accounts", () => {
  endAllWork();
  const first = { taskId: "finder-task-a", taskRunId: "finder-run-a", accountId: "douyin-a" };
  const second = { taskId: "finder-task-b", taskRunId: "finder-run-b", accountId: "douyin-b" };
  beginWork("mkt-find-people", { task: "从账号 A 找人", phase: "读取直播间", metadata: first });
  beginWork("mkt-find-people", { task: "从账号 B 找人", phase: "读取评论", metadata: second });

  updateWork("mkt-find-people", { phase: "分析账号 A", metadata: first });
  pushActivity("mkt-find-people", "账号 A 发现 1 位候选人", first);
  reportWorkError("mkt-find-people", "账号 B 的直播间暂未开播", second);
  finishWork("mkt-find-people", { id: "result-a" }, first);

  const workA = getWork("mkt-find-people", first);
  const workB = getWork("mkt-find-people", second);
  assert.equal(listWorks().filter((work) => work.agentType === "mkt-find-people").length, 2);
  assert.equal(workA.state, "done");
  assert.equal(workA.phase, "分析账号 A");
  assert.equal(workA.artifact.id, "result-a");
  assert.equal(workA.lastError, undefined);
  assert.equal(workB.state, "working");
  assert.equal(workB.phase, "读取评论");
  assert.equal(workB.lastError, "账号 B 的直播间暂未开播");
  endAllWork();
});
