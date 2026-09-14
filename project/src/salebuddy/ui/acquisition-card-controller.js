import {
  ACQUISITION_CAPABILITIES,
  getAcquisitionCardAction
} from "../agents/acquisition-capability.js";

const CAPABILITY_BY_AGENT_ID = Object.freeze({
  "mkt-comment-acquisition": ACQUISITION_CAPABILITIES.COMMENT_ACQUISITION
});

/** Pure view-model for acquisition cards; unknown/legacy agents are untouched. */
export function getAcquisitionCardViewModel(agentOrId, probe) {
  const agentId = typeof agentOrId === "string" ? agentOrId : agentOrId?.id;
  const capability = CAPABILITY_BY_AGENT_ID[agentId];
  if (!capability) return null;
  return {
    agentId,
    capability,
    ...getAcquisitionCardAction(capability, probe)
  };
}

/** Apply the pure acquisition gate to a DOM-like button without requiring a browser. */
export function bindAcquisitionCardAction(button, agentOrId, probe, onAction = () => {}, options = {}) {
  if (!button || typeof button !== "object") throw new TypeError("Acquisition card button is required");
  const viewModel = getAcquisitionCardViewModel(agentOrId, probe);
  if (!viewModel) return null;
  const enabled = options.enabled ?? viewModel.startable;
  button.disabled = !enabled;
  if (typeof button.classList?.toggle === "function") button.classList.toggle("sb-disabled", !enabled);
  if (typeof button.setAttribute === "function") button.setAttribute("aria-disabled", String(!enabled));
  if ("textContent" in button) button.textContent = options.label || viewModel.label;
  if (enabled && typeof button.addEventListener === "function") {
    button.addEventListener("click", (event) => onAction(event, viewModel));
  }
  return viewModel;
}
