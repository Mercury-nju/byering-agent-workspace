/**
 * Persistence boundary for the control plane.
 *
 * The production adapter will implement the same methods with a durable
 * database and an event log. The default adapter is intentionally in-memory
 * so the API can be exercised without infrastructure.
 */

import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";

export class PersistenceAdapter {
  loadTask() { throw new Error("PersistenceAdapter.loadTask is not implemented"); }
  saveTask() { throw new Error("PersistenceAdapter.saveTask is not implemented"); }
  deleteTask() { throw new Error("PersistenceAdapter.deleteTask is not implemented"); }
  appendEvent() { throw new Error("PersistenceAdapter.appendEvent is not implemented"); }
  listEvents() { throw new Error("PersistenceAdapter.listEvents is not implemented"); }
  loadCommand() { throw new Error("PersistenceAdapter.loadCommand is not implemented"); }
  saveCommand() { throw new Error("PersistenceAdapter.saveCommand is not implemented"); }
}

export class MemoryPersistenceAdapter extends PersistenceAdapter {
  constructor() {
    super();
    this.tasks = new Map();
    this.events = new Map();
    this.commands = new Map();
  }

  loadTask(taskId) {
    return clone(this.tasks.get(taskId) || null);
  }

  saveTask(task) {
    this.tasks.set(task.taskId, clone(task));
    return clone(task);
  }

  deleteTask(taskId) {
    this.tasks.delete(taskId);
    this.events.delete(taskId);
  }

  appendEvent(taskId, event) {
    const events = this.events.get(taskId) || [];
    events.push(clone(event));
    this.events.set(taskId, events);
    return clone(event);
  }

  listEvents(taskId, { afterSeq = 0, limit = 100 } = {}) {
    const events = this.events.get(taskId) || [];
    return events
      .filter((event) => event.seq > afterSeq)
      .slice(0, Math.max(1, Math.min(1000, limit)))
      .map(clone);
  }

  loadCommand(idempotencyKey) {
    return clone(this.commands.get(idempotencyKey) || null);
  }

  saveCommand(idempotencyKey, record) {
    this.commands.set(idempotencyKey, clone(record));
    return clone(record);
  }
}

export class FilePersistenceError extends Error {
  constructor(message, { code = "FILE_PERSISTENCE_ERROR", cause = null } = {}) {
    super(message);
    this.name = "FilePersistenceError";
    this.code = code;
    if (cause) this.cause = cause;
  }
}

/**
 * Durable JSON adapter for a single control-plane process.
 *
 * Mutations are written to a same-directory temporary file, flushed, and
 * renamed over the target. A malformed target is treated as a hard failure so
 * a restart cannot silently lose authoritative task history.
 */
export class FilePersistenceAdapter extends MemoryPersistenceAdapter {
  constructor({ filePath } = {}) {
    super();
    if (typeof filePath !== "string" || !filePath.trim()) {
      throw new FilePersistenceError("filePath is required", { code: "FILE_PATH_REQUIRED" });
    }
    this.filePath = filePath;
    this.directory = dirname(filePath);
    mkdirSync(this.directory, { recursive: true });
    this.loadFromDisk();
  }

  saveTask(task) {
    const result = super.saveTask(task);
    this.flush();
    return result;
  }

  deleteTask(taskId) {
    super.deleteTask(taskId);
    this.flush();
  }

  appendEvent(taskId, event) {
    const result = super.appendEvent(taskId, event);
    this.flush();
    return result;
  }

  saveCommand(idempotencyKey, record) {
    const result = super.saveCommand(idempotencyKey, record);
    this.flush();
    return result;
  }

  loadFromDisk() {
    if (!existsSync(this.filePath)) return;
    let parsed;
    try {
      parsed = JSON.parse(readFileSync(this.filePath, "utf8"));
    } catch (cause) {
      throw new FilePersistenceError("Persistence file is not valid JSON", {
        code: "PERSISTENCE_FILE_CORRUPT",
        cause
      });
    }
    if (!isSnapshot(parsed)) {
      throw new FilePersistenceError("Persistence file has an unsupported shape", {
        code: "PERSISTENCE_FILE_INVALID"
      });
    }
    this.tasks = new Map(Object.entries(parsed.tasks).map(([key, value]) => [key, clone(value)]));
    this.events = new Map(Object.entries(parsed.events).map(([key, value]) => [key, value.map(clone)]));
    this.commands = new Map(Object.entries(parsed.commands).map(([key, value]) => [key, clone(value)]));
  }

  flush() {
    const temporaryPath = `${this.filePath}.${process.pid}.${randomUUID()}.tmp`;
    const payload = `${JSON.stringify(this.snapshot())}\n`;
    let descriptor = null;
    try {
      descriptor = openSync(temporaryPath, "wx", 0o600);
      const buffer = Buffer.from(payload, "utf8");
      let offset = 0;
      while (offset < buffer.length) offset += requireWrite(descriptor, buffer, offset);
      fsyncSync(descriptor);
      closeSync(descriptor);
      descriptor = null;
      renameSync(temporaryPath, this.filePath);
      syncDirectory(this.directory);
    } catch (cause) {
      throw new FilePersistenceError("Unable to atomically persist control-plane state", {
        code: "PERSISTENCE_WRITE_FAILED",
        cause
      });
    } finally {
      if (descriptor != null) {
        try { closeSync(descriptor); } catch {}
      }
      try { if (existsSync(temporaryPath)) unlinkSync(temporaryPath); } catch {}
    }
  }

  snapshot() {
    return {
      version: 1,
      tasks: Object.fromEntries([...this.tasks.entries()].map(([key, value]) => [key, clone(value)])),
      events: Object.fromEntries([...this.events.entries()].map(([key, value]) => [key, value.map(clone)])),
      commands: Object.fromEntries([...this.commands.entries()].map(([key, value]) => [key, clone(value)]))
    };
  }
}

function requireWrite(descriptor, buffer, offset) {
  // fs.writeSync may write fewer bytes than requested on a regular file.
  const written = writeSync(descriptor, buffer, offset, buffer.length - offset);
  if (!Number.isInteger(written) || written <= 0) throw new Error("Unable to write persistence file");
  return written;
}

function syncDirectory(directory) {
  let descriptor;
  try {
    descriptor = openSync(directory, "r");
    fsyncSync(descriptor);
  } catch {
    // Directory fsync is not available on every supported filesystem. The
    // file itself is already flushed and renamed atomically at this point.
  } finally {
    if (descriptor != null) {
      try { closeSync(descriptor); } catch {}
    }
  }
}

function isSnapshot(value) {
  return Boolean(value
    && typeof value === "object"
    && value.version === 1
    && isObject(value.tasks)
    && isObject(value.events)
    && isObject(value.commands)
    && Object.values(value.events).every((events) => Array.isArray(events)));
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function clone(value) {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value));
}
