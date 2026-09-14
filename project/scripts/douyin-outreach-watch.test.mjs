import assert from "node:assert/strict";
import test from "node:test";

import {
  createDouyinCloudWatch,
  isDouyinCloudOnline,
  isDouyinCloudProvisioning
} from "../src/salebuddy/agents/douyin-outreach-watch.js";

test("cloud watch treats a logged-in ready worker as online", () => {
  assert.equal(isDouyinCloudOnline({
    login_state: "logged_in",
    display_state: "ready",
    worker: { online: true },
    account: { nickname: "店主账号" }
  }), true);
});

test("cloud watch does not treat a connecting desktop as online", () => {
  assert.equal(isDouyinCloudOnline({
    login_state: "logged_in",
    display_state: "connecting",
    worker: { online: true },
    account: { nickname: "店主账号" }
  }), false);
});

test("cloud watch keeps waiting through transient status read timeouts", async () => {
  const timers = [];
  const timerApi = {
    setTimeout(fn) { timers.push(fn); return timers.length; },
    clearTimeout() {}
  };
  let reads = 0;
  let offline = 0;
  const stop = createDouyinCloudWatch({
    readStatus: async () => {
      reads += 1;
      if (reads === 1) return { login_state: "logged_in", display_state: "ready", worker: { online: true }, account: { nickname: "店主账号" } };
      throw Object.assign(new Error("status read timed out"), { code: "CONTROL_PLANE_TIMEOUT" });
    },
    onOffline: () => { offline += 1; },
    intervalMs: 1000,
    offlineThreshold: 1,
    timerApi
  });
  await Promise.resolve();
  await timers.shift()();
  await timers.shift()();
  assert.equal(reads, 3);
  assert.equal(offline, 0);
  stop();
});

test("cloud watch reports offline only after repeated definitive remote failures", async () => {
  const timers = [];
  const timerApi = {
    setTimeout(fn) { timers.push(fn); return timers.length; },
    clearTimeout() {}
  };
  let reads = 0;
  let offline = 0;
  const stop = createDouyinCloudWatch({
    readStatus: async () => {
      reads += 1;
      if (reads === 1) return { login_state: "logged_in", display_state: "ready", worker: { online: true }, account: { nickname: "店主账号" } };
      return { state: "ACTIVE", worker: { online: false }, account: null };
    },
    onOffline: () => { offline += 1; },
    intervalMs: 1000,
    offlineThreshold: 2,
    timerApi
  });
  await Promise.resolve();
  assert.equal(reads, 1);
  assert.equal(offline, 0);
  await timers.shift()();
  assert.equal(reads, 2);
  assert.equal(offline, 0);
  await timers.shift()();
  assert.equal(reads, 3);
  assert.equal(offline, 1);
  stop();
});

test("cloud watch keeps waiting while the remote desktop is provisioning", async () => {
  assert.equal(isDouyinCloudProvisioning({
    state: "STARTING",
    session_state: "starting",
    provisioning: true,
    worker: { online: false },
    account: null
  }), true);

  const timers = [];
  const timerApi = {
    setTimeout(fn) { timers.push(fn); return timers.length; },
    clearTimeout() {}
  };
  let offline = 0;
  const stop = createDouyinCloudWatch({
    readStatus: async () => ({ state: "STARTING", session_state: "starting", provisioning: true, worker: { online: false }, account: null }),
    onOffline: () => { offline += 1; },
    intervalMs: 1000,
    offlineThreshold: 1,
    timerApi
  });
  await Promise.resolve();
  await timers.shift()();
  assert.equal(offline, 0);
  stop();
});

test("cloud watch can detect a drop after the desktop was online", async () => {
  const timers = [];
  const timerApi = {
    setTimeout(fn) { timers.push(fn); return timers.length; },
    clearTimeout() {}
  };
  let reads = 0;
  let offline = 0;
  const stop = createDouyinCloudWatch({
    readStatus: async () => {
      reads += 1;
      return reads === 1
        ? { login_state: "logged_in", display_state: "ready", worker: { online: true }, account: { nickname: "店主账号" } }
        : { state: "ACTIVE", worker: { online: false }, account: null };
    },
    onOffline: () => { offline += 1; },
    intervalMs: 1000,
    offlineThreshold: 1,
    timerApi
  });
  await Promise.resolve();
  await timers.shift()();
  assert.equal(offline, 1);
  stop();
});
