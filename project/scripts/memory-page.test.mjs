import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../src/salebuddy/ui/memory-page.js", import.meta.url), "utf8");

test("memory map renders concrete memory records as outward graph nodes", () => {
  assert.doesNotMatch(source, /const DEMO_MEMORY_ENTRIES/);
  assert.match(source, /sb-memory-entry-node/);
  assert.match(source, /const entryPositions =/);
  assert.match(source, /const renderEntryNodes = \(\) =>/);
  assert.match(source, /sb-memory-entry-link/);
  assert.match(source, /entryNodeById\.set\(entry\.id, node\)/);
});

test("memory map keeps the inspector as an auxiliary detail surface", () => {
  assert.match(source, /selectEntry = \(entry\) =>/);
  assert.match(source, /点击记忆节点查看详情/);
  assert.match(source, /还有 \$\{related\.length - 2\} 条记忆/);
});

test("memory map uses Agent Center marketplace Agents as its roster", () => {
  assert.match(source, /import \{ MARKETPLACE_AGENTS \} from "\.\.\/agents\/marketplace\.js"/);
  assert.match(source, /group: "Agent 中心"/);
  assert.match(source, /return MARKETPLACE_AGENTS\.filter\(\(agent\) => agent\?\.id\)\.map/);
  assert.doesNotMatch(source, /AGENT_TYPE_DEFAULTS|listKnownAgentTypes|FOUNDATION_ALIAS|Strategy Agent|Browser Agent|Search Agent/);
});

test("memory map uses a custom Agent picker instead of a native form select", () => {
  assert.match(source, /sb-memory-agent-picker-trigger/);
  assert.match(source, /sb-memory-agent-picker-menu/);
  assert.match(source, /role\", \"listbox\"/);
  assert.match(source, /agentPickerTrigger\.setAttribute\("aria-expanded"/);
  assert.match(source, /agentPickerOptions\.forEach/);
  assert.doesNotMatch(source, /sb-memory-agent-select|const agentSelect/);
});

test("memory map reuses the shared Agent avatar for its picker and inspector", () => {
  assert.match(source, /mountAgentAvatar\(container, agent\.id, \{ alt: `\$\{agent\.name\}头像`, trackPointer: false, mode: "memory-map" \}\)/);
  assert.doesNotMatch(source, /variant: "human"/);
  assert.match(source, /mountAgentAvatar\(avatar, selectedAgentId, \{ alt: `\$\{profileName\(\)\}头像`, trackPointer: false, mode: "memory-map" \}\)/);
});

test("mock account strategy memory is scoped to C-side accounts and account-aware Agents", () => {
  assert.match(source, /createRealtimeMockPreviewAccounts/);
  assert.match(source, /MOCK_ACCOUNT_POLICY_SCENARIOS/);
  assert.match(source, /个人电商好物账号/);
  assert.match(source, /supportsAccountStrategyMemory/);
  assert.match(source, /createMockAccountMemoryRecord/);
  assert.match(source, /当前账号执行策略/);
  assert.match(source, /触达策略/);
  assert.match(source, /对话策略/);
  assert.match(source, /mkt-comment-acquisition/);
  assert.match(source, /mkt-gold-customer-service/);
});
