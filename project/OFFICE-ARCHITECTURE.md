# Marvis 办公室模块架构与代码说明

> 本文只描述办公室场景相关的逻辑、代码结构和状态流转。
> 代码来自安装包中的生产 renderer bundle，当前项目没有原始 TypeScript/JSX 源码，因此文中会同时标出已确认逻辑和恢复版边界。

## 1. 模块目标

办公室不是装饰性动画，而是一个由 Agent 工作事件驱动的场景状态机。它需要同时解决：

1. 把主 Agent 和 subagent 的工作状态映射到办公室角色；
2. 让角色按照办公室地图移动，而不是瞬移到目标座位；
3. 用交接动作表达任务从一个角色转移到另一个角色；
4. 在任务完成、失败、取消、断线恢复时保持状态一致。

核心原则：

```text
后端事件是事实
    -> 场景任务是业务中间层
        -> Agent 状态是可观察状态
            -> 动画是最终表现
```

计时器只能产生空闲微动作或工作中的表现变化，不能凭计时器把 Agent 判定为正在工作。

## 2. 代码和资源定位

由于原始源码丢失，办公室逻辑集中在一个生产 bundle 中：

- [treemap-KZPCXAKY-Dm7XgKSQ.js](assets/treemap-KZPCXAKY-Dm7XgKSQ.js)：办公室组件、场景管理器、Agent 对象、任务状态机、消息适配器和动画注册表；
- [treemap-KZPCXAKY-B7Dc9S11.css](assets/treemap-KZPCXAKY-B7Dc9S11.css)：办公室容器和面板样式；
- [office.tmj](workbench/assets/office.tmj)：办公室地图、碰撞/阻挡层、座位和场景对象；
- `ani-team-*.pag`：不同 Agent 角色的入场、工作和特殊动作资源；
- `workbench-biG8PRTg.js`：工作台相关渲染依赖，办公室场景由 treemap bundle 触发加载。

生产 bundle 是压缩文件，通常只有少量物理行。下面的标识符是从 bundle 中恢复出的局部名称，不代表原项目源码文件名：

| 恢复标识符 | 责任 |
| --- | --- |
| `SceneActivity` | 场景生命周期和可见性状态 |
| `OfficeDashboard` | 办公室面板、场景容器和定时任务刷新 |
| `Agent` 对象 | 角色位置、状态、任务、动画和路径 |
| `X3e` | 任务执行/队列状态机 |
| `v3e` | 分派、移动和任务交接处理器 |
| `M3e` | IDLE 空闲行为决策 |
| `F3e` | 工作状态中的压力、休息、偷看等表现切换 |
| `dCe` | 会话消息/subagent 状态到场景任务的适配器 |

## 3. 总体架构

```text
AG-UI / Gateway event
          |
          v
Conversation Store
  main status + subagent messages
          |
          v
dCe: message diff adapter
          |
          v
Scene task actions
 DISPATCH / START / SUB_START /
 COMPLETE / ERROR / CANCEL / FINISH
          |
          v
X3e: task state machine
          |
          +--> Agent.setStateCategory(category, subState)
          +--> Agent.setSubState(subState)
          +--> Agent.setPath(path)
          +--> Agent.activeConversationIds
          `--> Agent task queue
          |
          v
Scene update loop
          |
          +--> grid path movement
          +--> handover timing
          +--> visibility / entering / leaving
          +--> animation lock
          `--> sprite/PAG frame playback
```

办公室不直接解析模型输出，消费的是会话层已经整理好的消息和 Agent 状态。

## 4. 场景初始化

### 4.1 初始化顺序

```text
OfficeDashboard mount
        |
        v
SceneActivity created
        |
        +--> load office.tmj
        +--> build walkable/block grid
        +--> locate workstations and seats
        +--> register animation textures
        +--> create main + subagent objects
        `--> attach scene update loop
        |
        v
SceneActivity: LOADING -> VISIBLE
```

初始化成功的基本条件：地图加载成功、工作站和 Agent 数量能够对应、角色资源完成注册、场景进入 `VISIBLE`，并且 Gateway/Session Store 的刷新不会阻塞场景本身。

### 4.2 场景对象

```text
Scene
  +-- workstations[]
  +-- agentsByType
  +-- pathfinding grid
  +-- animation registry
  +-- task state machine
  `-- update(deltaTime)
```

工作站负责“角色应该坐在哪里”，Agent 负责“角色目前在哪里以及正在做什么”。角色可能正在去别人的工作站交接，也可能处于场外等待入场。

## 5. Agent 数据模型

每个办公室角色至少包含：

```text
Agent
  identity: id / agentType / displayName
  scene position: x / y / grid / workstation
  visibility: visible / offstage / entering / leaving
  business state: stateCategory / subState
  work state: currentTask / taskQueue / activeConversationIds
  motion state: currentPath / destination / arrival state
  animation state: current animation / animation lock / waiting promise
```

### 5.1 Agent 类型

已从 bundle 中确认的角色类型：

```text
main
App Agent
Computer Agent
Browser Agent
File Agent
Search Agent
```

角色类型用于分辨任务发送者和接收者，不应该只依赖显示名称。消息适配器会把 subagent 记录中的 `agentType` 映射到办公室角色。

### 5.2 Agent 生命周期方法

从生产 bundle 中观察到的关键方法包括：

- `setStateCategory(category, subState)`：同时写入业务状态和动画子状态，并触发状态变化回调；
- `setSubState(subState)`：只改变表现子状态；
- `enqueueTask(task)` / `dequeueTask()`：管理优先级任务队列；
- `setPath(path)` / `clearPath()`：设置或清除地图路径；
- `playSubStateAnim()` / `stopSubStateAnim()`：播放或停止指定表现动画；
- `waitForReady()`：等待不可打断的过渡动画完成；
- `reset()` / `resetForOffstage()`：普通重置和场外重置；
- `diagnosticInfo()`：输出位置、可见性、业务状态、动画和锁信息。

## 6. 两级状态模型

### 6.1 业务状态类别

```text
DISPATCHING       正在前往交接位置
GO_BACK           任务交接后返回自己的位置
TASK_EXECUTING    有活动任务，正在执行
IDLE              没有活动任务
FINISH            完成/收尾路径
STOP              停止或被中断
LEAVING           正在离开办公室
OFFSTAGE          不在场景中
```

### 6.2 动画子状态

```text
DISPATCHING, TASK_HANDOVER_SENDER, TASK_HANDOVER_RECEIVER
WORKING, HIGH_PRESSURE, BREAK, PEEKING, RETURNING
STANDBY, SLACKING, SLEEPING, PRETEND_WORKING
TASK_COMPLETE, TASK_INTERRUPTED, LEAVING, OFFSTAGE, ENTERING
RUNNING_TREADMILL, POOPING, TALKING
```

子状态表达当前动作，不一定改变业务状态：

```text
TASK_EXECUTING + WORKING       = 正常执行任务
TASK_EXECUTING + HIGH_PRESSURE = 工作中但表现为高压力
TASK_EXECUTING + BREAK         = 工作过程中的短暂休息表现
IDLE + SLEEPING                = 无任务时睡觉
DISPATCHING + TASK_HANDOVER_SENDER = 正在把任务交给别人
```

真正的“是否在工作”必须查看 `stateCategory`、`currentTask` 和 `activeConversationIds`，不能只查看当前动画。

## 7. 会话到办公室任务的适配

### 7.1 `dCe` 的作用

`dCe` 是办公室和会话 Store 之间的桥梁。它保存上一次主 Agent/subagent 状态快照，对比新的消息状态，只把变化转换成场景任务。

```text
旧 messages -> previous main status + previous subagent map
新 messages -> latest main status + latest subagent map
                         |
                         v
                   scene.execute(task)
```

它不会因为每一帧刷新就重复派发同一个任务，这是办公室状态稳定的关键。

### 7.2 状态映射

```text
主 Agent 首次 generating
    -> START(main)

历史中已经 generating 的 subagent
    -> SUB_START(agentType)

新出现的 subagent
    -> DISPATCH(main -> agentType)
    -> START(agentType)

subagent completed
    -> COMPLETE(agentType)

subagent failed
    -> ERROR(agentType)

主 Agent completed
    -> COMPLETE(main)

主 Agent cancelled / failed
    -> CANCEL(main) / ERROR(main)
```

`SUB_START` 用于历史恢复：subagent 可能已经存在于任务上下文中，场景需要直接恢复其可见性、座位和工作状态，而不能再次播放一次新的分派流程。

## 8. 任务动作和状态机

`X3e` 是任务状态机。它接收明确的任务消息，而不是直接接受动画命令。

### 8.1 动作类型

```text
DISPATCH  主 Agent 把工作交给某个角色
START     某个角色开始执行任务
SUB_START 历史恢复时让 subagent 进入执行状态
COMPLETE  任务正常完成
CANCEL    任务被取消
ERROR     任务失败
FINISH    流程收尾
```

### 8.2 `START` 和 `SUB_START`

```text
execute(START)
    |
    +--> validate sender / main ownership
    +--> create active conversation and task ticket
    +--> attach task to agent
    +--> set TASK_EXECUTING / WORKING
    `--> begin working animation

execute(SUB_START)
    |
    +--> resolve subagent by agentType
    +--> restore visibility and workstation
    +--> add active conversation
    +--> set TASK_EXECUTING / WORKING
    `--> begin working animation
```

### 8.3 `COMPLETE`、`ERROR`、`CANCEL`

```text
terminal action
    |
    +--> find target by sender / receiver / conversationId
    +--> remove active conversation
    +--> remove completed task
    +--> inspect pending queue and other active tasks
    |
    +--> has remaining work: continue WORKING or STANDBY
    `--> no remaining work: complete effect -> return / IDLE / leave
```

错误和取消路径优先级高于普通完成路径。它们必须清理活动会话，不能残留一个没有真实会话的 `TASK_EXECUTING`。

## 9. 分派和交接流程

`v3e` 负责把“任务关系”表现成“角色移动和交接动作”。

### 9.1 分派开始

```text
startDispatching(sender, receiver)
    |
    +--> sender = DISPATCHING / DISPATCHING
    +--> compute path on office grid
    `--> move sender toward receiver
```

如果 receiver 在场外，先触发入场；如果已经在办公室，则等待 sender 到达。

### 9.2 交接开始

```text
onSenderArrived()
    |
    +--> receiver = DISPATCHING / TASK_HANDOVER_RECEIVER
    +--> sender = DISPATCHING / TASK_HANDOVER_SENDER
    +--> show handover bubble
    +--> play salute / handover animation
    `--> wait handover duration
```

观察到的交接气泡包括“开干吧”“交给你了”“到你了”等。它们是表现层，不是状态判断依据。

### 9.3 交接完成

```text
onHandoverComplete()
    |
    +--> sender = GO_BACK / RETURNING
    +--> receiver = TASK_EXECUTING / WORKING
    +--> receiver owns active task
    `--> sender returns to own workstation
```

最重要的时序保证是：receiver 不能在交接动画开始时就进入真实工作状态，必须等 `onHandoverComplete`。

## 10. 路径移动和动画锁

### 10.1 地图移动

办公室使用 `office.tmj` 中的网格和阻挡信息计算路径：起点和目标转换为网格坐标、避开不可行走区域、逐帧消费路径节点，到达目标后触发交接或返回座位。

因此，角色走到别人桌边是任务交接流程的一部分，不是单独的随机漫游。

### 10.2 动画锁

交接、入场、离场、庆祝和中断动作可能不可立即打断。`animLocked` / `_lockPromise` 和 `waitForReady()` 保证：

```text
当前过渡动画未完成 -> 暂缓下一次状态切换
动画完成           -> 执行排队中的路径、状态或动画
```

这避免了角色还在挥手，下一帧就坐回工位的表现错误。

## 11. 任务队列和更新循环

`X3e.checkTaskQueues()` 消费不同优先级的任务。优先级决定同时到达时的处理顺序，不能代替任务终止事件。

```text
每帧 update(delta)
    |
    +--> update movement / arrival
    +--> update current substate animation
    +--> update leaving timer
    +--> run idle decision when eligible
    +--> run work presentation when eligible
    `--> checkTaskQueues()
```

处理原则：高优先级错误/取消先处理；交接和路径任务等待过渡完成；完成一个任务后检查其他活动会话；只有队列为空且无活动会话才进入 `IDLE`。

## 12. 空闲和工作表现逻辑

### 12.1 `M3e`：空闲行为

只有以下条件同时满足，才允许触发空闲微动作：

```text
stateCategory == IDLE
activeConversationIds is empty
currentTask is null
animation is not locked
```

可能的表现包括 `STANDBY`、`SLACKING`、`SLEEPING`、`PEEKING`、喝咖啡和短暂离开座位。

### 12.2 `F3e`：工作中的表现切换

当业务状态仍是 `TASK_EXECUTING` 时，场景可以在 `WORKING`、`HIGH_PRESSURE`、`BREAK`、`PEEKING` 之间切换。动作结束后回到 `WORKING`，不能移除活动会话，也不能触发 `COMPLETE`。

## 13. 动画资源映射

生产 bundle 中注册了多类动画资源：

```text
walking_h, walking_up, leaving, cheer_main
drink_coffee, off_chair, peek, pooping
running_treadmill, sleeping, standby
talking_on_seat, talking_on_stand, working
```

角色资源和动作资源是两层概念：`ani-team-browser-*.pag` 决定角色外观，`working`、`walking_h` 等决定动作。

```text
business state + substate + facing direction
                 |
                 v
          animation registry
                 |
                 v
          sprite/PAG frames
```

## 14. 状态一致性和可观测性

```text
TASK_EXECUTING
  => activeConversationIds.size > 0
  => currentTask != null

IDLE
  => activeConversationIds.size == 0
  => currentTask == null
  => taskQueue is empty

DISPATCHING
  => path or handover transition exists

TASK_HANDOVER_RECEIVER
  => receiver is waiting for handover completion

COMPLETE / ERROR / CANCEL
  => terminal event is idempotent
  => no orphan active conversation remains
```

每次状态变更建议记录：

```text
eventId / taskId / conversationId
agentType
previous category/substate -> next category/substate
currentTask / activeConversationIds
path / destination / animation lock status
```

这样可以从“角色为什么还在工作”反查到具体事件，而不是只能看动画截图猜原因。生产 bundle 中已有 `diagnosticInfo`、状态切换日志和动画锁信息，可作为诊断面板基础。

## 15. 历史恢复、断线和幂等

### 15.1 历史恢复

页面打开时不应把历史中的每条消息重新当成新任务。适配器需要读取最新主 Agent/subagent 状态，对仍在 generating 的 subagent 使用 `SUB_START`，对已完成的 subagent 不重复播放新的 `DISPATCH`，只把状态差异发给 `X3e`。

### 15.2 断线重连

```text
断线
  -> 保留当前可见状态和任务上下文
  -> 暂停需要新事件的转换
  -> Gateway reconnect
  -> 拉取最新 conversation/subagent snapshot
  -> dCe 做差分
  -> X3e 幂等补齐或终止任务
```

断线期间不能把所有角色自动改成完成。真实状态应以重连后的服务端快照校正。

### 15.3 幂等要求

同一个 `conversationId + agentType + action` 不应重复创建活动任务。生产实现最好使用 `eventId` 或服务端序列号去重；当前 bundle 能确认前后状态差分，但完整持久化去重表需要后续重建。

## 16. 当前恢复版边界

### 已恢复/已验证

- `office.tmj` 地图和办公室资源可以加载；
- 场景可以创建工作站和六类 Agent；
- Agent 的业务状态和动画子状态模型存在；
- 路径、交接、入场、返回、离场和动画锁逻辑存在于生产 bundle；
- `dCe`、`X3e`、`v3e` 等关键连接点已经定位；
- SceneActivity 能从加载态进入可见态；
- 当前本地页面能够展示办公室场景。

### 本地 mock 尚未完整验证

[gateway-mock.mjs](scripts/gateway-mock.mjs) 当前主要发送：

```text
RUN_STARTED
TEXT_MESSAGE_START
TEXT_MESSAGE_CONTENT
TEXT_MESSAGE_END
RUN_FINISHED
```

它还没有完整生成 subagent 状态，因此以下多角色闭环尚未在本地 mock 中完整演示：

```text
main DISPATCH
  -> receiver handover
  -> receiver WORKING
  -> receiver COMPLETE
  -> main continues or returns IDLE
```

这不是办公室状态机缺失，而是模拟后端没有提供足够的 subagent 事件。接入真实 Gateway 或补全 mock timeline 后，才能验证多角色完整运行。

## 17. 推荐测试用例

```text
Case 1: main START
  预期：main = TASK_EXECUTING/WORKING，其余角色 IDLE。

Case 2: main DISPATCH -> Browser
  预期：main 移动到 Browser，双方交接，交接完成后 Browser 才 WORKING。

Case 3: Browser COMPLETE
  预期：Browser 清理活动会话并返回/空闲，main 只有没有其他任务时才结束。

Case 4: File ERROR
  预期：File 不残留 WORKING，错误动作完成后回到可解释状态。

Case 5: 多 subagent 并行
  预期：每个 agent 的 activeConversationIds 独立，完成一个不会清空其他角色。

Case 6: 历史恢复
  预期：使用 SUB_START 恢复，不重复播放新的 DISPATCH。

Case 7: 重复/乱序事件
  预期：任务幂等，不出现重复交接、重复完成或幽灵工作状态。
```

## 18. 后续恢复建议

1. 扩展 [gateway-mock.mjs](scripts/gateway-mock.mjs)，生成 main/subagent 的完整状态时间线；
2. 给每个场景任务增加 `eventId`、`taskId`、`conversationId` 和序列号；
3. 加入状态不变量校验和错误日志；
4. 增加只读诊断面板，显示角色状态、当前任务、路径和最近事件；
5. 增加事件录制/回放，不依赖真实模型回归交接逻辑；
6. 最后接入真实 Gateway 和 Agent 服务。

## 19. 一句话总结

```text
会话事件差分器 dCe
        -> 任务状态机 X3e
            -> 分派/交接处理器 v3e
                -> Agent 状态与任务队列
                    -> 地图路径和动画资源
```

只要保持这条链路，并坚持事件驱动、状态权威、动画表现、终态幂等，办公室里不同角色的动作就能真实对应到 Agent 的实际工作状态。

