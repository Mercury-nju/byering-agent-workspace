# Office Runtime Integration

Approved scope: preserve native office assets and six physical seats. Use backend-observed task state for labels, animation and workspace. Never start, pause or resume real tasks from visualization code.

1. Add a tenant-scoped, read-only status projection from active acquisition runners, inbox runtimes and request-owned discovery/analysis/outreach tasks. Persisted running records without a runner are unknown.
2. Poll one office status store; share its snapshot across labels and workspace. Failures and stale responses produce unknown status, not fabricated idle or working states.
3. Assign stable dynamic seats. Promote newly active agents into idle seats; expose additional office areas when necessary without changing task execution.
4. Adapt existing scene APIs to real state. Suppress the native demonstration task scheduler while retaining native rendering and assets. Restore scheduler on detach.
5. Verify state transitions, tenant isolation, stale requests, seat admission, paging and scene restoration with tests. Check frozen office assets. Attempt browser verification using the approved browser tool only.

## Verification

- Implemented the status endpoint, request lifecycle observations, acquisition runner liveness, office status store, paged seat bindings and native scene adapter.
- 221 targeted regression tests passed. The existing unrelated chief consultation copy assertion in control-plane-http.test.mjs still expects an outdated phrase and was not changed.
- Frozen office integrity check passed for all 256 baseline files.
- Local backend status endpoint returned HTTP 200 with nine agents and zero active tasks. Historical acquisition records without live runners were reported as unknown. Preview startup retains auto-resume disabled; no real outreach was triggered for verification.
- Browser inspection was blocked by the browser tool's unavailable admin policy check. Desktop/mobile screenshots and actual canvas rendering remain unverified; no alternate browser access was used.
