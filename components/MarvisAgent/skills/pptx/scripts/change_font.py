"""修改解包后 PPTX 中的字体、大小、对齐方式、颜色等格式属性。

Usage: python change_font.py <unpacked_dir> [options]

Options:
    --target <type>     目标占位符类型: title, body, all (默认: title)
    --font <name>       字体名称，如 "微软雅黑", "Arial" 等
    --size <pt>         字体大小（磅值），如 36, 24 等
    --bold <0|1>        是否加粗: 0=否, 1=是 (可选，不指定则保持原样)
    --italic <0|1>      是否斜体: 0=否, 1=是 (可选，不指定则保持原样)
    --underline <type>  下划线类型: none, sng, dbl, heavy 等 (可选)
    --color <hex>       字体颜色 (十六进制RGB，如 FF0000=红色)
    --align <type>      对齐方式: l=左, ctr=居中, r=右, just=两端对齐
    --ea-font <name>    东亚字体名称 (可选，不指定则与 --font 相同)
    --dry-run           仅显示将要修改的内容，不实际修改

Examples:
    python change_font.py unpacked/ --target title --font "微软雅黑" --size 36
    python change_font.py unpacked/ --target body --font "Arial" --size 18
    python change_font.py unpacked/ --target all --font "微软雅黑" --size 24 --bold 1
    python change_font.py unpacked/ --target title --color FF0000 --align ctr
    python change_font.py unpacked/ --target title --font "微软雅黑" --size 36 --dry-run

字体继承链（从高到低优先级）:
    slide.xml > slideLayout.xml > slideMaster.xml > theme.xml
    脚本会在 slide 级别直接设置字体属性，覆盖所有继承值。
"""

import argparse
import io
import os
import re
import sys
from pathlib import Path

# Windows 终端默认编码可能不是 UTF-8，强制设置以避免中文路径乱码
if os.name == "nt" and hasattr(sys.stdout, "buffer"):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

import defusedxml.minidom

# OOXML 中占位符类型定义
# 参考: http://schemas.openxmlformats.org/presentationml/2006/main
TITLE_PLACEHOLDER_TYPES = {"title", "ctrTitle"}
BODY_PLACEHOLDER_TYPES = {"body", "subTitle", "obj", "dt", "ftr", "sldNum", "tbl", "chart", "dgm", "media", "clipArt"}

# 对齐方式映射
ALIGN_VALUES = {"l", "ctr", "r", "just", "justLow", "dist", "thaiDist"}

# 下划线类型映射
# 参考: http://schemas.openxmlformats.org/drawingml/2006/main (ST_TextUnderlineType)
UNDERLINE_VALUES = {
    "none", "sng", "dbl", "heavy", "dotted", "dottedHeavy",
    "dash", "dashHeavy", "dashLong", "dashLongHeavy",
    "dotDash", "dotDashHeavy", "dotDotDash", "dotDotDashHeavy",
    "wavy", "wavyHeavy", "wavyDbl", "words",
}

# 命名空间映射
NS = {
    "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
    "p": "http://schemas.openxmlformats.org/presentationml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
}


def get_placeholder_type(sp_node: object) -> str | None:
    """获取形状节点的占位符类型。

    :param sp_node: 形状 DOM 节点
    :return: 占位符类型字符串，如 "title", "body" 等，非占位符返回 None
    """
    nv_sp_pr_list = sp_node.getElementsByTagName("p:nvSpPr")
    if not nv_sp_pr_list:
        return None

    nv_pr_list = nv_sp_pr_list[0].getElementsByTagName("p:nvPr")
    if not nv_pr_list:
        return None

    ph_list = nv_pr_list[0].getElementsByTagName("p:ph")
    if not ph_list:
        return None

    ph_type = ph_list[0].getAttribute("type")
    # 没有 type 属性的占位符默认为 body
    if not ph_type:
        return "body"

    return ph_type


def is_target_placeholder(ph_type: str | None, target: str) -> bool:
    """判断占位符类型是否匹配目标。

    :param ph_type: 占位符类型
    :param target: 目标类型 ("title", "body", "all")
    :return: 是否匹配
    """
    if ph_type is None:
        return False

    if target == "all":
        return True
    elif target == "title":
        return ph_type in TITLE_PLACEHOLDER_TYPES
    elif target == "body":
        return ph_type in BODY_PLACEHOLDER_TYPES

    return False


def get_slide_layout_path(unpacked_dir: Path, slide_name: str) -> Path | None:
    """通过 slide 的 .rels 文件找到对应的 slideLayout 路径。

    :param unpacked_dir: 解包目录
    :param slide_name: 幻灯片文件名，如 "slide1.xml"
    :return: slideLayout 文件路径，找不到返回 None
    """
    rels_path = unpacked_dir / "ppt" / "slides" / "_rels" / f"{slide_name}.rels"
    if not rels_path.exists():
        return None

    rels_dom = defusedxml.minidom.parse(str(rels_path))
    for rel in rels_dom.getElementsByTagName("Relationship"):
        rel_type = rel.getAttribute("Type")
        if "slideLayout" in rel_type:
            target = rel.getAttribute("Target")
            # target 通常是 "../slideLayouts/slideLayoutN.xml"
            layout_path = (rels_path.parent.parent / target).resolve()
            if layout_path.exists():
                return layout_path

    return None


def get_slide_master_path(unpacked_dir: Path, layout_path: Path) -> Path | None:
    """通过 slideLayout 的 .rels 文件找到对应的 slideMaster 路径。

    :param unpacked_dir: 解包目录
    :param layout_path: slideLayout 文件路径
    :return: slideMaster 文件路径，找不到返回 None
    """
    rels_path = layout_path.parent / "_rels" / f"{layout_path.name}.rels"
    if not rels_path.exists():
        return None

    rels_dom = defusedxml.minidom.parse(str(rels_path))
    for rel in rels_dom.getElementsByTagName("Relationship"):
        rel_type = rel.getAttribute("Type")
        if "slideMaster" in rel_type:
            target = rel.getAttribute("Target")
            master_path = (rels_path.parent.parent / target).resolve()
            if master_path.exists():
                return master_path

    return None


def get_theme_path(unpacked_dir: Path, master_path: Path) -> Path | None:
    """通过 slideMaster 的 .rels 文件找到对应的 theme 路径。

    :param unpacked_dir: 解包目录
    :param master_path: slideMaster 文件路径
    :return: theme 文件路径，找不到返回 None
    """
    rels_path = master_path.parent / "_rels" / f"{master_path.name}.rels"
    if not rels_path.exists():
        return None

    rels_dom = defusedxml.minidom.parse(str(rels_path))
    for rel in rels_dom.getElementsByTagName("Relationship"):
        rel_type = rel.getAttribute("Type")
        if "theme" in rel_type:
            target = rel.getAttribute("Target")
            theme_path = (rels_path.parent.parent / target).resolve()
            if theme_path.exists():
                return theme_path

    return None


def resolve_inherited_font(
    unpacked_dir: Path,
    slide_name: str,
    ph_type: str,
) -> dict:
    """解析字体继承链，获取当前生效的字体属性。

    继承链: slide.xml -> slideLayout.xml -> slideMaster.xml -> theme.xml

    :param unpacked_dir: 解包目录
    :param slide_name: 幻灯片文件名
    :param ph_type: 占位符类型
    :return: 包含 latin, ea, sz 等字体属性的字典
    """
    result = {"latin": None, "ea": None, "sz": None, "b": None, "i": None, "u": None, "color": None}

    # 从 theme 开始向上查找，最终 slide 级别的设置会覆盖所有
    layout_path = get_slide_layout_path(unpacked_dir, slide_name)
    master_path = None
    theme_path = None

    if layout_path:
        master_path = get_slide_master_path(unpacked_dir, layout_path)
    if master_path:
        theme_path = get_theme_path(unpacked_dir, master_path)

    # 第1层: theme.xml（最低优先级）
    if theme_path:
        theme_font = _get_theme_font(theme_path, ph_type)
        _merge_font_props(result, theme_font)

    # 第2层: slideMaster.xml
    if master_path:
        master_font = _get_default_font_from_text_styles(master_path, ph_type)
        _merge_font_props(result, master_font)

    # 第3层: slideLayout.xml
    if layout_path:
        layout_font = _get_default_font_from_text_styles(layout_path, ph_type)
        _merge_font_props(result, layout_font)

    return result


def _get_theme_font(theme_path: Path, ph_type: str) -> dict:
    """从 theme.xml 中获取字体定义。

    :param theme_path: theme 文件路径
    :param ph_type: 占位符类型
    :return: 字体属性字典
    """
    result = {"latin": None, "ea": None, "sz": None, "b": None, "i": None, "u": None, "color": None}
    dom = defusedxml.minidom.parse(str(theme_path))

    # theme 中的 majorFont 对应标题，minorFont 对应正文
    if ph_type in TITLE_PLACEHOLDER_TYPES:
        font_scheme_tag = "a:majorFont"
    else:
        font_scheme_tag = "a:minorFont"

    font_schemes = dom.getElementsByTagName(font_scheme_tag)
    if not font_schemes:
        return result

    font_scheme = font_schemes[0]

    # 获取 latin 字体
    latin_nodes = font_scheme.getElementsByTagName("a:latin")
    if latin_nodes:
        result["latin"] = latin_nodes[0].getAttribute("typeface")

    # 获取东亚字体
    ea_nodes = font_scheme.getElementsByTagName("a:ea")
    if ea_nodes:
        result["ea"] = ea_nodes[0].getAttribute("typeface")

    return result


def _get_default_font_from_text_styles(xml_path: Path, ph_type: str) -> dict:
    """从 slideMaster 或 slideLayout 的 txStyles 或占位符默认文本属性中获取字体。

    :param xml_path: XML 文件路径
    :param ph_type: 占位符类型
    :return: 字体属性字典
    """
    result = {"latin": None, "ea": None, "sz": None, "b": None, "i": None, "u": None, "color": None}
    dom = defusedxml.minidom.parse(str(xml_path))

    # 方法1: 从 p:txStyles 中获取（slideMaster 常用）
    if ph_type in TITLE_PLACEHOLDER_TYPES:
        style_tag = "p:titleStyle"
    else:
        style_tag = "p:bodyStyle"

    style_nodes = dom.getElementsByTagName(style_tag)
    if style_nodes:
        # 获取第一级文本样式 (a:lvl1pPr)
        lvl1_nodes = style_nodes[0].getElementsByTagName("a:lvl1pPr")
        if lvl1_nodes:
            _extract_font_from_ppr(lvl1_nodes[0], result)

    # 方法2: 从占位符形状的 defRPr 中获取（slideLayout 常用）
    for sp in dom.getElementsByTagName("p:sp"):
        sp_ph_type = get_placeholder_type(sp)
        if sp_ph_type != ph_type:
            continue

        # 找到匹配的占位符，获取其默认文本属性
        tx_body_list = sp.getElementsByTagName("p:txBody")
        if not tx_body_list:
            continue

        lst_style_nodes = tx_body_list[0].getElementsByTagName("a:lstStyle")
        if lst_style_nodes:
            lvl1_nodes = lst_style_nodes[0].getElementsByTagName("a:lvl1pPr")
            if lvl1_nodes:
                _extract_font_from_ppr(lvl1_nodes[0], result)

        # 也检查段落级别的 defRPr
        for p_node in tx_body_list[0].getElementsByTagName("a:p"):
            ppr_nodes = p_node.getElementsByTagName("a:pPr")
            if ppr_nodes:
                def_rpr_nodes = ppr_nodes[0].getElementsByTagName("a:defRPr")
                if def_rpr_nodes:
                    _extract_font_from_rpr(def_rpr_nodes[0], result)
            break  # 只看第一段

    return result


def _extract_font_from_ppr(ppr_node: object, result: dict) -> None:
    """从段落属性节点中提取字体信息。

    :param ppr_node: a:lvl1pPr 或类似的段落属性节点
    :param result: 结果字典，会被原地修改
    """
    # 提取 defRPr（默认运行属性）
    def_rpr_nodes = ppr_node.getElementsByTagName("a:defRPr")
    if def_rpr_nodes:
        _extract_font_from_rpr(def_rpr_nodes[0], result)


def _extract_font_from_rpr(rpr_node: object, result: dict) -> None:
    """从运行属性节点中提取字体信息。

    :param rpr_node: a:rPr 或 a:defRPr 节点
    :param result: 结果字典，会被原地修改
    """
    # 字体大小 (sz 属性，单位为百分之一磅)
    sz = rpr_node.getAttribute("sz")
    if sz:
        result["sz"] = sz

    # 加粗
    b = rpr_node.getAttribute("b")
    if b:
        result["b"] = b

    # 斜体
    i = rpr_node.getAttribute("i")
    if i:
        result["i"] = i

    # 下划线
    u = rpr_node.getAttribute("u")
    if u:
        result["u"] = u

    # latin 字体
    latin_nodes = rpr_node.getElementsByTagName("a:latin")
    if latin_nodes:
        typeface = latin_nodes[0].getAttribute("typeface")
        if typeface:
            result["latin"] = typeface

    # 东亚字体
    ea_nodes = rpr_node.getElementsByTagName("a:ea")
    if ea_nodes:
        typeface = ea_nodes[0].getAttribute("typeface")
        if typeface:
            result["ea"] = typeface

    # 字体颜色 (solidFill > srgbClr)
    solid_fill_nodes = rpr_node.getElementsByTagName("a:solidFill")
    if solid_fill_nodes:
        srgb_nodes = solid_fill_nodes[0].getElementsByTagName("a:srgbClr")
        if srgb_nodes:
            val = srgb_nodes[0].getAttribute("val")
            if val:
                result["color"] = val


def _merge_font_props(target: dict, source: dict) -> None:
    """将源字体属性合并到目标中（仅填充 None 值）。

    :param target: 目标字典
    :param source: 源字典
    """
    for key in target:
        if target[key] is None and source.get(key) is not None:
            target[key] = source[key]


def pt_to_hundredths(pt: float) -> str:
    """将磅值转换为百分之一磅（OOXML 中 sz 的单位）。

    :param pt: 磅值
    :return: 百分之一磅的字符串
    """
    return str(int(pt * 100))


def _set_or_create_child(doc: object, parent: object, tag: str, attrs: dict) -> object:
    """设置或创建子节点。

    如果已存在则更新属性，不存在则创建新节点。

    :param doc: DOM 文档对象
    :param parent: 父节点
    :param tag: 标签名
    :param attrs: 属性字典
    :return: 子节点
    """
    existing = parent.getElementsByTagName(tag)
    if existing:
        node = existing[0]
    else:
        node = doc.createElement(tag)
        parent.appendChild(node)

    for key, value in attrs.items():
        node.setAttribute(key, value)

    return node


def _set_or_remove_solid_fill(doc: object, rpr_node: object, color_hex: str | None) -> None:
    """设置或更新运行属性节点的 solidFill 颜色。

    会移除旧的 solidFill 并创建新的，确保颜色正确。

    :param doc: DOM 文档对象
    :param rpr_node: a:rPr / a:defRPr / a:endParaRPr 节点
    :param color_hex: 十六进制 RGB 颜色值，如 "FF0000"
    """
    if color_hex is None:
        return

    # 移除已有的 solidFill
    existing_fills = rpr_node.getElementsByTagName("a:solidFill")
    for fill in list(existing_fills):
        # 只移除 rpr_node 的直接子节点（避免误删嵌套的 solidFill）
        if fill.parentNode == rpr_node:
            rpr_node.removeChild(fill)

    # 创建新的 solidFill
    solid_fill = doc.createElement("a:solidFill")
    srgb_clr = doc.createElement("a:srgbClr")
    srgb_clr.setAttribute("val", color_hex)
    solid_fill.appendChild(srgb_clr)

    # solidFill 应插入到 rpr_node 的第一个子节点之前（OOXML 规范顺序）
    first_child = rpr_node.firstChild
    if first_child:
        rpr_node.insertBefore(solid_fill, first_child)
    else:
        rpr_node.appendChild(solid_fill)


def _apply_rpr_attrs(
    doc: object,
    rpr_node: object,
    font_name: str | None,
    ea_font_name: str | None,
    font_size_pt: float | None,
    bold: int | None,
    italic: int | None,
    underline: str | None,
    color: str | None,
) -> None:
    """将所有格式属性应用到一个运行属性节点上。

    统一处理 a:rPr / a:defRPr / a:endParaRPr 的属性设置。

    :param doc: DOM 文档对象
    :param rpr_node: 运行属性节点
    :param font_name: Latin 字体名称
    :param ea_font_name: 东亚字体名称
    :param font_size_pt: 字体大小（磅值）
    :param bold: 是否加粗 (0 或 1)
    :param italic: 是否斜体 (0 或 1)
    :param underline: 下划线类型
    :param color: 十六进制 RGB 颜色值
    """
    if font_size_pt is not None:
        rpr_node.setAttribute("sz", pt_to_hundredths(font_size_pt))
    if bold is not None:
        rpr_node.setAttribute("b", str(bold))
    if italic is not None:
        rpr_node.setAttribute("i", str(italic))
    if underline is not None:
        rpr_node.setAttribute("u", underline)
    if font_name is not None:
        _set_or_create_child(doc, rpr_node, "a:latin", {"typeface": font_name})
    effective_ea = ea_font_name if ea_font_name else font_name
    if effective_ea is not None:
        _set_or_create_child(doc, rpr_node, "a:ea", {"typeface": effective_ea})
    _set_or_remove_solid_fill(doc, rpr_node, color)


def apply_font_to_slide(
    slide_path: Path,
    target: str,
    font_name: str | None = None,
    font_size_pt: float | None = None,
    bold: int | None = None,
    italic: int | None = None,
    underline: str | None = None,
    color: str | None = None,
    align: str | None = None,
    ea_font_name: str | None = None,
    dry_run: bool = False,
) -> list[str]:
    """对单个幻灯片应用字体和格式修改。

    :param slide_path: 幻灯片 XML 文件路径
    :param target: 目标类型 ("title", "body", "all")
    :param font_name: 字体名称
    :param font_size_pt: 字体大小（磅值）
    :param bold: 是否加粗 (0 或 1)
    :param italic: 是否斜体 (0 或 1)
    :param underline: 下划线类型 (none, sng, dbl, heavy 等)
    :param color: 字体颜色 (十六进制 RGB，如 "FF0000")
    :param align: 对齐方式 (l, ctr, r, just)
    :param ea_font_name: 东亚字体名称
    :param dry_run: 仅预览不修改
    :return: 修改日志列表
    """
    changes = []
    dom = defusedxml.minidom.parse(str(slide_path))

    # 遍历所有形状
    for sp in dom.getElementsByTagName("p:sp"):
        ph_type = get_placeholder_type(sp)
        if not is_target_placeholder(ph_type, target):
            continue

        # 获取文本框
        tx_body_list = sp.getElementsByTagName("p:txBody")
        if not tx_body_list:
            continue

        tx_body = tx_body_list[0]

        # 遍历所有段落
        for p_node in tx_body.getElementsByTagName("a:p"):
            # 处理每个 run
            for r_node in p_node.getElementsByTagName("a:r"):
                rpr_nodes = r_node.getElementsByTagName("a:rPr")
                if rpr_nodes:
                    rpr = rpr_nodes[0]
                else:
                    # 没有 rPr 节点，创建一个
                    rpr = dom.createElement("a:rPr")
                    # 插入到 r 节点的第一个子节点之前
                    first_child = r_node.firstChild
                    if first_child:
                        r_node.insertBefore(rpr, first_child)
                    else:
                        r_node.appendChild(rpr)

                # 获取当前文本内容用于日志
                text_nodes = r_node.getElementsByTagName("a:t")
                text_content = ""
                if text_nodes:
                    text_content = text_nodes[0].firstChild.nodeValue if text_nodes[0].firstChild else ""

                # 记录修改前的属性
                change_prefix = f"  [{ph_type}] \"{text_content[:30]}\""

                if font_size_pt is not None:
                    old_val = rpr.getAttribute("sz") or "inherited"
                    changes.append(f"{change_prefix} sz: {old_val} -> {pt_to_hundredths(font_size_pt)}")
                if bold is not None:
                    old_val = rpr.getAttribute("b") or "inherited"
                    changes.append(f"{change_prefix} b: {old_val} -> {bold}")
                if italic is not None:
                    old_val = rpr.getAttribute("i") or "inherited"
                    changes.append(f"{change_prefix} i: {old_val} -> {italic}")
                if underline is not None:
                    old_val = rpr.getAttribute("u") or "inherited"
                    changes.append(f"{change_prefix} u: {old_val} -> {underline}")
                if font_name is not None:
                    changes.append(f"{change_prefix} latin: -> {font_name}")
                effective_ea = ea_font_name if ea_font_name else font_name
                if effective_ea is not None:
                    changes.append(f"{change_prefix} ea: -> {effective_ea}")
                if color is not None:
                    changes.append(f"{change_prefix} color: -> #{color}")

                # 统一应用所有属性
                _apply_rpr_attrs(
                    dom, rpr, font_name, ea_font_name,
                    font_size_pt, bold, italic, underline, color,
                )

            # 处理对齐方式（段落级别属性）
            if align is not None:
                ppr_nodes = p_node.getElementsByTagName("a:pPr")
                if ppr_nodes:
                    ppr = ppr_nodes[0]
                else:
                    ppr = dom.createElement("a:pPr")
                    first_child = p_node.firstChild
                    if first_child:
                        p_node.insertBefore(ppr, first_child)
                    else:
                        p_node.appendChild(ppr)
                old_algn = ppr.getAttribute("algn") or "inherited"
                ppr.setAttribute("algn", align)
                changes.append(f"  [{ph_type}] algn: {old_algn} -> {align}")

            # 同时处理 defRPr（段落默认运行属性），确保新增文本也使用新字体
            ppr_nodes = p_node.getElementsByTagName("a:pPr")
            if ppr_nodes:
                def_rpr_nodes = ppr_nodes[0].getElementsByTagName("a:defRPr")
                if def_rpr_nodes:
                    _apply_rpr_attrs(
                        dom, def_rpr_nodes[0], font_name, ea_font_name,
                        font_size_pt, bold, italic, underline, color,
                    )

            # 处理 endParaRPr（段落结束标记的运行属性）
            end_rpr_nodes = p_node.getElementsByTagName("a:endParaRPr")
            if end_rpr_nodes:
                _apply_rpr_attrs(
                    dom, end_rpr_nodes[0], font_name, ea_font_name,
                    font_size_pt, bold, italic, underline, color,
                )

    if changes and not dry_run:
        xml_str = dom.toxml(encoding="utf-8")
        slide_path.write_bytes(xml_str)

    return changes


def change_font(
    unpacked_dir: Path,
    target: str = "title",
    font_name: str | None = None,
    font_size_pt: float | None = None,
    bold: int | None = None,
    italic: int | None = None,
    underline: str | None = None,
    color: str | None = None,
    align: str | None = None,
    ea_font_name: str | None = None,
    dry_run: bool = False,
) -> None:
    """修改解包后 PPTX 中所有幻灯片的字体和格式属性。

    :param unpacked_dir: 解包目录路径
    :param target: 目标占位符类型 ("title", "body", "all")
    :param font_name: 字体名称
    :param font_size_pt: 字体大小（磅值）
    :param bold: 是否加粗 (0 或 1)
    :param italic: 是否斜体 (0 或 1)
    :param underline: 下划线类型 (none, sng, dbl, heavy 等)
    :param color: 字体颜色 (十六进制 RGB，如 "FF0000")
    :param align: 对齐方式 (l, ctr, r, just)
    :param ea_font_name: 东亚字体名称
    :param dry_run: 仅预览不修改
    """
    slides_dir = unpacked_dir / "ppt" / "slides"
    if not slides_dir.exists():
        print(f"Error: {slides_dir} not found", file=sys.stderr)
        sys.exit(1)

    # 获取所有幻灯片并按编号排序
    slide_files = sorted(
        slides_dir.glob("slide*.xml"),
        key=lambda f: int(re.search(r"(\d+)", f.stem).group(1)) if re.search(r"(\d+)", f.stem) else 0,
    )

    if not slide_files:
        print("No slides found", file=sys.stderr)
        sys.exit(1)

    # 构建修改描述
    desc_parts = []
    if font_name:
        desc_parts.append(f"font={font_name}")
    if ea_font_name:
        desc_parts.append(f"ea_font={ea_font_name}")
    if font_size_pt is not None:
        desc_parts.append(f"size={font_size_pt}pt")
    if bold is not None:
        desc_parts.append(f"bold={'yes' if bold else 'no'}")
    if italic is not None:
        desc_parts.append(f"italic={'yes' if italic else 'no'}")
    if underline is not None:
        desc_parts.append(f"underline={underline}")
    if color is not None:
        desc_parts.append(f"color=#{color}")
    if align is not None:
        desc_parts.append(f"align={align}")

    mode = "[DRY RUN] " if dry_run else ""
    print(f"{mode}Changing {target} fonts: {', '.join(desc_parts)}")
    print(f"Processing {len(slide_files)} slides...\n")

    # 先显示继承链信息
    print("=== 字体继承链信息 ===")
    for slide_file in slide_files:
        inherited = resolve_inherited_font(unpacked_dir, slide_file.name, target)
        layout_path = get_slide_layout_path(unpacked_dir, slide_file.name)
        layout_name = layout_path.name if layout_path else "N/A"

        master_path = None
        theme_path = None
        if layout_path:
            master_path = get_slide_master_path(unpacked_dir, layout_path)
        if master_path:
            theme_path = get_theme_path(unpacked_dir, master_path)

        master_name = master_path.name if master_path else "N/A"
        theme_name = theme_path.name if theme_path else "N/A"

        print(f"  {slide_file.name}: {layout_name} -> {master_name} -> {theme_name}")
        print(f"    继承字体: latin={inherited.get('latin', 'N/A')}, "
              f"ea={inherited.get('ea', 'N/A')}, sz={inherited.get('sz', 'N/A')}, "
              f"color={inherited.get('color', 'N/A')}")

    print("\n=== 开始修改 ===")

    total_changes = 0
    for slide_file in slide_files:
        changes = apply_font_to_slide(
            slide_path=slide_file,
            target=target,
            font_name=font_name,
            font_size_pt=font_size_pt,
            bold=bold,
            italic=italic,
            underline=underline,
            color=color,
            align=align,
            ea_font_name=ea_font_name,
            dry_run=dry_run,
        )

        if changes:
            print(f"\n{slide_file.name}:")
            for change in changes:
                print(change)
            total_changes += len(changes)

    print(f"\n{'[DRY RUN] ' if dry_run else ''}Done. {total_changes} changes across {len(slide_files)} slides.")


def parse_args() -> argparse.Namespace:
    """解析命令行参数。

    :return: 解析后的参数对象
    """
    parser = argparse.ArgumentParser(
        description="修改解包后 PPTX 中的字体和大小",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python change_font.py unpacked/ --target title --font "微软雅黑" --size 36
  python change_font.py unpacked/ --target body --font "Arial" --size 18
  python change_font.py unpacked/ --target all --font "微软雅黑" --size 24
  python change_font.py unpacked/ --target title --size 36 --dry-run
        """,
    )
    parser.add_argument(
        "unpacked_dir",
        type=Path,
        help="解包后的 PPTX 目录路径",
    )
    parser.add_argument(
        "--target",
        choices=["title", "body", "all"],
        default="title",
        help="目标占位符类型 (默认: title)",
    )
    parser.add_argument(
        "--font",
        type=str,
        default=None,
        help="字体名称，如 '微软雅黑', 'Arial'",
    )
    parser.add_argument(
        "--size",
        type=float,
        default=None,
        help="字体大小（磅值），如 36, 24",
    )
    parser.add_argument(
        "--bold",
        type=int,
        choices=[0, 1],
        default=None,
        help="是否加粗: 0=否, 1=是",
    )
    parser.add_argument(
        "--italic",
        type=int,
        choices=[0, 1],
        default=None,
        help="是否斜体: 0=否, 1=是",
    )
    parser.add_argument(
        "--underline",
        type=str,
        default=None,
        help="下划线类型: none, sng(单线), dbl(双线), heavy(粗线), dotted, dash, wavy 等",
    )
    parser.add_argument(
        "--color",
        type=str,
        default=None,
        help="字体颜色 (十六进制RGB，如 FF0000=红色, 0000FF=蓝色)",
    )
    parser.add_argument(
        "--align",
        type=str,
        default=None,
        help="对齐方式: l=左对齐, ctr=居中, r=右对齐, just=两端对齐",
    )
    parser.add_argument(
        "--ea-font",
        type=str,
        default=None,
        help="东亚字体名称 (不指定则与 --font 相同)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="仅显示将要修改的内容，不实际修改文件",
    )
    return parser.parse_args()


if __name__ == "__main__":
    args = parse_args()

    if not args.unpacked_dir.exists():
        print(f"Error: {args.unpacked_dir} not found", file=sys.stderr)
        sys.exit(1)

    has_any_option = any([
        args.font is not None,
        args.size is not None,
        args.bold is not None,
        args.italic is not None,
        args.underline is not None,
        args.color is not None,
        args.align is not None,
    ])
    if not has_any_option:
        print(
            "Error: 至少需要指定 --font, --size, --bold, --italic, "
            "--underline, --color 或 --align 中的一个",
            file=sys.stderr,
        )
        sys.exit(1)

    # 校验颜色格式
    if args.color is not None:
        color_clean = args.color.lstrip("#")
        if len(color_clean) != 6 or not all(c in "0123456789abcdefABCDEF" for c in color_clean):
            print(f"Error: 无效的颜色值 '{args.color}'，请使用6位十六进制RGB（如 FF0000）", file=sys.stderr)
            sys.exit(1)
        args.color = color_clean.upper()

    # 校验对齐方式
    if args.align is not None and args.align not in ALIGN_VALUES:
        print(
            f"Error: 无效的对齐方式 '{args.align}'，可选值: {', '.join(sorted(ALIGN_VALUES))}",
            file=sys.stderr,
        )
        sys.exit(1)

    # 校验下划线类型
    if args.underline is not None and args.underline not in UNDERLINE_VALUES:
        print(
            f"Error: 无效的下划线类型 '{args.underline}'，可选值: {', '.join(sorted(UNDERLINE_VALUES))}",
            file=sys.stderr,
        )
        sys.exit(1)

    change_font(
        unpacked_dir=args.unpacked_dir,
        target=args.target,
        font_name=args.font,
        font_size_pt=args.size,
        bold=args.bold,
        italic=args.italic,
        underline=args.underline,
        color=args.color,
        align=args.align,
        ea_font_name=args.ea_font,
        dry_run=args.dry_run,
    )
