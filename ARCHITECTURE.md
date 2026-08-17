# Marvis 恢复版架构文档

> 本文描述 `Marvis.app` 安装包中能够确认的运行架构，以及当前恢复项目的可运行实现。
> 这是逆向恢复文档，不等同于原项目的官方设计文档。原始 TypeScript/JSX、源码映射和后端源码不在安装包中，因此所有“已确认”和“推断”都会明确标记。

## 1. 文档范围

本文覆盖以下边界：

- macOS Electron 桌面壳；
- preload 安全桥和 IPC；
- Vite/React 渲染器与本地离线资源；
- Marvis Gateway WebSocket 和 AG-UI 事件；
- 会话、消息、技能、定时任务等 Store 模型；
- 办公室场景、Agent 角色、任务状态机、路径移动和动画；
- 本地原生组件、Agent 资源和文档预览组件；
- 当前恢复版的 mock、运行方式、验证范围和未恢复部分。

不包含无法从安装包确认的内容，例如后端数据库结构、模型服务内部实现、原始构建配置和完整账号系统。

## 2. 结论摘要

Marvis 不是一个单纯的聊天网页，而是一个“桌面壳 + 本地服务编排 + Web 渲染器 + 多 Agent 办公室”的组合应用。

```text
macOS / Electron
        |
        +-- Main process
        |      +-- BrowserWindow
        |      +-- IPC handlers
        |      `-- local component lifecycle (reconstructed)
        |
        +-- Preload bridge
        |      `-- window.marvis (contextBridge)
        |
        +-- Renderer
        |      +-- React UI and stores
        |      +-- Gateway client
        |      +-- Conversation / message views
        |      `-- Office scene (Pixi-like renderer + TMJ map)
        |
        +-- Marvis Gateway
        |      `-- WebSocket /agent, ws-ag-ui protocol
        |
        `-- Native / packaged services
               +-- MarvisService
               +-- MarvisGateway / MarvisHost
               +-- MarvisAgent
               +-- BorderlessSpace
               +-- DocPreview
               `-- Knowledgebase / aria2c / Beacon
```

办公室的核心原则是：**后端 Agent 事件决定任务状态，任务状态机决定角色状态，动画只是状态的表现层。** 空闲时的睡觉、喝咖啡、摸鱼等动作不能被当成真实任务状态。

## 3. 证据等级

| 等级 | 含义 | 示例 |
| --- | --- | --- |
| 已确认 | 在打包 JavaScript、资源、manifest、字节码字符串或运行行为中直接看到 | WebSocket envelope、Agent 状态枚举、`office.tmj`、IPC channel |
| 高可信推断 | 多个调用点和状态转移能够互相印证，但缺少原始源码 | `dCe` 将 subagent 消息状态翻译为办公室任务动作 |
| 当前重建 | 为了让项目可启动而重新编写的代码，不代表原实现逐字恢复 | `scripts/gateway-mock.mjs`、Electron reconstruction |
| 未知 | 安装包没有足够证据，不能安全下结论 | 原始后端数据库、完整认证服务、模型编排细节 |

更多证据见 [RECOVERY-REPORT.md](../RECOVERY-REPORT.md) 和 [recovered-protocol](recovered-protocol)。

## 4. 运行时拓扑

### 4.1 原始应用推测拓扑

```text
Renderer
  |  IPC: jsb:invoke / marvis:* 
  |  WebSocket: ws://127.0.0.1:<port>/agent?token=...
  v
Electron preload
  |
  +--> Main process
  |      +--> MarvisService (daemon.sock)
  |      +--> MarvisHost / MarvisGateway
  |      +--> local LLM service
  |      +--> BorderlessSpace
  |      `--> native helper processes
  |
  `--> Remote Marvis API / authentication / telemetry
```

### 4.2 当前恢复版拓扑

```text
Browser: http://127.0.0.1:4173/
        |
        +--> static-server.mjs
        |      `--> serves recovered renderer assets
        |
        `--> gateway-mock.mjs
               `--> http://127.0.0.1:5152/
                   WebSocket /agent
```

当前恢复版不启动原始的生产 Gateway、账号服务器和本地原生 Agent 服务，而是用可控 mock 保持渲染器和办公室能够运行。

## 5. 启动链路

### 5.1 浏览器模式

```text
npm run serve
    |
    +--> startGatewayMock(5152)
    +--> start static server(4173)
    `--> browser loads index.html
             |
             +--> browser-shim.js provides window.marvis fallback
             +--> renderer obtains gateway port
             +--> renderer connects to /agent
             `--> scene loads TMJ map and sprite/PAG assets
```

`static-server.mjs` 对恢复后的 treemap bundle 做了一处兼容性补丁：如果初次加载时 Session Store 早于 Gateway 连接完成，会在短延迟后再次拉取会话列表。这是启动竞态修复，不是原始业务逻辑的证明。

### 5.2 Electron 模式

```text
npm run electron
    |
    +--> electron/main-reconstructed.mjs
    |      +--> create BrowserWindow
    |      +--> load index.html
    |      `--> register IPC handlers
    |
    `--> electron/preload-reconstructed.mjs
           `--> expose window.marvis through contextBridge
```

恢复版 Electron 主进程只提供安全可启动的壳和最小 IPC 返回值。原始主进程是 V8 cached bytecode，无法从中无损还原完整源码。

## 6. Electron 边界

### 6.1 Main process

文件：[electron/main-reconstructed.mjs](electron/main-reconstructed.mjs)

职责：

- 创建窗口并配置 `contextIsolation`、`nodeIntegration`；
- 注册 `marvis:service-ports:get`、`marvis:gateway:wait-ready` 等 IPC；
- 接收渲染器 ready、拖拽文件、菜单和崩溃测试事件；
- 预留本地服务端口和组件生命周期的接入点。

### 6.2 Preload

文件：[electron/preload-reconstructed.mjs](electron/preload-reconstructed.mjs)

通过 `contextBridge.exposeInMainWorld` 暴露 `window.marvis`，包括：

- `getVersion()`；
- `invoke(methodName, args)`；
- `getServicePorts()`；
- `waitForGateway()`；
- `notifyReady()`；
- 文件路径解析；
- 服务端口、进程、菜单、内容变更订阅。

生产环境应继续保持“Renderer 不直接获得 Node.js 能力”的边界，并对 `invoke` 方法名做白名单校验。

## 7. Renderer 分层

渲染器是 Vite 风格的 hashed production build，主要入口和职责如下：

| 层 | 主要资源 | 职责 |
| --- | --- | --- |
| 页面入口 | `index.html`、`main-BaWVt8Sl.js` | 创建应用、路由和全局 UI |
| 核心业务 | `treemap-KZPCXAKY-Dm7XgKSQ.js` | 会话、Gateway、办公室、技能和定时任务 |
| 工作台 | `workbench-biG8PRTg.js` | 文档/工作台相关能力 |
| 卡片 | `cards/ordering-tea/*` | 独立业务卡片和登录/订单流 |
| 供应商包 | `react-vendor-*`、`utils-vendor-*`、`markdown-vendor-*` | React、工具库和 Markdown 渲染 |
| 样式 | `*.css` | 页面、办公室和卡片样式 |

完整 Store 顶层名称在打包代码中可以观察到：

```text
legacy, app, componentUpdate, component, docPreviewProgress,
gallery, gateway, setting, hotWords, localDisk, localLLM,
location, feedback, messageBox, privacy, mobile, tab, skill,
weixin, autoTask, inviteCode, ioaAuth, window, conversations,
sessionList, slashCommandData, featureSwitch
```

可读的 Store 字段和外部协议见 [store-model.md](recovered-protocol/store-model.md)。

## 8. Gateway 和消息协议

### 8.1 WebSocket 连接

- 地址：`ws://127.0.0.1:<gateway-port>/agent`；
- 查询参数包含 URL 编码后的 `token`；
- WebSocket subprotocol：`ws-ag-ui`；
- 连接失败时会重连，观察到的退避范围约为 1 秒到 30 秒；
- Gateway 会发出 `gateway.connected`、`gateway.tick`、连接状态变化等事件。

协议细节见 [gateway-websocket.md](recovered-protocol/gateway-websocket.md)。

### 8.2 请求和响应 envelope

```json
{
  "event": "gateway.action",
  "requestId": "42",
  "payload": {
    "action": "schedule.action.list"
  }
}
```

```json
{
  "type": "ack",
  "requestId": "42",
  "data": {
    "code": 0,
    "data": []
  }
}
```

`requestId` 是客户端和 Gateway 之间的关联键。生产实现需要保证请求超时、断线重连、重复响应和未匹配响应不会破坏 Store。

### 8.3 AG-UI 事件

Agent 执行流的上游事件大致为：

```text
RUN_STARTED
    |
    +--> TEXT_MESSAGE_START
    +--> TEXT_MESSAGE_CONTENT (one or more deltas)
    +--> TEXT_MESSAGE_END
    `--> RUN_FINISHED
```

错误流使用 `RUN_ERROR`。Renderer 先把这些事件写入会话消息，再由办公室适配器根据主 Agent 和 subagent 状态变化生成场景任务。

## 9. 办公室架构

### 9.1 角色模型

已确认的 Agent 类型包括：

- `main`：主 Agent；
- `App Agent`；
- `Computer Agent`；
- `Browser Agent`；
- `File Agent`；
- `Search Agent`。

办公室地图资源位于 `workbench/assets/office.tmj`，角色资源包括各类团队 PAG 动画、工作动画、走路动画和特殊动作。

### 9.2 两级状态模型

办公室使用“状态类别 + 动画子状态”两级模型。

```text
状态类别（业务含义）
  DISPATCHING
  GO_BACK
  TASK_EXECUTING
  IDLE
  FINISH
  STOP
  LEAVING
  OFFSTAGE

动画子状态（表现含义）
  WORKING, HIGH_PRESSURE, BREAK, PEEKING,
  STANDBY, SLACKING, SLEEPING, PRETEND_WORKING,
  TASK_HANDOVER_SENDER, TASK_HANDOVER_RECEIVER,
  TASK_COMPLETE, TASK_INTERRUPTED, RETURNING,
  ENTERING, LEAVING, TALKING, RUNNING_TREADMILL, POOPING
```

业务判断应以状态类别、活动会话和任务队列为准。动画子状态可以在不改变业务类别的情况下短暂变化，例如 `TASK_EXECUTING` 下从 `WORKING` 切到 `HIGH_PRESSURE` 或 `BREAK`。

### 9.3 任务状态机

核心任务动作可归纳为：

```text
DISPATCH
    |
    v
sender: DISPATCHING ---- pathfinding ----> receiver
                                             |
                                             v
                                  handover animation
                                             |
                                             v
receiver: TASK_EXECUTING / WORKING
                                             |
                                             v
COMPLETE / ERROR / CANCEL
       |
       +--> still has active tasks: continue working
       `--> no active tasks: IDLE / return / leave
```

关键约束：

1. `START` 才能创建活动任务并进入工作状态；
2. 非主 Agent 从场外进入时使用 `SUB_START`，恢复可见性后才能工作；
3. `DISPATCH` 只负责分派和移动，不能直接把接收者标记为已完成；
4. 交接完成后，发送者进入 `GO_BACK / RETURNING`，接收者进入 `TASK_EXECUTING / WORKING`；
5. `COMPLETE`、`ERROR`、`CANCEL` 是终止路径，必须清理活动会话和任务队列；
6. 同一个任务重复事件应该是幂等的，不能重复增加活动会话或重复触发离场。

### 9.4 真实状态到动画的转换

核心转换链路是：

```text
会话消息状态差异
        |
        v
dCe(message history, conversationId, scene)
        |
        +--> main generating: START
        +--> new subagent: DISPATCH + START
        +--> history subagent: SUB_START
        +--> subagent completed: COMPLETE
        +--> subagent failed: ERROR
        `--> main completed/cancelled: COMPLETE / CANCEL / ERROR
        |
        v
X3e.execute(task)
        |
        v
Agent.setStateCategory() / setSubState()
        |
        v
playSubStateAnim() + pathfinding + bubble + visibility
```

这也是保证动画与实际工作对应的关键：**不能通过计时器直接把角色设为工作中，必须先有会话事件，再进入任务状态机。**

### 9.5 空闲行为

当 Agent 处于 `IDLE` 且没有活动任务时，场景可以随机选择 `SLACKING`、`SLEEPING`、`PEEKING`、喝咖啡等微动作。它们只负责让办公室自然运转，不改变任务事实。

当 Agent 处于 `TASK_EXECUTING` 时，`HIGH_PRESSURE`、`BREAK`、`PEEKING` 等是工作过程中的表现状态，结束后应自动回到 `WORKING`。这些动画不能改变 `activeConversationIds`。

## 10. 状态一致性和可观测性

若要让线上版本长期保持真实对应关系，建议实现以下不变量：

```text
TASK_EXECUTING => activeConversationIds.size > 0
TASK_EXECUTING => currentTask != null
IDLE           => activeConversationIds.size == 0
IDLE           => taskQueue is empty
DISPATCH       => eventually START or explicit ERROR/CANCEL
START          => eventually terminal event
terminal event => task and conversation are cleaned up
```

还应记录以下诊断字段：

- `agentId`、`conversationId`、`taskId`；
- 当前状态类别和动画子状态；
- 当前路径、目标座位、是否可见；
- 当前动画锁和锁等待时间；
- 活动会话数量、任务队列长度；
- 最近一次事件及事件序列号。

恢复后的 Agent 对象已经有 `diagnosticInfo`、状态切换日志和动画锁逻辑，可以作为后续调试面板的基础。

## 11. 本地组件和资源层

| 组件 | 作用 | 恢复情况 |
| --- | --- | --- |
| `MarvisService` | daemon、UDS、配置和事件订阅 | 通过二进制字符串和 metadata 确认拓扑 |
| `MarvisGateway / MarvisHost` | 本地 Gateway、WebSocket、远端服务连接 | 小型组件文件已保留，生产行为未重建 |
| `MarvisAgent` | skills、MCP、prompt、浏览器/文件工具 | 可读的 skill/resource 文件已提取 |
| `BorderlessSpace` | 远程/无边框空间、relay、streaming | 原生二进制和依赖已保留 |
| `DocPreview` | 文档预览和编辑 SDK | 原生 dylib 和 ICU 数据已保留 |
| `Beacon` | 埋点/遥测封装 | wrapper 源码和 native module 已保留 |
| `aria2c` | 下载辅助 | 原生二进制存在 |

组件拓扑详见 [component-topology.md](recovered-protocol/component-topology.md)。

## 12. 当前恢复版实现边界

### 已可运行

- 浏览器模式和恢复版 Electron 壳；
- React/Vite 离线 UI 资源；
- 办公室地图、角色、座位、路径和动画资源；
- 本地 Gateway mock、WebSocket handshake、请求 ack；
- 会话列表、定时任务和技能列表的基础响应；
- AG-UI 主 Agent 的启动、文本流和结束事件；
- 启动竞态修复和基础日志。

### 仍是 mock 或未恢复

- `agent.run` 当前主要发送主 Agent 的 `RUN_*` 事件；
- mock 尚未完整生成 subagent 的真实状态记录，因此未覆盖完整的 `DISPATCH -> handover -> WORKING -> COMPLETE` 演示；
- 原始账号、生产 Gateway、远程 API、模型服务和数据库不可由安装包恢复；
- Electron 中的原始服务编排、签名、token 生命周期和 native IPC 仍需重新实现；
- 原始源码文件名、类型定义、单元测试和构建流水线没有保留。

因此，当前版本应被称为“可运行的恢复框架”，而不是“原项目源码的完整还原”。

## 13. 测试策略

### 13.1 协议测试

- HTTP `/health` 和 CORS；
- WebSocket `/agent` handshake；
- `requestId` ack 关联；
- `RUN_STARTED`、文本流、`RUN_FINISHED`、`RUN_ERROR`；
- 断线重连和重复事件。

### 13.2 办公室状态测试

至少覆盖：

1. 只有主 Agent 工作；
2. 主 Agent 分派给 Browser/File/Search Agent；
3. 接收者在场外时先入场再交接；
4. 多个 Agent 并行工作；
5. subagent 完成后返回或进入空闲；
6. 失败和取消不留下“幽灵工作状态”；
7. 历史会话恢复不会重复创建任务；
8. 事件乱序、重复、断线后重放仍保持幂等。

### 13.3 UI 验证

- 首屏不应永久停留在加载页；
- 地图和全部角色资源成功加载；
- 会话列表和右侧详情在 Gateway ready 后刷新；
- 浏览器窗口和 Electron 窗口尺寸变化不破坏办公室布局；
- 场景日志应能对应到状态机事件。

## 14. 推荐的后续实现顺序

```text
1. 为 gateway-mock 增加 subagent timeline
       |
2. 把 taskId / eventId / sequence 写入每个场景事件
       |
3. 在 X3e.execute 增加幂等表和状态不变量校验
       |
4. 加入办公室诊断面板和事件回放
       |
5. 再接入真实 Gateway / 账号 / Agent 服务
       |
6. 最后补齐 Electron native service lifecycle
```

这样可以先验证“事件到动画”的正确性，再替换后端，不会把网络问题、认证问题和场景问题混在一起排查。

## 15. 运行命令

在 `project/` 目录执行：

```bash
npm run serve
```

打开：`http://127.0.0.1:4173/`

可选环境变量：

```bash
MARVIS_PORT=4173
MARVIS_GATEWAY_PORT=5152
MARVIS_DISABLE_GATEWAY_MOCK=1
```

`MARVIS_DISABLE_GATEWAY_MOCK=1` 只适用于已经有真实 Gateway 的环境。没有真实 Gateway 时，页面会因为无法建立 Agent 连接而缺少会话和任务数据。

## 16. 相关文档索引

- [恢复报告](../RECOVERY-REPORT.md)
- [组件拓扑](recovered-protocol/component-topology.md)
- [Gateway WebSocket 协议](recovered-protocol/gateway-websocket.md)
- [Renderer Store 模型](recovered-protocol/store-model.md)
- [组件说明](components/README.md)
- [API endpoint inventory](recovered-symbols/api-endpoints.txt)
- [Gateway action inventory](recovered-symbols/gateway-actions.txt)
- [IPC channel inventory](recovered-symbols/ipc-channels.txt)

