# SaleBuddy 源码层（src/salebuddy）

本目录是 SaleBuddy 改造中**唯一允许新增业务代码**的位置。

## 分层规则（硬性）

1. **不得** import、patch 或以任何方式修改办公室相关 bundle 与资源
   （冻结清单见 `scripts/check-office-integrity.mjs`）。
2. 与旧 bundle 的交互**只能**通过 `bridge/` 层暴露的只读集成点：
   `window.__STORE__` / `__STORE_STATE__` / `__ROUTE__` / `__TAB_ROUTERS__` / `__HISTORY_TRACKERS__`。
3. 新增后端能力走 `bridge/gateway.js` 的新 action 命名空间
   （`agent.profile.*`、`agent.memory.*`、`room.action.*`、`budget.*` 等），
   不得复用或篡改已有 action 的语义。
4. 办公室场景状态（谁在干活、干什么）一律从会话 Store 差分派生，
   与办公室场景共用同一数据源，**不另建状态源**。

## 目录

- `bridge/`  与恢复版 bundle / Gateway 的集成层（只读契约 + 新 action 客户端）
- `agents/`  Agent 员工模型（Identity/Soul/Role/Skills/Tools/Scope/Permission/Memory 的默认值与持久化）
- `ui/`      外围 UI 挂载工具（新面板、新页面入口）
- `index.js` 入口：初始化集成层、输出 spike 报告、暴露 `window.__SALEBUDDY__`

## 运行期验证

浏览器控制台执行 `__SALEBUDDY__.spike()` 可查看集成点可用性报告。
