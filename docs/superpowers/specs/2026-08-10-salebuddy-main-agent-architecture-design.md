# SaleBuddy 主 Agent 成熟架构设计

> 文档状态：Draft for User Review
> 日期：2026-08-10
> 范围：SaleBuddy 主 Agent、任务控制平面及其与现有 Agent/UI/Gateway 的集成边界
> 不在范围：具体销售 Skill 内容、第三方工具逐项接入、现有 UI 视觉重设计

## 1. 摘要

SaleBuddy 的核心不是让用户直接管理多个 Agent，而是让用户只面对一个可信赖的主 Agent。主 Agent 扮演 AI 幕僚长：理解目标、建立执行合同、拆解任务、选择团队、协调依赖、监督风险、组织验收，并向用户交付可以追溯的结果。

本设计选择“主 Agent + 确定性任务运行时 + 专业 Agent”的架构。模型负责语义判断，普通程序负责状态、权限、预算、副作用、幂等和恢复。任何真实业务操作都必须通过受控 `WorkOrder` 交给专业 Agent；主 Agent不能用自然语言伪造执行进度，也不能绕过运行时直接产生外部副作用。

主 Agent不是一个永不退出的模型会话，而是一个由持久化任务状态和领域事件驱动的逻辑 Actor。每当出现用户输入、子任务完成、审批结果、预算告警或异常事件时，运行时使用最小必要上下文唤醒主 Agent进行下一次决策。每次决策都输出结构化命令，由确定性控制平面验证后执行。

第一阶段以恢复版桌面应用为部署目标：沿用本地 Gateway 与现有 UI，使用 SQLite WAL 持久化任务事实，使用本地文件系统保存产物。存储和模型访问均通过接口隔离，后续可以迁移到云端数据库和多租户运行时，而不改变 Agent 协议。

## 2. 背景与当前状态

现有代码已经具备以下基础：

- `main` 及五类专业 Agent 的档案骨架；
- Identity、Soul、Role、Skills、Tools、Scope、Permission、Memory、Budget 等字段；
- 任务房间、看板、文件中心、资源中心和 Agent 详情页；
- WebSocket Gateway 客户端及部分新 action 命名空间；
- 由会话事件驱动的办公室状态机；
- 任务进度、审批卡片、文件产物和成本展示。

当前首页任务链路仍是模拟器：通过关键词选择 `leads`、`content` 或 `generic` 固定剧本，按固定顺序播放预写日志、生成预写文件并随机累计成本。它没有真实目标理解、动态规划、模型调用、工具执行、权限执法、结果验收或断点恢复。

相关代码：

- [`project/src/salebuddy/agents/model.js`](../../../project/src/salebuddy/agents/model.js)
- [`project/src/salebuddy/bridge/gateway.js`](../../../project/src/salebuddy/bridge/gateway.js)
- [`project/src/salebuddy/ui/task-runner.js`](../../../project/src/salebuddy/ui/task-runner.js)
- [`project/OFFICE-ARCHITECTURE.md`](../../../project/OFFICE-ARCHITECTURE.md)

本设计保留现有产品外壳，以真实任务运行时替换模拟引擎。

### 2.1 仓库与部署边界

恢复版仓库没有原始 Gateway/daemon 后端源码，并且 [`project/src/salebuddy/README.md`](../../../project/src/salebuddy/README.md) 规定新增业务代码只能进入 `project/src/salebuddy/`，不得修改冻结 bundle。由此冻结以下边界：

- 领域核心首先实现为环境无关模块，位于 `project/src/salebuddy/runtime/`；
- `project/scripts/gateway-mock.mjs` 只作为 Node 测试宿主和协议模拟器，不成为生产事实源；
- Renderer 只能通过 `bridge/` 调用 Gateway，不直接写恢复版 Conversation Store 或办公室状态；
- 正式生产部署需要把同一 Runtime 核心装入可维护的 Gateway/daemon 宿主；若当前产品没有 daemon 扩展点，则必须取得或新建独立后端仓库后才能完成生产接入；
- 本仓库中的 Phase 1–3 可以完成领域核心、模型/Worker 适配器、Gateway 契约和 mock 端到端验证，但不得声称已替换不可维护的原始生产 daemon。

该部署依赖是实施前置条件，不通过 patch 恢复版 bundle 绕过。

## 3. 设计目标

### 3.1 产品目标

1. 用户只需表达目标，不必理解底层 Agent 和工具。
2. 主 Agent能把目标转成可审批、可执行、可验收的任务计划。
3. 专业 Agent在独立权限、上下文、预算和工作空间中执行。
4. 任务过程能够暂停、恢复、取消、重试和审计。
5. 用户能知道正在做什么、为什么这样做、花费多少、产生了什么。
6. 最终交付必须包含产物、证据、风险和未完成事项，不能只给口头结论。
7. 用户反馈可以受控地形成任务、项目、Agent 或组织级记忆。

### 3.2 工程目标

1. 模型推理与确定性执行控制分离。
2. 任务状态只有一个权威来源。
3. 所有副作用经过权限和预算检查。
4. 所有命令和事件具有稳定 ID、版本与幂等键。
5. 进程重启后可以从持久化事实恢复。
6. UI、办公室、文件中心和资源中心只消费事实投影。
7. 模型、存储和工具实现可替换，不污染领域协议。

## 4. 非目标

第一阶段明确不实现：

- Agent 自主招聘、解雇或修改自己的核心 Soul；
- 任意深度的 Agent 递归调用；
- 无主持人的开放式 Agent 群聊；
- 自动批准高风险外部操作；
- 从所有执行内容中自动生成永久记忆；
- 多用户企业组织和跨租户协作；
- 完全无人监管、跨数日且无限续期的自治任务；
- 为每个工具建立通用 RPA 平台；
- 重做现有办公室或外围页面视觉。

## 5. 核心架构决策

### 5.1 选择方案

采用“主 Agent + 确定性任务运行时 + 专业 Agent”。不采用全能单 Agent，也不在第一阶段采用完全自治的 Agent 群。

### 5.2 管理者优先

主 Agent可以直接处理解释、澄清、读取已有结果等无副作用轻量对话。涉及外部工具、长时间运行、文件生成、数据写入、消息发送或多个专业步骤时，必须创建正式 `TaskRun`，并把实际工作交给专业 Agent。

### 5.3 事件是事实

任务运行时事实来自 SQLite 当前聚合状态；与状态转换同事务写入的领域事件是不可变审计和增量投影记录。聊天消息、办公室动画、看板卡片和“云电脑正在工作”都是这些事实的投影，不得反向成为任务完成依据。

### 5.4 结构化命令

模型只能提出结构化决策，例如 `propose_plan`、`assign_work`、`request_approval`、`replan`、`complete_task`。控制平面验证状态、权限、预算和版本后才能接受命令。

### 5.5 证据优先

子 Agent的文字声明不是成功证据。正式结果必须引用产物、工具回执、来源记录或可复现的验证结果。没有证据的结论只能标记为 `unverified`。

## 6. 总体架构

```text
┌─────────────────────────────────────────────────────────────┐
│ User                                                        │
│ goal / clarification / approval / feedback / cancel         │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            v
┌─────────────────────────────────────────────────────────────┐
│ Conversation Ingress                                        │
│ identity · session · attachment · intent envelope           │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            v
┌─────────────────────────────────────────────────────────────┐
│ Chief Agent Actor                                            │
│ GoalInterpreter · Planner · TeamSelector · Supervisor       │
│ ResultReviewer · DeliveryComposer                           │
└───────────────────────────┬─────────────────────────────────┘
                            │ structured decision
                            v
┌─────────────────────────────────────────────────────────────┐
│ Control Plane                                                │
│ TaskStateMachine · PlanCompiler · DAGScheduler              │
│ PolicyEngine · BudgetGuard · ApprovalService                │
│ ContextAssembler · RecoveryManager · AuditEventStore        │
└───────────────┬─────────────────────┬───────────────────────┘
                │                     │
                v                     v
┌──────────────────────────┐  ┌──────────────────────────────┐
│ Worker Runtime           │  │ Platform Services            │
│ Browser / Search / File  │  │ ModelRouter · ToolGateway   │
│ App / Computer Agents    │  │ Memory · Artifact · Usage   │
└───────────────┬──────────┘  └──────────────┬───────────────┘
                └──────────────┬─────────────┘
                               │ domain events
                               v
┌─────────────────────────────────────────────────────────────┐
│ Projections                                                  │
│ Chat · Task Room · Kanban · Office · Files · Resources      │
└─────────────────────────────────────────────────────────────┘
```

## 7. 主 Agent 的逻辑组成

主 Agent是一个逻辑 Actor，不要求每个组成部分对应独立模型请求。实现可以在一次请求中组合多个能力，但接口上保持责任分离。

| 组件 | 责任 | 输入 | 输出 |
|---|---|---|---|
| `GoalInterpreter` | 理解目标、识别约束和缺失信息 | 用户输入、附件、相关记忆 | `GoalSpec` 或澄清问题 |
| `TaskClassifier` | 判断直接回答或正式任务 | `GoalSpec`、风险摘要 | `direct_response` 或 `managed_task` |
| `Planner` | 生成可执行 DAG | `GoalSpec`、Agent 目录、工具目录 | `ExecutionPlan` |
| `TeamSelector` | 为工作节点选择负责人和候选 Agent | 能力需求、权限、预算、负载 | `AssignmentProposal` |
| `Supervisor` | 响应进度、阻塞、失败和用户变更 | 事件增量、当前计划 | 继续、重试、换人、重规划或升级 |
| `ResultReviewer` | 对照验收标准检查结果 | `WorkResult`、证据、产物 | `VerificationResult` |
| `DeliveryComposer` | 形成用户可决策的最终交付 | 已验证结果、成本、风险 | `DeliveryReport` |

主 Agent的稳定 Identity 应为：

- `agentType`: `main`
- `role.position`: `SaleBuddy Chief of Staff`
- `role.reportsTo`: `user`
- `role.responsibilities`: 目标理解、任务组织、风险控制、质量验收、最终汇报
- `permission`: 不直接拥有业务工具副作用权限
- `budget`: 只拥有规划和监督预算，不直接消耗专业执行预算

`main` 不再通过公共默认值把 `reportsTo` 设置为自己。

## 8. 主 Agent 决策循环

### 8.1 唤醒条件

主 Agent仅在以下事件到达时被唤醒：

- 新用户目标或补充要求；
- 澄清问题得到回答；
- 计划需要首次生成或重新生成；
- `WorkOrder` 完成、失败、阻塞或超时；
- 审批通过、驳回或过期；
- 预算达到软阈值或硬上限；
- 用户暂停、恢复或取消；
- 所有必要工作完成，进入最终验收。

工具运行中的每条日志不会唤醒主 Agent。日志先聚合成有意义的状态变化，避免高成本事件风暴。

### 8.2 单次决策流程

```text
load task snapshot + new events
        -> assemble bounded context
        -> invoke chief model
        -> validate structured decision
        -> apply policy and budget rules
        -> append accepted command/events atomically
        -> schedule resulting work
        -> release actor lease
```

单次唤醒只处理一个任务版本。若提交命令时版本已变化，丢弃本次结果并基于新版本重新决策，避免并发覆盖。

### 8.3 允许的决策类型

```text
respond_directly
ask_clarification
propose_plan
revise_plan
assign_work
request_approval
retry_work
replace_agent
pause_task
fail_task
complete_task
propose_memory
```

模型不能直接输出 `tool.execute`、`permission.grant`、`budget.raise` 或永久记忆写入命令。

每次输出必须满足统一信封：

```ts
interface ChiefDecision<T> {
  decisionId: string
  taskRunId: string
  expectedTaskVersion: number
  action: ChiefDecisionAction
  rationaleSummary: string
  evidenceRefs: string[]
  payload: T
}
```

`expectedTaskVersion` 不匹配时整个决策作废；运行时不会挑选其中部分命令应用。`rationaleSummary` 只保存可展示的决策摘要，不要求或保存隐藏思维链。

## 9. 目标合同 `GoalSpec`

正式任务启动前必须形成版本化目标合同。用户修改目标时创建新版本，并标出对当前计划的影响。

```ts
interface GoalSpec {
  id: string
  version: number
  taskRunId: string
  objective: string
  deliverables: DeliverableSpec[]
  acceptanceCriteria: AcceptanceCriterion[]
  constraints: string[]
  exclusions: string[]
  deadline?: string
  budget: BudgetLimit
  approvalPolicy: ApprovalPolicyRef
  sourceMessageIds: string[]
  assumptions: Assumption[]
}
```

`GoalSpec` 只在确认后创建，创建后不可修改，不含生命周期状态。确认前的工作内容保存在 `task_runs.goalDraft`，由 `TaskRun.status = 'draft' | 'needs_input'` 表达；新版本确认后更新 `task_runs.activeGoalVersion`，旧版本因不再被活动指针引用而视为 superseded。

### 9.1 何时必须澄清

满足任一条件时必须询问用户：

- 可能产生外部副作用，但对象、范围或授权不明确；
- 两种合理解释会明显改变交付物；
- 缺少不可推断的业务数据；
- 预算或时间不足以满足目标；
- 用户要求与组织安全规则冲突；
- 成功标准不可测试。

每轮只问最能减少计划分歧的问题。最多连续澄清三轮；仍无法形成可执行合同则保持 `needs_input`，不得自行扩张假设。

### 9.2 假设管理

低风险、可逆、不会扩大外部影响的缺失信息可以形成显式 `Assumption`。最终交付必须列出真正影响结果的假设。涉及发送、购买、删除、权限扩大或敏感数据时禁止靠假设继续。

## 10. 计划模型与 DAG

`ExecutionPlan` 是主 Agent提出、运行时编译后的版本化、扁平有向无环图。第一阶段不允许循环节点、嵌套计划或递归子计划；重试属于同一节点的执行策略，重规划则创建完整的新计划版本。

```ts
interface ExecutionPlan {
  id: string
  version: number
  taskRunId: string
  goalVersion: number
  nodes: PlanNode[]
  edges: PlanEdge[]
  criticalPath: string[]
  estimatedUsage: BudgetUsage
  estimatedDurationSec: number
  riskSummary: RiskSummary
}

interface ExecutionPlanState {
  planId: string
  stateVersion: number
  status: 'proposed' | 'approved' | 'active' | 'superseded' | 'completed'
  approvedAt?: string
  activatedAt?: string
  completedAt?: string
}

interface PlanNode {
  id: string
  kind: 'work' | 'verification' | 'delivery'
  title: string
  objective: string
  required: boolean
  failurePolicy: 'fail_plan' | 'block_dependents' | 'continue_degraded'
  capabilityRequirements: CapabilityRequirement[]
  inputRefs: string[]
  outputContract: OutputContract
  acceptanceCriteria: AcceptanceCriterion[]
  riskLevel: 'low' | 'medium' | 'high' | 'critical'
  preferredAgentTypes: string[]
  maxAttempts: number
  timeoutSec: number
  estimatedUsage: BudgetUsage
}

interface PlanEdge {
  fromNodeId: string
  toNodeId: string
  condition: 'on_verified_success' | 'on_terminal'
  requiredOutputRefs: string[]
}

interface CapabilityRequirement {
  toolClass: string
  operations: string[]
  dataScopes: string[]
  resourceSelectors: ResourceSelector[]
  limits: Record<string, number>
  riskLevel: 'low' | 'medium' | 'high' | 'critical'
  approvalMode: 'none' | 'plan_acknowledgement' | 'per_action'
}

interface ResourceSelector {
  resourceType: string
  selectorType: 'exact' | 'namespace'
  canonicalId: string
}
```

每个 Tool Adapter 必须注册资源规范化器，把外部对象转换为稳定的 `resourceType + canonicalId`。`exact` 只包含同一规范 ID；`namespace` 只包含由同一 Adapter 明确证明属于该命名空间的 `exact` 对象。命名空间之间只有完全相等才互相包含，不允许模型提供字符串前缀、glob 或正则表达式。权限交集始终保留更具体的 selector；Adapter 无法证明包含关系时按不允许处理。

`ExecutionPlan` 内容创建后不可修改；批准、激活和完成写入独立 `ExecutionPlanState`。`on_verified_success` 表示上游通过验收后才释放下游；`on_terminal` 只用于汇总、审计或补偿型节点，无论上游成功或失败都会释放。必需节点失败时遵循 `failurePolicy`；可选节点失败且策略为 `continue_degraded` 时，任务仍可进入最终验收，但结果只能被判定为部分完成。

`work` 节点由 `AgentRegistry` 中的专业 Agent执行；`verification` 节点由受控 `VerificationService` 执行；`delivery` 节点由主 Agent的 `DeliveryComposer` 执行。后两类不参与普通 Agent匹配，其 `capabilityRequirements` 必须为空，且不能获得业务工具副作用权限。

### 10.1 编译约束

`PlanCompiler` 必须拒绝：

- 环依赖、嵌套计划和递归子计划；
- 没有输出合同的 `work` 或 `verification` 节点；
- 边引用不存在的节点或输出；
- 必需节点被仅在失败后才可达的边隔离；
- 找不到满足全部 `CapabilityRequirement` 的 Agent；
- 要求超出用户/项目授权的数据或对象范围；
- 估算的任一预算维度超过任务硬上限；
- `high` 或 `critical` 风险没有计划确认策略；
- `external_send`、`destructive` 或 `financial` 副作用不是 `per_action`；
- 单任务并发节点超过配置上限。

第一阶段默认值：

- `maxReplans = 2`
- `defaultMaxAttempts = 3`
- `maxConcurrentWorkOrders = 4`

这些是运行时配置，不写死在 Prompt 中。

### 10.2 失败传播与部分成功

- `fail_plan`：必需节点最终失败后，不再释放新业务节点，进入最终失败评估；
- `block_dependents`：只阻塞经 `on_verified_success` 依赖该节点的后继，其他分支继续；
- `continue_degraded`：仅允许可选节点使用，记录缺口后继续；
- 任何被阻塞的必需交付物都会让任务失败；
- 所有必需交付物完成、但一个或多个可选交付物缺失时，任务生命周期仍可进入 `completed`，同时 `resultDisposition = 'partially_completed'`。

### 10.3 计划批准

低风险、预算内、无外部副作用的计划可以自动批准。包含高风险动作、首次访问敏感数据、对外发送或预算明显增加的计划，必须先展示摘要并获得用户的计划风险确认。

计划摘要应回答：目标、步骤、参与 Agent、预计时间、各预算维度、需要的权限和预期交付物。内部推理过程不展示，只展示可验证的决策理由。

计划确认只表示用户知晓并同意执行方向、预算和风险，不授权尚未形成的具体副作用。`external_send`、`destructive`、`financial` 以及组织策略指定的动作，执行时仍必须使用 `per_action` 审批绑定精确对象与内容；计划确认不能替代或扩大具体动作授权。

## 11. 团队选择与任务分派

### 11.1 Agent 目录

运行时从 `AgentRegistry` 读取结构化能力，不把完整 Agent Profile 全量塞给模型。用于匹配的摘要包括：

```ts
interface AgentCapabilitySummary {
  agentType: string
  displayName: string
  role: string
  capabilities: string[]
  toolGrants: Array<{
    toolClass: string
    operations: string[]
    dataScopes: string[]
    maximumLimits: Record<string, number>
  }>
  modelTier: string
  currentLoad: number
  qualityScore?: number
  costScore?: number
  availability: 'available' | 'busy' | 'offline'
}
```

### 11.2 匹配流程

1. 确定性过滤：逐项证明节点的 `CapabilityRequirement` 是 Agent 资格、用户授权、项目策略和任务预算的交集子集。
2. 能力排序：岗位匹配度、历史质量、成本、负载和任务连续性。
3. 主 Agent从合格候选中选择负责人。
4. 运行时重新计算交集，为每个 `CapabilityRequirement` 分别签发一个 `CapabilityGrant`。
5. 创建不可变 `WorkOrderDefinition` 和独立的可变 `WorkOrderState`。

主 Agent不能选择已被权限过滤掉的 Agent。没有合格候选时必须阻塞并说明缺少的工具操作、数据范围或授权，不能让无权限 Agent“先试试看”。

### 11.3 协作规则

专业 Agent不能直接创建子 Agent。它可以返回 `assistance_requested`，说明所需能力、输入和原因；主 Agent只能通过新计划版本增加普通扁平节点，或拒绝请求。

Agent之间的正式交接通过 `ArtifactRef`、`EvidenceRef` 和 `WorkResult`，任务房间中的聊天只是这些事件的可读投影。这样可以避免自由聊天成为隐式协议。

## 12. `WorkOrder` 与 `WorkResult` 协议

### 12.1 不可变定义与可变状态

```ts
interface WorkOrderDefinition {
  id: string
  taskRunId: string
  planId: string
  planVersion: number
  nodeId: string
  attempt: number
  previousWorkOrderId?: string
  assignee: string
  objective: string
  instructions: string[]
  inputRefs: string[]
  contextRefs: string[]
  outputContract: OutputContract
  acceptanceCriteria: AcceptanceCriterion[]
  capabilityGrants: CapabilityGrant[]
  workSpecHash: string
  grantSetHash: string
  budgetSlice: BudgetLimit
  deadline: string
  dispatchIdempotencyKey: string
  definitionHash: string
}

interface WorkOrderState {
  workOrderId: string
  version: number
  status: WorkOrderStatus
  leaseOwner?: string
  leaseExpiresAt?: string
  continuationRef?: string
  readyAt?: string
  startedAt?: string
  finishedAt?: string
  terminalReason?: string
}

interface ContinuationCheckpoint {
  checkpointId: string
  workOrderId: string
  definitionHash: string
  completedStepIds: string[]
  artifactRefs: string[]
  toolReceiptRefs: string[]
  pendingAction: ProposedToolAction
  resumeStepId: string
  checkpointHash: string
  contentHandle?: string
  createdAt: string
  expiresAt: string
}
```

`WorkOrderDefinition` 创建后不可修改。`capabilityGrants` 与规范化后的 `capabilityRequirements` 一一对应，不跨 `toolClass` 合并；要求变化、换人或重试时为同一节点创建新的 `WorkOrderDefinition`。只有 `WorkOrderState` 按状态机更新。审批指纹绑定 `definitionHash` 和 `grantSetHash`。

每个重试使用新 `id`、`dispatchIdempotencyKey`、`budgetSlice` 和 `attempt = previous.attempt + 1`，并通过 `previousWorkOrderId` 连接前一次。节点的 `maxAttempts` 统计该节点所有 `WorkOrderDefinition` 数量。重试相同外部动作时，Tool Adapter 必须复用前一次 `ToolReceipt` 中的业务幂等键；工作单派发键不能替代工具副作用键。

哈希顺序固定，禁止自引用：

1. 对 Definition 中除 `capabilityGrants`、`workSpecHash`、`grantSetHash`、`definitionHash` 外的字段执行 RFC 8785 canonical JSON，计算 `workSpecHash = SHA-256(canonicalWorkSpec)`；
2. 每个 Grant 绑定 `workSpecHash`，对 Grant unsigned payload 签名；
3. 按 `grantId` 排序完整已签名 Grant，计算 `grantSetHash = SHA-256(canonicalGrantSet)`；
4. 计算 `definitionHash = SHA-256(canonicalWorkSpec + workSpecHash + grantSetHash)`。

Grant 不包含 `definitionHash`，因此不存在 Definition ↔ Grant 哈希环。

Worker 必须采用可检查点的 step runner。遇到 `per_action` 时，Worker 在调用工具前原子保存 `ContinuationCheckpoint` 与审批请求，然后释放租约并进入 `awaiting_approval`；不得保持模型流或进程挂起等待用户。

Checkpoint 元数据和小型规范化 payload 存入 `continuation_checkpoints`；大型或敏感 payload 加密写入 Artifact Store，并由 `contentHandle` 引用。写 checkpoint、更新 `WorkOrderState.continuationRef`、创建审批和 outbox 必须是一个事务。工作单终态后 checkpoint 进入不可恢复状态；任务审计保留期结束时物理删除 payload，只保留 ID、哈希和终态回执。

### 12.2 `WorkResult`

```ts
interface WorkResult {
  workOrderId: string
  definitionHash: string
  status: 'succeeded' | 'failed' | 'blocked' | 'cancelled'
  summary: string
  structuredOutput?: unknown
  artifacts: ArtifactRef[]
  evidence: EvidenceRef[]
  toolReceipts: ToolReceiptRef[]
  metrics: UsageMetrics
  warnings: string[]
  error?: AgentError
  assistanceRequest?: AssistanceRequest
}
```

返回 `succeeded` 只表示执行者认为工作完成，最终节点状态必须经过 `VerificationService`。`definitionHash` 不匹配或来自已失效计划版本的迟到结果只能归档，不能推进活动任务。

### 12.3 共享协议模块

`GoalSpec`、`ExecutionPlan`、`ExecutionPlanState`、`ResourceSelector`、`CapabilityRequirement`、`CapabilityGrant`、`ApprovalPolicyRef`、`OutputContract`、`WorkOrderDefinition`、`WorkOrderState`、`ContinuationCheckpoint`、`WorkResult` 和 Gateway transport schema 必须由 `project/src/salebuddy/runtime/contracts/` 单一导出，并携带 `schemaVersion`。Chief、Worker、mock Gateway、生产 Gateway 和 Renderer Adapter 不得各自复制或放宽结构；协议升级使用新增版本和兼容解析，不原地改变历史数据语义。

## 13. 任务状态机

### 13.1 `TaskRun` 状态与结果字段

`TaskRun.status` 描述生命周期；`TaskRun.resultDisposition` 描述交付结果，两者分离：

```ts
type TaskRunStatus =
  | 'draft'
  | 'needs_input'
  | 'planning'
  | 'awaiting_plan_approval'
  | 'queued'
  | 'running'
  | 'awaiting_action_approval'
  | 'verifying'
  | 'replanning'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled'

type ResultDisposition =
  | 'completed'
  | 'partially_completed'
  | 'failed'
  | 'cancelled'
```

只有 `completed`、`failed`、`cancelled` 是生命周期终态。`resultDisposition` 只在终态写入。

### 13.2 合法转换表

| 当前状态 | 允许的下一状态 | 触发条件 |
|---|---|---|
| `draft` | `needs_input`, `planning`, `cancelled` | 目标缺失、目标可编译、用户取消 |
| `needs_input` | `planning`, `cancelled` | 收到足够输入、用户取消 |
| `planning` | `awaiting_plan_approval`, `queued`, `needs_input`, `paused`, `failed`, `cancelled` | 计划风险、自动批准、需澄清、预算/策略暂停、不可规划、用户取消 |
| `awaiting_plan_approval` | `queued`, `planning`, `cancelled` | 批准、驳回并修订、用户取消 |
| `queued` | `running`, `paused`, `cancelled` | 获得调度资源、用户/策略暂停、用户取消 |
| `running` | `awaiting_action_approval`, `verifying`, `replanning`, `paused`, `failed`, `cancelled` | 无其他可运行节点且关键动作待批、节点结束、计划失效、暂停、必需节点不可恢复失败、取消 |
| `awaiting_action_approval` | `running`, `replanning`, `paused`, `cancelled` | 批准、驳回需改计划、审批过期/预算暂停、取消 |
| `verifying` | `completed`, `replanning`, `awaiting_action_approval`, `paused`, `failed`, `cancelled` | 验收通过、可修复失败、交付前高风险确认、预算/策略暂停、不可恢复失败、取消 |
| `replanning` | `awaiting_plan_approval`, `running`, `needs_input`, `paused`, `failed`, `cancelled` | 新计划需批、自动批准并继续、需用户输入、预算/策略暂停、超过重规划上限、取消 |
| `paused` | `planning`, `queued`, `running`, `awaiting_action_approval`, `verifying`, `replanning`, `failed`, `cancelled` | 恢复到 `resumeTargetStatus`、无法继续、用户取消 |

进入 `paused` 时必须保存 `resumeTargetStatus`。恢复前重新验证授权、预算、计划版本和租约，不能盲目恢复旧 Worker。

### 13.3 审批和预算状态规则

- 单个节点等待审批时，该节点进入 `awaiting_approval`，其他独立节点可以继续，`TaskRun` 保持 `running`；
- 只有当没有其他可运行节点且待审批动作阻塞关键路径时，`TaskRun` 才进入 `awaiting_action_approval`；
- 任一预算维度达到硬上限时停止新调度并进入 `paused`，`pauseReason = 'budget_exceeded'`；
- 用户补充预算后恢复；若用户拒绝增加预算，Runtime 先进入 `verifying` 评估现有产物，能满足全部必需交付物则完成，只缺可选交付物则部分完成，否则进入 `failed`；
- 具体动作被驳回时进入 `replanning` 寻找无该动作的替代方案，无法满足必需交付物才进入 `failed`；审批过期时进入 `paused`，恢复后必须重新申请或重规划，不能复用过期审批；
- 若现有已验证产物满足全部必需交付物，则进入 `completed`；缺失的仅为可选交付物时 `resultDisposition = 'partially_completed'`。

成本型模型调用只允许发生在 `planning`、`running`、`verifying` 和 `replanning`。`draft`/`needs_input` 收到可处理输入后，运行时先确定性转入 `planning` 再调用模型；两类审批等待和 `paused` 状态禁止后台模型继续消费。

### 13.4 `WorkOrder` 状态

```text
pending -> ready -> leased -> running -> verifying -> succeeded
                                  |          |
                                  |          -> rejected (terminal attempt)
                                  -> awaiting_approval -> ready
                                  -> blocked
                                  -> failed
                                  -> cancelled

new retry definition: retry_wait -> ready -> leased -> ...
```

每次执行使用短租约。Worker 崩溃或租约过期后，运行时先检查工具回执，再决定恢复、创建新重试定义或请求人工确认。`rejected` 终结当前 attempt；只有尝试次数和预算都允许时，Runtime 才创建 `attempt + 1` 的新 Definition，并令其初始状态为 `retry_wait`。

- `leased` 租约过期后，对账确认无副作用才可回到 `ready`；
- `awaiting_approval` 批准后回到 `ready`；新租约从 `continuationRef.resumeStepId` 恢复，先核验 checkpoint、定义、Grant 和动作指纹，再执行一次已批准工具动作。驳回后进入 `cancelled`，由重规划决定是否创建新定义；
- `blocked` 的外部前置条件恢复后可回到 `ready`，否则进入 `failed` 或 `cancelled`；
- 新 Definition 的 `retry_wait` 到期后可进入 `ready`，任务暂停或取消时进入 `cancelled`；
- `succeeded`、`rejected`、`failed`、`cancelled` 为当前 attempt 终态。

Tool Adapter 不支持可靠 checkpoint 时，不允许在一个 `WorkOrder` 中途申请审批；`PlanCompiler` 必须把“准备动作”和“执行已批动作”拆成两个节点，通过已验证产物交接。两种模式都不能从头重跑审批前步骤。

## 14. 调度与并发

`DAGScheduler` 只调度依赖条件成立、权限已满足、预算已预留且任务未暂停的节点。

调度优先级依次考虑：

1. 用户显式优先级；
2. 关键路径；
3. 审批和外部时间窗口；
4. Agent 与工具可用性；
5. 预估成本。

同一 Agent默认一次只执行一个有外部副作用的 `WorkOrder`。只读任务可以按 Agent 配置并发。对 CRM 记录、邮箱线程、账号和文件路径等共享资源，`ToolGateway` 使用资源锁或幂等键避免冲突。

公平性由任务级配额保证，单个长任务不能占满全部 Worker。第一阶段不实现复杂全局抢占，只限制每个任务最大并发数和每个 Agent最大并发数。`estimatedUsage` 只用于计划展示；真正调度前必须按本次调用可执行的最坏上限原子预留 `budgetSlice`，完成后按真实回执结算并释放差额，避免并发节点共同透支任务预算。

## 15. 工具调用与副作用控制

### 15.1 工具分类

| 类别 | 示例 | 默认策略 |
|---|---|---|
| `read_public` | 搜索公开网页 | 预算内自动执行 |
| `read_private` | 读取 CRM、邮件 | 需要数据范围授权 |
| `write_internal` | 写共享文件、更新内部标签 | 按项目策略执行 |
| `external_send` | 发邮件、发私信、提交表单 | 默认需要审批 |
| `destructive` | 删除、覆盖、撤销记录 | 必须逐次审批 |
| `financial` | 下单、付费、购买数据 | 必须逐次审批和金额限制 |

### 15.2 `CapabilityGrant`

运行时为每个 `WorkOrderDefinition` 的每项能力要求分别签发最小权限凭证，形成不可变 Grant 集合。每个 Grant 包含：

- 允许的工具与操作；
- 数据范围；
- 对象范围；
- 数量和金额限制；
- 过期时间；
- 绑定的 `taskRunId`、`workOrderId` 和计划版本。

Worker 不能仅凭自己的 Profile 调用工具；Profile 是资格，`CapabilityGrant` 才是本次任务授权。

```ts
interface CapabilityGrant {
  grantId: string
  taskRunId: string
  workOrderId: string
  planVersion: number
  workSpecHash: string
  toolClass: string
  operations: string[]
  dataScopes: string[]
  resourceSelectors: ResourceSelector[]
  limits: Record<string, number>
  approvalMode: 'none' | 'plan_acknowledgement' | 'per_action'
  policyVersion: number
  authorizationEpoch: number
  expiresAt: string
  keyId: string
  signature: string
}
```

Grant 内容必须等于节点要求、Agent 资格、用户授权、项目策略和剩余预算的交集；任何一方不能证明允许的操作都从 Grant 中删除。每个要求必须得到一个覆盖它的 Grant，否则整个 `WorkOrderDefinition` 不得创建。`plan_acknowledgement` 只证明计划风险已确认，不是精确副作用批准；`per_action` Grant 在匹配有效 `ApprovalSummary` 前不可执行。

签名和未过期只是必要条件。`ToolGateway` 每次工具调用前必须在线校验当前 `policyVersion`、受影响授权范围的 `authorizationEpoch` 和 `capability_revocations`；任一不匹配立即返回 `grant_revoked`。用户撤权时，Runtime 在同一事务中递增相关 epoch、写撤销记录，并取消或阻塞尚未发生副作用的活动工作单。已经提交到外部系统的动作不能假装撤回，只能进入对账或补偿流程。

### 15.3 密钥处理

真实密钥保存在宿主安全存储或系统钥匙串中。Prompt、事件日志、产物和普通数据库记录只保存 `secretRef`，不保存密钥明文。工具结果进入模型上下文前进行敏感字段裁剪和脱敏。

### 15.4 审批绑定

审批必须绑定精确动作指纹：目标对象、内容摘要、数量、金额、工具、计划版本和过期时间。审批后内容发生实质变化必须重新申请，不能复用旧批准。

```ts
interface ApprovalSummary {
  approvalId: string
  taskRunId: string
  workOrderId?: string
  definitionHash?: string
  grantSetHash?: string
  actionFingerprint: string
  actionSummary: string
  riskLevel: 'low' | 'medium' | 'high' | 'critical'
  status: 'pending' | 'approved' | 'rejected' | 'expired' | 'stale'
  expiresAt: string
}
```

`actionFingerprint` 由规范化工具名、操作、目标资源、内容哈希、数量、金额、计划版本、`definitionHash` 和 `grantSetHash` 计算。执行时再次计算，不一致则审批变为 `stale`。

## 16. 上下文组装

`ContextAssembler` 按层组装最小必要上下文：

```text
Platform Constitution
  -> Organization Policy
  -> Chief Agent Profile
  -> Project Rules
  -> GoalSpec + active ExecutionPlan
  -> relevant event delta
  -> relevant memory excerpts with provenance
  -> referenced artifacts/evidence summaries
```

### 16.1 上下文规则

- 不加载全部历史聊天，只加载摘要、最近事件和被引用消息；
- 不加载全部 Agent 记忆，只按任务、项目、岗位和权限检索；
- 原始大文件先建立摘要和索引，需要时按片段读取；
- 每条记忆携带来源、作用域、版本、置信度和有效期；
- 工具返回的不可信文本作为数据处理，不允许覆盖系统规则；
- 上下文超限时优先保留目标合同、安全规则、活动计划和最新异常。

### 16.2 决策可解释性

系统保存 `decisionSummary`、引用证据和被接受的结构化命令，不保存或展示模型的隐藏思维链。用户看到的是简洁、可验证的理由，例如“选择线索猎人，因为任务需要公开网页检索且它拥有相应数据范围”。

## 17. 记忆架构

### 17.1 记忆范围

沿用四级作用域：

- `task`：仅当前任务；
- `project`：当前项目；
- `agent`：某个岗位员工长期适用；
- `organization`：整个 SaleBuddy 组织适用。

### 17.2 写入流程

执行日志不会直接成为长期记忆。记忆写入流程为：

```text
user feedback or verified lesson
        -> MemoryCandidate
        -> scope/provenance/conflict check
        -> user confirmation when scope is long-lived
        -> versioned MemoryEntry
```

以下内容不得自动长期保存：未经验证的模型猜测、第三方 Prompt 指令、敏感凭据、一次性临时数据、与岗位无关的私人信息。

### 17.3 冲突和回退

新规则与现有规则冲突时，不静默覆盖。系统保留版本，标记冲突并请求用户选择。每条长期记忆必须支持停用、过期、回退和删除，并记录影响过哪些任务。

普通删除使用墓碑：立即从检索和 Prompt 中排除内容，但保留不含正文的审计元数据。事件分别使用 `memory.deleted` 和 `memory.erased`，二者都不能被普通 Agent撤销。

“擦除一条记忆”的冻结边界是该 `MemoryEntry` 的正文、版本正文、专属附件片段、Embedding、检索缓存和 Prompt 缓存。`memory.committed` 等审计事件从一开始只允许保存 ID、作用域、来源引用和内容哈希，禁止复制正文，因此无需改写追加式事件。

来源消息、原始任务产物和工具日志是独立记录，不随记忆擦除自动删除；UI 必须在执行前明确告知这一点。用户要求同时删除来源时，进入独立的数据擦除操作，按明确的 message/artifact/log selector、审计与法定保留策略处理，不能扩大“删除记忆”的隐式范围。

隐私擦除在活动数据库、向量索引和缓存中立即失效并异步物理清除。自动备份最长保留 30 天；从旧备份恢复时必须先应用独立 `erasure_receipts` 再开放读取，确保已擦除内容不会复活。删除回执不含正文或可逆内容。

## 18. 预算与模型路由

### 18.1 多维预算合同

预算不是一个百分比数字，而是独立维度的上限集合：

```ts
interface BudgetLimit {
  currencyMinor?: number
  inputTokens?: number
  outputTokens?: number
  modelCalls?: number
  toolCalls?: number
  externalMessages?: number
  storageBytes?: number
  durationSec?: number
}

interface BudgetUsage {
  currencyMinor: number
  inputTokens: number
  outputTokens: number
  modelCalls: number
  toolCalls: number
  externalMessages: number
  storageBytes: number
  durationSec: number
}
```

有效预算由四类约束取交集，而不是 `organization -> agent -> task` 的单链分配：

- 组织周期预算：限制全组织累计使用；
- Agent 策略上限：限制某岗位可消耗的维度，不从任务预算中预先分一份固定池；
- `TaskRun` 硬预算：用户为本任务批准的总上限；
- `WorkOrder` 预算切片：从任务可用额度中原子预留。

每条 `UsageLedgerEntry` 同时归集到组织、任务、Agent、`WorkOrder` 和用途标签。主 Agent的规划、监督和验收调用计入任务的 `chief_overhead`，不伪装成专业 Agent成本。

### 18.2 软阈值与硬上限

每个有限维度独立计算 `usage / limit`，不把 Token、金额和时长强行换算成一个综合百分比。任一维度：

- 达到 70%：记录该维度告警，主 Agent评估是否缩减非关键工作；
- 达到 90%：停止为该维度预留新的非关键消耗，必要时请求加预算；
- 达到 100%：阻止所有会继续消耗该维度的动作，按 13.3 节进入 `paused`。

未设置上限的维度仍记录用量，但不触发百分比状态。阈值是组织默认策略，可收紧但不能由模型放宽。并发预留和结算必须在同一数据库事务中更新，确保硬上限不会被并发透支。

`durationSec` 只累计 `queued`、`running`、`verifying` 和 `replanning` 的活动执行时间，不累计 `needs_input`、两类 `awaiting_*_approval` 或 `paused` 的用户等待时间。

### 18.3 调用级硬上限

每次模型或工具调用都必须先形成可执行 ceiling：

- 模型调用根据剩余 Token 和金额额度设置最大输入、最大输出与可取消流；到达 ceiling 立即停止生成；
- 工具 Adapter 必须提供 `maxCharge`、最大调用数、最大消息数或等价供应商限额；
- 无法给出并强制执行最坏上限的可变计费工具，不得在硬预算任务中自动运行，只能在用户单独批准的 contingency 额度内运行；
- 调用需要追加额度时，先原子扩大 reservation；失败则在发起额外消耗前截断并返回 `budget_exceeded`；
- 正常回执不得超过 reservation。若供应商错误账单导致事后超额，记录 `budget.overrun_detected` 安全事件、立即暂停任务并禁止该 Adapter 继续调用；系统不能把已发生的外部超额伪装成未突破。

因此“硬上限”指 Runtime 只调用能够接受并执行 ceiling 的模型/工具；对不支持 ceiling 的外部系统明确降级为逐次 contingency 审批，而不是依赖估算。

### 18.4 `ModelRouter`

模型路由使用能力策略而非在业务代码中硬编码供应商：

- 主 Agent规划和复杂验收使用高推理等级；
- 结构化抽取、分类和简单改写使用经济等级；
- 专业 Agent按工具能力、上下文长度和输出要求选择等级；
- 回退模型必须支持相同的结构化输出和工具协议；
- 每次调用记录实际模型、供应商、延迟、Token、费用和回退原因。

模型故障可以触发兼容回退；安全拒绝、权限拒绝和结构校验失败不能通过换模型绕过。

## 19. 结果验收与最终交付

### 19.1 四层验收

1. `Schema Validation`：输出结构和必填字段。
2. `Deterministic Validation`：数量、格式、重复、文件存在性、权限和业务规则。
3. `Evidence Validation`：结论是否有来源、工具回执或产物支撑。
4. `Semantic Review`：内容是否满足目标、约束和交付标准。

语义审查可以由模型完成，但不能覆盖前三层失败。

### 19.2 验收失败

验收失败返回结构化 `VerificationResult`：失败标准、证据、可修复性和建议动作。主 Agent在剩余预算和尝试次数内决定让原 Agent修复、换 Agent、修改计划或请求用户。

同一节点的 `WorkOrderDefinition` 数量最多为 `maxAttempts`；每次验收拒绝或可重试执行失败都创建 `attempt + 1` 的新定义、新预算 reservation 和新派发键。超过后必须按节点 `failurePolicy` 阻塞、降级或失败，禁止隐藏失败并继续生成最终总结。

### 19.3 最终交付格式

`DeliveryReport` 至少包含：

- 结论和完成状态；
- 已完成的交付物；
- 关键数据及证据引用；
- 采取了哪些重要动作；
- 未完成事项和原因；
- 风险、假设和需要用户决定的事项；
- 实际成本、耗时和参与 Agent；
- 推荐下一步。

部分成功必须明确写成 `partially_completed`，不能包装成完全成功。

## 20. 失败处理与恢复

### 20.1 错误分类

```text
transient_tool_error
rate_limited
authentication_required
permission_denied
budget_exceeded
invalid_output
evidence_missing
dependency_failed
agent_unavailable
user_input_required
policy_violation
non_retryable_external_error
```

只有明确可重试的错误才进入自动重试。权限、预算、认证、策略冲突和不可逆外部状态不自动重试。

### 20.2 重试策略

- 使用指数退避和抖动；
- 每次重试创建新 `WorkOrderDefinition`；同一逻辑工具副作用复用原业务幂等键，派发键则随新定义变化；
- 重试前检查外部系统是否已经成功；
- 每次重试记录原因和前一次回执；
- 输出错误优先进行一次定向修复，不重新执行已成功的昂贵步骤。

### 20.3 进程恢复

本地 Runtime 启动时：

1. 从 SQLite 当前状态表读取非终态 `TaskRun`、活动计划和 `WorkOrderState`；
2. 检查聚合版本、过期租约、`continuationRef` 完整性和未确认工具调用；
3. 对可查询工具执行状态对账；
4. checkpoint 存在且哈希/Definition/Grant/审批均匹配时恢复到 `ready`；缺失或损坏时进入 `blocked` 并报告 `checkpoint_missing`，禁止从头重跑；
5. 恢复其他调度或进入人工确认；
6. 从 outbox 继续发布尚未确认的集成事件；
7. 根据当前状态生成 Gateway 快照，客户端再从各自游标接收增量事件。

外部副作用不存在通用“恰好一次”保证，因此使用幂等键、工具回执和对账实现业务级去重。

### 20.4 取消

取消操作立即阻止新调度，向活动 Worker传播取消信号。已经发生的外部动作不会虚假回滚；系统必须列出已完成、已停止和无法撤销的动作。

## 21. 事件模型与可观测性

本系统明确采用“当前状态表 + 追加式审计/集成事件”，不采用完整事件溯源。SQLite 中的当前聚合行是运行时权威事实；领域事件用于审计、UI 增量投影和跨组件通知，但 Runtime 不依赖从零重放事件才能恢复。每次合法状态转换、对应审计事件和 outbox 记录在同一事务中提交。

### 21.1 事件信封

```ts
interface DomainEvent<T> {
  eventId: string
  eventType: string
  taskRunId: string
  taskSequence: number
  aggregateType: 'task_run' | 'execution_plan' | 'work_order' | 'approval' | 'memory'
  aggregateId: string
  aggregateVersion: number
  actorType: 'user' | 'chief' | 'worker' | 'runtime' | 'tool'
  actorId: string
  correlationId: string
  causationId?: string
  idempotencyKey?: string
  occurredAt: string
  payload: T
}
```

同一 `taskRunId` 的 `taskSequence` 单调递增，供 Gateway/UI 使用；每个聚合的 `aggregateVersion` 独立递增，供并发控制使用。消费者按 `eventId` 去重，按 `taskSequence` 检测 UI 增量遗漏，不能拿一个 `WorkOrder` 的聚合版本与另一个聚合比较。

事件 payload 只保存状态变化所需的最小元数据和内容引用。记忆正文、消息正文、附件正文、密钥和完整工具输出不得复制进事件或 outbox；使用 ID、哈希和受权限控制的内容句柄引用。

### 21.2 核心事件

```text
task.created
goal.confirmed
clarification.requested
plan.proposed
plan.approved
task.started
work.assigned
work.started
tool.started
tool.completed
artifact.created
work.completed
work.failed
verification.passed
verification.failed
approval.requested
approval.resolved
budget.threshold_reached
budget.overrun_detected
task.replanned
task.paused
task.resumed
task.completed
task.failed
task.cancelled
memory.proposed
memory.committed
memory.deleted
memory.erased
```

### 21.3 日志与指标

每个模型调用、工具调用、状态转换和审批都携带 `taskRunId`、`workOrderId`、`correlationId`。核心指标包括：

- 任务成功率和部分成功率；
- 首次计划成功率；
- 平均重规划次数；
- 各 Agent验收通过率；
- 每类任务成本和耗时；
- 审批等待时长；
- 工具错误率和重复副作用率；
- 恢复成功率；
- 用户对交付物的接受或返工率。

日志默认脱敏，不记录密钥、完整私人消息或模型隐藏思维链。

## 22. Gateway 协议

以下接口在本设计中冻结为 v1 契约。沿用现有 `ws-ag-ui` 与 `gateway.action` 信封，不篡改恢复版 action 语义。

### 22.1 请求、ack 与错误

```json
{
  "event": "gateway.action",
  "requestId": "client-42",
  "payload": {
    "action": "task.action.get",
    "taskRunId": "task-123",
    "afterSequence": 18
  }
}
```

成功或业务失败都使用现有 ack 关联：

```json
{
  "type": "ack",
  "requestId": "client-42",
  "data": {
    "code": 0,
    "data": {}
  }
}
```

- `code = 0` 表示成功；
- 非零 `code` 必须包含稳定 `errorCode`、用户可读 `message` 和可选 `details`；
- WebSocket 解析、鉴权或未知请求等无法形成 ack 的错误使用现有 `{ "type": "error", "event": "...", "message": "..." }`；
- 任务写 action 必须携带 `expectedTaskVersion`，版本冲突返回 `TASK_VERSION_CONFLICT` 和最新 `TaskSummary`；计划/审批聚合写入还要携带各自 state version；
- 稳定业务错误至少包括 `TASK_NOT_FOUND`、`TASK_TERMINAL`、`INVALID_TRANSITION`、`TASK_VERSION_CONFLICT`、`PLAN_STATE_VERSION_CONFLICT`、`APPROVAL_VERSION_CONFLICT`、`APPROVAL_STALE`、`BUDGET_EXCEEDED` 和 `PERMISSION_DENIED`。

### 22.2 v1 action

| Action | 必需 payload | `data` 响应 |
|---|---|---|
| `task.action.create` | `messageId`, `goalText`, `attachmentRefs[]`, `projectId?` | `TaskSnapshot`, `resumeSequence` |
| `task.action.get` | `taskRunId`, `afterSequence?` | `syncMode`, `snapshot?`, `events[]`, `resumeSequence` |
| `task.action.list` | `status[]?`, `pageCursor?`, `pageSize` | `items[]`, `nextPageCursor?` |
| `task.action.pause` | `taskRunId`, `expectedTaskVersion`, `reason?` | `TaskSummary` |
| `task.action.resume` | `taskRunId`, `expectedTaskVersion` | `TaskSummary` |
| `task.action.cancel` | `taskRunId`, `expectedTaskVersion`, `reason?` | `TaskSummary` |
| `task.action.message` | `taskRunId`, `expectedTaskVersion`, `messageId`, `text`, `attachmentRefs[]` | `acceptedVersion` |
| `task.action.subscribe` | `taskRunId`, `afterSequence` | `subscriptionId`, `syncMode`, `snapshot?`, `events[]`, `resumeSequence` |
| `task.action.unsubscribe` | `subscriptionId` | `unsubscribed` |
| `plan.action.get` | `taskRunId`, `planVersion?` | `ExecutionPlan`, `ExecutionPlanState` |
| `plan.action.approve` | `taskRunId`, `planId`, `planVersion`, `decision`, `expectedTaskVersion`, `expectedPlanStateVersion` | `TaskSummary`, `ExecutionPlanState` |
| `approval.action.respond` | `approvalId`, `decision`, `actionFingerprint`, `expectedTaskVersion`, `expectedApprovalVersion` | `ApprovalSummary`, `TaskSummary` |
| `artifact.action.list` | `taskRunId`, `workOrderId?` | `ArtifactRef[]` |
| `artifact.action.get` | `artifactId` | `ArtifactMetadata`, `contentHandle` |
| `usage.summary` | `taskRunId` | `BudgetLimit`, `BudgetUsage`, `BudgetReservation[]` |

`messageId`、批准动作和任务创建均支持幂等重放。同一个 `messageId` 重发返回原结果，不创建第二个任务或第二次用户变更。

`plan.action.approve` 在一个数据库事务中同时 CAS `TaskRun.version` 与 `ExecutionPlanState.stateVersion`、更新活动计划指针、追加 `plan.approved`/任务事件并写 outbox；任一 CAS 失败则整笔回滚。重规划创建新计划后，旧 `planId + planVersion` 的批准请求返回 `PLAN_STATE_VERSION_CONFLICT` 或 `APPROVAL_STALE`，不得批准旧计划。

传输类型固定为：

```ts
interface TaskSummary {
  taskRunId: string
  version: number
  title: string
  status: TaskRunStatus
  resultDisposition?: ResultDisposition
  activeGoalVersion?: number
  activePlanVersion?: number
  updatedAt: string
}

interface TaskSnapshot {
  task: TaskSummary
  goal?: GoalSpec
  plan?: ExecutionPlan
  planState?: ExecutionPlanState
  workOrders: Array<{ definition: WorkOrderDefinition; state: WorkOrderState }>
  approvals: ApprovalSummary[]
  artifacts: ArtifactRef[]
  budgetLimit: BudgetLimit
  budgetUsage: BudgetUsage
  resumeSequence: number
}
```

快照只包含当前活动版本和 UI 所需摘要；历史版本通过明确的版本参数读取，不在每次同步中全量返回。

### 22.3 同步和订阅

`afterSequence` 是当前 `taskRunId` 内最后已持久化的整数 `taskSequence`，初始值为 `0`。

- 游标仍在保留窗口内：`syncMode = 'events'`，返回所有缺失事件；
- 游标为 `0`、已过期或服务端无法证明连续：`syncMode = 'snapshot'`，返回当前 `TaskSnapshot`，`events` 为空；
- `resumeSequence` 永远等于响应覆盖到的最后序号；
- 订阅建立成功后，Gateway 发送：

```json
{
  "type": "event",
  "event": "task.event",
  "data": {
    "subscriptionId": "sub-9",
    "taskRunId": "task-123",
    "taskSequence": 19,
    "domainEvent": {}
  }
}
```

客户端发现序号不连续时停止应用增量并调用 `task.action.get` 修复，不自行猜测缺失状态。`TaskSnapshot` 是当前状态表生成的传输快照，不是第二事实源。

### 22.4 Gateway 责任边界

Gateway 负责鉴权、请求关联、订阅、传输和协议适配，不承载规划逻辑。Renderer 的 `SaleBuddyGatewayClient` 负责把非零业务 code 转换为带 `errorCode` 的可处理错误，并在重连后按每个活动任务的游标恢复订阅。

## 23. 数据持久化

### 23.1 第一阶段部署

生产目标是让主 Agent Runtime 运行在可维护的本地 Gateway/daemon 宿主中，避免在浏览器渲染进程中保存权威状态；恢复版仓库的可实现边界遵循 2.1 节。

使用 SQLite WAL：

- `task_runs`：当前生命周期状态、聚合版本、确认前 `goalDraft`、活动目标/计划指针、`resultDisposition` 和恢复字段；
- `goal_specs`：按 `taskRunId + version` 保存不可变目标合同；
- `execution_plans`：按 `taskRunId + version` 保存不可变计划；
- `execution_plan_states`：保存计划批准、激活、superseded 和完成状态及独立 CAS 版本；
- `work_order_defs`：不可变工作单定义、`definitionHash` 和所属计划版本；
- `work_order_states`：可变状态、聚合版本、租约和终态原因；
- `continuation_checkpoints`：审批前 step checkpoint、内容句柄、哈希、有效期和清理状态；
- `authorization_epochs`：组织/项目/Agent/工具范围的当前授权代际；
- `capability_revocations`：已撤销 Grant、原因和撤销时间；
- `events`：追加式领域事件；
- `approvals`：动作指纹和审批结果；
- `artifacts`：产物元数据和内容地址；
- `usage_ledger`：不可变真实用量流水；
- `budget_reservations`：活动预算预留和结算状态；
- `memories`：版本化记忆、墓碑和隐私擦除状态；
- `erasure_receipts`：不含正文的擦除 selector、完成状态和备份恢复屏障；
- `agent_profiles`：员工档案。

旧版 `GoalSpec`、`ExecutionPlan` 和 `WorkOrderDefinition` 永不原地覆盖；`task_runs` 只更新活动版本指针，`ExecutionPlanState` 单独流转。大文件放入任务工作空间，数据库只保存元数据、哈希和路径。所有写入通过 Repository 接口，以便未来迁移到云端数据库和对象存储。

### 23.2 原子性

当前聚合行的 compare-and-swap 更新、审计事件、预算预留/结算和待发布 Gateway outbox 在同一事务中提交。SQLite 当前状态表是运行时事实源；事件是审计和增量投影日志。客户端投影可从当前 `TaskSnapshot` 加其后的连续事件重建，但 Runtime 恢复不依赖全量事件重放。

## 24. 与现有前端和办公室集成

### 24.1 `task-runner.js`

现有固定 `SCRIPTS`、`RUNS`、计时器日志、预写产物和随机成本不再作为正式引擎。Phase 1 即把该模块的权威状态迁出，重构为任务会话控制器：

- 提交用户目标；
- 订阅任务事件；
- 渲染主 Agent、专业 Agent、审批和产物；
- 发送补充要求、暂停、恢复和取消；
- 断线后按 `taskSequence` 补齐事件。

### 24.2 看板和任务房间

现有 `task-store` 降级为客户端读模型缓存，权威状态来自 `task.snapshot` 和 `task.event`。任务房间展示参与者、计划、事件和文件，但不创建第二套任务状态。

### 24.3 文件和资源中心

文件中心消费 `artifact.created`；资源中心消费 `usage_ledger` 投影。成本必须来自真实模型和工具回执，不再使用随机数。

### 24.4 办公室

保留现有办公室业务状态与动画映射，绝不 patch 冻结 bundle。办公室继续只读取原 Conversation Store 中已经确认的 main/subagent 状态。生产 Gateway 侧新增 `ConversationProjectionAdapter`，把 Runtime 事实投影为原协议可识别的 assistant/subagent 消息；Renderer `bridge/` 只读这些集成点，不直接注入办公室动作。

```text
task.started
  -> main assistant status = generating
  -> existing adapter emits START(main)

work.assigned
  -> no office event yet

work.started
  -> create/update one subagent item identified by workOrderId, status = running
  -> existing dCe detects new running subagent and emits DISPATCH + START

work.completed
  -> update the same subagent item, status = completed
  -> existing dCe emits COMPLETE

work.failed
  -> update the same subagent item, status = failed
  -> existing dCe emits ERROR

task.cancelled / task.failed / task.completed
  -> update main assistant terminal status
  -> existing adapter emits CANCEL / ERROR / COMPLETE-FINISH
```

`work.assigned` 不创建运行中的 subagent，避免随后 `work.started` 重复派发。历史恢复继续由现有 dCe 根据运行中的 subagent 快照选择 `SUB_START`，Runtime 不直接发送 `SUB_START`。审批和 `tool.started` 只显示在新任务 UI，不映射到未确认存在的办公室子状态。办公室不解析模型文本，也不通过定时器制造业务状态。

如果生产 Gateway 无法输出原 Conversation Store 所需的 subagent 协议，则办公室真实联动被明确标记为外部阻塞；不得通过写 `window.__STORE__` 或改 bundle 假装完成。

## 25. 安全模型

安全边界遵循：用户授权高于主 Agent，运行时策略高于模型建议，工具执行只相信能力凭证。

必须落实：

- 每个任务、项目和 Agent的数据隔离；
- 最小权限 `CapabilityGrant`；
- 高风险动作精确审批；
- Prompt injection 内容隔离和来源标记；
- 工具输入输出 Schema 验证；
- 密钥引用与日志脱敏；
- 下载文件类型、大小和路径校验；
- 审计日志不可由普通 Agent修改；
- 用户可以查看、撤销和收紧授权；
- 已撤销授权对新工具调用立即生效。

模型输出一律视为不可信建议，必须经过结构校验和策略校验。

## 26. 测试策略

### 26.1 单元测试

- `GoalSpec` 和计划 Schema；
- 状态机合法/非法转换；
- DAG 环检测和依赖调度；
- Agent权限过滤；
- 多工具 `CapabilityRequirement` 到 Grant 集合的一一映射和资源 selector 包含证明；
- 预算软阈值与硬上限；
- 并发 reservation、调用级 ceiling 和超额安全停机；
- 审批动作指纹；
- 审批 checkpoint 恢复且不重复审批前步骤；
- 重试创建新 Definition、attempt 递增并复用工具业务幂等键；
- `workSpecHash -> Grant signatures -> grantSetHash -> definitionHash` 固定顺序；
- TaskRun/ExecutionPlanState 双 CAS 原子批准；
- 授权 epoch 变化和 Grant 撤销在下一次工具调用生效；
- 事件版本、去重和乱序处理；
- 记忆作用域、冲突和回退；
- 记忆墓碑、隐私擦除范围和备份恢复屏障；
- 工具输入输出验证。

### 26.2 契约测试

- Chief structured decision schema；
- `WorkOrder`/`WorkResult`；
- Gateway action/ack/event；
- ModelRouter fallback compatibility；
- ToolGateway idempotency receipt；
- UI projection snapshot。

### 26.3 场景测试

至少覆盖：

1. 简单问题直接回答，不创建任务；
2. 用户目标缺信息，主 Agent只问一个关键问题；
3. 潜客任务动态生成多节点计划；
4. 两个无依赖节点并行执行；
5. 高风险外发动作等待审批；
6. 审批后内容改变，旧审批失效；
7. 子 Agent输出缺证据，被验收拒绝并定向返工；
8. 工具瞬时失败后幂等重试；
9. 预算达到硬上限后停止新成本；
10. 用户中途修改目标，生成新计划版本；
11. 用户取消时停止新调度并列出已发生副作用；
12. Runtime 重启后恢复任务且不重复发送；
13. 重复和乱序事件不制造幽灵工作状态；
14. Agent离线时换用合格候选或明确阻塞；
15. 部分成功按真实状态交付。
16. 规划、验收和重规划阶段预算耗尽后合法暂停并恢复。
17. 多工具节点只收到要求与授权交集内的 Grant 集合。
18. 审批等待释放 Worker，批准后从 checkpoint 续跑且副作用只发生一次。
19. 擦除记忆后正文不会从向量、缓存或旧备份恢复。
20. Runtime 重启能恢复持久化 checkpoint；checkpoint 缺失时阻塞而非从头执行。
21. 用户撤权后，未过期旧 Grant 的下一次工具调用仍被拒绝。

### 26.4 模型评测

建立版本化任务集，评测：目标提取准确率、计划可执行率、Agent选择准确率、澄清必要性、验收缺陷检出率、成本和最终用户接受率。Prompt 或模型变更必须通过离线回放，不能只靠人工体验。

模型评测使用固定输入、工具模拟器和预期不变量；涉及真实外部副作用的测试只在隔离账号中执行。

## 27. 性能与容量

第一阶段目标以个人桌面组织为基准：

- 单用户最多 3 个活动 `TaskRun`；
- 单任务最多 4 个并发 `WorkOrder`；
- Gateway 增量保留窗口达到阈值后，后续重连改用当前状态生成的 `TaskSnapshot`；
- UI 只订阅活动任务的增量事件；
- 大型工具日志存入独立文件，事件只保留摘要和引用；
- 主 Agent唤醒上下文受 Token 预算限制；
- Gateway 断线不影响 Runtime 继续执行已授权的低风险工作。

超出限制的任务排队，不通过无限启动模型请求扩容。

## 28. 迁移方案

### Phase 1：确定性任务核心与投影适配

实现：

- 在 `project/src/salebuddy/runtime/` 建立当前状态模型、版本表、状态机、DAG 编译器、预算预留、SQLite Repository 接口和 outbox；
- 使用 `ScriptedChiefAdapter` 生成固定结构化计划，使用 `ScriptedWorkerAdapter` 返回现有演示产物；
- `gateway-mock.mjs` 承载测试数据库和 v1 Gateway 契约；
- `task-runner.js` 在本阶段就停止作为事实源，改为通过 `TaskClient` 读取快照和事件；
- 其他外围页面暂时继续使用兼容投影。

最小演示：提交潜客任务，经过真实状态机、工作单、审批、产物和成本流水完成，但模型与工具仍为脚本模拟。

退出标准：重启恢复、重复事件、版本冲突、暂停/恢复/取消和预算硬上限自动测试通过；任务 UI 无需 `RUNS` 也能重开同一任务。

### Phase 2：真实主 Agent，模拟 Worker

实现：

- 接入真实 `ModelRouter`，实现 `ContextAssembler` 和 `ChiefDecision` 结构化输出；
- 实现 `GoalInterpreter`、`PlanCompiler`、AgentRegistry、PolicyEngine 和 BudgetGuard；
- Worker 仍使用确定性的 `SimulatedWorkerAdapter`，工具不产生外部副作用。

最小演示：用户用三种不同表达提交同一目标，主 Agent动态生成可编译计划、选择合格团队，并在权限不足时明确阻塞。

退出标准：目标/计划评测集、结构化输出契约、计划编译拒绝用例和模型回退测试达到第 26 节要求；没有任何真实外部发送。

### Phase 3：黄金闭环真实 Worker 与只读工具

实现：

- 接入 Browser、Search 和 File 三类真实 Worker；
- 接入公开网页搜索、只读数据处理和文件产物工具；
- 实现真实工具回执、证据验收、重试和用量结算；
- 外发动作仍禁用，只生成触达方案。

最小演示：完成第 29 节黄金闭环，所有关键结论具有来源和产物。

退出标准：隔离环境端到端测试通过；无证据结果会被拒绝；Runtime 重启不会重复工具副作用；人工验收交付物可用。

### Phase 4：审批副作用与外围投影

实现：

- 接入受审批的单条外发工具，并绑定动作指纹；
- 看板、任务房间、文件中心和资源中心切换到统一快照/事件；
- 在拥有生产 Gateway 协议输出能力的前提下，接入 24.4 节 `ConversationProjectionAdapter`；
- 若 daemon 尚不可维护，只完成 mock/测试办公室联动并保留明确阻塞标记。

最小演示：一条外发动作未经审批不能执行，内容变化后旧审批失效；所有外围页面展示同一任务版本。

退出标准：审批、安全、客户端游标恢复和办公室不重复派发测试通过。

### Phase 5：记忆与质量优化

实现：

- 上线 `MemoryCandidate` 审核、作用域、墓碑删除和隐私擦除；
- 建立回放评测、质量指标和模型路由优化；
- 根据真实任务数据调整并发、重试和预算策略。

最小演示：用户反馈经确认成为 Agent 规则，后续任务命中，删除后立即不再检索。

退出标准：记忆来源、冲突、版本、删除、擦除和回退测试通过。

每个阶段都使用明确适配器保持可运行，不进行一次性大爆炸替换。Phase 1–3 可以在恢复版仓库和 mock Gateway 中完成；生产 daemon 接入遵循 2.1 节外部依赖。

## 29. 第一条黄金闭环

本设计冻结“查找并筛选潜在客户，生成触达方案，但不自动发送”为 v1 架构验证闭环：

```text
User goal
  -> GoalSpec
  -> Browser Agent collects candidates with sources
  -> Search Agent deduplicates and scores
  -> File Agent creates outreach materials
  -> Chief verifies count, evidence and wording
  -> DeliveryReport with files, cost, risks and next action
```

这条闭环覆盖目标理解、并行/串行依赖、文件交接、证据、验收和成本，同时避免第一版直接承担大规模对外发送风险。外发能力作为后续受审批节点接入。

## 30. 验收标准

架构第一版实现完成时，必须满足：

1. 主 Agent可在直接回答和正式任务之间正确分流。
2. 正式任务具有版本化 `GoalSpec`、`ExecutionPlan`、不可变 `WorkOrderDefinition` 和独立可变 `WorkOrderState`。
3. 计划可以根据能力、权限、预算和可用性动态选择 Agent。
4. DAG 调度支持依赖和受限并行，非法计划无法启动。
5. 任何工具副作用都携带有效 `CapabilityGrant`。
6. 高风险动作没有精确审批时无法执行。
7. 成本来自真实调用回执，硬预算不能被模型绕过。
8. 子 Agent结果必须经过 Schema、规则、证据和语义验收。
9. 重复事件、迟到结果和 Runtime 重启不会导致重复外发或错误终态。
10. 用户可以暂停、恢复和取消，并看到已发生与未发生的动作。
11. 对话、看板、办公室、文件中心和资源中心来自同一 Runtime 当前状态及其审计/增量事件。
12. 最终交付明确区分完成、部分完成、失败和未验证内容。
13. 记忆写入具有作用域、来源、版本、确认、回退、墓碑删除和隐私擦除能力。
14. 黄金任务闭环通过自动场景测试和人工验收。
15. 计划风险确认不能替代任何 `per_action` 审批。
16. 多工具节点为每项能力要求签发独立 Grant，且资源 selector 可以确定性证明包含关系。
17. 预算 reservation 使用可执行 ceiling；无法强制 ceiling 的工具不能自动进入硬预算任务。
18. 审批等待释放 Worker，批准后从持久化 checkpoint 续跑且不重复审批前副作用。
19. 每次重试使用新的工作单定义和 attempt，同时保持相同逻辑副作用的业务幂等键。
20. Grant/Definition 哈希不存在自引用且按固定 canonical 顺序可复算。
21. 用户撤权通过 authorization epoch/revocation 在下一次工具调用立即生效。

## 31. 架构不变量

以下规则在任何实现阶段都不得破坏：

1. 用户授权高于主 Agent决策。
2. 运行时事实高于模型语言声明。
3. 任务状态只有一个权威来源。
4. 模型不直接执行副作用。
5. 没有证据不能宣称已完成。
6. 权限、预算和审批由确定性代码执行。
7. 所有重试有上限，所有循环有终止条件。
8. 所有长期记忆可追溯、可撤销、可过期。
9. 办公室和 UI 是事实投影，不是任务引擎。
10. 失败必须可见，不能用流畅文案掩盖。

## 32. 最终结论

SaleBuddy 的主 Agent应被实现为“由事件唤醒的 AI 幕僚长 Actor”，而不是一个包办所有工作的超级 Prompt。它负责语义理解和组织决策，确定性 Control Plane 负责把决策安全、可控、可恢复地转化为工作，专业 Agent负责真实执行。

这套边界既保留了用户只面对一个 SaleBuddy 的产品体验，又把多 Agent系统最容易失控的权限、预算、循环、状态、证据和恢复问题收回到可验证的软件架构中。现有任务房间、办公室、文件中心和资源中心可以继续使用，并从模拟展示逐步切换为真实任务事实的投影。
