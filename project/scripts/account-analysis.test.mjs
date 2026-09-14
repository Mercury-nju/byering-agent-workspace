import test from "node:test";
import assert from "node:assert/strict";
import { normalizeAnalysisAccounts, buildAccountAnalysisResumeFlow, buildAccountAnalysisBatch, ACCOUNT_ANALYSIS_LIMIT } from "../src/salebuddy/agents/account-analysis-contract.js";
import { createAccountAnalysisService } from "../backend/account-analysis-service.js";
import { isImplementedMarketplaceAgent, isMarketplaceAgentAvailable } from "../src/salebuddy/agents/marketplace.js";
import { createControlPlaneHttpServer } from "../backend/http-server.js";
import { createProspectStore } from "../src/salebuddy/ui/prospect-store.js";
import { createAgentResultRecorder } from "../src/salebuddy/agents/agent-result-recorder.js";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { accountAnalysisReportConversationMessage, accountAnalysisReportFile, buildAccountAnalysisReportHtml } from "../src/salebuddy/agents/account-analysis-report.js";
import { createAgentStore } from "./agent-store.mjs";

const person = { secUid: "person-1", nickname: "公开测试账号", avatarUrl: "https://example.com/avatar.png", profile: { signature: "分享家具选购经验", follower_count: 100 }, evidence: [{ type: "comment", quote: "想了解实木餐桌" }] };
const responseFor = body => {
  const input = JSON.parse(body.messages[1].content);
  return { accounts: input.accounts.map(account => ({ id: account.id, summary: "账号分享家具相关内容。", facts: [{ evidenceId: account.evidence[0].id, quote: account.evidence[0].text }], interpretations: [{ text: "可继续了解其家具需求", evidenceIds: [account.evidence[0].id] }], unknowns: ["尚不能确认预算"], suggestions: ["了解具体需求"] })) };
};
test("normalizes discovery results without losing avatars, evidence or source links", () => {
  const flow = buildAccountAnalysisResumeFlow({ run: { id: "result-1", taskId: "find-1", agentId: "mkt-douyin-finder", title: "寻找上海家居博主 · 找人结果", inputs: { goal: "寻找上海家居博主" }, accounts: [person] } });
  assert.equal(flow.agentId, "mkt-intent-analyst");
  assert.equal(flow.analysisAccounts[0].avatarUrl, person.avatarUrl);
  assert.equal(flow.analysisAccounts[0].source.taskId, "find-1");
  assert.equal(flow.analysisAccounts[0].source.resultId, "result-1");
  assert.equal(flow.sourceTaskTitle, "寻找上海家居博主");
  assert.equal(flow.sourceTaskGoal, "寻找上海家居博主");
  assert.equal(flow.analysisAccounts[0].source.taskTitle, "寻找上海家居博主");
  assert.equal(normalizeAnalysisAccounts([person, { ...person, evidence: [{ quote: "下个月购买" }] }]).length, 1);
  assert.equal(normalizeAnalysisAccounts([person, { ...person, evidence: [{ quote: "下个月购买" }] }])[0].evidence.length, 2);
});

test("batch account analysis preserves unique accounts and enforces the analysis limit", () => {
  const batch = buildAccountAnalysisBatch([
    { secUid: "one", nickname: "账号一" },
    { secUid: "one", nickname: "账号一" },
    { secUid: "two", nickname: "账号二" }
  ]);

  assert.equal(batch.count, 2);
  assert.equal(batch.canAnalyze, true);
  assert.equal(batch.exceedsLimit, false);

  const oversized = buildAccountAnalysisBatch(Array.from({ length: ACCOUNT_ANALYSIS_LIMIT + 1 }, (_, index) => ({ secUid: `account-${index}`, nickname: `账号${index}` })));
  assert.equal(oversized.count, ACCOUNT_ANALYSIS_LIMIT + 1);
  assert.equal(oversized.canAnalyze, false);
  assert.equal(oversized.exceedsLimit, true);
});
test("model analysis reuses supplied public data without calling an account reader or RPA", async () => {
  let request;
  const service = createAccountAnalysisService({ apiKey: "test", dataClient: { profile: async () => assert.fail("Already supplied") }, fetchImpl: async (_url, options) => {
    request = JSON.parse(options.body);
    return { ok: true, text: async () => JSON.stringify({ choices: [{ message: { content: JSON.stringify(responseFor(request)) } }] }) };
  } });
  const result = await service.run({ accounts: [person], goal: "了解账号内容与需求", taskId: "analysis-1" });
  assert.equal(result.status, "completed");
  assert.equal(result.accounts[0].avatarUrl, person.avatarUrl);
  assert.equal(result.accounts[0].report.facts.length, 1);
  assert.equal(result.agentId, "mkt-intent-analyst");
  assert.equal(request.messages[1].role, "user");
});

test("batch analysis isolates model requests per account so long reports are not truncated", async () => {
  const accounts = [
    { ...person, secUid: "person-1", evidence: [{ type: "comment", quote: "想了解实木餐桌" }] },
    { ...person, secUid: "person-2", nickname: "公开测试账号二", evidence: [{ type: "comment", quote: "想了解小户型收纳" }] }
  ];
  let calls = 0;
  const service = createAccountAnalysisService({ apiKey: "test", dataClient: { profile: async () => assert.fail("Already supplied") }, fetchImpl: async (_url, options) => {
    calls += 1;
    const input = JSON.parse(JSON.parse(options.body).messages[1].content);
    if (input.accounts.length > 1) return {
      ok: true,
      text: async () => JSON.stringify({ choices: [{ finish_reason: "length", message: { content: '{"accounts":[' } }] })
    };
    return {
      ok: true,
      text: async () => JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ accounts: input.accounts.map(account => ({ id: account.id, summary: "账号分析完成。", facts: [{ evidenceId: account.evidence[0].id, quote: account.evidence[0].text }], interpretations: [], unknowns: [], suggestions: [] })) }) } }] })
    };
  } });

  const result = await service.run({ accounts, goal: "比较这批账号的内容方向" });

  assert.equal(calls, 2);
  assert.equal(result.status, "completed");
  assert.deepEqual(result.counts, { total: 2, analyzed: 2, insufficient: 0 });
  assert.equal(result.accounts.filter(account => account.report.status === "analyzed").length, 2);
});

test("missing public data is reported as insufficient rather than inferred from a nickname", async () => {
  const service = createAccountAnalysisService({ apiKey: "test", dataClient: { profile: async () => { throw new Error("unavailable"); }, videosLatest: async () => { throw new Error("unavailable"); } }, fetchImpl: async () => assert.fail("No evidence for the model") });
  const result = await service.run({ accounts: [{ secUid: "person", nickname: "Name only" }], goal: "分析" });
  assert.equal(result.status, "partial");
  assert.equal(result.accounts[0].report.status, "insufficient_data");
});
test("rejects invented evidence references and never accepts extra model accounts", async () => {
  const service = createAccountAnalysisService({ apiKey: "test", fetchImpl: async (_url, options) => {
    const value = responseFor(JSON.parse(options.body));
    value.accounts[0].facts[0].evidenceId = "invented";
    return { ok: true, text: async () => JSON.stringify({ choices: [{ message: { content: JSON.stringify(value) } }] }) };
  } });
  await assert.rejects(() => service.run({ accounts: [person] }), error => error.code === "ACCOUNT_ANALYSIS_INVALID_RESULT");
});
test("legacy account analysis remains implemented and fails clearly without a model credential", async () => {
  assert.equal(isImplementedMarketplaceAgent("mkt-research-expert"), true);
  assert.equal(isMarketplaceAgentAvailable("mkt-research-expert"), false);
  const service = createAccountAnalysisService({ apiKey: "" });
  await assert.rejects(() => service.run({ accounts: [person] }), error => error.code === "ACCOUNT_ANALYSIS_NOT_CONFIGURED");
});

test("partial account reports stay in research results and retain the source task", () => {
  const values = new Map();
  const store = createProspectStore({ storage: { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value) } });
  const record = createAgentResultRecorder({ store }).record({ agentId: "mkt-research-expert", taskId: "report-1", status: "partial", title: "账号分析报告", items: [person], accounts: [person], links: { sourceTaskId: "finder-1" } });
  assert.equal(record.resultType, "研究简报");
  assert.equal(record.resultSnapshot.links.sourceTaskId, "finder-1");
  assert.equal(record.resultSnapshot.accounts[0].avatarUrl, person.avatarUrl);
});

test("account analysis produces a reusable HTML report for the file center and product conversation", () => {
  const result = { taskId: "analysis-1", status: "completed", summary: "已分析 1 个账号。", generatedAt: "2026-09-09T10:00:00.000Z", inputs: { goal: "了解内容与需求" }, links: { sourceTaskId: "finder-1", sourceTaskTitle: "寻找上海家居博主", sourceTaskGoal: "寻找上海家居博主" }, accounts: [{ id: "person-1", nickname: "公开测试账号", profileUrl: "https://www.douyin.com/user/person-1", report: { status: "analyzed", summary: "账号分享家具相关内容。", facts: [{ evidenceId: "e1", quote: "想了解实木餐桌" }], interpretations: [{ text: "可继续了解其家具需求", evidenceIds: ["e1"] }], unknowns: ["尚不能确认预算"], suggestions: ["了解具体需求"] } }] };
  const file = accountAnalysisReportFile(result, { createdBy: "抖音账号分析" });
  assert.equal(file.type, "html");
  assert.equal(file.projectName, "账号研究");
  assert.match(file.name, /^抖音账号分析报告-analysis-1\.html$/);
  assert.match(file.content, /<!doctype html>/i);
  assert.match(file.content, /可核对的事实/);
  assert.match(file.content, /来源任务：寻找上海家居博主/);
  assert.equal(file.sourceTaskTitle, "寻找上海家居博主");
  assert.equal(file.sourceTaskGoal, "寻找上海家居博主");
  assert.equal(file.accountCount, 1);
  assert.deepEqual(file.accountNames, ["公开测试账号"]);
  assert.equal(buildAccountAnalysisReportHtml(result), file.content);
  assert.deepEqual(accountAnalysisReportConversationMessage({ ...file, id: "file-analysis-1" }), {
    text: "账号分析报告已完成，已发送到这里，并同步保存到文件中心。",
    artifact: {
      id: "file-analysis-1",
      name: file.name,
      type: "html",
      projectName: "账号研究",
      summary: "已分析 1 个账号。",
      status: "已完成"
    }
  });
});

test("HTTP analysis accepts a linked task and returns the model result without cloud access", async t => {
  let calls = 0;
  const server = createControlPlaneHttpServer({ auth: false, accountAnalysisService: { configured: true, run: async input => { calls++; return { taskId: input.taskId, status: "completed", accounts: input.accounts, links: { sourceTaskId: input.sourceTaskId, sourceTaskTitle: input.sourceTaskTitle, sourceTaskGoal: input.sourceTaskGoal } }; } } });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const body = JSON.stringify({ taskId: "linked", accounts: [person], sourceTaskId: "finder-1", sourceTaskTitle: "寻找上海家居博主", sourceTaskGoal: "寻找上海家居博主" });
  const accepted = await fetch(`${base}/v1/agents/account-analysis/run`, { method: "POST", headers: { "content-type": "application/json" }, body });
  assert.equal(accepted.status, 202);
  let result;
  for (let i = 0; i < 20; i++) {
    result = await fetch(`${base}/v1/agents/account-analysis/runs/linked`).then(r => r.json());
    if (result.status !== "running") break;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.equal(result.status, "completed");
  assert.equal(result.links.sourceTaskId, "finder-1");
  assert.equal(result.links.sourceTaskTitle, "寻找上海家居博主");
  await fetch(`${base}/v1/agents/account-analysis/run`, { method: "POST", headers: { "content-type": "application/json" }, body });
  assert.equal(calls, 1);
});

test("finder completion and results-center selections both open the analysis Agent", () => {
  const square = readFileSync(new URL("../src/salebuddy/ui/agent-square.js", import.meta.url), "utf8");
  const center = readFileSync(new URL("../src/salebuddy/ui/prospect-center.js", import.meta.url), "utf8");
  assert.match(square, /分析这些账号/);
  assert.match(square, /isAccountAnalysisFlow\(agent, flow\)[\s\S]*renderAccountAnalysisSetup/);
  assert.match(center, /分析选中账号/);
  assert.match(center, /分析本批账号/);
  assert.match(center, /最多同时分析/);
  assert.match(square, /flow\.analysisAccounts\.length > 1/);
  assert.match(center, /分析这个账号/);
  assert.match(square, /accountAnalysisReportConversationMessage/);
  assert.match(square, /account-analysis-report/);
  const start = square.slice(square.indexOf("async function startAccountAnalysis"), square.indexOf("function renderLiveLeadSetup"));
  assert.doesNotMatch(start, /startMcpAuthorization|douyinMcpCall|openDouyinAuthorization/);
});

test("customer analyst preserves the selected analysis capability when a flow is resumed", () => {
  const square = readFileSync(new URL("../src/salebuddy/ui/agent-square.js", import.meta.url), "utf8");
  assert.match(square, /function renderIntentAnalystModeChooser\(panel, flow\)/);
  assert.match(square, /function renderStandaloneUserAnalysisSetup\(panel, flow\)/);
  assert.match(square, /analysisKind:\s+saved\?\.analysisKind/);
  assert.match(square, /analysisMode:\s+saved\?\.analysisMode/);
  assert.match(square, /intentCandidates:\s+Array\.isArray\(saved\?\.intentCandidates\)/);
});

test("account analysis results expose a direct path to the saved report file", () => {
  const center = readFileSync(new URL("../src/salebuddy/ui/prospect-center.js", import.meta.url), "utf8");
  assert.match(center, /function openFileCenter\(fileId = null, artifact = null\)/);
  assert.match(center, /打开完整报告/);
  assert.match(center, /framework\?\.openFiles/);
});

test("interactive account analysis starts from one pasted public profile URL", () => {
  const square = readFileSync(new URL("../src/salebuddy/ui/agent-square.js", import.meta.url), "utf8");
  const setup = square.slice(square.indexOf("function renderAccountAnalysisSetup"), square.indexOf("function renderStandaloneUserAnalysisSetup"));
  const start = square.slice(square.indexOf("async function startAccountAnalysis"), square.indexOf("function renderLiveLeadSetup"));
  assert.match(setup, /把一个公开抖音账号交给我/);
  assert.match(setup, /抖音账号主页链接/);
  assert.match(setup, /sb-as-analysis-link-dock/);
  assert.match(setup, /url\.className = "sb-as-analysis-url"/);
  assert.match(setup, /type = "url"/);
  assert.match(setup, /不会触达该账号/);
  assert.doesNotMatch(setup, /选择已有账号|已选择|添加账号链接/);
  assert.match(start, /urls\.length !== 1/);
  assert.match(start, /douyinProfileUrl/);
});

test("standalone user analysis can run against selected users with a required prompt", () => {
  const square = readFileSync(new URL("../src/salebuddy/ui/agent-square.js", import.meta.url), "utf8");
  const setup = square.slice(square.indexOf("function renderStandaloneUserAnalysisSetup"), square.indexOf("function renderAccountAnalysisRunning"));
  const start = square.slice(square.indexOf("async function startAccountAnalysis"), square.indexOf("function renderLiveLeadSetup"));
  assert.match(setup, /分析提示词/);
  assert.match(setup, /生成用户分析报告/);
  assert.match(setup, /analysisAccounts/);
  assert.match(start, /analysisGoal/);
  assert.match(start, /analysisAccounts/);
  assert.match(start, /rawUrl/);
});

test("analysis run lookup is isolated by tenant even with identical task IDs", async t => {
  const server = createControlPlaneHttpServer({ auth: { authenticate: req => ({ tenantId: req.headers["x-test-tenant"], subject: "test" }) }, accountAnalysisService: { configured: true, run: async input => ({ taskId: input.taskId, status: "completed", accounts: input.accounts }) } });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  await fetch(`${base}/v1/agents/account-analysis/run`, { method: "POST", headers: { "content-type": "application/json", "x-test-tenant": "a" }, body: JSON.stringify({ taskId: "private", accounts: [person] }) });
  const other = await fetch(`${base}/v1/agents/account-analysis/runs/private`, { headers: { "x-test-tenant": "b" } });
  assert.equal(other.status, 404);
});

test("a pasted public profile URL in the analysis Agent chat starts a real analysis instead of asking for screenshots", async t => {
  const root = mkdtempSync(join(tmpdir(), "account-analysis-chat-"));
  const store = createAgentStore(root, { seedMessages: false });
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const calls = [];
  const server = createControlPlaneHttpServer({
    auth: false,
    agentStore: store,
    companionGenerator: async () => assert.fail("Profile-link analysis must not use the chat generator"),
    accountAnalysisService: {
      configured: true,
      run: async input => {
        calls.push(input);
        return {
          taskId: input.taskId,
          status: "completed",
          summary: "已分析 1 个账号，0 个资料不足。",
          counts: { total: 1, analyzed: 1, insufficient: 0 },
          accounts: [{ ...input.accounts[0], report: { status: "analyzed", summary: "账号持续发布家居改造内容。" } }]
        };
      }
    }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const profileUrl = "https://www.douyin.com/user/MS4wLjABAAAAunpkE2IXyHAxm4A24G5d1Cf5141pnZy8HwNR5f2-6pl_GYBVR-Pv23uFyfMPB_9I?from_tab_name=main";
  const sent = await fetch(`${base}/v1/direct-messages`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ agentType: "mkt-research-expert", from: "user", text: `分析一下这个人的账号：${profileUrl}` })
  });
  assert.equal(sent.status, 201);
  let messages = [];
  for (let attempt = 0; attempt < 30; attempt += 1) {
    messages = (await fetch(`${base}/v1/direct-messages?agentType=mkt-research-expert`).then(response => response.json())).data.messages;
    if (messages.some(message => /账号分析已完成/.test(message.text))) break;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.equal(calls.length, 1);
  assert.equal(calls[0].accounts[0].profileUrl, profileUrl);
  assert.ok(messages.some(message => /已开始分析这个抖音账号/.test(message.text)));
  assert.ok(messages.some(message => /账号分析已完成/.test(message.text)));
  assert.equal(messages.some(message => /截图|手动资料/.test(message.text)), false);
});

test("opening an analysis chat resumes a profile link sent before the analysis task route existed", async t => {
  const root = mkdtempSync(join(tmpdir(), "account-analysis-chat-recovery-"));
  const store = createAgentStore(root, { seedMessages: false });
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const profileUrl = "https://www.douyin.com/user/MS4wLjABAAAAunpkE2IXyHAxm4A24G5d1Cf5141pnZy8HwNR5f2-6pl_GYBVR-Pv23uFyfMPB_9I?from_tab_name=main";
  const original = store.appendDm("mkt-research-expert", {
    from: "user",
    fromName: "我",
    text: `分析一下这个人的账号：${profileUrl}`
  });
  const calls = [];
  const server = createControlPlaneHttpServer({
    auth: false,
    agentStore: store,
    companionGenerator: async () => assert.fail("Recovered profile-link analysis must not use the chat generator"),
    accountAnalysisService: {
      configured: true,
      run: async input => {
        calls.push(input);
        return { taskId: input.taskId, status: "completed", accounts: [{ ...input.accounts[0], report: { status: "analyzed", summary: "账号有稳定的家居内容输出。" } }] };
      }
    }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  let messages = [];
  for (let attempt = 0; attempt < 30; attempt += 1) {
    messages = (await fetch(`${base}/v1/direct-messages?agentType=mkt-research-expert`).then(response => response.json())).data.messages;
    if (messages.some(message => /账号分析已完成/.test(message.text))) break;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.equal(calls.length, 1);
  assert.equal(calls[0].accounts[0].profileUrl, profileUrl);
  const storedOriginal = store.listDm("mkt-research-expert").find(message => message.id === original.id);
  assert.equal(storedOriginal.metadata.accountAnalysis.status, "completed");
  assert.ok(messages.some(message => /已开始分析这个抖音账号/.test(message.text)));
  assert.ok(messages.some(message => /账号分析已完成/.test(message.text)));
});

test("profile links use the public data client before model analysis", async () => {
  const calls = [];
  const service = createAccountAnalysisService({ apiKey: "test", dataClient: {
    resolve: async url => { calls.push(["resolve", url]); return { data: { account: { sec_uid: "canonical-person" } } }; },
    profile: async id => { calls.push(["profile", id]); return { data: { nickname: "真实主页昵称", signature: "分享家居搭配" } }; },
    videosLatest: async id => { calls.push(["videos", id]); return { data: { videos: [{ aweme_id: "v1", desc: "小户型餐桌搭配" }] } }; }
  }, fetchImpl: async (_url, options) => ({ ok: true, text: async () => JSON.stringify({ choices: [{ message: { content: JSON.stringify(responseFor(JSON.parse(options.body))) } }] }) }) });
  const result = await service.run({ accounts: ["https://www.douyin.com/user/person"] });
  assert.deepEqual(calls, [["resolve", "https://www.douyin.com/user/person"], ["profile", "canonical-person"], ["videos", "canonical-person"]]);
  assert.equal(result.accounts[0].nickname, "真实主页昵称");
  assert.equal(result.accounts[0].analysisEvidence.length, 2);
});

test("direct profile lookup fails instead of creating an empty insufficient-data report", async () => {
  const service = createAccountAnalysisService({ apiKey: "test", dataClient: {
    resolve: async () => { const failure = new Error("account not found (status_code=2)"); failure.code = "DOUYIN_AGENT_DATA_2001"; throw failure; },
    profile: async () => assert.fail("Profile should not be requested after resolve fails")
  }, fetchImpl: async () => assert.fail("No model request is valid without public evidence") });
  await assert.rejects(
    () => service.run({ accounts: ["https://www.douyin.com/user/stale-account"] }),
    error => error.code === "ACCOUNT_ANALYSIS_ACCOUNT_NOT_FOUND" && /主页链接是否正确/.test(error.message)
  );
});
