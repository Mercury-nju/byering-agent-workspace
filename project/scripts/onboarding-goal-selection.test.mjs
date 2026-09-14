import assert from "node:assert/strict";
import test from "node:test";

import { createGoalSelection } from "../src/salebuddy/onboarding/GoalSelection.js";

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.dataset = {};
    this.attributes = new Map();
    this.className = "";
    this.textContent = "";
    this.hidden = false;
    this.listeners = new Map();
    this.classList = { toggle: () => {} };
  }

  append(...nodes) { this.children.push(...nodes); }
  appendChild(node) { this.children.push(node); return node; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  addEventListener(name, handler) { this.listeners.set(name, handler); }
  click() { this.listeners.get("click")?.(); }
  remove() {}
}

const fakeDocument = {
  createElement: (tagName) => new FakeElement(tagName),
  createElementNS: (_namespace, tagName) => new FakeElement(tagName)
};

function textContentOf(node) {
  return [node.textContent, ...node.children.map(textContentOf)].join("");
}

test("goal selection requires a goal without offering a skip action", () => {
  let nextCalls = 0;
  const selection = createGoalSelection({
    documentRef: fakeDocument,
    options: [{ id: "high-intent", label: "识别高意向客户", description: "筛出高意向客户", icon: "target" }],
    initialIds: [],
    onNext: () => { nextCalls += 1; }
  });

  assert.doesNotMatch(textContentOf(selection.root), /以后再说/);
  assert.equal(selection.root.children.at(-1).children.length, 2);
  selection.root.children.at(-1).children.at(-1).click();
  assert.equal(nextCalls, 0);
  assert.match(textContentOf(selection.root), /至少选择一个目标/);
});
