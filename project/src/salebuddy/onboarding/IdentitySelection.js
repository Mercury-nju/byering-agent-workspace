import { IDENTITY_OPTIONS } from "./identity-options.js";
import { createIdentityIcon } from "./IdentityIcon.js";

function createOptionCard({ documentRef, option, selected, onSelect }) {
  const card = documentRef.createElement("button");
  card.type = "button";
  card.className = `sb-onboarding-identity-card${selected ? " is-selected" : ""}`;
  card.dataset.identity = option.id;
  card.dataset.tone = option.tone;
  card.setAttribute("role", "option");
  card.setAttribute("aria-pressed", String(selected));
  card.setAttribute("aria-selected", String(selected));

  const icon = documentRef.createElement("span");
  icon.className = "sb-onboarding-identity-icon";
  icon.appendChild(createIdentityIcon({ documentRef, name: option.icon }));

  const label = documentRef.createElement("strong");
  label.textContent = option.label;

  const description = documentRef.createElement("span");
  description.className = "sb-onboarding-identity-description";
  description.textContent = option.description;

  const check = documentRef.createElement("span");
  check.className = "sb-onboarding-identity-check";
  check.setAttribute("aria-hidden", "true");
  check.textContent = "✓";

  card.append(icon, label, description, check);
  card.addEventListener("click", () => onSelect(option.id));
  return card;
}

export function createIdentitySelection({
  documentRef = globalThis.document,
  initialId = IDENTITY_OPTIONS[0]?.id,
  onNext,
  onBack
} = {}) {
  const root = documentRef.createElement("section");
  root.className = "sb-onboarding-identity-selection";

  const heading = documentRef.createElement("h1");
  heading.textContent = "你主要在哪类业务中经营?";
  const subtitle = documentRef.createElement("p");
  subtitle.className = "sb-onboarding-identity-subtitle";
  subtitle.textContent = "选择你的业务类型，Byering 将为你匹配更合适的数字员工团队。";

  const grid = documentRef.createElement("div");
  grid.className = "sb-onboarding-identity-grid";
  grid.setAttribute("role", "listbox");
  grid.setAttribute("aria-label", "选择你的业务类型");

  const status = documentRef.createElement("p");
  status.className = "sb-onboarding-identity-status";
  status.setAttribute("role", "status");
  status.hidden = true;

  const back = documentRef.createElement("button");
  back.type = "button";
  back.className = "sb-onboarding-back-button";
  back.textContent = "返回";
  back.addEventListener("click", () => onBack?.({ step: "identity" }));

  const next = documentRef.createElement("button");
  next.type = "button";
  next.className = "sb-onboarding-next-button";
  next.innerHTML = "<span>下一步</span><span aria-hidden=\"true\">→</span>";
  next.addEventListener("click", () => {
    const selected = IDENTITY_OPTIONS.find((option) => option.id === selectedId);
    if (!selected) return;
    onNext?.({ step: "identity", selectedId, selected });
    status.hidden = false;
    status.textContent = `已选择「${selected.label}」，下一步选择你的目标。`;
  });

  let selectedId = initialId;
  const cards = new Map();

  function updateSelection(nextId) {
    selectedId = nextId;
    cards.forEach((card, id) => {
      const selected = id === selectedId;
      card.classList.toggle("is-selected", selected);
      card.setAttribute("aria-pressed", String(selected));
      card.setAttribute("aria-selected", String(selected));
    });
    status.hidden = true;
  }

  IDENTITY_OPTIONS.forEach((option) => {
    const card = createOptionCard({ documentRef, option, selected: option.id === selectedId, onSelect: updateSelection });
    cards.set(option.id, card);
    grid.appendChild(card);
  });

  const actions = documentRef.createElement("div");
  actions.className = "sb-onboarding-identity-actions";
  actions.append(back, next);

  root.append(heading, subtitle, grid, status, actions);

  return {
    root,
    getSelectedId: () => selectedId,
    destroy() { root.remove(); }
  };
}
