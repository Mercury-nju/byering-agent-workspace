import test from "node:test";
import assert from "node:assert/strict";

test("account action coordinator is available", async () => {
  const module = await import("../backend/douyin-account-action-coordinator.js").catch(() => ({}));

  assert.equal(typeof module.createDouyinAccountActionCoordinator, "function");
});

test("outreach jumps ahead of queued inbox replies for the same account", async () => {
  const { createDouyinAccountActionCoordinator } = await import("../backend/douyin-account-action-coordinator.js");
  const coordinator = createDouyinAccountActionCoordinator();
  const order = [];
  let markStarted;
  const started = new Promise((resolve) => { markStarted = resolve; });
  let releaseActive;
  const active = new Promise((resolve) => { releaseActive = resolve; });

  const firstInbox = coordinator.runInbox("account-a", async () => {
    order.push("inbox-active");
    markStarted();
    await active;
  });
  await started;
  const secondInbox = coordinator.runInbox("account-a", async () => { order.push("inbox-queued"); });
  const outreach = coordinator.runOutreach("account-a", async () => { order.push("outreach"); });

  assert.deepEqual(order, ["inbox-active"]);
  releaseActive();
  await Promise.all([firstInbox, secondInbox, outreach]);

  assert.deepEqual(order, ["inbox-active", "outreach", "inbox-queued"]);
});

test("account action coordinator does not block a different account", async () => {
  const { createDouyinAccountActionCoordinator } = await import("../backend/douyin-account-action-coordinator.js");
  const coordinator = createDouyinAccountActionCoordinator();
  let releaseAccountA;
  const accountABlocked = new Promise((resolve) => { releaseAccountA = resolve; });
  let accountBExecuted = false;

  const accountA = coordinator.runOutreach("account-a", () => accountABlocked);
  await coordinator.runInbox("account-b", async () => { accountBExecuted = true; });

  assert.equal(accountBExecuted, true);
  releaseAccountA();
  await accountA;
});

test("coordination key resolves the real Douyin account across Agent sessions", async () => {
  const { douyinAccountCoordinationKey } = await import("../backend/douyin-account-action-coordinator.js");

  assert.equal(
    douyinAccountCoordinationKey({ sec_uid: "MS4w-sender", nickname: "账号 A" }, "logical-agent-account"),
    "douyin:sec:MS4w-sender"
  );
  assert.equal(
    douyinAccountCoordinationKey({ identity: { uniqueId: "shop_a" } }, "logical-agent-account"),
    "douyin:unique:shop_a"
  );
  assert.equal(douyinAccountCoordinationKey(null, "logical-agent-account"), "douyin:fallback:logical-agent-account");
});

test("an outreach task reservation holds inbox replies until the batch finishes", async () => {
  const { createDouyinAccountActionCoordinator } = await import("../backend/douyin-account-action-coordinator.js");
  const coordinator = createDouyinAccountActionCoordinator();
  const order = [];

  coordinator.beginOutreach("account-a", "task-outreach", { ttlMs: 60_000 });
  const inbox = coordinator.runInbox("account-a", async () => { order.push("inbox"); });
  await Promise.resolve();
  assert.deepEqual(order, []);

  await coordinator.runOutreach("account-a", async () => { order.push("outreach"); }, { taskId: "task-outreach" });
  assert.deepEqual(order, ["outreach"]);
  coordinator.endOutreach("task-outreach");
  await inbox;

  assert.deepEqual(order, ["outreach", "inbox"]);
});
