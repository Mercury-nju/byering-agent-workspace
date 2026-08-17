/**
 * scripts/agent-store.mjs
 * Agent 员工模型的磁盘持久化（gateway-mock 使用）。
 *
 * 目录布局（PRD"云电脑"的最小实现）：
 *   agents/<agentId>/
 *     profile.json       九段员工模型
 *     IDENTITY.md        对外身份（由 profile.identity 生成）
 *     memory.json        记忆库（带来源追踪/版本/回退）
 *     workspace/
 *       inbox/           工作文件夹
 *       output/          最终产出
 *       tmp/             临时文件
 *       logs/            操作与工具调用记录
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync, renameSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import {
  createDefaultProfile,
  createMemoryEntry,
  reviseMemoryEntry,
  rollbackMemoryEntry,
  mergeProfilePatch,
  fillProfileDefaults,
  renderIdentityMarkdown
} from "../src/salebuddy/agents/model.js";
import { migrateMainProfile } from "../src/salebuddy/brand.js";
import { marketplaceProfileSeed } from "../src/salebuddy/agents/marketplace.js";
import { seedDmMessages } from "../src/salebuddy/agents/dm-scenarios.js";

/** 生成默认档案；Agent广场目录成员附带中文名/职位/职责种子。 */
function defaultProfileFor(agentType) {
  const profile = createDefaultProfile(agentType);
  const seed = marketplaceProfileSeed(agentType);
  if (!seed) return profile;
  return mergeProfilePatch(profile, seed);
}

function agentDir(root, agentType) {
  return path.join(root, encodeURIComponent(agentType));
}

function ensureLayout(root, agentType) {
  const dir = agentDir(root, agentType);
  for (const sub of ["", "workspace", "workspace/inbox", "workspace/output", "workspace/tmp", "workspace/logs"]) {
    mkdirSync(path.join(dir, sub), { recursive: true });
  }
  return dir;
}

function readJson(file, fallback) {
  try { return JSON.parse(readFileSync(file, "utf8")); } catch { return fallback; }
}

function writeJsonAtomic(file, value) {
  const tmp = `${file}.tmp-${process.pid}`;
  writeFileSync(tmp, JSON.stringify(value, null, 2) + "\n");
  renameSync(tmp, file);
}

export function createAgentStore(root) {
  return {
    root,

    getProfile(agentType) {
      const dir = ensureLayout(root, agentType);
      const file = path.join(dir, "profile.json");
      if (!existsSync(file)) {
        const profile = defaultProfileFor(agentType);
        writeJsonAtomic(file, profile);
        writeFileSync(path.join(dir, "IDENTITY.md"), renderIdentityMarkdown(profile));
        return profile;
      }
      const stored = readJson(file, defaultProfileFor(agentType));
      const profile = fillProfileDefaults(stored, marketplaceProfileSeed(agentType));
      const migrated = migrateMainProfile(profile);
      if (JSON.stringify(migrated) !== JSON.stringify(stored)) {
        writeJsonAtomic(file, migrated);
        writeFileSync(path.join(dir, "IDENTITY.md"), renderIdentityMarkdown(migrated));
      }
      return migrated;
    },

    updateProfile(agentType, patch) {
      const dir = ensureLayout(root, agentType);
      const current = this.getProfile(agentType);
      const next = mergeProfilePatch(current, patch);
      writeJsonAtomic(path.join(dir, "profile.json"), next);
      writeFileSync(path.join(dir, "IDENTITY.md"), renderIdentityMarkdown(next));
      return next;
    },

    listMemory(agentType, kind = null) {
      const dir = ensureLayout(root, agentType);
      const entries = readJson(path.join(dir, "memory.json"), []);
      return kind ? entries.filter((entry) => entry.kind === kind) : entries;
    },

    appendMemory(agentType, { kind, text, scope, source }) {
      const dir = ensureLayout(root, agentType);
      const file = path.join(dir, "memory.json");
      const entries = readJson(file, []);
      const entry = createMemoryEntry({ kind, text, scope, source });
      entries.push(entry);
      writeJsonAtomic(file, entries);
      return entry;
    },

    reviseMemory(agentType, entryId, text) {
      const dir = ensureLayout(root, agentType);
      const file = path.join(dir, "memory.json");
      const entries = readJson(file, []);
      const index = entries.findIndex((entry) => entry.id === entryId);
      if (index < 0) return null;
      entries[index] = reviseMemoryEntry(entries[index], text);
      writeJsonAtomic(file, entries);
      return entries[index];
    },

    rollbackMemory(agentType, entryId) {
      const dir = ensureLayout(root, agentType);
      const file = path.join(dir, "memory.json");
      const entries = readJson(file, []);
      const index = entries.findIndex((entry) => entry.id === entryId);
      if (index < 0) return null;
      entries[index] = rollbackMemoryEntry(entries[index]);
      writeJsonAtomic(file, entries);
      return entries[index];
    },

    deleteMemory(agentType, entryId) {
      const dir = ensureLayout(root, agentType);
      const file = path.join(dir, "memory.json");
      const entries = readJson(file, []);
      const next = entries.filter((entry) => entry.id !== entryId);
      if (next.length === entries.length) return null;
      writeJsonAtomic(file, next);
      return { id: entryId, deleted: true };
    },

    getPermission(agentType) {
      return this.getProfile(agentType).permission;
    },

    updatePermission(agentType, permission) {
      return this.updateProfile(agentType, { permission }).permission;
    },

    workspacePath(agentType) {
      return path.join(ensureLayout(root, agentType), "workspace");
    },

    /** 私聊消息（与指定 Agent 的 1:1 会话）：agents/<agentId>/dm.json */
    listDm(agentType) {
      const dir = ensureLayout(root, agentType);
      const file = path.join(dir, "dm.json");
      const seeds = seedDmMessages(agentType);
      const messages = existsSync(file) ? readJson(file, []) : [];
      if (seeds.length && !messages.some((message) => String(message.id || "").startsWith("dm-seed-"))) {
        const migrated = [...seeds, ...messages];
        writeJsonAtomic(file, migrated);
        return migrated;
      }
      return messages;
    },

    appendDm(agentType, { from, fromName, text, artifact = null }) {
      const dir = ensureLayout(root, agentType);
      const file = path.join(dir, "dm.json");
      const messages = this.listDm(agentType);
      const message = {
        id: `dm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        agentType,
        from: from || "user",
        fromName: fromName || "我",
        text: String(text || ""),
        ...(artifact ? { artifact: { ...artifact } } : {}),
        createdAt: new Date().toISOString()
      };
      messages.push(message);
      writeJsonAtomic(file, messages);
      return message;
    },

    /** 云电脑工作区文件概览（顶层 + inbox/output 两个常用目录） */
    listWorkspace(agentType) {
      const workspace = this.workspacePath(agentType);
      const sections = [];
      for (const sub of ["", "inbox", "output"]) {
        const dir = sub ? path.join(workspace, sub) : workspace;
        let files = [];
        try {
          files = readdirSync(dir, { withFileTypes: true })
            .filter((entry) => entry.isFile())
            .map((entry) => {
              const stat = statSync(path.join(dir, entry.name));
              return { name: entry.name, size: stat.size, updatedAt: stat.mtime.toISOString() };
            });
        } catch { /* 目录不可读时给空 */ }
        sections.push({ dir: sub || "根目录", files });
      }
      return { path: workspace, sections };
    }
  };
}
