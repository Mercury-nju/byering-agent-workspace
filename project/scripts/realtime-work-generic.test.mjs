import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const realtimeWork = await import("../src/salebuddy/ui/realtime-work.js");

import {
  DOUYIN_ACQUISITION_ACTIVE_AGENT_IDS,
  DOUYIN_ACQUISITION_COMPLETE_AGENT_ID,
  DOUYIN_ACQUISITION_SINGLE_CAPABILITY_AGENT_IDS
} from "../src/salebuddy/agents/marketplace.js";

import {
  accountIdentityFor,
  acquisitionDetailFactEntries,
  clampHorizontalScrollOffset,
  douyinCloudViewerUrlFor,
  normalizeRealtimeOutputContext,
  realtimeWorkSurfaceFor
} from "../src/salebuddy/ui/realtime-work.js";

const realtimeWorkSource = fs.readFileSync(new URL("../src/salebuddy/ui/realtime-work.js", import.meta.url), "utf8");
const grokAvatarSource = fs.readFileSync(new URL("../src/salebuddy/ui/grok-bot-avatar.js", import.meta.url), "utf8");

test("douyin realtime work points to the persistent local cloud viewer", () => {
  const viewerUrl = new URL(douyinCloudViewerUrlFor("mkt-cold-writer", {
    origin: "http://127.0.0.1:8888",
    backend: "http://127.0.0.1:6681"
  }));

  assert.equal(viewerUrl.pathname, "/cloud-view.html");
  assert.equal(viewerUrl.searchParams.get("embedded"), "1");
  assert.equal(viewerUrl.searchParams.get("agentId"), "mkt-cold-writer");
  assert.equal(viewerUrl.searchParams.get("backend"), "http://127.0.0.1:6681");
});

test("generic realtime output context tolerates partial live-work metadata", () => {
  assert.deepEqual(normalizeRealtimeOutputContext({
    source: "抖音公开主页 · 作品评论",
    activity: "读取作品和评论回复"
  }), {
    prospect: "当前任务",
    source: "抖音公开主页 · 作品评论",
    score: "--",
    activity: "读取作品和评论回复"
  });
});

test("generic realtime output context normalizes invalid values", () => {
  assert.deepEqual(normalizeRealtimeOutputContext({ prospect: null, source: 42, score: 0, activity: "" }), {
    prospect: "当前任务",
    source: "实时工作流",
    score: "0",
    activity: "等待数据"
  });
});

test("account analysis uses a background task surface instead of a cloud computer", () => {
  assert.equal(realtimeWorkSurfaceFor("mkt-research-expert", { metadata: { source: "douyin-mcp" } }), "background");
  assert.equal(realtimeWorkSurfaceFor("mkt-dm-inbox"), "cloud");
  assert.equal(realtimeWorkSurfaceFor("mkt-douyin-finder"), "generic");
  assert.equal(realtimeWorkSurfaceFor("mkt-find-people"), "cloud");
});

test("cloud login identity recognizes the provider sec_uid and user_id fields", () => {
  const identity = accountIdentityFor({
    nickname: "一以万真",
    sec_uid: "MS4wLjABAAAA-real-sec-uid",
    user_id: "58262205543"
  });
  assert.equal(identity.accountName, "一以万真");
  assert.equal(identity.uid, "58262205543");
  assert.equal(identity.secId, "MS4wLjABAAAA-real-sec-uid");
});

test("style preview is explicit and seeds the acquisition work surface", () => {
  assert.equal(realtimeWork.realtimeWorkPreviewMode("?page=realtime-work&preview=style"), "style");
  assert.equal(realtimeWork.realtimeWorkPreviewMode("?page=realtime-work", { hostname: "127.0.0.1" }), "");
  assert.equal(realtimeWork.realtimeWorkPreviewMode("?page=realtime-work", { hostname: "demo.example.com" }), "");
  assert.match(realtimeWorkSource, /stylePreview/);
  assert.match(realtimeWorkSource, /previewWork/);
  assert.match(realtimeWorkSource, /selectedPreviewWorks/);
  assert.match(realtimeWorkSource, /state\.stylePreview\s*&&\s*selectedPreviewWorks\.length\s*\?\s*selectedPreviewWorks/);
  assert.match(realtimeWorkSource, /if\s*\(!state\.stylePreview\)\s*\{\s*void refreshAuthorizedAccounts\(\)/s);

  const work = realtimeWork.createRealtimeMockAcquisitionWork({ id: "preview-account", name: "一以万真" });
  const rows = realtimeWork.commentAcquisitionOutreachRows(work);
  assert.equal(rows.length, 6);
  assert.equal(rows.filter((row) => row.outreachState === "pending").length, 2);
  assert.equal(rows.filter((row) => row.outreachState === "sent").length, 4);
  const energyQuestion = rows.find((row) => row.id === "mock-lead-suzhou-chen");
  assert.equal(realtimeWork.commentAcquisitionDetailModel(energyQuestion).evidence.quote, "这是电还是油？");
});

test("realtime fallback roster only uses active product agents", () => {
  const start = realtimeWorkSource.indexOf("function createAgentsForMatch");
  const end = realtimeWorkSource.indexOf("const CSS =", start);
  assert.ok(start >= 0 && end > start);
  const fallback = realtimeWorkSource.slice(start, end);
  assert.match(fallback, /DOUYIN_ACQUISITION_ACTIVE_AGENT_IDS\.map/);
  assert.doesNotMatch(fallback, /BASE_AGENTS|hasCloudComputer|Strategy Agent|Browser Agent|Search Agent|App Agent/);
  assert.match(realtimeWorkSource, /\? "mkt-comment-acquisition"/);
});

test("active product Agent empty states use their own work model instead of old collaboration roles", () => {
  const start = realtimeWorkSource.indexOf("function activeWorkUnitConfig");
  const end = realtimeWorkSource.indexOf("function renderWorkUnitPanel", start);
  assert.ok(start >= 0 && end > start);
  const fallback = realtimeWorkSource.slice(start, end);
  assert.match(fallback, /ACTIVE_AGENT_REALTIME_DEFAULTS/);
  assert.match(realtimeWorkSource, /const config = activeWorkUnitConfig\(selected\)/);
});

test("style preview provides isolated mock accounts with different domain data", () => {
  const accounts = realtimeWork.createRealtimeMockPreviewAccounts();
  const works = realtimeWork.createRealtimeMockPreviewWorks(accounts);

  assert.equal(accounts.length, 3);
  assert.ok(accounts.every((account) => account.mock === true));
  assert.deepEqual(accounts.map((account) => account.mockScenario), ["automotive", "education", "home"]);
  assert.ok(accounts.every((account) => account.agentIds.length === DOUYIN_ACQUISITION_ACTIVE_AGENT_IDS.length));
  assert.ok(accounts.every((account) => account.agentIds[0] === DOUYIN_ACQUISITION_COMPLETE_AGENT_ID));
  assert.ok(accounts.every((account) => account.agents === DOUYIN_ACQUISITION_ACTIVE_AGENT_IDS.length));
  assert.equal(new Set(accounts.map((account) => account.id)).size, accounts.length);
  assert.equal(works.length, accounts.length * DOUYIN_ACQUISITION_ACTIVE_AGENT_IDS.length);
  assert.ok(works.every((work) => work.metadata?.mock === true));
  assert.deepEqual(new Set(works.map((work) => work.agentType)), new Set(DOUYIN_ACQUISITION_ACTIVE_AGENT_IDS));
  for (const account of accounts) {
    const accountWorks = works.filter((work) => work.metadata?.accountId === account.id);
    assert.equal(accountWorks.length, DOUYIN_ACQUISITION_ACTIVE_AGENT_IDS.length);
    assert.deepEqual(accountWorks.map((work) => work.agentType), DOUYIN_ACQUISITION_ACTIVE_AGENT_IDS);
  }
  assert.deepEqual(new Set(works.map((work) => work.metadata?.mockScenario)), new Set(["automotive", "education", "home"]));
  assert.equal(new Set(works.map((work) => work.metadata?.mockLiveRoomImage)).size, 3);

  const managerWorks = works.filter((work) => work.agentType === "mkt-comment-acquisition");
  const sourceSets = managerWorks.map((work) => new Set(
    realtimeWork.commentAcquisitionOutreachRows(work).map((person) => person.sourceLabel)
  ));
  assert.ok(sourceSets.every((sources) => sources.has("评论区") && sources.has("直播间") && sources.has("互动")));

  const educationPeople = realtimeWork.commentAcquisitionRealtimeView(managerWorks.find((work) => work.metadata?.mockScenario === "education")).people;
  const homePeople = realtimeWork.commentAcquisitionRealtimeView(managerWorks.find((work) => work.metadata?.mockScenario === "home")).people;
  assert.match(educationPeople[0].profileEvidence.dynamicTraits[0]?.[1] || "", /中考/);
  assert.match(homePeople[0].profileEvidence.dynamicTraits[0]?.[1] || "", /89㎡/);
  assert.notEqual(educationPeople[0].quote, homePeople[0].quote);
});

test("mock accounts without the complete acquisition Agent can run selected single capabilities", () => {
  const account = {
    id: "mock-standalone-account",
    name: "独立能力账号",
    mockScenario: "automotive",
    agentIds: ["mkt-find-people", "mkt-intent-analyst"]
  };
  const works = realtimeWork.createRealtimeMockPreviewWorks([account]);

  assert.deepEqual(
    works.map((work) => work.agentType),
    DOUYIN_ACQUISITION_SINGLE_CAPABILITY_AGENT_IDS.slice(0, 2)
  );
});

test("specialist agents use the same worksite layouts for preview and real tasks", () => {
  const works = realtimeWork.createRealtimeMockPreviewWorks([{
    id: "mock-specialist-account",
    name: "独立能力账号",
    mockScenario: "automotive",
    agentIds: [...DOUYIN_ACQUISITION_SINGLE_CAPABILITY_AGENT_IDS]
  }]);
  const specialistLayouts = Object.fromEntries([
    "mkt-find-people",
    "mkt-intent-analyst",
    "mkt-cold-writer",
    "mkt-dm-inbox"
  ].map((agentType) => {
    const work = works.find((item) => item.agentType === agentType);
    return [agentType, realtimeWork.realtimeSpecialistWorksiteFor(agentType, work)];
  }));

  assert.deepEqual(specialistLayouts, {
    "mkt-find-people": "finder",
    "mkt-intent-analyst": "analysis",
    "mkt-cold-writer": "outreach",
    "mkt-dm-inbox": "conversion"
  });
  assert.equal(
    realtimeWork.realtimeSpecialistWorksiteFor("mkt-intent-analyst", {
      metadata: { taskId: "real-intent-analysis-1", taskRunId: "real-intent-analysis-run-1" }
    }),
    "analysis"
  );
  assert.equal(realtimeWork.realtimeSpecialistWorksiteFor("mkt-comment-acquisition", works[0]), null);
  assert.match(realtimeWorkSource, /const specialistWorksite = realtimeSpecialistWorksiteFor\(selected\.id, selected\.liveWork\)/);
  assert.match(realtimeWorkSource, /specialistWorksite === "finder"/);
  assert.match(realtimeWorkSource, /specialistWorksite === "analysis"/);
  assert.match(realtimeWorkSource, /specialistWorksite === "outreach"/);
  assert.match(realtimeWorkSource, /specialistWorksite === "conversion"/);
  assert.match(realtimeWorkSource, /specialistWorksite === "outreach"\) ensureCloudReplay\(selected\.id\)/);
  assert.match(realtimeWorkSource, /else if \(specialistWorksite === "outreach"\)\s*\{[\s\S]*?renderOutreachSpecialistWorksite\(selected, state, refreshRealtimeView\)/);
});

test("remaining marketplace Agents enter dedicated realtime worksites", () => {
  const taskWork = {
    metadata: {
      taskId: "task-remaining-agent",
      taskRunId: "run-remaining-agent"
    }
  };

  assert.equal(realtimeWork.isRealtimeWorkAgent("mkt-live-danmaku-analysis"), true);
  assert.equal(realtimeWork.isRealtimeWorkAgent("mkt-live-danmaku-outreach"), true);
  assert.equal(realtimeWork.isRealtimeWorkAgent("mkt-viral-work-analysis"), true);
  assert.equal(realtimeWork.realtimeSpecialistWorksiteFor("mkt-live-danmaku-analysis", taskWork), "live-analysis");
  assert.equal(realtimeWork.realtimeSpecialistWorksiteFor("mkt-live-danmaku-outreach", taskWork), "live-outreach");
  assert.equal(realtimeWork.realtimeSpecialistWorksiteFor("mkt-viral-work-analysis", taskWork), "viral-analysis");

  const works = [{
    agentType: "mkt-viral-work-analysis",
    state: "working",
    task: "分析公开作品",
    progress: 42,
    metadata: { taskId: "viral-task", taskRunId: "viral-run", sourceScope: "public_work_link" }
  }];
  assert.equal(realtimeWork.visibleRealtimeWorks(works, {
    selectedAgentId: "mkt-viral-work-analysis",
    taskId: "viral-task",
    taskRunId: "viral-run"
  }).length, 1);

  assert.match(realtimeWorkSource, /specialistWorksite === "live-analysis"/);
  assert.match(realtimeWorkSource, /specialistWorksite === "live-outreach"/);
  assert.match(realtimeWorkSource, /specialistWorksite === "viral-analysis"/);
  assert.match(realtimeWorkSource, /renderLiveDanmakuAnalysisWorksite/);
  assert.match(realtimeWorkSource, /renderLiveDanmakuOutreachWorksite/);
  assert.match(realtimeWorkSource, /renderViralWorkAnalysisWorksite/);
});

test("remaining realtime views preserve provider snapshots without inventing work", () => {
  const liveView = realtimeWork.liveDanmakuAnalysisRealtimeView({
    metadata: {
      acquisitionSnapshot: {
        resultSnapshot: {
          danmakuAnalysis: {
            goal: "识别正在咨询价格的用户",
            counts: { danmaku: 12, questions: 4, highIntent: 2 },
            users: [{
              userId: "live-user-1",
              nickname: "客户甲",
              comment: "现在下单有什么优惠？",
              score: 91,
              intentTier: "high",
              evidence: [{ quote: "现在下单有什么优惠？" }]
            }],
            topics: [{ label: "价格", count: 4, examples: ["现在下单有什么优惠？"] }]
          }
        },
        lastScan: { sources: { live: { state: "connected" } } }
      }
    }
  });
  assert.equal(liveView.people[0].nickname, "客户甲");
  assert.equal(liveView.people[0].quote, "现在下单有什么优惠？");
  assert.equal(liveView.people[0].intentTier, "high");
  assert.equal(liveView.counts.danmaku, 12);
  assert.equal(liveView.topics[0].label, "价格");
  assert.equal(liveView.liveSourceState, "connected");

  const viralView = realtimeWork.viralWorkAnalysisRealtimeView({
    state: "done",
    progress: 100,
    artifact: "爆款作品分析报告.html",
    metadata: {
      status: "completed",
      sourceUrl: "https://www.douyin.com/video/123",
      goal: "拆解开头抓手",
      resultSnapshot: {
        analysisKind: "viral_work",
        title: "作品分析报告",
        summary: "开头冲突明确，评论集中在价格和使用场景。",
        work: { title: "某条作品", author: "创作者" },
        metrics: { views: 12000, likes: 800 }
      }
    }
  });
  assert.equal(viralView.hasResult, true);
  assert.equal(viralView.sourceUrl, "https://www.douyin.com/video/123");
  assert.equal(viralView.goal, "拆解开头抓手");
  assert.equal(viralView.metrics.views, 12000);
  assert.equal(viralView.steps.at(-1).status, "completed");
});

test("outreach specialist separates queued and completed prospects from the successful-work replay", () => {
  const works = realtimeWork.createRealtimeMockPreviewWorks([{
    id: "mock-outreach-account",
    name: "独立触达账号",
    mockScenario: "automotive",
    agentIds: ["mkt-cold-writer"]
  }]);
  const outreachWork = works.find((work) => work.agentType === "mkt-cold-writer");
  const rows = realtimeWork.commentAcquisitionOutreachRows(outreachWork);

  assert.equal(rows.filter((person) => person.outreachState === "pending").length, 2);
  assert.equal(rows.filter((person) => person.outreachState === "sent").length, 4);
  assert.match(realtimeWorkSource, /function renderOutreachSpecialistWorksite\(/);
  assert.match(realtimeWorkSource, /准备触达/);
  assert.match(realtimeWorkSource, /已触达/);
  assert.match(realtimeWorkSource, /最近成功触达回放/);
  assert.match(realtimeWorkSource, /最近成功工作的 15 秒录屏/);

  const outreachStart = realtimeWorkSource.indexOf("function renderOutreachSpecialistWorksite");
  const outreachEnd = realtimeWorkSource.indexOf("function acquisitionLiveRoomVideoUrl", outreachStart);
  const outreachSource = realtimeWorkSource.slice(outreachStart, outreachEnd);
  assert.doesNotMatch(outreachSource, /douyinCloudViewerUrlFor|<iframe|createElement\("iframe"/);
});

test("finder worksite follows the manager search flow without crossing into analysis or outreach", () => {
  const works = realtimeWork.createRealtimeMockPreviewWorks([{
    id: "mock-finder-account",
    name: "独立找客账号",
    mockScenario: "automotive",
    agentIds: ["mkt-find-people"]
  }]);
  const finderWork = works.find((work) => work.agentType === "mkt-find-people");
  const people = realtimeWork.commentAcquisitionRealtimeView(finderWork).people;

  assert.ok(people.length >= 3);
  assert.ok(people.some((person) => person.sourceLabel === "直播间"));
  assert.ok(people.some((person) => person.sourceLabel === "评论区"));
  assert.ok(people.some((person) => person.sourceLabel === "互动"));

  assert.match(realtimeWorkSource, /function renderMockFinderLiveRoomPanel\(/);
  assert.match(realtimeWorkSource, /renderCommentAcquisitionLiveRoomStage\(null, null, work\)/);
  assert.match(realtimeWorkSource, /function renderMockFinderQueuePanel\(/);
  assert.match(realtimeWorkSource, /function renderMockFinderDetailPanel\(/);
  assert.doesNotMatch(realtimeWorkSource, /function renderMockFinderSourcePanel\(/);
  const finderDetailStart = realtimeWorkSource.indexOf("function renderMockFinderDetailPanel");
  const finderDetailEnd = realtimeWorkSource.indexOf("function renderMockAnalysisProspectsPanel", finderDetailStart);
  const finderDetailSource = realtimeWorkSource.slice(finderDetailStart, finderDetailEnd);
  assert.doesNotMatch(finderDetailSource, /commentAcquisitionDetailModel|意向|分析结论|私信触达/);
});

test("analysis worksite turns completed analysis into an actionable prospect list", () => {
  const works = realtimeWork.createRealtimeMockPreviewWorks([{
    id: "mock-analysis-account",
    name: "独立分析账号",
    mockScenario: "automotive",
    agentIds: ["mkt-intent-analyst"]
  }]);
  const analysisWork = works.find((work) => work.agentType === "mkt-intent-analyst");
  const people = realtimeWork.commentAcquisitionRealtimeView(analysisWork).people;
  const qualified = realtimeWork.analysisQualifiedProspects(people);

  assert.ok(people.length >= 3);
  assert.ok(qualified.length >= 3);
  assert.ok(qualified.every((person) => ["high", "medium"].includes(person.analysisTier)));
  assert.equal(qualified.some((person) => person.intentTier === "low"), false);
  assert.match(realtimeWorkSource, /function renderMockAnalysisSourcePanel\(/);
  assert.match(realtimeWorkSource, /function renderMockAnalysisQueuePanel\(/);
  assert.match(realtimeWorkSource, /function renderMockAnalysisProspectsPanel\(/);
  assert.match(realtimeWorkSource, /已判断的潜客/);
  assert.match(realtimeWorkSource, /高意向和可跟进对象会进入这里/);
  assert.match(realtimeWorkSource, /function renderMockAnalysisWorksite\([\s\S]*?sourcePanel:[\s\S]*?queuePanel:[\s\S]*?prospectPanel:/);
  assert.match(realtimeWorkSource, /const analysisWork = specialistWorksite === "analysis"/);
  assert.match(realtimeWorkSource, /is-analysis-work/);
  const analysisWorksiteStart = realtimeWorkSource.indexOf("function renderMockAnalysisWorksite");
  const analysisWorksiteEnd = realtimeWorkSource.indexOf("function loadAcquisitionReceptionConversations", analysisWorksiteStart);
  const analysisWorksiteSource = realtimeWorkSource.slice(analysisWorksiteStart, analysisWorksiteEnd);
  assert.doesNotMatch(analysisWorksiteSource, /sb-rw-acquisition-conversion-workbench/);
  assert.doesNotMatch(analysisWorksiteSource, /分析结论/);
});

test("analysis worksite reads qualified prospects from a real task result snapshot", () => {
  const work = {
    metadata: {
      taskId: "real-intent-analysis-2",
      resultSnapshot: {
        counts: { candidates: 2, qualified: 1, high: 1, medium: 0 },
        leads: [
          { leadId: "qualified-user", nickname: "真实高意向用户", score: 91, tier: "high", text: "想了解近期价格", source: { type: "comment", videoTitle: "车型讲解" } },
          { leadId: "unqualified-user", nickname: "暂不跟进用户", score: 32, tier: "low", text: "路过看看", source: { type: "comment" } }
        ]
      }
    }
  };
  const people = realtimeWork.commentAcquisitionRealtimeView(work).people;
  const qualified = realtimeWork.analysisQualifiedProspects(people);

  assert.equal(people.length, 2);
  assert.deepEqual(qualified.map((person) => person.nickname), ["真实高意向用户"]);
});

test("worksite keeps a fixed header slot when switching between manager and specialists", () => {
  assert.match(
    realtimeWorkSource,
    /\.sb-rw-workbar\{[^}]*min-height:46px[^}]*\}/
  );
  assert.match(
    realtimeWorkSource,
    /@media\(max-width:760px\)\{\.sb-rw-workbar\{min-height:68px\}\}/
  );
});

test("running Agent cards stay in one horizontally scrollable row", () => {
  const teamRailStart = realtimeWorkSource.indexOf(".sb-rw-ai-team{margin-bottom:18px}");
  const teamRailEnd = realtimeWorkSource.indexOf(".sb-rw-kpis{display:none}", teamRailStart);
  assert.ok(teamRailStart >= 0 && teamRailEnd > teamRailStart);
  const teamRail = realtimeWorkSource.slice(teamRailStart, teamRailEnd);

  assert.match(teamRail, /\.sb-rw-team\{display:flex;flex-wrap:nowrap;[^}]*overflow-x:auto[^}]*scroll-snap-type:x proximity/);
  assert.match(teamRail, /\.sb-rw-team-card\{flex:0 0 calc\(\(100% - 16px\) \/ 3\);[^}]*scroll-snap-align:start/);
  assert.match(teamRail, /\.sb-rw-ai-team \.sb-rw-team::-webkit-scrollbar\{height:4px\}/);
  assert.doesNotMatch(teamRail, /\.sb-rw-team\{display:grid/);
});

test("running Agent rail keeps its horizontal position across card refreshes", () => {
  assert.equal(clampHorizontalScrollOffset(640, 1600, 960), 640);
  assert.equal(clampHorizontalScrollOffset(900, 1600, 960), 640);
  assert.equal(clampHorizontalScrollOffset(-30, 1600, 960), 0);
  assert.equal(clampHorizontalScrollOffset(Number.NaN, 1600, 960), 0);

  assert.match(realtimeWorkSource, /function captureAgentRailScrollPositions\(root\)/);
  assert.match(realtimeWorkSource, /state\.runningAgentRailScrollLeft = runningRail\.scrollLeft/);
  assert.match(realtimeWorkSource, /function restoreAgentRailScroll\(team, scrollStateKey\)/);
  assert.match(realtimeWorkSource, /if \(scrollStateKey && team\.childElementCount > 0\) state\[scrollStateKey\] = team\.scrollLeft/);
  assert.match(realtimeWorkSource, /team\.addEventListener\("scroll", \(\) => \{\s*state\[scrollStateKey\] = team\.scrollLeft/s);
  assert.match(realtimeWorkSource, /updateAgentCards\(root, liveAgents, "\.sb-rw-team:not\(\.sb-rw-completed-team\)", "", "runningAgentRailScrollLeft"\)/);
  assert.match(realtimeWorkSource, /updateAgentCards\(root, activeAgents, "\.sb-rw-team:not\(\.sb-rw-completed-team\)", "", "runningAgentRailScrollLeft"\)/);
});

test("prospect detail exposes the factual processing fields and customer-facing flow", () => {
  const detail = realtimeWork.commentAcquisitionDetailModel({
    nickname: "上海周先生",
    sourceLabel: "直播间",
    workTitle: "评论E300",
    quote: "上海店现在有现车吗？",
    recentComment: "有现车吗？",
    profileEvidence: {
      activeBehavior: "近期关注 2 次汽车直播或短视频内容",
      followedBrands: "一汽丰田、广汽本田",
      vehiclePreference: "暂无发现明确的关注车型",
      cityRelation: "上海 · 同城潜客",
      storeConversation: "评论并未与门店发生过对话",
      purchaseHistory: "暂无发现历史询价行为"
    },
    reason: "近期关注过相关内容，且持续追问现车与到店安排。",
    intentTier: "high",
    intentSignals: ["询问现车", "追问价格"],
    outreachState: "sent",
    touchContent: "你好，我已根据你关注的捷途X70L整理了车型信息和当前优惠。",
    incomingContent: "方便的话发我一下试驾时间。",
    leadCapture: { phone: "13800001234" }
  });

  assert.deepEqual(detail.flow.map((step) => step.title), ["获取潜客", "判断意向", "私信触达", "留资结果"]);
  assert.equal(detail.evidence.recentComment, "有现车吗？");
  assert.equal(detail.evidence.profile.activeBehavior, "近期关注 2 次汽车直播或短视频内容");
  assert.equal(detail.evidence.profile.cityRelation, "上海 · 同城潜客");
  assert.equal(detail.judgment.recommendation, "建议优先进入私信触达");
  assert.ok(detail.outreach.basis.length >= 2);
  assert.match(realtimeWorkSource, /当前处理的潜客/);
  assert.match(realtimeWorkSource, /sb-rw-acquisition-detail-fact-list/);
  assert.match(realtimeWorkSource, /生成依据/);
  assert.match(realtimeWorkSource, /sb-rw-acquisition-detail-decision/);
});

test("prospect detail renders evidence-backed dynamic traits and hides unavailable fixed fields", () => {
  const detail = realtimeWork.commentAcquisitionDetailModel({
    nickname: "学生甲",
    sourceLabel: "作品评论",
    quote: "高中课程怎么安排？",
    profileEvidence: {
      activeBehavior: "近期查看 2 条高中学习规划作品",
      followedBrands: "暂无明确关注品牌",
      vehiclePreference: "暂无发现明确的关注车型",
      purchaseHistory: "暂无发现历史询价行为",
      dynamicTraits: [{
        label: "课程阶段",
        value: "准备升入高中",
        evidence: "主页简介写明即将升入高中，最近作品也围绕高中学习规划"
      }]
    },
    intentTier: "medium",
    reason: "评论明确询问课程安排。"
  });

  const entries = acquisitionDetailFactEntries(detail, "评论区");
  assert.deepEqual(entries, [
    ["获取作品评论", "高中课程怎么安排？"],
    ["最近评论", "高中课程怎么安排？"],
    ["活跃行为", "近期查看 2 条高中学习规划作品"],
    ["课程阶段", "准备升入高中"]
  ]);
  assert.equal(entries.some(([label]) => ["关注品牌", "偏好", "历史询价"].includes(label)), false);
  assert.equal(entries.some(([, value]) => /暂未|暂无|未发现/.test(value)), false);
});

test("prospect detail shows a received private reply in the outreach step", () => {
  const work = {
    metadata: {
      acquisitionSnapshot: {
        approvalQueue: [{
          candidateKey: "a",
          state: "sent",
          content: "你好，我可以帮你确认试驾安排。",
          lead: {
            id: "a",
            nickname: "客户甲",
            intent: { tier: "high", score: 88 },
            evidence: [{ type: "comment", quote: "想了解试驾时间" }],
            facts: {
              recentComment: { value: "想了解试驾时间", source: "douyin_interaction_event" }
            }
          },
          receipt: { state: "sent", sentAt: "2026-09-11T10:00:00Z" }
        }],
        replies: [{
          leadId: "a",
          nickname: "客户甲",
          content: "周日下午方便，怎么预约？",
          receivedAt: "2026-09-11T10:05:00Z"
        }]
      }
    }
  };
  const row = realtimeWork.commentAcquisitionQueueRows(work)[0];
  const detail = realtimeWork.commentAcquisitionDetailModel(row);
  assert.equal(row.incomingContent, "周日下午方便，怎么预约？");
  assert.equal(detail.outreach.reply, "周日下午方便，怎么预约？");
  assert.equal(detail.outreach.replyStatus, "已收到回复");
});

test("acquisition task adjustment restores the saved configuration from task snapshots", () => {
  const draft = realtimeWork.acquisitionTaskUpdateDraftFrom({
    metadata: {
      taskSnapshot: {
        resultSnapshot: {
          configuration: {
            findingStrategy: {
              sourceScope: "authorized_account_interactions",
              audienceRules: {
                goal: "正在询问现车、价格和提车时间的人",
                requirements: "只保留高意向用户"
              }
            },
            touchChannel: "private_message",
            touchContent: "先回应当前问题，再确认到店安排。",
            replyStyle: "专业、简短、自然",
            handoffBoundary: "价格承诺和投诉转人工",
            approvalMode: "auto",
            frequency: {
              mode: "发现高意向用户后立即触达",
              maxTouchesPerDay: 30,
              minIntervalMinutes: 5
            },
            timeWindow: { schedule: "09:00-21:00" },
            stopConditions: ["用户明确拒绝", "完成留资"]
          }
        }
      }
    }
  });

  assert.deepEqual(draft, {
    strategy: {
      sourceScope: "持续监听你的抖音账号新增评论、直播互动和账号互动通知",
      audienceGoal: "正在询问现车、价格和提车时间的人",
      requirements: "只保留高意向用户"
    },
    touchContent: {
      channel: "private_message",
      message: "先回应当前问题，再确认到店安排。",
      strategy: "先回应当前问题，再确认到店安排。",
      replyStyle: "专业、简短、自然",
      handoffBoundary: "价格承诺和投诉转人工",
      approvalMode: "auto"
    },
    runtimeRules: {
      maxTouchesPerDay: 30,
      minIntervalMinutes: 5
    }
  });
});

test("style preview carries the saved strategy values into task adjustment", () => {
  const work = realtimeWork.createRealtimeMockAcquisitionWork({ id: "preview-account", name: "一以万真" });
  const draft = realtimeWork.acquisitionTaskUpdateDraftFrom(work);

  assert.equal("timeWindow" in draft.strategy, false);
  assert.equal(draft.strategy.audienceGoal, "正在询问现车、价格、分期、购置税或提车时间的人");
  assert.equal(draft.touchContent.channel, "private_message");
  assert.equal(draft.touchContent.replyStyle, "专业、简短、自然");
  assert.equal("schedule" in draft.runtimeRules, false);
  assert.equal(draft.runtimeRules.maxTouchesPerDay, 30);
  assert.equal(draft.runtimeRules.minIntervalMinutes, 15);
  assert.equal("stopConditions" in draft.runtimeRules, false);
});

test("listener task editing never restores a historical lookback field", () => {
  assert.doesNotMatch(realtimeWorkSource, /看多久的内容/);
  assert.doesNotMatch(realtimeWorkSource, /strategy\.timeWindow/);
});

test("task adjustment uses customer-facing labels and summaries", () => {
  const start = realtimeWorkSource.indexOf("export function openAcquisitionTaskUpdateDialog");
  const end = realtimeWorkSource.indexOf("export function normalizeAcquisitionRealtimeMetadata", start);
  const dialog = realtimeWorkSource.slice(start, end);
  assert.match(dialog, /找什么样的人/);
  assert.match(dialog, /怎么联系/);
  assert.match(dialog, /发送保护/);
  assert.match(dialog, /当前设置/);
  assert.match(dialog, /调整后预览/);
  assert.match(dialog, /renderTaskUpdateSummary/);
  assert.match(dialog, /taskUpdateFormDraft\(form, initial, \{ discoveryOnly, comprehensive \}\)/);
  assert.match(dialog, /账号会持续监听新信号/);
  assert.match(dialog, /获客专家只通过私信完成首次触达/);
  assert.match(dialog, /当前旧任务使用公开回复/);
  assert.match(dialog, /taskUpdateFixedValue/);
  assert.doesNotMatch(dialog, /什么时候联系|每天几点工作|每天几点监听/);
  assert.match(realtimeWorkSource, /sourceScope:\s*base\.strategy\?\.sourceScope/);
  assert.doesNotMatch(dialog, /taskUpdatePreviewValue/);
  assert.doesNotMatch(dialog, /JSON\.stringify\(value, null, 2\)/);
  assert.doesNotMatch(dialog, /修改前（只读）/);
  assert.doesNotMatch(dialog, /修改后（实时预览）/);
});

test("task adjustment uses the blue workspace accent instead of green", () => {
  const cssStart = realtimeWorkSource.indexOf(".sb-rw-task-update-mask");
  const taskUpdateCss = realtimeWorkSource.slice(cssStart);
  assert.match(taskUpdateCss, /\.sb-rw-task-update-boundary\{border-color:#dce5f3;background:#f5f8ff/);
  assert.match(taskUpdateCss, /\.sb-rw-task-update-section\{border-color:#e4eaf3;background:#fbfcff\}/);
  assert.match(taskUpdateCss, /\.sb-rw-task-update-footer button:last-child\{border-color:#2f80ed;background:#2f80ed\}/);
});

test("final acquisition judgment keeps readable text on the dark decision surface", () => {
  assert.match(
    realtimeWorkSource,
    /\.sb-rw-acquisition-detail-step\.is-done \.sb-rw-acquisition-detail-decision>span\{color:#bdc4ce\}/
  );
  assert.match(
    realtimeWorkSource,
    /\.sb-rw-acquisition-detail-step\.is-done \.sb-rw-acquisition-detail-decision>strong\{color:#fff\}/
  );
});

test("selected accounts, agents, and acquisition prospects use the blue-gray outline selection", () => {
  assert.match(
    realtimeWorkSource,
    /\.sb-rw-account-card\.is-active\{border-color:#b7c8e5;background:#fff;box-shadow:none\}/
  );
  assert.match(
    realtimeWorkSource,
    /\.sb-rw-team-card\.is-active\{border-color:#b7c8e5;background:#fff;box-shadow:none\}/
  );
  assert.match(
    realtimeWorkSource,
    /\.sb-rw-acquisition-queue-panel \.sb-rw-acquisition-person\.is-selected\{border-color:#b7c8e5;background:#fff;box-shadow:none;border-radius:16px\}/
  );
});

test("selecting an acquisition prospect keeps the cloud stage mounted", () => {
  const start = realtimeWorkSource.indexOf("function renderCommentAcquisitionQueuePanel");
  const end = realtimeWorkSource.indexOf("function renderCommentAcquisitionDetailPanel", start);
  const queueRenderer = realtimeWorkSource.slice(start, end);
  assert.match(queueRenderer, /item\.dataset\.prospectId = person\.id/);
  assert.match(queueRenderer, /updateAcquisitionQueueSelection\(panel, selected, state\)/);
  assert.doesNotMatch(queueRenderer, /state\.acquisitionProspectId = person\.id;\s*onChange\?\.\(\)/);
});

test("acquisition queue derives a single live progress state for each prospect", () => {
  const rows = realtimeWork.commentAcquisitionQueueRows({
    metadata: {
      acquisitionSnapshot: {
        resultSnapshot: {
          leads: [
            { leadId: "lead-queued", nickname: "排队用户", comment: "想了解价格", source: { type: "live" }, intent: { tier: "high" } },
            { leadId: "lead-waiting", nickname: "等待用户", comment: "可以试驾吗", source: { type: "live" }, intent: { tier: "high" } },
            { leadId: "lead-replied", nickname: "已回复用户", comment: "上海有现车吗", source: { type: "live" }, intent: { tier: "high" } }
          ]
        },
        approvalQueue: [
          { leadId: "lead-queued", state: "submitted", lead: { leadId: "lead-queued" } },
          { leadId: "lead-waiting", state: "sent", lead: { leadId: "lead-waiting" }, content: "可以帮你确认试驾安排。" },
          { leadId: "lead-replied", state: "delivered", lead: { leadId: "lead-replied" }, content: "我帮你确认上海门店库存。" }
        ],
        replies: [{ leadId: "lead-replied", content: "好的，麻烦帮我看一下。" }]
      }
    }
  });

  assert.deepEqual(rows.map((row) => [row.id, row.touchProgressState, row.touchProgressLabel, row.queueSourceLabel]), [
    ["lead-queued", "queued", "排队触达中", "直播弹幕"],
    ["lead-waiting", "waiting-reply", "等待客户回复", "直播弹幕"],
    ["lead-replied", "replied", "已回复", "直播弹幕"]
  ]);
});

test("acquisition execution queue contains only high-intent prospects", () => {
  const work = realtimeWork.createRealtimeMockAcquisitionWork({ id: "preview-account", name: "一以万真" });
  const rows = realtimeWork.commentAcquisitionQueueRows(work);

  assert.equal(rows.length, 4);
  assert.ok(rows.every((row) => row.intentTier === "high"));
  assert.deepEqual(rows.map((row) => row.id), [
    "mock-lead-shaoxing-tang",
    "mock-lead-shanghai-zhou",
    "mock-lead-hangzhou-lin",
    "mock-lead-jiaxing-zhou"
  ]);
  assert.match(realtimeWorkSource, /function renderCommentAcquisitionDetailPanel\(selected, state\)\s*\{[\s\S]*?const view = \{ people: commentAcquisitionQueueRows\(work\) \};/);
});

test("style preview keeps the live queue progress states readable after filtering", () => {
  const work = realtimeWork.createRealtimeMockAcquisitionWork({ id: "preview-account", name: "一以万真" });
  const rows = realtimeWork.commentAcquisitionQueueRows(work);

  assert.equal(rows.length, 4);
  assert.deepEqual(new Set(rows.map((row) => row.touchProgressState)), new Set(["sending", "waiting-reply", "replied"]));
});

test("realtime acquisition preview uses blue and orange status colors instead of green", () => {
  assert.match(realtimeWorkSource, /\.sb-rw-acquisition-queue-status i\{[^}]*background:#2f80ed/s);
  assert.match(realtimeWorkSource, /\.sb-rw-acquisition-progress\.is-replied\{color:#2f80ed\}/);
  assert.match(realtimeWorkSource, /\.sb-rw-acquisition-detail-message\.is-outbound\{[^}]*background:#f5f8ff/s);
  assert.match(grokAvatarSource, /"mkt-comment-acquisition": Object\.freeze\(\{ shape: "blob", color: "blue" \}\)/);
});

test("acquisition queue heading is sized for the large workbench panel", () => {
  assert.match(realtimeWorkSource, /\.sb-rw-acquisition-queue-panel \.sb-rw-panel-title\{font-size:16px/s);
  assert.match(realtimeWorkSource, /\.sb-rw-acquisition-queue-panel \.sb-rw-acquisition-running\{font-size:13px/s);
  assert.match(realtimeWorkSource, /\.sb-rw-acquisition-queue-panel \.sb-rw-acquisition-running i\{width:9px;height:9px/s);
});

test("acquisition queue removes the outer workbench frame while keeping inner dividers", () => {
  assert.match(realtimeWorkSource, /\.sb-rw-main\.is-comment-acquisition-work>\.sb-rw-acquisition-queue-panel\{border:0;box-shadow:none/s);
});

test("acquisition workbench removes the marked horizontal separator lines", () => {
  assert.match(realtimeWorkSource, /\.sb-rw-acquisition-queue-panel>\.sb-rw-panel-head\{border-bottom:0/s);
  assert.match(realtimeWorkSource, /\.sb-rw-acquisition-queue-panel \.sb-rw-acquisition-person\{border-bottom:0/s);
  assert.match(realtimeWorkSource, /\.sb-rw-acquisition-detail-panel>\.sb-rw-panel-head\{border-bottom:0/s);
});
