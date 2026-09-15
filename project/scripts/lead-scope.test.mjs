import test from "node:test";
import assert from "node:assert/strict";
import { createProspectService } from "../backend/prospect-service.js";
import { COMMENT_SOURCE_DIMENSIONS, COMMENT_SOURCE_OWNERS, commentSourcePayload, commentSourceScope, leadMinerRequestLimits, leadMinerResultState, limitForScope, normalizeRecentWorkCount, parseCommentSource, parseCommentSources, validateLeadMinerSetup, workScopeLabel } from "../src/salebuddy/ui/lead-scope.js";

test("comment source payload distinguishes own and public account scans", () => {
  const own = commentSourcePayload({
    commentSourceOwner: COMMENT_SOURCE_OWNERS.OWN,
    commentSourceDimension: COMMENT_SOURCE_DIMENSIONS.ACCOUNT,
    accountId: "douyin-agent:mkt-lead-miner",
    account: "我的账号",
    accountIdentity: { profileUrl: "https://www.douyin.com/user/owner", secId: "owner" },
    workScope: "最近30条作品"
  });
  assert.equal(own.sourceScope, "own_account_comments");
  assert.equal(own.analysisOnly, false);
  assert.equal(own.accountId, "douyin-agent:mkt-lead-miner");
  assert.equal(own.profileUrl, "https://www.douyin.com/user/owner");

  const other = commentSourcePayload({
    commentSourceOwner: COMMENT_SOURCE_OWNERS.OTHER,
    commentSourceDimension: COMMENT_SOURCE_DIMENSIONS.ACCOUNT,
    accountRef: "https://www.douyin.com/user/public",
    account: "公开账号",
    accountResolveStatus: "ready",
    workScope: "最近10条作品"
  });
  assert.equal(other.sourceScope, "public_content");
  assert.equal(other.analysisOnly, true);
  assert.equal(other.videoLimit, 10);
  assert.equal(commentSourceScope({ commentSourceOwner: "other" }), "public_content");
});

test("specific work scans accept multiple public Douyin work links", () => {
  const payload = commentSourcePayload({
    commentSourceOwner: "other",
    commentSourceDimension: "works",
    commentWorkInput: "https://www.douyin.com/video/123456789 https://www.douyin.com/note/987654321"
  });
  assert.deepEqual(payload.videoIds, ["123456789", "987654321"]);
  assert.equal(payload.videoLimit, 2);
  assert.equal(payload.analysisOnly, true);
  assert.equal(parseCommentSources("https://www.douyin.com/video/123456789").kind, "videos");
});

test("lead miner setup validates the selected owner and dimension", () => {
  assert.deepEqual(validateLeadMinerSetup({
    audienceTypes: ["问价格的人"],
    commentSourceOwner: "own",
    commentSourceDimension: "account",
    accountId: "account-1",
    accountIdentity: { secId: "owner" },
    workScope: "最近30条作品"
  }), null);
  assert.deepEqual(validateLeadMinerSetup({
    audienceTypes: ["问价格的人"],
    commentSourceOwner: "other",
    commentSourceDimension: "works",
    commentWorkInput: "https://www.douyin.com/video/123456789"
  }), null);
});

test("comment lead miner can be restricted to an authorized account", () => {
  const publicFlow = {
    audienceTypes: ["问价格的人"],
    commentSourceOwner: "other",
    commentSourceDimension: "account",
    accountRef: "https://www.douyin.com/user/public",
    accountResolveStatus: "ready"
  };
  assert.deepEqual(validateLeadMinerSetup(publicFlow, { requireOwnAccount: true }), {
    field: "account",
    message: "评论区找客户只能读取已授权账号的作品评论"
  });
  assert.throws(
    () => commentSourcePayload(publicFlow, { requireOwnAccount: true }),
    /评论区找客户只能读取已授权账号的作品评论/
  );

  const ownWorkPayload = commentSourcePayload({
    audienceTypes: ["问价格的人"],
    commentSourceOwner: "own",
    commentSourceDimension: "works",
    commentWorkInput: "https://www.douyin.com/video/123456789",
    accountId: "douyin-agent:mkt-lead-miner",
    account: "我的账号",
    accountIdentity: { uid: "owner-uid", secId: "owner-sec", profileUrl: "https://www.douyin.com/user/owner" }
  }, { requireOwnAccount: true });
  assert.equal(ownWorkPayload.sourceScope, "own_account_comments");
  assert.equal(ownWorkPayload.analysisOnly, false);
  assert.equal(ownWorkPayload.accountId, "douyin-agent:mkt-lead-miner");
  assert.equal(ownWorkPayload.secId, "owner-sec");
  assert.deepEqual(validateLeadMinerSetup({
    audienceTypes: ["问价格的人"],
    commentSourceOwner: "own",
    commentSourceDimension: "works",
    commentWorkInput: "https://www.douyin.com/video/123456789",
    accountId: "douyin-agent:mkt-lead-miner"
  }, { requireOwnAccount: true }), null);
});

test("single work links bypass stale account identity and recent-work limits", () => {
  const flow = { accountRef: "分享作品 https://www.douyin.com/video/1234567890123456789", account: "stale profile", product: "问价", workScope: "自定义条数", workCount: 0 };
  assert.equal(validateLeadMinerSetup(flow), null);
  assert.deepEqual(commentSourcePayload(flow), {
    sourceScope: "public_content",
    sourceOwner: "other",
    sourceDimension: "works",
    analysisOnly: true,
    videoIds: ["1234567890123456789"],
    videoUrls: ["https://www.douyin.com/video/1234567890123456789"],
    videoLimit: 1
  });
  assert.equal(parseCommentSource("https://www.douyin.com/note/123456789").kind, "video");
  assert.equal(parseCommentSource("https://www.douyin.com/?modal_id=123456789").kind, "video");
  assert.deepEqual(parseCommentSource("https://www.douyin.com/jingxuan?modal_id=123456789"), {
    kind: "video",
    url: "https://www.douyin.com/video/123456789",
    videoId: "123456789"
  });
});
test("profile source stays scoped to its author and unsupported links fail clearly", () => {
  assert.equal(commentSourcePayload({ accountRef: "https://www.douyin.com/user/test", workScope: "最近10条作品" }).videoLimit, 10);
  assert.equal(parseCommentSource("https://douyin.com.evil.test/video/123").kind, "invalid");
  assert.match(parseCommentSource("https://v.douyin.com/abcd/").message, /短链接/);
});

test("single-work UI payload reads only that work's comments without resolving an author", async () => {
  const calls = [];
  const service = createProspectService({
    accountResolver: { resolve: async () => assert.fail("single work must not resolve a profile") },
    connector: { configured: true, videoList: async () => assert.fail("single work must not list author videos"),
      comments: async input => { calls.push(input); return { data: { comments: [{ aweme_id: "1234567890123456789", uid: "buyer", text: "多少钱" }] } }; } }
  });
  const payload = commentSourcePayload({ accountRef: "https://www.douyin.com/video/1234567890123456789", account: "old author", workScope: "最近50条作品" });
  await service.discover({ taskId: "single-work-test", taskRunId: "single-work-run", conversationId: "single-work-chat", goal: "找问价的人", ...payload });
  assert.equal(calls.length, 1); assert.deepEqual(calls[0].videoIds, ["1234567890123456789"]);
  assert.equal(calls[0].profileUrl, undefined);
});

test("recent-work scope converts preset and custom counts into a bounded limit", () => {
  assert.equal(limitForScope("最近10条作品", 30), 10);
  assert.equal(limitForScope("最近50条作品", 30), 50);
  assert.equal(limitForScope("自定义条数", 73), 73);
  assert.equal(limitForScope("自定义条数", 999), 300);
  assert.equal(normalizeRecentWorkCount("0"), 1);
  assert.equal(normalizeRecentWorkCount("abc"), 30);
  assert.equal(workScopeLabel("自定义条数", 73), "最近73条作品");
});

test("lead miner request limits the number of works and keeps the comment sample bounded", () => {
  assert.deepEqual(leadMinerRequestLimits("最近3条作品"), { videoLimit: 3, commentLimit: 50 });
  assert.deepEqual(leadMinerRequestLimits("自定义条数", 90), { videoLimit: 90, commentLimit: 50 });
});

test("lead miner distinguishes an empty window from a completed scan", () => {
  assert.equal(leadMinerResultState({ counts: { videos: 0, comments: 0, candidates: 0 } }), "empty");
  assert.equal(leadMinerResultState({ counts: { videos: 3, comments: 0, candidates: 0 } }), "no_comments");
  assert.equal(leadMinerResultState({ counts: { videos: 3, comments: 50, candidates: 0 } }), "no_match");
  assert.equal(leadMinerResultState({ counts: { videos: 3, comments: 50, candidates: 12 } }), "complete");
});

test("lead miner setup accepts a freeform target when no preset audience fits", () => {
  assert.equal(validateLeadMinerSetup({
    audienceTypes: [],
    accountRef: "https://www.douyin.com/user/example",
    accountResolveStatus: "ready",
    product: "负面评价的人",
    workScope: "最近30条作品",
    workCount: 30
  }), null);
});

test("lead miner setup explains when neither audience nor freeform target is provided", () => {
  assert.deepEqual(validateLeadMinerSetup({
    audienceTypes: [],
    accountRef: "https://www.douyin.com/user/example",
    accountResolveStatus: "ready",
    product: "",
    workScope: "最近30条作品",
    workCount: 30
  }), {
    field: "audience",
    message: "先选一类想找的人或留言"
  });
});
