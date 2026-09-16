import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as realtimeWork from "../src/salebuddy/ui/realtime-work.js";

const source = fs.readFileSync(new URL("../src/salebuddy/ui/realtime-work.js", import.meta.url), "utf8");
const agentSquareSource = fs.readFileSync(new URL("../src/salebuddy/ui/agent-square.js", import.meta.url), "utf8");

test("realtime work renders only provider-sourced progress", () => {
  assert.match(source, /progressSource\s*===\s*"provider"/);
  const renderPanel = source.slice(source.indexOf("function renderLiveWorkPanel"), source.indexOf("function renderWorkUnitPanel"));
  assert.match(renderPanel, /progressMode\s*===\s*"indeterminate"/);
  assert.match(renderPanel, /is-indeterminate/);
  assert.doesNotMatch(source, /selected\.liveWork\.progress\s*\|\|\s*0\)\}%/);
});

test("realtime work never falls back to simulated desktop scenes", () => {
  const renderPage = source.slice(source.indexOf("  function render() {"), source.indexOf("  render();"));
  assert.doesNotMatch(renderPage, /renderSceneScreen\(screen, selected, currentStep\)/);
  assert.doesNotMatch(source, /ecommerceSceneFor\(selected\.id, match\)/);
  assert.doesNotMatch(source, /实时预览 · \$\{account\.name\}/);
  assert.match(source, /真实云电脑未提供可用画面/);
});

test("realtime work gives each empty state one clear next action", () => {
  assert.match(source, /empty\.dataset\.state = managedAccount \? "account-idle" : "public-idle"/);
  assert.match(source, /"还没有公开找人任务"/);
  assert.match(source, /"开始公开找人"/);
  assert.match(source, /"还没有进行中的任务"/);
  assert.match(source, /"运行 Agent"/);
  assert.match(source, /PUBLIC_TASK_EMPTY_ILLUSTRATION/);
  assert.match(source, /\.sb-realtime-page\{min-height:100dvh/);
  assert.match(source, /\.sb-rw-no-account\{display:grid;min-height:calc\(100dvh - 60px\)/);
  assert.match(source, /\.sb-page\.sb-page-realtime-work > \.sb-page-body\{min-height:0\}/);
  assert.match(source, /\.sb-page\.sb-page-realtime-work > \.sb-page-body > \.sb-realtime-page\{display:flex;flex-direction:column;min-height:100%;height:100%\}/);
  assert.match(source, /\.sb-rw-no-account\{display:flex;flex:1 1 auto;align-items:center;justify-content:center;min-height:320px;overflow:auto\}/);
  assert.match(source, /@media \(max-width:760px\)\{\.sb-rw-no-account\{min-height:300px;padding:32px 16px\}/);
  assert.match(source, /@media \(max-height:720px\)\{\.sb-realtime-page\{padding-top:16px;padding-bottom:20px\}/);
  assert.doesNotMatch(source, /当前没有正在执行的公开数据任务/);
});

test("acquisition rendering does not reuse marketplace task copy or lose auth expiry reason", () => {
  const renderPanel = source.slice(source.indexOf("function renderLiveWorkPanel"), source.indexOf("function renderWorkUnitPanel"));
  assert.match(renderPanel, /realtime\?\.task \|\| \(acquisition \? "等待真实任务状态"/);
  assert.match(renderPanel, /realtime\?\.phase \|\| \(acquisition \? "等待真实阶段"/);
  assert.match(source, /reason: String\(data\.reason \|\| ""\)/);
  assert.match(source, /viewer\.reason === "auth-expired"/);
});

test("acquisition realtime work exposes the strategy-only adjustment flow", () => {
  const renderPanel = source.slice(source.indexOf("function renderLiveWorkPanel"), source.indexOf("function renderWorkUnitPanel"));
  assert.match(renderPanel, /调整当前任务/);
  assert.match(renderPanel, /openAcquisitionTaskUpdateDialog/);
  assert.match(source, /ACQUISITION_TASK_UPDATE_ACTION\s*=\s*"task\.config\.update"/);
  assert.match(source, /effectiveScope:\s*"future_only"/);
});

test("acquisition startup keeps the submitted configuration in realtime work metadata", () => {
  const start = agentSquareSource.indexOf("async function startCommentAcquisition");
  const end = agentSquareSource.indexOf("function applyCommentAcquisitionStatus", start);
  const handler = agentSquareSource.slice(start, end);
  assert.match(handler, /const initialTaskConfig = buildPayload\(\{ \.\.\.flow, conversationId:/);
  assert.match(handler, /configuration: initialTaskConfig/);
});

test("Morgan task updates keep automatic sending fixed", () => {
  const start = source.indexOf("export function openAcquisitionTaskUpdateDialog");
  const end = source.indexOf("function taskUpdatePayload", start);
  const dialog = source.slice(start, end > start ? end : undefined);
  assert.match(dialog, /agentId === "mkt-comment-acquisition"/);
  assert.match(dialog, /自动发送/);
});

test("finder listener adjustment only exposes finding conditions", () => {
  const start = source.indexOf("export function openAcquisitionTaskUpdateDialog");
  const end = source.indexOf("function taskUpdatePayload", start);
  const dialog = source.slice(start, end > start ? end : undefined);

  assert.match(dialog, /const discoveryOnly = agentId === "mkt-find-people" && isDiscoveryOnlyTaskConfig\(currentConfig\);/);
  assert.match(dialog, /调整找客监听/);
  assert.match(dialog, /只调整找人条件；修改仅对未来的新信号生效/);
  assert.match(dialog, /if \(!discoveryOnly\) \{/);
  assert.doesNotMatch(dialog, /每天几点监听/);
});

test("Morgan realtime view includes enriched candidate profile fields", () => {
  const view = realtimeWork.commentAcquisitionRealtimeView({
    metadata: {
      acquisitionSnapshot: {
        resultSnapshot: {
          leads: [{
            leadId: "lead-profile",
            secUid: "sec-profile",
            nickname: "客户甲",
            comment: "想了解方案",
            source: { type: "comment", videoId: "video-1" }
          }]
        },
        candidateProfiles: {
          "sec-profile": {
            leadId: "lead-profile",
            secUid: "sec-profile",
            source: { videoUrl: "https://www.douyin.com/video/video-1", observedAt: "2026-09-10T10:02:00.000Z" },
            leadCapture: { phone: "13812345678", source: "私信" },
            leadCaptureStatus: "captured"
          }
        }
      }
    }
  });

  assert.equal(view.people.length, 1);
  assert.equal(view.people[0].sourceUrl, "https://www.douyin.com/video/video-1");
  assert.equal(view.people[0].sourceObservedAt, "2026-09-10T10:02:00.000Z");
  assert.equal(view.people[0].leadCapture.phone, "13812345678");
});

test("Morgan realtime view does not invent a comment source when the provider omits it", () => {
  const view = realtimeWork.commentAcquisitionRealtimeView({
    metadata: {
      acquisitionSnapshot: {
        resultSnapshot: { leads: [{ leadId: "lead-unknown", nickname: "客户甲", comment: "想了解方案" }] }
      }
    }
  });

  assert.equal(view.people[0].sourceLabel, "来源待确认");
});

test("cloud viewer status messages update the mounted frame without rerendering the page", () => {
  const start = source.indexOf("const onCloudViewerMessage");
  const end = source.indexOf("globalThis.addEventListener", start);
  const handler = source.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.match(handler, /updateCloudViewerPresentation/);
  assert.doesNotMatch(handler, /render\(\)/);
});

test("realtime cloud viewers save rolling WebM segments and use a captured frame only as a recording fallback", () => {
  assert.match(source, /saveOfficeReplaySnapshot/);
  assert.match(source, /saveOfficeReplayVideo/);
  assert.match(source, /byering-cloud-snapshot/);
  assert.match(source, /byering-cloud-viewer-capture/);
  assert.match(source, /byering-cloud-viewer-recording-start/);
  assert.match(source, /byering-cloud-recording-segment/);
  assert.match(source, /viewer\.status === "recording-unavailable"/);
  assert.match(source, /event\.origin !== globalThis\.location\?\.origin/);
});

test("Douyin acquisition viewers request live-room capture while other viewers keep full-screen capture", () => {
  assert.match(source, /captureProfile: cloudCaptureProfileFor\(agentId, work\)/);
  assert.match(source, /captureProfile: context\.captureProfile/);
  assert.match(source, /captureRegion: context\.captureRegion/);
  assert.match(source, /isAcquisitionRealtimeAgent\(agentId\) && isDouyinCloudAgent\(agentId, work\)/);
  assert.match(source, /: "full-screen"/);
});

test("live subscriptions preserve a mounted cloud viewer instead of rerendering it", () => {
  const start = source.indexOf("const refreshRealtimeView");
  const end = source.indexOf("return page;", start);
  const refreshFlow = source.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.match(refreshFlow, /refreshMountedRealtimeView/);
  assert.match(refreshFlow, /unsubscribe\s*=\s*teamLive\?\.subscribe\?\.\(refreshRealtimeView\)/);
  assert.match(refreshFlow, /unsubscribeLiveWork\s*=\s*subscribeWork\(refreshRealtimeView\)/);
});

test("realtime work owns task cancellation and still opens Agent Square for new account setup", () => {
  const manager = source.slice(source.indexOf("function openRunningAgentManager"), source.indexOf("function updateAgentCards"));
  assert.match(source, /运行更多 Agent/);
  assert.match(source, /runMoreAgents\.addEventListener\("click", openRunningAgentManager\)/);
  assert.match(manager, /管理运行中的 Agent/);
  assert.match(manager, /已产出的结果与证据会保留/);
  assert.match(manager, /taskGateway\.action\("task\.cancel", payload\)/);
  assert.match(manager, /启动更多 Agent/);
  assert.match(manager, /openAgentSquare/);
});

test("realtime work describes the account Agent status in plain language", () => {
  assert.match(source, /`「\$\{account\.name\}」的 Agent`/);
  assert.match(source, /\$\{erroredLiveCount\} 个任务需要处理/);
  assert.match(source, /\$\{activeLiveCount\} 个任务正在运行/);
  assert.equal(realtimeWork.realtimeAccountStatusLabel({ status: "运行中" }, []), "已连接");
  assert.equal(realtimeWork.realtimeAccountStatusLabel({ status: "已连接" }, [{ state: "working" }]), "运行中");
  assert.equal(realtimeWork.realtimeAccountStatusLabel({ status: "需重新登录" }, []), "需重新登录");
  assert.doesNotMatch(source, /AI 军团/);
  assert.doesNotMatch(source, /全力执行中/);
});

test("completed work does not render waiting receipt state", () => {
  const renderPanel = source.slice(source.indexOf("function renderLiveWorkPanel"), source.indexOf("function renderWorkUnitPanel"));
  assert.match(renderPanel, /const completed = isCompletedLiveWork\(selected, realtime\)/);
  assert.match(renderPanel, /!completed &&/);
  assert.match(renderPanel, /work\.artifact \? "结果已回传" : "任务已完成"/);
  assert.match(renderPanel, /completed \? "任务已完成" : "等待真实工作动态"/);
});

test("inbox realtime work derives automatic replies and handoffs from real backend state", () => {
  assert.equal(typeof realtimeWork.inboxRealtimeRows, "function");
  const rows = realtimeWork.inboxRealtimeRows({
    metadata: {
      inboxMessages: [{
        messageId: "message-1",
        conversationId: "conversation-1",
        nickname: "客户甲",
        content: "想了解一下你们的服务",
        status: "sent",
        createdAt: "2026-09-04T10:00:00.000Z"
      }],
      inboxDrafts: [{
        draftId: "draft-1",
        messageId: "message-1",
        nickname: "客户甲",
        incomingContent: "想了解一下你们的服务",
        content: "可以，我先了解一下你的具体需求。",
        status: "sent",
        sentAt: "2026-09-04T10:00:03.000Z",
        recipient: { conversationId: "conversation-1" }
      }]
    }
  });

  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0], {
    id: "conversation-1",
    nickname: "客户甲",
    latestMessage: "想了解一下你们的服务",
    replyContent: "可以，我先了解一下你的具体需求。",
    status: "sent",
    statusLabel: "已自动回复",
    timestamp: "2026-09-04T10:00:03.000Z",
    messageCount: 1
  });
  assert.deepEqual(realtimeWork.inboxRealtimeRows({ metadata: {} }), []);

  const handoffRows = realtimeWork.inboxRealtimeRows({
    metadata: {
      inboxMessages: [{
        messageId: "message-2",
        conversationId: "conversation-2",
        nickname: "客户乙",
        content: "可以承诺最低价吗",
        status: "handoff",
        createdAt: "2026-09-04T10:01:00.000Z"
      }]
    }
  });
  assert.equal(handoffRows[0].statusLabel, "已转人工接管");
});

test("inbox realtime work renders a funnel and three-column conversation workbench", () => {
  assert.match(source, /sb-rw-main\.is-inbox-work/);
  assert.match(source, /function renderInboxWorkbench/);
  assert.match(source, /function renderInboxFunnel/);
  assert.match(source, /sb-rw-inbox-funnel/);
  assert.match(source, /sb-rw-inbox-shell/);
  assert.match(source, /全部会话/);
  assert.match(source, /客户详情/);
  assert.match(source, /\["mkt-dm-inbox", GOLD_CUSTOMER_SERVICE_AGENT_ID\]\.includes\(selected\.id\)/);
  assert.match(source, /inboxMessages/);
  assert.match(source, /inboxDrafts/);
});

test("inbox workbench metrics and timeline stay grounded in backend snapshots", () => {
  const work = {
    metadata: {
      inboxMessages: [{
        messageId: "message-1",
        conversationId: "conversation-1",
        nickname: "客户甲",
        content: "想了解一下你们的服务",
        replyContent: "可以，我先了解一下你的具体需求。",
        status: "sent",
        receivedAt: "2026-09-04T10:00:00.000Z",
        repliedAt: "2026-09-04T10:00:03.000Z"
      }],
      runtime: { sentCount: 1 }
    }
  };
  assert.deepEqual(realtimeWork.inboxRealtimeMetrics(work), { entered: 1, replied: 1, replyRate: 100, captured: 0, captureRate: 0 });
  assert.deepEqual(realtimeWork.inboxConversationTimeline(work, "conversation-1").map((item) => [item.direction, item.content]), [
    ["in", "想了解一下你们的服务"],
    ["out", "可以，我先了解一下你的具体需求。"]
  ]);
});

test("inbox polling copies real listener messages, automatic replies, and handoffs into live work metadata", () => {
  assert.match(agentSquareSource, /function inboxMessageSnapshot/);
  assert.match(agentSquareSource, /inboxMessages:\s*\(Array\.isArray\(flow\.messages\)/);
  assert.match(agentSquareSource, /replyContent:\s*message\.replyContent/);
  assert.match(agentSquareSource, /handoffReason:\s*message\.handoffReason/);
  assert.match(agentSquareSource, /handoffCount:\s*Number\(runtime\.handoffCount/);
  assert.doesNotMatch(agentSquareSource, /function inboxDraftSnapshot/);
});

test("Morgan realtime work derives customer-facing progress from the real acquisition snapshot", () => {
  assert.equal(typeof realtimeWork.commentAcquisitionRealtimeView, "function");
  const view = realtimeWork.commentAcquisitionRealtimeView({
    metadata: {
      acquisitionSnapshot: {
        counters: { scans: 3, candidates: 2, delivered: 1, replies: 1 },
        lastScan: {
          notifications: 18,
          source: { works: [{ id: "work-1" }, { id: "work-2" }] }
        },
        resultSnapshot: {
          leads: [{
            leadId: "lead-1",
            nickname: "客户甲",
            avatarUrl: "https://example.com/avatar.jpg",
            comment: "最近正准备换一套方案",
            reason: "明确表达近期需求",
            source: {
              workTitle: "产品使用分享",
              videoUrl: "https://www.douyin.com/video/video-1",
              observedAt: "2026-09-04T09:59:00.000Z"
            },
            evidence: [{
              type: "comment",
              quote: "最近正准备换一套方案",
              sourceUrl: "https://www.douyin.com/video/video-1",
              observedAt: "2026-09-04T09:59:00.000Z"
            }],
            intent: { tier: "high", score: 92 }
          }]
        },
        approvalQueue: [{
          touchId: "touch-1",
          state: "delivered",
          content: "看到你在评论里提到正在找替代方案，方便聊聊吗？",
          lead: { leadId: "lead-1", nickname: "客户甲" }
        }]
      }
    }
  });

  assert.deepEqual(view.counts, { works: 2, comments: 18, prospects: 2, touched: 1, replies: 1, captured: 0, converted: 0 });
  assert.equal(view.people[0].nickname, "客户甲");
  assert.equal(view.people[0].quote, "最近正准备换一套方案");
  assert.equal(view.people[0].reason, "明确表达近期需求");
  assert.equal(view.people[0].workTitle, "产品使用分享");
  assert.equal(view.people[0].touchContent, "看到你在评论里提到正在找替代方案，方便聊聊吗？");
  assert.equal(view.people[0].avatar, "https://example.com/avatar.jpg");
  assert.equal(view.people[0].sourceUrl, "https://www.douyin.com/video/video-1");
  assert.equal(view.people[0].sourceObservedAt, "2026-09-04T09:59:00.000Z");

  const liveView = realtimeWork.commentAcquisitionRealtimeView({
    metadata: {
      acquisitionSnapshot: {
        resultSnapshot: { leads: [{ leadId: "lead-live", nickname: "直播用户", source: { type: "live" }, comment: "想问一下价格" }] }
      }
    }
  });
  assert.equal(liveView.people[0].sourceLabel, "直播间");
});

test("Morgan realtime work combines outreach, received replies, and automatic continuation into conversations", () => {
  assert.equal(typeof realtimeWork.commentAcquisitionConversationRows, "function");
  const rows = realtimeWork.commentAcquisitionConversationRows({
    metadata: {
      acquisitionSnapshot: {
        approvalQueue: [{
          touchId: "touch-1",
          state: "delivered",
          content: "想了解一下你目前最想解决的问题。",
          lead: { leadId: "lead-1", nickname: "客户甲" }
        }],
        replies: [{
          leadId: "lead-1",
          nickname: "客户甲",
          content: "主要是获客成本太高。",
          replyContent: "明白，你现在主要通过哪些渠道获客？",
          receivedAt: "2026-09-07T10:00:00.000Z"
        }]
      }
    }
  });

  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0], {
    id: "lead-1",
    nickname: "客户甲",
    avatar: "",
    sourceLabel: "来源待确认",
    touchContent: "想了解一下你目前最想解决的问题。",
    incomingContent: "主要是获客成本太高。",
    replyContent: "明白，你现在主要通过哪些渠道获客？",
    status: "replied",
    statusLabel: "已自动续聊",
    timestamp: "2026-09-07T10:00:00.000Z"
  });
});

test("Morgan detail keeps provider-backed lead capture evidence from reply snapshots", () => {
  const rows = realtimeWork.commentAcquisitionOutreachRows({
    metadata: {
      acquisitionSnapshot: {
        resultSnapshot: {
          leads: [{
            leadId: "lead-capture",
            nickname: "客户甲",
            comment: "想了解方案",
            source: { type: "comment", videoTitle: "产品介绍", videoUrl: "https://www.douyin.com/video/video-2" },
            evidence: [{ type: "comment", quote: "想了解方案", sourceUrl: "https://www.douyin.com/video/video-2" }],
            intent: { tier: "high", score: 88, reason: "明确表达方案需求", signals: ["需求"] }
          }]
        },
        approvalQueue: [{
          touchId: "touch-capture",
          candidateKey: "lead-capture",
          state: "delivered",
          content: "你好，看到你的留言了，方便聊聊吗？",
          lead: { leadId: "lead-capture", nickname: "客户甲" }
        }],
        replies: [{
          leadId: "lead-capture",
          candidateKey: "lead-capture",
          nickname: "客户甲",
          content: "可以，电话是 13812345678，微信号 wxid_demo123456",
          receivedAt: "2026-09-10T10:00:00.000Z",
          leadCapture: {
            phone: "13812345678",
            email: null,
            wechat: "wxid_demo123456",
            source: "私信"
          },
          leadCaptureStatus: "captured",
          leadCaptureQuote: "可以，电话是 13812345678，微信号 wxid_demo123456",
          leadCaptureObservedAt: "2026-09-10T10:00:00.000Z"
        }]
      }
    }
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].leadCaptureQuote, "可以，电话是 13812345678，微信号 wxid_demo123456");
  assert.equal(rows[0].leadCaptureObservedAt, "2026-09-10T10:00:00.000Z");
  const detail = realtimeWork.commentAcquisitionDetailModel(rows[0]);
  assert.deepEqual(detail.capture.fields, [
    { label: "手机号", value: "13812345678" },
    { label: "微信号", value: "wxid_demo123456" }
  ]);
  assert.equal(detail.capture.quote, "可以，电话是 13812345678，微信号 wxid_demo123456");
  assert.equal(detail.evidence.observedAt, "");
});

test("Morgan prospect detail separates evidence, judgment, outreach, and lead capture", () => {
  assert.equal(typeof realtimeWork.commentAcquisitionDetailModel, "function");
  const pending = realtimeWork.commentAcquisitionDetailModel({
    nickname: "客户甲",
    sourceLabel: "评论区",
    workTitle: "产品使用分享",
    quote: "预算 20 万，怎么预约试驾？",
    reason: "明确预算和预约意向",
    intentTier: "high",
    intentSignals: ["预算", "预约"],
    outreachState: "pending",
    outreachStateLabel: "待触达"
  });

  assert.deepEqual(pending.flow.map((step) => [step.key, step.state]), [
    ["discovered", "done"],
    ["judged", "done"],
    ["outreach", "pending"],
    ["capture", "pending"]
  ]);
  assert.equal(pending.evidence.quote, "预算 20 万，怎么预约试驾？");
  assert.equal(pending.judgment.label, "高意向");
  assert.deepEqual(pending.judgment.signals, ["预算", "预约"]);
  assert.equal(pending.outreach.message, "");
  assert.equal(pending.capture.label, "暂未留资");

  const captured = realtimeWork.commentAcquisitionDetailModel({
    ...pending.person,
    outreachState: "sent",
    outreachStateLabel: "已触达",
    touchContent: "你好，看到你在评论里提到预算，方便聊聊吗？",
    incomingContent: "可以，电话是 13812345678",
    leadCapture: { phone: "13812345678" }
  });

  assert.deepEqual(captured.flow.map((step) => [step.key, step.state]), [
    ["discovered", "done"],
    ["judged", "done"],
    ["outreach", "done"],
    ["capture", "done"]
  ]);
  assert.equal(captured.outreach.message, "你好，看到你在评论里提到预算，方便聊聊吗？");
  assert.equal(captured.outreach.reply, "可以，电话是 13812345678");
  assert.equal(captured.capture.label, "已留资");
  assert.deepEqual(captured.capture.fields, [{ label: "手机号", value: "13812345678" }]);
});

test("Morgan live status polling copies the full acquisition snapshot into realtime work", () => {
  const start = agentSquareSource.indexOf("function applyCommentAcquisitionStatus");
  const end = agentSquareSource.indexOf("function pollCommentAcquisitionTask", start);
  const applyStatus = agentSquareSource.slice(start, end);
  assert.match(applyStatus, /acquisitionSnapshot:\s*result/);
});

test("Morgan realtime work only shows acquisition progress", () => {
  assert.match(source, /function renderCommentAcquisitionProgressPanel/);
  assert.match(source, /实时获客进展/);
  assert.match(source, /selected\.id === "mkt-comment-acquisition"/);
  assert.match(source, /\.sb-rw-main\.is-comment-acquisition-work\{grid-template-columns:minmax\(300px,\.84fr\) minmax\(360px,1fr\) minmax\(330px,\.96fr\);align-items:stretch\}/);
  assert.match(source, /const workbar = el\("div", "sb-rw-workbar"\);[\s\S]*?workbar\.appendChild\(renderCommentAcquisitionSceneHeader/);
  assert.match(source, /workbar\.append\(el\("h2", "sb-rw-section-title", "工作现场"\)\);[\s\S]*?root\.appendChild\(workbar\)/);
  assert.doesNotMatch(source, /renderCommentAcquisitionConversationPanel/);
  const workSceneStart = source.indexOf('const workbar = el("div", "sb-rw-workbar")');
  const workSceneEnd = source.indexOf('root.appendChild(main);', workSceneStart);
  const workScene = source.slice(workSceneStart, workSceneEnd);
  assert.match(source, /sb-rw-cloud-panel/);
  assert.match(source, /sb-rw-acquisition-full-desktop-panel/);
  assert.match(source, /douyinCloudViewerUrlFor\(selected\.id\)/);
  assert.match(source, /cloudLive\.setAttribute\("aria-hidden", "true"\)/);
  assert.match(source, /frame\.setAttribute\("aria-hidden", "true"\)/);
  assert.doesNotMatch(workScene, /最近一次成功工作录屏/);
  assert.doesNotMatch(workScene, /sb-rw-cloud-live-caption/);
  assert.match(source, /renderCommentAcquisitionLiveRoomStage\(replay, replayPresentation, selected\.liveWork\)/);
  assert.match(source, /sb-rw-pure-live-panel/);
  assert.doesNotMatch(source, /cloudHead\.append\(el\("div", "sb-rw-panel-title", "直播间工作现场"\)/);
  assert.match(source, /if \(!commentAcquisitionWork\) \{\s*const liveStatus/);
  assert.match(source, /sb-rw-live-room-stage/);
  assert.match(source, /sb-rw-live-room-fallback/);
  assert.match(source, /直播间工作现场/);
  assert.doesNotMatch(source, /连续对话动态/);
});

test("comment acquisition work scene exposes the three work views without rebuilding the cloud stage", () => {
  const start = source.indexOf("function renderCommentAcquisitionSceneHeader");
  const end = source.indexOf("function renderCommentAcquisitionQueuePanel", start);
  const header = source.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.match(source, /const ACQUISITION_WORK_VIEWS = Object\.freeze\(\[/);
  assert.match(source, /\{ id: "prospecting", label: "潜客搜寻" \}/);
  assert.match(source, /\{ id: "outreach", label: "私信触达" \}/);
  assert.match(source, /\{ id: "conversion", label: "客服转化" \}/);
  assert.match(header, /renderAcquisitionWorkViewTabs/);
  assert.match(source, /state\.acquisitionWorkView = view\.id/);
  assert.match(source, /function acquisitionWorkViewFor\(state\)/);
  assert.match(source, /function renderAcquisitionOutreachView\(selected, state\)/);
  assert.match(source, /function renderAcquisitionConversionView\(selected, state, onChange\)/);
  assert.match(source, /function renderAcquisitionFullDesktopView\(selected, state\)/);
  assert.match(source, /fullDesktopOutreachWork/);
  assert.match(source, /renderAcquisitionFullDesktopView\(selected, state\)/);
  assert.match(source, /renderCommentAcquisitionLiveRoomStage\(replay, replayPresentation, selected\.liveWork\)/);
  assert.doesNotMatch(source, /sb-rw-acquisition-funnel/);
  assert.doesNotMatch(source, /function acquisitionRate/);
});

test("outreach full-desktop view keeps the active Agent cards mounted", () => {
  const teamStart = source.indexOf('const teamSection = el("section", "sb-rw-ai-team")');
  const outreachReturn = source.indexOf("if (fullDesktopOutreachWork) {", teamStart);
  const renderPrefix = source.slice(teamStart, outreachReturn);

  assert.ok(teamStart >= 0 && outreachReturn > teamStart);
  assert.match(
    renderPrefix,
    /root\.appendChild\(teamSection\);[\s\S]*?updateAgentCards\(root, liveAgents, "\.sb-rw-team:not\(\.sb-rw-completed-team\)", "", "runningAgentRailScrollLeft"\);/
  );
});

test("conversion customer requirement tags are mounted as DOM children", () => {
  const start = source.indexOf("function renderAcquisitionConversionView");
  const end = source.indexOf("function renderAcquisitionFullDesktopView", start);
  const view = source.slice(start, end);
  assert.match(view, /const tags = el\("div", "sb-rw-acquisition-conversion-tags"\)/);
  assert.match(view, /tags\.appendChild\(el\("span", null, signal\)\)/);
  assert.doesNotMatch(view, /el\("div", "sb-rw-acquisition-conversion-tags", \(\.\.\./);
});

test("comment acquisition workbench separates pending and sent outreach using provider snapshots", () => {
  assert.equal(typeof realtimeWork.commentAcquisitionOutreachRows, "function");
  const rows = realtimeWork.commentAcquisitionOutreachRows({
    metadata: {
      acquisitionSnapshot: {
        resultSnapshot: {
          leads: [
            { leadId: "lead-pending", nickname: "待触达用户", comment: "想了解报价" },
            { leadId: "lead-sent", nickname: "已触达用户", comment: "可以聊聊方案吗" }
          ]
        },
        approvalQueue: [{
          touchId: "touch-sent",
          state: "delivered",
          content: "看到你的留言了，方便详细聊聊吗？",
          lead: { leadId: "lead-sent", nickname: "已触达用户" }
        }]
      }
    }
  });

  assert.deepEqual(rows.map((row) => [row.id, row.outreachState, row.touchContent]), [
    ["lead-pending", "pending", ""],
    ["lead-sent", "sent", "看到你的留言了，方便详细聊聊吗？"]
  ]);
  assert.match(source, /待触达/);
  assert.match(source, /已触达/);
  assert.match(source, /话术内容/);
  assert.match(source, /state\.acquisitionProspectId = person\.id/);
});

test("comment acquisition does not infer a sent touch from a reply without a provider receipt", () => {
  const rows = realtimeWork.commentAcquisitionOutreachRows({
    metadata: {
      acquisitionSnapshot: {
        resultSnapshot: { leads: [{ leadId: "lead-unknown", nickname: "待核实用户", comment: "想了解报价" }] },
        approvalQueue: [{
          touchId: "touch-unknown",
          state: "unknown",
          content: "看到你的留言了，方便聊聊吗？",
          lead: { leadId: "lead-unknown", nickname: "待核实用户" }
        }],
        replies: [{
          leadId: "lead-unknown",
          nickname: "待核实用户",
          content: "可以了解一下"
        }]
      }
    }
  });

  assert.equal(rows[0].outreachState, "pending");
  assert.equal(rows[0].outreachStateLabel, "待触达");
  assert.equal(rows[0].touchContent, "");
});

test("comment acquisition does not treat a submitted receipt as a completed touch", () => {
  const snapshot = {
    resultSnapshot: { leads: [{ leadId: "lead-submitted", nickname: "处理中用户", comment: "想了解报价" }] },
    approvalQueue: [{
      touchId: "touch-submitted",
      state: "submitted",
      content: "看到你的留言了，方便详细聊聊吗？",
      lead: { leadId: "lead-submitted", nickname: "处理中用户" }
    }]
  };
  const view = realtimeWork.commentAcquisitionRealtimeView({ metadata: { acquisitionSnapshot: snapshot } });
  const rows = realtimeWork.commentAcquisitionOutreachRows({ metadata: { acquisitionSnapshot: snapshot } });

  assert.equal(view.counts.touched, 0);
  assert.equal(rows[0].outreachState, "pending");
  assert.equal(rows[0].outreachStateLabel, "待触达");
});

test("acquisition workbench aligns the three work panels while keeping the cloud viewer usable", () => {
  assert.doesNotMatch(source, /const statusLabel = state\.paused/);
  assert.match(source, /const cloudStatusLabel = state\.paused/);
  assert.match(source, /sb-rw-main\.is-comment-acquisition-work>\.sb-rw-panel\{min-height:620px\}/);
  assert.match(source, /sb-rw-main\.is-comment-acquisition-work>\.sb-rw-cloud-panel,\.sb-rw-main\.is-comment-acquisition-work>\.sb-rw-acquisition-queue-panel\{display:flex;flex-direction:column;align-self:stretch\}/);
  assert.match(source, /sb-rw-main\.is-comment-acquisition-work>\.sb-rw-cloud-panel \.sb-rw-cloud-live-wrap\{display:flex;flex:1;min-height:0;flex-direction:column\}/);
  assert.match(source, /sb-rw-main\.is-comment-acquisition-work>\.sb-rw-cloud-panel \.sb-rw-cloud-live\{width:100%;min-height:0;flex:1;aspect-ratio:auto\}/);
  assert.match(source, /sb-rw-main\.is-comment-acquisition-work>\.sb-rw-pure-live-panel \.sb-rw-live-room-stage/);
  assert.match(source, /sb-rw-main\.is-comment-acquisition-work>\.sb-rw-pure-live-panel\{border:1px solid #dce4ef;border-radius:15px;background:#fff;box-shadow:0 1px 2px rgba\(56,84,125,\.035\);overflow:hidden\}/);
  assert.match(source, /sb-rw-main\.is-comment-acquisition-work>\.sb-rw-pure-live-panel \.sb-rw-cloud-live-wrap\{[^}]*padding:0[^}]*background:transparent/);
  assert.match(source, /sb-rw-main\.is-comment-acquisition-work>\.sb-rw-pure-live-panel \.sb-rw-live-room-stage\{[^}]*width:100%;height:100%;max-height:620px;aspect-ratio:auto/);
  assert.match(source, /sb-rw-live-room-stage\{[^}]*aspect-ratio:9 \/ 16[^}]*border:1px solid #cfdad5[^}]*box-shadow:0 8px 20px rgba\(32,58,48,\.12\)/);
  assert.match(source, /sb-rw-live-room-stage img,\.sb-rw-live-room-stage video\{[^}]*object-fit:cover[^}]*object-position:34% center/);
  assert.match(source, /sb-rw-live-room-stage>img\.sb-rw-live-room-fallback\{transform:none\}/);
  assert.match(source, /sb-rw-main\.is-comment-acquisition-work>\.sb-rw-panel>\.sb-rw-panel-head\{height:61px;min-height:61px;box-sizing:border-box\}/);
  assert.match(source, /sb-rw-acquisition-queue-body\.is-empty\{grid-template-rows:auto minmax\(0,1fr\)\}/);
  assert.match(source, /sb-rw-acquisition-queue-panel \.sb-rw-acquisition-queue-body:not\(\.is-empty\)\{grid-template-rows:minmax\(0,1fr\) auto;overflow:hidden\}/);
  assert.match(source, /sb-rw-acquisition-queue-panel \.sb-rw-acquisition-people\{display:grid;grid-auto-rows:max-content;align-content:start/);
  assert.match(source, /if \(!isEmpty \|\| work\.lastError\) body\.appendChild\(renderCommentAcquisitionControls\(selected, state, onChange\)\);/);
  assert.match(source, /realtimeErrorText\(selected\.liveWork\.lastError\)/);
});

test("acquisition workbench keeps the live-room frame height independent from prospect detail content", () => {
  assert.match(source, /@media\(min-width:1201px\)\{\.sb-rw-main\.is-comment-acquisition-work\{grid-template-rows:620px\}\.sb-rw-main\.is-comment-acquisition-work>\.sb-rw-panel\{height:620px;min-height:0;max-height:620px\}\}/);
});

test("comment acquisition scene omits the redundant bottom events panel", () => {
  assert.match(source, /if \(!commentAcquisitionWork && !backgroundWork && !specialistWork\) \{\s*const events = el\("section", "sb-rw-panel sb-rw-events"\)/);
});

test("realtime work removes the duplicate page title and simplifies the account heading", () => {
  assert.match(source, /\.sb-page\.sb-page-realtime-work > \.sb-page-head\{display:none\}/);
  assert.match(source, /openPage\(\{\s*title: "",\s*onClose: \(\) => \{/);
  assert.match(source, /page\.root\.classList\.add\("sb-page-realtime-work"\)/);
  assert.match(source, /\.sb-rw-account-topline\{display:flex;align-items:center;justify-content:space-between/);
  assert.match(source, /accountHeading\.append\(el\("div", "sb-rw-account-title", "我的账号"\)\)/);
  assert.doesNotMatch(source, /accountHeading\.append\(el\("div", "sb-rw-account-title", "账号矩阵"\)/);
  assert.doesNotMatch(source, /统一托管与智能运营 \$\{managedCount\} 个抖音小店账号/);
});

test("realtime work separates active, attention, and completed Agents", () => {
  const groups = realtimeWork.partitionRealtimeWorks([
    { agentType: "inbox", state: "working" },
    { agentType: "outreach", state: "working", lastError: "发送失败" },
    { agentType: "finder", state: "done" },
    { agentType: "comments", state: "done", lastError: "结果不可用" }
  ]);

  assert.deepEqual(groups.active.map((work) => work.agentType), ["inbox"]);
  assert.deepEqual(groups.attention.map((work) => work.agentType), ["outreach", "comments"]);
  assert.deepEqual(groups.completed.map((work) => work.agentType), ["finder"]);
});

test("realtime work hydrates running agents from the shared office status snapshot", () => {
  assert.equal(typeof realtimeWork.officeStatusWorksToRealtimeWorks, "function");
  assert.equal(typeof realtimeWork.mergeRealtimeWorkSources, "function");

  const remoteWorks = realtimeWork.officeStatusWorksToRealtimeWorks([
    {
      agentType: "mkt-comment-acquisition",
      state: "working",
      task: "持续监听作品评论区",
      phase: "持续获客中",
      metadata: { taskId: "acquisition-1", accountId: "managed-01", officeStatus: "working" }
    },
    {
      agentType: "mkt-dm-inbox",
      state: "idle",
      metadata: { accountId: "managed-01", officeStatus: "idle" }
    },
    {
      agentType: "mkt-dm-inbox",
      state: "attention",
      task: "监听抖音私信",
      metadata: { taskId: "inbox-1", accountId: "managed-01", officeStatus: "attention", error: { code: "LOGIN_EXPIRED", message: "抖音账号需要重新登录" } }
    }
  ]);

  assert.deepEqual(remoteWorks.map((work) => work.agentType), ["mkt-comment-acquisition", "mkt-dm-inbox"]);
  assert.equal(remoteWorks[0].metadata.taskState, "running");
  assert.equal(remoteWorks[1].lastError.code, "LOGIN_EXPIRED");

  const boundRemoteWorks = realtimeWork.officeStatusWorksToRealtimeWorks([
    {
      agentType: "mkt-comment-acquisition",
      state: "working",
      metadata: { taskId: "acquisition-2", accountId: "douyin-agent:mkt-comment-acquisition", officeStatus: "working" }
    }
  ], [{
    id: "douyin-agent:mkt-dm-inbox",
    agentIds: ["mkt-dm-inbox", "mkt-comment-acquisition"],
    name: "一以万真",
    identity: { uid: "58262205543", sec_uid: "sec-one" }
  }]);
  assert.equal(boundRemoteWorks[0].metadata.accountLabel, "一以万真");
  assert.equal(boundRemoteWorks[0].metadata.accountKey, "douyin:sec-one");

  const merged = realtimeWork.mergeRealtimeWorkSources([
    { agentType: "mkt-comment-acquisition", state: "working", activities: ["已读取 3 条评论"], metadata: { taskId: "acquisition-1", accountId: "managed-01" } }
  ], remoteWorks);
  assert.equal(merged.length, 2);
  assert.deepEqual(merged.find((work) => work.agentType === "mkt-comment-acquisition").activities, ["已读取 3 条评论"]);
});

test("realtime work omits the redundant public-data context row", () => {
  assert.doesNotMatch(source, /sb-rw-workflow-context/);
  assert.doesNotMatch(source, /公开数据任务.*无需登录抖音账号/);
});

test("authorization expiry is rendered as an actionable account recovery state", () => {
  assert.equal(typeof realtimeWork.authorizationRecoveryForWork, "function");
  assert.equal(typeof realtimeWork.realtimeWorkDisplayStatus, "function");
  const work = {
    lastError: { code: "DOUYIN_AUTH_EXPIRED", message: "抖音授权已失效" },
    metadata: {
      resumeBlocked: { reason: "authorization_required", message: "抖音账号需要重新连接后，自动获客会继续。" }
    }
  };

  assert.deepEqual(realtimeWork.authorizationRecoveryForWork(work), {
    label: "账号已掉线",
    detail: "抖音账号已掉线，重新连接后会从原任务继续。"
  });
  assert.equal(realtimeWork.realtimeWorkDisplayStatus(work), "auth-expired");
  assert.match(source, /重新连接账号/);
  assert.match(source, /openDouyinAuthorization/);
  assert.match(source, /task\.resume/);
  assert.match(source, /viewer\.status === "auth-expired"/);
  assert.match(source, /function renderAuthorizationRecoveryNotice\(selected, state, onChange\)/);
  assert.match(source, /const recoveryNotice = commentAcquisitionWork \? renderAuthorizationRecoveryNotice\(selected, state, refreshRealtimeView\) : null;/);
  assert.match(source, /if \(recoveryNotice\) root\.appendChild\(recoveryNotice\);/);
});

test("realtime cloud panel uses the latest successful recording instead of a live desktop", () => {
  assert.equal(typeof realtimeWork.isSuccessfulReplayWork, "function");
  assert.equal(realtimeWork.isSuccessfulReplayWork({ state: "done", artifact: "任务已完成" }), true);
  assert.equal(realtimeWork.isSuccessfulReplayWork({ state: "done", artifact: "任务已取消" }), false);
  assert.equal(realtimeWork.isSuccessfulReplayWork({ state: "done", lastError: { message: "失败" } }), false);
  assert.match(source, /listOfficeReplay\(agentId, \{[^}]*successfulOnly:\s*true/);
  assert.match(source, /loadOfficeReplayVideo/);
  assert.match(source, /sb-rw-cloud-replay/);
  assert.match(source, /sb-rw-cloud-capture-source/);
  assert.match(source, /cloudReplayPresentation\(replay, selected\.liveWork\)/);
  assert.match(source, /renderCommentAcquisitionLiveRoomStage\(replay, replayPresentation, selected\.liveWork\)/);
  assert.match(source, /cloudLive\.appendChild\(frame\)/);
  assert.match(source, /录屏采集已连接/);
  assert.doesNotMatch(source, /statusText\.textContent = `\$\{presentation\.statusPrefix\} · \$\{viewer\.message/);
  assert.doesNotMatch(source, /sb-rw-cloud-live-caption/);
  assert.doesNotMatch(source, /最近一次成功工作录屏/);
});

test("realtime cloud replay is scoped to the current task and successful segments", () => {
  assert.match(source, /const taskId = replayTaskIdForWork\(work\);/);
  assert.match(source, /listOfficeReplay\(agentId, \{ taskId, limit: 8, latestOnly: true, successfulOnly: true \}\)/);
  assert.match(source, /durationMs: Number\(data\.durationMs\) \|\| 5_000/);
});

test("initial cloud replay state is explicit before the first successful task", () => {
  assert.equal(typeof realtimeWork.cloudReplayPresentation, "function");
  assert.deepEqual(realtimeWork.cloudReplayPresentation(null, {
    state: "working",
    metadata: { taskState: "running" }
  }), {
    mode: "waiting",
    label: "",
    emptyText: "任务已启动，等待首次成功工作"
  });
  assert.deepEqual(realtimeWork.cloudReplayPresentation({ segments: [{ id: "segment-1" }] }, {
    state: "working",
    metadata: { taskState: "running" }
  }), {
      mode: "replay",
      label: "",
      emptyText: ""
    });
  assert.deepEqual(realtimeWork.cloudReplayPresentation({ segments: [] }, {
    state: "done",
    metadata: { taskState: "completed" }
  }), {
    mode: "empty",
    label: "暂无成功工作",
    emptyText: "暂无成功工作的录屏"
  });
});
