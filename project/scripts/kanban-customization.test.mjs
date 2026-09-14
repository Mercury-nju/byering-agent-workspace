import assert from "node:assert/strict";
import test from "node:test";

import {
  addBoardColumn,
  addBoardTask,
  addCanvasAnnotation,
  addCanvasRun,
  createDefaultBoardConfig,
  removeCanvasWidget,
  normalizeBoardConfig,
  organizeBoardTasks,
  readBoardConfig,
  removeBoardColumn,
  suggestBoardConfig,
  updateCanvasPlacement,
  updateBoardTask,
  writeBoardConfig
} from "../src/salebuddy/agents/kanban-store.js";

const storage = new Map();
globalThis.localStorage = {
  getItem(key) { return storage.get(key) ?? null; },
  setItem(key, value) { storage.set(key, String(value)); },
  removeItem(key) { storage.delete(key); }
};

const room = {
  id: "room-leads",
  name: "潜在客户拓展项目组",
  goal: "找到 200 个符合条件的潜在客户，并制定一套可执行的触达方案",
  deliverables: ["线索清单", "触达方案", "话术包"]
};

const dashboard = {
  primary: { label: "今日新增候选", value: 96, unit: "人" },
  records: { items: [{ title: "华东制造企业", meta: "联系方式待补全", status: "待分析" }] },
  stats: [{ label: "今日高意向", value: 13, unit: "人" }]
};

test("default board template uses sales workflow content", () => {
  const config = createDefaultBoardConfig(room, dashboard);

  assert.equal(config.title, room.name);
  assert.deepEqual(config.columns.map((column) => column.title), ["待跟进", "触达中", "待审核", "已完成"]);
  assert.ok(config.columns.flatMap((column) => column.tasks).some((task) => task.title.includes("线索")));
  assert.ok(config.columns.flatMap((column) => column.tasks).some((task) => task.title.includes("触达")));
});

test("malformed configs fall back to a safe, editable shape", () => {
  const fallback = createDefaultBoardConfig(room, dashboard);
  const normalized = normalizeBoardConfig({ title: 42, columns: [{ title: "", tasks: "bad" }] }, fallback);

  assert.equal(normalized.title, fallback.title);
  assert.ok(normalized.columns.length >= 1);
  assert.ok(Array.isArray(normalized.columns[0].tasks));
});

test("board config persists per project id", () => {
  const config = createDefaultBoardConfig(room, dashboard);
  config.title = "潜客增长总览";
  writeBoardConfig(room.id, config);

  assert.equal(readBoardConfig(room.id, createDefaultBoardConfig(room, dashboard)).title, "潜客增长总览");
});

test("column and task helpers keep edits immutable", () => {
  const original = createDefaultBoardConfig(room, dashboard);
  const withColumn = addBoardColumn(original, "已签约");
  assert.equal(original.columns.length + 1, withColumn.columns.length);

  const withTask = addBoardTask(withColumn, withColumn.columns[0].id, { title: "新增客户拜访" });
  const task = withTask.columns[0].tasks.at(-1);
  const updated = updateBoardTask(withTask, withColumn.columns[0].id, task.id, { status: "done" });
  assert.equal(updated.columns[0].tasks.at(-1).status, "done");
  assert.equal(original.columns[0].tasks.at(-1)?.title, "补全潜客线索联系方式");

  const removed = removeBoardColumn(updated, withColumn.columns.at(-1).id);
  assert.equal(removed.columns.length, original.columns.length);
});

test("organizeBoardTasks maps workflow statuses to business columns", () => {
  const config = createDefaultBoardConfig(room, dashboard);
  const source = {
    ...config,
    columns: config.columns.map((column) => ({ ...column, tasks: [] }))
  };
  source.columns[0].tasks.push({ id: "task-a", title: "客户回访", status: "done" });
  source.columns[1].tasks.push({ id: "task-b", title: "发送首触邮件", status: "approval" });

  const organized = organizeBoardTasks(source);
  assert.equal(organized.columns.find((column) => column.title === "已完成").tasks[0].id, "task-a");
  assert.equal(organized.columns.find((column) => column.title === "待审核").tasks[0].id, "task-b");
});

test("agent prompt suggests a business-specific board instead of opening a generic form", () => {
  const config = suggestBoardConfig("做一个客户跟进看板，关注首次联系、报价和成交", room, dashboard);

  assert.equal(config.title, "客户跟进看板");
  assert.deepEqual(config.columns.map((column) => column.title), ["待联系", "跟进中", "报价审核", "已成交"]);
  assert.ok(config.columns.flatMap((column) => column.tasks).some((task) => task.title.includes("报价")));
});

test("agent prompt strips common Chinese creation prefixes from board titles", () => {
  const config = suggestBoardConfig("帮我创建一个潜客转化看板", room, dashboard);
  assert.equal(config.title, "潜客转化看板");
});

test("agent prompt turns visual preferences into a view configuration", () => {
  const config = suggestBoardConfig("做一个深色科技感的客户跟进看板，重点突出指标和趋势图", room, dashboard);
  assert.equal(config.title, "客户跟进看板");
  assert.deepEqual(config.view, {
    theme: "ink",
    layout: "focus",
    density: "comfortable",
    accent: "blue",
    components: ["records", "metrics", "files", "trend", "tasks"]
  });
});

test("canvas config preserves placement, annotation, run history, and widget removal", () => {
  const config = createDefaultBoardConfig();
  assert.equal(config.canvas.placements.length, 5);
  const first = config.canvas.placements[0];
  const moved = updateCanvasPlacement(config, first.mountId, { x: 2, y: 3, w: 2 });
  assert.deepEqual(moved.canvas.placements.find((item) => item.mountId === first.mountId), { ...first, x: 2, y: 3, w: 2 });
  const annotated = addCanvasAnnotation(moved, { text: "突出高意向客户", mountId: first.mountId });
  assert.equal(annotated.canvas.annotations.length, 1);
  const run = addCanvasRun(annotated, { mountId: first.mountId, status: "running", prompt: "分析高意向客户" });
  assert.equal(run.canvas.runs[0].status, "running");
  const removed = removeCanvasWidget(run, first.mountId);
  assert.equal(removed.canvas.placements.some((item) => item.mountId === first.mountId), false);
  assert.equal(removed.canvas.annotations.length, 0);
  assert.equal(removed.canvas.runs.length, 0);
});

test("default canvas aligns primary panels and migrates the legacy split layout", () => {
  const config = createDefaultBoardConfig();
  const placement = Object.fromEntries(config.canvas.placements.map((item) => [item.widgetId, item]));
  assert.deepEqual([placement.metrics.x, placement.metrics.y, placement.metrics.w, placement.metrics.h], [0, 0, 1, 2]);
  assert.deepEqual([placement.trend.x, placement.trend.y, placement.trend.w, placement.trend.h], [0, 2, 4, 2]);
  assert.deepEqual([placement.tasks.x, placement.tasks.y, placement.tasks.w, placement.tasks.h], [0, 4, 4, 1]);

  const legacy = {
    ...config,
    canvas: {
      ...config.canvas,
      placements: [
        { mountId: "mount-metrics", widgetId: "metrics", x: 0, y: 0, w: 1, h: 1 },
        { mountId: "mount-records", widgetId: "records", x: 1, y: 0, w: 2, h: 2 },
        { mountId: "mount-trend", widgetId: "trend", x: 0, y: 1, w: 1, h: 2 },
        { mountId: "mount-files", widgetId: "files", x: 3, y: 0, w: 1, h: 2 },
        { mountId: "mount-tasks", widgetId: "tasks", x: 0, y: 3, w: 4, h: 1 }
      ]
    }
  };
  const migrated = normalizeBoardConfig(legacy);
  const migratedTrend = migrated.canvas.placements.find((item) => item.widgetId === "trend");
  assert.deepEqual([migratedTrend.x, migratedTrend.y, migratedTrend.w, migratedTrend.h], [0, 2, 4, 2]);
});

test("canvas runs persist the real task id instead of completing on their own", () => {
  const config = createDefaultBoardConfig(room, dashboard);
  const running = addCanvasRun(config, {
    mountId: "mount-metrics",
    taskId: "task-real-123",
    status: "running",
    prompt: "复盘本周结果"
  });

  assert.equal(running.canvas.runs[0].taskId, "task-real-123");
});

test("kanban view projects tasks from task-store and has no timer-based fake completion", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../src/salebuddy/ui/kanban.js", import.meta.url), "utf8");

  assert.match(source, /function tasksForRoom\(room\)/);
  assert.match(source, /taskId/);
  assert.doesNotMatch(source, /result:\s*"已生成新的业务结果"/);
});

test("active customization editor exposes both visual settings and editable board template", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../src/salebuddy/ui/kanban.js", import.meta.url), "utf8");
  const editor = source.slice(source.indexOf("function renderViewEditor"), source.indexOf("function renderRoom"));

  assert.match(editor, /业务模板/);
  assert.match(editor, /addBoardColumn\(editingConfig/);
  assert.match(editor, /updateBoardTask\(editingConfig/);
  assert.match(editor, /removeBoardColumn\(editingConfig/);
  assert.match(editor, /恢复默认模板/);
});

test("canvas widgets expose semantic visual roles for the data-workspace treatment", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../src/salebuddy/ui/kanban.js", import.meta.url), "utf8");
  assert.match(source, /sb-canvas-widget-\$\{placement\.widgetId\}/);
  for (const role of ["metrics", "records", "files", "trend", "tasks"]) {
    assert.match(source, new RegExp(`sb-canvas-widget-${role}`), `${role} role needs a visual treatment`);
  }
  assert.match(source, /linear-gradient\(135deg,#152B3D/);
  assert.match(source, /#FFF2D9/);
});

test("canvas data widgets fill their cards and expose derived KPI and trend summaries", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../src/salebuddy/ui/kanban.js", import.meta.url), "utf8");

  assert.match(source, /sb-canvas-kpi-strip/);
  assert.match(source, /sb-canvas-trend-summary/);
  assert.match(source, /trendDelta/);
  assert.match(source, /\.sb-canvas-widget\{display:flex;flex-direction:column\}/);
  assert.match(source, /\.sb-canvas-widget-list\{flex:1;min-height:0/);
});
