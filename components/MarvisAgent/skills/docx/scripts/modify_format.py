# -*- coding: utf-8 -*-
"""Modify paragraph formatting in an unpacked DOCX document.

Usage:
    python modify_format.py <document_xml> --paragraph <N> [format options]
    python modify_format.py <document_xml> --text "关键词" [format options]
    python modify_format.py <document_xml> --text-all "关键词" [format options]
    python modify_format.py <document_xml> --style "Normal" [format options]
    python modify_format.py <document_xml> --all [format options]

Paragraph selection (mutually exclusive):
    --paragraph N       Select the Nth paragraph (1-based, skips empty paragraphs)
    --text KEYWORD      Select the first paragraph containing KEYWORD
    --text-all KEYWORD  Select ALL paragraphs containing KEYWORD
    --style STYLE       Select all paragraphs with the given style (e.g. Normal, Heading1)
    --all               Select all non-empty paragraphs

Format options:
    --font FONTNAME     Set font (e.g. "微软雅黑", "Arial")
    --size PT           Set font size in points (e.g. 14)
    --bold              Set bold
    --no-bold           Remove bold
    --italic            Set italic
    --no-italic         Remove italic
    --color RRGGBB      Set font color (hex, e.g. FF0000)
    --underline STYLE   Set underline (single, double, wave, etc.)
    --no-underline      Remove underline
    --align ALIGNMENT   Set paragraph alignment (left, center, right, both)
    --line-spacing VAL  Set line spacing (e.g. 1.0, 1.5, 2.0)

Page margin options (document-level, no paragraph selector needed):
    --margin-top CM     Top margin in centimeters (e.g. 2.54)
    --margin-bottom CM  Bottom margin in centimeters (e.g. 2.54)
    --margin-left CM    Left margin in centimeters (e.g. 3.18)
    --margin-right CM   Right margin in centimeters (e.g. 3.18)

Examples:
    # Set paragraph 1 to 微软雅黑, 14pt, bold
    python modify_format.py unpacked/word/document.xml --paragraph 1 --font 微软雅黑 --size 14 --bold

    # Set paragraph containing "第一章" to centered, Arial 16pt
    python modify_format.py unpacked/word/document.xml --text "第一章" --font Arial --size 16 --align center

    # Remove bold from paragraph 3
    python modify_format.py unpacked/word/document.xml --paragraph 3 --no-bold

    # Set ALL paragraphs with style "Normal" to 微软雅黑 12pt
    python modify_format.py unpacked/word/document.xml --style Normal --font 微软雅黑 --size 12

    # Set ALL paragraphs containing "第一章" to bold
    python modify_format.py unpacked/word/document.xml --text-all "第一章" --bold

    # Set ALL non-empty paragraphs to Arial 11pt
    python modify_format.py unpacked/word/document.xml --all --font Arial --size 11

    # Set page margins (document-level, no paragraph selector needed)
    python modify_format.py unpacked/word/document.xml --margin-top 2.54 --margin-bottom 2.54 --margin-left 3.18 --margin-right 3.18

    # Set only top and bottom margins
    python modify_format.py unpacked/word/document.xml --margin-top 2 --margin-bottom 2
"""

import argparse
import re
import sys
from pathlib import Path
from typing import List
from typing import Optional

from lxml import etree


# OOXML 命名空间
NSMAP = {
    "w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
    "w14": "http://schemas.microsoft.com/office/word/2010/wordml",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
}

W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"


def _get_paragraph_text(p_elem: etree._Element) -> str:
    """提取段落中的纯文本内容。"""
    texts = []
    for t in p_elem.iter(f"{W}t"):
        if t.text:
            texts.append(t.text)
    return "".join(texts)


def _find_paragraphs(root: etree._Element) -> List[etree._Element]:
    """获取文档中所有 <w:p> 段落（body 直接子元素和表格内的段落）。"""
    body = root.find(f"{W}body")
    if body is None:
        return []
    return list(body.iter(f"{W}p"))


def _build_style_name_to_id_map(document_xml_path: str) -> dict:
    """读取 styles.xml，构建样式显示名称到样式 ID 的映射。

    中文版 Word 文档的 styleId 通常是本地化的短 ID（如 '1'、'a'、'aa'），
    而 w:name 才是可读的显示名称（如 'heading 1'、'Normal'）。
    此函数构建 {name_lower: styleId} 映射，用于在 styleId 匹配失败时 fallback。

    :param document_xml_path: document.xml 的路径
    :return: {样式显示名称(小写): 样式ID} 的字典，如果 styles.xml 不存在则返回空字典
    """
    styles_path = Path(document_xml_path).parent / "styles.xml"
    if not styles_path.exists():
        return {}

    try:
        parser = etree.XMLParser(remove_blank_text=False, strip_cdata=False)
        styles_tree = etree.parse(str(styles_path), parser)
        styles_root = styles_tree.getroot()
    except etree.XMLSyntaxError:
        return {}

    name_to_id = {}
    for style_elem in styles_root.iter(f"{W}style"):
        style_id = style_elem.get(f"{W}styleId")
        name_elem = style_elem.find(f"{W}name")
        if style_id is not None and name_elem is not None:
            name_val = name_elem.get(f"{W}val")
            if name_val:
                name_to_id[name_val.lower()] = style_id
    return name_to_id


def _get_paragraph_style(p_elem: etree._Element) -> Optional[str]:
    """提取段落的样式名称（如 Normal、Heading1 等）。

    :return: 样式名称字符串，如果没有显式设置样式则返回 None
    """
    ppr = p_elem.find(f"{W}pPr")
    if ppr is None:
        return None
    pstyle = ppr.find(f"{W}pStyle")
    if pstyle is None:
        return None
    return pstyle.get(f"{W}val")


def _find_target_paragraph(
    root: etree._Element,
    paragraph_num: Optional[int],
    text_keyword: Optional[str],
) -> Optional[etree._Element]:
    """根据段落编号或文本关键词定位目标段落。

    :param paragraph_num: 段落编号（1-based，跳过空段落）
    :param text_keyword: 文本关键词（匹配第一个包含该关键词的段落）
    :return: 匹配到的段落元素，或 None
    """
    all_paragraphs = _find_paragraphs(root)

    if paragraph_num is not None:
        # 按段落编号定位（跳过空段落）
        non_empty_idx = 0
        for p in all_paragraphs:
            text = _get_paragraph_text(p)
            if text.strip():
                non_empty_idx += 1
                if non_empty_idx == paragraph_num:
                    return p
        return None

    if text_keyword is not None:
        # 按文本关键词定位（先精确匹配，再忽略空白匹配）
        for p in all_paragraphs:
            text = _get_paragraph_text(p)
            if text_keyword in text:
                return p
        # 去除所有空白后重新匹配（处理数字与中文之间空格差异等情况）
        keyword_collapsed = re.sub(r"\s+", "", text_keyword)
        for p in all_paragraphs:
            text = _get_paragraph_text(p)
            text_collapsed = re.sub(r"\s+", "", text)
            if keyword_collapsed in text_collapsed:
                return p
        return None

    return None


def _find_target_paragraphs(
    root: etree._Element,
    select_all: bool = False,
    style_name: Optional[str] = None,
    text_all_keyword: Optional[str] = None,
    document_xml_path: Optional[str] = None,
) -> List[etree._Element]:
    """根据批量选择条件定位多个目标段落。

    :param select_all: 选择所有非空段落
    :param style_name: 按样式名筛选（如 Normal、Heading1、heading 1）
    :param text_all_keyword: 按文本关键词匹配所有包含该关键词的段落
    :param document_xml_path: document.xml 的路径（用于 fallback 查找 styles.xml）
    :return: 匹配到的段落元素列表
    """
    all_paragraphs = _find_paragraphs(root)
    result = []

    if select_all:
        for p in all_paragraphs:
            text = _get_paragraph_text(p)
            if text.strip():
                result.append(p)
        return result

    if style_name is not None:
        # 按样式 ID 筛选（大小写不敏感匹配）
        style_lower = style_name.lower()
        for p in all_paragraphs:
            p_style = _get_paragraph_style(p)
            if p_style is not None and p_style.lower() == style_lower:
                # 有显式样式且匹配
                result.append(p)
            elif p_style is None and style_lower in ("normal", "a", "正文"):
                # 没有显式设置 pStyle 的段落默认为 Normal 样式
                # 但仅选择非空段落
                text = _get_paragraph_text(p)
                if text.strip():
                    result.append(p)

        # 如果按 styleId 匹配失败，fallback 到按 styles.xml 中的 w:name 显示名称匹配
        # 中文版 Word 的 styleId 是本地化的短 ID（如 '1'、'a'），
        # 而用户传入的可能是显示名称（如 'heading 1'、'Normal'）
        if not result and document_xml_path:
            name_to_id = _build_style_name_to_id_map(document_xml_path)
            real_style_id = name_to_id.get(style_lower)
            if real_style_id is not None and real_style_id.lower() != style_lower:
                # 找到了对应的真实 styleId，重新按 styleId 匹配
                real_id_lower = real_style_id.lower()
                for p in all_paragraphs:
                    p_style = _get_paragraph_style(p)
                    if p_style is not None and p_style.lower() == real_id_lower:
                        result.append(p)

        return result

    if text_all_keyword is not None:
        # 先精确匹配
        for p in all_paragraphs:
            text = _get_paragraph_text(p)
            if text_all_keyword in text:
                result.append(p)
        if result:
            return result
        # 去除所有空白后重新匹配
        keyword_collapsed = re.sub(r"\s+", "", text_all_keyword)
        for p in all_paragraphs:
            text = _get_paragraph_text(p)
            text_collapsed = re.sub(r"\s+", "", text)
            if keyword_collapsed in text_collapsed:
                result.append(p)
        return result

    return result


def _ensure_rpr(r_elem: etree._Element) -> etree._Element:
    """确保 <w:r> 中有 <w:rPr>，没有则创建。返回 <w:rPr> 元素。"""
    rpr = r_elem.find(f"{W}rPr")
    if rpr is None:
        rpr = etree.SubElement(r_elem, f"{W}rPr")
        # 移动到 <w:r> 的第一个子元素位置
        r_elem.remove(rpr)
        r_elem.insert(0, rpr)
    return rpr


def _set_or_remove(parent: etree._Element, tag: str, set_it: bool) -> None:
    """设置或删除一个无属性的标记元素（如 <w:b/>, <w:i/>）。"""
    existing = parent.find(tag)
    if set_it:
        if existing is None:
            etree.SubElement(parent, tag)
        else:
            # 移除 w:val="0" 这种取消格式的写法
            for attr in list(existing.attrib):
                if attr.endswith("}val") or attr == "val" or attr == f"{W}val":
                    del existing.attrib[attr]
    else:
        if existing is not None:
            parent.remove(existing)


def _set_element_val(parent: etree._Element, tag: str, val: Optional[str]) -> None:
    """设置或删除一个有 w:val 属性的元素。"""
    existing = parent.find(tag)
    if val is not None:
        if existing is None:
            existing = etree.SubElement(parent, tag)
        existing.set(f"{W}val", val)
    else:
        if existing is not None:
            parent.remove(existing)


def _set_font(rpr: etree._Element, font_name: str) -> None:
    """设置字体。"""
    rfonts = rpr.find(f"{W}rFonts")
    if rfonts is None:
        rfonts = etree.SubElement(rpr, f"{W}rFonts")
        # 移到 rPr 的第一个位置
        rpr.remove(rfonts)
        rpr.insert(0, rfonts)

    rfonts.set(f"{W}ascii", font_name)
    rfonts.set(f"{W}eastAsia", font_name)
    rfonts.set(f"{W}hAnsi", font_name)
    rfonts.set(f"{W}cs", font_name)


def _set_size(rpr: etree._Element, pt: float) -> None:
    """设置字号（磅 → 半磅）。"""
    half_pt = str(int(pt * 2))
    _set_element_val(rpr, f"{W}sz", half_pt)
    _set_element_val(rpr, f"{W}szCs", half_pt)


def _apply_run_format(
    r_elem: etree._Element,
    font: Optional[str] = None,
    size: Optional[float] = None,
    bold: Optional[bool] = None,
    italic: Optional[bool] = None,
    color: Optional[str] = None,
    underline: Optional[str] = None,
    no_underline: bool = False,
) -> None:
    """对单个 <w:r> 元素应用格式修改。"""
    rpr = _ensure_rpr(r_elem)

    if font is not None:
        _set_font(rpr, font)

    if size is not None:
        _set_size(rpr, size)

    if bold is True:
        _set_or_remove(rpr, f"{W}b", True)
        _set_or_remove(rpr, f"{W}bCs", True)
    elif bold is False:
        _set_or_remove(rpr, f"{W}b", False)
        _set_or_remove(rpr, f"{W}bCs", False)

    if italic is True:
        _set_or_remove(rpr, f"{W}i", True)
        _set_or_remove(rpr, f"{W}iCs", True)
    elif italic is False:
        _set_or_remove(rpr, f"{W}i", False)
        _set_or_remove(rpr, f"{W}iCs", False)

    if color is not None:
        _set_element_val(rpr, f"{W}color", color)

    if underline is not None:
        _set_element_val(rpr, f"{W}u", underline)
    elif no_underline:
        existing_u = rpr.find(f"{W}u")
        if existing_u is not None:
            rpr.remove(existing_u)


def _cm_to_twips(cm: float) -> int:
    """将厘米转换为缇（twips）。1英寸=2.54厘米，1英寸=1440缇。"""
    return int(round(cm / 2.54 * 1440))


def _apply_page_margins(
    root: etree._Element,
    margin_top: Optional[float] = None,
    margin_bottom: Optional[float] = None,
    margin_left: Optional[float] = None,
    margin_right: Optional[float] = None,
) -> str:
    """修改文档的页边距设置。

    页边距存储在 <w:sectPr> 的 <w:pgMar> 元素中。
    单位为缇（twips），1厘米 ≈ 567 缇，1英寸 = 1440 缇。

    :param margin_top: 上边距（厘米）
    :param margin_bottom: 下边距（厘米）
    :param margin_left: 左边距（厘米）
    :param margin_right: 右边距（厘米）
    :return: 操作结果描述
    """
    body = root.find(f"{W}body")
    if body is None:
        return "Error: <w:body> not found in document"

    # 查找最后一个 sectPr（文档的默认节属性）
    sect_pr = body.find(f"{W}sectPr")
    if sect_pr is None:
        # 如果没有 sectPr，创建一个
        sect_pr = etree.SubElement(body, f"{W}sectPr")

    # 查找或创建 pgMar
    pg_mar = sect_pr.find(f"{W}pgMar")
    if pg_mar is None:
        pg_mar = etree.SubElement(sect_pr, f"{W}pgMar")

    changes = []
    if margin_top is not None:
        pg_mar.set(f"{W}top", str(_cm_to_twips(margin_top)))
        changes.append(f"上边距={margin_top}cm")
    if margin_bottom is not None:
        pg_mar.set(f"{W}bottom", str(_cm_to_twips(margin_bottom)))
        changes.append(f"下边距={margin_bottom}cm")
    if margin_left is not None:
        pg_mar.set(f"{W}left", str(_cm_to_twips(margin_left)))
        changes.append(f"左边距={margin_left}cm")
    if margin_right is not None:
        pg_mar.set(f"{W}right", str(_cm_to_twips(margin_right)))
        changes.append(f"右边距={margin_right}cm")

    return f"OK: Modified page margins: {', '.join(changes)}"


def _apply_paragraph_format(
    p_elem: etree._Element,
    align: Optional[str] = None,
    line_spacing: Optional[float] = None,
) -> None:
    """对段落 <w:p> 应用段落级别格式。"""
    if align is None and line_spacing is None:
        return

    ppr = p_elem.find(f"{W}pPr")
    if ppr is None:
        ppr = etree.SubElement(p_elem, f"{W}pPr")
        p_elem.remove(ppr)
        p_elem.insert(0, ppr)

    if align is not None:
        _set_element_val(ppr, f"{W}jc", align)

    if line_spacing is not None:
        spacing = ppr.find(f"{W}spacing")
        if spacing is None:
            spacing = etree.SubElement(ppr, f"{W}spacing")
        # 行距值 = 倍数 * 240
        spacing.set(f"{W}line", str(int(line_spacing * 240)))
        spacing.set(f"{W}lineRule", "auto")


def _format_changes_str(
    font: Optional[str] = None,
    size: Optional[float] = None,
    bold: Optional[bool] = None,
    italic: Optional[bool] = None,
    color: Optional[str] = None,
    underline: Optional[str] = None,
    no_underline: bool = False,
    align: Optional[str] = None,
    line_spacing: Optional[float] = None,
) -> str:
    """构建格式修改的描述字符串。"""
    changes = []
    if font is not None:
        changes.append(f"字体={font}")
    if size is not None:
        changes.append(f"字号={size}pt")
    if bold is True:
        changes.append("加粗")
    elif bold is False:
        changes.append("取消加粗")
    if italic is True:
        changes.append("斜体")
    elif italic is False:
        changes.append("取消斜体")
    if color is not None:
        changes.append(f"颜色=#{color}")
    if underline is not None:
        changes.append(f"下划线={underline}")
    elif no_underline:
        changes.append("取消下划线")
    if align is not None:
        changes.append(f"对齐={align}")
    if line_spacing is not None:
        changes.append(f"行距={line_spacing}倍")
    return ", ".join(changes)


def _apply_format_to_paragraph(
    target_p: etree._Element,
    font: Optional[str] = None,
    size: Optional[float] = None,
    bold: Optional[bool] = None,
    italic: Optional[bool] = None,
    color: Optional[str] = None,
    underline: Optional[str] = None,
    no_underline: bool = False,
    align: Optional[str] = None,
    line_spacing: Optional[float] = None,
) -> int:
    """对单个段落应用格式修改。

    :return: 修改的 run 数量
    """
    runs = target_p.findall(f"{W}r")
    modified_count = 0
    for r in runs:
        # 跳过只包含 commentReference 等非文本 run
        if r.find(f"{W}t") is None and r.find(f"{W}tab") is None:
            continue
        _apply_run_format(
            r,
            font=font,
            size=size,
            bold=bold,
            italic=italic,
            color=color,
            underline=underline,
            no_underline=no_underline,
        )
        modified_count += 1

    # 应用段落级别格式
    _apply_paragraph_format(target_p, align=align, line_spacing=line_spacing)
    return modified_count


def modify_format(
    document_xml_path: str,
    paragraph_num: Optional[int] = None,
    text_keyword: Optional[str] = None,
    select_all: bool = False,
    style_name: Optional[str] = None,
    text_all_keyword: Optional[str] = None,
    font: Optional[str] = None,
    size: Optional[float] = None,
    bold: Optional[bool] = None,
    italic: Optional[bool] = None,
    color: Optional[str] = None,
    underline: Optional[str] = None,
    no_underline: bool = False,
    align: Optional[str] = None,
    line_spacing: Optional[float] = None,
    margin_top: Optional[float] = None,
    margin_bottom: Optional[float] = None,
    margin_left: Optional[float] = None,
    margin_right: Optional[float] = None,
) -> str:
    """修改指定段落（或批量修改多个段落）的格式。

    :param paragraph_num: 段落编号（单段落模式）
    :param text_keyword: 文本关键词，匹配第一个（单段落模式）
    :param select_all: 选择所有非空段落（批量模式）
    :param style_name: 按样式名批量选择（批量模式）
    :param text_all_keyword: 按关键词匹配所有段落（批量模式）
    :param margin_top: 上边距（厘米）
    :param margin_bottom: 下边距（厘米）
    :param margin_left: 左边距（厘米）
    :param margin_right: 右边距（厘米）
    :return: 操作结果消息
    """
    xml_path = Path(document_xml_path)
    if not xml_path.exists():
        return f"Error: File not found: {xml_path}"

    # 使用 lxml 解析 XML
    parser = etree.XMLParser(remove_blank_text=False, strip_cdata=False)
    tree = etree.parse(str(xml_path), parser)
    root = tree.getroot()

    # 页边距是文档级别设置，与段落选择器和段落格式无关
    # 只要有 margin 参数就先处理页边距
    has_margin = any(v is not None for v in [margin_top, margin_bottom, margin_left, margin_right])
    has_paragraph_format = any([
        font is not None,
        size is not None,
        bold is not None,
        italic is not None,
        color is not None,
        underline is not None,
        no_underline,
        align is not None,
        line_spacing is not None,
    ])

    if has_margin:
        margin_result = _apply_page_margins(
            root,
            margin_top=margin_top,
            margin_bottom=margin_bottom,
            margin_left=margin_left,
            margin_right=margin_right,
        )
        # 如果没有段落格式需要修改，直接保存并返回
        if not has_paragraph_format:
            tree.write(
                str(xml_path),
                xml_declaration=True,
                encoding="UTF-8",
                standalone=True,
            )
            return margin_result
        # 如果还有段落格式需要修改，继续往下走（页边距修改会在后续保存时一并写入）

    changes_str = _format_changes_str(
        font=font, size=size, bold=bold, italic=italic,
        color=color, underline=underline, no_underline=no_underline,
        align=align, line_spacing=line_spacing,
    )

    # 判断是批量模式还是单段落模式
    is_batch = select_all or style_name is not None or text_all_keyword is not None

    if is_batch:
        # 批量模式：定位多个段落
        targets = _find_target_paragraphs(
            root,
            select_all=select_all,
            style_name=style_name,
            text_all_keyword=text_all_keyword,
            document_xml_path=document_xml_path,
        )
        if not targets:
            if select_all:
                return "Error: No non-empty paragraphs found in document"
            if style_name is not None:
                return f"Error: No paragraphs with style \"{style_name}\" found"
            if text_all_keyword is not None:
                return f"Error: No paragraphs containing \"{text_all_keyword}\" found"
            return "Error: No matching paragraphs found"

        total_runs = 0
        para_count = 0
        skipped = 0
        for target_p in targets:
            runs = target_p.findall(f"{W}r")
            # 检查是否有文本 run
            has_text_run = any(
                r.find(f"{W}t") is not None or r.find(f"{W}tab") is not None
                for r in runs
            )
            if not has_text_run:
                skipped += 1
                continue
            count = _apply_format_to_paragraph(
                target_p,
                font=font, size=size, bold=bold, italic=italic,
                color=color, underline=underline, no_underline=no_underline,
                align=align, line_spacing=line_spacing,
            )
            total_runs += count
            para_count += 1

        # 保存修改后的 XML
        tree.write(
            str(xml_path),
            xml_declaration=True,
            encoding="UTF-8",
            standalone=True,
        )

        # 构建批量修改报告
        selector_desc = ""
        if select_all:
            selector_desc = "all non-empty paragraphs"
        elif style_name is not None:
            selector_desc = f"paragraphs with style \"{style_name}\""
        elif text_all_keyword is not None:
            selector_desc = f"paragraphs containing \"{text_all_keyword}\""

        skip_info = f" (skipped {skipped} paragraph(s) with no text runs)" if skipped else ""
        return (
            f"OK: Modified {total_runs} run(s) in {para_count} paragraph(s) "
            f"matching {selector_desc}{skip_info}\n"
            f"  Changes: {changes_str}"
        )

    # 单段落模式：定位单个段落
    target_p = _find_target_paragraph(root, paragraph_num, text_keyword)
    if target_p is None:
        if paragraph_num is not None:
            return f"Error: Paragraph {paragraph_num} not found (total non-empty paragraphs may be fewer)"
        if text_keyword is not None:
            return f"Error: No paragraph containing \"{text_keyword}\" found"
        return "Error: No paragraph selector specified"

    # 获取段落文本用于输出
    para_text = _get_paragraph_text(target_p)
    preview = para_text[:50] + "..." if len(para_text) > 50 else para_text

    # 统计修改的 run 数量
    runs = target_p.findall(f"{W}r")
    if not runs:
        return f"Error: Target paragraph has no runs (text content): \"{preview}\""

    # 对段落应用格式
    modified_count = _apply_format_to_paragraph(
        target_p,
        font=font, size=size, bold=bold, italic=italic,
        color=color, underline=underline, no_underline=no_underline,
        align=align, line_spacing=line_spacing,
    )

    # 保存修改后的 XML
    tree.write(
        str(xml_path),
        xml_declaration=True,
        encoding="UTF-8",
        standalone=True,
    )

    return (
        f"OK: Modified {modified_count} run(s) in paragraph: \"{preview}\"\n"
        f"  Changes: {changes_str}"
    )


if __name__ == "__main__":
    p = argparse.ArgumentParser(
        description="Modify paragraph formatting in an unpacked DOCX document.xml",
    )
    p.add_argument("document_xml", help="Path to document.xml file")

    # 段落选择器（互斥，页边距修改时不需要）
    group = p.add_mutually_exclusive_group(required=False)
    group.add_argument(
        "--paragraph",
        type=int,
        help="Paragraph number (1-based, skips empty paragraphs)",
    )
    group.add_argument(
        "--text",
        help="Select first paragraph containing this text",
    )
    group.add_argument(
        "--text-all",
        help="Select ALL paragraphs containing this text",
    )
    group.add_argument(
        "--style",
        help="Select all paragraphs with this style (e.g. Normal, Heading1, Heading2)",
    )
    group.add_argument(
        "--all",
        action="store_true",
        default=False,
        help="Select all non-empty paragraphs",
    )

    # 格式选项
    p.add_argument("--font", help="Font name (e.g. 微软雅黑, Arial)")
    p.add_argument("--size", type=float, help="Font size in points (e.g. 14)")
    p.add_argument("--bold", action="store_true", default=None, help="Set bold")
    p.add_argument("--no-bold", action="store_true", help="Remove bold")
    p.add_argument("--italic", action="store_true", default=None, help="Set italic")
    p.add_argument("--no-italic", action="store_true", help="Remove italic")
    p.add_argument("--color", help="Font color in hex (e.g. FF0000)")
    p.add_argument("--underline", help="Underline style (single, double, wave, etc.)")
    p.add_argument("--no-underline", action="store_true", help="Remove underline")
    p.add_argument(
        "--align",
        choices=["left", "center", "right", "both"],
        help="Paragraph alignment",
    )
    p.add_argument("--line-spacing", type=float, help="Line spacing multiplier (e.g. 1.5)")

    # 页边距选项（文档级别，不需要段落选择器）
    p.add_argument("--margin-top", type=float, help="Top margin in cm (e.g. 2.54)")
    p.add_argument("--margin-bottom", type=float, help="Bottom margin in cm (e.g. 2.54)")
    p.add_argument("--margin-left", type=float, help="Left margin in cm (e.g. 3.18)")
    p.add_argument("--margin-right", type=float, help="Right margin in cm (e.g. 3.18)")

    args = p.parse_args()

    # 判断是否有段落选择器
    has_paragraph_selector = any([
        args.paragraph is not None,
        args.text is not None,
        args.text_all is not None,
        args.style is not None,
        args.all,
    ])

    # 判断是否有页边距参数
    has_margin = any(v is not None for v in [
        args.margin_top, args.margin_bottom,
        args.margin_left, args.margin_right,
    ])

    # 判断是否有段落格式参数
    # 处理 bold/italic 的互斥逻辑
    bold_val = None
    if args.bold:
        bold_val = True
    elif args.no_bold:
        bold_val = False

    italic_val = None
    if args.italic:
        italic_val = True
    elif args.no_italic:
        italic_val = False

    has_paragraph_format = any([
        args.font is not None,
        args.size is not None,
        bold_val is not None,
        italic_val is not None,
        args.color is not None,
        args.underline is not None,
        args.no_underline,
        args.align is not None,
        args.line_spacing is not None,
    ])

    # 验证参数组合：如果有段落格式参数，必须有段落选择器
    if has_paragraph_format and not has_paragraph_selector:
        if not has_margin:
            print(
                "Error: Paragraph format options require a paragraph selector "
                "(--paragraph, --text, --text-all, --style, or --all)",
                file=sys.stderr,
            )
            sys.exit(1)

    # 如果什么参数都没有，报错
    if not has_margin and not has_paragraph_format:
        print("Error: No format options specified", file=sys.stderr)
        sys.exit(1)

    result = modify_format(
        args.document_xml,
        paragraph_num=args.paragraph,
        text_keyword=args.text,
        select_all=args.all,
        style_name=args.style,
        text_all_keyword=args.text_all,
        font=args.font,
        size=args.size,
        bold=bold_val,
        italic=italic_val,
        color=args.color,
        underline=args.underline,
        no_underline=args.no_underline,
        align=args.align,
        line_spacing=args.line_spacing,
        margin_top=args.margin_top,
        margin_bottom=args.margin_bottom,
        margin_left=args.margin_left,
        margin_right=args.margin_right,
    )

    if result.startswith("Error"):
        print(result, file=sys.stderr)
        sys.exit(1)
    else:
        print(result)
