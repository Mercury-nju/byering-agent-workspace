import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  chartSeriesSummary,
  memberDashboard,
  memberResultStory,
  projectResultDashboard,
  projectRecordMatches,
  projectScale,
  roomDashboardMembers
} from "../src/salebuddy/agents/metrics-store.js";
import { addFile } from "../src/salebuddy/agents/file-store.js";
import { addTask, updateTask } from "../src/salebuddy/agents/task-store.js";
import { beginWork, endAllWork, getWorkForProject } from "../src/salebuddy/agents/work-live.js";
import { projectCloudViewKey } from "../src/salebuddy/ui/kanban.js";

globalThis.localStorage = {
  getItem() { return null; },
  setItem() {}
};

test("roomDashboardMembers keeps only unique members with dashboards", () => {
  const room = {
    owner: "Search Agent",
    members: ["main", "Browser Agent", "Search Agent", "Browser Agent", "Unknown Agent"]
  };

  assert.deepEqual(roomDashboardMembers(room), ["Search Agent", "Browser Agent"]);
});

test("roomDashboardMembers returns an empty list for a room without dashboard members", () => {
  assert.deepEqual(roomDashboardMembers({ owner: "main", members: ["main"] }), []);
  assert.deepEqual(roomDashboardMembers(null), []);
});

test("projectScale is stable and keeps the primary lead project at full scale", () => {
  const room = { id: "room-content", name: "内容增长项目组" };

  assert.equal(projectScale({ id: "room-leads", name: "潜在客户拓展项目组" }), 1);
  assert.equal(projectScale(room), projectScale(room));
  assert.ok(projectScale(room) >= 0.42 && projectScale(room) <= 0.98);
});

test("projectRecordMatches isolates projects by stable room id even when names match", () => {
  const project = { id: "room-a", name: "同名项目组" };

  assert.equal(projectRecordMatches({ projectId: "room-a", projectName: "同名项目组" }, project), true);
  assert.equal(projectRecordMatches({ projectId: "room-b", projectName: "同名项目组" }, project), false);
  assert.equal(projectRecordMatches({ projectName: "同名项目组" }, project), false);
});

test("memberDashboard hides work from another project", () => {
  beginWork("Browser Agent", {
    task: "Project A task",
    phase: "Research",
    projectId: "room-a"
  });

  const otherProject = memberDashboard("Browser Agent", { projectId: "room-b", projectName: "Project B" });
  const matchingProject = memberDashboard("Browser Agent", { projectId: "room-a", projectName: "Project A" });

  assert.equal(otherProject.work, null);
  assert.equal(matchingProject.work?.task, "Project A task");
  assert.equal(getWorkForProject("Browser Agent", "room-b"), null);
  assert.equal(getWorkForProject("Browser Agent", "room-a")?.task, "Project A task");
  endAllWork();
});

test("memberResultStory turns each employee dashboard into an outcome-first summary", () => {
  const browser = memberResultStory(memberDashboard("Browser Agent"));
  const search = memberResultStory(memberDashboard("Search Agent"));

  assert.equal(browser.kicker, "LEAD DISCOVERY");
  assert.equal(browser.primary.label, "今日新增候选");
  assert.equal(browser.primary.value, 96);
  assert.equal(browser.primary.unit, "人");
  assert.equal(browser.delta, 12.9);
  assert.equal(browser.breakdown.title, "线索来源");
  assert.deepEqual(browser.breakdown.items[0], { label: "作品评论区", value: 46, unit: "人", ratio: 48 });
  assert.equal(browser.records.title, "最近新增潜客");
  assert.equal(browser.records.items[0].status, "待分析");
  assert.equal(search.kicker, "INTENT SCORING");
  assert.equal(search.primary.label, "今日高意向");
  assert.equal(search.primary.value, 13);
  assert.equal(search.records.items[0].status, "A 级");
  assert.equal(search.proof.length, 3);
});

test("memberResultStory rejects a missing or unknown dashboard", () => {
  assert.equal(memberResultStory(null), null);
  assert.equal(memberResultStory({ agentType: "Unknown Agent" }), null);
});

test("chartSeriesSummary exposes every plotted value to assistive technology", () => {
  assert.equal(
    chartSeriesSummary([
      { label: "触达", values: [18, 22, 20] },
      { label: "回复", values: [3, 4, 4] }
    ]),
    "过去 3 天。触达：18、22、20；回复：3、4、4"
  );
});

test("scaled result breakdown stays consistent with the plotted employee data", () => {
  const appDashboard = memberDashboard("App Agent", { scale: 0.68, projectId: "room-content" });
  const app = memberResultStory(appDashboard);
  const file = memberResultStory(memberDashboard("File Agent", { scale: 0.68, projectId: "room-content" }));
  const computer = memberResultStory(memberDashboard("Computer Agent", { scale: 0.68, projectId: "room-content" }));

  assert.equal(app.breakdown.items[0].value, appDashboard.series[0].values.at(-1));
  assert.equal(app.breakdown.items[1].value, app.primary.value);
  assert.equal(file.breakdown.items.reduce((sum, item) => sum + item.value, 0), file.primary.value);
  assert.deepEqual(file.breakdown.items.map((item) => item.ratio), [40, 20, 40]);
  assert.equal(file.breakdown.items.reduce((sum, item) => sum + item.ratio, 0), 100);
  assert.deepEqual(computer.breakdown.items.map((item) => item.value), [5, 3, 2]);
  assert.deepEqual(computer.breakdown.items.map((item) => item.ratio), [100, 60, 40]);
});

test("simulated records and output filenames are stable but isolated by project", () => {
  const roomA = memberDashboard("Browser Agent", { projectId: "room-a", projectName: "Project A" });
  const roomB = memberDashboard("Browser Agent", { projectId: "room-b", projectName: "Project B" });
  const storyA = memberResultStory(roomA);
  const storyB = memberResultStory(roomB);

  assert.notDeepEqual(storyA.records.items, storyB.records.items);
  assert.notDeepEqual(roomA.sampleOutputs, roomB.sampleOutputs);
  assert.deepEqual(
    memberResultStory(memberDashboard("Browser Agent", { projectId: "room-a" })).records.items,
    storyA.records.items
  );
});

test("projectResultDashboard combines employee output into one project-level board", () => {
  const room = {
    id: "room-leads",
    name: "潜在客户拓展项目组",
    goal: "找到 200 个符合条件的潜在客户",
    members: ["main", "Browser Agent", "Search Agent", "App Agent"]
  };
  const dashboard = projectResultDashboard(room);

  assert.equal(dashboard.primary.label, "有效留资");
  assert.equal(dashboard.primary.value, 6);
  assert.equal(dashboard.primary.unit, "人");
  assert.equal(dashboard.breakdown.title, "销售转化漏斗");
  assert.deepEqual(dashboard.breakdown.items.map((item) => item.label), ["有效留资", "到店/预约", "高意向客户", "有效回复", "已触达"]);
  assert.equal(dashboard.records.title, "最新有效留资");
  assert.deepEqual(dashboard.stats.map((item) => item.label), ["有效留资", "到店/预约", "有效回复"]);
  assert.equal(dashboard.members.length, 3);
  assert.equal(dashboard.cloudAgentType, "Browser Agent");
  assert.ok(dashboard.outputs.every((item) => item.owner));
});

test("untouched project dashboards do not promote operational task counts to business outcomes", () => {
  const dashboard = projectResultDashboard({
    id: "room-empty-funnel",
    name: "尚未产生留资的项目组",
    members: ["Browser Agent", "Search Agent", "App Agent"]
  });

  assert.equal(dashboard.dataState, "empty");
  assert.equal(dashboard.primary.label, "有效留资");
  assert.equal(dashboard.primary.value, 0);
  assert.equal(dashboard.primary.unit, "人");
  assert.equal(dashboard.breakdown.title, "销售转化漏斗");
  assert.deepEqual(dashboard.records.items, []);
});

test("active lead projects show simulated business outcomes before gateway results arrive", () => {
  const room = {
    id: "room-leads-active",
    name: "潜在客户拓展项目组",
    members: ["Browser Agent", "Search Agent", "App Agent"]
  };
  addTask({ title: "从抖音筛选购车意向", projectId: room.id, projectName: room.name });

  const dashboard = projectResultDashboard(room);

  assert.equal(dashboard.dataState, "live");
  assert.deepEqual(dashboard.primary, { label: "有效留资", value: 6, unit: "人" });
  assert.equal(dashboard.breakdown.title, "销售转化漏斗");
  assert.equal(dashboard.records.title, "最新有效留资");
});

test("projectResultDashboard uses content output as the primary result for a content group", () => {
  const dashboard = projectResultDashboard({
    id: "room-content",
    name: "触达内容共创项目组",
    members: ["main", "App Agent", "File Agent"]
  });

  assert.equal(dashboard.primary.label, "今日交付内容");
  assert.equal(dashboard.records.title, "最新内容交付");
  assert.equal(dashboard.members.length, 2);
  assert.deepEqual(dashboard.series.map((item) => item.label), ["内容交付"]);
  assert.equal(dashboard.chartNote, "近 14 天内容交付趋势");
});

test("sales project simulation prioritizes captured leads and exposes a descending funnel", () => {
  const dashboard = projectResultDashboard({
    id: "room-leads-funnel",
    name: "潜在客户拓展项目组",
    goal: "从抖音互动中获得有效留资并推进到店",
    members: ["Browser Agent", "Search Agent", "App Agent"]
  });

  assert.deepEqual(dashboard.primary, { label: "有效留资", value: 6, unit: "人" });
  assert.deepEqual(dashboard.breakdown.items.map((item) => item.label), [
    "有效留资",
    "到店/预约",
    "高意向客户",
    "有效回复",
    "已触达"
  ]);
  assert.deepEqual(dashboard.breakdown.items.map((item) => item.value), [6, 4, 8, 10, 40]);
  assert.equal(dashboard.records.title, "最新有效留资");
});

test("structured project results promote effective leads when the result snapshot includes them", () => {
  const room = {
    id: "room-structured-leads",
    name: "真实留资项目组",
    members: ["App Agent"]
  };
  const taskId = addTask({ title: "整理销售线索", projectId: room.id, projectName: room.name });
  updateTask(taskId, {
    status: "done",
    resultSnapshot: {
      schemaVersion: 1,
      source: "gateway",
      primaryMetricKey: "effective_replies",
      metrics: [
        { key: "effective_replies", label: "有效回复", value: 12, unit: "人" },
        { key: "effective_leads", label: "有效留资", value: 5, unit: "人" }
      ]
    }
  });

  const dashboard = projectResultDashboard(room);

  assert.deepEqual(dashboard.primary, { label: "有效留资", value: 5, unit: "人" });
});

test("projectResultDashboard keeps project trend series in one business unit", () => {
  const dashboard = projectResultDashboard({
    id: "room-leads-trend",
    name: "潜客增长项目组",
    members: ["Browser Agent", "Search Agent", "App Agent", "File Agent"]
  });

  assert.deepEqual(dashboard.series.map((item) => item.label), ["已触达", "有效回复"]);
  assert.equal(dashboard.chartNote, "近 14 天触达与留资转化趋势");
});

test("projectResultDashboard sorts all project files globally, including chief-of-staff output", () => {
  const room = {
    id: "room-project-files",
    name: "项目文件聚合组",
    members: ["Browser Agent", "File Agent"]
  };
  addFile({
    name: "browser-old.csv",
    projectId: room.id,
    projectName: room.name,
    createdBy: "Browser Agent"
  });
  addFile({
    name: "group-latest-summary.md",
    projectId: room.id,
    projectName: room.name,
    createdBy: "SaleBuddy"
  });

  const dashboard = projectResultDashboard(room);

  assert.equal(dashboard.outputs[0].name, "group-latest-summary.md");
  assert.equal(dashboard.outputs[0].owner, "SaleBuddy");
  assert.ok(dashboard.outputs.every((output) => output.real));
});

test("projectResultDashboard keeps live work and simulated results isolated by room id", () => {
  const room = {
    id: "room-leads-a",
    name: "同名潜客项目组",
    members: ["Browser Agent", "Search Agent", "App Agent"]
  };
  beginWork("App Agent", {
    task: "Follow up project B",
    phase: "Outreach",
    projectId: "room-leads-b"
  });

  const roomA = projectResultDashboard(room);
  const roomB = projectResultDashboard({ ...room, id: "room-leads-b" });

  assert.equal(roomA.work, null);
  assert.equal(roomA.cloudAgentType, "Browser Agent");
  assert.equal(roomB.work?.task, "Follow up project B");
  assert.equal(roomB.cloudAgentType, "App Agent");
  assert.notDeepEqual(roomA.records.items, roomB.records.items);
  assert.notDeepEqual(roomA.outputs, roomB.outputs);
  endAllWork();
});

test("projectResultDashboard returns null when a room has no supported digital employees", () => {
  assert.equal(projectResultDashboard({ id: "room-empty", members: ["main", "Unknown Agent"] }), null);
});

test("project result board does not invent business results for an untouched project", () => {
  const dashboard = projectResultDashboard({
    id: "room-honest-empty",
    name: "尚未执行的项目组",
    members: ["Browser Agent", "Search Agent"]
  });

  assert.equal(dashboard.dataState, "empty");
  assert.equal(dashboard.primary.value, 0);
  assert.deepEqual(dashboard.records.items, []);
  assert.deepEqual(dashboard.outputs, []);
  assert.deepEqual(dashboard.series, []);
});

test("project result board is projected from persisted task results", () => {
  const room = {
    id: "room-task-result-projection",
    name: "真实结果项目组",
    members: ["Browser Agent", "Search Agent"]
  };
  const taskId = addTask({
    title: "筛选高意向客户",
    taskText: "筛选高意向客户",
    projectId: room.id,
    projectName: room.name
  });
  updateTask(taskId, {
    status: "done",
    preview: "本轮筛出 47 位高意向客户，其中 12 位有效回复。",
    resultSnapshot: {
      schemaVersion: 1,
      source: "gateway",
      completedAt: "2026-08-13T10:00:00.000Z",
      primaryMetricKey: "effective_replies",
      metrics: [
        { key: "high_intent", label: "高意向客户", value: 47, unit: "人" },
        { key: "effective_replies", label: "有效回复", value: 12, unit: "人" }
      ],
      summary: "本轮筛出 47 位高意向客户，其中 12 位有效回复。"
    }
  });

  const dashboard = projectResultDashboard(room);

  assert.equal(dashboard.dataState, "live");
  assert.equal(dashboard.dataSource, "gateway");
  assert.deepEqual(dashboard.primary, { label: "有效回复", value: 12, unit: "人" });
  assert.deepEqual(dashboard.stats.map((item) => item.label), ["高意向客户", "有效回复"]);
  assert.equal(dashboard.records.items[0].taskId, taskId);
  assert.equal(dashboard.records.items[0].title, "筛选高意向客户");
  assert.equal(dashboard.records.items[0].status, "已完成");
  assert.equal(dashboard.records.mode, "result-summary");
  assert.equal(dashboard.records.items[0].resultTitle, "结果已提交");
});

test("project result board exposes actual task states as the only task projection", () => {
  const room = { id: "room-task-state-projection", name: "任务状态项目组", members: ["App Agent"] };
  const runningId = addTask({ title: "继续触达", projectId: room.id, projectName: room.name });
  const approvalId = addTask({ title: "确认报价", projectId: room.id, projectName: room.name });
  updateTask(approvalId, { status: "approval", preview: "等待确认报价范围" });

  const dashboard = projectResultDashboard(room);

  assert.deepEqual(dashboard.tasks.map((task) => task.id), [approvalId, runningId]);
  assert.deepEqual(dashboard.tasks.map((task) => task.status), ["approval", "progress"]);
  assert.equal(dashboard.taskSummary.approval, 1);
  assert.equal(dashboard.taskSummary.running, 1);
});

test("project result board derives observed metrics when tasks have no result snapshot", () => {
  const room = {
    id: "room-observed-task-metrics",
    name: "真实任务状态项目组",
    members: ["Browser Agent", "Search Agent"]
  };
  const runningId = addTask({ title: "补全客户联系方式", projectId: room.id, projectName: room.name });
  const approvalId = addTask({ title: "确认首触方案", projectId: room.id, projectName: room.name });
  updateTask(approvalId, { status: "approval", preview: "等待确认首触方案" });

  const dashboard = projectResultDashboard(room);

  assert.deepEqual(dashboard.primary, { label: "项目任务", value: 2, unit: "项" });
  assert.deepEqual(dashboard.stats.map((item) => item.label), ["进行中", "待确认"]);
  assert.equal(dashboard.records.mode, "status-summary");
  assert.ok(dashboard.records.items.some((item) => item.title === "进行中" && item.value === "1 项"));
  assert.ok(dashboard.records.items.some((item) => item.title === "待确认" && item.value === "1 项"));
  assert.equal(dashboard.series[0].label, "任务更新");
  assert.equal(dashboard.series[0].values.reduce((sum, value) => sum + value, 0), 2);
  assert.deepEqual(dashboard.tasks.map((task) => task.id), [approvalId, runningId]);
});

test("project result board treats a full runtime progress value as still running without a result", () => {
  const room = { id: "room-runtime-progress", name: "运行中项目组", members: ["App Agent"] };
  const taskId = addTask({ title: "等待客户回复", projectId: room.id, projectName: room.name });
  updateTask(taskId, { runtimeProgress: 100, preview: "等待客户回复" });

  const dashboard = projectResultDashboard(room);

  assert.equal(dashboard.taskSummary.running, 1);
  assert.equal(dashboard.primary.value, 1);
  assert.equal(dashboard.records.mode, "status-summary");
  assert.equal(dashboard.tasks[0].progress, 100);
});

test("projectResultDashboard refuses a room without a stable id", () => {
  beginWork("Browser Agent", { task: "Another project", phase: "Collect", projectId: "room-other" });

  assert.equal(projectResultDashboard({ name: "缺少 ID 的项目组", members: ["Browser Agent"] }), null);
  endAllWork();
});

test("projectCloudViewKey changes across idle, working, and completed snapshots", () => {
  const room = { id: "room-cloud" };
  const idle = { cloudAgentType: "Browser Agent", work: null };
  const working = { cloudAgentType: "Browser Agent", work: { state: "running", phase: "Collect", task: "Read comments" } };
  const done = { cloudAgentType: "Browser Agent", work: { state: "done", phase: "Collect", task: "Read comments" } };

  assert.notEqual(projectCloudViewKey(room, idle), projectCloudViewKey(room, working));
  assert.notEqual(projectCloudViewKey(room, working), projectCloudViewKey(room, done));
  assert.equal(projectCloudViewKey(room, idle), projectCloudViewKey(room, idle));
});

test("kanban opens a project-level result board without an employee drill-down", () => {
  const source = readFileSync(new URL("../src/salebuddy/ui/kanban.js", import.meta.url), "utf8");

  assert.match(source, /const dashboard = projectResultDashboard\(room, \{ teamLive \}\)/);
  assert.doesNotMatch(source, /function renderMember\(|function memberCard\(|\blet drilled\b/);
  assert.doesNotMatch(source, /各个数据看板/);
});

test("kanban directory uses the shared page background", () => {
  const source = readFileSync(new URL("../src/salebuddy/ui/kanban.js", import.meta.url), "utf8");

  assert.match(source, /\.sb-dash-directory\{background:#FAFAFA;/);
});
