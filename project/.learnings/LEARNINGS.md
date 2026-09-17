## [LRN-20260902-001] douyin-private-outreach-stability

**Logged**: 2026-09-02T00:00:00+08:00
**Priority**: high
**Status**: applied
**Area**: backend

### Summary
Login-state success is only a preflight result; private outreach must carry an explicit provider action and expose whether the provider action was attempted, failed, or ended with an unknown outcome.

### Details
The direct MCP request omitted `actionType`, while the complete outreach flow supplied `actionType: 5`. The adapter forwarded the omission as `null`, so the cloud login check could pass while the target action failed before a reliable navigation result was available. The old error mapping then collapsed the provider failure into `私信窗口打开失败`, which encouraged an unsupported assumption that the target homepage had been opened.

### Applied Fixes
- Default outbound private-message calls to provider action type `5` in the Node bridge and Python adapter.
- Reject mismatched `secId` and `secUid` before any provider call.
- Serialize one private-message browser action per Agent/cloud session.
- Retry only transient MCP transport failures, including closed transports, while keeping the same request ID.
- Mark transport failures as `outcome: unknown`; do not report them as a confirmed send failure or success.
- Preserve provider error code, request ID, action type, and execution phase in HTTP responses and UI state.

### Operational Rule
Before reporting success, require the provider's explicit success result. After a transport interruption, do not blindly resend; first query the provider or delivery record using the original request ID.

### Metadata
- Source: user_feedback and successful retry
- Related Files: backend/douyin-mcp.js; backend/http-server.js; src/salebuddy/ui/agent-square.js; /Volumes/SANDISK ELE/tiktok触达系统/social-media-mcp/mcp_data/mcp_adapter.py
- Tags: douyin, private-message, idempotency, rpa, observability

---

## [LRN-20260902-002] product-private-outreach-success-baseline

**Logged**: 2026-09-02T15:20:00+08:00
**Priority**: critical
**Status**: applied
**Area**: frontend, backend, infra, tests

### Summary
The cold-start outreach flow is verified end to end only when the product sends the same minimal target payload as the known-good MCP call and receives an explicit provider success result.

### Details
The product must resolve the user URL to `secId`/`secUid`, preserve those identifiers exactly, verify the selected Agent cloud is logged in and ready, then issue one real `send_private_message` action. The provider's private-message action performs target profile resolution and conversation navigation internally; the product must not invent a separate navigation step or substitute display metadata for the target identifiers.

The failed product path diverged from the successful direct path by adding optional nickname/operator metadata and by allowing competing status probes around the mutating action. Login success alone is never evidence that outreach was attempted. The UI must wait for the real provider result and must not render synthetic percentage progress.

### Applied Fixes
- Keep the product wire payload limited to the target identifiers, content, confirmation, request ID, action type, and timeout.
- Use a fresh provider request ID for every new user-confirmed attempt.
- Use the selected Agent's isolated cloud session and scoped credential; never fall back to another Agent's session.
- Perform authorization readiness checks without queuing a competing local MCP action.
- Surface `provider_action_returned`, `provider_action_failed`, or `outcome: unknown` distinctly.
- Require an explicit provider `SUCCESS` result before reporting delivery.

### Verification
On 2026-09-02, the live product HTTP route sent `你好` to the resolved target and received `SUCCESS / 私信发送成功`, with `targetIdProvided: true` and the target account resolved as `ximi765`. The selected cloud session remained online and logged in. Relevant regression coverage passed: 69 tests, 0 failures.

### Operational Rule
Treat this payload and execution order as the regression baseline. Any future change to target resolution, cloud readiness, provider arguments, status polling, or UI progress must preserve a live product test that reaches an explicit provider success receipt.

### Metadata
- Source: user_feedback and successful live product verification
- Related Files: backend/http-server.js; backend/douyin-mcp.js; src/salebuddy/ui/agent-square.js; scripts/prospect-http.test.mjs; scripts/agent-square-auth-ui.test.mjs
- Tags: douyin, private-message, cold-start, secid, product-flow, regression

---

## [LRN-20260917-001] report-design-feedback-scope

**Logged**: 2026-09-17T10:30:00+08:00
**Priority**: medium
**Status**: applied
**Area**: frontend

### Summary
When a user says a report is not compelling, inspect the information hierarchy and content choreography before proposing naming or product-positioning alternatives.

### Details
The feedback targeted the report's internal composition: generic card repetition, decorative charts, and weak progression from evidence to action. Responding with a choice of product framing missed the requested layer entirely.

### Applied Fixes
- Rebuild the report as an evidence-to-decision narrative rather than a summary dashboard.
- Use visualizations only when they change how the user prioritizes the next live session.
- Keep the Agent presence sparse and reserve first-person language for high-value moments.
- Use one restrained visual system; strong hierarchy must not depend on neon decoration, repeated dark bands, or dense motion.

### Metadata
- Source: user_feedback
- Related Files: src/salebuddy/agents/live-danmaku-analysis-report.js
- Tags: report, information-design, frontend, hierarchy

---
