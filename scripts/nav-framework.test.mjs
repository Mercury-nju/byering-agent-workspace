import assert from "node:assert/strict";
import test from "node:test";

import {
  NAV_EVENT,
  ACCOUNT_EVENT,
  NAV_LAYOUT,
  NAV_SURFACE_COLOR,
  NAV_MODES,
  navigationBlueprint,
  reduceNavigationState,
  reduceKnowledgeState,
  knowledgeExpanded,
  canForwardNative,
  mountNavFramework
} from "../src/salebuddy/ui/nav-framework.js";
import { mountOfficeSwitch } from "../src/salebuddy/ui/office-switch.js";
import { mountKanbanNav } from "../src/salebuddy/ui/kanban.js";
import { mountSidebarCustomization } from "../src/salebuddy/ui/sidebar-customization.js";
import { closeCurrentPage } from "../src/salebuddy/ui/pages.js";

test("navigation event uses the shared state contract name", () => {
  assert.equal(NAV_EVENT, "salebuddy:navigation-state");
});

test("navigation layout constants match the approved geometry", () => {
  assert.deepEqual(NAV_LAYOUT, {
    primaryRow: 40,
    iconBox: 20,
    projectRow: 32,
    childIndent: 28
  });
});

test("navigation surface uses the shared neutral tone", () => {
  assert.equal(NAV_SURFACE_COLOR, "#FAFAFA");
});

test("navigation modes include the resource center", () => {
  assert.deepEqual(NAV_MODES, [
    "newTask",
    "office",
    "kanban",
    "skills",
    "contacts",
    "agentSquare",
    "files",
    "resources",
    "kbDocs",
    "kbMemory"
  ]);
});

test("navigation blueprint matches the approved grouped order", () => {
  assert.deepEqual(navigationBlueprint().map((group) => [group.id, group.items]), [
    ["work", ["office", "contacts", "kanban"]],
    ["capabilities", ["agentSquare", "skills", "files"]],
    ["knowledge", ["kbDocs", "kbMemory"]]
  ]);
});

test("mounted capabilities omit the resource center row", () => {
  const { document, instance } = mountFixture();
  assert.equal(modeRow(document, "resources"), null);
  assert.equal(document.querySelector('[data-sb-group="capabilities"]')?.textContent.includes("资源中心"), false);
  instance.unmount();
});

test("contacts opener receives recruitment navigation into the agent square", () => {
  const document = installDom();
  buildSidebarFixture(document);
  let contactsOptions = null;
  let agentSquareOptions = null;
  const instance = mountNavFramework({
    openers: {
      contacts(options) { contactsOptions = options; },
      agentSquare(options) { agentSquareOptions = options; },
      rooms() {},
      files() {},
      resources() {},
      knowledge() {}
    }
  });
  FakeMutationObserver.flush();

  modeRow(document, "contacts").click();
  assert.equal(typeof contactsOptions?.onRecruit, "function");
  contactsOptions.onRecruit();
  assert.equal(typeof agentSquareOptions?.onClose, "function");
  assert.equal(document.querySelector('[data-sb-mode="agentSquare"]')?.classList.contains("sb-nav-on"), true);

  instance.unmount();
});

test("contacts data and file details replace stale navigation with their destination", () => {
  const document = installDom();
  buildSidebarFixture(document);
  let contactsOptions = null;
  let kanbanOptions = null;
  let filesOptions = null;
  const instance = mountNavFramework({
    openers: {
      ...noOpOpeners(),
      contacts(options) { contactsOptions = options; },
      kanban(options) { kanbanOptions = options; },
      files(options) { filesOptions = options; }
    }
  });
  FakeMutationObserver.flush();

  modeRow(document, "skills").click();
  modeRow(document, "contacts").click();
  assertSingleActive(document, "contacts");

  contactsOptions.onOpenData({ id: "room-1", name: "潜在客户拓展项目组" });
  assert.equal(kanbanOptions.initialRoom.id, "room-1");
  assertSingleActive(document, "kanban");
  kanbanOptions.onClose();
  assertSingleActive(document, null);

  modeRow(document, "contacts").click();
  contactsOptions.onOpenFiles({ id: "room-2", name: "触达内容共创项目组" });
  assert.deepEqual(filesOptions, {
    projectId: "room-2",
    projectName: "触达内容共创项目组",
    onClose: filesOptions.onClose
  });
  assertSingleActive(document, "files");
  filesOptions.onClose();
  assertSingleActive(document, null);

  instance.unmount();
});

test("memory navigation opens the main Agent memory map", () => {
  const document = installDom();
  buildSidebarFixture(document);
  let memoryOptions = null;
  const instance = mountNavFramework({
    openers: {
      ...noOpOpeners(),
      memory(options) { memoryOptions = options; }
    }
  });
  FakeMutationObserver.flush();

  modeRow(document, "kbMemory").click();
  assert.equal(typeof memoryOptions?.onClose, "function");
  assert.equal(document.querySelector('[data-sb-mode="kbMemory"]')?.classList.contains("sb-nav-on"), true);

  instance.unmount();
});

test("mounted sidebar omits the retired ear destination", () => {
  const { document, instance } = mountFixture();

  assert.equal(modeRow(document, "ear"), null);
  assert.equal(document.querySelector('[data-sb-nav-slot="ear"]'), null);
  assert.equal(document.querySelector('[data-sb-mode="newTask"]')?.textContent, "新任务");

  instance.unmount();
});

test("chat uses the same neutral navigation treatment as owned rows", () => {
  const { document, fixture, instance } = mountFixture();
  const stylesheet = document.querySelector("#salebuddy-nav-framework-style").textContent;

  assert.equal(fixture.newTask.dataset.sbNavSlot, "newTask");
  assert.match(stylesheet, /\[data-sb-nav-root="1"\] \[data-sb-nav-fixed-top="1"\]\{[^}]*width:100%!important/);
  assert.match(stylesheet, /\[data-sb-nav-root="1"\] \[data-sb-nav-slot="newTask"\]\{[^}]*background:transparent!important;[^}]*color:#34383f!important[^}]*border:0!important[^}]*border-radius:9px!important[^}]*margin:2px 0!important[^}]*box-shadow:none!important/);
  assert.match(stylesheet, /\[data-sb-nav-root="1"\] \[data-sb-nav-slot="newTask"\]\{[^}]*width:calc\(100% - 2px\)!important/);
  assert.match(stylesheet, /\[data-sb-nav-root="1"\] \[data-sb-nav-slot="newTask"\]\{[^}]*display:flex!important[^}]*align-items:center!important[^}]*justify-content:flex-start!important[^}]*gap:10px!important[^}]*padding:0 10px!important[^}]*text-align:left!important/);
  assert.match(stylesheet, /\[data-sb-nav-root="1"\] \[data-sb-nav-slot="newTask"\] > :first-child\{width:18px!important;height:18px!important;flex:0 0 18px!important;margin:0 1px!important\}/);
  assert.match(stylesheet, /\[data-sb-nav-root="1"\] \[data-sb-nav-slot="newTask"\]:hover\{[^}]*background:rgba\(23,25,29,\.045\)!important/);
  assert.match(stylesheet, /\[data-sb-nav-root="1"\] \[data-sb-nav-slot="newTask"\]\.sb-nav-on\{[^}]*background:rgba\(23,25,29,\.075\)!important/);
  assert.doesNotMatch(stylesheet, /data-sb-nav-slot="newTask"\]::before/);
  assert.doesNotMatch(stylesheet, /sb-chat-border-shimmer/);

  instance.unmount();
});

test("active navigation replaces the current destination", () => {
  assert.equal(reduceNavigationState("contacts", { mode: "kanban", active: true }), "kanban");
});

test("stale close cannot clear a newer active destination", () => {
  assert.equal(reduceNavigationState("contacts", { mode: "kanban", active: false }), "contacts");
  assert.equal(reduceNavigationState("kanban", { mode: "kanban", active: false }), null);
});

test("navigation details reject invalid modes and non-boolean active values", () => {
  assert.equal(reduceNavigationState("contacts", { mode: "unknown", active: true }), "contacts");
  assert.equal(reduceNavigationState("contacts", { mode: "kanban", active: "yes" }), "contacts");
  assert.equal(reduceNavigationState("contacts", null), "contacts");
});

test("knowledge is collapsed by default and follows the user preference", () => {
  assert.equal(knowledgeExpanded(), false);

  const expanded = reduceKnowledgeState(undefined, { type: "toggle" });
  assert.equal(knowledgeExpanded(expanded), true);

  const collapsed = reduceKnowledgeState(expanded, { type: "toggle" });
  assert.equal(knowledgeExpanded(collapsed), false);
});

test("knowledge stays expanded and ignores toggles while a child route is active", () => {
  const active = reduceKnowledgeState(
    { userExpanded: false, activeMode: null },
    { type: "activate", mode: "kbDocs" }
  );

  assert.equal(knowledgeExpanded(active), true);
  assert.deepEqual(reduceKnowledgeState(active, { type: "toggle" }), active);
});

test("knowledge restores the prior user preference after leaving a child route", () => {
  let collapsed = { userExpanded: false, activeMode: null };
  collapsed = reduceKnowledgeState(collapsed, { type: "activate", mode: "kbMemory" });
  collapsed = reduceKnowledgeState(collapsed, { type: "activate", mode: "contacts" });
  assert.equal(knowledgeExpanded(collapsed), false);

  let expanded = reduceKnowledgeState(undefined, { type: "toggle" });
  expanded = reduceKnowledgeState(expanded, { type: "activate", mode: "kbDocs" });
  expanded = reduceKnowledgeState(expanded, { type: "activate", mode: "contacts" });
  assert.equal(knowledgeExpanded(expanded), true);
});

test("native forwarding requires a connected node", () => {
  assert.equal(canForwardNative("office", null), false);
  assert.equal(canForwardNative("office", { isConnected: false, dataset: {} }), false);
  assert.equal(canForwardNative("office", { isConnected: true, dataset: {} }), true);
});

test("kanban forwarding waits for the native takeover marker", () => {
  assert.equal(canForwardNative("kanban", { isConnected: true, dataset: {} }), false);
  assert.equal(canForwardNative("kanban", { isConnected: true, dataset: { sbKanban: "0" } }), false);
  assert.equal(canForwardNative("kanban", { isConnected: true, dataset: { sbKanban: "1" } }), true);
});

class FakeEvent {
  constructor(type, options = {}) {
    this.type = type;
    this.bubbles = options.bubbles !== false;
    this.cancelable = options.cancelable !== false;
    this.defaultPrevented = false;
    this.target = null;
    this.currentTarget = null;
    this._stopped = false;
    this._immediateStopped = false;
  }

  preventDefault() {
    if (this.cancelable) this.defaultPrevented = true;
  }

  stopPropagation() {
    this._stopped = true;
  }

  stopImmediatePropagation() {
    this._immediateStopped = true;
    this._stopped = true;
  }
}

class FakeCustomEvent extends FakeEvent {
  constructor(type, options = {}) {
    super(type, options);
    this.detail = options.detail;
  }
}

class FakeEventTarget {
  constructor() {
    this._listeners = new Map();
  }

  addEventListener(type, listener, options = false) {
    const listeners = this._listeners.get(type) || [];
    if (!listeners.some((entry) => entry.listener === listener && entry.capture === Boolean(options?.capture ?? options))) {
      listeners.push({ listener, capture: Boolean(options?.capture ?? options) });
      this._listeners.set(type, listeners);
    }
  }

  removeEventListener(type, listener, options = false) {
    const capture = Boolean(options?.capture ?? options);
    const listeners = this._listeners.get(type) || [];
    this._listeners.set(type, listeners.filter((entry) => entry.listener !== listener || entry.capture !== capture));
  }

  listenerCount(type = null) {
    if (type) return (this._listeners.get(type) || []).length;
    return [...this._listeners.values()].reduce((sum, listeners) => sum + listeners.length, 0);
  }

  _invoke(event, capture) {
    for (const entry of [...(this._listeners.get(event.type) || [])]) {
      if (entry.capture !== capture) continue;
      event.currentTarget = this;
      entry.listener.call(this, event);
      if (event._immediateStopped) break;
    }
  }
}

function dataAttribute(name) {
  return `data-${name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`;
}

function selectorParts(selector) {
  const parts = [];
  let current = "";
  let depth = 0;
  for (const character of selector.trim()) {
    if (character === "[") depth += 1;
    if (character === "]") depth -= 1;
    if (/\s/.test(character) && depth === 0) {
      if (current) parts.push(current);
      current = "";
    } else {
      current += character;
    }
  }
  if (current) parts.push(current);
  return parts;
}

function matchesCompound(node, selector) {
  if (!(node instanceof FakeElement)) return false;
  let remainder = selector;
  const tag = remainder.match(/^[a-zA-Z][\w-]*/)?.[0];
  if (tag) {
    if (node.tagName.toLowerCase() !== tag.toLowerCase()) return false;
    remainder = remainder.slice(tag.length);
  }
  for (const match of remainder.matchAll(/#([\w-]+)/g)) {
    if (node.id !== match[1]) return false;
  }
  for (const match of remainder.matchAll(/\.([\w-]+)/g)) {
    if (!node.classList.contains(match[1])) return false;
  }
  for (const match of remainder.matchAll(/\[([^\]=*\s]+)(?:\s*(\*=|=)\s*["']?([^\]"']*)["']?)?\]/g)) {
    const [, name, operator, expected] = match;
    const actual = node.getAttribute(name);
    if (!operator && actual == null) return false;
    if (operator === "=" && actual !== expected) return false;
    if (operator === "*=" && !String(actual || "").includes(expected)) return false;
  }
  return true;
}

function matchesSelector(node, selector) {
  const alternatives = selector.split(",").map((part) => part.trim()).filter(Boolean);
  return alternatives.some((alternative) => {
    const parts = selectorParts(alternative);
    let cursor = node;
    if (!matchesCompound(cursor, parts.at(-1))) return false;
    for (let index = parts.length - 2; index >= 0; index -= 1) {
      cursor = cursor.parentElement;
      while (cursor && !matchesCompound(cursor, parts[index])) cursor = cursor.parentElement;
      if (!cursor) return false;
    }
    return true;
  });
}

class FakeElement extends FakeEventTarget {
  constructor(tagName, ownerDocument) {
    super();
    this.nodeType = 1;
    this.tagName = tagName.toUpperCase();
    this.ownerDocument = ownerDocument;
    this.parentNode = null;
    this.childNodes = [];
    this.attributes = new Map();
    this.style = {};
    this._text = "";
    this._innerHTML = "";
    this.dataset = new Proxy({}, {
      get: (_, property) => this.getAttribute(dataAttribute(property)) ?? undefined,
      set: (_, property, value) => {
        this.setAttribute(dataAttribute(property), String(value));
        return true;
      },
      deleteProperty: (_, property) => {
        this.removeAttribute(dataAttribute(property));
        return true;
      }
    });
    this.classList = {
      add: (...classes) => this.className = [...new Set([...this.className.split(/\s+/).filter(Boolean), ...classes])].join(" "),
      remove: (...classes) => this.className = this.className.split(/\s+/).filter((name) => name && !classes.includes(name)).join(" "),
      contains: (name) => this.className.split(/\s+/).includes(name),
      toggle: (name, force) => {
        const enabled = force == null ? !this.classList.contains(name) : Boolean(force);
        if (enabled) this.classList.add(name);
        else this.classList.remove(name);
        return enabled;
      },
      [Symbol.iterator]: () => this.className.split(/\s+/).filter(Boolean)[Symbol.iterator]()
    };
  }

  get parentElement() {
    return this.parentNode instanceof FakeElement ? this.parentNode : null;
  }

  get children() {
    return this.childNodes.filter((node) => node instanceof FakeElement);
  }

  get firstChild() {
    return this.childNodes[0] || null;
  }

  get nextSibling() {
    if (!this.parentNode) return null;
    const index = this.parentNode.childNodes.indexOf(this);
    return this.parentNode.childNodes[index + 1] || null;
  }

  get previousElementSibling() {
    if (!this.parentNode) return null;
    const siblings = this.parentNode.children;
    const index = siblings.indexOf(this);
    return index > 0 ? siblings[index - 1] : null;
  }

  get isConnected() {
    let cursor = this;
    while (cursor) {
      if (cursor === this.ownerDocument) return true;
      cursor = cursor.parentNode;
    }
    return false;
  }

  get id() {
    return this.getAttribute("id") || "";
  }

  set id(value) {
    this.setAttribute("id", value);
  }

  get className() {
    return this.getAttribute("class") || "";
  }

  set className(value) {
    this.setAttribute("class", value || "");
  }

  get hidden() {
    return this.hasAttribute("hidden");
  }

  set hidden(value) {
    if (value) this.setAttribute("hidden", "");
    else this.removeAttribute("hidden");
  }

  get textContent() {
    if (this.childNodes.length) return this.childNodes.map((node) => node.textContent || "").join("");
    return this._text;
  }

  set textContent(value) {
    for (const child of this.childNodes) child.parentNode = null;
    this.childNodes = [];
    this._text = String(value ?? "");
    FakeMutationObserver.record(this, "childList");
  }

  get innerHTML() {
    return this._innerHTML;
  }

  set innerHTML(value) {
    this._innerHTML = String(value);
  }

  hasAttribute(name) {
    return this.attributes.has(name);
  }

  getAttribute(name) {
    return this.attributes.has(name) ? this.attributes.get(name) : null;
  }

  setAttribute(name, value) {
    const next = String(value);
    if (this.attributes.get(name) === next) return;
    this.attributes.set(name, next);
    FakeMutationObserver.record(this, "attributes", name);
  }

  removeAttribute(name) {
    if (!this.attributes.has(name)) return;
    this.attributes.delete(name);
    FakeMutationObserver.record(this, "attributes", name);
  }

  appendChild(node) {
    return this.insertBefore(node, null);
  }

  append(...nodes) {
    for (const node of nodes) this.appendChild(node);
  }

  insertBefore(node, reference) {
    if (node.parentNode) node.parentNode.removeChild(node);
    const index = reference == null ? this.childNodes.length : this.childNodes.indexOf(reference);
    if (index < 0) throw new Error("Reference node is not a child");
    this.childNodes.splice(index, 0, node);
    node.parentNode = this;
    FakeMutationObserver.record(this, "childList");
    return node;
  }

  removeChild(node) {
    const index = this.childNodes.indexOf(node);
    if (index < 0) throw new Error("Node is not a child");
    this.childNodes.splice(index, 1);
    node.parentNode = null;
    FakeMutationObserver.record(this, "childList");
    return node;
  }

  remove() {
    this.parentNode?.removeChild(this);
  }

  replaceWith(node) {
    if (!this.parentNode) return;
    const parent = this.parentNode;
    parent.insertBefore(node, this);
    parent.removeChild(this);
  }

  insertAdjacentElement(position, node) {
    if (position === "beforebegin") this.parentNode.insertBefore(node, this);
    else if (position === "afterend") this.parentNode.insertBefore(node, this.nextSibling);
    else if (position === "afterbegin") this.insertBefore(node, this.firstChild);
    else this.appendChild(node);
    return node;
  }

  contains(node) {
    let cursor = node;
    while (cursor) {
      if (cursor === this) return true;
      cursor = cursor.parentNode;
    }
    return false;
  }

  getBoundingClientRect() {
    return { top: 0, left: 0, right: 240, bottom: 0, width: 240, height: 0 };
  }

  matches(selector) {
    return matchesSelector(this, selector);
  }

  closest(selector) {
    let cursor = this;
    while (cursor instanceof FakeElement) {
      if (cursor.matches(selector)) return cursor;
      cursor = cursor.parentElement;
    }
    return null;
  }

  querySelectorAll(selector) {
    const matches = [];
    const visit = (node) => {
      for (const child of node.children) {
        if (child.matches(selector)) matches.push(child);
        visit(child);
      }
    };
    visit(this);
    return matches;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  dispatchEvent(event) {
    if (!event.target) event.target = this;
    const path = [];
    let cursor = this;
    while (cursor) {
      path.push(cursor);
      cursor = cursor.parentNode;
    }
    if (this.ownerDocument?.defaultView && !path.includes(this.ownerDocument.defaultView)) path.push(this.ownerDocument.defaultView);
    for (const target of [...path].reverse()) {
      target._invoke?.(event, true);
      if (event._stopped) return !event.defaultPrevented;
    }
    for (const target of path) {
      target._invoke?.(event, false);
      if (event._stopped || !event.bubbles) break;
    }
    return !event.defaultPrevented;
  }

  click() {
    this.dispatchEvent(new FakeEvent("click", { bubbles: true, cancelable: true }));
  }
}

class FakeDocument extends FakeEventTarget {
  constructor() {
    super();
    this.parentNode = null;
    this.documentElement = new FakeElement("html", this);
    this.head = new FakeElement("head", this);
    this.body = new FakeElement("body", this);
    this.documentElement.parentNode = this;
    this.documentElement.append(this.head, this.body);
    this.defaultView = new FakeEventTarget();
    this.defaultView.parentNode = null;
    this.defaultView.document = this;
    this.defaultView.Event = FakeEvent;
    this.defaultView.CustomEvent = FakeCustomEvent;
    this.defaultView._intervals = new Map();
    this.defaultView._nextIntervalId = 1;
    this.defaultView.setInterval = (callback) => {
      const id = this.defaultView._nextIntervalId++;
      this.defaultView._intervals.set(id, callback);
      return id;
    };
    this.defaultView.clearInterval = (id) => this.defaultView._intervals.delete(id);
    this.defaultView.runIntervals = async () => {
      for (const callback of [...this.defaultView._intervals.values()]) await callback();
    };
  }

  createElement(tagName) {
    return new FakeElement(tagName, this);
  }

  createTreeWalker(root) {
    const textNodes = [];
    const visit = (element) => {
      if (element._text) {
        textNodes.push({
          nodeType: 3,
          parentNode: element,
          get nodeValue() { return element._text; },
          set nodeValue(value) {
            element._text = String(value);
            FakeMutationObserver.record(element, "characterData");
          },
          get textContent() { return element._text; },
          set textContent(value) {
            element._text = String(value);
            FakeMutationObserver.record(element, "characterData");
          }
        });
      }
      for (const child of element.children || []) visit(child);
    };
    visit(root);
    let index = 0;
    return { nextNode: () => textNodes[index++] || null };
  }

  querySelectorAll(selector) {
    const matches = [];
    if (this.documentElement.matches(selector)) matches.push(this.documentElement);
    return matches.concat(this.documentElement.querySelectorAll(selector));
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  contains(node) {
    return this.documentElement.contains(node);
  }

  dispatchEvent(event) {
    if (!event.target) event.target = this;
    this._invoke(event, true);
    if (!event._stopped) this._invoke(event, false);
    if (!event._stopped && event.bubbles) this.defaultView._invoke(event, false);
    return !event.defaultPrevented;
  }
}

class FakeMutationObserver {
  static instances = new Set();
  static pending = new Set();

  constructor(callback) {
    this.callback = callback;
    this.observations = [];
    this.records = [];
    this.connected = true;
    FakeMutationObserver.instances.add(this);
  }

  observe(target, options) {
    this.connected = true;
    this.observations.push({ target, options });
  }

  disconnect() {
    this.connected = false;
    this.observations = [];
    this.records = [];
    FakeMutationObserver.pending.delete(this);
  }

  static record(target, type, attributeName = null) {
    for (const observer of FakeMutationObserver.instances) {
      if (!observer.connected) continue;
      const observed = observer.observations.some(({ target: root, options }) => {
        const inScope = root === target || (options.subtree && root.contains?.(target));
        if (!inScope) return false;
        if (type === "childList") return options.childList;
        if (type === "characterData") return options.characterData;
        if (type !== "attributes" || !options.attributes) return false;
        return !options.attributeFilter || options.attributeFilter.includes(attributeName);
      });
      if (observed) {
        observer.records.push({ target, type, attributeName });
        FakeMutationObserver.pending.add(observer);
      }
    }
  }

  static flush() {
    let passes = 0;
    while (FakeMutationObserver.pending.size) {
      if (passes++ > 50) throw new Error("MutationObserver did not stabilize");
      const pending = [...FakeMutationObserver.pending];
      FakeMutationObserver.pending.clear();
      for (const observer of pending) {
        if (observer.connected) {
          const records = observer.records.splice(0);
          observer.callback(records, observer);
        }
      }
    }
  }

  static activeCount() {
    return [...FakeMutationObserver.instances].filter((observer) => observer.connected && observer.observations.length).length;
  }

  static reset() {
    FakeMutationObserver.instances.clear();
    FakeMutationObserver.pending.clear();
  }
}

function node(document, tag, { className = "", text = "", attrs = {} } = {}) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text) element.textContent = text;
  for (const [name, value] of Object.entries(attrs)) element.setAttribute(name, value);
  return element;
}

function nativeRow(document, label, className = "_menuItem_xyz_") {
  const row = node(document, "div", { className, attrs: { "dt-eid": "sidebar_tab" } });
  row.appendChild(node(document, "span", { className: "_label_xyz_", text: label }));
  return row;
}

function buildSidebarContentFixture(document, { history = true, kanbanReady = false } = {}) {
  const scroll = node(document, "div", { className: "_scrollArea_xyz_" });
  const pluginSection = node(document, "section", { className: "_pluginSection_xyz_" });
  const pluginList = node(document, "div", { className: "_pluginList_xyz_" });
  const kanban = nativeRow(document, "自动任务");
  if (kanbanReady) kanban.dataset.sbKanban = "1";
  const skills = nativeRow(document, "技能广场");
  pluginList.append(kanban, skills);
  pluginSection.appendChild(pluginList);

  const localDataSection = node(document, "section", { className: "_localDataSection_xyz_" });
  localDataSection.append(
    node(document, "div", { className: "_sectionLabel_xyz_", text: "本地知识库" }),
    nativeRow(document, "应用")
  );

  const conversationSection = node(document, "section", { className: "_conversationSection_xyz_" });
  const conversationLabel = node(document, "div", { className: "_sectionLabel_xyz_", text: "对话" });
  const officeSection = node(document, "div", { className: "_officeSection_xyz_" });
  const office = nativeRow(document, "办公室");
  officeSection.appendChild(office);
  const historyList = node(document, "div", { className: "_listArea_xyz_" });
  if (history) historyList.appendChild(nativeRow(document, "昨天的销售复盘", "_historyItem_xyz_"));
  conversationSection.append(conversationLabel, officeSection, historyList);

  scroll.append(pluginSection, localDataSection, conversationSection);
  return {
    scroll,
    pluginSection,
    kanban,
    skills,
    localDataSection,
    conversationSection,
    office,
    historyList
  };
}

function buildSidebarFixture(document, { search = true, history = true, kanbanReady = false } = {}) {
  const host = node(document, "div", { className: "app-shell" });
  const sidebar = node(document, "aside", { className: "_sidebar_xyz_" });
  const fixedTop = node(document, "div", { className: "_fixedTop_xyz_" });
  const newTask = nativeRow(document, "新任务", "_newChatRow_xyz_");
  newTask.setAttribute("dt-eid", "sidebar_new_chat_btn");
  fixedTop.appendChild(newTask);
  let searchRow = null;
  if (search) {
    searchRow = nativeRow(document, "搜索", "_searchRow_xyz_");
    fixedTop.appendChild(searchRow);
  }
  const content = buildSidebarContentFixture(document, { history, kanbanReady });

  const { scroll } = content;
  sidebar.append(fixedTop, scroll);
  host.appendChild(sidebar);
  document.body.appendChild(host);
  return {
    host,
    sidebar,
    fixedTop,
    newTask,
    search: searchRow,
    ...content
  };
}

function installDom() {
  FakeMutationObserver.reset();
  const document = new FakeDocument();
  globalThis.document = document;
  globalThis.window = document.defaultView;
  globalThis.Event = FakeEvent;
  globalThis.CustomEvent = FakeCustomEvent;
  globalThis.MutationObserver = FakeMutationObserver;
  globalThis.NodeFilter = { SHOW_TEXT: 4 };
  globalThis.Node = { TEXT_NODE: 3 };
  return document;
}

async function settleDom() {
  await Promise.resolve();
  await Promise.resolve();
  FakeMutationObserver.flush();
}

function noOpOpeners() {
  return {
    contacts() {},
    agentSquare() {},
    files() {},
    resources() {},
    memory() {},
    knowledge() {},
    rooms() {}
  };
}

function mountFixture(options = {}) {
  const document = installDom();
  const fixture = buildSidebarFixture(document, options);
  const instance = mountNavFramework({ openers: noOpOpeners() });
  FakeMutationObserver.flush();
  return { document, fixture, instance };
}

function modeRow(document, mode) {
  return document.querySelector(`[data-sb-mode="${mode}"]`);
}

function activeSnapshot(document) {
  return {
    classes: document.querySelectorAll(".sb-nav-on"),
    aria: document.querySelectorAll('[aria-current="page"]')
  };
}

function assertSingleActive(document, expectedMode) {
  const { classes, aria } = activeSnapshot(document);
  assert.ok(classes.length <= 1, `expected at most one .sb-nav-on, got ${classes.length}`);
  assert.ok(aria.length <= 1, `expected at most one aria-current=page, got ${aria.length}`);
  if (expectedMode == null) {
    assert.equal(classes.length, 0);
    assert.equal(aria.length, 0);
    return;
  }
  assert.equal(classes.length, 1);
  assert.equal(aria.length, 1);
  assert.equal(classes[0].dataset.sbMode, expectedMode);
  assert.equal(aria[0], classes[0]);
}

test("mount is a document singleton with one owner, fixed style, groups, observer, and listener set", () => {
  const { document, instance } = mountFixture();
  const second = mountNavFramework({ openers: noOpOpeners() });
  FakeMutationObserver.flush();

  assert.equal(second, instance);
  assert.equal(document.querySelectorAll("[data-sb-nav-owner]").length, 1);
  assert.equal(document.querySelectorAll("#salebuddy-nav-framework-style").length, 1);
  assert.deepEqual(
    document.querySelectorAll("[data-sb-group]").map((group) => group.dataset.sbGroup),
    ["work", "capabilities", "account"]
  );
  assert.equal(FakeMutationObserver.activeCount(), 1);
  assert.equal(document.listenerCount(NAV_EVENT), 1);
  assert.equal(document.listenerCount("click"), 1);
  assert.equal(window.listenerCount("popstate"), 1);

  instance.unmount();
});

test("mounting a new document fully disposes listeners from the previous document", () => {
  const documentA = installDom();
  buildSidebarFixture(documentA);
  const windowA = documentA.defaultView;
  mountNavFramework({ openers: noOpOpeners() });
  FakeMutationObserver.flush();
  assert.equal(documentA.listenerCount(NAV_EVENT), 1);
  assert.equal(documentA.listenerCount("click"), 1);
  assert.equal(windowA.listenerCount("popstate"), 1);

  const documentB = installDom();
  buildSidebarFixture(documentB);
  const instanceB = mountNavFramework({ openers: noOpOpeners() });
  FakeMutationObserver.flush();
  assert.equal(documentA.listenerCount(NAV_EVENT), 0);
  assert.equal(documentA.listenerCount("click"), 0);
  assert.equal(windowA.listenerCount("popstate"), 0);
  assert.equal(documentA.querySelectorAll("[data-sb-nav-owner]").length, 0);
  assert.equal(documentB.querySelectorAll("[data-sb-nav-owner]").length, 1);

  instanceB.unmount();
});

for (const search of [false, true]) {
  for (const history of [false, true]) {
    test(`native nodes stay put and inline ownership slots remain approved (search=${search}, history=${history})`, () => {
      const document = installDom();
      const fixture = buildSidebarFixture(document, { search, history });
      const originalParents = {
        search: fixture.search?.parentElement,
        office: fixture.office.parentElement,
        history: fixture.historyList.parentElement
      };
      const instance = mountNavFramework({ openers: noOpOpeners() });
      FakeMutationObserver.flush();

      assert.equal(fixture.search?.parentElement, originalParents.search);
      assert.equal(fixture.office.parentElement, originalParents.office);
      assert.equal(fixture.historyList.parentElement, originalParents.history);
      const owner = document.querySelector("[data-sb-nav-owner]");
      assert.ok(owner.parentElement === fixture.scroll, "owner must be a direct sibling of native sections");
      assert.ok(fixture.pluginSection.parentElement === fixture.scroll, "plugin section must remain directly under the content root");
      assert.ok(fixture.localDataSection.parentElement === fixture.scroll, "local data section must remain directly under the content root");
      assert.ok(fixture.conversationSection.parentElement === fixture.scroll, "conversation section must remain directly under the content root");
      assert.equal(fixture.sidebar.dataset.sbNavRoot, "1");
      assert.equal(fixture.fixedTop.dataset.sbNavFixedTop, "1");
      assert.equal(fixture.scroll.dataset.sbNavContentRoot, "1");
      assert.equal(fixture.scroll.style.display, "flex");
      assert.equal(fixture.scroll.style.flexDirection, "column");
      assert.equal(owner.style.display, "contents");
      assert.equal(fixture.conversationSection.style.display, "contents");
      assert.equal(document.querySelector('[data-sb-group="work"]').style.display, "contents");

      const visualNodes = [
        fixture.newTask,
        ...(search ? [fixture.search] : []),
        document.querySelector('[data-sb-nav-slot="work-label"]'),
        fixture.office.parentElement,
        modeRow(document, "contacts"),
        modeRow(document, "kanban"),
        ...(history ? [document.querySelector('[data-sb-nav-slot="history-label"]'), fixture.historyList] : []),
        fixture.pluginSection,
        document.querySelector('[data-sb-group="capabilities"]'),
        fixture.localDataSection,
        document.querySelector('[data-sb-group="account"]')
      ];
      const ownedOrders = visualNodes.map((item) => Number(item.style.order));
      assert.deepEqual(ownedOrders, [
        1,
        ...(search ? [2] : []),
        10,
        11,
        12,
        13,
        ...(history ? [14, 15] : []),
        19,
        20,
        25,
        30
      ]);

      instance.unmount();
    });
  }
}

test("recent-task label follows real history entries as they appear and clear", () => {
  const document = installDom();
  const fixture = buildSidebarFixture(document, { history: false });
  const instance = mountNavFramework({ openers: noOpOpeners() });
  const recentLabel = document.querySelector('[data-sb-nav-slot="history-label"]');

  assert.equal(recentLabel.hidden, true);
  assert.equal(recentLabel.style.display, "none");

  fixture.historyList.appendChild(nativeRow(document, "A real task", "_historyItem_xyz_"));
  FakeMutationObserver.flush();
  assert.equal(recentLabel.hidden, false);
  assert.equal(recentLabel.style.display ?? "", "");

  fixture.historyList.textContent = "";
  FakeMutationObserver.flush();
  assert.equal(recentLabel.hidden, true);
  assert.equal(recentLabel.style.display, "none");

  instance.unmount();
});

test("owned knowledge hides and restores native local data across root replacement", () => {
  const document = installDom();
  const first = buildSidebarFixture(document);
  first.localDataSection.style.display = "grid";
  first.localDataSection.setAttribute("aria-hidden", "false");
  const firstOriginal = nativePresentation(first.localDataSection);
  const instance = mountNavFramework({ openers: noOpOpeners() });

  assert.equal(document.querySelectorAll("[data-sb-nav-owner]").length, 1);
  assert.deepEqual(nativePresentation(first.localDataSection), {
    hidden: true,
    display: "none",
    ariaHidden: "true"
  });

  first.sidebar.remove();
  const replacement = buildSidebarFixture(document);
  replacement.localDataSection.hidden = true;
  replacement.localDataSection.style.display = "inline-flex";
  replacement.localDataSection.setAttribute("aria-hidden", "false");
  const replacementOriginal = nativePresentation(replacement.localDataSection);
  FakeMutationObserver.flush();

  assert.deepEqual(nativePresentation(first.localDataSection), firstOriginal);
  assert.equal(document.querySelectorAll("[data-sb-nav-owner]").length, 1);
  assert.deepEqual(nativePresentation(replacement.localDataSection), {
    hidden: true,
    display: "none",
    ariaHidden: "true"
  });

  instance.unmount();
  assert.deepEqual(nativePresentation(replacement.localDataSection), replacementOriginal);
});

test("office row owns primary geometry without sizing its slot container", () => {
  const { document, fixture, instance } = mountFixture();
  const stylesheet = document.querySelector("#salebuddy-nav-framework-style").textContent;
  const officeRule = `[data-sb-nav-root="1"] [data-sb-mode="office"]{height:${NAV_LAYOUT.primaryRow}px!important;min-height:${NAV_LAYOUT.primaryRow}px!important;box-sizing:border-box!important}`;
  const slotRule = stylesheet.match(/\[data-sb-nav-root="1"\] \[data-sb-nav-slot="office"\]\{([^}]*)\}/);

  assert.equal(fixture.office.dataset.sbMode, "office");
  assert.equal(fixture.office.parentElement.dataset.sbNavSlot, "office");
  assert.equal(stylesheet.includes(officeRule), true);
  assert.equal(slotRule?.[1], "order:11");

  instance.unmount();
});

test("office remains wired for recovery but stays hidden from the active sidebar", () => {
  const { fixture, instance } = mountFixture();

  assert.equal(fixture.office.dataset.sbMode, "office");
  assert.equal(fixture.office.style.display, "none");
  assert.equal(fixture.office.getAttribute("aria-hidden"), "true");

  instance.unmount();
  assert.equal(fixture.office.style.display ?? "", "");
  assert.equal(fixture.office.getAttribute("aria-hidden"), null);
});

test("members row appears above the kanban row in the work group", () => {
  const { document, instance } = mountFixture();
  const members = modeRow(document, "contacts");
  const kanban = modeRow(document, "kanban");

  assert.equal(members.style.order, "12");
  assert.equal(kanban.style.order, "13");
  assert.ok(Number(members.style.order) < Number(kanban.style.order));

  instance.unmount();
});

test("navigation scopes ownership to the real sidebar when an unrelated scroll area appears first", () => {
  const document = installDom();
  const decoySidebar = node(document, "aside", { className: "_sidebar_decoy_" });
  const decoyFixedTop = node(document, "div", { className: "_fixedTop_decoy_" });
  const decoyScroll = node(document, "div", { className: "_scrollArea_decoy_" });
  decoySidebar.append(decoyFixedTop, decoyScroll);
  document.body.appendChild(decoySidebar);
  const fixture = buildSidebarFixture(document);

  const instance = mountNavFramework({ openers: noOpOpeners() });
  FakeMutationObserver.flush();
  const owner = document.querySelector("[data-sb-nav-owner]");
  assert.ok(owner?.parentElement === fixture.scroll, "owner must mount under the resolved real sidebar");
  assert.equal(fixture.sidebar.dataset.sbNavRoot, "1");
  assert.equal(fixture.fixedTop.dataset.sbNavFixedTop, "1");
  assert.equal(fixture.scroll.dataset.sbNavContentRoot, "1");
  assert.equal(fixture.pluginSection.dataset.sbNavPluginSection, "1");
  assert.equal(fixture.localDataSection.dataset.sbNavLocalSection, "1");
  assert.equal(fixture.conversationSection.dataset.sbNavConversationSection, "1");
  assert.equal(decoySidebar.getAttribute("data-sb-nav-root"), null);
  assert.equal(decoyFixedTop.getAttribute("data-sb-nav-fixed-top"), null);
  assert.equal(decoyScroll.getAttribute("data-sb-nav-content-root"), null);
  assert.deepEqual(decoyScroll.style, {});
  const stylesheet = document.querySelector("#salebuddy-nav-framework-style").textContent;
  assert.match(stylesheet, /\[data-sb-nav-root="1"\] \[data-sb-nav-fixed-top="1"\]/);
  assert.doesNotMatch(stylesheet, /(?:^|\n)\[class\*="_(?:fixedTop|conversationSection|pluginSection|localDataSection)_"\]/);

  instance.unmount();
});

test("native proxies disable, recover, and forward each click exactly once", () => {
  const { document, fixture, instance } = mountFixture({ kanbanReady: false });
  let kanbanClicks = 0;
  let skillsClicks = 0;
  fixture.kanban.addEventListener("click", () => { kanbanClicks += 1; });
  fixture.skills.addEventListener("click", () => { skillsClicks += 1; });
  const kanbanProxy = modeRow(document, "kanban");
  const skillsProxy = modeRow(document, "skills");

  assert.equal(kanbanProxy.getAttribute("aria-disabled"), "true");
  kanbanProxy.click();
  assert.equal(kanbanClicks, 0);
  assert.equal(skillsProxy.getAttribute("aria-disabled"), "false");
  skillsProxy.click();
  assert.equal(skillsClicks, 1);

  fixture.kanban.dataset.sbKanban = "1";
  FakeMutationObserver.flush();
  assert.equal(kanbanProxy.getAttribute("aria-disabled"), "false");
  kanbanProxy.click();
  assert.equal(kanbanClicks, 1);

  fixture.kanban.remove();
  fixture.skills.remove();
  FakeMutationObserver.flush();
  assert.equal(fixture.kanban.style.display ?? "", "");
  assert.equal(fixture.kanban.getAttribute("aria-hidden"), null);
  assert.equal(fixture.skills.style.display ?? "", "");
  assert.equal(fixture.skills.getAttribute("aria-hidden"), null);
  assert.equal(kanbanProxy.getAttribute("aria-disabled"), "true");
  assert.equal(skillsProxy.getAttribute("aria-disabled"), "true");
  kanbanProxy.click();
  skillsProxy.click();
  assert.equal(kanbanClicks, 1);
  assert.equal(skillsClicks, 1);

  const replacementKanban = nativeRow(document, "看板");
  fixture.pluginSection.querySelector("._pluginList_xyz_").appendChild(replacementKanban);
  FakeMutationObserver.flush();
  assert.equal(kanbanProxy.getAttribute("aria-disabled"), "true");
  replacementKanban.dataset.sbKanban = "1";
  FakeMutationObserver.flush();
  let replacementClicks = 0;
  replacementKanban.addEventListener("click", () => { replacementClicks += 1; });
  kanbanProxy.click();
  assert.equal(replacementClicks, 1);

  const replacementSkills = nativeRow(document, "技能广场");
  fixture.pluginSection.querySelector("._pluginList_xyz_").appendChild(replacementSkills);
  FakeMutationObserver.flush();
  assert.equal(skillsProxy.getAttribute("aria-disabled"), "false");
  let replacementSkillClicks = 0;
  replacementSkills.addEventListener("click", () => { replacementSkillClicks += 1; });
  skillsProxy.click();
  assert.equal(replacementSkillClicks, 1);

  instance.unmount();
});

test("native capture click and React active mutation emit one active transition", () => {
  const { document, fixture, instance } = mountFixture();
  const details = [];
  document.addEventListener(NAV_EVENT, (event) => details.push(event.detail));

  fixture.newTask.click();
  fixture.newTask.classList.add("_active_xyz_");
  FakeMutationObserver.flush();

  assert.deepEqual(details.filter((detail) => detail.mode === "newTask" && detail.active), [
    { mode: "newTask", active: true }
  ]);
  instance.unmount();
});

test("unmount restores the claimed aria-current snapshot after sequential native activation", () => {
  const document = installDom();
  const fixture = buildSidebarFixture(document);
  fixture.office.setAttribute("aria-current", "step");
  const originals = new Map([
    [fixture.newTask, fixture.newTask.getAttribute("aria-current")],
    [fixture.office, fixture.office.getAttribute("aria-current")],
    [fixture.skills, fixture.skills.getAttribute("aria-current")]
  ]);
  const instance = mountNavFramework({ openers: noOpOpeners() });
  FakeMutationObserver.flush();

  fixture.newTask.setAttribute("aria-current", "page");
  FakeMutationObserver.flush();
  fixture.newTask.removeAttribute("aria-current");
  fixture.office.setAttribute("aria-current", "page");
  FakeMutationObserver.flush();
  fixture.office.removeAttribute("aria-current");
  fixture.skills.setAttribute("aria-current", "page");
  FakeMutationObserver.flush();

  instance.unmount();
  for (const [row, original] of originals) assert.equal(row.getAttribute("aria-current"), original);
  assert.equal(document.querySelectorAll('[aria-current="page"]').length, 0);
});

test("native programmatic state and all navigation-away paths keep active state exclusive", () => {
  const { document, fixture, instance } = mountFixture({ kanbanReady: true, history: true });

  fixture.newTask.classList.add("_active_xyz_");
  FakeMutationObserver.flush();
  assertSingleActive(document, "newTask");

  fixture.newTask.classList.remove("_active_xyz_");
  fixture.office.setAttribute("aria-current", "page");
  FakeMutationObserver.flush();
  assertSingleActive(document, "office");

  fixture.office.removeAttribute("aria-current");
  fixture.skills.classList.add("_active_xyz_");
  FakeMutationObserver.flush();
  assertSingleActive(document, "skills");

  fixture.search.click();
  assertSingleActive(document, null);
  fixture.skills.classList.remove("_active_xyz_");

  for (const mode of ["kanban", "contacts", "agentSquare", "skills", "files"]) {
    modeRow(document, mode).click();
    assertSingleActive(document, mode);
  }

  fixture.historyList.querySelector("._historyItem_xyz_").click();
  assertSingleActive(document, null);
  modeRow(document, "contacts").click();
  window._invoke(new FakeEvent("popstate"), false);
  assertSingleActive(document, null);

  instance.unmount();
});

test("interactive and inactive class tokens never count as native active state", () => {
  const { document, fixture, instance } = mountFixture();
  fixture.newTask.classList.add("_interactive_xyz_", "_inactive_xyz_");
  FakeMutationObserver.flush();
  assertSingleActive(document, null);

  fixture.newTask.setAttribute("aria-current", "page");
  FakeMutationObserver.flush();
  assertSingleActive(document, "newTask");
  instance.unmount();
});

test("unrelated mutations cannot revive a native mode after custom or native-away navigation", () => {
  const { document, fixture, instance } = mountFixture({ history: true });
  fixture.newTask.classList.add("_active_xyz_");
  FakeMutationObserver.flush();
  assertSingleActive(document, "newTask");

  modeRow(document, "contacts").click();
  assertSingleActive(document, "contacts");
  fixture.host.appendChild(node(document, "div", { className: "unrelated-mutation" }));
  FakeMutationObserver.flush();
  assertSingleActive(document, "contacts");

  fixture.search.click();
  assertSingleActive(document, null);
  fixture.host.appendChild(node(document, "div", { className: "another-unrelated-mutation" }));
  FakeMutationObserver.flush();
  assertSingleActive(document, null);

  modeRow(document, "files").click();
  fixture.historyList.querySelector("._historyItem_xyz_").click();
  assertSingleActive(document, null);
  fixture.host.appendChild(node(document, "div", { className: "history-unrelated-mutation" }));
  FakeMutationObserver.flush();
  assertSingleActive(document, null);

  instance.unmount();
});

test("account DOM supports login and logout actions", () => {
  const { document, instance } = mountFixture();
  let accountAction = null;
  document.addEventListener(ACCOUNT_EVENT, (event) => { accountAction = event.detail; });
  const toggle = document.querySelector("[data-sb-account-toggle]");
  const menu = document.querySelector("[data-sb-account-menu]");
  assert.equal(document.querySelector("[data-sb-group=knowledge]"), null);
  assert.equal(toggle.querySelector(".sb-nav-account-name").textContent, "HongYang Li");
  assert.equal(toggle.querySelector(".sb-nav-account-email").textContent, "lihongyangnju@gmail.com");
  assert.equal(menu.hidden, true);

  toggle.click();
  assert.equal(menu.hidden, false);
  assert.equal(menu.querySelector('[data-sb-account-action="logout"]').textContent, "退出登录");
  menu.querySelector('[data-sb-account-action="logout"]').click();
  assert.equal(toggle.querySelector(".sb-nav-account-name").textContent, "登录账户");
  assert.equal(menu.hidden, true);
  assert.deepEqual(accountAction, { action: "logout", signedIn: false });

  toggle.click();
  menu.querySelector('[data-sb-account-action="login"]').click();
  assert.equal(toggle.querySelector(".sb-nav-account-name").textContent, "HongYang Li");

  instance.unmount();
});

test("same sidebar recovers when only its content root is replaced", () => {
  const document = installDom();
  const fixture = buildSidebarFixture(document, { kanbanReady: true });
  fixture.localDataSection.style.display = "grid";
  fixture.localDataSection.setAttribute("aria-hidden", "false");
  const oldLocalOriginal = nativePresentation(fixture.localDataSection);
  const instance = mountNavFramework({ openers: noOpOpeners() });
  FakeMutationObserver.flush();

  const replacement = buildSidebarContentFixture(document, { kanbanReady: true, history: false });
  const replacementLocalOriginal = nativePresentation(replacement.localDataSection);
  let skillClicks = 0;
  replacement.skills.addEventListener("click", () => { skillClicks += 1; });
  fixture.scroll.remove();
  fixture.sidebar.appendChild(replacement.scroll);
  FakeMutationObserver.flush();

  assert.deepEqual(nativePresentation(fixture.localDataSection), oldLocalOriginal);
  assert.equal(fixture.scroll.getAttribute("data-sb-nav-content-root"), null);
  assert.equal(fixture.localDataSection.getAttribute("data-sb-nav-local-section"), null);
  assert.equal(document.querySelectorAll("[data-sb-nav-owner]").length, 1);
  assert.equal(document.querySelector("[data-sb-nav-owner]").parentElement, replacement.scroll);
  assert.equal(replacement.scroll.dataset.sbNavContentRoot, "1");
  assert.equal(replacement.pluginSection.dataset.sbNavPluginSection, "1");
  assert.equal(replacement.localDataSection.dataset.sbNavLocalSection, "1");
  assert.equal(replacement.conversationSection.dataset.sbNavConversationSection, "1");
  assert.deepEqual(nativePresentation(replacement.localDataSection), {
    hidden: true,
    display: "none",
    ariaHidden: "true"
  });
  assert.equal(document.querySelectorAll("[data-sb-mode]").length, NAV_MODES.length - 2);
  modeRow(document, "skills").click();
  assert.equal(skillClicks, 1);
  assert.equal(document.listenerCount(NAV_EVENT), 1);
  assert.equal(document.listenerCount("click"), 1);

  instance.unmount();
  assert.deepEqual(nativePresentation(replacement.localDataSection), replacementLocalOriginal);
  assert.equal(replacement.scroll.getAttribute("data-sb-nav-content-root"), null);
});

test("three whole-sidebar replacements repair one clean owner without duplicate forwarding", () => {
  const { document, fixture, instance } = mountFixture({ kanbanReady: true });
  let latest = fixture;
  for (let index = 0; index < 3; index += 1) {
    latest.sidebar.remove();
    latest = buildSidebarFixture(document, { kanbanReady: true, history: index % 2 === 0 });
    FakeMutationObserver.flush();
    assert.equal(document.querySelectorAll("[data-sb-nav-owner]").length, 1);
    assert.equal(document.querySelectorAll("[data-sb-group]").length, 3);
    assert.equal(document.querySelectorAll("[data-sb-mode]").length, NAV_MODES.length - 2);
  }

  let clicks = 0;
  latest.skills.addEventListener("click", () => { clicks += 1; });
  modeRow(document, "skills").click();
  assert.equal(clicks, 1);
  assert.equal(FakeMutationObserver.activeCount(), 1);
  assert.equal(document.listenerCount(NAV_EVENT), 1);

  instance.unmount();
});

test("sidebar replacement immediately restores and releases every detached generation", () => {
  const { document, fixture, instance } = mountFixture({ kanbanReady: true });
  const generations = [fixture];
  fixture.newTask.classList.add("_active_xyz_");
  FakeMutationObserver.flush();

  for (let index = 0; index < 3; index += 1) {
    const previous = generations.at(-1);
    assert.equal(previous.newTask.dataset.sbNavActiveOwned, "1");
    previous.sidebar.remove();
    const replacement = buildSidebarFixture(document, { kanbanReady: true, history: true });
    replacement.newTask.classList.add("_active_xyz_");
    generations.push(replacement);
    FakeMutationObserver.flush();
    assert.equal(previous.newTask.getAttribute("data-sb-nav-active-owned"), null);
    assert.equal(previous.newTask.getAttribute("data-sb-mode"), null);
    assert.equal(previous.newTask.getAttribute("data-sb-nav-slot"), null);
    assert.equal(previous.newTask.getAttribute("aria-current"), null);
    assert.equal(previous.office.getAttribute("data-sb-mode"), null);
    assert.equal(previous.office.parentElement.getAttribute("data-sb-nav-slot"), null);
    assert.equal(previous.historyList.getAttribute("data-sb-nav-slot"), null);
    assert.equal(previous.scroll.getAttribute("data-sb-nav-content-root"), null);
    assert.equal(previous.kanban.style.display ?? "", "");
    assert.equal(previous.skills.style.display ?? "", "");
  }

  instance.unmount();
  for (const generation of generations.slice(-1)) {
    assert.equal(generation.newTask.getAttribute("data-sb-nav-active-owned"), null);
    assert.equal(generation.newTask.getAttribute("data-sb-mode"), null);
    assert.equal(generation.newTask.getAttribute("data-sb-nav-slot"), null);
    assert.equal(generation.newTask.getAttribute("aria-current"), null);
    assert.equal(generation.office.getAttribute("data-sb-mode"), null);
    assert.equal(generation.office.parentElement.getAttribute("data-sb-nav-slot"), null);
    assert.equal(generation.historyList.getAttribute("data-sb-nav-slot"), null);
    assert.equal(generation.kanban.style.display ?? "", "");
    assert.equal(generation.skills.style.display ?? "", "");
  }
});

test("unmount restores native rows and removes all lifecycle state before a clean remount", () => {
  const { document, fixture, instance } = mountFixture({ kanbanReady: true });
  assert.equal(fixture.kanban.style.display, "none");
  assert.equal(fixture.skills.style.display, "none");

  instance.unmount();
  instance.unmount();
  assert.equal(document.querySelectorAll("[data-sb-nav-owner]").length, 0);
  assert.equal(document.querySelectorAll("#salebuddy-nav-framework-style").length, 0);
  assert.equal(document.querySelectorAll("[data-sb-group]").length, 0);
  assert.equal(FakeMutationObserver.activeCount(), 0);
  assert.equal(document.listenerCount(NAV_EVENT), 0);
  assert.equal(document.listenerCount("click"), 0);
  assert.equal(window.listenerCount("popstate"), 0);
  assert.equal(fixture.kanban.style.display ?? "", "");
  assert.equal(fixture.skills.style.display ?? "", "");
  assert.equal(fixture.kanban.getAttribute("aria-hidden"), null);
  assert.equal(fixture.skills.getAttribute("aria-hidden"), null);

  const remounted = mountNavFramework({ openers: noOpOpeners() });
  FakeMutationObserver.flush();
  assert.notEqual(remounted, instance);
  assert.equal(document.querySelectorAll("[data-sb-nav-owner]").length, 1);
  assert.equal(FakeMutationObserver.activeCount(), 1);
  remounted.unmount();
});

function roomGateway(state) {
  return {
    async action(name, payload) {
      if (name === "room.action.list") return { data: { rooms: state.rooms } };
      if (name === "room.office.current") return { data: { roomId: state.activeRoomId } };
      if (name === "room.office.switch") {
        state.activeRoomId = payload.roomId;
        return { data: { roomId: payload.roomId } };
      }
      throw new Error(`Unexpected gateway action: ${name}`);
    }
  };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function controlledOfficeGateway() {
  const lists = [];
  const currents = [];
  const switches = [];
  return {
    lists,
    currents,
    switches,
    gateway: {
      action(name) {
        if (name === "room.action.list") return lists.shift().promise;
        if (name === "room.office.current") return currents.shift().promise;
        if (name === "room.office.switch") return switches.shift().promise;
        throw new Error(`Unexpected gateway action: ${name}`);
      }
    }
  };
}

function queueOfficeRefresh(control, rooms, activeRoomId) {
  const list = deferred();
  const current = deferred();
  control.lists.push(list);
  control.currents.push(current);
  return {
    resolve() {
      list.resolve({ data: { rooms } });
      current.resolve({ data: { roomId: activeRoomId } });
    }
  };
}

function appendOfficeTitle(document, text = "SaleBuddy办公室") {
  const host = node(document, "div", { className: "office-page-host office-dashboard" });
  const title = node(document, "div", { className: "_pageTitleText_xyz_" });
  title.appendChild(node(document, "span", { text }));
  host.appendChild(title);
  document.body.appendChild(host);
  return { host, title };
}

function projectRows(document) {
  return document.querySelectorAll("#salebuddy-office-rooms .sb-ofs-row");
}

for (const roomCount of [0, 1, 3]) {
  test(`office switch alone renders ${roomCount} live rooms with count and current state`, async () => {
    const document = installDom();
    const fixture = buildSidebarFixture(document);
    const rooms = Array.from({ length: roomCount }, (_, index) => ({ id: `room-${index + 1}`, name: `Project ${index + 1}` }));
    const state = { rooms, activeRoomId: rooms.at(-1)?.id || null };
    const instance = mountOfficeSwitch({ gateway: roomGateway(state) });
    try {
      await window.runIntervals();
      await settleDom();

      assert.equal(document.querySelectorAll("#salebuddy-office-rooms").length, 1);
      assert.equal(projectRows(document).length, roomCount);
      assert.equal(document.querySelector("[data-sb-office-project-count]").textContent, `· ${roomCount} 个项目`);
      assert.equal(document.querySelectorAll(".sb-ofs-empty").length, roomCount === 0 ? 1 : 0);
      if (roomCount === 0) assert.equal(document.querySelector(".sb-ofs-empty").textContent, "暂无项目");
      assert.equal(document.querySelectorAll(".sb-ofs-row.sb-on").length, roomCount ? 1 : 0);
      assert.equal(document.querySelectorAll(".sb-ofs-side").filter((node) => node.textContent === "当前").length, roomCount ? 1 : 0);
      assert.equal(fixture.office.textContent, "办公室", "count presentation must not alter native row text ownership");
      for (const row of projectRows(document)) {
        assert.equal(row.style.minHeight, `${NAV_LAYOUT.projectRow}px`);
        assert.equal(row.style.paddingLeft, `${NAV_LAYOUT.childIndent}px`);
      }
    } finally {
      instance.unmount();
    }
  });
}

test("office refresh updates the live count without copying room data into nav framework", async () => {
  const document = installDom();
  buildSidebarFixture(document);
  const nav = mountNavFramework({ openers: noOpOpeners() });
  const state = { rooms: [{ id: "one", name: "Only Project" }], activeRoomId: "one" };
  const office = mountOfficeSwitch({ gateway: roomGateway(state) });
  try {
    await window.runIntervals();
    await settleDom();
    assert.equal(document.querySelector("[data-sb-office-project-count]").textContent, "· 1 个项目");

    state.rooms = [
      { id: "one", name: "Only Project" },
      { id: "two", name: "Second Project" },
      { id: "three", name: "Third Project" }
    ];
    await window.runIntervals();
    await settleDom();

    assert.equal(document.querySelector("[data-sb-office-project-count]").textContent, "· 3 个项目");
    assert.equal(projectRows(document).length, 3);
    assert.equal(document.querySelector("[data-sb-nav-owner]").textContent.includes("Second Project"), false);
    assert.equal(document.querySelector("[data-sb-nav-owner]").textContent.includes("Third Project"), false);
  } finally {
    office.unmount();
    nav.unmount();
  }
});

test("office room switch dispatches the shared active navigation event after switching", async () => {
  const document = installDom();
  buildSidebarFixture(document);
  const state = {
    rooms: [{ id: "one", name: "One" }, { id: "two", name: "Two" }],
    activeRoomId: "one"
  };
  const details = [];
  document.addEventListener(NAV_EVENT, (event) => details.push({ target: event.target, detail: event.detail }));
  const instance = mountOfficeSwitch({ gateway: roomGateway(state) });
  try {
    await window.runIntervals();
    await settleDom();
    projectRows(document)[1].click();
    await settleDom();

    assert.equal(state.activeRoomId, "two");
    assert.deepEqual(details, [{ target: document, detail: { mode: "office", active: true } }]);
  } finally {
    instance.unmount();
  }
});

test("office switch survives three whole-sidebar replacements and fully unmounts", async () => {
  const document = installDom();
  let fixture = buildSidebarFixture(document);
  const state = {
    rooms: [
      { id: "one", name: "One" },
      { id: "two", name: "Two" },
      { id: "three", name: "Three" }
    ],
    activeRoomId: "two"
  };
  const instance = mountOfficeSwitch({ gateway: roomGateway(state) });
  const generations = [];
  try {
    await window.runIntervals();
    await settleDom();

    for (let index = 0; index < 3; index += 1) {
      const previous = fixture;
      const oldBox = document.querySelector("#salebuddy-office-rooms");
      const oldRows = projectRows(document);
      generations.push({ box: oldBox, rows: oldRows });
      previous.sidebar.remove();
      fixture = buildSidebarFixture(document);
      FakeMutationObserver.flush();
      assert.equal(oldBox.parentNode === null, true, "a detached generation must release its owned box");
      for (const row of oldRows) assert.equal(row.listenerCount("click"), 0);
      assert.equal(document.querySelectorAll("#salebuddy-office-rooms").length, 1);
      assert.equal(projectRows(document).length, 3);
      assert.equal(document.querySelectorAll("[data-sb-office-project-count]").length, 1);
      assert.equal(document.querySelectorAll(".sb-ofs-row.sb-on").length, 1);
      assert.equal(document.querySelector(".sb-ofs-row.sb-on .sb-ofs-side").textContent, "当前");

      previous.host.appendChild(previous.sidebar);
      FakeMutationObserver.flush();
      assert.equal(document.querySelectorAll("#salebuddy-office-rooms").length, 1, "reattaching an old root cannot revive its box");
      previous.sidebar.remove();
      FakeMutationObserver.flush();
    }
    generations.push({ box: document.querySelector("#salebuddy-office-rooms"), rows: projectRows(document) });
  } finally {
    instance.unmount();
  }
  for (const { box: oldBox, rows } of generations) {
    assert.equal(oldBox.parentNode === null, true);
    for (const row of rows) assert.equal(row.listenerCount("click"), 0);
  }
  assert.equal(document.querySelectorAll("#salebuddy-office-rooms").length, 0);
  assert.equal(document.querySelectorAll("[data-sb-office-project-count]").length, 0);
  assert.equal(document.querySelectorAll(".sb-office-room-badge").length, 0);
  assert.equal(FakeMutationObserver.activeCount(), 0);
  assert.equal(window._intervals.size, 0);
});

test("office refresh commits only the newest response and cannot overwrite a completed switch", async () => {
  const document = installDom();
  buildSidebarFixture(document);
  const control = controlledOfficeGateway();
  const rooms = [{ id: "one", name: "One" }, { id: "two", name: "Two" }, { id: "three", name: "Three" }];
  const initial = queueOfficeRefresh(control, rooms, "one");
  const instance = mountOfficeSwitch({ gateway: control.gateway });
  initial.resolve();
  await settleDom();

  const older = queueOfficeRefresh(control, rooms, "one");
  const olderTick = window.runIntervals();
  await Promise.resolve();
  const newer = queueOfficeRefresh(control, rooms, "three");
  const newerTick = window.runIntervals();
  await Promise.resolve();
  newer.resolve();
  await newerTick;
  await settleDom();
  older.resolve();
  await olderTick;
  await settleDom();
  assert.equal(document.querySelector(".sb-ofs-row.sb-on .sb-ofs-name").textContent, "Three");

  const stale = queueOfficeRefresh(control, rooms, "one");
  const staleTick = window.runIntervals();
  await Promise.resolve();
  const switched = deferred();
  control.switches.push(switched);
  projectRows(document)[1].click();
  switched.resolve({ data: { roomId: "two" } });
  await settleDom();
  stale.resolve();
  await staleTick;
  await settleDom();
  assert.equal(document.querySelector(".sb-ofs-row.sb-on .sb-ofs-name").textContent, "Two");

  instance.unmount();
});

test("office ignores a pending switch completion after unmount", async () => {
  const document = installDom();
  const fixture = buildSidebarFixture(document);
  let nativeClicks = 0;
  fixture.office.addEventListener("click", () => { nativeClicks += 1; });
  const control = controlledOfficeGateway();
  const rooms = [{ id: "one", name: "One" }, { id: "two", name: "Two" }];
  const initial = queueOfficeRefresh(control, rooms, "one");
  const pendingSwitch = deferred();
  control.switches.push(pendingSwitch);
  const details = [];
  document.addEventListener(NAV_EVENT, (event) => details.push(event.detail));
  const instance = mountOfficeSwitch({ gateway: control.gateway });
  initial.resolve();
  await settleDom();

  projectRows(document)[1].click();
  instance.unmount();
  pendingSwitch.resolve({ data: { roomId: "two" } });
  await settleDom();

  assert.deepEqual(details, []);
  assert.equal(nativeClicks, 0);
  assert.equal(document.querySelectorAll("#salebuddy-office-rooms").length, 0);
});

test("office title ownership releases three replaced generations and cannot revive on reattach", async () => {
  const document = installDom();
  buildSidebarFixture(document);
  let titleFixture = appendOfficeTitle(document);
  const state = { rooms: [{ id: "one", name: "One" }], activeRoomId: "one" };
  const instance = mountOfficeSwitch({ gateway: roomGateway(state) });
  const generations = [];
  await window.runIntervals();
  await settleDom();

  for (let index = 0; index < 3; index += 1) {
    const previous = titleFixture;
    const name = previous.title.querySelector("[data-sb-office-title]");
    const badge = previous.title.querySelector("[data-sb-office-room]");
    generations.push({ name, badge });
    previous.host.remove();
    titleFixture = appendOfficeTitle(document, index % 2 ? "Marvis办公室" : "SaleBuddy办公室");
    await window.runIntervals();
    await settleDom();

    assert.equal(name.parentNode === null, true);
    assert.equal(badge.parentNode === null, true);
    assert.equal(document.querySelectorAll("[data-sb-office-title]").length, 1);
    assert.equal(document.querySelectorAll("[data-sb-office-room]").length, 1);

    document.body.appendChild(previous.host);
    await window.runIntervals();
    assert.equal(document.querySelectorAll("[data-sb-office-title]").length, 1);
    assert.equal(document.querySelectorAll("[data-sb-office-room]").length, 1);
    previous.host.remove();
  }

  generations.push({
    name: titleFixture.title.querySelector("[data-sb-office-title]"),
    badge: titleFixture.title.querySelector("[data-sb-office-room]")
  });
  instance.unmount();
  for (const generation of generations) {
    assert.equal(generation.name.parentNode === null, true);
    assert.equal(generation.badge.parentNode === null, true);
  }
  assert.equal(document.querySelectorAll("[data-sb-office-title]").length, 0);
  assert.equal(document.querySelectorAll("[data-sb-office-room]").length, 0);
});

test("office title styling and injection stay scoped to the office page", async () => {
  const document = installDom();
  buildSidebarFixture(document);
  const otherPage = node(document, "div", { className: "other-page" });
  const otherTitle = node(document, "div", { className: "_pageTitleText_other_" });
  otherTitle.appendChild(node(document, "span", { text: "Other page" }));
  otherPage.appendChild(otherTitle);
  document.body.appendChild(otherPage);
  const officeTitle = appendOfficeTitle(document);
  const state = { rooms: [{ id: "one", name: "One" }], activeRoomId: "one" };
  const instance = mountOfficeSwitch({ gateway: roomGateway(state) });
  await window.runIntervals();
  await settleDom();

  const stylesheet = document.querySelector("style");
  assert.equal(otherTitle.querySelector("[data-sb-office-title]"), null);
  assert.equal(otherTitle.querySelector("[data-sb-office-room]"), null);
  assert.ok(officeTitle.title.querySelector("[data-sb-office-title]"));
  assert.ok(officeTitle.title.querySelector("[data-sb-office-room]"));
  assert.match(stylesheet.textContent, /\.office-dashboard \[class\*="_pageTitleText_"\]\{font-size:0 !important\}/);
  assert.doesNotMatch(stylesheet.textContent, /(?:^|\n)\[class\*="_pageTitleText_"\]\{font-size:0 !important\}/);

  instance.unmount();
});

test("kanban emits shared open and close state while page ownership survives row replacement", () => {
  const document = installDom();
  const fixture = buildSidebarFixture(document);
  const details = [];
  const opened = [];
  document.addEventListener(NAV_EVENT, (event) => details.push({ target: event.target, detail: event.detail }));
  const instance = mountKanbanNav({
    openKanban(options) {
      opened.push(options);
      return { close: options.onClose };
    }
  });

  let replacement = null;
  try {
    fixture.kanban.click();
    assert.equal(opened.length, 1);
    assert.deepEqual(details, [{ target: document, detail: { mode: "kanban", active: true } }]);

    fixture.kanban.remove();
    replacement = nativeRow(document, "自动任务");
    fixture.pluginSection.querySelector("._pluginList_xyz_").appendChild(replacement);
    window.runIntervals();
    replacement.click();
    assert.equal(opened.length, 1, "an open page remains owned across native row replacement");

    opened[0].onClose();
    assert.deepEqual(details.at(-1), { target: document, detail: { mode: "kanban", active: false } });
    replacement.click();
    assert.equal(opened.length, 2);
    assert.deepEqual(details.at(-1), { target: document, detail: { mode: "kanban", active: true } });
  } finally {
    instance.unmount();
    closeCurrentPage();
  }
  assert.equal(replacement.getAttribute("data-sb-kanban"), null);
  assert.equal(fixture.kanban.getAttribute("data-sb-kanban"), null);
  assert.equal(window._intervals.size, 0);
});

test("kanban unmount closes only its owned page once and invalidates the old close callback", () => {
  const document = installDom();
  const fixture = buildSidebarFixture(document);
  const details = [];
  const pages = [];
  const openKanban = (options) => {
    const page = {
      options,
      closeCalls: 0,
      close() {
        this.closeCalls += 1;
        options.onClose();
      }
    };
    pages.push(page);
    return page;
  };
  document.addEventListener(NAV_EVENT, (event) => details.push(event.detail));

  const first = mountKanbanNav({ openKanban });
  fixture.kanban.click();
  first.unmount();
  assert.equal(pages[0].closeCalls, 1);
  assert.deepEqual(details, [
    { mode: "kanban", active: true },
    { mode: "kanban", active: false }
  ]);
  pages[0].options.onClose();
  pages[0].options.onClose();
  assert.equal(details.length, 2);

  const second = mountKanbanNav({ openKanban });
  fixture.kanban.click();
  assert.equal(pages.length, 2);
  second.unmount();
  assert.equal(pages[1].closeCalls, 1);
  assert.deepEqual(details, [
    { mode: "kanban", active: true },
    { mode: "kanban", active: false },
    { mode: "kanban", active: true },
    { mode: "kanban", active: false }
  ]);
});

test("kanban restores native text, translate, classes, marker, and listeners across generations", async () => {
  const document = installDom();
  const fixture = buildSidebarFixture(document);
  fixture.kanban.className = "_menuItem_xyz_ original-one";
  fixture.kanban.setAttribute("translate", "yes");
  const instance = mountKanbanNav({ openKanban() { return { close() {} }; } });
  assert.equal(fixture.kanban.textContent, "看板");
  assert.equal(fixture.kanban.getAttribute("translate"), "no");
  assert.equal(fixture.kanban.classList.contains("notranslate"), true);

  fixture.kanban.remove();
  const replacement = nativeRow(document, "自动任务", "_menuItem_xyz_ original-two");
  fixture.pluginSection.querySelector("._pluginList_xyz_").appendChild(replacement);
  await window.runIntervals();
  assert.equal(fixture.kanban.textContent, "自动任务");
  assert.equal(fixture.kanban.getAttribute("translate"), "yes");
  assert.equal(fixture.kanban.className, "_menuItem_xyz_ original-one");
  assert.equal(fixture.kanban.getAttribute("data-sb-kanban"), null);
  assert.equal(fixture.kanban.listenerCount("click"), 0);

  instance.unmount();
  assert.equal(replacement.textContent, "自动任务");
  assert.equal(replacement.getAttribute("translate"), null);
  assert.equal(replacement.className, "_menuItem_xyz_ original-two");
  assert.equal(replacement.getAttribute("data-sb-kanban"), null);
  assert.equal(replacement.listenerCount("click"), 0);

  const external = mountKanbanNav({ openKanban() { return { close() {} }; } });
  const replacementText = document.createTreeWalker(replacement, NodeFilter.SHOW_TEXT).nextNode();
  replacementText.nodeValue = "外部入口";
  replacement.setAttribute("translate", "external");
  replacement.classList.add("external-token");
  external.unmount();
  assert.equal(replacement.textContent, "外部入口");
  assert.equal(replacement.getAttribute("translate"), "external");
  assert.equal(replacement.classList.contains("external-token"), true);
  assert.equal(replacement.classList.contains("notranslate"), false);
});

test("kanban releases three replaced Text subtrees on the same native row", async () => {
  const document = installDom();
  const fixture = buildSidebarFixture(document);
  const instance = mountKanbanNav({ openKanban() { return { close() {} }; } });
  const releasedTextNodes = [];

  for (let index = 0; index < 3; index += 1) {
    const oldLabel = fixture.kanban.querySelector("._label_xyz_");
    const oldText = document.createTreeWalker(oldLabel, NodeFilter.SHOW_TEXT).nextNode();
    releasedTextNodes.push(oldText);
    const replacementLabel = node(document, "span", { className: "_label_xyz_", text: "自动任务" });
    oldLabel.replaceWith(replacementLabel);
    await window.runIntervals();

    assert.equal(oldText.nodeValue, "自动任务");
    assert.equal(fixture.kanban.textContent, "看板");
    oldText.nodeValue = "看板";
  }

  instance.unmount();
  assert.equal(fixture.kanban.textContent, "自动任务");
  for (const oldText of releasedTextNodes) assert.equal(oldText.nodeValue, "看板");
});

test("integrated kanban forwarding emits one active transition and preserves close synchronization", () => {
  const document = installDom();
  const fixture = buildSidebarFixture(document);
  const nav = mountNavFramework({ openers: noOpOpeners() });
  const pages = [];
  const kanban = mountKanbanNav({
    openKanban(options) {
      pages.push(options);
      return { close: options.onClose };
    }
  });
  FakeMutationObserver.flush();
  const details = [];
  document.addEventListener(NAV_EVENT, (event) => details.push(event.detail));

  document.querySelector("[data-sb-nav-owner]").remove();
  fixture.kanban.click();
  assert.equal(fixture.kanban.dataset.sbKanban, "1");
  assert.deepEqual(details.filter((detail) => detail.mode === "kanban" && detail.active), [
    { mode: "kanban", active: true }
  ]);
  pages[0].onClose();
  assert.deepEqual(details.filter((detail) => detail.mode === "kanban" && !detail.active), [
    { mode: "kanban", active: false }
  ]);

  nav.unmount();
  details.length = 0;
  fixture.kanban.click();
  assert.deepEqual(details, [{ mode: "kanban", active: true }]);
  pages.at(-1).onClose();
  assert.deepEqual(details.at(-1), { mode: "kanban", active: false });
  kanban.unmount();
});

test("integrated office switching emits one active transition", async () => {
  const document = installDom();
  buildSidebarFixture(document);
  const nav = mountNavFramework({ openers: noOpOpeners() });
  const state = {
    rooms: [{ id: "one", name: "One" }, { id: "two", name: "Two" }, { id: "three", name: "Three" }],
    activeRoomId: "one"
  };
  const office = mountOfficeSwitch({ gateway: roomGateway(state) });
  await window.runIntervals();
  await settleDom();
  const details = [];
  document.addEventListener(NAV_EVENT, (event) => details.push(event.detail));

  document.querySelector("[data-sb-nav-owner]").remove();
  projectRows(document)[1].click();
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(details.filter((detail) => detail.mode === "office" && detail.active), [
    { mode: "office", active: true }
  ]);

  nav.unmount();
  details.length = 0;
  projectRows(document)[2].click();
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(details.filter((detail) => detail.mode === "office" && detail.active), [
    { mode: "office", active: true }
  ]);
  office.unmount();
});

function appendLegacyGroup(document, fixture, label, secondaryLabels = []) {
  const group = node(document, "div", { className: "_menuGroup_xyz_" });
  const primary = nativeRow(document, label);
  const submenu = node(document, "div", { className: "_subMenu_xyz_" });
  const secondary = secondaryLabels.map((text) => {
    const item = nativeRow(document, text, "_menuItem_xyz_ _subItem_xyz_");
    item.setAttribute("dt-eid", "second_sidebar_tab");
    submenu.appendChild(item);
    return item;
  });
  group.append(primary, submenu);
  fixture.localDataSection.appendChild(group);
  return { group, primary, secondary };
}

function nativePresentation(node) {
  return {
    hidden: node.hidden,
    display: node.style.display,
    ariaHidden: node.getAttribute("aria-hidden")
  };
}

test("sidebar customization keeps the owned account entry visible", () => {
  const document = installDom();
  buildSidebarFixture(document);
  const nav = mountNavFramework({ openers: noOpOpeners() });
  const customization = mountSidebarCustomization();
  try {
    const account = document.querySelector('[data-sb-group="account"]');
    assert.ok(account);
    assert.equal(account.querySelector("[data-sb-account-toggle]").hidden, false);
  } finally {
    customization.unmount();
    nav.unmount();
  }
});

test("sidebar customization is a document singleton scoped to the anchored native sidebar", () => {
  const document = installDom();
  const decoy = buildSidebarFixture(document);
  decoy.localDataSection.remove();
  const invalidNesting = node(document, "div", { className: "invalid-local-data-nesting" });
  invalidNesting.appendChild(decoy.localDataSection);
  decoy.scroll.appendChild(invalidNesting);
  decoy.localDataSection.textContent = "";
  const decoyGroup = appendLegacyGroup(document, decoy, "文档", ["诱饵文档"]);

  const fixture = buildSidebarFixture(document);
  fixture.localDataSection.textContent = "";
  const realGroup = appendLegacyGroup(document, fixture, "文档", ["预置文档"]);
  const first = mountSidebarCustomization();
  const second = mountSidebarCustomization();

  assert.equal(second, first);
  assert.equal(FakeMutationObserver.activeCount(), 1);
  assert.equal(window._intervals.size, 1);
  assert.equal(document.querySelectorAll("#salebuddy-sidebar-customization-style").length, 1);
  assert.equal(decoyGroup.primary.hidden, false);
  assert.equal(decoyGroup.secondary[0].hidden, false);
  assert.equal(realGroup.primary.hidden, true);
  assert.equal(realGroup.secondary[0].hidden, true);

  first.unmount();
  second.unmount();
  assert.equal(realGroup.primary.hidden, false);
  assert.equal(realGroup.secondary[0].hidden, false);
  assert.equal(FakeMutationObserver.activeCount(), 0);
  assert.equal(window._intervals.size, 0);
  assert.equal(document.querySelectorAll("#salebuddy-sidebar-customization-style").length, 0);
});

test("sidebar customization reversibly hides exact legacy groups without touching search or history", () => {
  const document = installDom();
  const fixture = buildSidebarFixture(document, { search: true, history: true });
  fixture.localDataSection.textContent = "";
  const groups = [
    appendLegacyGroup(document, fixture, "应 用", ["应用中心"]),
    appendLegacyGroup(document, fixture, "文\n档", ["预置文档"]),
    appendLegacyGroup(document, fixture, "图 库", ["最近图片"]),
    appendLegacyGroup(document, fixture, "此 电 脑", ["本地磁盘 (C)", "Data (D)"])
  ];
  const tracked = groups.flatMap(({ primary, secondary }) => [primary, ...secondary]);
  tracked[0].style.display = "grid";
  tracked[1].hidden = true;
  tracked[1].style.display = "inline-flex";
  tracked[1].setAttribute("aria-hidden", "false");
  tracked[2].setAttribute("aria-hidden", "true");
  const originals = new Map(tracked.map((item) => [item, nativePresentation(item)]));
  const searchOriginal = nativePresentation(fixture.search);
  const historyOriginal = nativePresentation(fixture.historyList.querySelector("._historyItem_xyz_"));

  const instance = mountSidebarCustomization();
  assert.equal(document.querySelectorAll("#salebuddy-sidebar-customization-style").length, 1);
  for (const item of tracked) {
    assert.equal(item.hidden, true);
    assert.equal(item.style.display, "none");
    assert.equal(item.getAttribute("aria-hidden"), "true");
    assert.ok(item.isConnected, "React-owned native nodes must remain mounted");
  }
  assert.deepEqual(nativePresentation(fixture.search), searchOriginal);
  assert.deepEqual(nativePresentation(fixture.historyList.querySelector("._historyItem_xyz_")), historyOriginal);

  instance.unmount();
  for (const item of tracked) assert.deepEqual(nativePresentation(item), originals.get(item));
  assert.equal(document.querySelectorAll("#salebuddy-sidebar-customization-style").length, 0);
  assert.equal(FakeMutationObserver.activeCount(), 0);
  assert.equal(window._intervals.size, 0);
});

test("sidebar customization restores detached generations and reapplies hiding after replacement", () => {
  const document = installDom();
  let fixture = buildSidebarFixture(document);
  fixture.localDataSection.textContent = "";
  let generation = appendLegacyGroup(document, fixture, "此电脑", ["本地磁盘 (C)"]);
  const oldGenerations = [];
  const instance = mountSidebarCustomization();

  for (let index = 0; index < 3; index += 1) {
    const priorNodes = [generation.primary, ...generation.secondary];
    oldGenerations.push(priorNodes);
    fixture.sidebar.remove();
    fixture = buildSidebarFixture(document);
    fixture.localDataSection.textContent = "";
    generation = appendLegacyGroup(document, fixture, index % 2 ? "文档" : "此电脑", [`Generation ${index}`]);
    FakeMutationObserver.flush();
    for (const oldNode of priorNodes) {
      assert.equal(oldNode.hidden, false);
      assert.equal(oldNode.style.display ?? "", "");
      assert.equal(oldNode.getAttribute("aria-hidden"), null);
    }
    for (const current of [generation.primary, ...generation.secondary]) {
      assert.equal(current.hidden, true);
      assert.equal(current.style.display, "none");
      assert.equal(current.getAttribute("aria-hidden"), "true");
    }
  }

  instance.unmount();
  for (const current of [generation.primary, ...generation.secondary]) {
    assert.equal(current.hidden, false);
    assert.equal(current.style.display ?? "", "");
    assert.equal(current.getAttribute("aria-hidden"), null);
  }
  for (const priorNodes of oldGenerations) {
    for (const oldNode of priorNodes) assert.equal(oldNode.getAttribute("aria-hidden"), null);
  }
  assert.equal(document.querySelectorAll("#salebuddy-sidebar-customization-style").length, 0);
  assert.equal(FakeMutationObserver.activeCount(), 0);
  assert.equal(window._intervals.size, 0);
});

test("sidebar customization restores a reused primary node and its children when its exact label changes", () => {
  const document = installDom();
  const fixture = buildSidebarFixture(document);
  fixture.localDataSection.textContent = "";
  const group = appendLegacyGroup(document, fixture, "文档", ["预置文档"]);
  group.primary.style.display = "grid";
  group.primary.setAttribute("aria-hidden", "false");
  group.secondary[0].hidden = true;
  group.secondary[0].style.display = "inline-flex";
  group.secondary[0].setAttribute("aria-hidden", "false");
  const originals = new Map([
    [group.primary, nativePresentation(group.primary)],
    [group.secondary[0], nativePresentation(group.secondary[0])]
  ]);
  const instance = mountSidebarCustomization();

  assert.equal(group.primary.style.display, "none");
  assert.equal(group.secondary[0].style.display, "none");

  group.primary.querySelector("._label_xyz_").textContent = "搜索";
  FakeMutationObserver.flush();
  assert.deepEqual(nativePresentation(group.primary), originals.get(group.primary));
  assert.deepEqual(nativePresentation(group.secondary[0]), originals.get(group.secondary[0]));
  assert.ok(group.primary.isConnected);
  assert.ok(group.secondary[0].isConnected);

  group.primary.querySelector("._label_xyz_").textContent = "文档";
  FakeMutationObserver.flush();
  assert.equal(group.primary.style.display, "none");
  assert.equal(group.secondary[0].style.display, "none");

  group.primary.querySelector("._label_xyz_").textContent = "历史";
  FakeMutationObserver.flush();
  assert.deepEqual(nativePresentation(group.primary), originals.get(group.primary));
  assert.deepEqual(nativePresentation(group.secondary[0]), originals.get(group.secondary[0]));

  instance.unmount();
  assert.deepEqual(nativePresentation(group.primary), originals.get(group.primary));
  assert.deepEqual(nativePresentation(group.secondary[0]), originals.get(group.secondary[0]));
});

test("sidebar customization immediately restores a reused group after its Text node changes", () => {
  const document = installDom();
  const fixture = buildSidebarFixture(document);
  fixture.localDataSection.textContent = "";
  const group = appendLegacyGroup(document, fixture, "文档", ["预置文档"]);
  const originals = new Map([
    [group.primary, nativePresentation(group.primary)],
    [group.secondary[0], nativePresentation(group.secondary[0])]
  ]);
  const instance = mountSidebarCustomization();
  try {
    const label = group.primary.querySelector("._label_xyz_");
    const textNode = document.createTreeWalker(label, NodeFilter.SHOW_TEXT).nextNode();
    textNode.nodeValue = "搜索";
    FakeMutationObserver.flush();

    assert.deepEqual(nativePresentation(group.primary), originals.get(group.primary));
    assert.deepEqual(nativePresentation(group.secondary[0]), originals.get(group.secondary[0]));
  } finally {
    instance.unmount();
  }
});
