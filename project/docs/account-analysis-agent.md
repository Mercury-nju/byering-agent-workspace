# Account Analysis Agent

`mkt-research-expert` is enabled as an analysis Agent, not an RPA task.

## Flow

- Finder results expose "analyze these accounts". Results Center supports a
  single discovered person, a selected customer list, or an entire result.
- The handoff retains stable account IDs, avatars, supplied public profile
  fields, original quotes, videos and source Agent/task/result IDs.
- The setup accepts one public Douyin profile URL and an analysis goal. It does
  not request an operating account, account-library selection, or cloud session.
- Supplied evidence is reused. Bare profile links may be enriched by the
  existing public account-data API, never browser automation or private inboxes.
- The model separates verbatim evidence, interpretations, unknowns and suggested
  next steps. Facts must quote the referenced evidence; unknown account IDs or
  fabricated evidence references cause validation failure.
- Reports are recorded separately in research results, with links to the
  original discovery. Insufficient-data reports remain research reports.

## Runtime

`POST /v1/agents/account-analysis/run` starts a tenant-scoped, idempotent job.
`GET /v1/agents/account-analysis/runs/{taskId}` returns its status and result.
The in-memory job cache follows the existing finder pattern and is bounded to
100 jobs. Completed reports persist through the existing Results Center store.
A server restart during analysis requires rerunning the job; no automatic
outbound action is performed by this Agent.

Uses `BYERING_LLM_API_KEY` and existing LLM endpoint/model configuration.
Optional profile enrichment uses `BYERING_DOUYIN_AGENT_DATA_*`, not a dedicated
Douyin RPA credential. The interactive flow analyzes one pasted profile URL at
a time; linked result records may retain source evidence for context.

## Verification

Tests cover normalization, cross-source deduplication, model evidence validation,
insufficient data, linked HTTP jobs and Results Center persistence. A real model
smoke test on 2026-09-08 used explicitly fictional QA input and returned valid
facts, interpretations and unknowns; it did not contact a Douyin account.
