"""
Planning with Files - 断点恢复脚本
对话重置后，读取三个核心文件恢复任务状态。

用法：python restore_state.py <task_id>

示例：
    python restore_state.py invoice_fill_20260302
"""

import os
import sys

# 强制 stdout 使用 UTF-8，避免 Windows GBK 终端的 UnicodeEncodeError
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')


def restore_state(task_id: str, temp_dir: str) -> None:
    """读取三个核心文件，输出完整任务状态。

    Args:
        task_id: 任务唯一标识
        temp_dir: 中间产物目录路径，由调用方 prompt 传入
    """
    base_dir = os.path.join(temp_dir, task_id)

    if not os.path.exists(base_dir):
        print(f"[ERROR] 工作目录不存在（{base_dir}），请先运行 init_task.py 初始化任务")
        sys.exit(1)

    print(f"[INFO] 恢复任务状态：{task_id}")
    print(f"   工作目录：{base_dir}\n")

    files = ["task_plan.md", "findings.md", "progress.md"]
    for fname in files:
        path = os.path.join(base_dir, fname)
        sep = "=" * 50
        if os.path.exists(path):
            with open(path, "r", encoding="utf-8") as f:
                content = f.read()
            print(f"\n{sep}\n{fname}\n{sep}")
            print(content)
        else:
            print(f"\n{sep}\n{fname}\n{sep}")
            print(f"[WARN] 文件不存在，任务可能尚未完整初始化")


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("用法：python restore_state.py <task_id> <temp_dir>")
        print("示例：python restore_state.py invoice_fill_20260302 \"C:\\AgentWork\\temp\"")
        sys.exit(1)

    task_id = sys.argv[1]
    temp_dir = sys.argv[2]
    restore_state(task_id, temp_dir)
