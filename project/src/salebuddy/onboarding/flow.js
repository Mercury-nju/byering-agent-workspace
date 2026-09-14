export function routeAfterTeamPreparation({ requiresAccess = true } = {}) {
  return requiresAccess ? "?page=onboarding&step=auth" : "?page=agent-square";
}

export function routeAfterAuthorization() {
  return "?page=agent-square&onboardingAuth=authorized";
}

export function routeAfterAuthLater() {
  return "?page=agent-square&onboardingAuth=skipped";
}

export function onboardingTaskSeed(match = {}, { authorized = true } = {}) {
  const goalLabels = Array.isArray(match.goalLabels) ? match.goalLabels.filter(Boolean) : [];
  const primaryGoal = match.primaryGoal?.label || goalLabels[0] || "当前目标";
  const workflowName = match.workflowName || "团队工作流";
  const agentCount = Array.isArray(match.agents) ? match.agents.length : 0;
  const goalSummary = goalLabels.join("、") || primaryGoal;
  const title = `${primaryGoal} · ${workflowName}`;

  if (!authorized) {
    return {
      title,
      taskText: match.taskObjective || goalSummary,
      preview: `已完成团队匹配，等待抖音账号授权后继续执行「${workflowName}」。`,
      status: "approval",
      runtimeProgress: 0,
      runtimeAgentName: "main",
      runtimeEvents: [`${match.businessType || "当前业务"} · ${goalSummary}已完成配置，等待抖音账号授权。`]
    };
  }

  return {
    title,
    taskText: match.taskObjective || goalSummary,
    preview: `已接收新手引导目标：${goalSummary}。幕僚长正在拆解并分配团队。`,
    status: "progress",
    runtimeProgress: 12,
    runtimeAgentName: "main",
    runtimeEvents: [
      `${match.businessType || "当前业务"} · ${goalSummary}已接收，行业重点为${match.industryFocus || "公开需求信号"}。`,
      `幕僚长已拆解目标，${agentCount} 位数字员工开始协作。`,
      `${workflowName}已进入执行阶段，结果会在实时工作中持续同步。`
    ]
  };
}
