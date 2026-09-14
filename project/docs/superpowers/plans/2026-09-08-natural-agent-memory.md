# Natural Agent Memory

Supersedes the fixed-capacity and approval-per-fact design in 2026-09-08-agent-companion.md.

## Implemented

- Natural conversation extraction uses atomic facts, subject attribution and exact source quotations from the current user message. Explicit remember requests get priority. Guesses, third-party observations and sensitive content are not promoted by default.
- No 40-item storage cap and no blanket 180-day expiry. Legacy arbitrary expiry is removed on migration. Stable facts persist; explicitly time-bounded notes have real deadlines.
- Facts have separate topics, provenance, timestamps and correction targets. Same-topic updates preserve identity; unrelated facts in a category coexist. Explicit instructions are protected from weaker observations.
- Recall is separate from storage. Chinese word segmentation ranks relevant memories under a character budget. Older relevant user messages can be retrieved outside the recent conversation window. This is lexical relevance retrieval, not a claim of ChatGPT's private architecture or a semantic vector index.
- Auto-saved memory produces a small update notice with revision-safe undo, not an approval card. Settings show the source as natural conversation or an explicit instruction. Chat can forget recalled facts; settings can manage all facts.
- Forgetting/undo maintains a source-history cutoff, including the forget response, so older text cannot be silently re-extracted. This conservative cutoff also prevents unrelated older chat recall, while other stored facts remain usable.
- Real finder and analysis requests retrieve preferences using the actual task goal. Safety constraints and account-facing policies remain separate.

## Scope And Limits

- Extraction runs during a conversation turn and does not reprocess all past conversations in a background dreaming job.
- Model extraction is fallible despite evidence validation; users can correct and undo it. Uncertain inferred preferences are not automatically promoted in this version.
- There is no cross-Agent shared memory yet: existing tenant/Agent isolation is preserved, not silently relaxed.
- Storage is no longer capped by fact count; reads currently use the existing local JSON store. Large-scale indexing, storage quotas and archival policies require a dedicated follow-up before multi-year high-volume deployment.

## Verification

- Real configured model extracted the business and service region from a natural synthetic statement without a remember command. No business task or external private message was started.
- Tests cover over-40 retention, old-history retrieval, isolation, real expiry, undo, explicit priority, disablement and forgetting source barriers.
- Native office assets remain unchanged. Browser visual checks remain unavailable due to admin policy verification failure; no workaround was used.
