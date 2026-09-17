import { openProspectCenterPage } from "./ui/prospect-center.js?v=20260917-results-mock-preview-entry-1";

function mountPreviewShell() {
  const existing = document.querySelector("#route_inner_content_id");
  if (existing) return existing;

  document.body.innerHTML = "";
  const shell = document.createElement("div");
  shell.id = "route_inner_content_id";
  shell.style.minHeight = "100vh";
  shell.style.background = "#f7f8fb";
  document.body.appendChild(shell);
  return shell;
}

mountPreviewShell();
openProspectCenterPage({ initialAgentId: "mkt-comment-acquisition" });
