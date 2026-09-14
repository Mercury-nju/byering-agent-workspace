#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""通用元素删除脚本：从解包后的 DOCX 文档中删除指定类型的元素。

支持删除的目标类型：
- image   : 包含图片的段落（<w:drawing> 或 <v:imagedata>）
- table   : 表格（<w:tbl>）
- paragraph : 段落（<w:p>）
- page    : 整页所有内容

支持的定位方式：
- --page N / --page last : 按页码定位
- --after-text TEXT      : 指定文本之后的第一个目标元素
- --after-heading TEXT   : 指定标题之后的第一个目标元素
- --before-text TEXT     : 指定文本之前的最后一个目标元素
- --before-heading TEXT  : 指定标题之前的最后一个目标元素
- --first / --last       : 文档中第一个/最后一个目标元素
- --nth N                : 文档中第 N 个目标元素（1-based）

Usage:
    python delete_element.py <unpacked_dir> --target <TYPE> [定位参数] [选项]

Examples:
    # 删除最后一页的图片
    python delete_element.py unpacked/ --target image --page last

    # 删除第三页的表格
    python delete_element.py unpacked/ --target table --page 3

    # 删除"2024-2025学年度第二学期"后的图片
    python delete_element.py unpacked/ --target image --after-text "2024-2025学年度第二学期"

    # 删除文档最末尾的段落
    python delete_element.py unpacked/ --target paragraph --last

    # 删除第三页所有内容
    python delete_element.py unpacked/ --target page --page 3

    # 预览将要删除的内容（不实际修改）
    python delete_element.py unpacked/ --target image --page last --dry-run
"""

import argparse
import re
import sys
from pathlib import Path

# 复用 find_page.py 的页面定位
from find_page import find_page

# 复用 insert_xml.py 的文本/标题定位函数
from insert_xml import (
    _find_heading_positions,
    _find_text_positions,
    _match_heading,
    _match_text,
)


# ──────────────────────────────────────────────────────────────
# body 子元素解析
# ──────────────────────────────────────────────────────────────

def _iter_body_children(content: str) -> list[tuple[int, int, str]]:
    """遍历 <w:body> 的所有直接子元素，返回 (start, end, tag) 列表。

    只识别 body 级别的直接子元素：<w:p>、<w:tbl>、<w:sdt>、<w:sectPr>。
    通过手动匹配开始/结束标签来定位，避免 XML 解析器的命名空间问题。

    :param content: document.xml 的完整文本
    :return: 列表，每项为 (元素起始位置, 元素结束位置, 标签名)
    """
    children = []

    # 找到 <w:body> 的范围
    body_start_match = re.search(r'<w:body[^>]*>', content)
    body_end = content.rfind('</w:body>')
    if not body_start_match or body_end == -1:
        return children

    body_content_start = body_start_match.end()

    # 在 body 范围内查找直接子元素
    # 支持的 body 子元素标签
    tags = ['w:p', 'w:tbl', 'w:sdt', 'w:sectPr']

    pos = body_content_start
    while pos < body_end:
        # 跳过空白
        while pos < body_end and content[pos] in ' \t\n\r':
            pos += 1
        if pos >= body_end:
            break
        if content[pos] != '<':
            pos += 1
            continue

        # 尝试匹配已知的 body 子元素标签
        matched_tag = None
        for tag in tags:
            prefix_full = f'<{tag}>'
            prefix_attr = f'<{tag} '
            if content[pos:pos + len(prefix_full)] == prefix_full:
                matched_tag = tag
                break
            if content[pos:pos + len(prefix_attr)] == prefix_attr:
                matched_tag = tag
                break

        if matched_tag is None:
            # 不是已知的 body 子元素，跳过
            pos += 1
            continue

        elem_start = pos

        # 检查是否是自闭合标签（如 <w:sectPr ... />）
        close_bracket = content.find('>', pos)
        if close_bracket == -1:
            break
        if content[close_bracket - 1] == '/':
            # 自闭合标签
            elem_end = close_bracket + 1
        else:
            # 查找对应的结束标签
            close_tag = f'</{matched_tag}>'
            # 需要处理嵌套（主要是 w:tbl 内部可能有嵌套表格，w:sdt 内部可能有 w:p）
            # 使用计数器跟踪嵌套层级
            depth = 1
            search_pos = close_bracket + 1
            open_pattern = f'<{matched_tag}>'
            open_pattern_attr = f'<{matched_tag} '

            while depth > 0 and search_pos < body_end:
                # 找下一个开始标签或结束标签
                next_open = len(content)
                for pat in (open_pattern, open_pattern_attr):
                    idx = content.find(pat, search_pos)
                    if idx != -1 and idx < next_open:
                        next_open = idx

                next_close = content.find(close_tag, search_pos)

                if next_close == -1:
                    # 找不到结束标签，跳到 body 末尾
                    search_pos = body_end
                    break

                if next_open < next_close:
                    # 先遇到开始标签，嵌套层级 +1
                    depth += 1
                    search_pos = next_open + len(matched_tag) + 2
                else:
                    # 先遇到结束标签，嵌套层级 -1
                    depth -= 1
                    if depth == 0:
                        elem_end = next_close + len(close_tag)
                    else:
                        search_pos = next_close + len(close_tag)

            if depth > 0:
                # 未找到匹配的结束标签，跳过
                pos = close_bracket + 1
                continue

        children.append((elem_start, elem_end, matched_tag))
        pos = elem_end

    return children


# ──────────────────────────────────────────────────────────────
# 元素类型识别
# ──────────────────────────────────────────────────────────────

def _is_image_paragraph(content: str, start: int, end: int) -> bool:
    """判断一个 <w:p> 元素是否包含图片。

    检查段落内是否包含 <w:drawing> 或 <v:imagedata> 标签。

    :param content: document.xml 的完整文本
    :param start: 段落起始位置
    :param end: 段落结束位置
    :return: 是否包含图片
    """
    fragment = content[start:end]
    return '<w:drawing' in fragment or '<v:imagedata' in fragment


def _get_element_text(content: str, start: int, end: int) -> str:
    """提取元素中的文本内容（合并所有 <w:t> 标签）。

    :param content: document.xml 的完整文本
    :param start: 元素起始位置
    :param end: 元素结束位置
    :return: 元素的文本内容
    """
    fragment = content[start:end]
    texts = re.findall(r'<w:t[^>]*>(.*?)</w:t>', fragment)
    return "".join(texts).strip()


def _describe_element(content: str, start: int, end: int, tag: str) -> str:
    """生成元素的简短描述，用于输出信息。

    :param content: document.xml 的完整文本
    :param start: 元素起始位置
    :param end: 元素结束位置
    :param tag: 元素标签名
    :return: 元素描述字符串
    """
    text = _get_element_text(content, start, end)
    # 清理不可打印字符（如 \xa0 不间断空格），避免 Windows GBK 编码输出错误
    text = re.sub(r'[\xa0\u200b\u200c\u200d\ufeff]', ' ', text)
    size = end - start
    if tag == 'w:p':
        if _is_image_paragraph(content, start, end):
            preview = f"[image paragraph, {size} chars]"
        elif text:
            display = text[:60] + ("..." if len(text) > 60 else "")
            preview = f'"{display}"'
        else:
            preview = f"[empty paragraph, {size} chars]"
    elif tag == 'w:tbl':
        # 统计表格行数
        row_count = content[start:end].count('<w:tr')
        preview = f"[table with {row_count} row(s), {size} chars]"
    else:
        preview = f"[{tag}, {size} chars]"
    return preview


# ──────────────────────────────────────────────────────────────
# 搜索范围确定
# ──────────────────────────────────────────────────────────────

def _get_page_range(
    unpacked_dir: str,
    content: str,
    page_num: int | str,
) -> tuple[int, int] | str:
    """获取指定页面的字符范围 [start, end)。

    :param unpacked_dir: 解包后的 DOCX 目录路径
    :param content: document.xml 的完整文本
    :param page_num: 页码（int）或 'last'
    :return: (start, end) 元组，或错误消息字符串
    """
    # 先获取所有页面信息
    all_pages = find_page(unpacked_dir, "all")
    if "error" in all_pages:
        return f"Error: {all_pages['error']}"

    total = all_pages["total_pages"]
    if total == 0:
        return "Error: No pages detected in document"

    # 解析页码
    if page_num == "last":
        target_page = total
    elif isinstance(page_num, str):
        try:
            target_page = int(page_num)
        except ValueError:
            return f"Error: Invalid page number: {page_num}"
    else:
        target_page = page_num

    if target_page < 1 or target_page > total:
        return f"Error: Page {target_page} out of range (1-{total})"

    pages = all_pages["pages"]
    page_marker_pos = pages[target_page - 1]["position"]

    # 页面起始位置：page_marker_pos 指向包含 lastRenderedPageBreak 的
    # <w:p> 段落起始位置。insert_xml.py --page N 在该段落之后插入内容，
    # 所以插入的内容自然在 [page_marker_pos, next_page_marker_pos) 范围内。
    page_start = page_marker_pos

    # 页面结束位置：下一页的起始位置，或 </w:body> 的位置
    if target_page < total:
        page_end = pages[target_page]["position"]
    else:
        body_end = content.rfind('</w:body>')
        page_end = body_end if body_end != -1 else len(content)

    return (page_start, page_end)


# ──────────────────────────────────────────────────────────────
# 核心删除逻辑
# ──────────────────────────────────────────────────────────────

def _find_targets_in_range(
    content: str,
    children: list[tuple[int, int, str]],
    target: str,
    range_start: int,
    range_end: int,
) -> list[tuple[int, int, str]]:
    """在指定范围内查找匹配目标类型的元素。

    :param content: document.xml 的完整文本
    :param children: body 子元素列表
    :param target: 目标类型 (image/table/paragraph/page)
    :param range_start: 搜索范围起始位置
    :param range_end: 搜索范围结束位置
    :return: 匹配的元素列表 [(start, end, tag), ...]
    """
    results = []
    for start, end, tag in children:
        # 元素必须在范围内（至少起始位置在范围内）
        if start < range_start or start >= range_end:
            continue

        # 跳过 sectPr（不应被删除，除非是 page 模式）
        if tag == 'w:sectPr' and target != 'page':
            continue

        if target == 'image':
            if tag == 'w:p' and _is_image_paragraph(content, start, end):
                results.append((start, end, tag))
        elif target == 'table':
            if tag == 'w:tbl':
                results.append((start, end, tag))
        elif target == 'paragraph':
            if tag == 'w:p':
                results.append((start, end, tag))
        elif target == 'page':
            # page 模式：范围内的所有元素（除了 sectPr）
            if tag != 'w:sectPr':
                results.append((start, end, tag))

    return results


def _find_targets_global(
    content: str,
    children: list[tuple[int, int, str]],
    target: str,
) -> list[tuple[int, int, str]]:
    """在整个文档中查找匹配目标类型的元素。

    :param content: document.xml 的完整文本
    :param children: body 子元素列表
    :param target: 目标类型 (image/table/paragraph)
    :return: 匹配的元素列表
    """
    return _find_targets_in_range(content, children, target, 0, len(content))


def _delete_elements(
    content: str,
    elements: list[tuple[int, int, str]],
) -> str:
    """从内容中删除指定的元素列表。

    从后往前删除，避免位置偏移问题。

    :param content: document.xml 的完整文本
    :param elements: 要删除的元素列表 [(start, end, tag), ...]
    :return: 删除后的内容
    """
    # 按起始位置降序排列，从后往前删除
    sorted_elements = sorted(elements, key=lambda e: e[0], reverse=True)
    for start, end, __ in sorted_elements:
        # 删除元素及其后的空白（换行符等）
        after_end = end
        while after_end < len(content) and content[after_end] in ' \t\n\r':
            after_end += 1
        content = content[:start] + content[after_end:]
    return content


def delete_element(
    unpacked_dir: str,
    target: str,
    page: str | None = None,
    after_text: str | None = None,
    after_heading: str | None = None,
    before_text: str | None = None,
    before_heading: str | None = None,
    first: bool = False,
    last: bool = False,
    nth: int | None = None,
    delete_all: bool = False,
    dry_run: bool = False,
) -> str:
    """删除文档中指定类型的元素。

    :param unpacked_dir: 解包后的 DOCX 目录路径
    :param target: 目标类型 (image/table/paragraph/page)
    :param page: 页码（数字字符串或 'last'）
    :param after_text: 在此文本之后查找目标
    :param after_heading: 在此标题之后查找目标
    :param before_text: 在此文本之前查找目标
    :param before_heading: 在此标题之前查找目标
    :param first: 删除第一个匹配的目标
    :param last: 删除最后一个匹配的目标
    :param nth: 删除第 N 个匹配的目标（1-based）
    :param delete_all: 删除范围内所有匹配的目标
    :param dry_run: 预览模式，不实际修改
    :return: 操作结果消息
    """
    doc_path = Path(unpacked_dir) / "word" / "document.xml"
    if not doc_path.exists():
        return f"Error: document.xml not found: {doc_path}"

    content = doc_path.read_text(encoding="utf-8")
    children = _iter_body_children(content)

    if not children:
        return "Error: No body child elements found in document.xml"

    # ── 确定搜索范围并查找目标 ──
    candidates = []
    location_desc = ""

    if page is not None:
        # 按页码定位
        page_range = _get_page_range(unpacked_dir, content, page)
        if isinstance(page_range, str):
            return page_range  # 错误消息
        range_start, range_end = page_range
        display_page = page if page == "last" else str(page)

        if target == 'page':
            # 删除整页：范围内所有非 sectPr 元素
            candidates = _find_targets_in_range(
                content, children, 'page', range_start, range_end,
            )
            location_desc = f"on page {display_page}"
        else:
            candidates = _find_targets_in_range(
                content, children, target, range_start, range_end,
            )
            location_desc = f"on page {display_page}"

    elif after_text is not None or after_heading is not None:
        # 按文本/标题定位：在锚点之后查找
        anchor_text = after_text if after_text is not None else after_heading
        is_heading = after_heading is not None

        if is_heading:
            # 优先搜索 Heading 样式段落
            headings = _find_heading_positions(content)
            matched = _match_heading(headings, anchor_text) if headings else None
            if matched:
                anchor_end = matched[1]
            else:
                # fallback 到所有段落
                paragraphs = _find_text_positions(content)
                text_match = _match_text(paragraphs, anchor_text)
                if text_match:
                    anchor_end = text_match[1]
                else:
                    return f'Error: No heading or paragraph matching "{anchor_text}" found'
        else:
            paragraphs = _find_text_positions(content)
            text_match = _match_text(paragraphs, anchor_text)
            if text_match:
                anchor_end = text_match[1]
            else:
                sample = paragraphs[:10]
                available = "\n".join(f"  - {p[2][:80]}" for p in sample)
                suffix = f"\n  ... and {len(paragraphs) - 10} more" if len(paragraphs) > 10 else ""
                return (
                    f'Error: No paragraph containing "{anchor_text}" found.\n'
                    f"First paragraphs in document:\n{available}{suffix}"
                )

        candidates = _find_targets_in_range(
            content, children, target, anchor_end, len(content),
        )
        location_desc = f'after "{anchor_text[:40]}"'

    elif before_text is not None or before_heading is not None:
        # 按文本/标题定位：在锚点之前查找
        anchor_text = before_text if before_text is not None else before_heading
        is_heading = before_heading is not None

        if is_heading:
            headings = _find_heading_positions(content)
            matched = _match_heading(headings, anchor_text) if headings else None
            if matched:
                anchor_start = matched[0]
            else:
                paragraphs = _find_text_positions(content)
                text_match = _match_text(paragraphs, anchor_text)
                if text_match:
                    anchor_start = text_match[0]
                else:
                    return f'Error: No heading or paragraph matching "{anchor_text}" found'
        else:
            paragraphs = _find_text_positions(content)
            text_match = _match_text(paragraphs, anchor_text)
            if text_match:
                anchor_start = text_match[0]
            else:
                return f'Error: No paragraph containing "{anchor_text}" found'

        candidates = _find_targets_in_range(
            content, children, target, 0, anchor_start,
        )
        location_desc = f'before "{anchor_text[:40]}"'

    elif first or last or nth is not None:
        # 全局定位
        candidates = _find_targets_global(content, children, target)
        if first:
            location_desc = "first in document"
        elif last:
            location_desc = "last in document"
        else:
            location_desc = f"#{nth} in document"
    else:
        return "Error: No location specified. Use --page, --after-text, --first, --last, etc."

    # ── 检查是否找到目标 ──
    if not candidates:
        return f"Error: No {target} found {location_desc}"

    # ── 选择要删除的元素 ──
    if target == 'page':
        # page 模式：删除范围内所有元素
        to_delete = candidates
    elif delete_all:
        to_delete = candidates
    elif first:
        to_delete = [candidates[0]]
    elif last:
        to_delete = [candidates[-1]]
    elif nth is not None:
        if nth < 1 or nth > len(candidates):
            return (
                f"Error: Requested #{nth} {target}, but only "
                f"{len(candidates)} found in document"
            )
        to_delete = [candidates[nth - 1]]
    else:
        # 默认删除第一个
        to_delete = [candidates[0]]

    # ── 生成描述信息 ──
    descriptions = []
    for start, end, tag in to_delete:
        desc = _describe_element(content, start, end, tag)
        descriptions.append(desc)

    # ── 执行删除或预览 ──
    if dry_run:
        lines = [f"[DRY RUN] Would delete {len(to_delete)} element(s) {location_desc}:"]
        for i, desc in enumerate(descriptions):
            lines.append(f"  {i + 1}. {desc}")
        return "\n".join(lines)

    new_content = _delete_elements(content, to_delete)
    doc_path.write_text(new_content, encoding="utf-8")

    # ── 构建结果消息 ──
    if target == 'page':
        # 统计删除的元素类型
        type_counts = {}
        for __, __, tag in to_delete:
            friendly = {'w:p': 'paragraph', 'w:tbl': 'table', 'w:sdt': 'sdt'}.get(tag, tag)
            type_counts[friendly] = type_counts.get(friendly, 0) + 1
        detail = ", ".join(f"{count} {name}(s)" for name, count in type_counts.items())
        return f"OK: Deleted all content {location_desc}: {detail}"

    if len(to_delete) == 1:
        return f"OK: Deleted 1 {target} {location_desc}: {descriptions[0]}"

    return f"OK: Deleted {len(to_delete)} {target}(s) {location_desc}"


# ──────────────────────────────────────────────────────────────
# CLI
# ──────────────────────────────────────────────────────────────

def main():
    """主函数：解析参数并执行删除操作。"""
    parser = argparse.ArgumentParser(
        description="Delete elements from an unpacked DOCX document",
    )
    parser.add_argument("unpacked_dir", help="Unpacked DOCX directory")
    parser.add_argument(
        "--target",
        "--element-type",
        "--type",
        dest="target",
        required=True,
        choices=["image", "table", "paragraph", "page"],
        help="Type of element to delete (aliases: --element-type, --type)",
    )

    # 定位参数组（互斥）
    location = parser.add_mutually_exclusive_group()
    location.add_argument(
        "--page",
        type=str,
        default=None,
        metavar="N",
        help="Delete element(s) on page N (1-based), or 'last' for the last page",
    )
    location.add_argument(
        "--after-text",
        type=str,
        default=None,
        metavar="TEXT",
        help="Delete the first target element after the paragraph containing TEXT",
    )
    location.add_argument(
        "--after-heading",
        type=str,
        default=None,
        metavar="TEXT",
        help="Delete the first target element after the heading matching TEXT",
    )
    location.add_argument(
        "--before-text",
        type=str,
        default=None,
        metavar="TEXT",
        help="Delete the last target element before the paragraph containing TEXT",
    )
    location.add_argument(
        "--before-heading",
        type=str,
        default=None,
        metavar="TEXT",
        help="Delete the last target element before the heading matching TEXT",
    )
    location.add_argument(
        "--first",
        action="store_true",
        default=False,
        help="Delete the first target element in the document",
    )
    location.add_argument(
        "--last",
        action="store_true",
        default=False,
        help="Delete the last target element in the document",
    )
    location.add_argument(
        "--nth",
        type=int,
        default=None,
        metavar="N",
        help="Delete the Nth target element in the document (1-based)",
    )

    # 选项参数
    parser.add_argument(
        "--all",
        action="store_true",
        default=False,
        dest="delete_all",
        help="Delete ALL matching elements in the specified range (default: only the first one)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        default=False,
        help="Preview mode: show what would be deleted without actually modifying the file",
    )

    args = parser.parse_args()

    # 解析 --page 参数：支持数字和 'last'
    page_value = args.page
    if page_value is not None and page_value != 'last':
        try:
            int(page_value)
        except ValueError:
            print(f"Error: Invalid page number: {page_value}", file=sys.stderr)
            sys.exit(1)

    # --target page 必须配合 --page 使用
    if args.target == 'page' and page_value is None:
        print("Error: --target page requires --page N or --page last", file=sys.stderr)
        sys.exit(1)

    # 检查是否指定了定位参数
    has_location = any([
        page_value is not None,
        args.after_text is not None,
        args.after_heading is not None,
        args.before_text is not None,
        args.before_heading is not None,
        args.first,
        args.last,
        args.nth is not None,
    ])
    if not has_location:
        print(
            "Error: No location specified. Use --page, --after-text, "
            "--after-heading, --first, --last, --nth, etc.",
            file=sys.stderr,
        )
        sys.exit(1)

    result = delete_element(
        unpacked_dir=args.unpacked_dir,
        target=args.target,
        page=page_value,
        after_text=args.after_text,
        after_heading=args.after_heading,
        before_text=args.before_text,
        before_heading=args.before_heading,
        first=args.first,
        last=args.last,
        nth=args.nth,
        delete_all=args.delete_all,
        dry_run=args.dry_run,
    )

    print(result)
    if result.startswith("Error"):
        sys.exit(1)


if __name__ == "__main__":
    main()
