import { finderAccountId, finderAccountName, finderAccountToOutreach, finderAccountUrl } from "./douyin-finder-results.js";

function text(value) {
  return String(value ?? "").trim();
}

export function isValidSurveyUrl(value) {
  try {
    const url = new URL(text(value));
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function validateUserResearchSetup({ finderGoal = "", surveyUrl = "" } = {}) {
  const errors = {};
  if (!text(finderGoal)) errors.finderGoal = "先选想邀请的人群";
  if (!isValidSurveyUrl(surveyUrl)) errors.surveyUrl = "还需要一个可以打开的问卷链接";
  return errors;
}

export function buildSurveyInvitation({ questionnaireUrl = "", customMessage = "" } = {}) {
  const url = text(questionnaireUrl);
  const custom = text(customMessage);
  if (custom) return url && !custom.includes(url) ? `${custom}\n${url}` : custom;
  return `你好，想邀请你参与一次用户调研，方便填写这份问卷吗？\n${url}`;
}

export function buildSurveyOutreachTargets(accounts = [], { selectedIds = null } = {}) {
  const selected = Array.isArray(selectedIds) ? new Set(selectedIds.map(text).filter(Boolean)) : null;
  return (Array.isArray(accounts) ? accounts : []).flatMap((account) => {
    const id = finderAccountId(account);
    if (selected && !selected.has(id)) return [];
    const outreach = finderAccountToOutreach(account);
    const secId = text(outreach.secId || outreach.secUid);
    if (!secId) return [];
    const reasons = Array.isArray(account.reasons) ? account.reasons.map(text).filter(Boolean) : [];
    const reason = text(account.reason) || reasons[0] || "账号公开资料与本次调研人群匹配";
    return [{
      ...account,
      id,
      nickname: finderAccountName(account),
      profileUrl: finderAccountUrl(account),
      secId,
      secUid: text(outreach.secUid || outreach.secId),
      profile: account.profile || account.identity || null,
      reasons,
      reason,
      evidence: Array.isArray(account.evidence) ? account.evidence : [],
      triggerSource: "用户调研匹配",
      triggerReason: reasons.length ? reasons.join("；") : reason,
      sourceResultType: "用户调研",
      status: "ready"
    }];
  });
}
