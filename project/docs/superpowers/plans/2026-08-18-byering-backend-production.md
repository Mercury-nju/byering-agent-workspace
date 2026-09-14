# Byering 后端生产化实施方案

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 Byering 从前端 Demo Runtime 落成一个由后端权威驱动、可恢复、可审计、可扩展的“聊天提出目标 → 幕僚长编排九个智能体 → 找潜客 → 分析 → 触达 → 回复交接”系统。

**Architecture:** 先采用 Node.js/TypeScript 模块化单体，内部拆分 API、领域控制面、LangGraph Agent 执行器、策略服务、抖音连接器、事件投影和后台 Worker；PostgreSQL 保存租户、任务、Lead、审批和追加式事件，Redis 只承担队列/锁/限流，S3 兼容对象存储保存文件与证据。前端通过 Gateway WebSocket 订阅带游标的 canonical task events，所有按钮只发 command，最终 UI 状态以服务端事件为准。负载和团队边界明确后，再拆分连接器和 Agent Worker。

**Tech Stack:** Node.js 24 LTS（现有 Electron 运行时保持独立）、TypeScript、LangGraph.js（`@langchain/langgraph` + `@langchain/core`）、Fastify、Zod、PostgreSQL、Kysely、Redis/BullMQ、S3 兼容对象存储、WebSocket、OpenTelemetry、Vitest/Playwright、Docker Compose。

---

## 一、先锁定系统边界

### 1. Agent 只负责认知，不负责系统事实

幕僚长（销售主管的现有替代）是唯一面向用户的主 Agent，负责理解目标、提出结构化需求、生成计划、选择参与角色和向用户解释进度。九个默认成员保留为可感知的岗位：

| agentId | 中文岗位 | 允许负责的工作 |
| --- | --- | --- |
| `chief_of_staff` | 幕僚长 | 目标理解、计划提议、协调、汇总、追问 |
| `acquisition_strategist` | 获客策略师 | ICP、来源、筛选条件和搜索策略 |
| `lead_miner` | 线索猎人 | 调用来源连接器发现候选账号 |
| `lead_analyst` | 数据分析师 | 清洗、去重、意向与匹配分析、评分建议 |
| `prospect_researcher` | 客户研究员 | 公开资料、行为证据和 Prospect Brief |
| `sales_consultant` | 销售顾问 | 触达角度、渠道、CTA 和跟进建议 |
| `risk_specialist` | 风控专员 | 权限、频控、重复触达、DNC、风险决策 |
| `outreach_specialist` | 外联专员 | 将已批准动作交给平台连接器执行 |
| `outreach_operator` | 触达运营专员 | 排队、重试、送达检查、回复停止和人工交接 |

LLM 可以做：意图提取、条件归纳、研究摘要、评分证据建议、文案草稿、结果解释。

LLM 不可以做：修改权限、绕过审批、决定是否允许发送、解除 DNC、去重、发起真实平台动作、伪造成功状态、改变任务终态、写入未经验证的指标。

### 3. Agent 运行框架

Byering 采用 **LangGraph.js/TypeScript 作为 Agent 执行框架**，在其上封装 Byering 的领域控制面。LangGraph 负责节点编排、条件分支、检查点、流式事件、人工中断和恢复；Byering 负责任务/Lead/触达事实、租户权限、抖音账号工作区、审批、风控、幂等和审计。我们不重新实现模型调用循环、工具调用协议或图执行器，也不让 LangGraph 单独成为业务事实源。

因此这里不是“自研 Agent 框架”，而是“成熟 Agent 框架 + Byering 业务控制面”：

- **框架层（采用 LangGraph.js）**：Agent 节点、图依赖、上下文、模型调用、流式输出、checkpoint、interrupt/resume。
- **应用层（Byering 自有）**：任务与会话、九个岗位 manifest、权限与授权、Lead/Outreach 状态、风控审批、抖音 Connector、事件投影和审计。
- **基础设施层（Byering 自有）**：PostgreSQL 事件事实源、Redis/BullMQ 队列、持久化浏览器工作区、对象存储、WebSocket Gateway。

运行层级：

```text
Agent Manifest（岗位/人格/权限/预算）
    ↓
幕僚长计划 → LangGraph Graph（受约束的节点图）
    ↓
LangGraph Checkpoint / Interrupt（暂停、审批、恢复）
    ↓
Skill Worker + Tool Gateway（调用模型、工具和 Connector）
    ↓
Byering Event Store（事件、快照、证据和产出）
```

每个 Agent 都由 `manifest + agent_run` 表示，每次具体能力执行由 `skill + skill_run` 表示；Agent 之间通过结构化输入/输出和事件协作，不直接共享隐式上下文。`Tool Gateway` 在每次工具调用前执行租户、项目、账号、scope、风险和预算检查；外部副作用只能通过 Connector 完成。

LangGraph 的 checkpoint 只保存 Agent 图的执行上下文；任务状态、Lead/Outreach 状态、授权、审批和外部动作结果必须同步写入 Byering 的 PostgreSQL 事件事实源，避免把关键业务事实锁在框架内部。`Tool Gateway` 是唯一允许 Agent 触发外部动作的入口，发送前后都要经过 policy/connector 校验。

OpenAI Agents SDK（TypeScript）可作为特定模型供应商或简单 handoff 场景的可选适配器，但不作为本项目的主编排框架；Microsoft Agent Framework、AutoGen、CrewAI 当前主要引入 Python/C# 运行时或额外状态模型，首版不引入。这样保持 Node/TypeScript 单一运行时，同时保留未来替换模型供应商和局部 Agent Loop 的空间。

### 4. Agent 的 Soul 与 Memory 层

`Soul` 和 `Memory` 是 Agent 的核心上下文，但不是 LangGraph 或 DeepSeek Harness 自动提供的固定文件协议。Byering 需要把它们作为可版本化、可审计的 Agent 配置与数据层显式实现。

- **Soul（身份与原则）**：定义 Agent 的岗位身份、目标、表达风格、判断原则、不可越过的边界和与其他岗位的协作方式。每个默认岗位都有自己的 `SOUL.md` 或等价的版本化配置；幕僚长的 Soul 负责对用户沟通和团队协调，其他岗位的 Soul 负责专业行为，不允许运行中的 LLM 自行修改。
- **Memory（可复用事实）**：定义 Agent 在不同任务之间可以复用的事实、偏好、策略、经验和历史结果。生产事实不以一个不断增长的 `MEMORY.md` 作为唯一来源，而是写入带作用域、来源、时间、置信度、版本和过期策略的 `agent_memories`/业务表；Markdown 可以作为可读导出和调试快照。

Memory 作用域至少分为：平台规则、租户/组织、项目组、任务、Lead、Agent 私有经验和当前会话。每次运行按最小必要原则检索相关记忆，不把整个租户或项目历史直接塞进模型上下文。Lead 的身份、触达、拒绝和回复属于结构化业务事实，不能只放在向量记忆里。

运行时上下文按以下顺序组装：

```text
平台硬规则 / 安全策略
    ↓
岗位 Soul + Agent Manifest
    ↓
任务需求、计划和当前状态
    ↓
与当前任务相关的 Memory / Lead 事实 / 证据
    ↓
本次 Agent 调用的工具和输出 schema
```

Agent 只能提出 `memory.proposed`，不能直接覆盖长期记忆；Memory Service 负责去重、冲突检测、权限过滤、人工确认、写入和失效。Soul、Policy、权限和业务状态优先级高于 Memory，避免历史记忆覆盖当前任务要求或安全规则。

### 2. 后端服务边界

第一版不要把九个 Agent 拆成九个微服务。每个 Agent 是一个持久化的岗位定义和一个可观测的 `skill_run`，由同一个 Workflow Runtime 调度。确定性服务必须独立成模块：

- `identity/access`：登录、租户、成员、OAuth、token、作用域。
- `task-runtime`：任务状态机、计划、命令、事件、快照、恢复。
- `agent-runtime`：Agent/Skill 版本、模型调用、预算、上下文和输出 schema。
- `lead-service`：Lead 主记录、来源合并、证据、评分、筛选。
- `policy-service`：权限、DNC、黑名单、冷却、频控、审批门禁。
- `outreach-service`：触达计划、动作、幂等、送达、失败和回复。
- `connector-service`：抖音 OAuth、公开数据读取、评论/私信能力、Webhook/轮询。
- `artifact-service`：文件、证据引用、版本、下载权限。
- `projection-service`：看板、Agent 状态、结果统计，均从事件投影而来。

### 3. 聊天也是后端事实，不只是任务的入口

当前前端首条消息由本地 `addTask` 产生，在线运行却使用 `agent.run`；生产模式必须先创建持久化会话，再启动任务。新增：

- `conversations`：会话归属租户、项目组、当前 task、状态和标题。
- `messages`：用户/幕僚长/系统/子 Agent 消息，带 `message_id`、版本和顺序。
- `message_streams`：流式消息的开始、delta、结束、失败、取消和最后 cursor。
- `conversation_members`：主 Agent、可见子 Agent 和人工接管者。

`task.create` 一次返回 `conversationId/taskId/taskRunId/latestSeq`。首条用户消息、需求卡、追问和流式气泡都写入事件；前端刷新时先取 snapshot，再按 `afterSeq` 补齐消息和卡片。`messageId`、`followupId`、`idempotencyKey` 必须是服务端可验证的唯一键，不能由 UI 任意覆盖。

## 二、数据模型与事实源

### Task/Agent 域

创建迁移目录 `backend/db/migrations/`，至少包含以下表：

- `tenants`, `users`, `tenant_members`, `projects`。
- `agents`, `agent_versions`, `agent_skills`, `agent_tools`, `agent_permissions`, `agent_memories`。
- `goals`, `tasks`, `task_runs`, `plans`, `plan_nodes`, `skill_runs`。
- `task_events`, `task_snapshots`, `task_commands`, `outbox_events`。
- `approvals`, `access_grants`, `oauth_sessions`, `connector_accounts`。
- `browser_workspaces`, `browser_sessions`, `browser_profile_versions`, `account_execution_locks`。

所有表带 `tenant_id`；所有外部动作带 `idempotency_key`；所有用户可见状态带 `created_at/updated_at` 和操作者。

### Lead/Outreach 域

- `lead_identities`：以平台和平台账号 ID 作为唯一键，不以昵称作为唯一键。
- `leads`：租户内主 Lead，保存资格、可触达、关系、风险等多维状态。
- `lead_sources`：同一 Lead 的多来源、命中条件、发现时间和来源任务。
- `lead_evidence`：证据内容、来源 URL/平台对象、采集时间、新鲜度和置信度。
- `lead_scores`：模型建议、确定性校正、版本、解释因子和最终分层。
- `outreach_plans`：动作、话术版本、发送时间、未回复计划、退出条件。
- `outreach_actions`：单次发送，保存提交、成功、送达、未知、失败的时间和平台响应。
- `suppression_rules`：DNC、黑名单、冷却、账号级限制和规则来源。
- `lead_replies`：回复原文、平台事件 ID、识别时间、处理状态和交接上下文。
- `lead_raw_observations`：连接器原始响应的脱敏副本、来源、采集时间和生命周期。
- `requirement_proposals`, `requirement_versions`, `requirement_confirmations`：需求修改、确认人、确认时刻和版本。
- `outreach_plan_versions`, `approval_selections`：审批所依据的对象快照，防止审批后列表变化。
- `inbox_events`, `dead_letters`：外部事件去重、失败重放和人工处理记录。
- `result_snapshots`, `artifacts`, `artifact_versions`：结构化结果、文件引用、版本和下载权限。

### 三层事件模型

服务端事件包固定为：

```json
{
  "eventId": "evt_01...",
  "seq": 1842,
  "version": 1,
  "tenantId": "tenant_01",
  "projectId": "project_01",
  "taskId": "task_01",
  "taskRunId": "run_01",
  "conversationId": "conversation_01",
  "agentRunId": "agent_run_01",
  "skillRunId": "skill_run_01",
  "type": "lead.qualified",
  "occurredAt": "2026-08-18T08:00:00.000Z",
  "causationId": "cmd_01",
  "correlationId": "run_01",
  "payload": {}
}
```

`task_events` 是事实源；`task_snapshots` 只是加速恢复；看板、成员状态、结果汇总都是投影。服务端在同一数据库事务内写事件和 outbox，不能由前端伪造事件或指标。

`(task_id, seq)` 有唯一约束，追加事件使用事务锁或 optimistic CAS；事件版本不支持时进入 `unknown_event`，不能静默丢弃。事件 envelope 到前端 canonical event 的映射必须有一份共享 Zod schema 和逐事件契约测试，明确 `payload` 解包、`run_id/conversation_id/messageId/delta/CUSTOM.value` 的映射、未知事件和版本升级策略。

## 三、状态机与命令协议

### 任务状态

固定为：

`CREATED → UNDERSTANDING → WAITING_REQUIREMENT → PLANNING → WAITING_ACCESS → SEARCHING → REVIEWING → WAITING_APPROVAL → SCHEDULED → RUNNING → SENDING → SENT → WAITING_REPLY → HANDOFF/SUCCEEDED`

旁路状态：`PAUSED、FAILED、BLOCKED、CANCELLED`。状态转移只能由 Workflow Runtime 根据事件执行；命令只是请求，不是状态本身。

每次转移必须校验前置状态和 `expectedVersion`。例如：

| 当前状态 | 事件 | 下一状态 | 不允许时的结果 |
| --- | --- | --- | --- |
| `WAITING_REQUIREMENT` | `task.requirement_confirmed` | `PLANNING` | `409 STALE_REQUIREMENT` |
| `WAITING_ACCESS` | `access.scope_confirmed` | `SEARCHING` | `403 SCOPE_NOT_GRANTED` |
| `WAITING_APPROVAL` | `approval.resolved(approved)` | `SCHEDULED` | `409 APPROVAL_VERSION_STALE` |
| `SCHEDULED` | `outreach.sending` | `SENDING` | `409 ACTION_ALREADY_CLAIMED` |
| `SENT` | `lead.replied` | `HANDOFF` | 记录重复 inbound，不重复触达 |
| 任意可暂停态 | `task.pause` | `PAUSED` | 已完成动作不回滚 |
| `FAILED` | `task.retry` | 新 `task_run` 的 `RUNNING` | 超过策略进入死信 |

任务运行生命周期与 Lead 关系生命周期分开：`task_run` 是一次执行尝试；`outreach_plan` 和 `lead_replies` 可以在任务完成后持续存在。这样“任务完成”不等于“客户关系结束”。

### Lead 状态必须分维度

- 资格：`CANDIDATE / QUALIFIED / REJECTED`。
- 身份与可触达：`CONFIRMED / IDENTITY_UNCONFIRMED / AVAILABLE / UNAVAILABLE`。
- 触达：`READY / AWAITING_APPROVAL / SCHEDULED / SENDING / SENT / FAILED`。
- 关系：`NO_REPLY / REPLIED / HUMAN_TAKEOVER / DNC`。
- 风险：`ALLOW / DELAY / MODIFY / REJECT`。

列表可以显示一个主状态和阻断标签，详情必须显示完整维度。

### 对前端 Gateway 的命令

在 `backend/api/commands.ts` 建立 schema，并与现有 `SB_ACTIONS` 一一对应：

- `task.run.start`：创建或恢复运行，携带 `taskId/projectId/goal/planVersion/idempotencyKey`。
- `task.create`：创建 `conversation/task/goal` 并写入首条用户消息，返回真实的服务端 ID。
- `task.requirement.confirm`、`task.requirement.edit`。
- `access.authorization.start`、`access.authorization.cancel`、`access.scope.confirm`。
- `approval.action.respond`：携带 `approvalId/decision/selectedIds/idempotencyKey`。
- `task.pause`、`task.resume`、`task.retry`、`task.cancel`、`task.handoff`。
- `task.followup.send`：携带 `followupId`，回复通过流式事件返回。

每个命令先返回 `{commandId, accepted, currentSeq}`，最终结果必须由事件返回。重复 `idempotencyKey` 返回原 ack，不重复执行。

为兼容当前前端，Gateway 可暂时接受 `agent.run`，但内部必须转换为 `task.create + task.run.start`；`approval.action.respond` 同时兼容旧的 `ok` 字段和新的 `decision`，服务端归一化后只使用 `decision`。生产开关打开后，所有命令都必须走后端，不能在 ack 后由前端补发本地成功事件。

### 查询与订阅接口

- `GET /v1/tasks/:taskId/snapshot`：返回快照、`latestSeq`、当前权限。
- `GET /v1/tasks/:taskId/events?afterSeq=...`：恢复缺失事件。
- `GET /v1/conversations/:conversationId/messages?afterSeq=...`：恢复消息和流式完成态。
- `WS /v1/stream`：握手认证后订阅任务/会话，先原子回放 `afterSeq`，再推送实时事件；支持 `subscribe/unsubscribe/ack/heartbeat`、背压和订阅授权。
- `GET /v1/leads`、`GET /v1/leads/:leadId`、`GET /v1/leads/:leadId/evidence`。
- `POST /v1/outreach/plans`、`GET /v1/outreach/actions`、`POST /v1/outreach/actions/:id/retry`。
- `GET /v1/connectors/douyin/accounts`、`POST /v1/connectors/douyin/oauth/start`、`POST /v1/connectors/douyin/oauth/callback`。

Gateway 客户端必须支持断线重连、旧 cursor 补事件、事件按 `seq` 排序、`eventId` 去重和订阅释放。

## 四、一次完整任务的后端执行链路

### 1. 新建任务与需求确认

聊天发送 `task.create` 后，服务端创建 `goal/task/task_run`，幕僚长调用结构化输出模型生成 `RequirementProposal`。输出必须经过 Zod 校验，包含目标、来源、条件、数量、动作、权限、验收标准。歧义只产生一张需求卡，不允许模型连续追问一串问题。

用户确认后写入 `task.requirement_confirmed`，冻结 `goalVersion`，后续变更必须生成新版本并重新确认。

### 2. 编排与授权

幕僚长生成 `Plan`，计划节点引用固定 `agentId/skillId`。Workflow Runtime 校验角色是否已安装、技能是否允许访问请求的数据和动作；需要抖音权限时先创建 OAuth session 和 `access_required` 事件，未拿到 grant 不能进入搜索或触达。

### 3. 找人、分析、研究

`lead_miner` 从 Connector 获取原始候选，先落 `lead_raw_observations`（或等价的原始表），再由 Lead Service 标准化身份、去重、合并来源。`lead_analyst` 可以提出分数和理由，但最终分数由版本化评分服务落库；`prospect_researcher` 只引用带时间戳的公开证据。每个候选产生 `lead.candidate/qualified/rejected` 事件，前端实时更新候选卡。

### 4. 触达准备与审批

销售顾问生成 `OutreachDraft`，包含对象、来源理由、证据、动作、正文、CTA、发送时间和未回复计划。Policy Service 逐条检查身份、授权、重复、冷却、DNC、频控、风险和账号能力，输出 `ALLOW/DELAY/MODIFY/REJECT`。只有通过检查的动作创建 `approval.requested`；默认审批，半自动规则也必须绑定“租户 + 抖音账号 + 动作 + 分数阈值”，不能用一个全局自动开关。

### 5. 执行、送达和回复

用户批准后，Outreach Service 将动作写入队列。Connector 用平台对象 ID 和 `idempotency_key` 执行；网络异常进入 `CHECKING`，先查询平台结果再决定重试，不能直接重复发送。送达状态拆为 `SUBMITTED/ACCEPTED/DELIVERED/UNKNOWN/FAILED`。

接收平台 Webhook 或轮询到回复后，写 `lead.replied`，立即取消同一 Lead 未执行的后续动作，生成 `human_handoff`/Conversation 上下文；DNC 优先级高于任何计划。

### 6. 结果与看板

任务结束由服务端写入 `result_snapshot` 和 `artifact.created`，包含候选数、有效数、高意向数、审批数、发送数、未知数、失败数、回复数以及口径版本。看板只消费投影，不能在看板直接改变任务或触达事实。

## 五、抖音连接器与安全边界

### Connector 适配层

创建 `backend/connectors/douyin/`，只暴露能力接口，不让 Agent 直接访问 SDK：

- `authorize()`、`revoke()`、`getAccount()`。
- `searchAccounts()`、`searchFollowers()`、`searchComments()`、`searchLiveSignals()`。
- `getPublicProfile()`、`getPublicContent()`、`getInteractionEvidence()`。
- `sendPrivateMessage()`、`replyComment()`、`queryDelivery()`。
- `subscribeEvents()`/`pollEvents()`。

每个能力返回 `supported / unavailable / requires_scope / rate_limited`，平台不支持的动作必须明确显示，不得用 Demo 数据伪装成功。

上线前先建立按 App、账号类型和 scope 的 capability matrix，并逐项用官方 API 试通。不能假设粉丝、评论、直播停留、私信、评论回复或实时事件都可用；不可用时必须提供“只读公开数据、人工导入或人工发送”的阻断路径。

### 私信能力必须分成两种

后端接口不要只定义一个 `sendMessage`，而要区分：

- `replyInboundMessage`：回复已经进入企业号私信会话的用户。
- `sendColdOutboundMessage`：主动给尚未发起会话的目标账号发送私信。

抖音官方权限表当前将“接收及回复私信（企业号）”列为 `im` 权限，默认关闭并需要申请；Webhook 的 `receive_msg/enter_im` 也要求 `enterprise.im`，且对应授权账号是企业号。`im.share` 代表把第三方内容分享给抖音好友，不应解释成任意陌生账号私信能力。相关能力需以实际 App 审核结果和接口试通为准。

因此：

1. 官方 API 支持且权限已开通时，`ImConnector` 在后端直接执行，不需要云电脑。
2. 只有网页端才具备的动作，才进入隔离的 `BrowserExecutionProvider`。浏览器配置按“一个抖音账号一个持久化工作区”绑定，任务执行时启动或唤醒对应 Worker，复用已授权的浏览器 profile；不是每次任务重新授权，也不是九个 Agent 各自拥有一台永久云电脑。
3. 对需要人工扫码、二次验证、可视化操作或强设备隔离的高价值账号，可以升级为一个账号一个专属远程桌面；普通账号优先使用持久化浏览器容器/上下文，降低成本和维护复杂度。
4. 官方 API 不支持冷私信时，产品必须明确显示“无法自动发送”，提供人工发送或回复已有会话，不用浏览器自动化绕过平台能力边界。

### 账号级工作区生命周期

每个账号工作区保存 `accountId/workspaceId/authMode/profileRef/status/lastHeartbeat/lastVerifiedAt`，profile 以加密卷保存，前端不能读取 Cookie、Token 或密码。调度器按账号加锁，保证同一账号同一时刻只有一个触达序列；任务完成后 Worker 可以休眠，工作区和登录状态保留。

工作区状态：`CREATED → AUTHORIZING → READY → RUNNING → SLEEPING → REAUTH_REQUIRED → REVOKED → DESTROYED`。授权失效、设备验证或平台风控时暂停所有动作，转为 `REAUTH_REQUIRED`，由用户重新授权后继续，不自动重置 profile。

账号执行模式：

- `api`：只使用官方 OAuth/API，不需要浏览器工作区。
- `persistent_browser`：一个账号一个持久浏览器 profile，按需唤醒 Worker。
- `dedicated_desktop`：一个账号一个专属云桌面，适用于必须人工操作或需要持续可视化的账号。

这三种模式由 Connector Capability Matrix 决定，不能由 LLM 临时选择。

### 云电脑执行基础设施技术栈

云电脑不是 Agent 服务，而是账号级执行平面：

- 控制层：Node.js/TypeScript `workspace-service`，负责创建、唤醒、休眠、销毁、健康检查和账号锁。
- 浏览器层：Chromium + Playwright，使用账号独立的 `userDataDir` 持久化登录状态。
- 容器层：Docker 容器运行 Browser Worker；需要强隔离时升级为 KVM/Firecracker 微虚拟机。
- 图形层：自动化默认使用 headless/Xvfb；人工介入时通过 noVNC 或 WebRTC 暴露临时画面，不对外暴露 VNC 密码。
- 存储层：加密块存储保存浏览器 profile，S3 保存截图、下载文件和操作录像，PostgreSQL 保存元数据。
- 调度层：Redis/BullMQ 负责唤醒和排队，PostgreSQL 保存工作区状态，避免 Redis 丢失导致账号状态丢失。

早期账号量较少时，可以一个账号一台专属 VM 快速验证；产品稳定后切换为“持久 Profile + 按需 Browser Worker”。上层始终只依赖 `BrowserWorkspace` 接口，不让业务代码绑定具体 VM 或容器厂商。

采用官方 OAuth，不收集用户密码；token 加密存储并按租户隔离，前端只拿授权状态和脱敏账号信息。抖音平台协议要求在授权范围内、以必要数据为限，相关原则见[抖音开放平台协议](https://open.douyin.com/platform/resource/docs/operation-standard/agreement-protocol)和[权限说明](https://open.douyin.com/platform/resource/docs/develop/permission/overall-permission)。个人信息处理按必要、透明、最小化和可删除原则设计，参照[个人信息保护法解读](https://www.samr.gov.cn/wljys/gzzd/art/2023/art_3ef1e889c1e644d4b5f5c7f432386.html)。

OAuth 必须使用 `state + PKCE + nonce`，session 与 tenant/project/account/task 绑定，回调一次性消费并防重放；token refresh/rotation/revoke、密钥轮换和访问审计都要有记录。Webhook 必须验签、按平台事件 ID 去重并防重放。

## 六、可靠性、权限和可观测性

- 数据库事务内写 `task_events + outbox_events`，Worker 发送 outbox；消费端用 inbox/idempotency 表去重。
- Redis 只做队列、分布式锁和频控，任务状态不能只存在 Redis。
- 每个 `skill_run` 有 `attempt/lease_owner/lease_until/heartbeat/checkpoint`；Worker 失联后由恢复扫描器重新领取，超过最大尝试进入 `dead_letters`，暂停和取消通过 cooperative cancellation 传播到排队任务。
- LLM 调用设置预算、超时、重试上限、模型版本和输出 schema；失败进入 `FAILED/BLOCKED`，不自动假装完成。
- Dispatcher 在真正发送前再次校验 grant、DNC、冷却、频控、计划版本和动作状态，并原子 claim；审批时通过不代表发送时仍允许。
- `tenantId/projectId/actorId` 从认证上下文推导，不能信任 payload；项目组成员、审批人和 WebSocket 订阅都做服务端授权，数据库查询带租户/项目过滤或 RLS。
- 所有外部动作记录 `tenant/user/agent/skill/task/approval/connector/request/result` 审计日志。
- 每个任务有 traceId，指标至少覆盖任务完成率、阶段耗时、模型失败、Connector 错误、审批等待、发送成功/未知/失败、回复回流和重复拦截。
- 生产环境需要密钥管理、数据库备份与恢复演练、租户隔离测试、最小权限、删除/撤销授权流程。网络数据安全要求包括访问控制、身份认证、备份、事件响应和自动化收集风险评估，可参照[网络数据安全管理条例](https://www.cac.gov.cn/2024-09/30/c_1729384452307680.htm)。

## 七、中国区部署与抖音适配

Byering 面向中国市场时，后端默认部署在中国大陆可用区，数据库、Redis、对象存储、浏览器 Profile 和任务日志默认留在境内。模型层采用 Provider 抽象，优先使用满足业务和数据要求的境内模型或私有化模型；抖音私信原文、Token、Cookie 和账号 Profile 不应未经评估发送到境外服务。

抖音接入必须完成以下验证：

- 创建并审核网站/服务商应用，确认账号类型和企业号资质。
- 逐项申请并验证 `user_info`、`fans.list`、`video.comment`、`im`/`enterprise.im` 等实际 scope；文档权限不等于当前 App 已获批能力。
- 用真实测试账号验证 OAuth、Token 刷新、Webhook、接收私信、回复私信和目标用户标识。
- 将“主动陌生账号私信”单独作为能力项，不因 OAuth 或 `im.share` 已开通就默认启用。
- 建立官方 API 优先、持久浏览器工作区兜底、人工发送最终阻断的 Connector 策略。

浏览器 Worker 默认使用中国时区、中文 locale、固定版本 Chromium 和账号级持久 Profile；固定出口地址只用于稳定性、审计和账号隔离，不用于绕过平台风控。任何网页自动化必须在平台授权和适用规则允许的范围内执行。

应用对外提供互联网信息服务时，备案、域名、主体资质和公安/行业要求需由法务及云厂商按实际服务形态确认，不能把备案状态写死在代码中。个人信息处理、跨境模型调用、删除/撤回授权和留存期限需要形成单独的数据处理清单，参考[网络数据安全管理条例](https://www.cac.gov.cn/2024-09/30/c_1729384452307680.htm)与[抖音开发者服务协议](https://open.douyin.com/platform/resource/docs/operation-standard/agreement-protocol)。

## 八、实施任务拆分

### Task 0: 协议冻结（所有业务开发的前置条件）

**Files:**
- Create: `backend/src/contracts/command.ts`, `backend/src/contracts/event.ts`, `backend/src/contracts/snapshot.ts`
- Create: `src/salebuddy/contracts/task-protocol.js`
- Test: `backend/test/protocol-contract.test.ts`, `scripts/task-protocol.test.mjs`

- [ ] 定义 `task.create`、`message.send`、`task.run.start`、需求/授权/审批/暂停/恢复/重试/交接/追问命令。
- [ ] 所有命令统一返回 `{commandId, accepted, currentSeq, taskId, taskRunId, conversationId}`。
- [ ] 定义 server envelope、AG-UI 和前端 canonical event 的逐事件映射，覆盖消息 delta、需求、授权、分工、子 Agent、审批、artifact、回复、暂停/恢复和失败。
- [ ] 定义 snapshot hydration、未知事件、版本升级、`eventId/seq/causationId/correlationId` 和重放规则。
- [ ] WS 首帧返回 `snapshot(latestSeq)`，随后原子补发 `afterSeq` 再进入实时订阅，避免快照与实时事件之间丢消息。

### Task 1: 建立后端骨架和协议

**Files:**
- Create: `backend/src/server.ts`, `backend/src/config.ts`, `backend/src/api/commands.ts`, `backend/src/api/routes.ts`
- Create: `backend/db/migrations/001_core.sql`
- Create: `backend/package.json`, `backend/tsconfig.json`, `backend/docker-compose.yml`, `backend/src/auth/session.ts`
- Test: `backend/test/commands.contract.test.ts`, `backend/test/auth-context.test.ts`

- [ ] 定义 Fastify 启动、健康检查、错误格式和租户上下文。
- [ ] 用 Zod 固化 command/event envelope 和版本字段。
- [ ] 建立 PostgreSQL migration、事务封装和 request id 中间件。
- [ ] 建立本地 Postgres/Redis/Object Storage Compose、环境变量校验、CI migration/test script。
- [ ] 明确认证方式、WS 握手 token、tenant/project/actor 上下文，拒绝客户端伪造租户字段。
- [ ] 用契约测试验证重复命令返回同一 ack、未知命令被拒绝。

### Task 2: 任务事件源和快照

**Files:**
- Create: `backend/src/runtime/event-store.ts`, `backend/src/runtime/task-runtime.ts`, `backend/src/runtime/snapshot-store.ts`
- Modify: `src/salebuddy/runtime/task-runtime.js`, `src/salebuddy/bridge/gateway.js`
- Test: `backend/test/task-runtime-replay.test.ts`, `scripts/gateway-client.test.mjs`

- [ ] 实现按任务事务递增的 `seq`、事件追加、快照和 afterSeq 回放。
- [ ] 先落地 conversation/message/message_stream 的持久化和 `task.create`，再启动 `task.run.start`。
- [ ] 实现 WebSocket 订阅、断线重连、补游标、去重和释放订阅。
- [ ] 将现有前端 canonical event 映射到服务端事件名，不改变现有卡片协议。
- [ ] 产出 server envelope → frontend canonical event 的逐事件映射表和契约测试。
- [ ] 验证刷新、两个浏览器标签、乱序和重复事件均得到相同快照。

### Task 3: Agent Registry 与 Workflow Runtime

**Files:**
- Create: `backend/src/agents/registry.ts`, `backend/src/agents/contracts.ts`, `backend/src/workflows/plan-compiler.ts`, `backend/src/workflows/runner.ts`
- Modify: `src/salebuddy/agents/model.js`, `src/salebuddy/agents/registry.js`
- Test: `backend/test/plan-compiler.test.ts`, `backend/test/agent-permission.test.ts`

- [ ] 固化九个 agentId、岗位、skill、工具、权限和版本。
- [ ] 幕僚长输出计划 JSON；编译器校验节点、依赖、预算和作用域。
- [ ] Worker 只执行计划节点，节点结果通过事件回写，不能直接改任务终态。
- [ ] 记录模型版本、prompt 版本、token/成本和可追溯输入。

### Task 4: 租户、OAuth 和权限门禁

**Files:**
- Create: `backend/src/auth/tenant-context.ts`, `backend/src/auth/permissions.ts`, `backend/src/connectors/douyin/oauth.ts`, `backend/src/secrets/token-vault.ts`
- Test: `backend/test/tenant-isolation.test.ts`, `backend/test/oauth-scope.test.ts`

- [ ] 完成租户成员和 Read/Suggest/Execute 三类权限。
- [ ] 完成带 state/PKCE/nonce 的抖音 OAuth session、callback、token 加密、轮换、撤销和 scope 记录。
- [ ] 将真实外部动作绑定到 `tenant + account + action + grant`。
- [ ] 验证无授权、过期授权、跨租户 ID 和撤销后的动作均被拒绝。

### Task 5: Lead 数据管道

**Files:**
- Create: `backend/src/leads/lead-service.ts`, `backend/src/leads/dedupe.ts`, `backend/src/leads/scoring.ts`, `backend/src/leads/evidence.ts`
- Create: `backend/src/connectors/douyin/read-adapter.ts`
- Test: `backend/test/lead-dedupe.test.ts`, `backend/test/lead-score.test.ts`

- [ ] 按平台账号唯一键合并 Lead，保留所有来源。
- [ ] 记录命中条件、证据、时间戳和新鲜度。
- [ ] 评分采用版本化规则；模型只给因子建议，最终分数可解释可复算。
- [ ] 处理身份不明、数据不可用、候选过大和空结果的可恢复事件。

### Task 6: 触达策略、风控、审批和执行

**Files:**
- Create: `backend/src/outreach/plan-service.ts`, `backend/src/policy/risk-engine.ts`, `backend/src/policy/approval-service.ts`, `backend/src/outreach/dispatcher.ts`
- Create: `backend/src/connectors/douyin/action-adapter.ts`
- Test: `backend/test/risk-engine.test.ts`, `backend/test/outreach-idempotency.test.ts`, `backend/test/approval-flow.test.ts`

- [ ] 生成带证据的触达草稿和明确的未回复计划。
- [ ] 检查重复、冷却、DNC、频控、账号能力和审批模式。
- [ ] 批量审批显示可发/需修改/跳过数量；拒绝和失败可重试。
- [ ] 真实发送前后分别写 planned/submitted/accepted/delivered/unknown/failed。
- [ ] 网络异常先 queryDelivery，再决定重试，禁止重复发送。
- [ ] 验证审批通过后发生 DNC、授权撤销、冷却或频控变化时，二次策略检查会阻断发送。

### Task 7: 回复、交接、文件和投影

**Files:**
- Create: `backend/src/outreach/reply-handler.ts`, `backend/src/handoff/handoff-service.ts`, `backend/src/artifacts/artifact-service.ts`, `backend/src/projections/kanban-projector.ts`
- Modify: `src/salebuddy/runtime/gateway-events.js`, `src/salebuddy/ui/task-runner.js`
- Test: `backend/test/reply-stop-flow.test.ts`, `backend/test/artifact-projection.test.ts`

- [ ] 回复事件立刻停止同 Lead 未发送后续计划，并生成 Conversation 交接上下文。
- [ ] 人工接管、DNC、不可触达和风险暂停都能恢复或明确终止。
- [ ] 真实 artifact 通过 artifact.created 事件进入文件卡和文件中心。
- [ ] 看板只从事件投影，指标带口径和时间范围。

### Task 8: 生产化验收和上线门槛

**Files:**
- Create: `backend/test/e2e/find-to-outreach.test.ts`, `backend/test/e2e/reconnect-replay.test.ts`, `backend/test/e2e/security.test.ts`
- Create: `backend/docker-compose.yml`, `backend/docs/runbook.md`, `.github/workflows/backend.yml`

- [ ] 端到端跑通“需求确认 → 授权 → 找人 → 分析 → 草稿 → 审批 → 执行 → 回复交接”。
- [ ] 测试刷新、断线、重复点击、服务重启、Worker 重启和平台超时。
- [ ] 通过租户隔离、DNC、无授权、审计和备份恢复演练。
- [ ] 只有所有 P0 验收通过，才关闭前端本地 Demo 分支并打开真实触达。

### Task 9: Demo 到生产事实源的迁移开关

**Files:**
- Modify: `src/salebuddy/ui/task-runner.js`, `src/salebuddy/agents/task-store.js`, `src/salebuddy/agents/kanban-store.js`, `src/salebuddy/agents/metrics-store.js`
- Create: `backend/src/migration/task-import.ts`, `backend/src/config/feature-flags.ts`
- Test: `backend/test/production-mode-cutover.test.ts`

- [ ] 用 `runtimeMode=demo|shadow|production` 控制切换；默认先 shadow，只读后端事件不执行外部动作。
- [ ] shadow 阶段记录前端 Demo 与后端事件差异，不把本地事件写回生产事实源。
- [ ] 迁移历史任务、项目组上下文、Agent roster 和文件引用；给旧任务保留只读兼容。
- [ ] production 模式下移除触达请求的强制 `runtimeOnline=false` 和本地成功 fallback。
- [ ] 支持一键回滚到 shadow，但不回滚已发生的外部动作。

## 九、实施顺序与完成定义

建议按 6 个迭代实施：

1. 第 1 个迭代：协议、事件源、快照、WebSocket 回放；前端先继续使用 Demo。
2. 第 2 个迭代：任务创建、需求确认、计划编译、九个 Agent Registry。
3. 第 3 个迭代：OAuth、权限、找人连接器、Lead 去重/证据/评分。
4. 第 4 个迭代：触达草稿、风控、审批、队列和真实单条发送。
5. 第 5 个迭代：批量触达、暂停/恢复/重试、送达检查、回复停止和人工交接。
6. 第 6 个迭代：文件/看板投影、断线恢复、审计、监控、限流、备份和灰度。

若按两名后端、一名抖音连接器工程师和一名前端联调，建议先完成 Task 1-2 再进入业务接口；不要在事件协议未冻结前并行开发九个 Agent 的业务逻辑。

后端达到可商用的定义不是“接口能返回 200”，而是：

- 任意任务刷新或重连后都能从服务端恢复到同一状态。
- 每个外部动作都有授权、审批、幂等键、审计和可查询结果。
- 任何回复、DNC、风险暂停都会优先停止后续自动动作。
- 前端所有动态卡片都有对应的服务端事件，不能靠本地定时器补状态。
- 看板、Agent 页面和项目组页面都消费同一套任务/事件事实，不维护第二套业务状态。
- 抖音能力不可用时显示真实阻断原因，不用模拟数据冒充商业结果。

## 十、上线后的维护与管理

### 环境和发布

- `dev`：本地 Docker Compose，使用 Mock Connector，不连接真实抖音账号。
- `staging`：独立租户、独立数据库和测试账号，验证 OAuth、Webhook、浏览器工作区和升级迁移。
- `production`：中国区托管 PostgreSQL/Redis/对象存储，API、Worker、Connector、Browser Worker 分开部署。

所有服务构建不可变 Docker image，通过 CI 执行 lint、类型检查、协议测试、迁移检查和 E2E；生产采用滚动或蓝绿发布。禁止直接在生产容器内改代码、改环境变量或手工改数据库。

### PostgreSQL 管理

- 使用托管 PostgreSQL 高可用和 PITR；每日备份，按月做完整恢复演练。
- 所有 schema 通过版本化 migration 管理，采用 expand → backfill → switch → contract，禁止破坏性一步迁移。
- `task_events` 按租户/时间分区，快照后归档旧事件，但保留审计和重放所需的生命周期。
- 关键索引覆盖 `(tenant_id, task_id, seq)`、`(tenant_id, lead_identity_id)`、`(tenant_id, idempotency_key)`。
- 使用连接池、慢查询监控、锁等待监控、磁盘水位和表膨胀检查。
- Redis 丢失时可以从 PostgreSQL 恢复任务；Redis 不是任务状态的唯一存储。

### 队列和 Worker 管理

- 监控 waiting/active/delayed/failed/dead-letter 数量、最老任务年龄和事件延迟。
- Worker 使用 lease、heartbeat 和 attempt；失联任务由恢复扫描器重新领取。
- 重试采用指数退避和错误分类；平台拒绝、权限不足、DNC 等不可重试错误不能无限重试。
- Outbox 发布失败、Inbox 重复和 Connector 超时都进入可查询的运维记录。

### 账号工作区管理

- 每个抖音账号独立 Profile、密钥引用、任务队列和执行锁。
- Browser Worker 镜像固定 Chromium 版本，升级前在 staging 账号验证。
- 工作区健康检查包括浏览器存活、登录状态、抖音页面可达性、磁盘和 Profile 完整性。
- `REAUTH_REQUIRED` 只暂停该账号，不影响其他账号；撤销授权时销毁 Token 和 Profile 的可用引用。
- Profile 加密备份，禁止运维人员直接下载 Cookie；人工介入使用临时审计会话。

### 监控和告警

至少建立以下指标：

- API 延迟、错误率、WebSocket 连接数和断线重连数。
- 任务等待时间、阶段耗时、事件延迟和快照恢复失败数。
- Worker 成功率、重试率、死信数、模型调用失败和预算消耗。
- 抖音账号授权状态、Connector 错误、触达未知状态和重复拦截数。
- Browser Workspace 在线率、Profile 加载失败、二次验证和磁盘使用率。
- PostgreSQL 备份、复制延迟、慢查询、锁等待和磁盘容量。

P0 事件包括重复发送、跨租户读取、数据丢失和大规模任务状态错误；P1 包括全局队列停止、Webhook 中断和大面积授权失败；单账号重新授权属于 P2。每类事件都要有 runbook、负责人、升级路径和复盘记录。

### 日常权限和数据治理

- 每次生产访问都有审计，默认只读；数据库写入必须通过服务接口。
- 每月检查租户成员、审批权限、Connector scope、Token 和密钥有效期。
- 按租户和项目组执行数据删除、Lead 过期、DNC 保留和文件生命周期策略。
- 模型、抖音 Connector 和浏览器 Worker 的日志脱敏，不记录完整 Token、Cookie 或不必要的私信原文。
- 中国区数据默认留在境内；跨境模型或服务调用必须经过单独的数据评估和授权。

### 维护节奏

- 每天：自动备份、队列/死信检查、授权异常和 P0/P1 告警。
- 每周：失败任务复盘、慢查询检查、Connector 错误分析、Browser Worker 镜像检查。
- 每月：数据库恢复演练、权限审计、密钥轮换、数据留存清理和成本检查。
- 每季度：状态机/事件协议兼容性审查、灾备演练、抖音能力矩阵复核和安全评估。
