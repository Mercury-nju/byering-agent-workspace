"""
Planning with Files - 任务初始化脚本
用法：python init_task.py <task_id> "<任务目标描述>" "<阶段1描述>" "<阶段2描述>" [<阶段3描述> ...]

示例：
    python init_task.py invoice_fill_20260302 "将上月发票填入报销表" "扫描发票文件" "提取发票字段" "写入报销表"
"""

import os
import sys
import datetime

# 强制 stdout 使用 UTF-8，避免 Windows GBK 终端的 UnicodeEncodeError
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')


def init_task(task_id: str, temp_dir: str, goal: str, stages: list[str]) -> str:
    """初始化任务工作目录，创建三个核心文件。

    Args:
        task_id: 任务唯一标识，建议格式 任务名_日期，如 invoice_fill_20260302
        temp_dir: 中间产物目录路径，由调用方 prompt 传入，禁止自行创建或硬编码
        goal: 任务目标，一句话描述
        stages: 阶段列表，每个元素为一个阶段描述

    Returns:
        工作目录绝对路径
    """
    base_dir = os.path.join(temp_dir, task_id)
    os.makedirs(base_dir, exist_ok=True)

    # 生成阶段块
    stage_blocks = []
    for i, s in enumerate(stages):
        status = "in_progress" if i == 0 else "pending"
        block = (
            f"### 阶段 {i + 1}：{s}\n"
            f"- [ ] 执行阶段 {i + 1} 的具体操作\n"
            f"- [ ] 将发现记录到 findings.md\n"
            f"- **状态：** {status}"
        )
        stage_blocks.append(block)
    stages_text = "\n\n".join(stage_blocks)

    # task_plan.md
    task_plan = f"""# 任务计划：{task_id}

## 目标
{goal}

## 当前阶段
阶段 1

## 阶段划分

{stages_text}

## 关键问题
1. （待填写）

## 决策记录
| 决策 | 依据 |
|------|------|
|      |      |

## 错误记录
| 错误 | 尝试次数 | 解决方案 |
|------|---------|---------|
|      | 1       |         |

## 备注
- 每完成一个阶段，将状态从 `pending` → `in_progress` → `complete`
- 每次重大决策前重新读取本文件（注意力操控）
- 记录所有错误，防止重复犯错
"""

    # findings.md
    findings = """# 研究发现与决策

## 需求清单
（待填写：从用户请求中提取的具体需求）

## 源文件信息
（待填写：文件路径、类型、数量、关键属性）

## 目标文件结构
（待填写：列名、格式、已有数据样本）

## 字段映射表
| 源字段 | 目标字段 | 备注 |
|--------|---------|------|
|        |         |      |

## 研究发现
（待填写：执行过程中的关键发现）

## 技术决策
| 决策 | 依据 |
|------|------|
|      |      |

## 遇到的问题
| 问题 | 解决方案 |
|------|---------|
|      |         |

---
*每完成 2 次 view/search/browse 操作后必须更新本文件*
"""

    # progress.md
    now = datetime.datetime.now()
    date_str = now.strftime("%Y-%m-%d")
    time_str = now.strftime("%Y-%m-%d %H:%M:%S")

    stage_log_blocks = []
    for i, s in enumerate(stages):
        status = "in_progress" if i == 0 else "pending"
        block = (
            f"### 阶段 {i + 1}：{s}\n"
            f"- **状态：** {status}\n"
            f"- 执行操作：\n  -\n"
            f"- 创建/修改的文件：\n  -"
        )
        stage_log_blocks.append(block)
    stage_logs = "\n\n".join(stage_log_blocks)

    progress = f"""# 执行进度日志

## 会话：{date_str}

### 初始化
- **时间：** {time_str}
- 🚀 任务初始化完成
- 目标：{goal}
- 工作目录：{base_dir}

{stage_logs}

## 测试结果
| 测试项 | 输入 | 预期结果 | 实际结果 | 状态 |
|--------|------|---------|---------|------|
|        |      |         |         |      |

## 错误日志
| 时间 | 错误描述 | 尝试次数 | 解决方案 |
|------|---------|---------|---------|
|      |         | 1       |         |

## 5-Question Reboot Check
| 问题 | 答案 |
|------|------|
| 我在哪里？ | 阶段 1 |
| 我要去哪里？ | 阶段 2 ~ {len(stages)} |
| 目标是什么？ | {goal} |
| 我学到了什么？ | 见 findings.md |
| 我做了什么？ | 见上方日志 |

---
*每完成一个阶段或遇到错误后更新本文件*
"""

    with open(os.path.join(base_dir, "task_plan.md"), "w", encoding="utf-8") as f:
        f.write(task_plan)
    with open(os.path.join(base_dir, "findings.md"), "w", encoding="utf-8") as f:
        f.write(findings)
    with open(os.path.join(base_dir, "progress.md"), "w", encoding="utf-8") as f:
        f.write(progress)

    print(f"[OK] 工作目录已创建：{base_dir}")
    print(f"   task_plan.md  - 任务计划（{len(stages)} 个阶段）")
    print(f"   findings.md   - 研究发现仓库")
    print(f"   progress.md   - 执行进度日志（含 5-Question Reboot Check）")
    return base_dir


if __name__ == "__main__":
    if len(sys.argv) < 5:
        print("用法：python init_task.py <task_id> <temp_dir> \"<任务目标>\" \"<阶段1>\" [\"<阶段2>\" ...]")
        print("示例：python init_task.py invoice_fill_20260302 \"C:\\AgentWork\\temp\" \"将上月发票填入报销表\" \"扫描发票文件\" \"提取字段\" \"写入报销表\"")
        sys.exit(1)

    task_id = sys.argv[1]
    temp_dir = sys.argv[2]
    goal = sys.argv[3]
    stages = sys.argv[4:]
    init_task(task_id, temp_dir, goal, stages)
