import { createTaskSelection } from "./TaskSelection.js";

const ONBOARDING_STYLE_ID = "salebuddy-onboarding-style";

function ensureStyles(documentRef) {
  if (documentRef.getElementById(ONBOARDING_STYLE_ID)) return;
  const link = documentRef.createElement("link");
  link.id = ONBOARDING_STYLE_ID;
  link.rel = "stylesheet";
  link.href = new URL("./onboarding.css", import.meta.url).href;
  documentRef.head.appendChild(link);
}

export function renderOnboardingPage({
  root,
  documentRef = globalThis.document,
  selectedAgentId,
  onNext
} = {}) {
  ensureStyles(documentRef);
  root.className = "sb-onboarding-page-root sb-onboarding-v2-root";
  root.hidden = false;
  root.replaceChildren();

  const frame = documentRef.createElement("main");
  frame.className = "sb-onboarding-v2-frame";

  const header = documentRef.createElement("header");
  header.className = "sb-onboarding-v2-header";
  const brand = documentRef.createElement("div");
  brand.className = "sb-onboarding-v2-brand";
  const mark = documentRef.createElement("img");
  mark.src = new URL("../../../assets/byering-logo-mark.png", import.meta.url).href;
  mark.alt = "";
  const wordmark = documentRef.createElement("span");
  wordmark.textContent = "Byering";
  brand.append(mark, wordmark);
  const status = documentRef.createElement("span");
  status.className = "sb-onboarding-v2-status";
  status.textContent = "Agent 广场";
  header.append(brand, status);

  const selection = createTaskSelection({ documentRef, initialAgentId: selectedAgentId, onNext });
  frame.append(header, selection.root);
  root.appendChild(frame);

  return () => {
    selection.destroy();
    root.replaceChildren();
  };
}
