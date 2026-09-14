#!/usr/bin/env python3
"""加载子技能规范。

用法:
    python scripts/load_sub_skill.py <name>

示例 (手机):
    python scripts/load_sub_skill.py com.xingin.xhs
示例 (桌面):
    python scripts/load_sub_skill.py steam
"""

import io
import sys
from pathlib import Path

# Windows 兼容：确保 stdout 使用 utf-8
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

# 定位 sub-skills 目录：脚本在 scripts/ 下，references/ 与 scripts/ 同级
SUB_SKILLS_DIR = Path(__file__).resolve().parent.parent / "references"


def main():
    if len(sys.argv) < 2:
        print("用法: python scripts/load_sub_skill.py <name>", file=sys.stderr)
        print(f"可用子技能目录: {SUB_SKILLS_DIR}")
        if SUB_SKILLS_DIR.exists():
            for f in sorted(SUB_SKILLS_DIR.iterdir()):
                if f.is_file() and f.suffix == ".md":
                    print(f"  - {f.stem}")
        sys.exit(1)

    skill_name = sys.argv[1]
    skill_file = SUB_SKILLS_DIR / f"{skill_name}.md"

    if not skill_file.exists():
        print("未找到专属规范，请基于smart-phone-ops的规范操作")
        return

    instructions = skill_file.read_text(encoding="utf-8")

    print(instructions)


if __name__ == "__main__":
    main()
