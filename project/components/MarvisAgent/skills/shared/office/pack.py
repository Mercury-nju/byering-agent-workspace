"""Pack a directory into a DOCX, PPTX, or XLSX file.

Validates with auto-repair, condenses XML formatting, and creates the Office file.

Usage:
    python pack.py <input_directory> <output_file> [--original <file>] [--validate true|false]

Examples:
    python pack.py unpacked/ output.docx --original input.docx
    python pack.py unpacked/ output.pptx --validate false
"""

import argparse
import io
import os
import shutil
import sys
import tempfile
import zipfile
from pathlib import Path

# Windows 终端默认编码可能不是 UTF-8，强制设置以避免中文路径乱码
if os.name == "nt" and hasattr(sys.stdout, "buffer"):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

import defusedxml.minidom

from validators import DOCXSchemaValidator, PPTXSchemaValidator, RedliningValidator

# 默认作者名（用于修订追踪验证），可被调用方覆盖
DEFAULT_AUTHOR = "Assistant"


# 统一的失败横幅分隔线，保证 LLM / 人类一眼就能识别为失败
_FAIL_BANNER_LINE = "=" * 60


def _format_failure(reason: str, output_file: str | Path) -> str:
    """构造醒目的、不可被误读为成功的失败消息横幅。"""
    return (
        f"{_FAIL_BANNER_LINE}\n"
        f"*** PACK FAILED *** Document was NOT generated\n"
        f"{_FAIL_BANNER_LINE}\n"
        f"Reason: {reason}\n"
        f"OUTPUT FILE NOT CREATED: {output_file}\n"
        f"Action: Fix the errors above and re-run pack.py.\n"
        f"{_FAIL_BANNER_LINE}"
    )


def _format_success(output_file: Path) -> str:
    """构造明确的成功消息，显式告知文件已产出及其绝对路径。"""
    abs_path = output_file.resolve()
    return (
        f"{_FAIL_BANNER_LINE}\n"
        f"PACK SUCCEEDED\n"
        f"{_FAIL_BANNER_LINE}\n"
        f"OUTPUT FILE CREATED: {abs_path}\n"
        f"{_FAIL_BANNER_LINE}"
    )


def pack(
    input_directory: str,
    output_file: str,
    original_file: str | None = None,
    validate: bool = True,
    infer_author_func=None,
) -> tuple[bool, str]:
    """将解包目录重新打包为 Office 文件。

    :returns: (success, message)
        - success: True 表示 output_file 已成功生成；False 表示未生成。
        - message: 用于直接 print 的人类可读消息，失败时必为醒目横幅。
    """
    input_dir = Path(input_directory)
    output_path = Path(output_file)
    suffix = output_path.suffix.lower()

    if not input_dir.is_dir():
        return False, _format_failure(
            f"{input_dir} is not a directory", output_path
        )

    if suffix not in {".docx", ".pptx", ".xlsx"}:
        return False, _format_failure(
            f"{output_file} must be a .docx, .pptx, or .xlsx file", output_path
        )

    if validate and original_file:
        original_path = Path(original_file)
        if original_path.exists():
            success, output = _run_validation(
                input_dir, original_path, suffix, infer_author_func
            )
            if output:
                print(output)
            if not success:
                return False, _format_failure(
                    f"Validation failed for {input_dir}", output_path
                )

    try:
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_content_dir = Path(temp_dir) / "content"
            shutil.copytree(input_dir, temp_content_dir)

            for pattern in ["*.xml", "*.rels"]:
                for xml_file in temp_content_dir.rglob(pattern):
                    _condense_xml(xml_file)

            output_path.parent.mkdir(parents=True, exist_ok=True)
            with zipfile.ZipFile(output_path, "w", zipfile.ZIP_DEFLATED) as zf:
                for f in temp_content_dir.rglob("*"):
                    if f.is_file():
                        zf.write(f, f.relative_to(temp_content_dir))
    except Exception as e:
        # 打包过程中抛出任何异常，同样视为失败（XML 损坏、文件占用等）
        # 若之前已写入了半成品文件，清理掉避免误认为成功产物
        try:
            if output_path.exists():
                output_path.unlink()
        except OSError:
            pass
        return False, _format_failure(f"Packing error: {e}", output_path)

    # 双保险：确认输出文件的确被创建了
    if not output_path.exists():
        return False, _format_failure(
            "Output file was not written to disk", output_path
        )

    return True, _format_success(output_path)


def _run_validation(
    unpacked_dir: Path,
    original_file: Path,
    suffix: str,
    infer_author_func=None,
) -> tuple[bool, str | None]:
    output_lines = []
    validators = []

    if suffix == ".docx":
        author = DEFAULT_AUTHOR
        if infer_author_func:
            try:
                author = infer_author_func(unpacked_dir, original_file)
            except ValueError as e:
                print(f"Warning: {e} Using default author '{DEFAULT_AUTHOR}'.", file=sys.stderr)

        validators = [
            DOCXSchemaValidator(unpacked_dir, original_file),
            RedliningValidator(unpacked_dir, original_file, author=author),
        ]
    elif suffix == ".pptx":
        validators = [PPTXSchemaValidator(unpacked_dir, original_file)]

    if not validators:
        return True, None

    total_repairs = sum(v.repair() for v in validators)
    if total_repairs:
        output_lines.append(f"Auto-repaired {total_repairs} issue(s)")

    success = all(v.validate() for v in validators)

    if success:
        output_lines.append("All validations PASSED!")

    return success, "\n".join(output_lines) if output_lines else None


def _condense_xml(xml_file: Path) -> None:
    try:
        with open(xml_file, encoding="utf-8") as f:
            dom = defusedxml.minidom.parse(f)

        for element in dom.getElementsByTagName("*"):
            if element.tagName.endswith(":t"):
                continue

            for child in list(element.childNodes):
                if (
                    child.nodeType == child.TEXT_NODE
                    and child.nodeValue
                    and child.nodeValue.strip() == ""
                ) or child.nodeType == child.COMMENT_NODE:
                    element.removeChild(child)

        xml_file.write_bytes(dom.toxml(encoding="UTF-8"))
    except Exception as e:
        print(f"ERROR: Failed to parse {xml_file.name}: {e}", file=sys.stderr)
        raise


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Pack a directory into a DOCX, PPTX, or XLSX file"
    )
    parser.add_argument("input_directory", help="Unpacked Office document directory")
    parser.add_argument("output_file", help="Output Office file (.docx/.pptx/.xlsx)")
    parser.add_argument(
        "--original",
        help="Original file for validation comparison",
    )
    parser.add_argument(
        "--validate",
        type=lambda x: x.lower() == "true",
        default=True,
        metavar="true|false",
        help="Run validation with auto-repair (default: true)",
    )
    args = parser.parse_args()

    success, message = pack(
        args.input_directory,
        args.output_file,
        original_file=args.original,
        validate=args.validate,
    )
    print(message)

    if not success:
        # 失败时在 stderr 再打一次精简摘要，便于外层工具 / LLM 捕捉
        print(
            f"[pack.py] FAILED: {args.output_file} was NOT created.",
            file=sys.stderr,
        )
        sys.exit(1)
