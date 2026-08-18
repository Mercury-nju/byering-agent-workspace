import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  BRAND,
  displayAgentName,
  displayCreatedBy,
  migrateMainProfile,
  projectBrandName,
  projectMessage
} from "../src/salebuddy/brand.js";
import { createAgentStore } from "./agent-store.mjs";
import { createDefaultProfile } from "../src/salebuddy/agents/model.js";
import { seedDmMessages } from "../src/salebuddy/agents/dm-scenarios.js";
import { avatarUrlFor } from "../src/salebuddy/ui/agent-avatar.js";
import { listKnownAgentTypes } from "../src/salebuddy/agents/registry.js";
import { patchRecoveredBrand } from "./brand-patch.mjs";
import { createStaticServer, patchRecoveredBundle } from "./static-server.mjs";

const legacy = {
  agentType: "main",
  identity: { name: "SaleBuddy · 幕僚长", title: "AI 组织负责人" },
  role: { position: "SaleBuddy · 幕僚长", reportsTo: "main", responsibilities: [] },
  meta: { version: 3 }
};

test("brand exposes the approved Byering identity", () => {
  assert.equal(BRAND.name, "Byering");
  assert.equal(BRAND.mainAgent, "Byering · 幕僚长");
  assert.equal(BRAND.slogan, "为线索而生，为转化而造。你的增长伙伴，越用越懂业务。");
});

test("projects exact legacy aliases without touching custom names", () => {
  assert.equal(projectBrandName("SaleBuddy"), "Byering");
  assert.equal(projectBrandName("Marvis"), "Byering");
  assert.equal(projectBrandName("Marvis(马维斯)"), "Byering(幕僚长)");
  assert.equal(projectBrandName("SaleBuddy · 幕僚长"), "Byering · 幕僚长");
  assert.equal(projectBrandName("用户自定义员工"), "用户自定义员工");
});

test("projects semantic main identity and created-by values", () => {
  assert.equal(displayAgentName({ agentType: "main" }), "Byering · 幕僚长");
  assert.equal(displayAgentName({ agentType: "Browser Agent", name: "线索猎人" }), "线索猎人");
  assert.equal(displayCreatedBy("SaleBuddy", { agentType: "main" }), "Byering · 幕僚长");
  assert.equal(displayCreatedBy("SaleBuddy", { agentType: "Browser Agent" }), "Byering");
});

test("migrates only exact main defaults and preserves the technical reports-to id", () => {
  const next = migrateMainProfile(legacy);
  assert.equal(next.identity.name, "Byering · 幕僚长");
  assert.equal(next.role.position, "Byering · 幕僚长");
  assert.equal(next.role.reportsTo, "main");
  assert.equal(next.meta.brandMigration, "byering-v1");
  assert.deepEqual(migrateMainProfile(next), next);
});

test("projects legacy identity in rendered messages without mutating raw message content", () => {
  const message = { from: "user", fromName: "我", text: "SaleBuddy is in the quote" };
  assert.deepEqual(projectMessage(message), message);
  assert.equal(projectMessage({ from: "main", fromName: "SaleBuddy", text: "已完成" }).fromName, "Byering · 幕僚长");
});

test("agent store migrates the persisted main profile and IDENTITY heading once", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "byering-brand-"));
  const agentDir = path.join(root, encodeURIComponent("main"));
  const legacyProfile = { ...legacy, meta: { ...legacy.meta, version: 3 } };
  const profilePath = path.join(agentDir, "profile.json");
  mkdirSync(agentDir, { recursive: true });
  writeFileSync(profilePath, JSON.stringify(legacyProfile));
  const store = createAgentStore(root);
  const migrated = store.getProfile("main");
  assert.equal(migrated.identity.name, "Byering · 幕僚长");
  assert.equal(migrated.role.position, "Byering · 幕僚长");
  assert.equal(migrated.role.reportsTo, "main");
  assert.equal(migrated.meta.brandMigration, "byering-v1");
  assert.equal(readFileSync(path.join(agentDir, "IDENTITY.md"), "utf8").split("\n", 1)[0], "# Byering · 幕僚长");
  const second = store.getProfile("main");
  assert.deepEqual(second, migrated);
});

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const logoPaths = [
  ["source", 1254],
  ["512", 512],
  ["128", 128],
  ["64", 64]
];

function readPngSize(file) {
  const bytes = readFileSync(file);
  assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), bytes };
}

test("logo source has the approved hash and dimensions", () => {
  const file = path.join(projectRoot, "assets/byering-logo-source.png");
  assert.equal(existsSync(file), true);
  const { width, height, bytes } = readPngSize(file);
  assert.deepEqual({ width, height }, { width: 1254, height: 1254 });
  assert.equal(createHash("sha256").update(bytes).digest("hex"), "d7de6f22e9f749b3072229211d6e2f662e5848a588dd8ccf54ac4d21ded6f4bc");
});

test("derived logos decode at exact dimensions", () => {
  for (const [suffix, size] of logoPaths.slice(1)) {
    const { width, height } = readPngSize(path.join(projectRoot, `assets/byering-logo-${suffix}.png`));
    assert.deepEqual({ width, height }, { width: size, height: size });
  }
});

test("early brand guard precedes recovered bundle", () => {
  const html = readFileSync(path.join(projectRoot, "index.html"), "utf8");
  assert.match(html, /byering-early-guard/);
  assert.match(html, /data-byering-guard/);
  assert.ok(html.indexOf("byering-early-guard") < html.indexOf("main-BaWVt8Sl.js"));
  assert.ok(html.indexOf("main-BaWVt8Sl.js") < html.indexOf("src/salebuddy/index.js"));
});

test("new defaults and direct-message seeds render Byering", () => {
  const profile = createDefaultProfile("main");
  assert.equal(profile.identity.name, "Byering · 幕僚长");
  assert.equal(profile.role.position, "Byering · 幕僚长");
  const mainMessages = seedDmMessages("main");
  assert.ok(mainMessages.some((message) => message.from === "main" && message.fromName === "Byering · 幕僚长"));
});

test("office stays a single sidebar destination until project grouping is enabled", () => {
  const source = readFileSync(path.join(projectRoot, "src/salebuddy/index.js"), "utf8");
  assert.doesNotMatch(source, /mountOfficeSwitch/);
});

test("raw output, DM, room, and history data stay unchanged when projected", () => {
  const raw = {
    dm: [{ from: "main", fromName: "SaleBuddy", text: "SaleBuddy is in the quote" }],
    room: [{ from: "main", fromName: "Marvis", text: "完成" }],
    output: { createdBy: "SaleBuddy", title: "SaleBuddy weekly report" },
    history: [{ from: "user", text: "Marvis is mentioned by the customer" }]
  };
  const before = structuredClone(raw);
  const projected = {
    dm: raw.dm.map(projectMessage),
    room: raw.room.map(projectMessage),
    output: { ...raw.output, createdBy: displayCreatedBy(raw.output.createdBy, { agentType: "main" }) },
    history: raw.history.map(projectMessage)
  };
  assert.equal(projected.dm[0].fromName, "Byering · 幕僚长");
  assert.equal(projected.output.createdBy, "Byering · 幕僚长");
  assert.deepEqual(raw, before);
  assert.equal(raw.history[0].text, "Marvis is mentioned by the customer");
});

test("browser patch transforms legacy visible literals and preserves technical identifiers", () => {
  const source = [
    '"Marvis(马维斯)"',
    "马维斯 为你24小时随时在线",
    "SaleBuddy 为你24小时随时在线",
    '"Marvis办公室"',
    '"与Marvis的对话"',
    'alt:"Marvis"',
    'name:"Marvis"',
    'salebuddy://sequences/demo',
    'data-salebuddy-owner="1"'
  ].join(" ");
  const result = patchRecoveredBrand("treemap-KZPCXAKY-Dm7XgKSQ.js", Buffer.from(source)).toString("utf8");
  assert.match(result, /Byering\(幕僚长\)/);
  assert.match(result, /一句话下达，数字员工马上开工/);
  assert.match(result, /Byering办公室/);
  assert.match(result, /与Byering的对话/);
  assert.match(result, /alt:"Byering"/);
  assert.match(result, /name:"Byering"/);
  assert.match(result, /salebuddy:\/\/sequences\/demo/);
  assert.match(result, /data-salebuddy-owner/);
});

test("browser patch renames the native new-chat label to new task", () => {
  const result = patchRecoveredBundle(
    "index-CriD6gLK.js",
    Buffer.from('children:"新建对话"')
  ).toString("utf8");
  assert.equal(result, 'children:"新任务"');
});

test("served HTTP entry and logo assets expose Byering without changing files", async () => {
  const previousGatewaySetting = process.env.MARVIS_DISABLE_GATEWAY_MOCK;
  process.env.MARVIS_DISABLE_GATEWAY_MOCK = "1";
  const server = createStaticServer({ port: 0, gatewayPort: 0 });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const base = `http://127.0.0.1:${address.port}`;
  try {
    const html = await (await fetch(`${base}/index.html`)).text();
    assert.match(html, /<title>Byering<\/title>/);
    const logo = await fetch(`${base}/assets/byering-logo-64.png`);
    assert.equal(logo.status, 200);
    const bytes = new Uint8Array(await logo.arrayBuffer());
    assert.deepEqual([...bytes.slice(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    if (previousGatewaySetting == null) delete process.env.MARVIS_DISABLE_GATEWAY_MOCK;
    else process.env.MARVIS_DISABLE_GATEWAY_MOCK = previousGatewaySetting;
  }
});

test("wordmark keeps the native avatar separate from the Byering text lockup", () => {
  const source = readFileSync(path.join(projectRoot, "src/salebuddy/ui/wordmark.js"), "utf8");
  assert.ok(source.includes('[dt-eid="agent_name"] svg') && source.includes("fallback: 40, logo: null"));
  assert.match(source, /SaleBuddy 为你24小时随时在线/);
  assert.match(source, /BRAND\.slogan/);
});

test("Electron shell config names the app and points to the Byering icon", () => {
  const source = readFileSync(path.join(projectRoot, "electron/main-reconstructed.mjs"), "utf8");
  assert.match(source, /app\.setName\("Byering"\)/);
  assert.match(source, /title:\s*"Byering"/);
  assert.match(source, /byering-logo-128\.png/);
  assert.match(source, /app\.dock\?\.setIcon/);
});

test("real employee avatars map by role and every employee surface mounts them", () => {
  const expected = [
    ["main", "agent-sales.png"],
    ["Browser Agent", "agents-recruiting.png"],
    ["Search Agent", "agent-professional-services.png"],
    ["App Agent", "agent-customer-success.png"],
    ["File Agent", "agent-professional-services.png"]
  ];
  for (const [role, filename] of expected) assert.match(avatarUrlFor(role), new RegExp(`${filename}$`));
  for (const [, filename] of expected.slice(1)) {
    const { width, height } = readPngSize(path.join(projectRoot, "assets/agents", filename));
    assert.deepEqual({ width, height }, { width: 1254, height: 1254 });
  }

  const sourceFor = (name) => readFileSync(path.join(projectRoot, "src/salebuddy/ui", name), "utf8");
  const drawer = sourceFor("agent-drawer.js");
  const cloud = sourceFor("cloud-desktop.js");
  const contacts = sourceFor("contacts-page.js");
  const rooms = sourceFor("rooms-page.js");
  const square = sourceFor("agent-square.js");
  const office = sourceFor("agent-card-chat.js");
  const knowledge = sourceFor("knowledge-page.js");
  const taskRunner = sourceFor("task-runner.js");
  const kanban = sourceFor("kanban.js");
  assert.match(drawer, /mountAgentAvatar/);
  assert.doesNotMatch(drawer, /sb-team-switcher/);
  assert.match(cloud, /else openProgressFor\(hit\.type\)/);
  assert.match(cloud, /if \(hit\.kind === "monitor"\) openFor\(hit\.type\)/);
  assert.match(contacts, /mountAgentAvatar/);
  assert.match(contacts, /sb-cgroup-recruit/);
  assert.match(contacts, /onRecruit/);
  assert.match(rooms, /mountAgentAvatar/);
  assert.match(square, /mountAgentAvatar/);
  assert.match(office, /applyAvatarToImage/);
  assert.match(knowledge, /mountAgentAvatar/);
  assert.match(taskRunner, /mountAgentAvatar/);
  assert.match(kanban, /mountAgentAvatar/);
});

test("avatar images load eagerly and remove broken alt text on failure", () => {
  const source = readFileSync(path.join(projectRoot, "src/salebuddy/ui/agent-avatar.js"), "utf8");
  assert.match(source, /image\.loading = "eager"/);
  assert.match(source, /function installAvatarFallback/);
  assert.match(source, /addEventListener\("error"/);
  assert.match(source, /container\.setAttribute\("aria-label"/);
});

test("active employee roster excludes the retired development assistant", () => {
  assert.deepEqual(listKnownAgentTypes(), ["main", "Browser Agent", "Search Agent", "App Agent", "File Agent"]);
  assert.equal(avatarUrlFor("Computer Agent"), null);
  assert.equal(avatarUrlFor("开发助手"), null);
});

test("project groups use member avatar compositions instead of text initials", () => {
  const sourceFor = (name) => readFileSync(path.join(projectRoot, "src/salebuddy/ui", name), "utf8");
  const avatar = readFileSync(path.join(projectRoot, "src/salebuddy/ui/agent-avatar.js"), "utf8");
  assert.match(avatar, /mountGroupAvatar/);
  assert.match(sourceFor("contacts-page.js"), /mountGroupAvatar/);
  assert.match(sourceFor("rooms-page.js"), /mountGroupAvatar/);
  assert.match(sourceFor("kanban.js"), /mountGroupAvatar/);
  assert.doesNotMatch(sourceFor("contacts-page.js"), /sb-cavatar sb-room", avatarInitial\(room\.name\)/);
  assert.doesNotMatch(sourceFor("rooms-page.js"), /sb-room-card-avatar", avatarInitial\(room\.name\)/);
});

test("contacts groups open the shared right-side chat surface", () => {
  const source = readFileSync(path.join(projectRoot, "src/salebuddy/ui/contacts-page.js"), "utf8");
  assert.match(source, /function renderRoomChat\(container, room\)/);
  assert.match(source, /renderRoomChat\(content, room\)/);
  assert.match(source, /room\.message\.list/);
  assert.match(source, /room\.message\.send/);
  assert.doesNotMatch(source, /label: "进入群聊"/);
});
