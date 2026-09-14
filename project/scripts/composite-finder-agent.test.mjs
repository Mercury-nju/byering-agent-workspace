import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  getMarketplaceAgent,
  isImplementedMarketplaceAgent,
  isMarketplaceAgentAvailable
} from "../src/salebuddy/agents/marketplace.js";
import { realtimeWorkSurfaceFor } from "../src/salebuddy/ui/realtime-work.js";

const agentSquareSource = await readFile(new URL("../src/salebuddy/ui/agent-square.js", import.meta.url), "utf8");
const httpServerSource = await readFile(new URL("../backend/http-server.js", import.meta.url), "utf8");

test("composite finder agent is an activated discovery-only marketplace capability", () => {
  const agent = getMarketplaceAgent("mkt-find-people");
  assert.ok(agent);
  assert.equal(agent.name, "找客专员");
  assert.equal(agent.category, "找人");
  assert.equal(isImplementedMarketplaceAgent("mkt-find-people"), true);
  assert.equal(isMarketplaceAgentAvailable("mkt-find-people"), true);
  assert.equal(agent.capabilities.compositeDiscovery, true);
  assert.equal(agent.capabilities.discoveryOnly, true);
  assert.equal(agent.capabilities.privateOutreach, undefined);
  assert.match(agent.mission, /公开找客/);
  assert.match(agent.mission, /持续监听/);
  assert.match(agent.mission, /新评论、直播互动和账号通知/);
  assert.match(agent.mission, /不执行私信/);
});

test("composite finder uses the cloud realtime surface and keeps its identity", () => {
  assert.equal(realtimeWorkSurfaceFor("mkt-find-people"), "cloud");
  assert.match(agentSquareSource, /mkt-find-people/);
  assert.match(httpServerSource, /mkt-find-people/);
});
