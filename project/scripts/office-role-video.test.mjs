import test from "node:test";
import assert from "node:assert/strict";

import {
  OFFICE_ROLE_KEYS,
  OFFICE_ROLE_VIDEO_CATALOG,
  allOfficeRoleVideoUrls,
  createOfficeRoleBindings,
  roleVideoUrlsFor
} from "../src/salebuddy/ui/office-role-video.js";

function agents(...ids) {
  return ids.map(id => ({ id, state: "idle" }));
}

test("the first four office Agents receive distinct role packs", () => {
  const bindings = createOfficeRoleBindings({ random: () => 0 });
  const roster = agents("agent-1", "agent-2", "agent-3", "agent-4", "agent-5");

  bindings.assign(roster);

  assert.deepEqual(
    roster.slice(0, 4).map(agent => bindings.get(agent.id)),
    OFFICE_ROLE_KEYS
  );
  assert.ok(OFFICE_ROLE_KEYS.includes(bindings.get("agent-5")));
});

test("role assignment belongs to Agent identity, not roster order", () => {
  const bindings = createOfficeRoleBindings({ random: () => 0.75 });
  bindings.assign(agents("agent-1", "agent-2", "agent-3", "agent-4", "agent-5"));
  const initial = new Map(agents("agent-1", "agent-2", "agent-3", "agent-4", "agent-5").map(agent => [agent.id, bindings.get(agent.id)]));

  bindings.assign(agents("agent-5", "agent-3", "agent-1", "agent-2", "agent-4"));

  for (const [id, roleKey] of initial) assert.equal(bindings.get(id), roleKey);
});

test("working and resting states resolve to the correct role asset pools", () => {
  for (const roleKey of OFFICE_ROLE_KEYS) {
    const working = roleVideoUrlsFor(roleKey, "working", { random: () => 0 });
    const resting = roleVideoUrlsFor(roleKey, "resting", { random: () => 0 });
    assert.equal(working.length, 1);
    assert.equal(resting.length, 1);
    assert.match(working[0], /\/assets\/office-characters\/[^/]+\/working\//);
    assert.match(resting[0], /\/assets\/office-characters\/[^/]+\/(?:resting|working)\//);
  }
  assert.equal(OFFICE_ROLE_VIDEO_CATALOG["role-1"].resting.length, 0);
});

test("the preload catalog contains every unique role video", () => {
  const urls = allOfficeRoleVideoUrls();
  assert.equal(urls.length, 31);
  assert.equal(new Set(urls).size, urls.length);
  assert.ok(urls.every((url) => url.endsWith(".mp4")));
});
