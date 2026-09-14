## [ERR-20260902-001] douyin-mcp-transport-closed

**Logged**: 2026-09-02T00:00:00+08:00
**Priority**: high
**Status**: mitigated
**Area**: infra

### Summary
The external Douyin MCP transport returned `Transport closed` during status and start calls.

### Context
The saved cloud session and login state were still valid. Reusing the local Node bridge with the saved session restored status to `logged_in` and allowed a confirmed private-message send.

### Suggested Fix
Treat closed MCP transports as transient, recreate the worker/channel connection, and preserve the original request ID before deciding whether a mutating action may be retried.

### Metadata
- Reproducible: intermittent
- Related Files: backend/douyin-mcp.js; backend/http-server.js
- See Also: LRN-20260902-001

---
