# -*- coding: utf-8 -*-
"""Modify style definitions in styles.xml of an unpacked DOCX document.

This script modifies the style-level formatting (in styles.xml), which is equivalent
to right-clicking a style in Word and choosing "Modify Style". All paragraphs using
the modified style will automatically inherit the new formatting.

Additionally, this script automatically scans document.xml to clean up any conflicting
inline formatting (run-level overrides) in paragraphs that use the modified style,
ensuring the style change takes full effect.

For run-level (inline) formatting on specific paragraphs, use modify_format.py instead.

Usage:
    python modify_style.py <unpacked_dir> --style "heading 1" [format options]
    python modify_style.py <unpacked_dir> --style "Normal" --font 微软雅黑 --size 12
    python modify_style.py <unpacked_dir> --style "Heading1" --font 黑体 --size 16 --bold

Style selection:
    --style STYLE       Style name or ID (e.g. "heading 1", "Normal", "Heading1", "1", "a")
                        Supports both styleId and w:name display name (case-insensitive).
                        For Chinese Word documents, styleId is often a localized short ID
                        (e.g. "1" for heading 1, "a" for Normal).

Format options (applied to the style's <w:rPr>):
    --font FONTNAME     Set font (e.g. "微软雅黑", "Arial")
    --size PT           Set font size in points (e.g. 14, 38)
    --bold              Set bold
    --no-bold           Remove bold
    --italic            Set italic
    --no-italic         Remove italic
    --color RRGGBB      Set font color (hex, e.g. FF0000)
    --underline STYLE   Set underline (single, double, wave, etc.)
    --no-underline      Remove underline

Examples:
    # Set heading 1 style to 微软雅黑 38pt (supports display name)
    python modify_style.py unpacked/ --style "heading 1" --font 微软雅黑 --size 38

    # Set Normal style to 宋体 12pt
    python modify_style.py unpacked/ --style Normal --font 宋体 --size 12

    # Set heading 1 bold and red color (using styleId)
    python modify_style.py unpacked/ --style 1 --bold --color FF0000
"""

import argparse
import sys
from pathlib import Path
from typing import List
from typing import Optional
from typing import Set
from typing import Tuple

from lxml import etree

# OOXML 命名空间
W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"


def _find_style_by_name_or_id(
    styles_root: etree._Element,
    style_query: str,
) -> Tuple[Optional[etree._Element], str]:
    """按 styleId 或 w:name 显示名称查找样式元素。

    查找顺序：
    1. 先按 styleId 精确匹配（大小写不敏感）
    2. 如果没找到，再按 w:name 的 val 属性匹配（大小写不敏感）

    :param styles_root: styles.xml 的根元素
    :param style_query: 用户传入的样式名称或 ID
    :return: (样式元素, 匹配方式描述) 或 (None, 错误描述)
    """
    query_lower = style_query.lower()

    # 第一轮：按 styleId 匹配
    for style_elem in styles_root.iter(f"{W}style"):
        style_id = style_elem.get(f"{W}styleId")
        if style_id is not None and style_id.lower() == query_lower:
            name_elem = style_elem.find(f"{W}name")
            display_name = name_elem.get(f"{W}val") if name_elem is not None else style_id
            return style_elem, f"styleId=\"{style_id}\" (name: \"{display_name}\")"

    # 第二轮：按 w:name 显示名称匹配
    for style_elem in styles_root.iter(f"{W}style"):
        name_elem = style_elem.find(f"{W}name")
        if name_elem is not None:
            name_val = name_elem.get(f"{W}val")
            if name_val is not None and name_val.lower() == query_lower:
                style_id = style_elem.get(f"{W}styleId", "unknown")
                return style_elem, f"styleId=\"{style_id}\" (name: \"{name_val}\")"

    return None, f"No style matching \"{style_query}\" found"


def _find_linked_styles(
    styles_root: etree._Element,
    style_elem: etree._Element,
) -> List[etree._Element]:
    """查找与给定样式关联的字符样式（通过 <w:link> 元素）。

    Word 中段落样式（如 heading 1）通常有一个关联的字符样式（如"标题 1 字符"），
    通过 <w:link w:val="styleId"/> 相互链接。修改段落样式时也应修改关联的字符样式，
    否则在 Word 中可能显示不一致。

    :param styles_root: styles.xml 的根元素
    :param style_elem: 主样式元素
    :return: 关联的字符样式元素列表
    """
    linked = []
    link_elem = style_elem.find(f"{W}link")
    if link_elem is not None:
        linked_id = link_elem.get(f"{W}val")
        if linked_id:
            for s in styles_root.iter(f"{W}style"):
                if s.get(f"{W}styleId") == linked_id:
                    linked.append(s)
                    break
    return linked


def _ensure_rpr(style_elem: etree._Element) -> etree._Element:
    """确保样式元素中有 <w:rPr>，没有则创建。返回 <w:rPr> 元素。

    对于样式定义，<w:rPr> 应放在 <w:pPr> 之后（如果存在的话）。
    """
    rpr = style_elem.find(f"{W}rPr")
    if rpr is None:
        rpr = etree.SubElement(style_elem, f"{W}rPr")
    return rpr


def _set_font(rpr: etree._Element, font_name: str) -> None:
    """设置字体。

    同时设置 ascii、eastAsia、hAnsi、cs 四个字体属性。
    会清除对应的 theme 属性（asciiTheme、eastAsiaTheme 等），因为 Word 中
    theme 属性的优先级高于显式字体名称，不清除会导致显式字体不生效。
    """
    rfonts = rpr.find(f"{W}rFonts")
    if rfonts is None:
        rfonts = etree.SubElement(rpr, f"{W}rFonts")
        # 移到 rPr 的第一个位置
        rpr.remove(rfonts)
        rpr.insert(0, rfonts)

    # 先清除 theme 属性，否则 theme 属性优先级高于显式字体名称
    theme_attrs = [
        f"{W}asciiTheme", f"{W}eastAsiaTheme",
        f"{W}hAnsiTheme", f"{W}cstheme",
    ]
    for attr in theme_attrs:
        if attr in rfonts.attrib:
            del rfonts.attrib[attr]

    rfonts.set(f"{W}ascii", font_name)
    rfonts.set(f"{W}eastAsia", font_name)
    rfonts.set(f"{W}hAnsi", font_name)
    rfonts.set(f"{W}cs", font_name)


def _set_size(rpr: etree._Element, pt: float) -> None:
    """设置字号（磅 → 半磅）。"""
    half_pt = str(int(pt * 2))
    _set_element_val(rpr, f"{W}sz", half_pt)
    _set_element_val(rpr, f"{W}szCs", half_pt)


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


def _apply_rpr_format(
    rpr: etree._Element,
    font: Optional[str] = None,
    size: Optional[float] = None,
    bold: Optional[bool] = None,
    italic: Optional[bool] = None,
    color: Optional[str] = None,
    underline: Optional[str] = None,
    no_underline: bool = False,
) -> None:
    """对 <w:rPr> 元素应用格式修改。"""
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


def _format_changes_str(
    font: Optional[str] = None,
    size: Optional[float] = None,
    bold: Optional[bool] = None,
    italic: Optional[bool] = None,
    color: Optional[str] = None,
    underline: Optional[str] = None,
    no_underline: bool = False,
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
    return ", ".join(changes)


def _get_conflicting_tags(
    font: Optional[str] = None,
    size: Optional[float] = None,
    bold: Optional[bool] = None,
    italic: Optional[bool] = None,
    color: Optional[str] = None,
    underline: Optional[str] = None,
    no_underline: bool = False,
) -> Set[str]:
    """根据本次修改的格式属性，返回需要从内联 rPr 中清理的标签集合。

    例如：如果设置了 --font，则需要清理 run 中的 <w:rFonts> 内联覆盖。
    只清理与本次修改冲突的属性，不影响其他未修改的内联格式。
    """
    tags = set()
    if font is not None:
        tags.add(f"{W}rFonts")
    if size is not None:
        tags.add(f"{W}sz")
        tags.add(f"{W}szCs")
    if bold is not None:
        tags.add(f"{W}b")
        tags.add(f"{W}bCs")
    if italic is not None:
        tags.add(f"{W}i")
        tags.add(f"{W}iCs")
    if color is not None:
        tags.add(f"{W}color")
    if underline is not None or no_underline:
        tags.add(f"{W}u")
    return tags


def _clean_rpr_conflicting_attrs(
    rpr: etree._Element,
    conflicting_tags: Set[str],
) -> int:
    """从 <w:rPr> 中移除与本次样式修改冲突的内联格式属性。

    返回实际移除的元素数量。
    """
    removed = 0
    for tag in conflicting_tags:
        elem = rpr.find(tag)
        if elem is not None:
            # 特殊处理 rFonts：移除显式字体名称和 theme 属性，保留 hint
            if tag == f"{W}rFonts":
                font_attrs = [
                    f"{W}ascii", f"{W}eastAsia", f"{W}hAnsi", f"{W}cs",
                ]
                theme_attrs = [
                    f"{W}asciiTheme", f"{W}eastAsiaTheme",
                    f"{W}hAnsiTheme", f"{W}cstheme",
                ]
                removable_attrs = font_attrs + theme_attrs
                has_font_override = any(
                    elem.get(attr) is not None for attr in removable_attrs
                )
                if has_font_override:
                    # 移除显式字体名称和 theme 属性
                    for attr in removable_attrs:
                        if attr in elem.attrib:
                            del elem.attrib[attr]
                    # 如果 rFonts 只剩 hint 或为空，保留不影响
                    remaining_attrs = set(elem.attrib.keys()) - {f"{W}hint"}
                    if not remaining_attrs:
                        pass
                    removed += 1
            else:
                rpr.remove(elem)
                removed += 1
    return removed


def _clean_document_inline_overrides(
    doc_path: Path,
    style_id: str,
    linked_style_ids: List[str],
    conflicting_tags: Set[str],
    is_default_para_style: bool = False,
) -> Tuple[int, int]:
    """扫描 document.xml，清理使用指定样式的段落中与新样式冲突的内联格式。

    :param doc_path: document.xml 文件路径
    :param style_id: 目标段落样式的 styleId
    :param linked_style_ids: 关联字符样式的 styleId 列表
    :param conflicting_tags: 需要清理的标签集合
    :param is_default_para_style: 是否为默认段落样式（如 Normal）。
        如果为 True，则没有 <w:pStyle> 或没有 <w:pPr> 的段落也视为使用该样式。
    :return: (处理的段落数, 清理的属性数)
    """
    if not doc_path.exists():
        return 0, 0

    parser = etree.XMLParser(remove_blank_text=False, strip_cdata=False)
    tree = etree.parse(str(doc_path), parser)
    root = tree.getroot()

    para_count = 0
    attr_count = 0

    # 找到所有使用目标样式的段落
    for para in root.iter(f"{W}p"):
        ppr = para.find(f"{W}pPr")

        # 判断段落是否使用了目标样式
        if ppr is not None:
            pstyle = ppr.find(f"{W}pStyle")
            if pstyle is not None:
                # 有显式 pStyle：必须匹配 style_id
                pstyle_val = pstyle.get(f"{W}val")
                if pstyle_val != style_id:
                    continue
            else:
                # 没有 pStyle：只有当目标样式是默认段落样式时才匹配
                if not is_default_para_style:
                    continue
        else:
            # 没有 pPr：只有当目标样式是默认段落样式时才匹配
            if not is_default_para_style:
                continue

        # 找到一个使用目标样式的段落
        cleaned_in_para = 0

        # 清理段落级 pPr 中的 rPr 内联格式覆盖
        if ppr is not None:
            ppr_rpr = ppr.find(f"{W}rPr")
            if ppr_rpr is not None:
                cleaned_in_para += _clean_rpr_conflicting_attrs(ppr_rpr, conflicting_tags)

        # 清理每个 run 中的 rPr 内联格式覆盖
        for run in para.iter(f"{W}r"):
            rpr = run.find(f"{W}rPr")
            if rpr is None:
                continue

            # 如果 run 使用了关联字符样式（如 rStyle val="10"），也需要清理
            # 如果 run 没有 rStyle 或使用的是关联字符样式，都清理冲突格式
            rstyle = rpr.find(f"{W}rStyle")
            rstyle_val = rstyle.get(f"{W}val") if rstyle is not None else None

            # 只清理：1) 没有 rStyle 的 run 2) rStyle 是关联字符样式的 run
            # 不清理使用了其他独立字符样式的 run（那些是有意覆盖的）
            if rstyle_val is not None and rstyle_val not in linked_style_ids:
                continue

            cleaned_in_para += _clean_rpr_conflicting_attrs(rpr, conflicting_tags)

        if cleaned_in_para > 0:
            para_count += 1
            attr_count += cleaned_in_para

    if attr_count > 0:
        tree.write(
            str(doc_path),
            xml_declaration=True,
            encoding="UTF-8",
            standalone=True,
        )

    return para_count, attr_count


def modify_style(
    unpacked_dir: str,
    style_query: str,
    font: Optional[str] = None,
    size: Optional[float] = None,
    bold: Optional[bool] = None,
    italic: Optional[bool] = None,
    color: Optional[str] = None,
    underline: Optional[str] = None,
    no_underline: bool = False,
) -> str:
    """修改 styles.xml 中指定样式的格式定义，并自动清理 document.xml 中的冲突内联格式。

    相当于在 Word 中右键样式 → "修改样式"，所有使用该样式的段落会自动继承新格式。
    同时修改关联的字符样式（如果存在），确保样式一致性。
    最后自动扫描 document.xml，清理使用该样式的段落中与新设置冲突的内联格式覆盖。

    :param unpacked_dir: 解包后的 DOCX 目录路径（包含 word/styles.xml 和 word/document.xml）
    :param style_query: 样式名称或 ID（支持 styleId 和 w:name 显示名称）
    :param font: 字体名称
    :param size: 字号（磅）
    :param bold: True=加粗, False=取消加粗, None=不修改
    :param italic: True=斜体, False=取消斜体, None=不修改
    :param color: 字体颜色（十六进制 RGB）
    :param underline: 下划线样式
    :param no_underline: 是否取消下划线
    :return: 操作结果消息
    """
    base_dir = Path(unpacked_dir)
    styles_path = base_dir / "word" / "styles.xml"
    doc_path = base_dir / "word" / "document.xml"

    if not styles_path.exists():
        return f"Error: File not found: {styles_path}"

    # 解析 styles.xml
    parser = etree.XMLParser(remove_blank_text=False, strip_cdata=False)
    tree = etree.parse(str(styles_path), parser)
    root = tree.getroot()

    # 查找目标样式
    style_elem, match_desc = _find_style_by_name_or_id(root, style_query)
    if style_elem is None:
        # 列出可用的样式以便用户参考
        available = []
        for s in root.iter(f"{W}style"):
            sid = s.get(f"{W}styleId", "?")
            n = s.find(f"{W}name")
            nval = n.get(f"{W}val") if n is not None else "?"
            stype = s.get(f"{W}type", "?")
            available.append(f"  {sid} ({nval}) [{stype}]")
        avail_str = "\n".join(available[:20])
        if len(available) > 20:
            avail_str += f"\n  ... and {len(available) - 20} more"
        return f"Error: {match_desc}\n\nAvailable styles:\n{avail_str}"

    # 获取 styleId（用于后续在 document.xml 中匹配段落）
    target_style_id = style_elem.get(f"{W}styleId", "")

    # 构建变更描述
    changes_str = _format_changes_str(
        font=font,
        size=size,
        bold=bold,
        italic=italic,
        color=color,
        underline=underline,
        no_underline=no_underline,
    )

    # 修改主样式的 rPr
    rpr = _ensure_rpr(style_elem)
    _apply_rpr_format(
        rpr,
        font=font,
        size=size,
        bold=bold,
        italic=italic,
        color=color,
        underline=underline,
        no_underline=no_underline,
    )

    # 查找并修改关联的字符样式
    linked_styles = _find_linked_styles(root, style_elem)
    linked_style_ids = []
    linked_info = ""
    for linked_style in linked_styles:
        linked_rpr = _ensure_rpr(linked_style)
        _apply_rpr_format(
            linked_rpr,
            font=font,
            size=size,
            bold=bold,
            italic=italic,
            color=color,
            underline=underline,
            no_underline=no_underline,
        )
        linked_id = linked_style.get(f"{W}styleId", "?")
        linked_style_ids.append(linked_id)
        linked_name_elem = linked_style.find(f"{W}name")
        linked_name = linked_name_elem.get(f"{W}val") if linked_name_elem is not None else linked_id
        linked_info += f"\n  Also modified linked character style: \"{linked_name}\" (styleId=\"{linked_id}\")"

    # 保存修改后的 styles.xml
    tree.write(
        str(styles_path),
        xml_declaration=True,
        encoding="UTF-8",
        standalone=True,
    )

    # 自动清理 document.xml 中的冲突内联格式
    cleanup_info = ""
    conflicting_tags = _get_conflicting_tags(
        font=font,
        size=size,
        bold=bold,
        italic=italic,
        color=color,
        underline=underline,
        no_underline=no_underline,
    )

    # 判断目标样式是否为默认段落样式（type="paragraph" default="1"）
    is_default_para_style = (
        style_elem.get(f"{W}type") == "paragraph"
        and style_elem.get(f"{W}default") == "1"
    )

    if conflicting_tags and doc_path.exists():
        para_count, attr_count = _clean_document_inline_overrides(
            doc_path,
            target_style_id,
            linked_style_ids,
            conflicting_tags,
            is_default_para_style=is_default_para_style,
        )
        if attr_count > 0:
            cleanup_info = (
                f"\n  Cleaned {attr_count} conflicting inline format(s) "
                f"from {para_count} paragraph(s) in document.xml"
            )
        else:
            cleanup_info = "\n  No conflicting inline formats found in document.xml"
    elif not doc_path.exists():
        cleanup_info = "\n  document.xml not found, skipped inline format cleanup"

    return (
        f"OK: Modified style definition {match_desc}\n"
        f"  Changes: {changes_str}{linked_info}{cleanup_info}"
    )


if __name__ == "__main__":
    p = argparse.ArgumentParser(
        description="Modify style definitions in styles.xml of an unpacked DOCX document.",
    )
    p.add_argument(
        "unpacked_dir",
        help="Path to unpacked DOCX directory (containing word/styles.xml and word/document.xml)",
    )
    p.add_argument(
        "--style",
        required=True,
        help="Style name or ID (e.g. 'heading 1', 'Normal', 'Heading1', '1', 'a')",
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

    args = p.parse_args()

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

    # 检查是否有格式参数
    has_format = any([
        args.font is not None,
        args.size is not None,
        bold_val is not None,
        italic_val is not None,
        args.color is not None,
        args.underline is not None,
        args.no_underline,
    ])

    if not has_format:
        print("Error: No format options specified", file=sys.stderr)
        sys.exit(1)

    result = modify_style(
        args.unpacked_dir,
        style_query=args.style,
        font=args.font,
        size=args.size,
        bold=bold_val,
        italic=italic_val,
        color=args.color,
        underline=args.underline,
        no_underline=args.no_underline,
    )

    if result.startswith("Error"):
        print(result, file=sys.stderr)
        sys.exit(1)
    else:
        print(result)
