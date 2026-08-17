"""
Planning with Files - 阶段完成脚本 (修复版 v2)
"""

import os
import sys
import re
import datetime

# 强制 stdout 使用 UTF-8
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')


def get_all_stages(content):
    """从 task_plan.md 中提取所有阶段信息"""
    # 修复：使用原始字符串，避免转义问题
    pattern = r"### 阶段 (\d+)："
    matches = re.findall(pattern, content)
    return [int(num) for num in matches]


def fix_task_plan(plan_path, completed_stages, total_stages=0):
    """修复 task_plan.md：更新所有已完成阶段的状态"""
    with open(plan_path, "r", encoding="utf-8") as f:
        content = f.read()

    updated_stages = []

    for stage_num in completed_stages:
        # 先尝试更新 in_progress -> complete
        pattern_ip = (
            r"(### 阶段 " + str(stage_num) + r"：[^\n]*\n"
            r"- \[ \] 执行[^\n]*\n"
            r"- \[ \] 将发现[^\n]*\n"
            r"- \*\*状态：\*\* )in_progress"
        )
        if re.search(pattern_ip, content):
            content = re.sub(pattern_ip, r"\1complete", content, count=1)
            updated_stages.append(stage_num)
            continue

        # 兜底：更新 pending -> complete
        pattern_pd = (
            r"(### 阶段 " + str(stage_num) + r"：[^\n]*\n"
            r"- \[ \] 执行[^\n]*\n"
            r"- \[ \] 将发现[^\n]*\n"
            r"- \*\*状态：\*\* )pending"
        )
        if re.search(pattern_pd, content):
            content = re.sub(pattern_pd, r"\1complete", content, count=1)
            updated_stages.append(stage_num)

    # 更新"当前阶段"字段
    if completed_stages:
        next_stage = max(completed_stages) + 1
        # 尝试多种可能的格式
        if next_stage > total_stages:
            # 所有阶段已完成
            patterns = [
                (r"(## 当前阶段\n)阶段 \d+", r"\1✅ 全部完成"),
                (r"(## 当前阶段\n)第 \d+ 阶段", r"\1✅ 全部完成"),
            ]
        else:
            patterns = [
                (r"(## 当前阶段\n)阶段 \d+", r"\1阶段 " + str(next_stage)),
                (r"(## 当前阶段\n)第 \d+ 阶段", r"\1第 " + str(next_stage) + r" 阶段"),
            ]
        for pat, repl in patterns:
            if re.search(pat, content):
                content = re.sub(pat, repl, content)
                break

    with open(plan_path, "w", encoding="utf-8") as f:
        f.write(content)

    return updated_stages


def fix_progress(progress_path, completed_stages):
    """修复 progress.md：更新主体表格和详情中的状态"""
    if not os.path.exists(progress_path):
        return []

    with open(progress_path, "r", encoding="utf-8") as f:
        content = f.read()

    updated = False

    # 1. 更新每个阶段详情中的状态（更宽松的匹配）
    for stage_num in completed_stages:
        # 匹配 "### 阶段 N：" 块下面的状态
        pattern = (
            r"(### 阶段 " + str(stage_num) + r"：[^\n]*\n"
            r"- \*\*状态：\*\* )(pending|in_progress)"
        )
        if re.search(pattern, content):
            content = re.sub(pattern, r"\1✅ complete", content)
            updated = True

    # 2. 更新表格中的状态（如果有表格）
    for stage_num in completed_stages:
        pattern = r"(\| 阶段 " + str(stage_num) + r" \| [^\|]+ \| )(pending|in_progress)(\|)"
        if re.search(pattern, content):
            content = re.sub(pattern, r"\1✅ complete\3", content)
            updated = True

    if updated:
        with open(progress_path, "w", encoding="utf-8") as f:
            f.write(content)

    return completed_stages


def complete_stage(
    task_id: str,
    temp_dir: str,
    stage_num: int,
    stage_desc: str,
    next_action: str,
) -> None:
    """将指定阶段标记为 complete，自动追溯修复之前未更新的阶段"""

    base_dir = os.path.join(temp_dir, task_id)
    plan_path = os.path.join(base_dir, "task_plan.md")
    progress_path = os.path.join(base_dir, "progress.md")

    if not os.path.exists(plan_path):
        print(f"[ERROR] task_plan.md 不存在: {plan_path}")
        sys.exit(1)

    # 读取所有阶段信息
    with open(plan_path, "r", encoding="utf-8") as f:
        plan_content = f.read()

    all_stages = get_all_stages(plan_content)
    total_stages = max(all_stages) if all_stages else 0

    # 计算所有需要标记为 complete 的阶段
    completed_stages = list(range(1, stage_num + 1))

    print(f"[INFO] 任务共 {total_stages} 个阶段，当前完成到阶段 {stage_num}")
    print(f"[INFO] 将自动追溯更新阶段: {completed_stages}")

    # 1. 修复 task_plan.md
    updated_in_plan = fix_task_plan(plan_path, completed_stages, total_stages)
    if updated_in_plan:
        print(f"[OK] task_plan.md 已更新: 阶段 {updated_in_plan} -> complete")
    else:
        print(f"[WARN] task_plan.md 无需更新或更新失败")

    # 2. 修复 progress.md
    updated_in_progress = fix_progress(progress_path, completed_stages)
    if updated_in_progress:
        print(f"[OK] progress.md 已更新: 阶段 {updated_in_progress} -> complete")

    # 3. 追加日志
    now = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    log = f"""
### {now}
- [完成] 阶段 {stage_num} - {stage_desc}
- 下一步：{next_action}
"""
    with open(progress_path, "a", encoding="utf-8") as f:
        f.write(log)
    print(f"[OK] progress.md 已追加日志")


if __name__ == "__main__":
    if len(sys.argv) < 6:
        print("用法：python complete_stage.py <task_id> <temp_dir> <阶段序号> \"<阶段描述>\" \"<下一步行动>\"")
        sys.exit(1)

    task_id = sys.argv[1]
    temp_dir = sys.argv[2]
    stage_num = int(sys.argv[3])
    stage_desc = sys.argv[4]
    next_action = sys.argv[5]
    complete_stage(task_id, temp_dir, stage_num, stage_desc, next_action)
