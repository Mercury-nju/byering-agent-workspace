import assert from "node:assert/strict";
import test from "node:test";

const realtimeWork = await import("../src/salebuddy/ui/realtime-work.js");

test("realtime roster keeps stable ecommerce role names for live-commerce matches", () => {
  assert.equal(typeof realtimeWork.realtimeAgentName, "function");
  assert.equal(realtimeWork.realtimeAgentName("Browser Agent", "直播观众挖掘员"), "商品线索挖掘员");
  assert.equal(realtimeWork.realtimeAgentName("Search Agent", "直播意向分析师"), "购买意向分析师");
  assert.equal(realtimeWork.realtimeAgentName("App Agent", "直播转化顾问"), "触达策略师");
});

test("realtime roster exposes only agents with a live work record", () => {
  const agents = [{ id: "Browser Agent" }, { id: "Search Agent" }, { id: "App Agent" }];
  const works = [{ agentType: "Search Agent" }];
  assert.deepEqual(realtimeWork.liveAgentsForWorks(agents, works), [{ id: "Search Agent" }]);
});

test("realtime roster ignores explicitly simulated office work", () => {
  const agents = [{ id: "Browser Agent" }, { id: "Search Agent" }];
  const works = [
    { agentType: "Browser Agent", projectId: "demo-office" },
    { agentType: "Search Agent", metadata: { simulated: true } }
  ];
  assert.deepEqual(realtimeWork.liveAgentsForWorks(agents, works), []);
});
