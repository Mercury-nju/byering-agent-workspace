#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""查找 Word 文档中指定页面或文本的起始位置。

该脚本专门用于在解包后的 DOCX 文档中查找指定页面或文本的位置，
支持各种分页标记类型、按标题搜索和按文本内容搜索。

Usage:
    python find_page.py <unpacked_dir> <page_number>
    python find_page.py <unpacked_dir> --text TEXT
    python find_page.py <unpacked_dir> --heading TEXT

Examples:
    python find_page.py unpacked/ 2      # 查找第 2 页的起始位置
    python find_page.py unpacked/ 1      # 查找第 1 页的起始位置
    python find_page.py unpacked/ all    # 显示所有页面的位置信息
    python find_page.py unpacked/ --text "2024-2025学年度"     # 按文本搜索段落位置
    python find_page.py unpacked/ --heading "第三章"           # 按标题搜索段落位置

输出格式：
    Page <N>: position <start_pos> (line <line_number>)
    XML snippet preview: <preview>
"""

import argparse
import re
import sys
from pathlib import Path


def _find_page_positions(content: str) -> list[int]:
    """分析 document.xml 内容，找到每个"页"的起始位置。

    页边界的判定依据（按优先级）：
    1. 第 1 页 = 文档开头（第一个 <w:p）
    2. <w:lastRenderedPageBreak/> — Word 渲染时记录的软分页位置
    3. <w:br w:type="page"/> — 手动分页符
    4. <w:pageBreakBefore/> — 段落属性中的"段前分页"
    5. <w:sectPr>（非文档末尾的 sectPr）— 分节符也会产生新页

    :param content: document.xml 的完整文本
    :return: 按页码排序的位置列表，positions[0] 是第 1 页起始位置
    """
    page_positions = []

    # 第 1 页：第一个 <w:p 的位置
    first_p = re.search(r'<w:body[^>]*>\s*(<w:p[\s>])', content)
    if first_p:
        page_positions.append(first_p.start(1))

    # 收集所有分页标记的位置
    # 对于每个分页标记，找到其所在的 <w:p> 段落的起始位置
    break_positions = set()

    # <w:lastRenderedPageBreak/> — 软分页（Word 自动插入）
    for m in re.finditer(r'<w:lastRenderedPageBreak\s*/>', content):
        # 找到包含此标记的 <w:p> 段落
        p_start = content.rfind('<w:p ', 0, m.start())
        if p_start == -1:
            p_start = content.rfind('<w:p>', 0, m.start())
        if p_start != -1:
            break_positions.add(p_start)

    # <w:br w:type="page"/> — 手动分页符
    for m in re.finditer(r'<w:br\s+w:type="page"\s*/>', content):
        # 分页符后的内容属于新页，找到下一个 <w:p>
        next_p = re.search(r'<w:p[\s>]', content[m.end():])
        if next_p:
            break_positions.add(m.end() + next_p.start())

    # <w:pageBreakBefore/> — 段落属性中的段前分页
    for m in re.finditer(r'<w:pageBreakBefore\s*/>', content):
        p_start = content.rfind('<w:p ', 0, m.start())
        if p_start == -1:
            p_start = content.rfind('<w:p>', 0, m.start())
        if p_start != -1:
            break_positions.add(p_start)

    # 非末尾的 <w:sectPr>（分节符，出现在 <w:pPr> 内部时表示分节）
    # 先找到文档末尾的 sectPr 位置（</w:body> 前的最后一个），避免对大字符串做 [\s\S]*? 匹配
    body_end_pos = content.rfind('</w:body>')
    last_sect_end = content.rfind('</w:sectPr>', 0, body_end_pos) if body_end_pos != -1 else -1
    for m in re.finditer(r'<w:sectPr\b[^>]*>', content):
        # 跳过文档末尾的 sectPr（直接在 </w:body> 之前的那个）
        sect_end = content.find('</w:sectPr>', m.start())
        if sect_end != -1 and sect_end == last_sect_end:
            continue
        # 找到 sectPr 所在段落之后的下一个 <w:p>
        if sect_end != -1:
            search_start = sect_end + len('</w:sectPr>')
            next_p = re.search(r'<w:p[\s>]', content[search_start:])
            if next_p:
                break_positions.add(search_start + next_p.start())

    # 合并并排序，去掉与第 1 页重复的位置
    for pos in sorted(break_positions):
        if not page_positions or pos > page_positions[0]:
            if pos not in page_positions:
                page_positions.append(pos)

    page_positions.sort()
    return page_positions


def _get_line_number(content: str, position: int) -> int:
    """获取指定位置在文档中的行号。

    :param content: 文档内容
    :param position: 位置索引
    :return: 行号（从1开始）
    """
    return content[:position].count('\n') + 1


def _get_xml_preview(content: str, position: int, length: int = 200) -> str:
    """获取指定位置的XML片段预览。

    :param content: 文档内容
    :param position: 起始位置
    :param length: 预览长度
    :return: XML片段预览
    """
    end_pos = min(position + length, len(content))
    preview = content[position:end_pos]

    # 清理预览内容，移除换行和多余空格
    preview = re.sub(r'\s+', ' ', preview.strip())

    # 如果预览过长，截断并添加省略号
    if len(preview) > 150:
        preview = preview[:150] + '...'

    return preview


def _analyze_page_breaks(content: str) -> dict:
    """分析文档中的分页标记类型和数量。

    :param content: 文档内容
    :return: 分页标记统计信息
    """
    analysis = {
        'last_rendered_page_break': len(list(re.finditer(r'<w:lastRenderedPageBreak\s*/>', content))),
        'manual_page_break': len(list(re.finditer(r'<w:br\s+w:type="page"\s*/>', content))),
        'page_break_before': len(list(re.finditer(r'<w:pageBreakBefore\s*/>', content))),
        'section_breaks': len(list(re.finditer(r'<w:sectPr\b[^>]*>', content))) - 1  # 减去文档末尾的sectPr
    }

    return analysis


def find_page(unpacked_dir: str, page_number: int | str) -> dict:
    """查找指定页面的位置信息。

    :param unpacked_dir: 解包后的DOCX目录路径
    :param page_number: 页码（从1开始）或'all'显示所有页面
    :return: 页面位置信息字典
    """
    unpacked_path = Path(unpacked_dir)
    doc_path = unpacked_path / "word" / "document.xml"

    if not doc_path.exists():
        return {"error": f"document.xml not found: {doc_path}"}

    try:
        content = doc_path.read_text(encoding="utf-8")
    except Exception as e:
        return {"error": f"Failed to read document.xml: {e}"}

    # 查找所有页面位置
    page_positions = _find_page_positions(content)

    if not page_positions:
        return {"error": "No page boundaries found in document.xml"}

    # 分析分页标记
    page_break_analysis = _analyze_page_breaks(content)

    result = {
        "total_pages": len(page_positions),
        "page_break_analysis": page_break_analysis,
        "pages": []
    }

    # 收集所有页面信息
    for i, pos in enumerate(page_positions):
        page_info = {
            "page_number": i + 1,
            "position": pos,
            "line_number": _get_line_number(content, pos),
            "xml_preview": _get_xml_preview(content, pos)
        }
        result["pages"].append(page_info)

    # 处理特定页码请求
    if page_number == "all":
        return result

    try:
        page_num = int(page_number)
        if page_num < 1 or page_num > len(page_positions):
            return {"error": f"Page number {page_num} out of range. Total pages: {len(page_positions)}"}

        # 返回指定页面的信息
        target_page = result["pages"][page_num - 1]
        target_page["total_pages"] = len(page_positions)
        target_page["page_break_analysis"] = page_break_analysis
        return target_page

    except ValueError:
        return {"error": f"Invalid page number: {page_number}"}


def find_text(unpacked_dir: str, target: str, mode: str = "text") -> dict:
    """按文本内容或标题搜索段落位置。

    :param unpacked_dir: 解包后的 DOCX 目录路径
    :param target: 要搜索的文本
    :param mode: 搜索模式，'text' 搜索所有段落，'heading' 优先搜索标题
    :return: 搜索结果字典
    """
    # 延迟导入，避免与 insert_xml 的循环依赖
    from insert_xml import (
        _find_heading_positions,
        _find_text_positions,
        _match_heading,
        _match_text,
    )

    unpacked_path = Path(unpacked_dir)
    doc_path = unpacked_path / "word" / "document.xml"

    if not doc_path.exists():
        return {"error": f"document.xml not found: {doc_path}"}

    try:
        content = doc_path.read_text(encoding="utf-8")
    except Exception as e:
        return {"error": f"Failed to read document.xml: {e}"}

    matched = None
    match_source = ""

    if mode == "heading":
        # 优先搜索 Heading 样式段落
        headings = _find_heading_positions(content)
        heading_match = _match_heading(headings, target) if headings else None
        if heading_match:
            matched = (heading_match[0], heading_match[1], heading_match[3])
            match_source = f"heading [{heading_match[2]}]"

    if matched is None:
        # 搜索所有段落
        paragraphs = _find_text_positions(content)
        text_match = _match_text(paragraphs, target)
        if text_match:
            matched = text_match
            match_source = "paragraph"

    if matched is None:
        # 未找到匹配，返回可用的候选列表
        if mode == "heading":
            headings = _find_heading_positions(content)
            if headings:
                available = [
                    f"  - [{h[2]}] {h[3]}" for h in headings
                ]
                return {
                    "error": (
                        f'No heading or paragraph matching "{target}" found.\n'
                        f"Available headings:\n" + "\n".join(available)
                    ),
                }
        paragraphs = _find_text_positions(content)
        first_paras = [f"  - {p[2][:80]}" for p in paragraphs[:10]]
        suffix = "\n  ..." if len(paragraphs) > 10 else ""
        return {
            "error": (
                f'No paragraph matching "{target}" found.\n'
                f"First paragraphs:\n" + "\n".join(first_paras) + suffix
            ),
        }

    pos_start, pos_end, text = matched
    return {
        "mode": mode,
        "match_source": match_source,
        "text": text,
        "position": pos_start,
        "end_position": pos_end,
        "line_number": _get_line_number(content, pos_start),
        "xml_preview": _get_xml_preview(content, pos_start),
    }


def main():
    """主函数。"""
    parser = argparse.ArgumentParser(
        description="查找 Word 文档中指定页面或文本的起始位置",
    )
    parser.add_argument("unpacked_dir", help="解包后的 DOCX 目录路径")
    parser.add_argument(
        "page_number",
        nargs="?",
        default=None,
        help="页码（从1开始）或'all'显示所有页面",
    )
    parser.add_argument(
        "--text",
        default=None,
        help="按文本内容搜索段落位置（搜索所有段落）",
    )
    parser.add_argument(
        "--heading",
        default=None,
        help="按标题搜索段落位置（优先搜索 Heading 样式，找不到则 fallback 到所有段落）",
    )

    args = parser.parse_args()

    # 参数互斥校验
    search_args = [args.page_number, args.text, args.heading]
    provided = sum(1 for a in search_args if a is not None)
    if provided == 0:
        parser.error("必须指定 page_number、--text 或 --heading 之一")
    if provided > 1 and args.page_number is not None:
        parser.error("page_number 不能与 --text 或 --heading 同时使用")

    # 文本/标题搜索模式
    if args.text is not None or args.heading is not None:
        if args.text is not None:
            result = find_text(args.unpacked_dir, args.text, mode="text")
        else:
            result = find_text(args.unpacked_dir, args.heading, mode="heading")

        if "error" in result:
            print(f"Error: {result['error']}", file=sys.stderr)
            sys.exit(1)

        print(f"Found matching {result['match_source']}:")
        print(f"  Text: {result['text'][:100]}{'...' if len(result['text']) > 100 else ''}")
        print(f"  Position: {result['position']} (line {result['line_number']})")
        print(f"  End position: {result['end_position']}")
        print(f"  XML preview: {result['xml_preview']}")
        return

    # 页码搜索模式（原有逻辑）
    result = find_page(args.unpacked_dir, args.page_number)

    if "error" in result:
        print(f"Error: {result['error']}", file=sys.stderr)
        sys.exit(1)

    if "pages" in result:  # 显示所有页面
        print(f"Total pages detected: {result['total_pages']}")
        print("Page break analysis:")
        analysis = result["page_break_analysis"]
        print(f"  - Last rendered page breaks: {analysis['last_rendered_page_break']}")
        print(f"  - Manual page breaks: {analysis['manual_page_break']}")
        print(f"  - Page break before attributes: {analysis['page_break_before']}")
        print(f"  - Section breaks: {analysis['section_breaks']}")
        print()

        for page_info in result["pages"]:
            print(f"Page {page_info['page_number']}: ")
            print(f"  Position: {page_info['position']} (line {page_info['line_number']})")
            print(f"  XML preview: {page_info['xml_preview']}")
            print()

    else:  # 显示单个页面
        print(f"Page {result['page_number']} of {result['total_pages']}:")
        print(f"  Position: {result['position']} (line {result['line_number']})")
        print(f"  XML preview: {result['xml_preview']}")
        print()
        print("Page break analysis:")
        analysis = result["page_break_analysis"]
        print(f"  - Last rendered page breaks: {analysis['last_rendered_page_break']}")
        print(f"  - Manual page breaks: {analysis['manual_page_break']}")
        print(f"  - Page break before attributes: {analysis['page_break_before']}")
        print(f"  - Section breaks: {analysis['section_breaks']}")


if __name__ == "__main__":
    main()
