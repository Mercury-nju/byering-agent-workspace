# Conversation Checkpoint Cards Design

## Goal

Improve the task conversation UI by replacing long, state-heavy text at critical checkpoints with compact interactive cards while preserving ordinary human conversation as natural messages.

## Product principles

1. Conversation remains the primary surface. Ordinary explanations, follow-up questions, and employee findings stay as messages.
2. Cards are reserved for checkpoints that require orientation, a decision, recovery, or a handoff.
3. One state has one visual owner. A status already shown in the progress card must not be repeated as a protocol-like message.
4. Every blocking card explains what happened, what is affected, and what the user can do next.
5. Technical lifecycle vocabulary such as `RUN_STARTED`, `Executor`, or internal event names never appears in the UI.

## Checkpoint card system

### 1. Requirement confirmation card

Appears for every new task that enters the homepage task runner, after the chief of staff has understood the request and before execution. Ordinary informational follow-ups that never enter the task runner are outside this card flow and do not show a requirement card.

Content:

- Task goal
- Data or account scope
- Deliverables
- Stop boundary
- Optional missing-information notice

Actions:

- `修改要求`
- `确认并开始`

The card is therefore never conditionally skipped inside the task runner. The distinction is made by the existing entry path: task-runner submissions show the card; ordinary native chat follow-ups do not.

### 2. Live progress card

One persistent card is created when execution begins. It is updated in place rather than inserting a new message for every lifecycle event.

Collapsed state:

- Overall status and completed member count
- Overall progress
- Current active employee and current action
- `展开工作记录`

Expanded state:

- Each employee avatar, name, task, status, and progress
- Latest meaningful event or evidence
- Generated artifact link when available

The default state is collapsed after the first meaningful employee update. The user can expand or collapse it without losing scroll position.

### 3. Approval card

Appears only before an external or consequential action.

Content:

- Action being requested
- Impact scope
- Channel or destination
- Risk or irreversible effect
- Preview or details entry

Actions:

- `查看内容`
- `暂不执行`
- `确认执行`

`暂不执行` resolves the approval as rejected and marks the progress card as paused. The resolved card exposes `调整需求并创建后续任务`, which only focuses the existing composer and pre-fills a follow-up instruction. The user submits that instruction through the normal homepage task-runner entry path, which creates a separate task with a new task ID; the original rejected task is never resumed. This phase does not claim that a rejected approval can be revised and reopened in place.

### 4. Recovery card

Appears when execution fails or is blocked.

Content:

- Plain-language failure summary
- Work already preserved
- Exact step that did not complete

Actions are contextual and may include:

- `补充信息`
- `修改范围`
- `交给人工`

This UI phase does not introduce checkpoint retry orchestration. Recovery actions reuse the existing conversation follow-up and handoff behavior: they preserve the visible completed steps, keep the task paused, and collect the user's new instruction. A future runtime-resume capability may add `重新尝试`, but the card must not present an action the current runtime cannot execute safely.

### 5. Result card

Appears at task completion and leads with business outcomes rather than completion protocol.

Content:

- Up to three headline findings or metrics; when none exist, show a concise outcome statement instead
- Deliverable files
- Short explanation of what was completed
- Recommended next step

Actions:

- `查看全部结果`
- A contextual continuation such as `继续生成话术`
- `创建后续任务`

After completion, the live progress card remains as a compact completed audit trail, while a separate result card becomes the sole owner of outcomes, files, and next actions. The generic `run finished` text bubble is suppressed. The composer placeholder changes to `继续追问结果，或安排下一步工作…`.

## Message behavior

- Immediately after sending, show a lightweight chief-of-staff thinking state so the user never sees an unexplained blank interval.
- Replace that temporary state with the first real response rather than leaving both visible.
- Employee messages appear only for a meaningful finding, changed condition, completed handoff, or user-relevant risk.
- Acceptance, start, generic progress, and employee-step completion lifecycle events update the progress card only. Task summary events create the result card; task-finished protocol events do not create an additional message.
- New events auto-scroll only when the user is already near the bottom. Reading older content is never interrupted.

## Visual language

The direction is restrained operational clarity, consistent with the existing Byering interface.

- Neutral white and soft-gray surfaces
- Blue for active work
- Green for completed work
- Amber for decisions and approvals
- Red only for blocked or failed states
- Compact 12–14 px metadata, 14–15 px conversation text
- Corner radii remain within the product's existing restrained range
- Motion is limited to in-place progress updates, short card entry transitions, and reduced-motion support

## Accessibility

- Cards use semantic regions with accessible labels.
- Progress uses `role="progressbar"` and live updates use `aria-live="polite"`.
- All actions are real buttons with visible keyboard focus.
- Expanded state uses `aria-expanded` and `aria-controls`.
- Status must never depend on color alone.

## Data and rendering boundaries

- Existing task runtime events remain the source of truth.
- A presentation reducer maps runtime events into five checkpoint view models.
- The renderer updates an existing checkpoint node by stable task/checkpoint key.
- No new persistence model or backend API is introduced.
- Existing artifact, approval, and follow-up actions are reused.

## Event and UI transition contract

| Runtime input | Checkpoint owner | UI transition |
| --- | --- | --- |
| `requirement-required` | Requirement card | Create once and block execution until explicit confirmation |
| `requirement-confirmed` | Requirement card | Resolve in place, remove actions, then allow the existing runtime to continue |
| `progress-start` | Progress card | Create once in expanded state |
| `sub-show`, `sub-started`, `sub-log`, `sub-done` | Progress card | Update the matching employee row in place; meaningful `sub-log` findings may still create a natural employee message |
| `progress` | Progress card | Update the existing runtime percentage; if a percentage is absent, show an indeterminate active bar rather than deriving one |
| `approval-show` | Approval card | Create once and pause at the existing approval gate |
| `approval-resolved` | Approval card and progress card | Resolve the approval in place; approved continues, rejected changes progress to paused and offers `调整需求并创建后续任务`, which pre-fills the existing homepage task composer for a separate task |
| `sub-error`, `task-error`, `task-blocked`, `auth-cancelled` | Recovery card and progress card | Mark progress paused/failed and create or update one recovery card; do not claim automatic retry support |
| `file` | Progress/result attachment model | Add the artifact to the current progress details; once summary exists, surface it in the result card without a duplicate standalone bubble |
| `summary` | Result card | Create one result card and convert progress to its compact completed audit state |
| `run-finished` | Progress card | Mark completion only; do not create a separate completion message |

## Requirement gate rules

- Every new task launched through the homepage task runner receives the existing `requirement-required` event and therefore shows the requirement card.
- Follow-up messages inside an existing conversation never create a second requirement card.
- Required fields are task description, business objective, deliverable, and stop boundary. Data scope is optional and displays `按已授权的最小范围` when absent.
- A required field is missing only when its value is `null`, `undefined`, an empty/whitespace-only string, or one of the explicit placeholders `待确认`, `需要补充`, or `未填写`. Missing fields display `需要补充`, disable `确认并开始`, and focus the composer through `补充信息`.
- The requirement event and runtime brief remain the source of truth; the presentation layer does not guess whether a task is simple or consequential.

## Verification

Automated tests must verify:

- Lifecycle-only events update the progress card without creating duplicate text messages.
- Requirement, approval, failure, and completion states map to the correct card type and actions.
- Approval rejection exposes a visible action for creating an adjusted follow-up task without implying the rejected action will resume.
- A requirement card with a `需要补充` field cannot confirm execution.
- Progress card expansion preserves current state.
- Completion changes the composer placeholder.
- Completion produces one result card and no duplicate finished message.
- Approval follow-up only pre-fills the composer; submitting it creates a new task and leaves the rejected task paused.
- Internal protocol vocabulary is absent from visible conversation rendering.
- Keyboard and ARIA attributes exist for interactive cards.

Manual checks must cover desktop and mobile layouts, long employee names, long task descriptions, expanded progress details, recovery follow-up actions, approval rejection, and reduced-motion mode.
