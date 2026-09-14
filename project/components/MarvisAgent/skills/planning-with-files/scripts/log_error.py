"""
Planning with Files - 错误记录脚本
遇到错误时，将错误信息追加到 task_plan.md 的错误记录表，并写入 progress.md。

用法：python log_error.py <task_id> "<错误描述>" "<解决方案>"

示例：
    python log_error.py invoice_fill_20260302 "发票 PDF 无法解析，文件损坏" "跳过该文件，记录文件名待人工处理"
"""

import os
import sys
import datetime

# 强制 stdout 使用 UTF-8，避免 Windows GBK 终端的 UnicodeEncodeError
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')


def log_error(
    task_id: str,
    temp_dir: str,
    error_desc: str,
    solution: str,
) -> None:
    """将错误信息追加到 task_plan.md 的错误记录表，并写入 progress.md。

    Args:
        task_id: 任务唯一标识
        temp_dir: 中间产物目录路径，由调用方 prompt 传入
        error_desc: 错误描述
        solution: 解决方案或处理方式
    """
    base_dir = os.path.join(temp_dir, task_id)
    plan_path = os.path.join(base_dir, "task_plan.md")
    progress_path = os.path.join(base_dir, "progress.md")

    if not os.path.exists(plan_path):
        print(f"[ERROR] task_plan.md 不存在，请先运行 init_task.py 初始化任务（task_id={task_id}）")
        sys.exit(1)

    now = datetime.datetime.now()
    time_str = now.strftime("%H:%M")
    datetime_str = now.strftime("%Y-%m-%d %H:%M:%S")

    # 追加到 task_plan.md 错误记录表（列：错误 | 尝试次数 | 解决方案）
    error_row = f"| {error_desc} | 1 | {solution} |\n"
    with open(plan_path, "a", encoding="utf-8") as f:
        f.write(error_row)

    # 追加到 progress.md
    log = f"""
### {datetime_str}
- [ERROR] 错误：{error_desc}
- [方案] 解决方案：{solution}
"""
    with open(progress_path, "a", encoding="utf-8") as f:
        f.write(log)

    print(f"[OK] 错误已记录 [{time_str}]：{error_desc[:60]}{'...' if len(error_desc) > 60 else ''}")


if __name__ == "__main__":
    if len(sys.argv) < 5:
        print("用法：python log_error.py <task_id> <temp_dir> \"<错误描述>\" \"<解决方案>\"")
        print("示例：python log_error.py invoice_fill_20260302 \"C:\\AgentWork\\temp\" \"PDF 无法解析\" \"跳过该文件\"")
        sys.exit(1)

    task_id = sys.argv[1]
    temp_dir = sys.argv[2]
    error_desc = sys.argv[3]
    solution = sys.argv[4]
    log_error(task_id, temp_dir, error_desc, solution)
