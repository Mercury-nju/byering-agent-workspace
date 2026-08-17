#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Markdown 转 Word 文档工具，基于 pandoc 实现。

用法：
    # 基本转换
    python scripts/md_to_docx.py input.md output.docx

    # 使用模板文档（继承模板的样式定义）
    python scripts/md_to_docx.py input.md output.docx --reference-doc template.docx

    # 生成目录
    python scripts/md_to_docx.py input.md output.docx --toc

    # 指定代码高亮主题
    python scripts/md_to_docx.py input.md output.docx --highlight-style tango

    # 组合使用
    python scripts/md_to_docx.py input.md output.docx --reference-doc template.docx --toc --highlight-style tango

依赖：
    pandoc（命令行工具）
"""

import argparse
import shutil
import subprocess
import sys
from pathlib import Path


def find_pandoc() -> str:
    """查找 pandoc 可执行文件路径。

    :return: pandoc 可执行文件路径
    :raises FileNotFoundError: 找不到 pandoc 时抛出
    """
    pandoc_path = shutil.which("pandoc")
    if pandoc_path is None:
        raise FileNotFoundError(
            "找不到 pandoc，请先安装：\n"
            "  Windows: winget install --id JohnMacFarlane.Pandoc -e\n"
            "  macOS:   brew install pandoc\n"
            "  Linux:   sudo apt install pandoc"
        )
    return pandoc_path


def md_to_docx(
    input_file: str,
    output_file: str,
    reference_doc: str | None = None,
    toc: bool = False,
    toc_depth: int = 3,
    highlight_style: str | None = None,
    extra_args: list[str] | None = None,
) -> Path:
    """将 Markdown 文件转换为 Word 文档。

    :param input_file: 输入 Markdown 文件路径
    :param output_file: 输出 .docx 文件路径
    :param reference_doc: 参考文档模板路径（可选，用于继承样式）
    :param toc: 是否生成目录
    :param toc_depth: 目录深度（默认 3 级）
    :param highlight_style: 代码高亮主题（如 tango、pygments、kate 等）
    :param extra_args: 传递给 pandoc 的额外参数
    :return: 输出文件路径
    :raises FileNotFoundError: 输入文件不存在或找不到 pandoc
    :raises RuntimeError: 转换失败时抛出
    """
    input_path = Path(input_file).resolve()
    output_path = Path(output_file).resolve()

    if not input_path.exists():
        raise FileNotFoundError(f"输入文件不存在: {input_path}")

    if reference_doc is not None:
        ref_path = Path(reference_doc).resolve()
        if not ref_path.exists():
            raise FileNotFoundError(f"参考文档模板不存在: {ref_path}")

    # 确保输出目录存在
    output_path.parent.mkdir(parents=True, exist_ok=True)

    pandoc_path = find_pandoc()

    # 构建 pandoc 命令
    cmd = [
        pandoc_path,
        str(input_path),
        "-o", str(output_path),
        "--from", "markdown",
        "--to", "docx",
        "--standalone",
    ]

    if reference_doc is not None:
        cmd.extend(["--reference-doc", str(Path(reference_doc).resolve())])

    if toc:
        cmd.append("--toc")
        cmd.extend(["--toc-depth", str(toc_depth)])

    if highlight_style is not None:
        cmd.extend(["--highlight-style", highlight_style])

    if extra_args:
        cmd.extend(extra_args)

    # 执行 pandoc
    result = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        encoding="utf-8",
    )

    if result.returncode != 0:
        error_msg = result.stderr.strip() if result.stderr else "未知错误"
        raise RuntimeError(f"pandoc 转换失败: {error_msg}")

    if not output_path.exists():
        raise RuntimeError(f"转换失败：未生成输出文件 {output_path}")

    return output_path


def _parse_args(argv: list[str]) -> argparse.Namespace:
    """解析命令行参数。"""
    parser = argparse.ArgumentParser(
        description="将 Markdown 文件转换为 Word 文档（基于 pandoc）",
    )
    parser.add_argument(
        "input_file",
        help="输入 Markdown 文件路径",
    )
    parser.add_argument(
        "output_file",
        help="输出 .docx 文件路径",
    )
    parser.add_argument(
        "--reference-doc",
        help="参考文档模板路径（.docx），生成的文档将继承模板的样式定义",
    )
    parser.add_argument(
        "--toc",
        action="store_true",
        help="在文档开头生成目录",
    )
    parser.add_argument(
        "--toc-depth",
        type=int,
        default=3,
        help="目录深度（默认 3 级，范围 1-6）",
    )
    parser.add_argument(
        "--highlight-style",
        help="代码高亮主题（如 tango、pygments、kate、monochrome、espresso、haddock）",
    )
    return parser.parse_args(argv)


if __name__ == "__main__":
    args = _parse_args(sys.argv[1:])
    try:
        output = md_to_docx(
            input_file=args.input_file,
            output_file=args.output_file,
            reference_doc=args.reference_doc,
            toc=args.toc,
            toc_depth=args.toc_depth,
            highlight_style=args.highlight_style,
        )
        print(f"转换成功: {output}")
    except Exception as e:
        print(f"转换失败: {e}", file=sys.stderr)
        sys.exit(1)
