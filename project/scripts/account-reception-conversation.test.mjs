import test from "node:test";
import assert from "node:assert/strict";
import { normalizeReception } from "../src/salebuddy/agents/account-reception.js";
import { applyReceptionStrategyUpdate } from "../backend/account-reception-conversation.js";
import { createAccountReceptionStore } from "../backend/account-reception-store.js";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("a tone request does not override the role-defined reception strategy", () => {
  const result = applyReceptionStrategyUpdate(
    normalizeReception({ goal: "appointment" }),
    "我希望你在私信承接的时候，口气可以温和一点"
  );

  assert.equal(result, null);
});

test("unrelated conversation does not mutate the reception strategy", () => {
  const result = applyReceptionStrategyUpdate(normalizeReception(), "帮我看看今天有没有新的客户回复");

  assert.equal(result, null);
});

test("a clear strategy request can update reply length, lead capture goal, and price handoff together", () => {
  const result = applyReceptionStrategyUpdate(
    normalizeReception({ goal: "appointment" }),
    "私信回复简短一点，以留联系方式为目标，价格问题先交给我"
  );

  assert.equal(result.settings.length, "short");
  assert.equal(result.settings.goal, "contact");
  assert.equal(result.settings.handoff.price, true);
  assert.deepEqual(result.changes.map((change) => change.field), ["length", "goal", "handoff.price"]);
});

test("chat stages do not overwrite the selected conversion outcome", () => {
  const result = applyReceptionStrategyUpdate(normalizeReception({ goal: "appointment" }), "先回答客户问题，再了解一下需求");

  assert.equal(result, null);
});

test("clearing reception data requires the current revision and resets durable conversations", () => {
  const directory = mkdtempSync(join(tmpdir(), "reception-clear-"));
  try {
    const store = createAccountReceptionStore({ stateFile: join(directory, "reception.json") });
    const owner = { tenantId: "tenant-a", account: { uid: "account-a" } };
    const initial = store.get(owner);
    const saved = store.save(owner, { length: "balanced" }, initial.revision);
    store.updateConversation(owner, "customer-a", { mode: "human" });
    assert.throws(() => store.clear(owner, initial.revision), (error) => error.code === "RECEPTION_VERSION_CONFLICT");
    const cleared = store.clear(owner, saved.revision);
    assert.equal(cleared.revision, saved.revision + 1);
    assert.equal(store.conversations(owner).length, 0);
    assert.equal("tone" in store.get(owner).settings, false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
