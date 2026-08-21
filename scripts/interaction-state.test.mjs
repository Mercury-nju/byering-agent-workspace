import assert from "node:assert/strict";
import test from "node:test";

import {
  INTERACTION_STATES,
  createInteractionState,
  reduceInteractionState
} from "../src/salebuddy/runtime/interaction-state.js";

function reduce(events, initial = {}) {
  return events.reduce((state, event) => reduceInteractionState(state, event), createInteractionState(initial));
}

test("interaction state keeps the requirement and access gates explicit", () => {
  const state = reduce([
    { t: "user" },
    { t: "requirement-required" },
    { t: "requirement-confirmed" },
    { t: "assignment-plan" },
    { t: "auth-required" },
    { t: "scope-confirmed" },
    { t: "progress-start" }
  ], { taskId: "interaction-gate-1" });

  assert.equal(state.taskState, INTERACTION_STATES.SEARCHING);
  assert.equal(state.stage, "finding");
  assert.equal(state.pendingAction, null);
  assert.equal(state.taskId, "interaction-gate-1");
});

test("approval, pause, resume, retry and handoff form recoverable task transitions", () => {
  const waiting = reduce([{ t: "approval-show", approval: { id: "approval-1" } }]);
  assert.equal(waiting.taskState, INTERACTION_STATES.WAITING_APPROVAL);
  assert.equal(waiting.pendingAction, "approval");

  const paused = reduce([
    { t: "approval-show", approval: { id: "approval-1" } },
    { t: "approval-resolved", ok: false },
    { t: "task-paused", reason: "用户暂停" }
  ]);
  assert.equal(paused.taskState, INTERACTION_STATES.PAUSED);
  assert.equal(paused.pendingAction, "resume");

  const resumed = reduce([
    { t: "task-paused", reason: "网络异常" },
    { t: "task-resumed" },
    { t: "task-retry-requested", attempt: 2 }
  ]);
  assert.equal(resumed.taskState, INTERACTION_STATES.RUNNING);
  assert.equal(resumed.pendingAction, null);
  assert.equal(resumed.retryCount, 1);

  const handoff = reduce([{ t: "handoff", reason: "客户要求人工" }]);
  assert.equal(handoff.taskState, INTERACTION_STATES.HANDOFF);
  assert.equal(handoff.relationshipState, "HUMAN_TAKEOVER");
  assert.equal(handoff.pendingAction, "human");
});

test("lead and outreach dimensions remain visible through send, reply and suppression", () => {
  const sent = reduce([
    { t: "progress-start" },
    { t: "lead-qualified", score: 88, tier: "Hot" },
    { t: "outreach-ready" },
    { t: "outreach-scheduled", at: "2026-08-18T10:00:00Z" },
    { t: "outreach-sending" },
    { t: "outreach-sent", deliveryState: "submitted" }
  ]);

  assert.equal(sent.taskState, INTERACTION_STATES.SENT);
  assert.equal(sent.leadState, "QUALIFIED");
  assert.equal(sent.leadScore, 88);
  assert.equal(sent.leadTier, "Hot");
  assert.equal(sent.outreachState, "SENT");
  assert.equal(sent.deliveryState, "submitted");

  const replied = reduce([
    { t: "outreach-sent", deliveryState: "delivered" },
    { t: "lead-replied", replyText: "想了解具体方案" }
  ]);
  assert.equal(replied.taskState, INTERACTION_STATES.HANDOFF);
  assert.equal(replied.relationshipState, "REPLIED");
  assert.equal(replied.outreachState, "STOPPED");
  assert.equal(replied.followUpState, "STOPPED");
  assert.equal(replied.replyText, "想了解具体方案");

  const suppressed = reduce([{ t: "lead-do-not-contact", reason: "用户拒绝" }]);
  assert.equal(suppressed.leadState, "DO_NOT_CONTACT");
  assert.equal(suppressed.outreachState, "BLOCKED");
  assert.equal(suppressed.riskState, "REJECT");
});

test("terminal task states preserve the last business dimensions", () => {
  const failed = reduce([
    { t: "lead-qualified", score: 72, tier: "Warm" },
    { t: "outreach-failed", errorCode: "UNAVAILABLE", retryable: true }
  ]);

  assert.equal(failed.taskState, INTERACTION_STATES.FAILED);
  assert.equal(failed.outreachState, "FAILED");
  assert.equal(failed.errorCode, "UNAVAILABLE");
  assert.equal(failed.retryable, true);
  assert.equal(failed.leadTier, "Warm");
});

test("follow-up streaming transitions from pending to answered without losing its id", () => {
  const state = reduce([
    { t: "followup-waiting", followupId: "followup-1" },
    { t: "followup-stream-start", followupId: "followup-1" },
    { t: "followup-stream-delta", followupId: "followup-1", text: "下一步" },
    { t: "followup-stream-end", followupId: "followup-1", text: "下一步建议" }
  ]);

  assert.equal(state.followUpState, "ANSWERED");
  assert.equal(state.pendingFollowupId, null);
});
