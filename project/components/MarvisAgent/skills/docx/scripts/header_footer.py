# -*- coding: utf-8 -*-
"""管理 DOCX 文档的页眉和页脚。

Usage:
    python scripts/header_footer.py <unpacked_dir> list
    python scripts/header_footer.py <unpacked_dir> add --type header --position default --text "文本"
    python scripts/header_footer.py <unpacked_dir> modify --type header --position default --text "新文本"
    python scripts/header_footer.py <unpacked_dir> remove --type header --position default

子命令：
    list    列出文档中所有节的页眉页脚信息
    add     添加新的页眉或页脚
    modify  修改现有页眉或页脚的文本和格式
    remove  删除指定的页眉或页脚

通用参数（add/modify/remove）：
    --type TYPE         类型：header（页眉）或 footer（页脚）
    --position POS      位置：default / first / even / all，默认 default（add 子命令默认 all）
                        all 表示同时添加 default + first，确保无论是否启用首页不同都能覆盖所有页面
    --section N         节索引（0-based），-1 表示文档默认节，默认 -1

add/modify 额外参数：
    --text TEXT         文本内容（支持 {PAGE} 和 {NUMPAGES} 占位符）
    --font NAME         字体名称（如 宋体、Arial）
    --size PT           字号（磅值）。注意：中文'五号'对应10.5，'小四'对应12，严禁直接传入5或4
    --align ALIGN       对齐：left / center / right
"""
import argparse
import os
import re
import sys
from xml.etree import ElementTree as ET


# ---------------------------------------------------------------------------
# 命名空间常量
# ---------------------------------------------------------------------------
NS_W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
NS_R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
NS_RELS = "http://schemas.openxmlformats.org/package/2006/relationships"
NS_CT = "http://schemas.openxmlformats.org/package/2006/content-types"

W = f"{{{NS_W}}}"
R = f"{{{NS_R}}}"

# 页眉/页脚 XML 所需的完整命名空间声明
HF_NAMESPACES = (
    'xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas" '
    'xmlns:cx="http://schemas.microsoft.com/office/drawing/2014/chartex" '
    'xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" '
    'xmlns:aink="http://schemas.microsoft.com/office/drawing/2016/ink" '
    'xmlns:am3d="http://schemas.microsoft.com/office/drawing/2017/model3d" '
    'xmlns:o="urn:schemas-microsoft-com:office:office" '
    'xmlns:oel="http://schemas.microsoft.com/office/2019/extlst" '
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" '
    'xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" '
    'xmlns:v="urn:schemas-microsoft-com:vml" '
    'xmlns:wp14="http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing" '
    'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" '
    'xmlns:w10="urn:schemas-microsoft-com:office:word" '
    'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" '
    'xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml" '
    'xmlns:w15="http://schemas.microsoft.com/office/word/2012/wordml" '
    'xmlns:w16cex="http://schemas.microsoft.com/office/word/2018/wordml/cex" '
    'xmlns:w16cid="http://schemas.microsoft.com/office/word/2016/wordml/cid" '
    'xmlns:w16="http://schemas.microsoft.com/office/word/2018/wordml" '
    'xmlns:w16sdtdh="http://schemas.microsoft.com/office/word/2020/wordml/sdtdatahash" '
    'xmlns:w16se="http://schemas.microsoft.com/office/word/2015/wordml/symex" '
    'xmlns:wpg="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup" '
    'xmlns:wpi="http://schemas.microsoft.com/office/word/2010/wordprocessingInk" '
    'xmlns:wne="http://schemas.microsoft.com/office/word/2006/wordml" '
    'xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"'
)

# 页眉/页脚内容类型
CT_HEADER = "application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"
CT_FOOTER = "application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"

# 关系类型
RT_HEADER = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/header"
RT_FOOTER = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer"

# 位置映射：position -> w:type 属性值
POSITION_MAP = {
    "default": "default",
    "first": "first",
    "even": "even",
}


# ---------------------------------------------------------------------------
# 路径工具
# ---------------------------------------------------------------------------

def _word_dir(unpacked_dir: str) -> str:
    """返回 word/ 子目录路径。"""
    return os.path.join(unpacked_dir, "word")


def _document_xml_path(unpacked_dir: str) -> str:
    return os.path.join(unpacked_dir, "word", "document.xml")


def _rels_path(unpacked_dir: str) -> str:
    return os.path.join(unpacked_dir, "word", "_rels", "document.xml.rels")


def _content_types_path(unpacked_dir: str) -> str:
    return os.path.join(unpacked_dir, "[Content_Types].xml")


# ---------------------------------------------------------------------------
# XML 解析工具
# ---------------------------------------------------------------------------

def _parse_xml(path: str) -> ET.ElementTree:
    """解析 XML 文件，保留命名空间前缀。"""
    ET.register_namespace("", NS_W)
    return ET.parse(path)


def _write_xml_tree(tree: ET.ElementTree, path: str) -> None:
    """将 ElementTree 写回文件（仅用于 Content_Types.xml 等不含原始命名空间的文件）。

    使用 UTF-8 编码，不含 XML 声明。
    """
    with open(path, "w", encoding="utf-8") as f:
        tree.write(f, encoding="unicode", xml_declaration=False)


def _read_raw(path: str) -> str:
    """以字符串形式读取文件原始内容，保留所有命名空间声明。"""
    with open(path, encoding="utf-8") as fh:
        return fh.read()


def _write_raw(path: str, content: str) -> None:
    """将字符串原样写回文件，保留所有命名空间声明。"""
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(content)


# ---------------------------------------------------------------------------
# 工具函数：文件编号、rId、内容类型
# ---------------------------------------------------------------------------

def _next_file_index(word_dir: str, prefix: str) -> int:
    """扫描 word/ 目录，返回不与现有文件冲突的下一个编号。

    :param word_dir: word/ 目录路径
    :param prefix: 文件前缀，如 "header" 或 "footer"
    :return: 下一个可用编号（整数）
    """
    pattern = re.compile(rf"^{re.escape(prefix)}(\d+)\.xml$", re.IGNORECASE)
    max_idx = 0
    for name in os.listdir(word_dir):
        match = pattern.match(name)
        if match:
            max_idx = max(max_idx, int(match.group(1)))
    return max_idx + 1


def _next_rid_from_raw(rels_content: str) -> str:
    """从 document.xml.rels 原始字符串中扫描，返回不冲突的新 rId。

    :param rels_content: document.xml.rels 的原始字符串内容
    :return: 新的 rId 字符串，如 "rId10"
    """
    max_num = 0
    for match in re.finditer(r'\bId="rId(\d+)"', rels_content):
        max_num = max(max_num, int(match.group(1)))
    return f"rId{max_num + 1}"


def _register_content_type(ct_tree: ET.ElementTree, part_name: str, content_type: str) -> None:
    """幂等地向 [Content_Types].xml 添加 Override 条目。

    :param ct_tree: [Content_Types].xml 的 ElementTree
    :param part_name: 如 "/word/header1.xml"
    :param content_type: 内容类型字符串
    """
    root = ct_tree.getroot()
    for child in root:
        if child.get("PartName") == part_name:
            return
    override = ET.SubElement(root, f"{{{NS_CT}}}Override")
    override.set("PartName", part_name)
    override.set("ContentType", content_type)


def _unregister_content_type(ct_tree: ET.ElementTree, part_name: str) -> None:
    """从 [Content_Types].xml 中移除指定 Override 条目。"""
    root = ct_tree.getroot()
    to_remove = None
    for child in root:
        if child.get("PartName") == part_name:
            to_remove = child
            break
    if to_remove is not None:
        root.remove(to_remove)


# ---------------------------------------------------------------------------
# 工具函数：构建页眉/页脚 XML 内容
# ---------------------------------------------------------------------------

def _build_field_runs(field_name: str, rpr_xml: str) -> str:
    """构建 Word 域代码的 XML 片段（fldChar 结构）。

    :param field_name: 域名称，如 "PAGE" 或 "NUMPAGES"
    :param rpr_xml: 运行属性 XML 字符串（可为空）
    :return: 三个 <w:r> 元素的 XML 字符串
    """
    return (
        f'<w:r>{rpr_xml}'
        f'<w:fldChar w:fldCharType="begin"/></w:r>'
        f'<w:r>{rpr_xml}'
        f'<w:instrText xml:space="preserve"> {field_name} </w:instrText></w:r>'
        f'<w:r>{rpr_xml}'
        f'<w:fldChar w:fldCharType="end"/></w:r>'
    )


def _build_rpr_xml(font: str, size: float) -> str:
    """构建 <w:rPr> XML 字符串。

    :param font: 字体名称，空字符串表示不设置
    :param size: 字号（磅），0 表示不设置
    :return: <w:rPr>...</w:rPr> 字符串，若无属性则返回空字符串
    """
    parts = []
    if font:
        parts.append(
            f'<w:rFonts w:ascii="{font}" w:eastAsia="{font}" '
            f'w:hAnsi="{font}" w:cs="{font}"/>'
        )
    if size > 0:
        half_pt = int(size * 2)
        parts.append(f'<w:sz w:val="{half_pt}"/>')
        parts.append(f'<w:szCs w:val="{half_pt}"/>')
    if not parts:
        return ""
    return "<w:rPr>" + "".join(parts) + "</w:rPr>"


def _build_hf_xml(
    hf_type: str,
    text: str,
    font: str = "",
    size: float = 0.0,
    align: str = "",
) -> str:
    """生成符合 OOXML 规范的页眉/页脚 XML 字符串。

    - 不含 XML 声明
    - 含正确命名空间声明
    - 空文本生成空段落
    - {PAGE} / {NUMPAGES} 转换为 Word 域代码

    :param hf_type: "hdr" 或 "ftr"（对应 w:hdr / w:ftr 元素）
    :param text: 文本内容（可含 {PAGE} / {NUMPAGES}）
    :param font: 字体名称
    :param size: 字号（磅）
    :param align: 对齐方式
    :return: XML 字符串
    """
    rpr_xml = _build_rpr_xml(font, size)
    ppr_xml = ""
    if align:
        ppr_xml = f'<w:pPr><w:jc w:val="{align}"/></w:pPr>'

    # 将文本按 {PAGE} / {NUMPAGES} 分割，构建 run 列表
    runs_xml = _build_runs_xml(text, rpr_xml)

    tag = f"w:{hf_type}"
    return (
        f'<{tag} {HF_NAMESPACES}>'
        f'<w:p>{ppr_xml}{runs_xml}</w:p>'
        f'</{tag}>'
    )


def _build_runs_xml(text: str, rpr_xml: str) -> str:
    """将文本（可含 {PAGE}/{NUMPAGES}）转换为 <w:r> 序列的 XML 字符串。"""
    if not text or not text.strip():
        return ""

    # 用正则分割，保留分隔符
    parts = re.split(r"(\{PAGE\}|\{NUMPAGES\})", text)
    result = []
    for part in parts:
        if part == "{PAGE}":
            result.append(_build_field_runs("PAGE", rpr_xml))
        elif part == "{NUMPAGES}":
            result.append(_build_field_runs("NUMPAGES", rpr_xml))
        elif part:
            result.append(
                f'<w:r>{rpr_xml}<w:t xml:space="preserve">{_escape_xml(part)}</w:t></w:r>'
            )
    return "".join(result)


def _escape_xml(text: str) -> str:
    """转义 XML 特殊字符。"""
    return (
        text
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


# ---------------------------------------------------------------------------
# 工具函数：基于字符串操作 document.xml 中的 sectPr
#
# 核心设计：不对 document.xml 做整体 parse→write，只用正则在原始字符串中
# 定位 <w:sectPr> 块，然后在其内部插入/删除引用元素。这样可以完整保留
# 原始文件的所有命名空间声明，避免 ElementTree 写回时丢失命名空间导致
# 文档损坏（namespace 'w16cid' in Ignorable but not declared 等错误）。
# ---------------------------------------------------------------------------

def _find_sect_pr_span(doc_content: str, section: int) -> tuple:
    """在 document.xml 原始字符串中定位指定节的 <w:sectPr> 块的起止位置。

    :param doc_content: document.xml 的原始字符串
    :param section: -1 表示文档默认节（body 直接子元素），>=0 表示节索引（0-based）
    :return: (start, end) 表示 <w:sectPr...>...</w:sectPr> 在字符串中的位置
    :raises ValueError: 找不到指定节
    """
    if section == -1:
        return _find_default_sect_pr_span(doc_content)
    return _find_indexed_sect_pr_span(doc_content, section)


def _find_default_sect_pr_span(doc_content: str) -> tuple:
    """定位 <w:body> 直接子元素的 <w:sectPr>（文档默认节）。

    策略：找到最后一个 </w:body> 之前的 <w:sectPr>，即 body 直接子元素的 sectPr。
    """
    body_end = doc_content.rfind("</w:body>")
    if body_end == -1:
        raise ValueError("document.xml 中找不到 </w:body>")

    # 在 body_end 之前，从后往前找最近的 <w:sectPr
    search_region = doc_content[:body_end]
    start = search_region.rfind("<w:sectPr")
    if start == -1:
        raise ValueError("文档中找不到默认节 <w:sectPr>")

    end = _find_closing_tag(doc_content, start, "w:sectPr")
    return (start, end)


def _find_indexed_sect_pr_span(doc_content: str, section: int) -> tuple:
    """定位段落内嵌 <w:sectPr>（节索引，0-based）。

    段落内嵌 sectPr 的结构：<w:p>...<w:pPr>...<w:sectPr>...</w:sectPr>...</w:pPr>...</w:p>
    """
    idx = 0
    search_start = 0
    # 匹配 <w:pPr> 内的 <w:sectPr>（段落级节分隔符）
    ppr_pattern = re.compile(r"<w:pPr[\s>]")
    while True:
        ppr_match = ppr_pattern.search(doc_content, search_start)
        if not ppr_match:
            break
        ppr_start = ppr_match.start()
        ppr_end = _find_closing_tag(doc_content, ppr_start, "w:pPr")

        ppr_content = doc_content[ppr_start:ppr_end]
        sp_offset = ppr_content.find("<w:sectPr")
        if sp_offset != -1:
            if idx == section:
                abs_start = ppr_start + sp_offset
                abs_end = _find_closing_tag(doc_content, abs_start, "w:sectPr")
                return (abs_start, abs_end)
            idx += 1

        search_start = ppr_end

    raise ValueError(f"找不到第 {section} 个节（0-based）")


def _find_closing_tag(content: str, open_start: int, tag_name: str) -> int:
    """从 open_start 位置开始，找到对应闭合标签的结束位置（含 >）。

    支持自闭合标签（<w:sectPr ... />）和普通闭合标签（</w:sectPr>）。

    :param content: XML 字符串
    :param open_start: 开标签 < 的位置
    :param tag_name: 标签名，如 "w:sectPr"
    :return: 闭合标签 > 之后的位置（即 end exclusive）
    :raises ValueError: 找不到闭合标签
    """
    # 先找开标签的结束 >
    tag_end = content.find(">", open_start)
    if tag_end == -1:
        raise ValueError(f"找不到 <{tag_name}> 的结束 >")

    # 自闭合标签
    if content[tag_end - 1] == "/":
        return tag_end + 1

    # 普通标签，需要处理嵌套
    depth = 1
    pos = tag_end + 1
    open_pat = re.compile(rf"<{re.escape(tag_name)}[\s>/]")
    close_pat = re.compile(rf"</{re.escape(tag_name)}>")

    while depth > 0 and pos < len(content):
        next_open = open_pat.search(content, pos)
        next_close = close_pat.search(content, pos)

        if next_close is None:
            raise ValueError(f"找不到 </{tag_name}> 闭合标签")

        if next_open is not None and next_open.start() < next_close.start():
            # 遇到嵌套开标签，先检查是否自闭合
            nested_tag_end = content.find(">", next_open.start())
            if nested_tag_end != -1 and content[nested_tag_end - 1] == "/":
                pos = nested_tag_end + 1
            else:
                depth += 1
                pos = nested_tag_end + 1 if nested_tag_end != -1 else pos + 1
        else:
            depth -= 1
            pos = next_close.end()

    return pos


def _insert_into_sect_pr(doc_content: str, sect_start: int, sect_end: int, xml_fragment: str) -> str:
    """在 sectPr 内部（开标签之后）插入 XML 片段。

    :param doc_content: document.xml 原始字符串
    :param sect_start: sectPr 开始位置
    :param sect_end: sectPr 结束位置（exclusive）
    :param xml_fragment: 要插入的 XML 字符串
    :return: 修改后的完整字符串
    """
    sect_block = doc_content[sect_start:sect_end]
    open_tag_end = sect_block.find(">")
    if open_tag_end == -1:
        raise ValueError("sectPr 块中找不到 >")

    if sect_block[open_tag_end - 1] == "/":
        # 自闭合标签 <w:sectPr ... />
        new_sect = sect_block[:open_tag_end - 1] + ">" + xml_fragment + "</w:sectPr>"
    else:
        # 普通标签 <w:sectPr ...>
        # 必须插入在 headerReference 和 footerReference 之后，其他元素之前

        # 查找所有的 headerReference 和 footerReference
        # 注意：自闭合标签以 /> 结尾，普通标签以 > 结尾
        ref_pattern = re.compile(
            r'<(?:w:headerReference|w:footerReference)\b[^>]*/>|'
            r'<(?:w:headerReference|w:footerReference)\b[^>]*>.*?</(?:w:headerReference|w:footerReference)>'
        )

        insert_pos = open_tag_end + 1
        for m in ref_pattern.finditer(sect_block):
            if m.end() > insert_pos:
                insert_pos = m.end()

        new_sect = sect_block[:insert_pos] + xml_fragment + sect_block[insert_pos:]

    return doc_content[:sect_start] + new_sect + doc_content[sect_end:]


def _remove_from_sect_pr(doc_content: str, sect_start: int, sect_end: int, pattern: re.Pattern) -> str:
    """从 sectPr 内部删除匹配 pattern 的所有元素。

    :param doc_content: document.xml 原始字符串
    :param sect_start: sectPr 开始位置
    :param sect_end: sectPr 结束位置（exclusive）
    :param pattern: 用于匹配要删除元素的正则
    :return: 修改后的完整字符串
    """
    sect_block = doc_content[sect_start:sect_end]
    new_sect = pattern.sub("", sect_block)
    return doc_content[:sect_start] + new_sect + doc_content[sect_end:]


def _has_hf_reference_in_raw(doc_content: str, sect_start: int, sect_end: int,
                              hf_type: str, position: str) -> bool:
    """检查 sectPr 块中是否已存在指定类型和位置的页眉/页脚引用。"""
    sect_block = doc_content[sect_start:sect_end]
    w_type = POSITION_MAP[position]
    ref_tag = f"w:{hf_type}Reference"

    pattern = re.compile(rf'<{re.escape(ref_tag)}\b[^>]*>')
    for m in pattern.finditer(sect_block):
        tag_str = m.group(0)
        type_match = re.search(r'w:type="([^"]+)"', tag_str)
        actual_type = type_match.group(1) if type_match else "default"
        if actual_type == w_type:
            return True
    return False


def _get_rid_from_sect_pr_raw(doc_content: str, sect_start: int, sect_end: int,
                               hf_type: str, position: str) -> str:
    """从 sectPr 块中提取指定类型和位置的页眉/页脚引用的 rId。"""
    sect_block = doc_content[sect_start:sect_end]
    w_type = POSITION_MAP[position]
    ref_tag = f"w:{hf_type}Reference"

    pattern = re.compile(rf'<{re.escape(ref_tag)}\b[^>]*>')
    for m in pattern.finditer(sect_block):
        tag_str = m.group(0)
        type_match = re.search(r'w:type="([^"]+)"', tag_str)
        actual_type = type_match.group(1) if type_match else "default"
        if actual_type == w_type:
            rid_match = re.search(r'(?:r|w):id="([^"]+)"', tag_str)
            if rid_match:
                return rid_match.group(1)
    return ""


def _remove_hf_reference_from_sect_pr(doc_content: str, sect_start: int, sect_end: int,
                                      hf_type: str, position: str) -> str:
    """从 sectPr 块中安全移除指定类型和位置的页眉/页脚引用。"""
    sect_block = doc_content[sect_start:sect_end]
    w_type = POSITION_MAP[position]
    ref_tag = f"w:{hf_type}Reference"

    pattern = re.compile(rf'<{re.escape(ref_tag)}\b[^>]*>')
    for m in pattern.finditer(sect_block):
        tag_str = m.group(0)
        type_match = re.search(r'w:type="([^"]+)"', tag_str)
        actual_type = type_match.group(1) if type_match else "default"
        if actual_type == w_type:
            start_idx = m.start()
            if tag_str.endswith("/>"):
                end_idx = m.end()
            else:
                close_tag = f"</{ref_tag}>"
                close_idx = sect_block.find(close_tag, m.end())
                if close_idx != -1:
                    end_idx = close_idx + len(close_tag)
                else:
                    end_idx = m.end()

            new_sect = sect_block[:start_idx] + sect_block[end_idx:]
            return doc_content[:sect_start] + new_sect + doc_content[sect_end:]

    return doc_content


def _has_title_pg_in_raw(doc_content: str, sect_start: int, sect_end: int) -> bool:
    """检查 sectPr 块中是否存在 <w:titlePg>。"""
    sect_block = doc_content[sect_start:sect_end]
    return bool(re.search(r"<w:titlePg\b", sect_block))


def _has_any_first_ref_in_raw(doc_content: str, sect_start: int, sect_end: int) -> bool:
    """检查 sectPr 块中是否还有任何 first 类型的页眉/页脚引用。"""
    sect_block = doc_content[sect_start:sect_end]
    return bool(re.search(r'w:type="first"', sect_block))


def _insert_title_pg(doc_content: str, sect_start: int, sect_end: int) -> str:
    """在 sectPr 中按 OOXML Schema 顺序插入 <w:titlePg/>。

    根据 ECMA-376 规范，sectPr 子元素的正确顺序为：
        headerReference → footerReference → endnotePr → type → pgSz → pgMar →
        paperSrc → pgBorders → lnNumType → pgNumType → cols → formProt →
        vAlign → noEndnote → titlePg → textDirection → bidi → rtlGutter →
        docGrid → printerSettings → sectPrChange
    因此 titlePg 必须插入在 textDirection / bidi / rtlGutter / docGrid /
    printerSettings / sectPrChange 等元素之前。

    :param doc_content: document.xml 原始字符串
    :param sect_start: sectPr 开始位置
    :param sect_end: sectPr 结束位置（exclusive）
    :return: 修改后的完整字符串
    """
    sect_block = doc_content[sect_start:sect_end]
    open_tag_end = sect_block.find(">")
    if open_tag_end == -1:
        raise ValueError("sectPr 块中找不到 >")

    if sect_block[open_tag_end - 1] == "/":
        # 自闭合标签 <w:sectPr ... />
        # 展开为 <w:sectPr ...><w:titlePg/></w:sectPr>
        new_sect = sect_block[:open_tag_end - 1] + "><w:titlePg/></w:sectPr>"
    else:
        # 普通标签 <w:sectPr ...>...</w:sectPr>
        # 按 OOXML Schema 顺序，titlePg 应在以下元素之前插入
        after_title_pg_tags = (
            "w:textDirection",
            "w:bidi",
            "w:rtlGutter",
            "w:docGrid",
            "w:printerSettings",
            "w:sectPrChange",
        )
        # 找到第一个排在 titlePg 之后的元素的位置
        insert_pos = -1
        for tag in after_title_pg_tags:
            # 匹配开标签（自闭合或普通）
            pattern = re.compile(rf"<{re.escape(tag)}[\s>/]")
            m = pattern.search(sect_block)
            if m:
                if insert_pos == -1 or m.start() < insert_pos:
                    insert_pos = m.start()

        if insert_pos == -1:
            # 没有找到任何排在 titlePg 之后的元素，插入到 </w:sectPr> 之前
            close_tag_start = sect_block.rfind("</w:sectPr>")
            if close_tag_start == -1:
                raise ValueError("sectPr 块中找不到 </w:sectPr>")
            insert_pos = close_tag_start

        new_sect = sect_block[:insert_pos] + "<w:titlePg/>" + sect_block[insert_pos:]

    return doc_content[:sect_start] + new_sect + doc_content[sect_end:]


# ---------------------------------------------------------------------------
# 工具函数：基于字符串操作 document.xml.rels
# ---------------------------------------------------------------------------

def _add_rel_to_raw(rels_content: str, new_rid: str, rel_type: str, target: str) -> str:
    """向 document.xml.rels 原始字符串中追加一条 Relationship 元素。

    :param rels_content: rels 文件的原始字符串
    :param new_rid: 新关系 ID
    :param rel_type: 关系类型 URI
    :param target: 目标文件名
    :return: 修改后的字符串
    """
    new_rel = (
        f'<Relationship Id="{new_rid}" '
        f'Type="{rel_type}" '
        f'Target="{target}"/>'
    )
    # 在 </Relationships> 之前插入
    close_tag = "</Relationships>"
    pos = rels_content.rfind(close_tag)
    if pos == -1:
        raise ValueError("document.xml.rels 中找不到 </Relationships>")
    return rels_content[:pos] + new_rel + rels_content[pos:]


def _remove_rel_from_raw(rels_content: str, rid: str) -> str:
    """从 document.xml.rels 原始字符串中删除指定 rId 的 Relationship 元素。"""
    pattern = re.compile(
        rf'<Relationship\b[^>]*\bId="{re.escape(rid)}"[^/]*/>'
        rf'|<Relationship\b[^>]*\bId="{re.escape(rid)}"[^>]*/>'
    )
    return pattern.sub("", rels_content)


def _get_target_from_rels_raw(rels_content: str, rid: str) -> str:
    """从 document.xml.rels 原始字符串中获取指定 rId 的 Target 文件名。"""
    pattern = re.compile(
        rf'<Relationship\b[^>]*\bId="{re.escape(rid)}"[^>]*/>'
    )
    m = pattern.search(rels_content)
    if not m:
        return ""
    target_match = re.search(r'Target="([^"]+)"', m.group(0))
    return os.path.basename(target_match.group(1)) if target_match else ""


# ---------------------------------------------------------------------------
# 工具函数：操作 document.xml 中的 sectPr（ElementTree，仅用于 list 子命令）
# ---------------------------------------------------------------------------

def _get_sect_pr(doc_root: ET.Element, section: int) -> ET.Element:
    """获取指定节的 <w:sectPr> 元素（仅用于 list 子命令只读场景）。

    :param doc_root: document.xml 的根元素
    :param section: -1 表示文档默认节（body 直接子元素），>=0 表示节索引（0-based）
    :return: <w:sectPr> 元素
    :raises ValueError: 找不到指定节
    """
    body = doc_root.find(f"{W}body")
    if body is None:
        raise ValueError("document.xml 中找不到 <w:body>")

    if section == -1:
        sect_pr = body.find(f"{W}sectPr")
        if sect_pr is None:
            raise ValueError("文档中找不到默认节 <w:sectPr>")
        return sect_pr

    idx = 0
    for child in body:
        if child.tag == f"{W}p":
            ppr = child.find(f"{W}pPr")
            if ppr is not None:
                sp = ppr.find(f"{W}sectPr")
                if sp is not None:
                    if idx == section:
                        return sp
                    idx += 1
    raise ValueError(f"找不到第 {section} 个节（0-based）")


def _find_hf_reference(sect_pr: ET.Element, hf_type: str, position: str) -> ET.Element:
    """在 sectPr 中查找指定类型和位置的页眉/页脚引用元素（仅用于 list 子命令）。

    :param sect_pr: <w:sectPr> 元素
    :param hf_type: "header" 或 "footer"
    :param position: "default" / "first" / "even"
    :return: 找到的元素，或 None
    """
    tag = f"{W}{hf_type}Reference"
    w_type = POSITION_MAP[position]
    for child in sect_pr:
        if child.tag == tag and child.get(f"{W}type") == w_type:
            return child
    return None


def _get_hf_filename_from_rels(
    rels_tree: ET.ElementTree,
    rid: str,
) -> str:
    """根据 rId 从 document.xml.rels 中获取文件名（不含路径）。"""
    root = rels_tree.getroot()
    for rel in root:
        if rel.get("Id") == rid:
            target = rel.get("Target", "")
            return os.path.basename(target)
    return ""


def _extract_text_from_hf_xml(xml_path: str) -> str:
    """从页眉/页脚 XML 文件中提取纯文本内容。"""
    if not os.path.exists(xml_path):
        return ""
    try:
        tree = ET.parse(xml_path)
        root = tree.getroot()
        texts = []
        for elem in root.iter():
            if elem.tag == f"{W}t" and elem.text:
                texts.append(elem.text)
            elif elem.tag == f"{W}instrText" and elem.text:
                if "NUMPAGES" in elem.text:
                    texts.append("{NUMPAGES}")
                elif "PAGE" in elem.text:
                    texts.append("{PAGE}")
        return "".join(texts) if texts else "(空)"
    except ET.ParseError:
        return "(解析失败)"


# ---------------------------------------------------------------------------
# 子命令：list
# ---------------------------------------------------------------------------

def cmd_list(unpacked_dir: str, args: argparse.Namespace) -> int:
    """列出文档中所有节的页眉页脚信息。"""
    doc_path = _document_xml_path(unpacked_dir)
    rels_path = _rels_path(unpacked_dir)
    word_dir = _word_dir(unpacked_dir)

    try:
        doc_tree = _parse_xml(doc_path)
        rels_tree = _parse_xml(rels_path)
    except (OSError, ET.ParseError) as exc:
        print(f"Error: 无法解析文档文件：{exc}")
        return 1

    doc_root = doc_tree.getroot()
    body = doc_root.find(f"{W}body")
    if body is None:
        print("Error: document.xml 中找不到 <w:body>")
        return 1

    # 收集所有 sectPr：先收集段落内的，最后收集 body 直接子元素的
    sect_prs = []
    for child in body:
        if child.tag == f"{W}p":
            ppr = child.find(f"{W}pPr")
            if ppr is not None:
                sp = ppr.find(f"{W}sectPr")
                if sp is not None:
                    sect_prs.append(("section", len(sect_prs), sp))
    default_sp = body.find(f"{W}sectPr")
    if default_sp is not None:
        sect_prs.append(("default", -1, default_sp))

    found_any = False
    for sect_label, sect_idx, sect_pr in sect_prs:
        if sect_label == "default":
            sect_desc = "默认节（section=-1）"
        else:
            sect_desc = f"节 {sect_idx}（section={sect_idx}）"

        has_title_pg = sect_pr.find(f"{W}titlePg") is not None

        hf_refs = []
        for hf_type in ("header", "footer"):
            tag = f"{W}{hf_type}Reference"
            for ref in sect_pr.findall(tag):
                rid = ref.get(f"{R}id", "")
                if not rid:
                    rid = ref.get(f"{W}id", "")
                w_type = ref.get(f"{W}type", "default")
                filename = _get_hf_filename_from_rels(rels_tree, rid)
                xml_path = os.path.join(word_dir, filename) if filename else ""
                text = _extract_text_from_hf_xml(xml_path) if xml_path else "(文件未找到)"
                hf_refs.append((hf_type, w_type, filename, rid, text))

        if hf_refs:
            found_any = True
            print(f"\n[{sect_desc}]")
            if has_title_pg:
                print("  ⚑ 首页不同已启用")
            for hf_type, w_type, filename, rid, text in hf_refs:
                type_cn = "页眉" if hf_type == "header" else "页脚"
                pos_cn = {"default": "默认", "first": "首页", "even": "偶数页"}.get(w_type, w_type)
                print(f"  [{type_cn}/{pos_cn}] 文件: {filename}  rId: {rid}  内容: {text}")

    if not found_any:
        print("No headers or footers found")
    return 0


# ---------------------------------------------------------------------------
# 工具函数：清理未被引用的孤儿页眉/页脚文件
# ---------------------------------------------------------------------------

def _get_referenced_targets(rels_content: str) -> set:
    """从 document.xml.rels 原始字符串中提取所有被引用的 Target 文件名集合。

    :param rels_content: document.xml.rels 的原始字符串内容
    :return: 被引用的文件名集合（不含路径），如 {"footer1.xml", "header1.xml"}
    """
    targets = set()
    for m in re.finditer(r'Target="([^"]*)"', rels_content):
        targets.add(os.path.basename(m.group(1)))
    return targets


def _clean_orphan_hf_files(
    word_dir: str,
    prefix: str,
    rels_content: str,
    ct_tree: ET.ElementTree,
) -> ET.ElementTree:
    """清理 word/ 目录中未被 document.xml.rels 引用的同类孤儿文件。

    扫描 word/ 目录下所有 {prefix}N.xml 文件（如 footer1.xml），
    检查每个文件是否被 rels 引用，未被引用的将被删除，同时移除
    [Content_Types].xml 中对应的 Override 条目。

    :param word_dir: word/ 目录路径
    :param prefix: 文件前缀，如 "header" 或 "footer"
    :param rels_content: document.xml.rels 的原始字符串内容
    :param ct_tree: [Content_Types].xml 的 ElementTree
    :return: 更新后的 ct_tree
    """
    referenced = _get_referenced_targets(rels_content)
    pattern = re.compile(rf"^{re.escape(prefix)}(\d+)\.xml$", re.IGNORECASE)

    for name in os.listdir(word_dir):
        if not pattern.match(name):
            continue
        if name in referenced:
            continue

        # 该文件未被 rels 引用，是孤儿文件
        file_path = os.path.join(word_dir, name)
        try:
            os.remove(file_path)
        except OSError as exc:
            print(f"WARN: 无法删除孤儿文件 {name}：{exc}")
            continue

        # 从 [Content_Types].xml 中移除对应条目
        _unregister_content_type(ct_tree, f"/word/{name}")
        print(f"WARN: 已清理未引用的孤儿文件：{name}")

    return ct_tree


# ---------------------------------------------------------------------------
# 子命令：add
# ---------------------------------------------------------------------------

def _add_single_hf(
    unpacked_dir: str,
    hf_type: str,
    position: str,
    section: int,
    text: str,
    font: str,
    size: float,
    align: str,
    doc_content: str,
    rels_content: str,
    ct_tree: ET.ElementTree,
) -> tuple:
    """添加单个页眉或页脚（内部函数）。

    :return: (doc_content, rels_content, ct_tree, exit_code)
        exit_code 为 0 表示成功，非 0 表示失败
    """
    word_dir = _word_dir(unpacked_dir)
    doc_path = _document_xml_path(unpacked_dir)

    # 定位 sectPr
    try:
        sect_start, sect_end = _find_sect_pr_span(doc_content, section)
    except ValueError as exc:
        print(f"Error: {exc}")
        return (doc_content, rels_content, ct_tree, 1)

    # 检查是否已存在
    if _has_hf_reference_in_raw(doc_content, sect_start, sect_end, hf_type, position):
        print(
            f"Error: 该节的 {hf_type}/{position} 位置已存在页眉/页脚，"
            f"请使用 modify 子命令修改。"
        )
        return (doc_content, rels_content, ct_tree, 1)

    # 清理同类孤儿文件（未被 rels 引用的 header/footer 文件）
    prefix = "header" if hf_type == "header" else "footer"
    ct_tree = _clean_orphan_hf_files(word_dir, prefix, rels_content, ct_tree)

    # 生成新文件名
    file_idx = _next_file_index(word_dir, prefix)
    filename = f"{prefix}{file_idx}.xml"
    file_path = os.path.join(word_dir, filename)

    # 构建 XML 内容
    hf_tag = "hdr" if hf_type == "header" else "ftr"
    xml_content = _build_hf_xml(hf_tag, text, font, size, align)

    # 写入页眉/页脚文件
    try:
        with open(file_path, "w", encoding="utf-8") as fh:
            fh.write(xml_content)
    except OSError as exc:
        print(f"Error: 无法写入文件 {file_path}：{exc}")
        return (doc_content, rels_content, ct_tree, 1)

    # 更新 document.xml.rels（字符串方式）
    new_rid = _next_rid_from_raw(rels_content)
    rel_type = RT_HEADER if hf_type == "header" else RT_FOOTER
    try:
        rels_content = _add_rel_to_raw(rels_content, new_rid, rel_type, filename)
    except ValueError as exc:
        print(f"Error: 更新 rels 失败：{exc}")
        return (doc_content, rels_content, ct_tree, 1)

    # 更新 [Content_Types].xml（ElementTree 方式，该文件无原始命名空间问题）
    ct_type = CT_HEADER if hf_type == "header" else CT_FOOTER
    _register_content_type(ct_tree, f"/word/{filename}", ct_type)

    # 在 sectPr 中插入引用（字符串方式）
    w_type = POSITION_MAP[position]
    ref_xml = f'<w:headerReference w:type="{w_type}" r:id="{new_rid}"/>'
    if hf_type == "footer":
        ref_xml = f'<w:footerReference w:type="{w_type}" r:id="{new_rid}"/>'

    try:
        doc_content = _insert_into_sect_pr(doc_content, sect_start, sect_end, ref_xml)
    except ValueError as exc:
        print(f"Error: 修改 document.xml 失败：{exc}")
        return (doc_content, rels_content, ct_tree, 1)

    # 若 position == first，单独插入 titlePg（如果不存在）
    if position == "first":
        # 重新定位 sectPr，因为前一步插入 ref 后字符串偏移已变化
        try:
            sect_start, sect_end = _find_sect_pr_span(doc_content, section)
        except ValueError as exc:
            print(f"Error: 重新定位 sectPr 失败：{exc}")
            return (doc_content, rels_content, ct_tree, 1)

        if not _has_title_pg_in_raw(doc_content, sect_start, sect_end):
            try:
                doc_content = _insert_title_pg(doc_content, sect_start, sect_end)
            except ValueError as exc:
                print(f"Error: 插入 titlePg 失败：{exc}")
                return (doc_content, rels_content, ct_tree, 1)

    type_cn = "页眉" if hf_type == "header" else "页脚"
    pos_cn = {"default": "默认", "first": "首页", "even": "偶数页"}.get(position, position)
    print(f"OK: 已添加{type_cn}（{pos_cn}），文件：{filename}，rId：{new_rid}")
    return (doc_content, rels_content, ct_tree, 0)


def cmd_add(unpacked_dir: str, args: argparse.Namespace) -> int:
    """添加新的页眉或页脚。

    当 --position 为 all 时，同时添加 default 和 first 两个位置的
    页眉/页脚（使用相同的文本、字体、字号和对齐方式），确保无论
    文档是否已启用"首页不同"（titlePg），所有页面都能正确显示。
    """
    hf_type = args.type
    position = args.position
    section = args.section
    text = args.text if args.text is not None else ""
    font = args.font or ""
    size = args.size or 0.0
    align = args.align or ""

    doc_path = _document_xml_path(unpacked_dir)
    rels_path_str = _rels_path(unpacked_dir)
    ct_path = _content_types_path(unpacked_dir)

    # 读取原始字符串（保留命名空间）
    try:
        doc_content = _read_raw(doc_path)
        rels_content = _read_raw(rels_path_str)
        ct_tree = _parse_xml(ct_path)
    except (OSError, ET.ParseError) as exc:
        print(f"Error: 无法解析文档文件：{exc}")
        return 1

    # 确定要处理的 position 列表
    # all 同时添加 default + first，确保无论是否启用首页不同都能覆盖所有页面
    positions = ["default", "first"] if position == "all" else [position]

    for pos in positions:
        doc_content, rels_content, ct_tree, rc = _add_single_hf(
            unpacked_dir, hf_type, pos, section, text, font, size, align,
            doc_content, rels_content, ct_tree,
        )
        if rc != 0:
            return rc

    # 保存所有文件
    try:
        _write_raw(doc_path, doc_content)
        _write_raw(rels_path_str, rels_content)
        _write_xml_tree(ct_tree, ct_path)
    except OSError as exc:
        print(f"Error: 保存文件失败：{exc}")
        return 1

    return 0


# ---------------------------------------------------------------------------
# 子命令：modify
# ---------------------------------------------------------------------------

def cmd_modify(unpacked_dir: str, args: argparse.Namespace) -> int:
    """修改现有页眉或页脚的文本和格式。"""
    hf_type = args.type
    position = args.position
    section = args.section
    text = args.text if args.text is not None else ""
    font = args.font or ""
    size = args.size or 0.0
    align = args.align or ""

    doc_path = _document_xml_path(unpacked_dir)
    rels_path_str = _rels_path(unpacked_dir)
    word_dir = _word_dir(unpacked_dir)

    # 读取原始字符串（保留命名空间）
    try:
        doc_content = _read_raw(doc_path)
        rels_content = _read_raw(rels_path_str)
    except OSError as exc:
        print(f"Error: 无法读取文档文件：{exc}")
        return 1

    # 定位 sectPr
    try:
        sect_start, sect_end = _find_sect_pr_span(doc_content, section)
    except ValueError as exc:
        print(f"Error: {exc}")
        return 1

    # 检查是否存在
    if not _has_hf_reference_in_raw(doc_content, sect_start, sect_end, hf_type, position):
        print(
            f"Error: 该节的 {hf_type}/{position} 位置不存在页眉/页脚，"
            f"请使用 add 子命令添加。"
        )
        return 1

    rid = _get_rid_from_sect_pr_raw(doc_content, sect_start, sect_end, hf_type, position)
    if not rid:
        print(f"Error: 无法从 sectPr 中提取 rId")
        return 1

    filename = _get_target_from_rels_raw(rels_content, rid)
    if not filename:
        print(f"Error: 找不到 rId={rid} 对应的文件关系")
        return 1

    file_path = os.path.join(word_dir, filename)

    # 重新生成 XML 内容
    hf_tag = "hdr" if hf_type == "header" else "ftr"
    xml_content = _build_hf_xml(hf_tag, text, font, size, align)

    try:
        with open(file_path, "w", encoding="utf-8") as fh:
            fh.write(xml_content)
    except OSError as exc:
        print(f"Error: 无法写入文件 {file_path}：{exc}")
        return 1

    type_cn = "页眉" if hf_type == "header" else "页脚"
    pos_cn = {"default": "默认", "first": "首页", "even": "偶数页"}.get(position, position)
    print(f"OK: 已修改{type_cn}（{pos_cn}），文件：{filename}")
    return 0


# ---------------------------------------------------------------------------
# 子命令：remove
# ---------------------------------------------------------------------------

def cmd_remove(unpacked_dir: str, args: argparse.Namespace) -> int:
    """删除指定的页眉或页脚。"""
    hf_type = args.type
    position = args.position
    section = args.section

    doc_path = _document_xml_path(unpacked_dir)
    rels_path_str = _rels_path(unpacked_dir)
    ct_path = _content_types_path(unpacked_dir)
    word_dir = _word_dir(unpacked_dir)

    # 读取原始字符串（保留命名空间）
    try:
        doc_content = _read_raw(doc_path)
        rels_content = _read_raw(rels_path_str)
        ct_tree = _parse_xml(ct_path)
    except (OSError, ET.ParseError) as exc:
        print(f"Error: 无法解析文档文件：{exc}")
        return 1

    # 定位 sectPr
    try:
        sect_start, sect_end = _find_sect_pr_span(doc_content, section)
    except ValueError as exc:
        print(f"Error: {exc}")
        return 1

    # 检查是否存在
    if not _has_hf_reference_in_raw(doc_content, sect_start, sect_end, hf_type, position):
        print(f"Error: 该节的 {hf_type}/{position} 位置不存在页眉/页脚")
        return 1

    rid = _get_rid_from_sect_pr_raw(doc_content, sect_start, sect_end, hf_type, position)
    filename = _get_target_from_rels_raw(rels_content, rid) if rid else ""

    # 从 sectPr 移除引用（字符串方式）
    doc_content = _remove_hf_reference_from_sect_pr(doc_content, sect_start, sect_end, hf_type, position)

    # 重新定位 sectPr（内容已变化，位置可能偏移）
    try:
        sect_start, sect_end = _find_sect_pr_span(doc_content, section)
    except ValueError as exc:
        print(f"Error: {exc}")
        return 1

    # 若删除 first 类型后该节不再有任何 first 引用，移除 titlePg
    if position == "first" and not _has_any_first_ref_in_raw(doc_content, sect_start, sect_end):
        if _has_title_pg_in_raw(doc_content, sect_start, sect_end):
            title_pg_pattern = re.compile(r"<w:titlePg\s*/>|<w:titlePg/>")
            try:
                doc_content = _remove_from_sect_pr(
                    doc_content, sect_start, sect_end, title_pg_pattern
                )
            except ValueError as exc:
                print(f"Error: 移除 titlePg 失败：{exc}")
                return 1

    # 从 rels 中移除关系（字符串方式）
    if rid:
        rels_content = _remove_rel_from_raw(rels_content, rid)

    # 从 [Content_Types].xml 中移除注册
    if filename:
        _unregister_content_type(ct_tree, f"/word/{filename}")

    # 删除 XML 文件
    if filename:
        file_path = os.path.join(word_dir, filename)
        if os.path.exists(file_path):
            try:
                os.remove(file_path)
            except OSError as exc:
                print(f"Error: 无法删除文件 {file_path}：{exc}")
                return 1

    # 保存所有文件
    try:
        _write_raw(doc_path, doc_content)
        _write_raw(rels_path_str, rels_content)
        _write_xml_tree(ct_tree, ct_path)
    except OSError as exc:
        print(f"Error: 保存文件失败：{exc}")
        return 1

    type_cn = "页眉" if hf_type == "header" else "页脚"
    pos_cn = {"default": "默认", "first": "首页", "even": "偶数页"}.get(position, position)
    print(f"OK: 已删除{type_cn}（{pos_cn}），文件：{filename}，rId：{rid}")
    return 0


# ---------------------------------------------------------------------------
# 命令行接口
# ---------------------------------------------------------------------------

def _build_parser() -> argparse.ArgumentParser:
    """构建命令行参数解析器。"""
    parser = argparse.ArgumentParser(
        description="管理 DOCX 文档的页眉和页脚",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("unpacked_dir", help="解包后的 DOCX 目录路径")

    subparsers = parser.add_subparsers(dest="subcommand", required=True)

    # list 子命令
    subparsers.add_parser("list", help="列出所有页眉页脚信息")

    # 通用参数工厂
    def _add_common_args(sub: argparse.ArgumentParser, require_type: bool = True) -> None:
        if require_type:
            sub.add_argument(
                "--type",
                required=True,
                choices=["header", "footer"],
                help="类型：header（页眉）或 footer（页脚）",
            )
        sub.add_argument(
            "--position",
            default="default",
            choices=["default", "first", "even", "all"],
            help="位置：default / first / even / all（仅 add 支持 all），默认 default",
        )
        sub.add_argument(
            "--section",
            type=int,
            default=-1,
            help="节索引（0-based），-1 表示文档默认节，默认 -1",
        )

    def _add_text_args(sub: argparse.ArgumentParser) -> None:
        sub.add_argument("--text", required=True, help="文本内容（支持 {PAGE} 和 {NUMPAGES}）")
        sub.add_argument("--font", default="", help="字体名称（如 宋体、Arial）")
        sub.add_argument("--size", type=float, default=0.0, help="字号（磅）")
        sub.add_argument(
            "--align",
            default="",
            choices=["", "left", "center", "right"],
            help="对齐方式：left / center / right",
        )

    # add 子命令
    add_parser = subparsers.add_parser("add", help="添加新的页眉或页脚")
    _add_common_args(add_parser)
    _add_text_args(add_parser)
    # add 子命令的 --position 默认值改为 all（同时添加 default + first）
    add_parser.set_defaults(position="all")

    # modify 子命令
    modify_parser = subparsers.add_parser("modify", help="修改现有页眉或页脚")
    _add_common_args(modify_parser)
    _add_text_args(modify_parser)

    # remove 子命令
    remove_parser = subparsers.add_parser("remove", help="删除页眉或页脚")
    _add_common_args(remove_parser)

    return parser


def main() -> int:
    """脚本入口。"""
    parser = _build_parser()
    args = parser.parse_args()

    unpacked_dir = args.unpacked_dir
    if not os.path.isdir(unpacked_dir):
        print(f"Error: 解包目录不存在：{unpacked_dir}")
        return 1

    dispatch = {
        "list": cmd_list,
        "add": cmd_add,
        "modify": cmd_modify,
        "remove": cmd_remove,
    }
    handler = dispatch.get(args.subcommand)
    if handler is None:
        print(f"Error: 未知子命令：{args.subcommand}")
        return 1

    return handler(unpacked_dir, args)


if __name__ == "__main__":
    sys.exit(main())
