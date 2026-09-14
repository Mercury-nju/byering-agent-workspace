# Chief of Staff Conversation Orchestration Design

## Objective

Turn the member-page chief-of-staff conversation into the product's decision and orchestration entry point. The chief understands the user's message, decides whether it is a conversation or a task, asks only for blocking information, assigns real work to available specialist Agents, applies a lenient risk policy, and presents only server-authoritative progress and results.

The chief may answer questions, explain results, and produce planning advice. It must never perform external business actions such as searching accounts, reading private account data, operating a cloud desktop, sending messages, or replying publicly. Those actions belong to specialist Agents.

## Product Principles

1. Default to action and minimize interruption.
2. Read-only and reversible internal work runs without user confirmation.
3. A bounded external-action task is confirmed once, not once per recipient.
4. Only scope expansion, account changes, sensitive commitments, destructive changes, or missing authorization interrupt execution.
5. Every visible state comes from a persisted task, command, or event.
6. If no capable Agent is available, stop and explain the capability gap instead of pretending to execute.

## Input Classification

Every chief message is classified into one of these intents:

- `conversation`: questions, explanations, capability inquiries, result interpretation, and greetings.
- `task`: a new goal that requires one or more specialist Agents.
- `task_update`: a change to an active task's goal, scope, priority, strategy, or schedule.
- `task_control`: pause, resume, retry, stop, or cancel.
- `status_query`: asks about current progress, result, blocker, or assigned Agent.
- `supplement`: supplies requested missing data, links, files, account selection, or constraints.

The classifier returns a structured decision rather than hidden reasoning. It includes confidence, blocking fields, safe defaults, requested action, required capability tags, and a risk decision.

## Risk Policy

Risk is derived from action impact, scope, authorization, content sensitivity, and reversibility.

### Automatic

- Public-data search, collection, filtering, deduplication, analysis, and summarization.
- Reading data already covered by a valid account authorization.
- Internal tags, files, drafts, prioritization, and reports.
- Automatic inbox replies inside an already enabled account strategy.
- Retries that do not expand scope or change the account.
- Execution inside a task-level approval that has already confirmed account, audience, quantity, channel, strategy, frequency, and stop conditions.

### Task-Level Confirmation

- First outbound batch for a selected account and bounded audience.
- Enabling a persistent automated workflow.
- Changing reply strategy, frequency, target audience, or outbound content for future actions.
- Public posting or replying within a bounded, reviewable batch.

### Blocking High Risk

- Missing or expired authorization.
- Recipient, account, channel, or quantity exceeds the confirmed scope.
- Price, refund, contract, inventory, legal, or other binding commitments.
- Complaints, threats, platform enforcement, sensitive personal data, or explicit human requests.
- Contacting a user after rejection, blocking, opt-out, or do-not-contact status.
- Destructive deletion or irreversible overwrite.
- Account resource conflict that cannot be resolved by the configured priority policy.

## Decision Outputs

The decision layer returns:

- `intent`
- `responseMode`: `text`, `supplement_card`, `task_card`, `approval_card`, `status_card`, `recovery_card`, or `result_card`
- `riskLevel`: `low`, `bounded_external`, or `high`
- `confirmationPolicy`: `none`, `once_per_task`, or `blocking`
- `requiredCapabilities`
- `blockingMissing`
- `optionalMissing`
- `defaultsApplied`
- `taskAction`
- `userMessage`

Only `blockingMissing` prevents progress. Optional gaps use explicit defaults and are shown unobtrusively.

## Agent Assignment

Agent selection uses a capability registry built from real Agent manifests and availability. A task plan contains one or more assignments with capability, responsible Agent, dependencies, parallel group, input contract, output contract, and acceptance criteria.

The chief is never selected for external execution. It remains the coordinator and completion reviewer. If no available Agent satisfies a required capability, the plan becomes blocked with a capability-gap recovery card.

## Conversation Presentation

- Plain text: conversation answers, short status explanations, and result interpretation.
- Supplement card: only blocking fields, using choices, account selectors, file upload, or compact text input.
- Task card: interpreted goal, applied defaults, assignments, and expected outputs. Low-risk tasks start automatically.
- Approval card: one bounded confirmation for external actions.
- Status card: current specialist Agent, real stage, real evidence, and blockers.
- Recovery card: failure, completed work, untouched work, and valid next actions.
- Result card: structured business data and next-step actions; not task logs.

## State and Truth

The control plane remains authoritative. Conversation decisions, risk decisions, assignments, approvals, and results are persisted as events. UI buttons send idempotent commands. Online mode must never fall back to the local demo timeline or synthetic progress.

## Acceptance Criteria

1. A question to the chief receives a text answer and does not create a task.
2. A complete read-only request creates and starts a specialist task without a requirement confirmation click.
3. A task with only optional gaps starts with documented defaults.
4. A task with blocking gaps shows a targeted supplement card.
5. A bounded outbound task asks once before execution.
6. A high-risk or out-of-scope action pauses with a clear recovery path.
7. Assignments reference only real, available, capable Agents.
8. The chief never owns an external execution skill or cloud session.
9. Progress and completion require authoritative events and structured results.
10. Existing specialist Agent workflows remain compatible.
