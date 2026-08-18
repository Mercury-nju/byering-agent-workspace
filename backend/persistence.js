/**
 * Persistence boundary for the control plane.
 *
 * The production adapter will implement the same methods with a durable
 * database and an event log. The default adapter is intentionally in-memory
 * so the API can be exercised without infrastructure.
 */

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

function clone(value) {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value));
}
