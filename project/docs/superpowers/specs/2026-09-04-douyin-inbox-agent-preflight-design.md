# Douyin Inbox Agent Preflight Design

## Goal

Prevent the Douyin inbox intake Agent from creating a real task or starting the RPA runtime before the user has supplied enough information and reviewed a real AI-generated intake plan.

This design applies only to `mkt-dm-inbox` (私信承接 / 自动回复专员). It does not change private outreach, comment acquisition, comment screening, or live acquisition flows.

## Problem

The current Agent Square flow has three visual steps, but the second step is only a local summary. The frontend can advance with no effective business knowledge. The backend discovers the missing knowledge only after `beginWork()` has created a real work record and `/v1/douyin/inbox-agent/start` has been called. The user therefore sees a task start and immediately fail with `DOUYIN_REPLY_STRATEGY_REQUIRED`.

The failure is deterministic and belongs in configuration validation, not runtime execution.

## Principles

1. Authorization is access preparation, not task execution.
2. Missing business facts are a configuration problem, not a runtime exception.
3. The plan step must contain a real model interpretation, not a frontend-formatted summary.
4. No realtime work record, activity event, RPA polling loop, or result record may be created before explicit plan confirmation.
5. The backend remains authoritative and revalidates all prerequisites when execution starts.

## User Flow

### Step 1: Complete configuration

The user must provide:

- an authorized Douyin account;
- at least one effective business-knowledge source:
  - one or more enabled long-term knowledge entries; or
  - non-empty task-specific business knowledge;
- the questions that may be answered directly;
- the intended conversation outcome;
- the situations that must be handed to a human.

The business-knowledge requirement cannot be satisfied by generic product defaults. It must contain business-specific facts supplied by the user or explicitly selected from enabled long-term knowledge entries.

The direct-answer scope, conversation outcome, and handoff boundary may be prefilled with visible product defaults, but they must be non-empty and are treated as explicitly confirmed only when the user submits the configuration to generate a plan. Reply tone has a visible product default and does not block progression when that default is present.

The primary action is `生成承接方案`. It remains disabled while account or knowledge data is loading. Clicking it runs frontend validation first. Invalid fields receive inline messages and focus; the flow remains in the configuration step.

### Step 2: AI plan review

After local validation, the frontend calls a new preflight endpoint. The endpoint:

1. verifies the selected Agent account is authorized;
2. reloads the latest effective knowledge for the selected account and Agent;
3. rejects missing or unusable knowledge before any runtime is created;
4. calls the configured model to interpret the intake configuration;
5. returns a structured plan for user review.

The structured plan contains:

- a concise understanding of the business and user intent;
- the direct-answer scope;
- the response priorities;
- the conversation objective;
- the human-handoff boundaries;
- the facts and claims the Agent is allowed to use;
- representative response examples;
- unresolved knowledge gaps and warnings.

Knowledge gaps are classified as `blocking` or `warning`:

- missing configuration fields return a 4xx response with `fieldErrors`; the UI stays in `setup`;
- business gaps discovered by the model return HTTP 200 with a visible plan, `confirmable: false`, and structured `knowledgeGaps`; the UI enters `review` but disables confirmation;
- a plan with no blocking gaps returns `confirmable: true` and may be confirmed.

Neither validation path creates a task.

Editing any relevant configuration after a plan is generated invalidates the plan and requires regeneration.

### Step 3: Confirm and enable

The user explicitly clicks `确认并启用承接`.

Only then does the frontend:

1. create one stable `startRequestId` for this confirmation attempt;
2. call the existing inbox start endpoint with the reviewed configuration, signed plan token, and `startRequestId`;
3. create the realtime work record once, only after the backend confirms that the runtime was accepted or was already started by the same request;
3. open realtime work;
4. start status polling and persist runtime/result events.

The backend repeats authorization and knowledge validation at start time to prevent stale plans. If the configuration changed after planning, it returns a stale-plan error and the UI returns to plan generation instead of recording an execution failure.

Startup is idempotent by `agentId + accountId + planToken + startRequestId`. Repeating the same confirmation cannot create a second polling worker. If the HTTP response is lost or times out, the frontend calls `GET /v1/douyin/inbox-agent/start-status` with the same `agentId` and `startRequestId`; an already accepted runtime is recovered into the running state instead of being started again.

## State Model

The inbox flow uses these explicit states:

- `setup`: editing configuration;
- `planning`: waiting for real AI preflight;
- `review`: reviewing a valid AI plan;
- `starting`: execution was confirmed and the provider start request is in flight;
- `running`: the inbox runtime is active;
- `error`: an infrastructure or provider error occurred after execution confirmation.

Configuration and plan validation errors never transition to `error` and never appear in realtime work or the result center.

## Backend API

### `POST /v1/douyin/inbox-agent/plan`

Input:

- `agentId`;
- `accountId` and account label;
- `replyRule`;
- `replyObjective`;
- `replyTone`;
- `businessKnowledge`;
- `handoffRules`.

Output:

- normalized configuration;
- resolved knowledge metadata;
- structured AI plan;
- `planRevision`, computed only by the backend from normalized configuration plus the content and revisions of the current effective knowledge entries;
- `planToken`, an HMAC-signed, expiring backend credential proving that the real plan endpoint generated this plan;
- `confirmable`;
- warnings and knowledge gaps.

The plan and start paths must use the same backend knowledge resolver. Client-supplied `knowledgeContext` is never authoritative, never counts as authorization or stored knowledge, and cannot satisfy or bypass the knowledge requirement.

The signed plan token records `agentId`, `accountId`, normalized-configuration hash, effective-knowledge revision, `planRevision`, `confirmable`, model source metadata, `generatedAt`, and `expiresAt`. The signature secret is server-only. The start endpoint rejects forged, expired, non-confirmable, wrong-Agent, wrong-account, stale-configuration, and stale-knowledge tokens before calling the provider.

The structured plan schema requires:

- `summary`;
- `directAnswerScope[]`;
- `responsePriorities[]`;
- `conversationObjective`;
- `handoffRules[]`;
- `allowedFacts[]`, each tied to a resolved knowledge source;
- `exampleReplies[]`;
- `knowledgeGaps[]`, each with `severity`, `field`, and `message`;
- model metadata: `source: "model"`, `provider`, `model`, and `generatedAt`.

The model may reorganize and explain supplied facts, but must not add business claims that are absent from the effective knowledge sources.

Field-level validation errors use this shape:

```json
{
  "code": "DOUYIN_INBOX_CONFIGURATION_INCOMPLETE",
  "message": "承接信息还不完整",
  "fieldErrors": [
    { "field": "businessKnowledge", "code": "required", "message": "请填写真实业务信息或选择已有业务知识" }
  ]
}
```

Expected validation errors:

- `DOUYIN_AUTH_REQUIRED`;
- `DOUYIN_REPLY_KNOWLEDGE_REQUIRED`;
- `DOUYIN_INBOX_CONFIGURATION_INCOMPLETE`;
- `DOUYIN_INBOX_PLAN_UNAVAILABLE` when the real model cannot produce a valid structured plan.

The endpoint must not start message mode, polling, or any RPA action.

### `POST /v1/douyin/inbox-agent/start`

The existing endpoint receives `planToken` and `startRequestId`. It verifies the token and recomputes the current revision from the effective inputs and knowledge by using the same resolver as the plan endpoint. A mismatch returns `DOUYIN_INBOX_PLAN_STALE` and starts nothing. A missing or invalid token returns `DOUYIN_INBOX_PLAN_REQUIRED` and starts nothing.

The endpoint persists enough idempotency state to answer whether the specified start request is `not_started`, `accepted`, `running`, or `failed`. A repeated accepted request returns the existing runtime instead of invoking message mode or starting polling again.

### `GET /v1/douyin/inbox-agent/start-status`

Input query:

- `agentId`;
- `startRequestId`.

Output:

- `state`: `not_started | accepted | running | failed`;
- the existing runtime/status snapshot when accepted or running;
- the terminal structured error when failed.

This endpoint is read-only. It never starts message mode, polling, or another worker.

## Model Behavior

The plan generator uses the configured real model transport. It must return validated JSON. Invalid or incomplete model output is repaired once; a second failure returns `DOUYIN_INBOX_PLAN_UNAVAILABLE`.

No local fallback may be presented as an AI-generated plan. If the model is unavailable, the UI clearly says the plan could not be generated and leaves the user in configuration/review preparation.

## Work and Result Boundaries

Before plan confirmation:

- no `beginWork()`;
- no member activity message claiming work started;
- no realtime-work navigation;
- no result-center record;
- no message-mode or polling start.

After plan confirmation:

- accepted start requests appear in realtime work;
- runtime events appear in the member conversation;
- drafts, replies, handoffs, failures, and stops are persisted using the existing inbox result logic.

## UI Copy

- Step labels: `完善接待信息` → `确认 AI 承接方案` → `启用并持续工作`.
- Missing knowledge: `要自动回复私信，需要先告诉我可以使用的真实业务信息。请添加业务知识，或填写本次任务补充。`
- Planning: `正在理解你的业务和接待要求…`.
- Model failure: `承接方案暂时没有生成成功，尚未启动任务。请重试或检查模型配置。`
- Stale plan: `接待信息已经变化，请重新生成承接方案后再启用。`

## Acceptance Criteria

1. Empty effective knowledge cannot reach the review step.
2. A failed plan request creates no work, activity, runtime, or result record.
3. The review screen displays model-generated structured content rather than a local field echo.
4. The start endpoint rejects missing knowledge even if called directly.
5. The start endpoint rejects a stale plan revision and performs no provider action.
6. Confirming a valid current plan starts the real inbox runtime and preserves the existing account authorization.
7. Changing relevant configuration after planning invalidates the plan.
8. Other Agent flows are unchanged.
9. Automated tests cover frontend gating, plan generation, model failure, stale plans, and successful start.
10. A confirmable plan contains real model metadata and no unsupported business claims.
11. Blocking knowledge gaps disable confirmation; warnings remain visible but do not block it.
12. The plan endpoint never invokes message mode, polling, sending, work creation, member activity, or result persistence.
13. Repeating one `startRequestId` creates at most one runtime and one polling worker.
14. A lost start response is recovered through status lookup without starting a duplicate runtime.
15. A caller that skips `/plan` and submits a self-constructed revision/token is rejected before any provider call.
16. Missing form fields stay in setup with field errors; model-discovered blocking gaps produce a non-confirmable review plan.
