import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  ACCOUNT_SETUP_STEPS,
  accountAvatarFallbackLabel,
  accountAvatarSource,
  applyAuthoritativeManagedAccountDirectory,
  createManagedAccount,
  douyinAccountWorkKey,
  getAuthorizedManagedAccounts,
  normalizeNewAccountInput,
  visibleRealtimeWorks
} from "../src/salebuddy/ui/realtime-work.js";
import { DOUYIN_ACQUISITION_ACTIVE_AGENT_IDS, DOUYIN_ACCOUNT_CLOUD_RUNTIME_ID } from "../src/salebuddy/agents/marketplace.js";

const realtimeWorkSource = fs.readFileSync(new URL("../src/salebuddy/ui/realtime-work.js", import.meta.url), "utf8");

test("realtime account matrix does not expose account creation", () => {
  const matrixStart = realtimeWorkSource.indexOf("const managedCount = state.accounts.length;");
  const matrixEnd = realtimeWorkSource.indexOf("if (!state.liveWorks.length)", matrixStart);
  assert.ok(matrixStart >= 0 && matrixEnd > matrixStart);
  const accountMatrix = realtimeWorkSource.slice(matrixStart, matrixEnd);
  assert.doesNotMatch(accountMatrix, /const addAccount =/);
  assert.doesNotMatch(accountMatrix, /添加新账号/);
  const summaryStart = accountMatrix.indexOf("const accountSummary =");
  const summaryEnd = accountMatrix.indexOf("accountTopline.append", summaryStart);
  assert.ok(summaryStart >= 0 && summaryEnd > summaryStart);
  assert.doesNotMatch(accountMatrix.slice(summaryStart, summaryEnd), /独立云电脑/);
});

test("new account flow accepts direct authorization without asking for shop fields", () => {
  assert.deepEqual(normalizeNewAccountInput({}), {
    name: "待识别抖音店铺",
    handle: "待识别账号"
  });
  assert.deepEqual(normalizeNewAccountInput({ name: "  小满的通勤装备 ", handle: "xiaoman_commute" }), {
    name: "小满的通勤装备",
    handle: "@xiaoman_commute"
  });
});

test("new account setup has explicit verification, cloud computer, and agent steps", () => {
  assert.deepEqual(ACCOUNT_SETUP_STEPS.map((step) => step.id), ["verify", "cloud", "agents"]);
  const account = createManagedAccount({}, 4);
  assert.equal(account.id, "managed-05");
  assert.equal(account.status, "待授权");
  assert.equal(account.computer, "创建中");
  assert.equal(account.agents, 0);
  assert.equal(account.setupStep, "verify");
});

test("authorized account directory exposes identity without manual input", () => {
  const accounts = getAuthorizedManagedAccounts([
    { id: "ready", name: "已授权店铺", handle: "@ready_shop", status: "运行中", computer: "在线", authenticationVerified: true, identity: { uniqueId: "ready_shop" } },
    { id: "login", name: "待登录店铺", handle: "@login_shop", status: "需重新登录", computer: "待授权" },
    { id: "pending", name: "创建中店铺", handle: "@pending_shop", status: "待授权", computer: "创建中" }
  ]);
  assert.equal(accounts.length, 1);
  assert.equal(accounts[0].identity.uniqueId, "ready_shop");
  assert.equal(accounts[0].identity.accountName, "已授权店铺");
});

test("an empty authoritative account directory clears stale browser account state", () => {
  const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const originalSaleBuddy = Object.getOwnPropertyDescriptor(globalThis, "__SALEBUDDY__");
  const storage = new Map();
  const staleAccount = {
    id: "douyin-agent:mkt-douyin-account-runtime",
    name: "旧账号",
    handle: "@stale_account",
    status: "运行中",
    computer: "在线",
    authenticationVerified: true,
    identity: { uniqueId: "stale_account", uid: "stale-uid" }
  };

  try {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: (key) => storage.get(key) || null,
        setItem: (key, value) => storage.set(key, String(value))
      }
    });
    storage.set("byering-managed-douyin-accounts", JSON.stringify([staleAccount]));
    globalThis.__SALEBUDDY__ = { douyinAccounts: [staleAccount] };

    const state = {
      accounts: [staleAccount],
      customAccounts: [staleAccount],
      accountId: staleAccount.id,
      accountKey: "douyin:stale-uid"
    };
    const accounts = applyAuthoritativeManagedAccountDirectory(state, []);

    assert.deepEqual(accounts, []);
    assert.deepEqual(state.accounts, []);
    assert.deepEqual(state.customAccounts, []);
    assert.equal(state.accountId, "");
    assert.equal(state.accountKey, "");
    assert.deepEqual(JSON.parse(storage.get("byering-managed-douyin-accounts")), []);
    assert.deepEqual(globalThis.__SALEBUDDY__.douyinAccounts, []);
  } finally {
    if (originalStorage) Object.defineProperty(globalThis, "localStorage", originalStorage);
    else delete globalThis.localStorage;
    if (originalSaleBuddy) Object.defineProperty(globalThis, "__SALEBUDDY__", originalSaleBuddy);
    else delete globalThis.__SALEBUDDY__;
  }
});

test("authorized account directory prefers the provider nickname over a stale placeholder", () => {
  const accounts = getAuthorizedManagedAccounts([
    {
      id: "douyin-agent:mkt-dm-inbox",
      name: "已授权抖音账号",
      handle: "@43592743387647",
      status: "运行中",
      computer: "在线",
      authenticationVerified: true,
      identity: {
        nickname: "国王",
        account: "guowang73732",
        uid: "43592743387647",
        secId: "MS4wLjABAAAAFJ-dVOYinDBuHRBHdIhNGKkKTB_lulXfCp1qwJjG5jE"
      }
    }
  ]);

  assert.equal(accounts[0].name, "国王");
  assert.equal(accounts[0].handle, "@guowang73732");
});

test("authorized account directory merges Agent cloud records for the same Douyin identity", () => {
  const identity = {
    account: "16764616",
    nickname: "一以万真",
    uid: "58262205543",
    sec_uid: "sec-yiyi-wanzhen"
  };
  const accounts = getAuthorizedManagedAccounts([
    { id: "douyin-agent:mkt-dm-inbox", agentId: "mkt-dm-inbox", sessionId: "session-inbox", name: "一以万真", status: "运行中", computer: "在线", authenticationVerified: true, identity },
    { id: "douyin-agent:mkt-cold-writer", agentId: "mkt-cold-writer", sessionId: "session-outreach", name: "一以万真", status: "运行中", computer: "在线", authenticationVerified: true, identity },
    { id: "douyin-agent:mkt-comment-acquisition", agentId: "mkt-comment-acquisition", sessionId: "session-comments", name: "一以万真", status: "运行中", computer: "在线", authenticationVerified: true, identity }
  ]);

  assert.equal(accounts.length, 1);
  assert.equal(accounts[0].name, "一以万真");
  assert.equal(accounts[0].handle, "@16764616");
  assert.equal(accounts[0].cloudCount, 3);
  assert.deepEqual(accounts[0].agentIds, ["mkt-dm-inbox", "mkt-cold-writer", "mkt-comment-acquisition"]);
  assert.deepEqual(accounts[0].sessionIds, ["session-inbox", "session-outreach", "session-comments"]);
});

test("authorized account directory exposes all five core capabilities for one account cloud", () => {
  const identity = { account: "shared_owner", uid: "58262205543", sec_uid: "sec-shared-owner" };
  const accounts = getAuthorizedManagedAccounts([
    { id: `douyin-agent:${DOUYIN_ACCOUNT_CLOUD_RUNTIME_ID}`, agentId: DOUYIN_ACCOUNT_CLOUD_RUNTIME_ID, sessionId: "session-account", name: "共享账号", status: "运行中", computer: "在线", authenticationVerified: true, identity }
  ]);

  assert.equal(accounts.length, 1);
  assert.deepEqual(accounts[0].capabilityMatrix.map(({ agentId }) => agentId), DOUYIN_ACQUISITION_ACTIVE_AGENT_IDS);
  assert.deepEqual(
    accounts[0].capabilityMatrix.map(({ agentId, binding, ready }) => [agentId, binding, ready]),
    [
      ["mkt-comment-acquisition", "account_cloud", true],
      ["mkt-find-people", "account_cloud", true],
      ["mkt-intent-analyst", "account_cloud", true],
      ["mkt-cold-writer", "account_cloud", true],
      ["mkt-dm-inbox", "account_cloud", true]
    ]
  );
  assert.equal(accounts[0].agents, 5);
});

test("account avatar uses provider identity when available", () => {
  const source = accountAvatarSource({
    name: "已授权抖音账号",
    identity: { avatar: { url_list: ["https://cdn.example.com/avatar.jpg"] } }
  });
  assert.equal(source, "https://cdn.example.com/avatar.jpg");
});

test("account avatar prefers the backend proxy over the expiring provider URL", () => {
  const source = accountAvatarSource({
    avatar: "http://127.0.0.1:6681/v1/connectors/douyin/accounts/mkt-dm-inbox/avatar",
    identity: { avatar: "https://p3-pc-sign.douyinpic.com/expiring.jpg" }
  });
  assert.equal(source, "http://127.0.0.1:6681/v1/connectors/douyin/accounts/mkt-dm-inbox/avatar");
});

test("account avatar falls back to a label when the provider does not return an image", () => {
  assert.equal(accountAvatarSource({ name: "已授权抖音账号" }), "");
  assert.equal(accountAvatarFallbackLabel({ name: "小满的好物小铺" }), "小");
});

test("authorized account normalization does not persist a product placeholder as avatar", () => {
  const placeholder = createManagedAccount({}, 0).avatar;
  const accounts = getAuthorizedManagedAccounts([
    {
      id: "ready",
      name: "已授权抖音账号",
      handle: "@ready_shop",
      status: "运行中",
      computer: "在线",
      authenticationVerified: true,
      avatar: placeholder,
      identity: { uniqueId: "ready_shop" }
    }
  ]);
  assert.equal(accounts[0].avatar, undefined);
});

test("demo account handles never become authorized identities", () => {
  const accounts = getAuthorizedManagedAccounts([
    { id: "demo", name: "演示店铺", handle: "@demo_shop", status: "运行中", computer: "在线" }
  ]);
  assert.deepEqual(accounts, []);
});

test("a ready browser workspace without a real profile identity is not an authorized account", () => {
  const accounts = getAuthorizedManagedAccounts([
    { id: "managed-1", name: "小满的好物小铺", status: "运行中", computer: "在线", authenticationVerified: true, source: "browser-workspace", identity: { accountName: "小满的好物小铺", managedAccountKey: "managed-1" } }
  ]);
  assert.equal(accounts.length, 0);
});

test("a task deep link keeps sibling agents on the same account visible", () => {
  const works = [
    { agentType: "mkt-cold-writer", metadata: { taskId: "task-outreach", accountId: "account-a" } },
    { agentType: "mkt-dm-inbox", metadata: { taskId: "task-inbox", accountKey: "account-a" } },
    { agentType: "mkt-comment-acquisition", metadata: { taskId: "task-comments", accountId: "account-b" } },
    { agentType: "douyin-finder", metadata: { taskId: "task-public" } }
  ];

  assert.deepEqual(
    visibleRealtimeWorks(works, { selectedAgentId: "mkt-cold-writer", taskId: "task-outreach", accountId: "account-a" }).map((work) => work.agentType),
    ["mkt-cold-writer", "mkt-dm-inbox"]
  );
});

test("parallel Agent works share a realtime lane when they use the same Douyin identity", () => {
  const identity = { secUid: "sec-user-1", uniqueId: "shop_owner" };
  const accountWorkKey = douyinAccountWorkKey(identity, "douyin-agent:mkt-cold-writer");
  assert.equal(accountWorkKey, "douyin:sec-user-1");

  const works = [
    { agentType: "mkt-dm-inbox", metadata: { taskId: "task-inbox", accountId: "douyin-agent:mkt-dm-inbox", accountKey: accountWorkKey } },
    { agentType: "mkt-cold-writer", metadata: { taskId: "task-outreach", accountId: "douyin-agent:mkt-cold-writer", accountKey: accountWorkKey } }
  ];

  assert.deepEqual(
    visibleRealtimeWorks(works, {
      selectedAgentId: "mkt-cold-writer",
      taskId: "task-outreach",
      accountId: "douyin-agent:mkt-cold-writer",
      accountKey: accountWorkKey
    }).map((work) => work.agentType),
    ["mkt-dm-inbox", "mkt-cold-writer"]
  );
});

test("a realtime page opened before authorization follows the requested work identity once it resolves", () => {
  const accountWorkKey = "douyin:sec-user-1";
  const works = [
    { agentType: "mkt-dm-inbox", metadata: { taskId: "task-inbox", accountId: "douyin-agent:mkt-dm-inbox", accountKey: accountWorkKey } },
    { agentType: "mkt-cold-writer", metadata: { taskId: "task-outreach", accountId: "douyin-agent:mkt-cold-writer", accountKey: accountWorkKey } }
  ];

  assert.deepEqual(
    visibleRealtimeWorks(works, {
      selectedAgentId: "mkt-cold-writer",
      taskId: "task-outreach",
      accountId: "douyin-agent:mkt-cold-writer"
    }).map((work) => work.agentType),
    ["mkt-dm-inbox", "mkt-cold-writer"]
  );
});

test("legacy Agent work stays available in results but is excluded from the realtime workspace", () => {
  const works = [
    { agentType: "douyin-finder", metadata: { taskId: "task-finder" } },
    { agentType: "mkt-comment-filter", metadata: { taskId: "task-filter" } },
    { agentType: "mkt-cold-writer", metadata: { taskId: "task-outreach", accountId: "account-a" } }
  ];

  assert.deepEqual(
    visibleRealtimeWorks(works, { selectedAgentId: "douyin-finder", taskId: "task-finder" }).map((work) => work.agentType),
    []
  );
});
