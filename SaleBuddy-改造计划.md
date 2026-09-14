# SaleBuddy 产品改造计划

> 基于《SaleBuddy PRD》与当前 Marvis 恢复版代码库（`project/`）。
> 制定日期：2026-08-06。状态：待评审。

---

## 0. 三条硬性约束（贯穿全程）

1. **改名**：产品对用户呈现为 **SaleBuddy**（主 Agent 也称 SaleBuddy，即 PRD 中"幕僚长"角色；PRD 里 WorkBuddy 的写法统一按 SaleBuddy 处理）。
2. **办公室红线**：AI 办公室的**逻辑、视觉、动效、代码严格不改**。具体冻结范围：
   - `assets/treemap-KZPCXAKY-Dm7XgKSQ.js` 中办公室相关部分（SceneActivity / OfficeDashboard / Agent / X3e / v3e / M3e / F3e / dCe）；
   - `workbench/assets/office.tmj` 地图、全部 `ani-team-*.pag` 角色与动作资源；
   - `treemap-KZPCXAKY-*.css` 中办公室容器与面板样式；
   - 状态机事件链（dCe → X3e → v3e → Agent 状态 → 动画）一个字符不动。
3. **增量式改造**：所有新功能在现有代码基础上以外围模块方式叠加，不重写已有可用部分。

---

## 1. 现状理解（改造起点）

### 1.1 代码库事实

- 这是从 Marvis.app 逆向恢复的工程：**没有原始 TS/JSX 源码**，渲染器是 Vite 压缩 bundle，逻辑靠 `readable/` 格式化副本和恢复文档理解。
- 可运行形态：`npm run serve`（静态服务 4173 + gateway-mock 5152），另有保守重建的 Electron 壳。
- 已有的 Store 顶层域：`conversations / sessionList / skill / autoTask / gateway / localDisk / setting / slashCommandData / tab / window / featureSwitch` 等。
- 已有 Gateway action：`message.* / schedule.* / skill.* / switch.* / weixin.*`（`ws-ag-ui` WebSocket 协议）。
- 办公室已是**事件驱动的状态机**（不是装饰动画），与 PRD 第 5 模块"AI 办公室"的定位（情感体验 + 系统可观测）完全吻合——这正是要保留它的原因。

### 1.2 PRD 与现状的差距

PRD 要的是"三层组织 + 七大模块"。现状只有：主对话（接近）、办公室（完整）、技能列表（部分接近 Skills）、定时任务（autoTask）。**缺**：团队好友栏、Agent 详情页（九段员工模型）、任务房间、文件中心、资源中心、卡点升级机制、四档反馈训练。

### 1.3 关键架构判断

由于没有原始源码，改造采用**双轨策略**：

- **轨道 A（冻结）**：办公室场景继续由现有 bundle 驱动，零改动。
- **轨道 B（新增源码）**：在 `project/src/` 下建立真正的源码工程，所有新模块用源码编写，通过 bundle 已暴露的集成点挂载：
  - `window.__STORE__` / `__STORE_STATE__`（读会话、Agent 状态）
  - `window.__ROUTE__` / `__TAB_ROUTERS__`（注册新页面路由）
  - Gateway WebSocket client（复用现有连接，扩展 action）

这样新页面与办公室共享同一份会话/Agent 状态数据，天然保持一致，且不需要碰 bundle 内部。

---

## 2. 改名 SaleBuddy（Phase 0）

**原则：只改用户可见文案与品牌，不改技术契约。**

| 改 | 不改 |
|---|---|
| 窗口标题、关于页、加载页品牌文案 | `window.marvis` bridge 名称（preload 契约） |
| 界面内所有 "Marvis" 用户可见文案 → "SaleBuddy" | IPC channel 名（`marvis:*`） |
| 主 Agent 显示名 → "SaleBuddy"（幕僚长） | Gateway 协议字段、`ws-ag-ui` 子协议 |
| `package.json` 的 productName/描述 | 内部 store 域名、事件名 |
| 应用图标/Logo（若需要替换，单独走设计资源流程，不动代码） | 文件路径、bundle 文件名 |

> 技术标识（marvis bridge、IPC 名）属于代码契约，改名会破坏 preload↔renderer 通信，一律保留；未来如需彻底更名，单独立项做全链路迁移。

---

## 3. PRD 模块 → 改造映射（核心计划）

### 模块 1：主对话工作台（改造现有，量大）

**现状**：已有会话列表 + 消息流 + AG-UI 流式事件（RUN_STARTED / TEXT_MESSAGE_* / RUN_FINISHED）。

**改造内容**（全部为外围 UI 增强 + 协议扩展）：
1. 首页定位为"向 SaleBuddy 提目标"的唯一入口，左侧会话列表保留。
2. 消息流中新增四类结构化卡片（新 React 组件，渲染在现有消息流内）：
   - **目标理解卡**：SaleBuddy 对目标的复述与确认；
   - **执行计划卡**：任务拆解步骤 + 参与 Agent 名单 + 预计顺序；
   - **进度卡**：各 Agent 实时状态（数据源 = 与办公室相同的会话/subagent 状态差分）；
   - **交付卡**：最终结果汇总 + 产出文件链接（接文件中心）。
3. **审批交互**：高风险操作（如发邮件）以"待审批卡"插入消息流，含批准/拒绝/修改按钮。
4. **卡点上报告**：Agent 升级问题时，按 PRD 六要素展示（卡点、已尝试方案、失败原因、可选方案、成本风险、推荐项）。
5. Gateway 扩展 action（mock 先行）：`plan.action.get`、`approval.action.respond`、`blocker.action.report`。

### 模块 2：团队与好友栏（新增面板）

**现状**：无。但数据源已存在——会话中的 subagent 记录带 `agentType`（main / App / Computer / Browser / File / Search Agent）。

**改造内容**：
1. 左侧新增"团队"栏（与现有会话列表同层级的 tab，复用 tab router 机制）。
2. 每个 Agent 展示：名称、头像、当前状态、所属团队、当前任务、在线状态、待审批标记。
3. **状态数据源复用办公室的差分结果**（dCe 输出），保证"好友栏里看到的状态"与"办公室里看到的动作"永远一致——这是不加新状态源、只加新视图。
4. 默认团队映射 PRD 岗位：Browser Agent→线索猎人、Search Agent→数据分析师、File Agent→内容/文档、App Agent→销售顾问、Computer Agent→开发助手。岗位名可在详情页改。

### 模块 3：Agent 详情页（新增页面，MVP 核心）

**现状**：完全缺失。技能管理（`skill.action.*`）可作为 Skills 段的底层。

**改造内容**：新路由页，九段结构：
1. **Identity**：名称/头像/职位/语言风格，落地为每 Agent 一份 `IDENTITY.md`（恢复包中 MarvisAgent seed 已有同类文件结构可参考）；
2. **Soul**：底层原则文本（只读展示 + 编辑保存为新版本）；
3. **Role**：岗位职责与汇报关系；
4. **Skills**：复用现有 skill store（安装/移除/组合）；
5. **Tools**：工具清单与开关（映射 slashCommandData 中的 MCP tools）；
6. **Scope**：数据访问范围配置；
7. **Permission**：操作权限矩阵（读/草稿/发送需审批/限额/禁止项）；
8. **Memory**：记忆查看（用户记忆/项目记忆/岗位经验/失败记录/用户反馈），支持来源追踪、版本、删除、回退；
9. **运行数据**：当前状态、任务历史、Token 消耗、训练记录、质量数据（接资源中心数据）。

存储：新增 `agent.profile.*`、`agent.memory.*`、`agent.permission.*` Gateway action + 本地持久化（JSON 文件，放每 Agent 的工作空间目录）。

### 模块 4：任务房间 / 群聊（新增）

**现状**：会话已支持主 Agent + 多 subagent 的消息结构，是最接近的地基。

**改造内容**：
1. 新数据模型 `Room`：目标、负责人、参与 Agent、截止时间、资源预算、可用工具、数据权限、交付物、验收标准、最大尝试次数。
2. 房间视图 = 群聊消息流（复用消息渲染）+ 顶部房间元信息条 + 成员侧栏。
3. 从主对话一键"拉群"：SaleBuddy 拆解计划后自动创建房间并拉入相关 Agent；房间负责人默认 SaleBuddy，可改派。
4. 房间内协作事件同时喂给办公室（沿用现有 subagent 事件链，**不改办公室**，只保证事件协议兼容）。
5. Gateway 扩展：`room.action.create/list/update/close`。

### 模块 5：AI 办公室（**不改**，只做只读联动）

- 场景代码、地图、动画、状态机：**零改动**。
- 唯一新增的是**外围联动**：点击工位上角色时，由外层容器读取点击目标 agentType，**打开 Agent 详情页路由**。若现有 bundle 不暴露点击事件，则改为在办公室面板旁加一个"查看员工"下拉入口，同样实现跳转——优先不动 bundle。
- 工位点击后的状态明细（当前任务/工具/进度/消耗/风险）展示在详情页与侧边面板，不从场景内部取数，而从共享状态层取数。

### 模块 6：文件中心（新增）

**现状**：`localDisk` store 存在；DocPreview 组件可用；工作台 bundle 有文档能力。

**改造内容**：
1. 新路由页，六类分区：用户个人 / Agent 私有 / 项目共享 / 组织公共 / 最终交付 / 临时执行。
2. 文件元数据：创建者、修改者、所属任务、时间、修改记录、来源、版本、可访问范围。
3. 物理结构：每 Agent 一个工作空间目录（PRD"云电脑"的最小实现：`agents/<id>/workspace/`），文件中心是其上的索引视图。
4. 交付卡/房间中的文件引用统一跳文件中心。

### 模块 7：资源中心（新增）

**改造内容**：
1. 新路由页：余额、本月消耗、按 Agent/按任务成本、Token/API/云电脑/存储分项。
2. 预算配置：每 Agent 的日/月/单任务预算、模型等级、最大调用次数、审批线、软/硬限制。
3. 效率面板：任务数、成功率、平均成本/时长、返工次数、产出统计。
4. MVP 阶段数据先由 gateway-mock 产出模拟账单，协议定型后接真实计量。

### 横切机制 A：卡点升级链（新增协议 + UI）

按 PRD 八级顺序（自查 → 记忆 → 换 Skill → 换工具 → 请求协助 → 负责人协调 → SaleBuddy 重规划 → 上报用户）。系统侧实现为 Agent 运行时的 escalation 状态字段 + 最大尝试/消耗/协作深度/时长四道熔断；UI 侧即模块 1 的卡点上报卡。

### 横切机制 B：四档反馈训练（新增交互）

用户对 Agent 的任何反馈，系统弹出四选一：仅本次任务 / 当前项目 / 该 Agent 长期 / 整个组织。落地为 Memory 记录的 `scope` 字段 + 写入对应层级的规则文件。UI 是消息流中的轻量确认组件。

---

## 4. 分期执行计划

### Phase 0：品牌与工程基建（1 阶段）
- SaleBuddy 改名（仅用户可见层）；
- 搭建 `src/` 源码工程与 bundle 集成层（store 桥接、路由注册、gateway client 封装）；
- 建立**办公室回归基线**：跑通 OFFICE-ARCHITECTURE.md 的 Case 1–7，录制基线，之后每次提交必须全绿。

### Phase 1：MVP（对应 PRD 一期）
按依赖顺序：
1. gateway-mock 扩展：subagent 完整时间线 + 新 action（同时让办公室多角色闭环首次在本地可演示，纯 mock 侧改动）；
2. Agent 数据模型与持久化（profile / memory / permission）；
3. 团队与好友栏；
4. Agent 详情页（先只读，后开放编辑）；
5. 主对话工作台四卡片 + 审批/卡点交互；
6. 任务房间（创建、群聊、元信息、验收）；
7. 文件中心 v1；
8. 资源中心 v1（预算设置 + 模拟账单）；
9. 四档反馈训练。

### Phase 2 / Phase 3
按 PRD 原规划：Agent 电脑桌面查看、成本分析、自动组队、招聘解雇、能力市场、知识库、绩效 → 语音/视频形象/移动端/多用户/企业接入。

---

## 5. 验收与红线保护

- **每次构建自动跑办公室 Case 1–7 回归**（事件注入 → 断言状态机与动画状态），任何一轮改动后办公室行为必须与基线逐帧一致。
- 代码评审硬规则：diff 中不得出现 `office.tmj`、`ani-team-*`、treemap bundle 办公室段、办公室 CSS 的任何变更（可用 CI 检查文件哈希）。
- 新模块全部走 `src/` 源码 + 明确接口，禁止反向 patch bundle。

## 6. 主要风险

| 风险 | 应对 |
|---|---|
| bundle 无源码，外围集成点（__STORE__/__ROUTE__）能力边界未知 | Phase 0 先做集成层 spike，验证不了就退为"独立新窗口/新 tab 页 + 共享 gateway 数据" |
| 新 action 协议与未来真实后端不一致 | mock 层做适配器，协议字段严格按 PRD 名词建模 |
| 办公室 bundle 与新增源码共享 store 时的时序竞争 | 沿用文档已记录的启动竞态修复模式（延迟重拉），并加集成测试 |
| 改名误伤技术契约 | 改名清单逐项过审，bridge/IPC/协议名列入禁止改名表 |
