# Personal Agent Conversation

## Boundaries

- Nine activated marketplace agents have distinct versioned code-defined character defaults, known job knowledge and immutable purposes/boundaries. No fictional personal history or invented user facts are seeded.
- Personal settings belong to the authenticated tenant and Agent. Owner-facing tone/detail never changes the account-facing reception persona, hours, permissions, frequency caps or stop conditions.
- Chat produces conversation and safe navigation/confirmation cards, not tool execution. It cannot claim a task command was executed by the chat endpoint. Task progress comes from the authoritative office snapshot, including outcome and allowlisted result counts.

## Memory

- Stable facts/preferences are proposed from conversation and require a user selection before persistence. Same-topic corrections replace older facts; proposal revisions prevent stale approvals.
- Maximum 40 active entries, 180 characters each, 180-day expiry. Each has provenance and timestamps. Prompt retrieval is at most 8 entries and 1600 characters; recent conversation is limited to 12 messages. Full chat history is not loaded into the model as unlimited memory.
- Settings changes, editing, forgetting and reset use optimistic concurrency. Forgotten content is excluded from subsequent model history; in-flight replies generated against older preference revisions are discarded.
- Memory collection can be disabled. This stops new learning; existing entries remain individually removable. Reset removes learned preferences while preserving code-defined duties and capabilities.
- User memory UI: 相处方式, 怎么和我说话, 记住我的习惯, 你记得的事. Existing unrelated legacy profile/memory files are not silently imported as confirmed facts.

## Execution

- Trusted preference context is attached server-side, ignoring request-forged preferences.
- Finder ranking preferences only break matched-score ties; actual publishing timestamps drive recency/activity, not follower count. Explicit growth goals and hard filters retain priority.
- Account analysis applies owner-facing tone/detail to explanation only; evidence validation, facts, confidence and limits remain unchanged.
- Other Agents use personal memory in owner conversation and retain their existing execution and account-level policies. No silent rewrite of running jobs or outbound templates.

## Conversation UI

- Office and member chat share real thinking/queued/failed states, retry actions, memory approval cards and settings.
- Completion leaves the conversation usable. New messages animate briefly; reduced-motion settings disable movement. Confirmed work events may show completion labels, not timer-driven fake completion.
- Sending is idempotent with a client message id; per-Agent queues preserve turn order. Server restart converts orphaned thinking states to retryable failure.

## Verification

- Unit and HTTP tests cover default identities, tenant separation, bounded memory/context, forgetting during generation, stale proposal rejection, idempotency, UI lifecycle and trusted execution inputs.
- A real configured model was called with a synthetic owner preference and idle work snapshot. It returned natural Chinese and a memory proposal without starting any execution or sending external private messages.
- Browser screenshots remain blocked by the browser tool's admin-policy verification failure. No alternate browser access is used.
- Final targeted run: 222 passing tests covering companion state, HTTP round trip, cards/settings UI, execution preferences, activity feed, office and contacts, account analysis and navigation. Additional focused tests passed after tightening forgotten-history cutoffs and activity wording. Native office integrity: all 256 frozen files unchanged.
- The unrelated pre-existing chief consultation copy assertion still expects an obsolete phrase; it was not changed as part of this work.
- Live local companion settings endpoint returned HTTP 200. Backend preview still disables historical task auto-resume. No customer-facing messages or acquisition jobs were started for verification.
