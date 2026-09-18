import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  BUSINESS_MATERIAL_ACCEPT,
  authoritativeConversationStrategyAccountProfiles,
  conversationStrategyAccountId,
  createConversationStrategyMockAccounts,
  mergeConversationStrategyProfiles,
  parseDelimitedRows,
  readBusinessMaterialFile,
  selectConversationStrategyAccounts
} from "../src/salebuddy/ui/conversation-strategy.js";

const source = await readFile(new URL("../src/salebuddy/ui/conversation-strategy.js", import.meta.url), "utf8");
const accountReceptionSource = await readFile(new URL("../src/salebuddy/ui/account-reception-page.js", import.meta.url), "utf8");

test("conversation strategy only exposes customer-facing strategy and business knowledge", () => {
  assert.match(source, /承接策略/);
  assert.match(source, /业务知识/);
  assert.match(source, /sb-cs-tab/);
  assert.doesNotMatch(source, /长期记忆/);
  assert.doesNotMatch(source, /记忆保持长期一致/);
  assert.doesNotMatch(source, /添加记忆/);
  assert.doesNotMatch(source, /还没有长期记忆/);
});

test("conversation strategy reads and writes real Agent knowledge records", () => {
  assert.match(source, /agent\.memory\.list/);
  assert.match(source, /agent\.memory\.append/);
  assert.match(source, /agent\.memory\.delete/);
});

test("conversation strategy shares persisted runtime settings with the inbox Agent", () => {
  assert.match(source, /inboxStrategyStore\.get/);
  assert.match(source, /inboxStrategyStore\.save/);
  assert.match(source, /同步到 Agent 中心的私信承接流程/);
  assert.doesNotMatch(source, /ACCOUNT_SUMMARIES|STRATEGY_CARDS/);
});

test("conversation strategy scopes edits to the selected Douyin account", () => {
  assert.match(source, /listAccounts/);
  assert.match(source, /accountId/);
  assert.match(source, /inboxStrategyStore\.get\(AGENT_ID,\s*\{\s*accountId/);
  assert.match(source, /inboxStrategyStore\.save\(AGENT_ID,[\s\S]*accountId/);
  assert.match(source, /当前承接账号/);
  assert.match(source, /切换承接账号/);
});

test("conversation strategy makes the selected account visually prominent", () => {
  assert.match(source, /sb-cs-account-panel/);
  assert.match(source, /sb-cs-account-avatar/);
  assert.match(source, /sb-cs-account-name/);
  assert.match(source, /sb-cs-account-handle/);
  assert.match(source, /accountAvatarSource/);
  assert.match(source, /连接抖音账号/);
});

test("conversation strategy sends accounts without private reception to the relevant Agent setup", () => {
  assert.match(source, /使用获客专家/);
  assert.match(source, /使用私信客服/);
  assert.match(source, /initialAgentId: "mkt-comment-acquisition"/);
  assert.match(source, /initialAgentId: "mkt-dm-inbox"/);
  assert.doesNotMatch(source.slice(source.indexOf("export function openConversationStrategyPage")), /openRealtimeWork\?\.\(\{ openAccountSetup: true \}\)/);
});

test("conversation strategy empty state uses a full-height work surface rather than leaving a blank page area", () => {
  assert.match(accountReceptionSource, /root\.classList\.add\("sb-reception-empty-workspace"\)/);
  assert.match(accountReceptionSource, /root\.classList\.remove\("sb-reception-empty-workspace"\)/);
  assert.match(accountReceptionSource, /\.sb-reception\.sb-reception-empty-workspace\{[^}]*min-height:100%/);
  assert.match(accountReceptionSource, /\.sb-reception-empty-workspace \.sb-reception-empty\{display:grid;min-height:calc\(100dvh - 118px\)/);
  assert.match(accountReceptionSource, /\.sb-reception-empty-workspace \.sb-reception-empty-inner\{display:grid;justify-items:center/);
  assert.match(
    source,
    /const EMPTY_WORKSPACE_ILLUSTRATION = new URL\("\.\.\/\.\.\/\.\.\/assets\/icon-none-CLa_dC9J\.svg", import\.meta\.url\)\.href/
  );
  assert.match(source, /sb-reception-empty-eyebrow", "私信承接"/);
});

test("conversation strategy uses the current animated Agent avatar system", () => {
  assert.match(source, /import \{ mountGrokBotAvatar \} from "\.\/grok-bot-avatar\.js"/);
  assert.match(source, /mountGrokBotAvatar\(avatar, AGENT_ID/);
  assert.match(source, /\.sb-cs-avatar\.sb-grok-avatar/);
  assert.doesNotMatch(source, /mountAgentAvatar\(avatar, AGENT_ID/);
});

test("conversation strategy removes the redundant page title above the Agent identity", () => {
  assert.match(source, /page\.root\.querySelector\("\.sb-page-head"\)\?\.remove\(\)/);
});

test("conversation strategy is a management surface after setup, not a duplicate use flow", () => {
  assert.match(source, /getAuthorizedManagedAccounts/);
  assert.match(source, /renderAccountPanel\(root, state/);
  assert.match(source, /正在编辑此账号的承接策略/);
  assert.match(source, /if \(onUseAgent\)/);
  assert.doesNotMatch(source, /立即使用私信承接专员/);
});

test("conversation strategy uses user-facing questions instead of internal policy labels", () => {
  assert.match(source, /希望把对话推进到哪里？/);
  assert.match(source, /希望我用什么语气回复？/);
  assert.match(source, /哪些问题可以直接回答？/);
  assert.match(source, /哪些情况交给你处理？/);
  assert.doesNotMatch(source, /strategyField\("承接目标"/);
  assert.doesNotMatch(source, /strategyField\("承接规则"/);
});

test("business materials can be parsed from text, CSV, and JSON before saving", async () => {
  const markdown = await readBusinessMaterialFile({
    name: "业务说明.md",
    text: async () => "主营家居产品。\n\n价格以店铺最新信息为准。"
  });
  assert.equal(markdown.content, "主营家居产品。\n\n价格以店铺最新信息为准。");

  const csv = await readBusinessMaterialFile({
    name: "产品信息.csv",
    text: async () => '产品,价格,库存\n"标准版,大号",299,有货\n'
  });
  assert.equal(csv.rowCount, 2);
  assert.match(csv.content, /产品：标准版,大号；价格：299；库存：有货/);

  const json = await readBusinessMaterialFile({
    name: "回复规则.json",
    text: async () => JSON.stringify({ greeting: "先了解需求", unknown: "不要猜测" })
  });
  assert.match(json.content, /"greeting": "先了解需求"/);
  assert.match(json.content, /"unknown": "不要猜测"/);
});

test("business material parsing preserves quoted delimiters and rejects unsupported files", async () => {
  assert.deepEqual(parseDelimitedRows('名称,说明\n"A,B","第一行\n第二行"'), [
    ["名称", "说明"],
    ["A,B", "第一行\n第二行"]
  ]);
  await assert.rejects(
    () => readBusinessMaterialFile({ name: "资料.pdf", text: async () => "内容" }),
    /暂支持 TXT、MD、CSV、TSV、JSON、XLS、XLSX 文件/
  );
});

test("business knowledge UI offers local file parsing with a confirmation step", () => {
  assert.match(source, /type = "file"/);
  assert.match(source, /accept = BUSINESS_MATERIAL_ACCEPT/);
  assert.equal(BUSINESS_MATERIAL_ACCEPT.includes(".xlsx"), true);
  assert.match(source, /确认前可修改内容/);
  assert.match(source, /加入业务知识/);
  assert.match(source, /source: "file-import"/);
});

test("conversation strategy does not expose a manual-confirm reply mode", () => {
  const start = source.indexOf("function renderStrategy");
  const end = source.indexOf("function renderEntry");
  const strategyView = source.slice(start, end);

  assert.doesNotMatch(strategyView, /回复方式/);
  assert.doesNotMatch(strategyView, /人工确认/);
  assert.doesNotMatch(strategyView, /replyMode/);
});

test("conversation strategy only accepts accounts with private reception enabled and deduplicates by Douyin identity", () => {
  const accounts = selectConversationStrategyAccounts([
    {
      id: "douyin-agent:mkt-dm-inbox",
      agentId: "mkt-dm-inbox",
      name: "国王",
      status: "运行中",
      computer: "在线",
      authenticationVerified: true,
      privateReceptionEnabled: true,
      identity: { sec_uid: "sec-king", nickname: "国王" }
    },
    {
      id: "douyin-agent:mkt-comment-acquisition",
      agentId: "mkt-comment-acquisition",
      name: "一以万真",
      status: "运行中",
      computer: "在线",
      authenticationVerified: true,
      privateReceptionEnabled: false,
      identity: { sec_uid: "sec-one", nickname: "一以万真" }
    },
    {
      id: "douyin-agent:mkt-cold-writer",
      agentId: "mkt-cold-writer",
      name: "一以万真",
      status: "运行中",
      computer: "在线",
      authenticationVerified: true,
      privateReceptionEnabled: true,
      identity: { sec_uid: "sec-one", nickname: "一以万真" }
    }
  ]);

  assert.deepEqual(accounts.map(({ name }) => name), ["国王", "一以万真"]);
});

test("style preview exposes multiple isolated mock accounts for account switching", () => {
  const accounts = createConversationStrategyMockAccounts();
  assert.deepEqual(accounts.map(({ name }) => name), ["安安的升学笔记", "小鹿的新能源车日记", "阿杰的收纳好物"]);
  assert.ok(accounts.every((account) => account.accountKind === "consumer"));
  assert.ok(accounts.some((account) => account.consumerScenario === "personal-ecommerce"));
  assert.ok(accounts.every((account) => account.mock && account.privateReceptionEnabled && account.receptionConfigured));
  assert.equal(new Set(accounts.map(({ id }) => id)).size, accounts.length);
});

test("conversation strategy refreshes its account directory from the real backend", () => {
  assert.match(source, /\/v1\/connectors\/douyin\/accounts/);
  assert.match(source, /refreshAuthorizedAccounts/);
});

test("conversation strategy clears a stale browser account when the authoritative directory is empty", () => {
  const originalStorage = globalThis.localStorage;
  const originalSaleBuddy = globalThis.__SALEBUDDY__;
  const values = new Map();
  const staleAccount = {
    id: "stale-account",
    name: "旧账号",
    handle: "@stale",
    status: "运行中",
    computer: "在线",
    authenticationVerified: true,
    privateReceptionEnabled: true,
    identity: { sec_uid: "sec-stale", nickname: "旧账号" }
  };

  try {
    globalThis.localStorage = {
      getItem: (key) => values.get(key) || null,
      setItem: (key, value) => values.set(key, String(value))
    };
    values.set("byering-managed-douyin-accounts", JSON.stringify([staleAccount]));
    globalThis.__SALEBUDDY__ = { douyinAccounts: [staleAccount] };

    assert.deepEqual(authoritativeConversationStrategyAccountProfiles([]), []);
    assert.equal(values.get("byering-managed-douyin-accounts"), "[]");
    assert.deepEqual(globalThis.__SALEBUDDY__.douyinAccounts, []);
  } finally {
    if (originalStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = originalStorage;
    if (originalSaleBuddy === undefined) delete globalThis.__SALEBUDDY__;
    else globalThis.__SALEBUDDY__ = originalSaleBuddy;
  }
});

test("conversation strategy lets only a private-reception account enter management before any strategy is saved", () => {
  assert.match(source, /account\.privateReceptionEnabled === true/);
  assert.match(source, /const managed = managedAccountProfiles\(accounts\);/);
  assert.match(source, /const eligibleIds = new Set\(managed\.map\(\(profile\) => profile\.id\)\);/);
  assert.match(source, /\.filter\(\(profile\) => eligibleIds\.has\(profile\.id\)\)/);
});

test("conversation strategy uses the stable Douyin user id across cached and remote account records", () => {
  assert.equal(conversationStrategyAccountId({
    id: "douyin-agent:mkt-dm-inbox",
    identity: { user_id: "58262205543", sec_uid: "sec-one" }
  }), "58262205543");
});

test("conversation strategy merges a legacy Agent account alias into the matching real account", () => {
  const profiles = mergeConversationStrategyProfiles({
    saved: [{ id: "douyin-agent:mkt-dm-inbox", name: "一以万真" }],
    managed: [
      { id: "43592743387647", name: "国王" },
      { id: "58262205543", name: "一以万真" }
    ],
    current: { id: "douyin-agent:mkt-dm-inbox", name: "一以万真" }
  });

  assert.deepEqual(profiles.map(({ id, name }) => ({ id, name })), [
    { id: "43592743387647", name: "国王" },
    { id: "58262205543", name: "一以万真" }
  ]);
});
