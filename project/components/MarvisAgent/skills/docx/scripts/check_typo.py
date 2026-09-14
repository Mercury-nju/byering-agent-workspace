# -*- coding: utf-8 -*-
"""检查 DOCX 文档中的错别字并批量添加批注。

本脚本配合 LLM（AI 大模型）使用，分两步完成错别字检查：

1. extract — 从解包后的 DOCX 中提取纯文本，输出 JSON 供 LLM 分析
2. annotate — 接收 LLM 返回的错别字列表（JSON），批量调用 add_comment_mark 添加批注

Usage:
    # 第 1 步：提取文本
    python check_typo.py extract <unpacked_dir>
    python check_typo.py extract <unpacked_dir> --max-chars 5000

    # 第 2 步：批量批注（从文件读取 JSON）
    python check_typo.py annotate <unpacked_dir> --typos-file typos.json
    python check_typo.py annotate <unpacked_dir> --typos-file typos.json --author "张老师"

    # 第 2 步：批量批注（从命令行传入 JSON）
    python check_typo.py annotate <unpacked_dir> --typos '[{"text":"赶集","comment":"赶紧"}]'

typos JSON 格式：
    [
        {"text": "错别字原文", "comment": "建议修正为"},
        {"text": "另一个错字", "comment": "正确写法"}
    ]
"""

import argparse
import json
import re
import sys
from pathlib import Path

from add_comment_mark import add_comment_mark
from insert_xml import _find_text_positions


def extract_text(unpacked_dir: str, max_chars: int = 0) -> tuple[bool, str]:
    """从解包后的 DOCX 中提取所有段落文本。

    提取 document.xml 中的纯文本内容，输出 JSON 格式，
    供 LLM 分析错别字。

    :param unpacked_dir: 解包目录路径
    :param max_chars: 最大字符数限制（0 表示不限制）
    :return: (成功标志, JSON 字符串或错误消息)
    """
    doc_path = Path(unpacked_dir) / "word" / "document.xml"
    if not doc_path.exists():
        return False, f"Error: document.xml not found: {doc_path}"

    content = doc_path.read_text(encoding="utf-8")
    paragraphs = _find_text_positions(content)

    if not paragraphs:
        return False, "Error: No text content found in document."

    # 构建段落列表
    para_list: list[dict[str, str | int]] = []
    total_chars = 0
    for idx, (__, __, para_text) in enumerate(paragraphs, 1):
        if max_chars > 0 and total_chars + len(para_text) > max_chars:
            break
        para_list.append({
            "index": idx,
            "text": para_text,
        })
        total_chars += len(para_text)

    result = {
        "total_paragraphs": len(paragraphs),
        "extracted_paragraphs": len(para_list),
        "total_chars": total_chars,
        "paragraphs": para_list,
    }

    return True, json.dumps(result, ensure_ascii=False, indent=2)


def _fuzzy_find_in_doc(
    paragraphs: list[tuple[int, int, str]],
    target: str,
) -> str | None:
    """在文档段落文本中模糊查找目标文本，返回文档中实际的文本片段。

    LLM 返回的错别字文本可能与文档中实际存储的文本存在空格差异
    （如 LLM 返回 "yu ān yāng" 但文档中是 "yuān yāng"，
    或 LLM 返回 "纤细（qiān）" 但文档中是 "纤细（ qiān ）"）。

    本函数先尝试精确匹配，失败后尝试空格不敏感匹配：
    将目标文本和段落文本都去除空格后比较，如果匹配成功，
    则从段落原文中提取出对应的实际文本片段。

    :param paragraphs: _find_text_positions 返回的段落列表
    :param target: LLM 返回的错别字文本
    :return: 文档中实际的文本片段，如果找不到则返回 None
    """
    target_stripped = target.strip()

    # 第 1 步：精确匹配（段落文本包含目标文本）
    for __, __, para_text in paragraphs:
        if target_stripped in para_text:
            return target_stripped

    # 第 2 步：空格不敏感匹配
    # 同时处理普通空格和不间断空格（\xa0）
    target_no_space = re.sub(r'[\s\xa0]+', '', target_stripped)
    if not target_no_space:
        return None

    for __, __, para_text in paragraphs:
        para_no_space = re.sub(r'[\s\xa0]+', '', para_text)
        pos = para_no_space.find(target_no_space)
        if pos == -1:
            continue

        # 找到了无空格匹配，现在从原始段落文本中提取对应片段
        # 建立无空格位置到原始位置的映射
        orig_indices: list[int] = []
        for i, ch in enumerate(para_text):
            if ch not in (' ', '\t', '\n', '\r', '\xa0'):
                orig_indices.append(i)

        if pos + len(target_no_space) > len(orig_indices):
            continue

        # 提取原始文本中对应的片段
        start_orig = orig_indices[pos]
        end_orig = orig_indices[pos + len(target_no_space) - 1] + 1
        actual_text = para_text[start_orig:end_orig]

        return actual_text

    return None


def annotate_typos(
    unpacked_dir: str,
    typos: list[dict[str, str]],
    author: str = "yyb",
    initials: str = "y",
) -> tuple[bool, str]:
    """根据错别字列表批量添加批注。

    对每个错别字调用 add_comment_mark，在文档中标注错别字
    并添加修正建议作为批注内容。

    LLM 返回的错别字文本可能与文档中实际存储的文本存在空格差异，
    本函数会先进行模糊匹配修正，再传给 add_comment_mark。

    :param unpacked_dir: 解包目录路径
    :param typos: 错别字列表，每项包含 text（错别字）和 comment（建议修正）
    :param author: 批注作者名称
    :param initials: 作者缩写
    :return: (成功标志, 汇总消息)
    """
    if not typos:
        return False, "Error: typos list is empty."

    # 验证 typos 格式
    for i, typo in enumerate(typos):
        if "text" not in typo:
            return False, f'Error: typos[{i}] missing required field "text".'
        if "comment" not in typo:
            return False, f'Error: typos[{i}] missing required field "comment".'

    # 预加载文档段落文本，用于模糊匹配修正 LLM 返回的文本
    doc_path = Path(unpacked_dir) / "word" / "document.xml"
    if not doc_path.exists():
        return False, f"Error: document.xml not found: {doc_path}"

    content = doc_path.read_text(encoding="utf-8")
    paragraphs = _find_text_positions(content)

    success_count = 0
    fail_count = 0
    messages: list[str] = []

    for typo in typos:
        text = typo["text"]
        comment_text = typo["comment"]
        comment = f"疑似错别字，建议修改为：{comment_text}"

        # 模糊匹配修正：将 LLM 返回的文本映射到文档中实际的文本
        actual_text = _fuzzy_find_in_doc(paragraphs, text)
        if actual_text is None:
            fail_count += 1
            messages.append(
                f'  [FAIL] "{text}" → "{comment_text}": '
                f'No occurrence found (even with fuzzy matching)',
            )
            continue

        if actual_text != text.strip():
            messages.append(
                f'  [INFO] Fuzzy matched: "{text}" → actual: "{actual_text}"',
            )

        ok, msg = add_comment_mark(
            unpacked_dir=unpacked_dir,
            target_text=actual_text,
            comment_text=comment,
            author=author,
            initials=initials,
            match_all=True,
        )

        if ok:
            success_count += 1
            messages.append(f'  [OK] "{text}" → "{comment_text}"')
        else:
            fail_count += 1
            # 提取简短错误信息
            short_msg = msg.split("\n")[0] if "\n" in msg else msg
            messages.append(f'  [FAIL] "{text}" → "{comment_text}": {short_msg}')

    total = len(typos)
    summary = (
        f"Typo check completed: {success_count}/{total} typos annotated"
        f" ({fail_count} failed).\n"
        f"  Author: {author}\n"
        f"Details:\n" + "\n".join(messages)
    )

    return success_count > 0, summary


def _parse_typos(typos_str: str) -> list[dict[str, str]]:
    """解析错别字 JSON 字符串。

    :param typos_str: JSON 字符串
    :return: 错别字列表
    :raises ValueError: JSON 格式错误
    """
    try:
        data = json.loads(typos_str)
    except json.JSONDecodeError as e:
        raise ValueError(f"Invalid JSON: {e}") from e

    if not isinstance(data, list):
        raise ValueError("JSON must be an array of objects.")

    return data


def main():
    """主函数。"""
    parser = argparse.ArgumentParser(
        description="检查 DOCX 文档中的错别字并批量添加批注（配合 LLM 使用）",
    )
    subparsers = parser.add_subparsers(dest="command", help="子命令")

    # extract 子命令
    extract_parser = subparsers.add_parser(
        "extract",
        help="从解包后的 DOCX 中提取纯文本（JSON 格式），供 LLM 分析错别字",
    )
    extract_parser.add_argument(
        "unpacked_dir",
        help="解包后的 DOCX 目录路径",
    )
    extract_parser.add_argument(
        "--max-chars",
        type=int,
        default=0,
        help="最大提取字符数（0 表示不限制，默认不限制）",
    )

    # annotate 子命令
    annotate_parser = subparsers.add_parser(
        "annotate",
        help="根据错别字列表批量添加批注",
    )
    annotate_parser.add_argument(
        "unpacked_dir",
        help="解包后的 DOCX 目录路径",
    )

    # typos 来源：文件或命令行（互斥）
    typos_group = annotate_parser.add_mutually_exclusive_group(required=True)
    typos_group.add_argument(
        "--typos-file",
        help="错别字 JSON 文件路径",
    )
    typos_group.add_argument(
        "--typos",
        help='错别字 JSON 字符串，格式：[{"text":"错字","comment":"正确"}]',
    )

    annotate_parser.add_argument(
        "--author",
        default="yyb",
        help="批注作者名称（默认 yyb）",
    )
    annotate_parser.add_argument(
        "--initials",
        default="y",
        help="作者缩写（默认 y）",
    )

    args = parser.parse_args()

    if args.command is None:
        print(
            "Error: missing subcommand. Must use 'extract' or 'annotate'.\n"
            "\n"
            "Usage:\n"
            "  python check_typo.py extract <unpacked_dir>              "
            "# Step 1: extract text\n"
            "  python check_typo.py annotate <unpacked_dir> --typos '...' "
            "# Step 2: annotate typos\n"
            "\n"
            "Run 'python check_typo.py extract --help' or "
            "'python check_typo.py annotate --help' for details.",
        )
        sys.exit(1)

    if args.command == "extract":
        ok, result = extract_text(args.unpacked_dir, max_chars=args.max_chars)
        print(result)
        if not ok:
            sys.exit(1)

    elif args.command == "annotate":
        # 解析错别字列表
        if args.typos_file:
            typos_path = Path(args.typos_file)
            if not typos_path.exists():
                print(f"Error: typos file not found: {typos_path}")
                sys.exit(1)
            typos_str = typos_path.read_text(encoding="utf-8")
        else:
            typos_str = args.typos

        try:
            typos = _parse_typos(typos_str)
        except ValueError as e:
            print(f"Error: {e}")
            sys.exit(1)

        ok, result = annotate_typos(
            args.unpacked_dir,
            typos,
            author=args.author,
            initials=args.initials,
        )
        print(result)
        if not ok:
            sys.exit(1)


if __name__ == "__main__":
    main()
