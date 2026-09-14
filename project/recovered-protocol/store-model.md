# Recovered Renderer Store Model

The production bundle exposes `window.__STORE__`, `window.__STORE_STATE__`, `window.__TAB_ROUTERS__`, `window.__HISTORY_TRACKERS__`, and `window.__ROUTE__` for its own runtime integration.

The top-level store model recovered from the bundle is:

```text
legacy
app
componentUpdate
component
docPreviewProgress
gallery
gateway
setting
hotWords
localDisk
localLLM
location
feedback
messageBox
privacy
mobile
tab
skill
weixin
autoTask
inviteCode
ioaAuth
window
conversations
sessionList
slashCommandData
featureSwitch
```

Important initial state observed in call sites:

- `gateway`: token, port, and connection status used to build the local WebSocket URL.
- `skill`: skills, loading/error flags, install/update/delete queues, recent-use records, and pending input/segments.
- `weixin`: status, account ID, conversation IDs, cooldown, QR-code URL/key/status, and loading state.
- `window`: `isMaximized`.
- `featureSwitch`: `luckin_ordering_switch` is read from `switch.action.get`.
- `slashCommandData`: MCP tools, recommended skills, recommended MCP tools, and in-flight MCP state.

The bundle also defines tab-router constants and route title mappings. The exact reducer implementation is not present as source; this file records only fields visible in the packaged code.

