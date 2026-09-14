import assert from "node:assert/strict";
import test from "node:test";

import { AUTH_ROUTES, isAuthScreen } from "../src/salebuddy/auth/config.js";
import { parseAuthRoute } from "../src/salebuddy/auth/router.js";
import { createAuthStore } from "../src/salebuddy/auth/state.js";
import { CAPABILITY_SLIDES } from "../src/salebuddy/auth/slides.js";

test("auth route parser accepts supported hash routes", () => {
  assert.deepEqual(parseAuthRoute("#/auth/login"), { prefix: "auth", screen: "login" });
  assert.deepEqual(parseAuthRoute("#/auth/verify"), { prefix: "auth", screen: "verify" });
  assert.deepEqual(parseAuthRoute("#auth/consent"), { prefix: "auth", screen: "consent" });
  assert.equal(parseAuthRoute("#/auth/unknown"), null);
  assert.equal(parseAuthRoute("#/home"), null);
});

test("auth store updates through snapshots without persisting secrets", () => {
  const store = createAuthStore();
  const snapshots = [];
  const stop = store.subscribe((snapshot) => snapshots.push(snapshot));
  store.setState({ screen: AUTH_ROUTES.verify, identifier: "user@example.com" });
  const snapshot = store.getState();

  assert.equal(snapshot.screen, "verify");
  assert.equal(snapshot.identifier, "user@example.com");
  assert.equal(Object.hasOwn(snapshot, "password"), false);
  assert.equal(snapshots.length, 1);
  stop();
});

test("auth screen ids remain explicit and finite", () => {
  assert.equal(isAuthScreen("login"), true);
  assert.equal(isAuthScreen("recovery"), true);
  assert.equal(isAuthScreen("dashboard"), false);
});

test("auth router can start and stop browser history listeners", () => {
  const listeners = new Map();
  const eventTarget = {
    addEventListener(type, listener) { listeners.set(type, listener); },
    removeEventListener(type) { listeners.delete(type); }
  };
  const location = { hash: "#/auth/login" };
  const routerModule = import("../src/salebuddy/auth/router.js");
  return routerModule.then(({ createAuthRouter }) => {
    const router = createAuthRouter({ location, eventTarget });
    router.start();
    assert.equal(listeners.size, 2);
    router.stop();
    assert.equal(listeners.size, 0);
  });
});

test("capability slides preserve the product order", () => {
  assert.equal(CAPABILITY_SLIDES.length, 5);
  assert.deepEqual(CAPABILITY_SLIDES.map((slide) => slide.id), [1, 2, 3, 4, 5]);
  assert.deepEqual(CAPABILITY_SLIDES.map((slide) => slide.alt), [
    "找到更值得联系的人",
    "你的数字员工，开始工作",
    "更懂每一个潜在客户",
    "找到之后，继续完成触达",
    "把每一次经营沉淀下来"
  ]);
});
