import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { buildConsumerOverviewModel, buildInboxResumeFlow, buildPrivateOutreachResumeFlow, buildProspectDashboardModel, commentResultItems, consumerNavigationItems, dashboardAcquisitionAccount, dashboardLeadLabel, dashboardReplyLabel, discoveredUserItems, discoverySourceGroups, discoveryTaskGroups, isBusinessResult, isDirectOutreachCandidate, leadCaptureContactEntries, normalizePeopleFilter, outreachResultItems, personAvatarHydrationReference, privateOutreachRecipientId, prospectSelectionIds, resultFunnelCounts, selectedResultIdForType } from "../src/salebuddy/ui/prospect-center.js";
import { createResultsMockPreviewData, createResultsMockPreviewFiles, isResultsMockPreview } from "../src/salebuddy/ui/results-mock-preview.js";
import { finderAccountToOutreach, mergeResolvedFinderAccounts, normalizeDouyinFinderAccount } from "../src/salebuddy/ui/douyin-finder-results.js";
import { personAvatarUrl } from "../src/salebuddy/ui/person-avatar.js";
import { PRIVATE_OUTREACH_MODES } from "../src/salebuddy/agents/private-outreach-contract.js";

const prospectCenterSource = fs.readFileSync(new URL("../src/salebuddy/ui/prospect-center.js", import.meta.url), "utf8");

test("consumer results overview prioritizes the next human decision over result administration", () => {
  const model = buildConsumerOverviewModel({
    records: [
      { id: "reply-1", status: "未回复" },
      { id: "contact-1", status: "待触达" },
      { id: "converted-1", status: "已留资", conversionStatus: "已转化" }
    ],
    runs: [{
      taskId: "run-1",
      resultType: "评论筛选",
      agentName: "作品评论筛选专员",
      title: "最近的评论筛选",
      summary: "筛出了 6 条有购买信号的评论",
      generatedAt: "2026-09-08T08:00:00.000Z"
    }]
  });

  assert.equal(model.primaryAction.kind, "reply");
  assert.equal(model.primaryAction.count, 1);
  assert.equal(model.primaryAction.title, "1 位客户在等你回复");
  assert.equal(model.primaryAction.label, "查看待回复");
  assert.equal(model.counts.readyToContact, 1);
  assert.equal(model.counts.converted, 1);
  assert.equal(model.recentRuns[0].narrative, "我刚筛出了 6 条有购买信号的评论。");

  const contactModel = buildConsumerOverviewModel({ records: [{ id: "new-1", status: "待触达" }, { id: "new-2", status: "待触达" }, { id: "new-3", status: "待触达" }] });
  assert.equal(contactModel.primaryAction.title, "抖音获客管家正在自动触达 3 位潜客");
  assert.equal(contactModel.primaryAction.label, "查看自动进展");
  assert.equal(contactModel.primaryAction.description, "找人、分析、触达和对话由自动流程承接。");
});

test("finder-only results lead with discovered people instead of generic work review", () => {
  const model = buildConsumerOverviewModel({
    runs: [{
      taskId: "finder-only-1",
      resultType: "抖音找人",
      title: "找家居兴趣人群",
      items: [{ accountId: "public-1", nickname: "公域账号", reasons: ["公开主页命中家居兴趣"] }]
    }]
  });

  assert.equal(model.primaryAction.kind, "discovery");
  assert.equal(model.primaryAction.count, 1);
  assert.equal(model.primaryAction.title, "刚找到 1 个符合条件的人");
  assert.equal(model.primaryAction.label, "查看发现的人");
});

test("consumer navigation exposes the shared found-people surface", () => {
  const items = consumerNavigationItems({
    records: [],
    runs: [{ taskId: "finder-1", resultType: "抖音找人", items: [{ accountId: "public-1", nickname: "公域账号", reasons: ["公开主页命中家居兴趣"] }] }]
  });

  assert.deepEqual(items.find((item) => item.surface === "people"), {
    surface: "people",
    label: "发现的人",
    count: 1,
    resultType: "发现"
  });
});

test("discovery counts use the same identity pool as the discovered-people view", () => {
  const input = {
    records: [{ id: "own-1", name: "自有来源用户", status: "待触达", contactability: { allowed: true, sourceScope: "own_account_comments" } }],
    runs: [{ taskId: "finder-1", resultType: "抖音找人", items: [{ accountId: "public-1", nickname: "公域账号" }] }]
  };
  const people = discoveredUserItems(input);
  const navigation = consumerNavigationItems(input);
  const funnel = resultFunnelCounts(input);

  assert.equal(navigation.find((item) => item.surface === "people").count, people.length);
  assert.equal(funnel.discovered, people.length);
});

test("found people separates authorized-account interactions from public finder tasks", () => {
  const input = {
    records: [{
      id: "own-1",
      name: "互动用户",
      uniqueId: "interaction-1",
      status: "待触达",
      source: { accountId: "account-1", accountName: "鸿扬的家居号", type: "作品评论" },
      contactability: { allowed: true, sourceScope: "own_account_comments" }
    }],
    runs: [{
      taskId: "public-1",
      resultType: "抖音找人",
      title: "找上海家居创作者",
      items: [{ accountId: "public-account-1", nickname: "公域账号", reasons: ["公开主页命中家居内容"] }]
    }]
  };

  const model = discoverySourceGroups(input);

  assert.equal(model.ownItems.length, 1);
  assert.equal(model.publicItems.length, 1);
  assert.equal(model.accounts[0].name, "鸿扬的家居号");
  assert.equal(model.accounts[0].items[0].origin, "own");
  assert.equal(model.tasks[0].title, "找上海家居创作者");
  assert.equal(model.tasks[0].items[0].origin, "public");
});

test("selected own discovered users enter intent analysis instead of public account analysis", () => {
  const start = prospectCenterSource.indexOf("  function openDiscoveredPeopleAnalysis");
  const end = prospectCenterSource.indexOf("\n  function openDiscoveredOutreach", start);
  const implementation = prospectCenterSource.slice(start, end);

  assert.match(implementation, /ownRecords/);
  assert.match(implementation, /openIntentAnalysisFromProspects\(ownRecords, sourceRunForDiscovered\(selectedItems\[0\]\) \|\| \{\}, \{ allowSelected: true \}\)/);
  assert.match(implementation, /openAccountAnalysis/);
  assert.match(prospectCenterSource.slice(prospectCenterSource.indexOf("function openIntentAnalysisFromProspects"), prospectCenterSource.indexOf("function openPrivateOutreachFromProspects")), /analysisMode: "intent"/);
  assert.match(prospectCenterSource.slice(prospectCenterSource.indexOf("function openIntentAnalysisFromProspects"), prospectCenterSource.indexOf("function openPrivateOutreachFromProspects")), /analysisKind: "intent"/);
});

test("found people can be sent directly when the record is contactable and untouched", () => {
  const record = {
    id: "found-ready",
    status: "待触达",
    profileUrl: "https://www.douyin.com/user/found-ready",
    source: { accountId: "account-1", accountName: "鸿扬的家居号" },
    contactability: { allowed: true, sourceScope: "own_account_comments" }
  };

  assert.equal(isDirectOutreachCandidate(record), true);
  assert.equal(isDirectOutreachCandidate({ ...record, status: "已触达" }), false);
  assert.equal(isDirectOutreachCandidate({ ...record, contactability: { allowed: false, sourceScope: "public_search" } }), false);
});

test("found people profile URLs become stable recipient identities for outreach", () => {
  const profileUrl = "https://www.douyin.com/user/mock-sec-found-ready";

  assert.equal(privateOutreachRecipientId({ profileUrl }), "mock-sec-found-ready");
  const flow = buildPrivateOutreachResumeFlow({
    outreachMode: PRIVATE_OUTREACH_MODES.ALL_FOUND,
    source: "找到的人",
    run: { resultType: "找到的人", sourceScope: "own_account_comments", accountId: "account-1", accountName: "鸿扬的家居号" },
    items: [{ id: "found-ready", name: "互动用户", profileUrl, sourceScope: "own_account_comments" }]
  });

  assert.equal(flow.targetEntries[0].secUid, "mock-sec-found-ready");
  assert.equal(flow.targetEntries[0].status, "ready");
});

test("mock found people include usable Douyin identities for direct outreach", () => {
  const data = createResultsMockPreviewData();
  const directTargets = data.records.filter(isDirectOutreachCandidate);

  assert.ok(directTargets.length >= 2);
  assert.ok(directTargets.every((record) => record.profileUrl || record.secUid || record.secId));
});

test("found-people outreach preserves the all-found mode in the resumable flow", () => {
  const flow = buildPrivateOutreachResumeFlow({
    outreachMode: PRIVATE_OUTREACH_MODES.ALL_FOUND,
    source: "找到的人",
    run: { resultType: "找到的人", sourceScope: "own_account_comments", accountId: "account-1", accountName: "鸿扬的家居号" },
    items: [{ id: "found-ready", name: "互动用户", profileUrl: "https://www.douyin.com/user/found-ready", sourceScope: "own_account_comments" }]
  });

  assert.equal(flow.outreachMode, PRIVATE_OUTREACH_MODES.ALL_FOUND);
  assert.equal(flow.source, "找到的人");
  assert.equal(flow.sourceAccountId, "account-1");
});

test("found people groups historical interactions by the current authorized Douyin account", () => {
  const model = discoverySourceGroups({
    records: [
      {
        id: "historical-1",
        uniqueId: "viewer-1",
        name: "互动用户一",
        status: "待触达",
        source: { accountId: "legacy-session-a", accountName: "未命名授权账号" },
        contactability: { allowed: true, sourceScope: "own_account_comments" }
      },
      {
        id: "historical-2",
        uniqueId: "viewer-2",
        name: "互动用户二",
        status: "待触达",
        source: { accountId: "legacy-session-b", accountName: "未命名授权账号" },
        contactability: { allowed: true, sourceScope: "own_account_comments" }
      }
    ],
    authorizedAccounts: [{
      id: "managed-yiyiwanzhen",
      name: "一以万真",
      handle: "@yiyiwanzhen",
      avatar: "https://cdn.example.com/yiyiwanzhen-avatar.jpg",
      identity: { uniqueId: "yiyiwanzhen" }
    }]
  });

  assert.equal(model.authorizedAccounts.length, 1);
  assert.equal(model.accounts.length, 1);
  assert.equal(model.accounts[0].name, "一以万真");
  assert.equal(model.accounts[0].count, 2);
  assert.equal(model.accounts[0].avatar, "https://cdn.example.com/yiyiwanzhen-avatar.jpg");
  assert.ok(model.ownItems.every((item) => item.sourceAccount.id === "managed-yiyiwanzhen"));
  assert.ok(model.ownItems.every((item) => item.sourceAccountResolved === true));
  assert.match(prospectCenterSource, /list\.appendChild\(all\);/);
  assert.match(prospectCenterSource, /sb-discovery-account-avatar/);
});

test("found people preserves the originating Douyin account avatar when the account directory is unavailable", () => {
  const model = discoverySourceGroups({
    records: [{
      id: "source-avatar-1",
      uniqueId: "viewer-avatar-1",
      name: "互动用户",
      source: {
        accountId: "source-account-1",
        accountName: "一以万真",
        accountAvatar: "https://cdn.example.com/source-account-avatar.jpg"
      },
      contactability: { allowed: true, sourceScope: "own_account_comments" }
    }]
  });

  assert.equal(model.accounts[0].avatar, "https://cdn.example.com/source-account-avatar.jpg");
});

test("unlinked matched analysis results do not become contactable prospects", () => {
  const people = discoveredUserItems({
    records: [],
    runs: [{
      taskId: "public-filter-1",
      resultType: "评论筛选",
      analysis: { mode: "filter" },
      items: [{ nickname: "公域用户", text: "想了解一下", filter: { matched: true } }]
    }]
  });

  assert.equal(people[0].status, "已分析");
  assert.equal(people[0].recordId, "");
});

test("direct prospect dashboard exposes real lifecycle views", () => {
  const model = buildProspectDashboardModel({
    records: [
      { id: "high-1", name: "高意向用户", tier: "high", score: 92, status: "待触达", tags: ["询问价格"] },
      { id: "confirmation-1", name: "待确认用户", tier: "high", score: 89, status: "待确认触达", tags: ["询问价格"] },
      { id: "touched-1", name: "已触达用户", tier: "medium", score: 68, status: "已触达", outreachStatus: "sent", replyStatus: "未回复", tags: [] },
      { id: "replied-1", name: "已回复用户", tier: "medium", score: 72, status: "已触达", outreachStatus: "sent", replyStatus: "已回复", tags: [] },
      { id: "lead-1", name: "已留资用户", status: "已留资", conversionStatus: "已转化", tags: [] }
    ]
  });

  assert.equal(model.counts.acquired, 5);
  assert.equal(model.counts.touched, 2);
  assert.equal(model.counts.replied, 1);
  assert.equal(model.counts.converted, 1);
  assert.equal(model.counts.conversionRate, 20);
  assert.equal(model.views.all.items.length, 4);
  assert.equal(model.views.ready.items.length, 1);
  assert.equal(model.views.confirmation.items.length, 1);
  assert.equal(model.views.touched.items.length, 2);
  assert.equal(model.views.following.items.length, 1);
  assert.equal(model.views.following.items[0].id, "replied-1");
  assert.equal(model.views.leads.items.length, 1);
});

test("style preview provides a complete results-center conversion chain without persisting sample data", () => {
  const { records, runs } = createResultsMockPreviewData();
  const model = buildProspectDashboardModel({ records, runs });

  assert.equal(records.length, 8);
  assert.equal(model.counts.acquired, 8);
  assert.equal(model.counts.touched, 6);
  assert.equal(model.counts.replied, 4);
  assert.equal(model.counts.saved, 2);
  assert.equal(model.counts.converted, 1);
  assert.ok(model.views.all.items.length > 0);
  assert.ok(model.views.ready.items.length > 0);
  assert.ok(model.views.touched.items.length > 0);
  assert.ok(model.views.following.items.length > 0);
  assert.ok(model.views.leads.items.length > 0);
  assert.ok(discoveredUserItems({ records, runs }).length > records.length);
  assert.ok(discoveryTaskGroups({ records, runs }).some((group) => group.title === "新能源家庭用车兴趣人群"));
  assert.equal(createResultsMockPreviewFiles().length, 3);
  assert.equal(isResultsMockPreview("?page=prospects&preview=style", { hostname: "127.0.0.1" }), true);
  assert.equal(isResultsMockPreview("?page=prospects&preview=style", { hostname: "example.com" }), false);
});

test("captured leads expose their concrete contact details in the dashboard", () => {
  const { records } = createResultsMockPreviewData();
  const capturedLead = records.find((item) => item.id === "mock-prospect-nanjing-xu");

  assert.deepEqual(leadCaptureContactEntries(capturedLead), [["微信号", "nanjing_ev_xu"]]);
  assert.match(prospectCenterSource, /已留资联系方式/);
  assert.match(prospectCenterSource, /sb-data-contact-preview/);
});

test("dashboard only treats authorized account discoveries as contactable prospects", () => {
  const model = buildProspectDashboardModel({
    records: [
      { id: "own-1", name: "自有账号用户", status: "待触达", contactability: { allowed: true, sourceScope: "own_account_comments" } },
      { id: "public-1", name: "公域分析对象", status: "待触达", contactability: { allowed: false, sourceScope: "public_search" } },
      { id: "direct-1", name: "用户指定对象", status: "已触达", contactability: { allowed: false, sourceScope: "user_direct" } }
    ],
    runs: [{ taskId: "finder-1", resultType: "抖音找人", items: [{ accountId: "public-1", nickname: "公域分析对象" }] }]
  });

  assert.equal(model.counts.acquired, 1);
  assert.equal(model.counts.touched, 0);
  assert.equal(model.views.all.items.map((item) => item.id).join(","), "own-1");
  assert.equal(model.views.ready.items.length, 1);
});

test("raw account interactions remain out of the prospect dashboard until intent analysis finishes", () => {
  const model = buildProspectDashboardModel({
    records: [
      { id: "raw-1", name: "互动用户", status: "待分析", tier: "unknown", source: { agentId: "mkt-find-people" }, contactability: { allowed: true, sourceScope: "own_account_comments" } },
      { id: "qualified-1", name: "已分析潜客", status: "待触达", tier: "high", contactability: { allowed: true, sourceScope: "own_account_comments" } }
    ]
  });
  assert.equal(model.counts.acquired, 2);
  assert.equal(model.views.all.items.map((item) => item.id).join(","), "qualified-1");
  assert.equal(model.views.ready.items.length, 1);
});

test("dashboard separates captured leads from explicitly converted customers", () => {
  const model = buildProspectDashboardModel({
    records: [
      { id: "lead-1", status: "已留资", contactStatus: "已留资", conversionStatus: "未转化" },
      { id: "converted-1", status: "已留资", contactStatus: "已留资", conversionStatus: "已转化" }
    ]
  });

  assert.equal(model.counts.saved, 2);
  assert.equal(model.counts.converted, 1);
  assert.equal(model.counts.conversionRate, 50);
});

test("results center keeps partial and failed delivery results visible", () => {
  assert.equal(isBusinessResult({ resultType: "评论筛选", status: "partial", items: [{ id: "comment-1" }], errors: [{ code: "TIMEOUT" }] }), true);
  assert.equal(isBusinessResult({ resultType: "错误", status: "failed", error: { code: "OFFLINE" } }), true);
});

test("results center leaves the global page title empty because navigation already identifies the section", () => {
  assert.match(prospectCenterSource, /const page = openPage\(\{\s*title: \"\",\s*onClose: \(\) => \{/);
});

test("default prospect center opens on the direct data dashboard", () => {
  assert.match(prospectCenterSource, /shell\.appendChild\(renderDataOverview\(\)\)/);
  assert.match(prospectCenterSource, /sb-data-funnel/);
  assert.match(prospectCenterSource, /全部潜客/);
  assert.match(prospectCenterSource, /待触达/);
  assert.match(prospectCenterSource, /已触达/);
  assert.match(prospectCenterSource, /跟进中/);
  assert.match(prospectCenterSource, /已留资/);
  assert.doesNotMatch(prospectCenterSource, /titleCopy\.append\(el\("h1", "sb-data-title", "潜客记录"\)/);
  assert.doesNotMatch(prospectCenterSource, /model\.tabs\.positive/);
  assert.doesNotMatch(prospectCenterSource, /model\.tabs\.negative/);
  assert.match(prospectCenterSource, /客户信息/);
  assert.match(prospectCenterSource, /\["客户信息", "触达状态", "回复状态", "留资信息", "获客账号", "来源", "城市", "触达时间", "操作"\]/);
  assert.doesNotMatch(prospectCenterSource, /车型\s*\/\s*需求/);
  assert.doesNotMatch(prospectCenterSource, /const vehicle = el\("td"/);
  assert.match(prospectCenterSource, /开始触达/);
  assert.match(prospectCenterSource, /查看发现依据/);
  assert.doesNotMatch(prospectCenterSource, /搜索客户、来源或标签/);
  assert.doesNotMatch(prospectCenterSource, /const search = el\("input", "sb-data-search"\)/);
  assert.doesNotMatch(prospectCenterSource, /导出当前列表/);
  assert.doesNotMatch(prospectCenterSource, /sb-data-export/);
  assert.match(prospectCenterSource, /\.sb-data-avatar\{[^}]*display:grid;[^}]*width:38px;[^}]*height:38px;[^}]*overflow:hidden;[^}]*border-radius:11px/);
  assert.match(prospectCenterSource, /\.sb-data-avatar img\{display:block;width:100%;height:100%;object-fit:cover\}/);
});

test("captured leads expose human sales progression instead of only a final conversion action", () => {
  assert.match(prospectCenterSource, /进入成交跟进/);
  assert.match(prospectCenterSource, /确认已转化/);
  assert.match(prospectCenterSource, /标记已失效/);
  assert.match(prospectCenterSource, /setConversionStatus/);
});

test("dashboard funnel presents stage totals and conversion rates as inter-stage bridges", () => {
  const start = prospectCenterSource.indexOf("function renderDashboardFunnel");
  const end = prospectCenterSource.indexOf("function renderDashboardDetail", start);
  const funnel = prospectCenterSource.slice(start, end);
  const order = ["获取潜客", "触达率", "私信触达", "回复率", "客户回复", "触达留资率", "完成留资", "转化率"];
  let previous = -1;
  order.forEach((label) => {
    const position = funnel.indexOf(`"${label}"`);
    assert.ok(position > previous, `${label} should follow the funnel order`);
    previous = position;
  });
  assert.match(funnel, /sb-data-funnel-bridge/);
  assert.match(funnel, /sb-data-funnel-bridge-copy/);
  assert.match(funnel, /sb-data-funnel-final/);
  assert.doesNotMatch(funnel, /\["留资率"/);
});

test("prospect dashboard leaves non-prospect results to dedicated navigation", () => {
  const start = prospectCenterSource.indexOf("function renderDataOverview");
  const end = prospectCenterSource.indexOf("function render()", start);
  const dashboard = prospectCenterSource.slice(start, end);
  assert.doesNotMatch(dashboard, /发现的人|Agent 做过的事|renderDashboardResultLinks/);
  assert.match(prospectCenterSource, /state\.surface = "work"/);
  assert.match(prospectCenterSource, /state\.resultType = "发现"/);
  assert.match(prospectCenterSource, /resultType = "全部成果"/);
});

test("prospect rows expose reply, lead-capture, and acquisition-account fields", () => {
  const item = {
    status: "已回复",
    replyStatus: "已回复",
    contactStatus: "已留资",
    leadStatus: "已留资",
    source: { accountName: "我的抖音账号" }
  };

  assert.equal(dashboardReplyLabel(item), "已回复");
  assert.equal(dashboardLeadLabel(item), "已留资");
  assert.equal(dashboardAcquisitionAccount(item), "我的抖音账号");
  assert.equal(dashboardLeadLabel({ status: "待触达" }), "未留资");
  assert.equal(dashboardReplyLabel({ status: "待触达" }), "未触达");
  assert.equal(dashboardAcquisitionAccount({}), "未记录");
});

test("dashboard details stay inside the direct data dashboard", () => {
  assert.match(prospectCenterSource, /dashboardDetailId: null/);
  assert.match(prospectCenterSource, /function renderDashboardDetail\(item\)/);
  assert.match(prospectCenterSource, /const workspace = el\("div", "sb-data-workspace"\)/);
  assert.match(prospectCenterSource, /workspace\.classList\.add\("has-detail"\)/);
  assert.match(prospectCenterSource, /workspace\.appendChild\(renderDashboardDetail\(detailItem\)\)/);
  assert.match(prospectCenterSource, /state\.dashboardDetailId = item\?\.id \|\| null/);
  assert.match(prospectCenterSource, /document\.startViewTransition\(\(\) => render\(\)\)/);
  assert.doesNotMatch(prospectCenterSource, /state\.surface = "people";\n    state\.resultType = isLeadCenterRecord\(item\)/);
  assert.match(prospectCenterSource, /为什么找到他/);
  assert.match(prospectCenterSource, /当前进展/);
  assert.match(prospectCenterSource, /不离开当前列表/);
  assert.match(prospectCenterSource, /leadCaptureEvidence/);
  assert.match(prospectCenterSource, /留资依据/);
});

test("prospect center isolates dashboard styles from legacy result styles", () => {
  assert.match(prospectCenterSource, /\[\["base", CSS\], \["consumer", CONSUMER_CSS\], \["discovery-results", DISCOVERY_RESULTS_CSS\], \["data", DATA_CSS\]\]/);
  assert.match(prospectCenterSource, /style\.dataset\.sbProspectStyle = name/);
  assert.match(prospectCenterSource, /\.sb-data-funnel\{display:flex;align-items:stretch;/);
  assert.match(prospectCenterSource, /\.sb-data-funnel-bridge\{position:relative;display:flex;/);
  assert.match(prospectCenterSource, /\.sb-data-table\{width:100%;min-width:1080px;border-collapse:collapse;table-layout:fixed\}/);
  assert.match(prospectCenterSource, /\.sb-data-workspace\{display:grid;grid-template-columns:minmax\(0,1fr\);/);
  assert.match(prospectCenterSource, /\.sb-data-workspace\.has-detail\{grid-template-columns:minmax\(0,1fr\) 360px;gap:18px\}/);
  assert.match(prospectCenterSource, /@keyframes sb-data-detail-enter/);
});

test("prospect bulk actions only expose executable next steps", () => {
  const start = prospectCenterSource.indexOf("function renderBulkBar");
  const end = prospectCenterSource.indexOf("function renderPerson", start);
  const bulkBar = prospectCenterSource.slice(start, end);
  assert.match(bulkBar, /一键触达/);
  assert.match(bulkBar, /开启私信承接/);
  assert.match(bulkBar, /批量归档/);
  assert.match(bulkBar, /清除选择/);
  assert.doesNotMatch(bulkBar, /标记待触达/);
  assert.doesNotMatch(bulkBar, /加上高意向/);
});

test("finder result center uses the delivery funnel instead of reference-account fallbacks", () => {
  const start = prospectCenterSource.indexOf("function renderDouyinFinderResultDetail");
  const end = prospectCenterSource.indexOf("function renderResultList", start);
  const detail = prospectCenterSource.slice(start, end);
  assert.match(detail, /搜索候选/);
  assert.match(detail, /深度核验/);
  assert.match(detail, /符合主题/);
  assert.match(detail, /最终交付/);
  assert.doesNotMatch(detail, /run\.counts\?\.input \|\| allAccounts\.length/);
  assert.match(prospectCenterSource, /调整条件再找/);
  assert.match(prospectCenterSource, /finderGoal:\s*run\.inputs\?\.goal/);
  assert.match(prospectCenterSource, /finderResultLimit:\s*run\.inputs\?\.resultLimit/);
  assert.doesNotMatch(prospectCenterSource, /继续找下一批/);
});

test("account analysis results link back to the finder batch that supplied them", () => {
  assert.match(prospectCenterSource, /function sourceFinderRunForAnalysis\(runs = \[\], analysisRun = \{\}\)/);
  assert.match(prospectCenterSource, /查看来源找人结果/);
  assert.match(prospectCenterSource, /analysisRun\.links\?\.sourceResultId/);
});

test("user research results keep the survey brief, target rationale, sender, and receipts together", () => {
  const start = prospectCenterSource.indexOf("function renderUserResearchResultDetail");
  const end = prospectCenterSource.indexOf("function renderResultDetail", start);
  assert.ok(start >= 0 && end > start);
  const detail = prospectCenterSource.slice(start, end);
  assert.match(detail, /目标人群/);
  assert.match(detail, /问卷链接/);
  assert.match(detail, /发送账号/);
  assert.match(detail, /受访者与匹配依据/);
  assert.match(detail, /item\.receiptLabel/);
  assert.match(detail, /查看实时工作/);
});

test("comment result items expose matched comments with evidence", () => {
  const items = commentResultItems({
    resultType: "评论筛选",
    analysis: { mode: "filter" },
    items: [
      {
        commentId: "c-1",
        nickname: "小林",
        uniqueId: "xiaolin",
        text: "这个产品太差了",
        filter: { matched: true, confidence: 0.95, reason: "明确表达不满", signals: ["太差"] },
        source: { videoTitle: "产品体验", videoUrl: "https://www.douyin.com/video/1", observedAt: "2026-09-03T09:00:00.000Z" }
      },
      {
        commentId: "c-2",
        nickname: "阿宁",
        text: "颜色很好看",
        filter: { matched: false },
        source: { videoTitle: "产品体验" }
      }
    ]
  });

  assert.equal(items.length, 1);
  assert.deepEqual(items[0], {
    id: "c-1",
    name: "小林",
    handle: "xiaolin",
    quote: "这个产品太差了",
    videoTitle: "产品体验",
    videoUrl: "https://www.douyin.com/video/1",
    profileUrl: "",
    observedAt: "2026-09-03T09:00:00.000Z",
    reason: "明确表达不满",
    confidence: 0.95,
    signals: ["太差"],
    matched: true
  });
});

test("comment result items keep evidence visible when filter decisions are unavailable", () => {
  const items = commentResultItems({ resultType: "评论筛选", items: [{ text: "用户原话", nickname: "用户" }] });
  assert.equal(items.length, 1);
  assert.equal(items[0].quote, "用户原话");
});

test("comment results preserve provider identity for direct outreach", () => {
  const items = commentResultItems({
    resultType: "评论筛选",
    items: [{
      commentId: "c-identity",
      nickname: "小周",
      sec_id: "sec-id-1",
      sec_uid: "sec-uid-1",
      profile_url: "https://www.douyin.com/user/sec-uid-1",
      text: "想了解价格",
      filter: { matched: true }
    }]
  });
  assert.equal(items[0].secId, "sec-id-1");
  assert.equal(items[0].secUid, "sec-uid-1");
  assert.equal(items[0].profileUrl, "https://www.douyin.com/user/sec-uid-1");
});

test("comment results preserve real account avatars", () => {
  const items = commentResultItems({
    resultType: "评论筛选",
    items: [{
      commentId: "c-avatar",
      nickname: "头像用户",
      text: "想了解一下",
      user: { avatar_thumb: { url_list: ["https://cdn.example.com/comment-avatar.jpg"] } },
      filter: { matched: true }
    }]
  });

  assert.equal(items[0].avatar, "https://cdn.example.com/comment-avatar.jpg");
});

test("results center builds a resumable private outreach flow from selected comments", () => {
  const flow = buildPrivateOutreachResumeFlow({
    run: {
      taskId: "filter-run-1",
      ownerKey: "mkt-comment-filter::filter-run-1",
      resultType: "评论筛选",
      sourceScope: "own_account_comments",
      accountId: "douyin-owner-1",
      accountName: "我的抖音账号"
    },
    items: [
      {
        id: "c-1",
        name: "小周",
        handle: "xiaozhou",
        secId: "sec-1",
        secUid: "sec-1",
        profileUrl: "https://www.douyin.com/user/sec-1",
        quote: "想了解价格",
        reason: "明确表达购买意向",
        confidence: 0.94,
        signals: ["价格"],
        videoTitle: "产品介绍"
      },
      { id: "c-2", name: "小林", profileUrl: "https://www.douyin.com/user/profile-2" },
      { id: "c-3", name: "无身份用户" }
    ]
  });
  assert.equal(flow.agentId, "mkt-cold-writer");
  assert.equal(flow.prefilledFromResult, true);
  assert.deepEqual(flow.targetProfileUrls, ["https://www.douyin.com/user/sec-1", "https://www.douyin.com/user/profile-2"]);
  assert.equal(flow.targetEntries[0].status, "ready");
  assert.equal(flow.targetEntries[1].status, "ready");
  assert.equal(flow.targetEntries[1].secUid, "profile-2");
  assert.equal(flow.targetEntries.length, 2);
  assert.equal(flow.targetEntries[0].handle, "xiaozhou");
  assert.equal(flow.targetEntries[0].triggerSource, "评论筛选结果");
  assert.equal(flow.sourceScope, "own_account_comments");
  assert.equal(flow.sourceAccountId, "douyin-owner-1");
  assert.equal(flow.sourceAccountName, "我的抖音账号");
  assert.equal(flow.targetEntries[0].sourceScope, "own_account_comments");
  assert.equal(flow.targetEntries[0].sourceAccountId, "douyin-owner-1");
  assert.equal(flow.targetEntries[0].sourceAccountName, "我的抖音账号");
  assert.equal(flow.targetEntries[0].triggerReason, "明确表达购买意向");
  assert.equal(flow.targetEntries[0].quote, "想了解价格");
  assert.deepEqual(flow.targetEntries[0].signals, ["价格"]);
});

test("results center sends a selected pending prospect when the sec uid is displayed as a handle", () => {
  const secUid = "MS4wLjABAAAAWnryHAtestRecipient";
  const flow = buildPrivateOutreachResumeFlow({
    run: {
      taskId: "results-center",
      resultType: "潜客",
      sourceScope: "own_account_comments",
      accountId: "douyin-owner-1"
    },
    source: "成果中心潜客",
    items: [{
      id: "result-row-1",
      recordId: "result-row-1",
      name: "LIA、",
      handle: `@${secUid}`,
      quote: "想了解报价",
      source: { sourceScope: "own_account_comments", accountId: "douyin-owner-1" }
    }]
  });

  assert.equal(privateOutreachRecipientId({ handle: `@${secUid}` }), secUid);
  assert.equal(flow.targetEntries.length, 1);
  assert.equal(flow.targetEntries[0].recordId, "result-row-1");
  assert.equal(flow.targetEntries[0].secUid, secUid);
  assert.equal(flow.targetEntries[0].status, "ready");
});

test("outreach results explain who contacted whom, what was sent, and why", () => {
  const items = outreachResultItems({
    resultType: "触达记录",
    accountName: "一以万真",
    generatedAt: "2026-09-07T09:00:00.000Z",
    sourceResultType: "评论筛选",
    items: [{
      nickname: "小周",
      handle: "xiaozhou",
      secUid: "target-sec-1",
      profileUrl: "https://www.douyin.com/user/target-sec-1",
      message: "你好，看到你在评论区想了解价格。",
      profile: { followerCount: 2300, location: "上海" },
      triggerReason: "明确表达购买意向",
      quote: "想了解价格",
      signals: ["价格"],
      status: "sent",
      sentAt: "2026-09-07T08:59:00.000Z"
    }]
  });

  assert.equal(items.length, 1);
  assert.equal(items[0].senderName, "一以万真");
  assert.equal(items[0].targetName, "小周");
  assert.equal(items[0].message, "你好，看到你在评论区想了解价格。");
  assert.equal(items[0].triggerSource, "评论筛选结果");
  assert.equal(items[0].triggerReason, "明确表达购买意向");
  assert.equal(items[0].receiptLabel, "发送成功");
  assert.equal(items[0].quote, "想了解价格");
  assert.deepEqual(items[0].profile, { followerCount: 2300, location: "上海" });
});

test("outreach results inherit target avatars from the prospect pool", () => {
  const items = outreachResultItems({
    resultType: "触达记录",
    accountName: "一以万真",
    items: [{ secUid: "target-avatar", nickname: "目标用户", status: "sent" }]
  }, [{
    id: "lead-avatar",
    secUid: "target-avatar",
    name: "目标用户",
    avatar: "https://cdn.example.com/prospect-avatar.jpg"
  }]);

  assert.equal(items[0].avatar, "https://cdn.example.com/prospect-avatar.jpg");
});

test("outreach result cards use business facts instead of generic task metrics", () => {
  const listStart = prospectCenterSource.indexOf("function renderResultList");
  const detailStart = prospectCenterSource.indexOf("function renderResultDetail", listStart);
  const listSource = prospectCenterSource.slice(listStart, detailStart);
  assert.match(listSource, /run\.resultType === "触达记录"/);
  assert.match(listSource, /senderName/);
  assert.match(listSource, /targetName/);
  assert.match(listSource, /message/);
  assert.match(prospectCenterSource, /function renderOutreachResultDetail/);
  assert.match(prospectCenterSource, /发送账号/);
  assert.match(prospectCenterSource, /触达对象/);
  assert.match(prospectCenterSource, /发送内容/);
  assert.match(prospectCenterSource, /目标画像/);
  assert.match(prospectCenterSource, /触发依据/);
  assert.match(prospectCenterSource, /真实回执/);
});

test("switching a result category selects a result from that category", () => {
  const runs = [
    { taskId: "finder-1", agentId: "finder", resultType: "抖音找人" },
    { taskId: "outreach-1", agentId: "outreach", resultType: "触达记录" }
  ];

  assert.equal(selectedResultIdForType(runs, "触达记录"), "run:outreach::outreach-1::");
  assert.equal(selectedResultIdForType(runs, "全部成果"), "run:finder::finder-1::");
  assert.equal(selectedResultIdForType(runs, "评论筛选"), null);
});

test("results center bulk actions ignore the DOM click event and keep the selected prospect ids", () => {
  const selected = new Set(["prospect-1"]);
  const clickEvent = { type: "click", target: {} };

  assert.equal(prospectSelectionIds(clickEvent, selected), selected);
  assert.deepEqual([...prospectSelectionIds([{ id: "prospect-2" }], selected)], ["prospect-2"]);
});

test("results center hands contacted prospects to the private inbox agent", () => {
  const flow = buildInboxResumeFlow({
    items: [{
      id: "prospect-1",
      name: "青木物语",
      profileUrl: "https://www.douyin.com/user/sec-1",
      sec_id: "sec-id-1",
      sec_uid: "sec-uid-1"
    }]
  });

  assert.equal(flow.agentId, "mkt-dm-inbox");
  assert.equal(flow.prefilledFromResult, true);
  assert.equal(flow.source, "成果中心已触达用户");
  assert.equal(flow.targetEntries.length, 1);
  assert.deepEqual(flow.focusTargets, flow.targetEntries);
  assert.deepEqual(flow.targetEntries[0], {
    recordId: "prospect-1",
    nickname: "青木物语",
    profileUrl: "https://www.douyin.com/user/sec-1",
    secId: "sec-id-1",
    secUid: "sec-uid-1",
    status: "ready",
    error: null
  });
});

test("normalizes a finder account for result-center management without losing evidence", () => {
  const account = normalizeDouyinFinderAccount({
    reference: "https://www.douyin.com/user/example",
    identity: { sec_uid: "sec-1", nickname: "原始昵称", profile_url: "https://www.douyin.com/user/example" },
    profile: { nickname: "画像昵称", unique_id: "jiaju-1", follower_count: 12000, province: "上海" },
    videos: [{ aweme_id: "video-1", desc: "家居改造" }],
    matched: true,
    score: 86,
    reasons: ["粉丝数达到门槛"],
    live: { is_live: false }
  });

  assert.equal(account.accountId, "sec-1");
  assert.equal(account.nickname, "画像昵称");
  assert.equal(account.handle, "jiaju-1");
  assert.equal(account.followers, 12000);
  assert.equal(account.location, "上海");
  assert.equal(account.finderState.status, "匹配");
  assert.equal(account.videos[0].desc, "家居改造");
});

test("finder accounts preserve avatars when handed to outreach", () => {
  const account = normalizeDouyinFinderAccount({
    accountId: "sec-avatar",
    nickname: "找人结果",
    profile: {
      nickname: "找人结果",
      avatar_thumb: { url_list: ["https://cdn.example.com/finder-avatar.jpg"] }
    }
  });
  const target = finderAccountToOutreach(account);

  assert.equal(account.avatar, "https://cdn.example.com/finder-avatar.jpg");
  assert.equal(target.avatar, "https://cdn.example.com/finder-avatar.jpg");
});

test("historical finder accounts can receive avatars from account resolution", () => {
  const [account] = mergeResolvedFinderAccounts([
    { accountId: "sec-history", nickname: "历史找人结果" }
  ], [
    { index: 0, account: { secId: "sec-history", avatarUrl: "https://cdn.example.com/history-avatar.jpg" } }
  ]);

  assert.equal(account.avatar, "https://cdn.example.com/history-avatar.jpg");
  assert.equal(account.identity.avatarUrl, "https://cdn.example.com/history-avatar.jpg");
});

test("browser avatar selection skips HEIC and uses a renderable fallback", () => {
  const avatar = personAvatarUrl({
    avatar_larger: { url_list: ["https://cdn.example.com/avatar.heic"] },
    avatar_thumb: { url_list: ["https://cdn.example.com/avatar.jpeg"] }
  });

  assert.equal(avatar, "https://cdn.example.com/avatar.jpeg");
});

test("historical people can resolve avatars from a Douyin sec uid", () => {
  assert.deepEqual(personAvatarHydrationReference({
    name: "历史用户",
    secUid: "MS4wLjABAAAAexample"
  }), {
    accountName: "历史用户",
    profileUrl: "https://www.douyin.com/user/MS4wLjABAAAAexample"
  });
});

test("every people result surface joins the shared avatar hydration queue", () => {
  const listStart = prospectCenterSource.indexOf("function renderListContent");
  const discoveredStart = prospectCenterSource.indexOf("function renderDiscoveredListContent");
  const outreachStart = prospectCenterSource.indexOf("function renderOutreachResultDetail");
  const researchStart = prospectCenterSource.indexOf("function renderUserResearchResultDetail");
  assert.match(prospectCenterSource.slice(listStart, discoveredStart), /queuePersonAvatarHydration\(items\)/);
  assert.match(prospectCenterSource.slice(discoveredStart, outreachStart), /queuePersonAvatarHydration\(items\)/);
  assert.match(prospectCenterSource.slice(outreachStart, researchStart), /queuePersonAvatarHydration\(outreachItems\)/);
  assert.match(prospectCenterSource.slice(researchStart), /queuePersonAvatarHydration\(items\)/);
});

test("standalone discovery presents source-specific actions", () => {
  assert.match(prospectCenterSource, /initialSurface === "people" \? "发现" : "全部成果"/);
  assert.match(prospectCenterSource, /state\.surface === "people" && !standaloneDiscovery && state\.resultType !== "发现"/);
  assert.match(prospectCenterSource, /if \(standaloneDiscovery \|\| state\.resultType === "发现"\)/);
  assert.match(prospectCenterSource, /我的账号互动用户/);
  assert.match(prospectCenterSource, /公域找人/);
  assert.match(prospectCenterSource, /按来源抖音账号筛选，可分析、可触达/);
  assert.match(prospectCenterSource, /按找人任务筛选，仅查看与分析/);
  assert.match(prospectCenterSource, /来源抖音账号 · 已授权/);
  assert.match(prospectCenterSource, /已授权抖音账号 · 评论、直播和账号互动/);
  assert.match(prospectCenterSource, /未命名抖音账号/);
  assert.match(prospectCenterSource, /分析这个账号/);
  assert.match(prospectCenterSource, /openDiscoveredOutreach/);
  assert.match(prospectCenterSource, /item\.origin === "own"/);
});

test("standalone discovery keeps its two panels aligned and scrolls the result list internally", () => {
  assert.match(prospectCenterSource, /\.sb-prospect-page--standalone-discovery\{display:flex;overflow:hidden\}/);
  assert.match(prospectCenterSource, /\.sb-prospect-page--standalone-discovery \.sb-prospect-workspace\{align-items:stretch;flex:1;min-height:0\}/);
  assert.match(prospectCenterSource, /\.sb-discovery-list-content\{display:flex;flex:1;flex-direction:column;min-height:0;overflow:hidden\}/);
  assert.match(prospectCenterSource, /\.sb-discovery-list-content \.sb-prospect-table-wrap\{flex:1;min-height:0;overflow:auto\}/);
  assert.match(prospectCenterSource, /const content = el\("div", "sb-discovery-list-content"\)/);
});

test("contactable prospects route to comprehensive analysis while public discovery stays account analysis", () => {
  const detail = prospectCenterSource.slice(prospectCenterSource.indexOf("function renderDetail"));
  assert.match(detail, /isContactableRecord\(item\) \? "综合分析" : "分析这个账号"/);
  assert.match(detail, /openIntentAnalysisFromProspects\(\[item\], sourceRun \|\| \{\}\)/);

  const discovered = prospectCenterSource.slice(
    prospectCenterSource.indexOf("function renderDiscoveredDetail"),
    prospectCenterSource.indexOf("function renderDetail")
  );
  assert.match(discovered, /分析这个账号/);
  assert.doesNotMatch(discovered, /综合分析/);
});

test("discovered people only enables batch analysis after accounts are selected", () => {
  const start = prospectCenterSource.indexOf("function renderDiscoveredListContent");
  const end = prospectCenterSource.indexOf("function openDiscoveredBatchAnalysis", start);
  const list = prospectCenterSource.slice(start, end);

  assert.match(list, /分析已选账号/);
  assert.match(list, /analyze\.disabled = !selectedItems\.length/);
  assert.match(list, /已选 \$\{selectedItems\.length\} 位/);
  assert.doesNotMatch(prospectCenterSource, /function renderDiscoveryContext/);
  assert.doesNotMatch(prospectCenterSource, /分析这批账号/);
});

test("discovery export action stays on one line in the result header", () => {
  assert.match(prospectCenterSource, /\.sb-discovery-results-actions \.sb-prospect-button\{min-width:100px;flex:none;white-space:nowrap\}/);
});

test("standalone discovery selected cards do not use a left inset accent line", () => {
  const taskRule = prospectCenterSource.match(/\.sb-prospect-page--standalone-discovery \.sb-discovery-task\.is-active\{[^}]+\}/)?.[0];
  const sourceRule = prospectCenterSource.match(/\.sb-discovery-source\.is-active\{[^}]+\}/)?.[0];

  assert.ok(taskRule);
  assert.ok(sourceRule);
  assert.doesNotMatch(taskRule, /inset 3px 0/);
  assert.doesNotMatch(sourceRule, /inset 3px 0/);
  assert.match(taskRule, /background:#f7faff/);
  assert.match(sourceRule, /background:#f7faff/);
});

test("standalone discovery disabled primary actions keep readable text", () => {
  assert.match(
    prospectCenterSource,
    /\.sb-prospect-page--standalone-discovery \.sb-prospect-bulk button\.primary\{border-color:#20252b;color:#fff;background:#20252b\}/
  );
  assert.match(
    prospectCenterSource,
    /\.sb-prospect-page--standalone-discovery \.sb-prospect-bulk button\.primary:disabled\{border-color:#20252b;color:#fff;background:#20252b;opacity:1\}/
  );
});

test("does not turn missing finder metrics into zeroes", () => {
  const account = normalizeDouyinFinderAccount({
    accountId: "sec-empty",
    nickname: "待核验账号",
    profile: { follower_count: null, aweme_count: "", total_favorited: null }
  });

  assert.equal(account.followers, null);
  assert.equal(account.awemeCount, null);
  assert.equal(account.likes, null);
});

test("finder growth evidence remains visible and missing trends stay pending", () => {
  const account = normalizeDouyinFinderAccount({
    accountId: "sec-growth",
    nickname: "AI 科普账号",
    status: "PARTIAL",
    tier: "待补数据",
    matched: false,
    growth: { windowDays: 7, newFollowers: null, currentFollowers: 12000 }
  });

  assert.equal(account.finderState.status, "待核验");
  assert.equal(account.growth.windowDays, 7);
  assert.equal(account.growth.currentFollowers, 12000);
});

test("finder accounts can be handed to private outreach without changing finder ownership", () => {
  const target = finderAccountToOutreach({
    accountId: "sec-1",
    nickname: "候选账号",
    profileUrl: "https://www.douyin.com/user/example",
    identity: { sec_uid: "sec-1" }
  });

  assert.deepEqual(target, {
    id: "sec-1",
    name: "候选账号",
    profileUrl: "https://www.douyin.com/user/example",
    secId: "sec-1",
    secUid: "sec-1"
  });
});

test("result funnel counts discovered people, active prospects, successful outreach, and converted customers", () => {
  const counts = resultFunnelCounts({
    records: [
      { id: "person-1", conversionStatus: "未转化", outreachStatus: "sent" },
      { id: "person-2", conversionStatus: "已转化" }
    ],
    runs: [{
      taskId: "finder-1",
      resultType: "抖音找人",
      items: [
        { accountId: "person-1", nickname: "重复账号", reasons: ["公开主页命中目标行业"] },
        { accountId: "person-3", nickname: "新账号", reasons: ["近期作品命中目标关键词"] }
      ]
    }, {
      taskId: "outreach-1",
      resultType: "触达记录",
      items: [
        { accountId: "person-1", status: "delivered" },
        { accountId: "person-4", status: "failed" },
        { accountId: "person-5", status: "unknown" }
      ]
    }]
  });

  assert.deepEqual(counts, { discovered: 4, prospects: 1, touched: 1, converted: 1 });
});

test("result funnel uses successful outreach counts when the provider returns aggregates only", () => {
  const counts = resultFunnelCounts({
    runs: [{ resultType: "触达记录", counts: { sent: 2, failed: 1, unknown: 1 } }]
  });

  assert.equal(counts.touched, 2);
});

test("result funnel does not count an accepted outreach without a final delivery receipt", () => {
  const counts = resultFunnelCounts({
    records: [{ id: "pending-touch", outreachStatus: "accepted" }],
    runs: [{
      taskId: "pending-run",
      resultType: "触达记录",
      items: [{ id: "pending-touch", state: "accepted" }]
    }]
  });

  assert.equal(counts.touched, 0);
});

test("result funnel counts every analyzed user separately from qualified prospects", () => {
  const counts = resultFunnelCounts({
    records: [
      { id: "prospect-1", uniqueId: "buyer-1", status: "待触达" },
      { id: "prospect-2", uniqueId: "buyer-2", status: "待触达" }
    ],
    runs: [{
      taskId: "comment-analysis-1",
      resultType: "评论筛选",
      counts: { comments: 4, matched: 2, unmatched: 2 },
      items: [
        { commentId: "comment-1", uniqueId: "buyer-1", nickname: "用户一" },
        { commentId: "comment-2", uniqueId: "buyer-2", nickname: "用户二" },
        { commentId: "comment-3", uniqueId: "buyer-3", nickname: "用户三" },
        { commentId: "comment-4", uniqueId: "buyer-4", nickname: "用户四" }
      ]
    }]
  });

  assert.equal(counts.discovered, 4);
  assert.equal(counts.prospects, 2);
});

test("result funnel prefers a complete analyzed comment population over qualified items", () => {
  const counts = resultFunnelCounts({
    records: [{ id: "prospect-1", uniqueId: "buyer-1", status: "待触达" }],
    runs: [{
      taskId: "legacy-analysis-1",
      resultType: "潜客",
      items: [{ id: "buyer-1", uniqueId: "buyer-1" }],
      resultSnapshot: {
        comments: [
          { commentId: "comment-1", uniqueId: "buyer-1" },
          { commentId: "comment-2", uniqueId: "buyer-2" },
          { commentId: "comment-3", uniqueId: "buyer-3" }
        ]
      }
    }]
  });

  assert.equal(counts.discovered, 3);
  assert.equal(counts.prospects, 1);
});

test("discovered user list preserves analyzed users outside the prospect pool", () => {
  const items = discoveredUserItems({
    records: [{
      id: "lead-1",
      uniqueId: "buyer-1",
      name: "买家一",
      handle: "buyer-1",
      score: 88,
      status: "待触达",
      reason: "明确询价",
      source: { videoTitle: "商品体验" }
    }],
    runs: [{
      taskId: "run-1",
      resultType: "评论筛选",
      items: [
        { commentId: "c-1", uniqueId: "buyer-1", nickname: "买家一", text: "想问价格", filter: { matched: true }, source: { videoTitle: "商品体验" } },
        { commentId: "c-2", uniqueId: "reader-2", nickname: "普通用户", text: "支持一下", filter: { matched: false }, source: { videoTitle: "商品体验" } }
      ]
    }]
  });

  assert.equal(items.length, 2);
  assert.equal(items.find((item) => item.identity === "buyer-1").status, "待触达");
  assert.equal(items.find((item) => item.identity === "reader-2").status, "未进入潜客池");
});

test("discovered finder users preserve public account metrics and stay analysis-only", () => {
  const items = discoveredUserItems({
    runs: [{
      taskId: "finder-metrics-1",
      resultType: "抖音找人",
      title: "找家居账号",
      generatedAt: "2026-09-08T08:00:00.000Z",
      items: [{
        accountId: "public-1",
        nickname: "公域账号",
        handle: "public_home",
        profileUrl: "https://www.douyin.com/user/public-1",
        followers: 12000,
        awemeCount: 48,
        likes: 320000,
        location: "上海",
        isLive: true,
        growth: { windowDays: 7, newFollowers: 380 },
        score: 86,
        matched: true,
        reasons: ["粉丝规模符合条件"]
      }]
    }]
  });

  assert.equal(items.length, 1);
  assert.equal(items[0].status, "仅用于分析");
  assert.equal(items[0].followers, 12000);
  assert.equal(items[0].awemeCount, 48);
  assert.equal(items[0].likes, 320000);
  assert.equal(items[0].location, "上海");
  assert.equal(items[0].isLive, true);
  assert.deepEqual(items[0].growth, { windowDays: 7, newFollowers: 380, currentFollowers: null, newLikes: null, newItems: null });
  assert.equal(items[0].taskId, "finder-metrics-1");
});

test("groups public finder results by user-facing purpose and preserves multi-task context", () => {
  const input = {
    records: [],
    runs: [
      {
        taskId: "finder-home-shanghai",
        resultType: "抖音找人",
        title: "上海家居账号 · 找人结果",
        summary: "已找到上海家居账号。",
        generatedAt: "2026-09-08T08:00:00.000Z",
        inputs: {
          goal: "找上海的家居账号",
          choices: {
            finder: {
              selected: ["creators"],
              industry: "家居家装",
              region: "上海",
              followers: "1 万以上"
            }
          }
        },
        items: [{ accountId: "shared-account", nickname: "共享账号", reasons: ["主页命中家居改造"] }]
      },
      {
        taskId: "finder-growth",
        resultType: "抖音找人",
        title: "找近期涨粉的家居账号 · 找人结果",
        generatedAt: "2026-09-08T09:00:00.000Z",
        inputs: {
          goal: "找近期涨粉的家居账号",
          choices: {
            finder: {
              selected: ["growing"],
              industry: "家居家装"
            }
          }
        },
        growthIntent: { windowDays: 7 },
        items: [
          { accountId: "shared-account", nickname: "共享账号", reasons: ["近7天新增粉丝 120"] },
          { accountId: "growth-2", nickname: "增长账号", reasons: ["近7天新增粉丝 80"] }
        ]
      }
    ]
  };

  const groups = discoveryTaskGroups(input);
  const firstGroup = groups.find((group) => group.id === "finder-home-shanghai");
  const secondGroup = groups.find((group) => group.id === "finder-growth");
  const shared = discoveredUserItems(input).find((item) => item.identity === "shared-account");

  assert.equal(groups.length, 2);
  assert.equal(firstGroup.title, "找上海的家居账号");
  assert.equal(firstGroup.profile, "人群：合作博主 · 行业：家居家装 · 地区：上海 · 粉丝：1 万以上");
  assert.equal(firstGroup.count, 1);
  assert.equal(secondGroup.title, "找近期涨粉的家居账号");
  assert.equal(secondGroup.profile, "人群：涨粉快的账号 · 行业：家居家装 · 近 7 天增长");
  assert.equal(secondGroup.count, 2);
  assert.deepEqual(shared.sourceTasks.map((task) => task.taskId), ["finder-home-shanghai", "finder-growth"]);
  assert.equal(firstGroup.items[0].identity, "shared-account");
  assert.deepEqual(secondGroup.items.map((item) => item.identity), ["shared-account", "growth-2"]);
});

test("keeps unscoped historical analysis out of public finder task filters", () => {
  const input = {
    records: [],
    runs: [{ taskId: "comment-analysis-1", resultType: "评论筛选", items: [{ commentId: "comment-1", nickname: "评论用户", text: "想了解" }] }]
  };
  const groups = discoveryTaskGroups(input);
  const sources = discoverySourceGroups(input);

  assert.equal(groups.length, 0);
  assert.equal(sources.otherItems.length, 1);
  assert.equal(sources.otherItems[0].identity, "评论用户");
});

test("people views discard filters inherited from another lifecycle stage", () => {
  assert.equal(normalizePeopleFilter("潜客", "已转化"), "全部");
  assert.equal(normalizePeopleFilter("线索", "待触达"), "全部");
  assert.equal(normalizePeopleFilter("潜客", "高意向"), "全部");
  assert.equal(normalizePeopleFilter("潜客", "未回复"), "全部");
  assert.equal(normalizePeopleFilter("潜客", "已触达"), "已触达");
  assert.equal(normalizePeopleFilter("潜客", "待确认触达"), "待确认触达");
  assert.equal(normalizePeopleFilter("线索", "已留资"), "已留资");
});
