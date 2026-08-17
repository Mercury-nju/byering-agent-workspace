"""
Planning with Files - 存盘发现脚本
每完成 2 次工具调用后，将本次发现追加写入 findings.md。

用法：python save_findings.py <task_id> "<发现内容>"

示例：
    python save_findings.py invoice_fill_20260302 "发现发票共 23 张，均为 PDF 格式，路径在 D:\\发票\\2026年1月\\"
"""

import os
import sys
import datetime

# 强制 stdout 使用 UTF-8，避免 Windows GBK 终端的 UnicodeEncodeError
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')


def save_findings(task_id: str, temp_dir: str, content: str) -> None:
    """将发现内容追加写入 findings.md。

    Args:
        task_id: 任务唯一标识
        temp_dir: 中间产物目录路径，由调用方 prompt 传入
        content: 本次发现的关键信息
    """
    base_dir = os.path.join(temp_dir, task_id)
    findings_path = os.path.join(base_dir, "findings.md")

    if not os.path.exists(findings_path):
        print(f"[ERROR] findings.md 不存在，请先运行 init_task.py 初始化任务（task_id={task_id}）")
        sys.exit(1)

    now = datetime.datetime.now().strftime("%H:%M:%S")
    entry = f"""
---
## 发现 [{now}]
{content}
"""

    with open(findings_path, "a", encoding="utf-8") as f:
        f.write(entry)

    print(f"[OK] 发现已存盘 [{now}]：{content[:60]}{'...' if len(content) > 60 else ''}")


if __name__ == "__main__":
    if len(sys.argv) < 4:
        print("用法：python save_findings.py <task_id> <temp_dir> \"<发现内容>\"")
        sys.exit(1)

    task_id = sys.argv[1]
    temp_dir = sys.argv[2]
    content = sys.argv[3]
    save_findings(task_id, temp_dir, content)
