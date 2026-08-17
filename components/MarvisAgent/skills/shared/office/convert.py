# -*- coding: utf-8 -*-
"""Office 文档格式转换（共享工具脚本）。

供 docx-skill / pptx-skill 降级使用。内部调用 convert_file 的转换引擎，
避免重复维护 COM / LibreOffice / 纯 Python 三级降级链。

用法：
    python convert.py <input_file> <output_file>

示例：
    python convert.py document.docx output.pdf
    python convert.py slides.pptx output.pdf
    python convert.py document.doc output.docx
"""

import argparse
import io
import os
import sys

# Windows 终端 UTF-8
if os.name == "nt" and hasattr(sys.stdout, "buffer"):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

# 确保 marvis-agent 根目录在 sys.path 中，以便 import ai_agent
_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
# shared/office/ → skills/shared/office/ → skills/ → marvis-agent/
_PROJECT_ROOT = os.path.abspath(os.path.join(_SCRIPT_DIR, "..", "..", ".."))
if _PROJECT_ROOT not in sys.path:
    sys.path.insert(0, _PROJECT_ROOT)


def convert(input_path: str, output_path: str) -> bool:
    """执行格式转换。返回 True 成功，False 失败。"""
    from ai_agent.tools.file.convert_file import _do_convert

    output_format = os.path.splitext(output_path)[1].lstrip(".").lower()
    if not output_format:
        print(f"[ERROR] Cannot determine output format from: {output_path}", file=sys.stderr)
        return False

    result = _do_convert(input_path, output_format, output_path)
    status = result.status.value

    if "error" in status.lower():
        msg = result.error_msg or result.output or "Unknown error"
        print(f"[FAILED] {msg}", file=sys.stderr)
        return False

    msg = result.output or ""
    print(msg)
    return True


def main():
    parser = argparse.ArgumentParser(description="Office document format conversion")
    parser.add_argument("input_file", help="Source file path")
    parser.add_argument("output_file", help="Output file path (format inferred from extension)")
    args = parser.parse_args()

    input_path = os.path.abspath(args.input_file)
    output_path = os.path.abspath(args.output_file)

    if not os.path.isfile(input_path):
        print(f"[ERROR] File not found: {input_path}", file=sys.stderr)
        sys.exit(1)

    success = convert(input_path, output_path)
    if not success:
        sys.exit(1)
    else:
        print(f"[OK] Converted: {output_path}")


if __name__ == "__main__":
    main()
