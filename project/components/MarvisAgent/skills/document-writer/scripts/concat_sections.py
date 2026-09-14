#!/usr/bin/env python3
"""拼接 doc-write-ctx-xxx/sections/ 下的章节文件为完整 Markdown 文档。

用法：
    python concat_sections.py <doc_ctx_dir> <output_file> [--title TITLE]

参数：
    doc_ctx_dir     doc-write-ctx-xxx/ 工作目录的路径（必填）
    output_file     输出文件路径（必填）。建议指向 output_dir（结果产物目录）下的 .md 文件，
                    禁止指向 doc_ctx_dir 之内的位置
    --title         可选，文档标题（添加到文档头部）

输出：
    将 sections/ 下的所有 .md 文件按文件名序号排序拼接，
    输出为完整的 Markdown 文档。

注意：
    工作目录的清理由框架统一管理，本脚本不负责清理。
"""

import argparse
import os
import re
import sys
from datetime import datetime


def get_section_order(filename: str) -> int:
    """从文件名中提取序号用于排序。

    支持的命名格式：
    - 01-xxx.md
    - 01_xxx.md
    - 01.xxx.md
    - 01 xxx.md

    Args:
        filename: 文件名（不含路径）。

    Returns:
        序号数字。无法解析时返回 999。
    """
    match = re.match(r"^(\d+)", filename)
    if match:
        return int(match.group(1))
    return 999


def concat_sections(
    doc_ctx_dir: str,
    output_file: str,
    title: str = "",
) -> dict:
    """拼接章节文件为完整文档。

    Args:
        doc_ctx_dir: doc-write-ctx-xxx/ 目录的绝对路径。
        output_file: 输出文件的绝对路径。
        title: 可选的文档标题。

    Returns:
        包含统计信息的字典。
    """
    sections_dir = os.path.join(doc_ctx_dir, "sections")

    if not os.path.isdir(sections_dir):
        print(f"❌ 错误：sections 目录不存在 - {sections_dir}")
        sys.exit(1)

    # 获取所有 .md 文件并按序号排序
    section_files = [
        f for f in os.listdir(sections_dir) if f.endswith(".md")
    ]

    if not section_files:
        print(f"❌ 错误：sections/ 目录下没有找到任何 .md 文件")
        sys.exit(1)

    section_files.sort(key=get_section_order)

    # 拼接内容
    parts = []
    total_chars = 0
    total_words = 0

    # 添加文档头部
    if title:
        parts.append(f"# {title}\n")
        # 添加元信息
        now = datetime.now().strftime("%Y-%m-%d")
        parts.append(f"\n> 📅 生成日期：{now}\n")
        parts.append("\n---\n")

    # 逐个读取并拼接章节
    for i, filename in enumerate(section_files):
        filepath = os.path.join(sections_dir, filename)

        with open(filepath, "r", encoding="utf-8") as f:
            content = f.read().strip()

        if not content:
            print(f"⚠️  跳过空文件：{filename}")
            continue

        # 添加章节间分隔（首个章节不加）
        if i > 0:
            parts.append("\n\n---\n")

        parts.append(f"\n{content}\n")

        # 统计字数
        char_count = len(content)
        # 中文按字符计数，英文按空格分词
        word_count = len(content.replace("\n", " ").split())
        total_chars += char_count
        total_words += word_count

    # 合并为完整文档
    full_document = "\n".join(parts)

    # 确保输出目录存在
    output_dir = os.path.dirname(os.path.abspath(output_file))
    if output_dir:
        os.makedirs(output_dir, exist_ok=True)

    # 写入输出文件
    with open(output_file, "w", encoding="utf-8") as f:
        f.write(full_document)

    # 统计信息
    stats = {
        "section_count": len(section_files),
        "total_chars": total_chars,
        "total_words": total_words,
        "output_file": os.path.abspath(output_file),
    }

    # 输出成功信息
    print(f"✅ 文档拼接完成")
    print(f"📄 输出文件：{stats['output_file']}")
    print(f"📊 统计信息：")
    print(f"   ├── 章节数量：{stats['section_count']} 章")
    print(f"   ├── 总字符数：{stats['total_chars']:,} 字符")
    print(f"   └── 总词数：  {stats['total_words']:,} 词")
    print(f"")
    print(f"📋 章节清单（按顺序）：")
    for i, filename in enumerate(section_files, 1):
        print(f"   {i}. {filename}")

    return stats


def main():
    parser = argparse.ArgumentParser(
        description="拼接 doc-write-ctx-xxx/sections/ 下的章节文件为完整 Markdown 文档"
    )
    parser.add_argument(
        "doc_ctx_dir",
        help="doc-write-ctx-xxx/ 目录的路径",
    )
    parser.add_argument(
        "output_file",
        help="输出文件路径（必填）。建议指向 output_dir 下的 .md，禁止置于 doc_ctx_dir 之内",
    )
    parser.add_argument(
        "--title",
        default="",
        help="可选的文档标题（添加到文档头部）",
    )

    args = parser.parse_args()

    if not os.path.isdir(args.doc_ctx_dir):
        print(f"❌ 错误：工作目录不存在 - {args.doc_ctx_dir}")
        sys.exit(1)

    concat_sections(
        doc_ctx_dir=args.doc_ctx_dir,
        output_file=args.output_file,
        title=args.title,
    )


if __name__ == "__main__":
    main()
