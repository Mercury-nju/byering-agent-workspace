# -*- coding: utf-8 -*-
"""在 DOCX 文档中为指定文本添加批注（创建批注内容 + 插入标记，一步完成）。

Usage:
    python add_comment_mark.py <unpacked_dir> --text "目标文本" --comment "批注内容"
    python add_comment_mark.py <unpacked_dir> --text "赶集" --comment "错题" --author yyb
    python add_comment_mark.py <unpacked_dir> --text "赶集" --comment "错题" --id 5
    python add_comment_mark.py <unpacked_dir> --text "赶集" --comment "错题" --first

该脚本自动完成以下操作：
1. 调用 comment.py 的 add_comment 创建批注内容（处理 comments.xml 等多文件更新）
2. 在 document.xml 中定位包含目标文本的段落
3. 在目标文本所在的 <w:r> 元素前后插入 commentRangeStart/End 和 commentReference 标记

默认标注文档中所有出现的目标文本。使用 --first 参数时，仅标注第一次出现。
"""

import argparse
import re
import sys
from pathlib import Path

from comment import add_comment
from insert_xml import _find_text_positions, _match_text


def _get_next_comment_id(unpacked_dir: Path) -> int:
    """获取下一个可用的批注 ID。

    扫描 document.xml 中已有的 commentRangeStart id，返回 max + 1。
    如果没有已有批注，返回 0。

    :param unpacked_dir: 解包目录路径
    :return: 下一个可用的批注 ID
    """
    doc_path = unpacked_dir / "word" / "document.xml"
    if not doc_path.exists():
        return 0

    content = doc_path.read_text(encoding="utf-8")
    ids = [
        int(m.group(1))
        for m in re.finditer(r'<w:commentRangeStart\s+w:id="(\d+)"', content)
    ]

    # 同时检查 comments.xml 中已有的 comment id
    comments_path = unpacked_dir / "word" / "comments.xml"
    if comments_path.exists():
        comments_content = comments_path.read_text(encoding="utf-8")
        ids.extend(
            int(m.group(1))
            for m in re.finditer(r'<w:comment\s+w:id="(\d+)"', comments_content)
        )

    return max(ids) + 1 if ids else 0


def _match_text_all(
    paragraphs: list[tuple[int, int, str]],
    target: str,
) -> list[tuple[int, int, str]]:
    """返回所有包含目标文本的段落。

    与 _match_text 不同，本函数返回所有匹配段落而非仅第一个。
    仅使用"包含匹配"策略（段落文本包含目标文本）。

    :param paragraphs: _find_text_positions 返回的段落列表
    :param target: 用户指定的文本
    :return: 所有包含目标文本的段落列表
    """
    target_stripped = target.strip()
    return [p for p in paragraphs if target_stripped in p[2]]


def _find_runs_containing_text(
    para_xml: str,
    target_text: str,
) -> tuple[list[tuple[int, int, str]], int] | tuple[list, None]:
    """在段落 XML 中查找包含目标文本的最短连续 run 序列。

    目标文本可能分散在多个 <w:r> 中（如"赶集"被拆成"赶"和"集"两个 run），
    本函数找到覆盖目标文本的最小连续 run 序列，并返回目标文本在拼接文本中的偏移。

    :param para_xml: 段落的完整 XML 字符串
    :param target_text: 要查找的目标文本
    :return: (匹配的 run 列表, 目标文本在拼接文本中的起始偏移)
             run 列表每项为 (run_start, run_end, run_text)
             run_start/run_end 是相对于 para_xml 的偏移量；
             如果未找到，返回 ([], None)
    """
    # 提取所有 <w:r>...</w:r> 的位置和文本
    runs = []
    for m in re.finditer(r'<w:r[\s>].*?</w:r>', para_xml, re.DOTALL):
        run_xml = m.group(0)
        # 提取该 run 中的文本（可能有多个 <w:t>）
        texts = re.findall(r'<w:t[^>]*>(.*?)</w:t>', run_xml)
        run_text = "".join(texts)
        if run_text:
            runs.append((m.start(), m.end(), run_text))

    if not runs:
        return [], None

    # 用滑动窗口找到覆盖目标文本的最短连续 run 序列
    best_match: list[tuple[int, int, str]] | None = None
    best_offset: int | None = None
    for start_idx in range(len(runs)):
        combined_text = ""
        for end_idx in range(start_idx, len(runs)):
            combined_text += runs[end_idx][2]
            pos = combined_text.find(target_text)
            if pos != -1:
                candidate = list(runs[start_idx:end_idx + 1])
                if best_match is None or len(candidate) < len(best_match):
                    best_match = candidate
                    best_offset = pos
                break

    if best_match is None:
        return [], None
    return best_match, best_offset


def _find_all_runs_containing_text(
    para_xml: str,
    target_text: str,
) -> list[tuple[list[tuple[int, int, str]], int]]:
    """在段落 XML 中查找所有包含目标文本的不重叠连续 run 序列。

    与 _find_runs_containing_text 不同，本函数返回段落内所有匹配位置，
    而非仅第一个。每个匹配是 (run 列表, 目标文本在拼接文本中的起始偏移)。

    :param para_xml: 段落的完整 XML 字符串
    :param target_text: 要查找的目标文本
    :return: 匹配列表，每项为 (run_list, text_offset)；
             如果未找到，返回空列表
    """
    # 提取所有 <w:r>...</w:r> 的位置和文本
    runs: list[tuple[int, int, str]] = []
    for m in re.finditer(r'<w:r[\s>].*?</w:r>', para_xml, re.DOTALL):
        run_xml = m.group(0)
        texts = re.findall(r'<w:t[^>]*>(.*?)</w:t>', run_xml)
        run_text = "".join(texts)
        if run_text:
            runs.append((m.start(), m.end(), run_text))

    if not runs:
        return []

    # 构建全局文本和每个字符到 run 索引的映射
    full_text = "".join(r[2] for r in runs)
    target_len = len(target_text)
    results: list[tuple[list[tuple[int, int, str]], int]] = []

    # 查找所有不重叠的匹配
    search_start = 0
    while search_start <= len(full_text) - target_len:
        pos = full_text.find(target_text, search_start)
        if pos == -1:
            break

        target_end = pos + target_len

        # 确定覆盖 [pos, target_end) 的 run 范围
        char_offset = 0
        start_run_idx = None
        end_run_idx = None
        for idx, (__, __, run_text) in enumerate(runs):
            run_start_char = char_offset
            run_end_char = char_offset + len(run_text)
            if start_run_idx is None and run_end_char > pos:
                start_run_idx = idx
            if run_end_char >= target_end:
                end_run_idx = idx
                break
            char_offset += len(run_text)

        if start_run_idx is not None and end_run_idx is not None:
            matched_runs = list(runs[start_run_idx:end_run_idx + 1])
            # text_offset 是目标文本在匹配 run 序列拼接文本中的偏移
            prefix_len = sum(len(r[2]) for r in runs[:start_run_idx])
            text_offset = pos - prefix_len
            results.append((matched_runs, text_offset))

        # 从当前匹配之后继续搜索
        search_start = target_end

    return results


def _extract_rpr(run_xml: str) -> str:
    """从 <w:r> XML 中提取 <w:rPr>...</w:rPr> 块。

    :param run_xml: 完整的 <w:r>...</w:r> XML 字符串
    :return: <w:rPr>...</w:rPr> 字符串，如果不存在则返回空字符串
    """
    m = re.search(r'<w:rPr>.*?</w:rPr>', run_xml, re.DOTALL)
    return m.group(0) if m else ""


def _build_run_xml(rpr: str, text: str) -> str:
    """构建一个 <w:r> XML 元素。

    :param rpr: <w:rPr>...</w:rPr> 字符串（可为空）
    :param text: 文本内容
    :return: 完整的 <w:r>...</w:r> XML 字符串
    """
    space_attr = ' xml:space="preserve"' if text != text.strip() else ""
    if rpr:
        return f"<w:r>{rpr}<w:t{space_attr}>{text}</w:t></w:r>"
    return f"<w:r><w:t{space_attr}>{text}</w:t></w:r>"


def _insert_comment_markers(
    content: str,
    para_start: int,
    para_end: int,
    target_text: str,
    comment_id: int,
) -> str:
    """在 document.xml 中为目标文本插入批注范围标记。

    当目标文本只是某个 run 的一部分时（如 run 文本为"）赶"但目标是"赶"），
    会自动拆分 run，使批注精确覆盖目标文本。

    :param content: document.xml 的完整内容
    :param para_start: 目标段落的起始位置
    :param para_end: 目标段落的结束位置
    :param target_text: 要标注的目标文本
    :param comment_id: 批注 ID
    :return: 修改后的 document.xml 内容
    """
    para_xml = content[para_start:para_end]

    # 在段落内查找包含目标文本的 run 序列
    matching_runs, text_offset = _find_runs_containing_text(para_xml, target_text)
    if not matching_runs or text_offset is None:
        return ""

    # 计算目标文本在各 run 中的分布
    # text_offset 是目标文本在拼接文本中的起始偏移
    # 需要确定首 run 中需要拆分的前缀和尾 run 中需要拆分的后缀
    target_len = len(target_text)
    target_end_offset = text_offset + target_len

    # 构造批注标记
    range_start = f'<w:commentRangeStart w:id="{comment_id}"/>'
    range_end = f'<w:commentRangeEnd w:id="{comment_id}"/>'
    reference = (
        f'<w:r><w:rPr><w:rStyle w:val="CommentReference"/></w:rPr>'
        f'<w:commentReference w:id="{comment_id}"/></w:r>'
    )

    # 构建替换内容：拆分首尾 run + 插入批注标记
    replacement_parts = []
    char_pos = 0  # 当前在拼接文本中的位置

    for i, (run_start, run_end, run_text) in enumerate(matching_runs):
        run_xml = para_xml[run_start:run_end]
        rpr = _extract_rpr(run_xml)
        run_len = len(run_text)
        run_char_start = char_pos
        run_char_end = char_pos + run_len

        # 计算当前 run 中属于目标文本的部分
        overlap_start = max(text_offset, run_char_start) - run_char_start
        overlap_end = min(target_end_offset, run_char_end) - run_char_start

        prefix = run_text[:overlap_start]  # 目标文本之前的部分
        target_part = run_text[overlap_start:overlap_end]  # 属于目标文本的部分
        suffix = run_text[overlap_end:]  # 目标文本之后的部分

        # 添加前缀 run（如果有）
        if prefix:
            replacement_parts.append(_build_run_xml(rpr, prefix))

        # 在第一个包含目标文本的 run 之前插入 commentRangeStart
        if i == 0 or (i > 0 and not any(
            text_offset < char_pos for __, __, __ in matching_runs[:i]
        )):
            if target_part:
                replacement_parts.append(range_start)

        # 添加目标文本部分的 run
        if target_part:
            replacement_parts.append(_build_run_xml(rpr, target_part))

        # 在最后一个包含目标文本的 run 之后插入 commentRangeEnd
        is_last_target_run = target_end_offset <= run_char_end
        if is_last_target_run and target_part:
            replacement_parts.append(range_end)
            replacement_parts.append(reference)

        # 添加后缀 run（如果有）
        if suffix:
            replacement_parts.append(_build_run_xml(rpr, suffix))

        char_pos += run_len

    # 计算绝对位置并替换
    abs_first_run_start = para_start + matching_runs[0][0]
    abs_last_run_end = para_start + matching_runs[-1][1]

    new_content = (
        content[:abs_first_run_start]
        + "\n".join(replacement_parts)
        + content[abs_last_run_end:]
    )

    return new_content


def _collect_all_matches(
    content: str,
    paragraphs: list[tuple[int, int, str]],
    target_text: str,
) -> list[tuple[int, int, str, list[tuple[int, int, str]], int]]:
    """收集文档中目标文本的所有匹配位置。

    遍历所有包含目标文本的段落，在每个段落内查找所有出现位置，
    返回按绝对位置排序的匹配列表。

    :param content: document.xml 的完整内容
    :param paragraphs: _find_text_positions 返回的段落列表
    :param target_text: 要查找的目标文本
    :return: 匹配列表，每项为
             (para_start, para_end, para_text, matching_runs, text_offset)，
             按 para_start + matching_runs[0][0] 升序排列
    """
    target_stripped = target_text.strip()
    all_matches: list[tuple[int, int, str, list[tuple[int, int, str]], int]] = []

    matched_paras = _match_text_all(paragraphs, target_stripped)
    for para_start, para_end, para_text in matched_paras:
        para_xml = content[para_start:para_end]
        run_matches = _find_all_runs_containing_text(para_xml, target_stripped)
        for matched_runs, text_offset in run_matches:
            all_matches.append(
                (para_start, para_end, para_text, matched_runs, text_offset),
            )

    # 按绝对位置升序排列（后续从后往前处理时会反转）
    all_matches.sort(key=lambda m: m[0] + m[3][0][0])
    return all_matches


def _insert_single_comment_markers(
    content: str,
    para_start: int,
    matching_runs: list[tuple[int, int, str]],
    target_text: str,
    text_offset: int,
    comment_id: int,
) -> str:
    """在 document.xml 中为单个匹配位置插入批注范围标记。

    与 _insert_comment_markers 类似，但接受预先计算好的 run 匹配信息，
    避免重复搜索。用于批量插入场景。

    :param content: document.xml 的完整内容
    :param para_start: 目标段落的起始位置
    :param matching_runs: 匹配的 run 列表 [(run_start, run_end, run_text), ...]
    :param target_text: 要标注的目标文本
    :param text_offset: 目标文本在匹配 run 序列拼接文本中的起始偏移
    :param comment_id: 批注 ID
    :return: 修改后的 document.xml 内容，失败时返回空字符串
    """
    para_xml_start = para_start  # 用于计算绝对位置

    target_len = len(target_text)
    target_end_offset = text_offset + target_len

    # 构造批注标记
    range_start = f'<w:commentRangeStart w:id="{comment_id}"/>'
    range_end = f'<w:commentRangeEnd w:id="{comment_id}"/>'
    reference = (
        f'<w:r><w:rPr><w:rStyle w:val="CommentReference"/></w:rPr>'
        f'<w:commentReference w:id="{comment_id}"/></w:r>'
    )

    # 构建替换内容
    replacement_parts: list[str] = []
    char_pos = 0

    for i, (run_start, run_end, run_text) in enumerate(matching_runs):
        run_xml = content[para_xml_start + run_start:para_xml_start + run_end]
        rpr = _extract_rpr(run_xml)
        run_len = len(run_text)
        run_char_start = char_pos
        run_char_end = char_pos + run_len

        overlap_start = max(text_offset, run_char_start) - run_char_start
        overlap_end = min(target_end_offset, run_char_end) - run_char_start

        prefix = run_text[:overlap_start]
        target_part = run_text[overlap_start:overlap_end]
        suffix = run_text[overlap_end:]

        if prefix:
            replacement_parts.append(_build_run_xml(rpr, prefix))

        if i == 0 or (i > 0 and not any(
            text_offset < char_pos for __, __, __ in matching_runs[:i]
        )):
            if target_part:
                replacement_parts.append(range_start)

        if target_part:
            replacement_parts.append(_build_run_xml(rpr, target_part))

        is_last_target_run = target_end_offset <= run_char_end
        if is_last_target_run and target_part:
            replacement_parts.append(range_end)
            replacement_parts.append(reference)

        if suffix:
            replacement_parts.append(_build_run_xml(rpr, suffix))

        char_pos += run_len

    abs_first_run_start = para_xml_start + matching_runs[0][0]
    abs_last_run_end = para_xml_start + matching_runs[-1][1]

    return (
        content[:abs_first_run_start]
        + "\n".join(replacement_parts)
        + content[abs_last_run_end:]
    )


def add_comment_mark(
    unpacked_dir: str,
    target_text: str,
    comment_text: str,
    comment_id: int | None = None,
    author: str = "yyb",
    initials: str = "y",
    parent_id: int | None = None,
    match_all: bool = True,
) -> tuple[bool, str]:
    """在文档中为指定文本添加批注（创建内容 + 插入标记）。

    :param unpacked_dir: 解包目录路径
    :param target_text: 要标注的目标文本
    :param comment_text: 批注内容
    :param comment_id: 批注 ID（可选，不指定则自动分配）
    :param author: 作者名称
    :param initials: 作者缩写
    :param parent_id: 父批注 ID（回复时使用）
    :param match_all: 是否标注所有出现的位置（默认 True，标注所有出现）
    :return: (成功标志, 消息)
    """
    unpacked_path = Path(unpacked_dir)
    doc_path = unpacked_path / "word" / "document.xml"

    if not doc_path.exists():
        return False, f"Error: document.xml not found: {doc_path}"

    content = doc_path.read_text(encoding="utf-8")

    # 定位包含目标文本的段落
    paragraphs = _find_text_positions(content)

    if not match_all:
        # 原有逻辑：只标注第一次出现
        matched = _match_text(paragraphs, target_text)

        if matched is None:
            first_paras = [f"  - {p[2][:80]}" for p in paragraphs[:10]]
            suffix = "\n  ..." if len(paragraphs) > 10 else ""
            return False, (
                f'Error: No paragraph containing "{target_text}" found.\n'
                f"First paragraphs:\n" + "\n".join(first_paras) + suffix
            )

        para_start, para_end, para_text = matched

        # 自动分配批注 ID
        if comment_id is None:
            comment_id = _get_next_comment_id(unpacked_path)

        # 1. 创建批注内容（comments.xml 等）
        para_id, msg = add_comment(
            unpacked_dir,
            comment_id,
            comment_text,
            author=author,
            initials=initials,
            parent_id=parent_id,
        )
        if "Error" in msg:
            return False, msg

        # 2. 在 document.xml 中插入批注范围标记
        new_content = _insert_comment_markers(
            content, para_start, para_end, target_text, comment_id,
        )

        if not new_content:
            return False, (
                f'Error: Found paragraph containing "{target_text}", '
                f"but could not locate the text within <w:r> elements.\n"
                f"Paragraph text: {para_text[:100]}"
            )

        doc_path.write_text(new_content, encoding="utf-8")

        return True, (
            f"Comment {comment_id} added successfully.\n"
            f"  Target text: {target_text}\n"
            f"  Comment: {comment_text}\n"
            f"  Author: {author}\n"
            f"  Paragraph: {para_text[:80]}{'...' if len(para_text) > 80 else ''}"
        )

    # --all 模式：标注所有出现的位置
    all_matches = _collect_all_matches(content, paragraphs, target_text)

    if not all_matches:
        first_paras = [f"  - {p[2][:80]}" for p in paragraphs[:10]]
        suffix = "\n  ..." if len(paragraphs) > 10 else ""
        return False, (
            f'Error: No occurrence of "{target_text}" found in any paragraph.\n'
            f"First paragraphs:\n" + "\n".join(first_paras) + suffix
        )

    # 从后往前处理，避免偏移量错乱
    all_matches.reverse()

    next_id = _get_next_comment_id(unpacked_path)
    if comment_id is not None:
        next_id = comment_id

    success_count = 0
    messages: list[str] = []

    for match in all_matches:
        para_start, para_end, para_text, matching_runs, text_offset = match
        current_id = next_id
        next_id += 1

        # 创建批注内容
        __, msg = add_comment(
            unpacked_dir,
            current_id,
            comment_text,
            author=author,
            initials=initials,
            parent_id=parent_id,
        )
        if "Error" in msg:
            messages.append(f"  [FAIL] id={current_id}: {msg}")
            continue

        # 插入批注范围标记
        new_content = _insert_single_comment_markers(
            content,
            para_start,
            matching_runs,
            target_text,
            text_offset,
            current_id,
        )

        if not new_content:
            messages.append(
                f"  [FAIL] id={current_id}: Could not locate runs in paragraph: "
                f"{para_text[:60]}",
            )
            continue

        content = new_content
        success_count += 1
        messages.append(
            f"  [OK] id={current_id}, paragraph: "
            f"{para_text[:60]}{'...' if len(para_text) > 60 else ''}",
        )

    doc_path.write_text(content, encoding="utf-8")

    # 反转消息列表，使其按文档顺序显示
    messages.reverse()

    total = len(all_matches)
    summary = (
        f"Batch comment completed: {success_count}/{total} occurrences annotated.\n"
        f"  Target text: {target_text}\n"
        f"  Comment: {comment_text}\n"
        f"  Author: {author}\n"
        f"Details:\n" + "\n".join(messages)
    )

    return success_count > 0, summary


def main():
    """主函数。"""
    parser = argparse.ArgumentParser(
        description="在 DOCX 文档中为指定文本添加批注（创建批注 + 插入标记，一步完成）",
    )
    parser.add_argument("unpacked_dir", help="解包后的 DOCX 目录路径")
    parser.add_argument(
        "--text",
        required=True,
        help="要标注的目标文本（在文档中搜索包含此文本的段落）",
    )
    parser.add_argument(
        "--comment",
        required=True,
        help="批注内容（支持预转义的 XML 实体）",
    )
    parser.add_argument(
        "--id",
        type=int,
        default=None,
        help="批注 ID（可选，不指定则自动分配）",
    )
    parser.add_argument(
        "--author",
        default="yyb",
        help="作者名称（默认 yyb）",
    )
    parser.add_argument(
        "--initials",
        default="y",
        help="作者缩写（默认 y）",
    )
    parser.add_argument(
        "--parent",
        type=int,
        default=None,
        help="父批注 ID（回复时使用）",
    )
    parser.add_argument(
        "--all",
        action="store_true",
        dest="match_all_flag",
        default=False,
        help="（已废弃，默认即标注所有出现位置）保留此参数以兼容旧用法",
    )
    parser.add_argument(
        "--first",
        action="store_true",
        dest="first_only",
        help="仅标注文档中第一次出现的目标文本（默认标注所有出现位置）",
    )

    args = parser.parse_args()

    # 默认标注所有出现位置；--first 时仅标注第一次
    match_all = not args.first_only

    success, msg = add_comment_mark(
        args.unpacked_dir,
        args.text,
        args.comment,
        comment_id=args.id,
        author=args.author,
        initials=args.initials,
        parent_id=args.parent,
        match_all=match_all,
    )

    print(msg)
    if not success:
        sys.exit(1)


if __name__ == "__main__":
    main()
