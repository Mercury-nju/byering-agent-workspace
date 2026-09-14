# 看板定制 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将看板升级为销售业务语境的目录、详情和同页定制流程，并持久化用户配置。

**Architecture:** 在现有 `kanban.js` 中增加纯函数配置层和 DOM 视图编辑器；项目组数据继续由 `metrics-store.js` 提供，配置覆盖看板标题、业务展示数据和视图参数（主题、排版、密度、强调色、组件集合），不写入原任务对话。目录与详情共用 `openKanbanPage` 生命周期，使用 `localStorage` 做浏览器级持久化。

**Tech Stack:** 原生 ES modules、DOM API、CSS 注入、localStorage、Node `node:test`。

---

### Task 1: Add customization data model and tests

**Files:**
- Create: `src/salebuddy/agents/kanban-store.js`
- Modify: `src/salebuddy/ui/kanban.js`
- Test: `scripts/kanban-customization.test.mjs`

- [x] Add pure helpers for default sales template, safe config normalization, view defaults/normalization, and status-based organization.
- [x] Use `salebuddy.kanban.custom.v1` with `{ version: 1, boards: { [roomId]: boardConfig } }`; isolate malformed rooms, keep an in-memory fallback when localStorage is unavailable, and use `seed-sales-ops` when gateway/rooms are absent.
- [x] Define status mapping as `todo/doing/approval/done` to the four default columns; for renamed columns use the exact keyword arrays `todo=["待","跟进","线索"]`, `doing=["进行","触达","执行"]`, `approval=["审核","审批","确认"]`, `done=["完成","转化","签约"]`, taking the first matching column in current order, preserving unmatched tasks, and moving tasks from deleted columns to the first column.
- [x] Add tests for fallback defaults, malformed storage data, task editing, column ordering, and organize behavior.
- [x] Implement the helpers with no DOM dependency.
- [x] Run the focused test again and confirm it passes.

### Task 2: Redesign board directory and detail controls

**Files:**
- Modify: `src/salebuddy/ui/kanban.js`

- [x] Add the reference-style directory hero and business preview cards based on project rooms and dashboard metrics.
- [x] Add detail toolbar actions: 修改, 整理, 全屏, 刷新, with labels and `aria-label` values.
- [x] Keep existing result metrics, records, output files, trend chart, cloud view, and task reopening behavior intact.
- [x] Wire refresh to the existing page lifecycle, disable it in edit mode, pause polling while a draft is dirty, discard drafts on cancel/back/close, and target the board root for full-screen with `sb-dash-focus` fallback.
- [x] Match the reference shell: white canvas, generous spacing, thin gray borders, rounded board cards, black primary action; use a light-gray editor canvas, `:focus-visible` states, and stable control dimensions.

### Task 3: Implement same-page visual editor

**Files:**
- Modify: `src/salebuddy/ui/kanban.js`

- [x] Add edit-mode rendering for board title, theme swatches, accent color, layout mode, information density, and component toggles.
- [x] Show a live preview using the selected project group's real metrics, records, files, trend, and task data.
- [x] Implement save/cancel flow backed by the view configuration helpers and re-render detail view without modifying task-store data.
- [x] Wire business component actions to the existing task-store/task-runner path: create a project-scoped task, open its Agent conversation, and re-render task dynamics when status changes.
- [x] Make “对话创建” select the first room after the same active-first/closed-last sort used by the directory, or `seed-sales-ops` when no room exists, then open the Agent conversation canvas; turn the user's visual brief into a real-data board view draft, allow confirm-to-save, and offer visual editing after generation without changing the source task conversation.
- [x] Keep <=640px layouts free of horizontal overflow and ensure the visual editor has keyboard-focusable controls with stable dimensions.

### Task 4: Verify end-to-end behavior

**Files:**
- Modify: `scripts/kanban-customization.test.mjs` only if gaps are found.

- [x] Run focused customization tests.
- [ ] Run the full `npm run test:all` chain; it currently stops at an existing homepage CSS assertion requiring `top:44%` while the source uses `top:38%`.
- [x] Run `node --check src/salebuddy/ui/kanban.js`.
- [x] Verify the running service on port 6680 returns HTTP 200 and the focused board/task runtime suites pass.
