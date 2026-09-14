import { GOAL_OPTIONS } from "./goal-options.js";
import { createGoalIcon } from "./GoalIcon.js";

function createGoalCard({ documentRef, option, selected, onSelect }) {
  const card = documentRef.createElement("button");
  card.type = "button";
  card.className = `sb-onboarding-goal-card${selected ? " is-selected" : ""}`;
  card.dataset.goal = option.id;
  card.setAttribute("role", "option");
  card.setAttribute("aria-selected", String(selected));
  card.setAttribute("aria-pressed", String(selected));

  const icon = documentRef.createElement("span");
  icon.className = "sb-onboarding-goal-icon";
  icon.appendChild(createGoalIcon({ documentRef, name: option.icon }));

  const label = documentRef.createElement("strong");
  label.textContent = option.label;
  const description = documentRef.createElement("span");
  description.className = "sb-onboarding-goal-description";
  description.textContent = option.description;
  const check = documentRef.createElement("span");
  check.className = "sb-onboarding-goal-check";
  check.setAttribute("aria-hidden", "true");
  check.textContent = "✓";

  card.append(icon, label, description, check);
  card.addEventListener("click", () => onSelect(option.id));
  return card;
}

export function createGoalSelection({
  documentRef = globalThis.document,
  options = GOAL_OPTIONS,
  initialIds = ["high-intent", "outreach"],
  onNext,
  onBack
} = {}) {
  const root = documentRef.createElement("section");
  root.className = "sb-onboarding-goal-selection";

  const heading = documentRef.createElement("h1");
  heading.textContent = "你现在最想解决什么?";
  const subtitle = documentRef.createElement("p");
  subtitle.className = "sb-onboarding-goal-subtitle";
  subtitle.textContent = "选择你当前需要的目标，我们会据此安排更合适的数字员工团队。";

  const grid = documentRef.createElement("div");
  grid.className = "sb-onboarding-goal-grid";
  grid.setAttribute("role", "listbox");
  grid.setAttribute("aria-multiselectable", "true");
  grid.setAttribute("aria-label", "选择当前最重要的目标");

  const status = documentRef.createElement("p");
  status.className = "sb-onboarding-goal-status";
  status.setAttribute("role", "status");
  status.hidden = true;

  const note = documentRef.createElement("div");
  note.className = "sb-onboarding-goal-note";
  note.innerHTML = "<span class=\"sb-onboarding-goal-note-icon\" aria-hidden=\"true\">i</span><span>目标为必填项，请至少选择一个目标后继续。</span>";

  const back = documentRef.createElement("button");
  back.type = "button";
  back.className = "sb-onboarding-back-button";
  back.textContent = "返回";
  back.addEventListener("click", () => onBack?.({ step: "goal" }));

  const next = documentRef.createElement("button");
  next.type = "button";
  next.className = "sb-onboarding-next-button";
  next.innerHTML = "<span>继续</span><span aria-hidden=\"true\">→</span>";
  next.addEventListener("click", () => {
    if (!selectedIds.size) {
      status.hidden = false;
      status.textContent = "至少选择一个目标。";
      return;
    }
    onNext?.({ step: "goal", selectedIds: [...selectedIds] });
    status.hidden = false;
    status.textContent = "目标已保存，正在进入 Agent 广场。";
  });

  let selectedIds = new Set(initialIds);
  const cards = new Map();

  function updateSelection(nextId) {
    if (selectedIds.has(nextId)) {
      selectedIds.delete(nextId);
    } else {
      selectedIds.add(nextId);
    }
    cards.forEach((card, id) => {
      const selected = selectedIds.has(id);
      card.classList.toggle("is-selected", selected);
      card.setAttribute("aria-selected", String(selected));
      card.setAttribute("aria-pressed", String(selected));
    });
    status.hidden = true;
  }

  options.forEach((option) => {
    const card = createGoalCard({ documentRef, option, selected: selectedIds.has(option.id), onSelect: updateSelection });
    cards.set(option.id, card);
    grid.appendChild(card);
  });

  const actions = documentRef.createElement("div");
  actions.className = "sb-onboarding-goal-actions";
  actions.append(back, next);
  root.append(heading, subtitle, grid, status, note, actions);

  return {
    root,
    getSelectedIds: () => [...selectedIds],
    destroy() { root.remove(); }
  };
}
