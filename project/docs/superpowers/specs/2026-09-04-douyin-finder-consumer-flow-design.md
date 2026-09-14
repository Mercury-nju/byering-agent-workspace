# Douyin Finder Consumer Flow Design

## Goal

Turn the Douyin finder setup from an API-shaped form into a consumer task entry: describe the target, optionally add a batch of account references, and start real work with one action.

## Product Flow

1. The primary surface asks one question: `你想找什么样的人？`.
2. Users can start from the goal alone. Pasted Douyin profile URLs and uploaded TXT, CSV, TSV, XLS, or XLSX files are optional candidates that are merged into the verification set.
3. Technical controls stay inside a collapsed `高级设置` section.
4. The primary action is `开始找人`; there is no separate plan-generation or review step.
5. The backend searches real account candidates from the goal and merges optional reference accounts before verification. It never creates fake work or fake results.
6. The running view shows only provider-backed counts and terminal states. It does not label supplied references as discovered candidates or show simulated percentages.

## Interaction Details

- Goal input is visually dominant and includes natural-language examples.
- Suggested prompts are one-click helpers, not configuration presets.
- Account references are explicitly described as optional precision helpers. `sec_uid`, API names, refresh flags, and provider implementation details are not shown on the main surface.
- File parsing happens locally and reuses the existing outreach file reader.
- Advanced settings contain optional industry context, analysis depth, content range, date range, live check, and industry context lookup.
- Errors appear next to the action area and explain the next user action.

## Data Flow

The UI sends the target goal and any optional references to `/v1/connectors/douyin-finder/run`. The backend performs real account search, merges deduplicated references, then resolves and enriches every candidate through the Agent Data API.

## Acceptance Criteria

- No visible `Agent Data API`, `sec_uid`, `验证方式`, `强制刷新接口数据`, or `生成执行方案` on the main setup surface.
- `高级设置` is collapsed by default.
- Batch paste and file upload are available.
- A goal-only task starts without requiring a reference account.
- `开始找人` directly starts the real request after validation.
- A missing discovery source never creates a running work record.
- Results and errors remain connected to the existing realtime and result-center contracts.
