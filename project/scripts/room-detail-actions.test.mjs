import assert from "node:assert/strict";
import test from "node:test";

import { ROOM_DETAIL_ACTIONS, roomDataTarget } from "../src/salebuddy/ui/contacts-page.js";

test("room detail exposes data and file actions in the project context", () => {
  assert.deepEqual(ROOM_DETAIL_ACTIONS, ["查看数据", "查看文件"]);
  assert.deepEqual(roomDataTarget({ id: "room-leads", name: "潜在客户拓展项目组" }), {
    projectId: "room-leads",
    projectName: "潜在客户拓展项目组"
  });
});

test("room data target stays explicit when a room is incomplete", () => {
  assert.deepEqual(roomDataTarget(null), { projectId: null, projectName: "" });
});
