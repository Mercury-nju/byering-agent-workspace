#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""通用XML插入脚本：将XML文件内容插入到解包后的DOCX文档中。

使用场景：
- 插入表格、图片、批注、修订等XML片段
- 支持多种插入位置：文档开头、末尾、指定页面、标题前后
- 自动处理XML格式验证和位置定位
- 页面定位复用 find_page.py 的逻辑，保持一致性

Usage:
    python insert_xml.py <unpacked_dir> <xml_file> [位置参数]

位置参数（互斥，只能选其一）：
    --append             插入到文档末尾
    --prepend            插入到文档开头
    --position POS       插入到 document.xml 中的指定字符偏移位置（配合 find_page.py 使用）
    --page N             插入到第N页开头（基于 find_page.py 定位）
    --before-heading TEXT 插入到指定标题之前（优先搜索 Heading 样式段落，找不到则自动搜索所有段落）
    --after-heading TEXT  插入到指定标题之后（优先搜索 Heading 样式段落，找不到则自动搜索所有段落）
    --before-text TEXT    插入到包含指定文本的段落之前（仅搜索所有段落，不优先搜索 Heading 样式）
    --after-text TEXT     插入到包含指定文本的段落之后（仅搜索所有段落，不优先搜索 Heading 样式）

xml_file 参数：
    必须是一个存在的 XML 文件路径，脚本从该文件读取 XML 内容。
    也兼容 @filepath 语法（去掉 @ 后作为文件路径）。

示例：
    # 从文件读取XML内容并插入到第2页开头
    python insert_xml.py unpacked/ table.xml --page 2

    # 先用 find_page.py 找到位置，再用 --position 直接插入
    # $ python find_page.py unpacked/ 2  =>  Position: 64248
    python insert_xml.py unpacked/ table.xml --position 64248

    # 从文件读取XML内容并插入到文档末尾
    python insert_xml.py unpacked/ content.xml --append

    # 也支持 @filepath 语法（向后兼容）
    python insert_xml.py unpacked/ @table.xml --page 2

    # 插入内容到"总结"标题之前
    python insert_xml.py unpacked/ heading_content.xml --before-heading "总结"

    # 插入内容到包含"2024-2025学年度"文本的段落之后（不要求是 Heading 样式）
    python insert_xml.py unpacked/ table.xml --after-text "2024-2025学年度"

注意：
- XML内容必须符合Word文档的XML格式规范
- 先将XML片段写入文件，再传文件路径给此脚本
- 脚本会自动验证XML格式的合法性
"""

import argparse
import random
import re
import sys
from pathlib import Path

try:
    import defusedxml.minidom
except ImportError:
    # 如果defusedxml不可用，使用标准库的xml.minidom
    import xml.minidom as defusedxml

# 复用 find_page.py 的页面查找逻辑
from find_page import find_page


# XML 命名空间包装器（用于验证片段时补全命名空间声明）
_NS_WRAPPER = (
    '<root'
    ' xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
    ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'
    ' xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"'
    ' xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"'
    ' xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"'
    ' xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"'
    ' xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"'
    ' xmlns:wp14="http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing"'
    ' xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml"'
    ' xmlns:w15="http://schemas.microsoft.com/office/word/2012/wordml"'
    ' xmlns:v="urn:schemas-microsoft-com:vml"'
    '>'
)


def _validate_xml_content(xml_content: str) -> tuple[bool, str]:
    """验证XML内容的格式是否合法。

    :param xml_content: 要插入的XML内容
    :return: (是否合法, 错误消息)
    """
    stripped = xml_content.strip()
    if not stripped:
        return False, "Error: XML content cannot be empty"

    # 检查基本的XML结构（对去除首尾空白后的内容检查）
    if not stripped.startswith('<') or not stripped.endswith('>'):
        return False, "Error: XML content must be valid XML with proper tags"

    # 尝试解析XML验证格式
    try:
        defusedxml.minidom.parseString(f"{_NS_WRAPPER}{stripped}</root>")
    except Exception as e:
        return False, f"Error: Invalid XML format: {str(e)}"

    return True, "OK"


def _ensure_table_completeness(xml_content: str, unpacked_dir: str = "") -> str:
    """检查并自动补全表格 XML 中缺失的 OOXML 必要属性，修复常见 schema 违规。

    Word 对 <w:tbl> 有严格的 OOXML schema 要求，即使 XML 语法合法，
    缺少以下必要属性也会导致文档打开报错：
    - <w:tblPr> 中必须有 <w:tblW>（表格宽度）
    - 每个 <w:tc> 中必须有 <w:tcPr>（含 <w:tcW> 单元格宽度）
    - 如果没有引用已有样式，需要显式定义 <w:tblBorders>（表格边框）
    - <w:shd> 元素不能包含非法属性（如 w:type="dxa"）
    - <w:tblStyle> 引用的样式必须在 styles.xml 中存在

    此函数在检测到缺失属性时自动补全，检测到非法属性时自动移除违规元素，
    检测到不存在的样式引用时移除并补充显式边框，避免生成的文档损坏。

    :param xml_content: 原始 XML 内容
    :param unpacked_dir: 解包后的 DOCX 目录路径，用于读取 styles.xml 校验样式
    :return: 补全/修复后的 XML 内容（如果不含 <w:tbl> 则原样返回）
    """
    if '<w:tbl' not in xml_content:
        return xml_content

    modified = xml_content

    # 1. 补全 <w:tblPr> 中缺失的 <w:tblW>（表格宽度：auto 自适应）
    if '<w:tblPr' in modified and '<w:tblW' not in modified:
        modified = re.sub(
            r'(<w:tblPr[^>]*>)',
            r'\1<w:tblW w:w="0" w:type="auto"/>',
            modified,
        )

    # 2. 如果没有 <w:tblPr>，在 <w:tbl> 之后添加完整的 <w:tblPr>
    if '<w:tblPr' not in modified:
        modified = re.sub(
            r'(<w:tbl[^>]*>)',
            r'\1<w:tblPr><w:tblW w:w="0" w:type="auto"/></w:tblPr>',
            modified,
        )

    # 3. 校验 <w:tblStyle> 引用的样式是否存在于 styles.xml 中
    # 如果不存在，移除无效的 <w:tblStyle> 引用，后续步骤会补充显式边框
    style_match = re.search(r'<w:tblStyle\s+w:val="([^"]+)"\s*/>', modified)
    if style_match and unpacked_dir:
        style_id = style_match.group(1)
        styles_path = Path(unpacked_dir) / "word" / "styles.xml"
        style_exists = False
        if styles_path.is_file():
            try:
                styles_content = styles_path.read_text(encoding="utf-8")
                # 检查 styles.xml 中是否定义了该 styleId
                style_exists = f'w:styleId="{style_id}"' in styles_content
            except Exception:
                # 读取失败时保守处理，假定样式存在
                style_exists = True
        else:
            # styles.xml 不存在时保守处理，假定样式存在
            style_exists = True

        if not style_exists:
            # 移除不存在的样式引用
            modified = re.sub(
                r'<w:tblStyle\s+w:val="[^"]+"\s*/>', '', modified,
            )
            print(
                f'Note: Removed invalid <w:tblStyle w:val="{style_id}"/> '
                f'(style not found in styles.xml), will add explicit borders'
            )

    # 4. 如果没有 <w:tblBorders> 且没有引用表格样式，添加默认边框
    if '<w:tblBorders' not in modified and '<w:tblStyle' not in modified:
        # 在 </w:tblPr> 之前插入默认边框定义
        default_borders = (
            '<w:tblBorders>'
            '<w:top w:val="single" w:sz="4" w:space="0" w:color="auto"/>'
            '<w:left w:val="single" w:sz="4" w:space="0" w:color="auto"/>'
            '<w:bottom w:val="single" w:sz="4" w:space="0" w:color="auto"/>'
            '<w:right w:val="single" w:sz="4" w:space="0" w:color="auto"/>'
            '<w:insideH w:val="single" w:sz="4" w:space="0" w:color="auto"/>'
            '<w:insideV w:val="single" w:sz="4" w:space="0" w:color="auto"/>'
            '</w:tblBorders>'
        )
        modified = modified.replace('</w:tblPr>', default_borders + '</w:tblPr>')

    # 5. 为每个缺少 <w:tcPr> 的 <w:tc> 补全单元格属性
    # 使用逐段处理方式，避免大正则回溯问题
    tc_tag = '<w:tc>'
    tc_tag_with_attr = '<w:tc '
    tc_pr_tag = '<w:tcPr'
    result_parts = []
    search_start = 0

    while True:
        # 查找下一个 <w:tc> 或 <w:tc ...>
        tc_pos1 = modified.find(tc_tag, search_start)
        tc_pos2 = modified.find(tc_tag_with_attr, search_start)

        if tc_pos1 == -1 and tc_pos2 == -1:
            result_parts.append(modified[search_start:])
            break

        if tc_pos1 == -1:
            tc_pos = tc_pos2
        elif tc_pos2 == -1:
            tc_pos = tc_pos1
        else:
            tc_pos = min(tc_pos1, tc_pos2)

        # 找到 <w:tc> 闭合标签 > 的位置
        tc_close = modified.find('>', tc_pos)
        if tc_close == -1:
            result_parts.append(modified[search_start:])
            break

        tc_end = tc_close + 1
        # 检查紧跟 <w:tc> 之后是否有 <w:tcPr
        after_tc = modified[tc_end:tc_end + 20].strip()
        if not after_tc.startswith('<w:tcPr'):
            # 缺少 <w:tcPr>，补全默认的单元格属性
            default_tc_pr = '<w:tcPr><w:tcW w:w="0" w:type="auto"/></w:tcPr>'
            result_parts.append(modified[search_start:tc_end])
            result_parts.append(default_tc_pr)
            search_start = tc_end
        else:
            # 已有 <w:tcPr>，检查其中是否有 <w:tcW>
            tc_pr_end = modified.find('</w:tcPr>', tc_end)
            if tc_pr_end != -1:
                tc_pr_content = modified[tc_end:tc_pr_end]
                if '<w:tcW' not in tc_pr_content:
                    # 在 <w:tcPr> 开始标签之后插入 <w:tcW>
                    tcpr_open_end = modified.find('>', modified.find('<w:tcPr', tc_end)) + 1
                    result_parts.append(modified[search_start:tcpr_open_end])
                    result_parts.append('<w:tcW w:w="0" w:type="auto"/>')
                    search_start = tcpr_open_end
                else:
                    result_parts.append(modified[search_start:tc_end])
                    search_start = tc_end
            else:
                result_parts.append(modified[search_start:tc_end])
                search_start = tc_end

    modified = ''.join(result_parts)

    # 6. 修复 <w:shd> 元素中的非法属性
    # agent 容易将 <w:tcW> 的 w:type="dxa" 等属性误用到 <w:shd> 上，
    # 导致 Word 因 schema 违规而报错。检测到非法属性时直接移除整个 <w:shd> 元素。
    _SHD_VALID_ATTRS = {
        'w:val', 'w:color', 'w:fill',
        'w:themeColor', 'w:themeTint', 'w:themeShade',
        'w:themeFill', 'w:themeFillTint', 'w:themeFillShade',
    }
    shd_pattern = re.compile(r'<w:shd\b([^/]*)/>')
    attr_pattern = re.compile(r'(w:\w+)=')

    def _fix_shd(match: re.Match) -> str:
        attrs_str = match.group(1)
        attr_names = set(attr_pattern.findall(attrs_str))
        invalid_attrs = attr_names - _SHD_VALID_ATTRS
        if invalid_attrs:
            # 含非法属性，移除整个 <w:shd> 元素
            return ''
        return match.group(0)

    fixed_shd = shd_pattern.sub(_fix_shd, modified)
    if fixed_shd != modified:
        print("Note: Removed <w:shd> element(s) with invalid attributes from table XML")
        modified = fixed_shd

    # 7. 验证补全后的 XML 仍然合法
    try:
        defusedxml.minidom.parseString(f"{_NS_WRAPPER}{modified}</root>")
    except Exception:
        # 如果补全后 XML 不合法，返回原始内容（不要让自动补全引入新问题）
        return xml_content

    return modified


def _collect_existing_ids(unpacked_dir: str) -> set[str]:
    """收集文档中已存在的所有 paraId 和 textId 值。

    :param unpacked_dir: 解包后的 DOCX 目录路径
    :return: 已存在的 ID 集合（大写十六进制字符串）
    """
    existing_ids: set[str] = set()
    doc_path = Path(unpacked_dir) / "word" / "document.xml"
    if doc_path.exists():
        doc_content = doc_path.read_text(encoding="utf-8")
        existing_ids.update(
            m.group(1).upper()
            for m in re.finditer(r'w14:paraId="([0-9A-Fa-f]+)"', doc_content)
        )
        existing_ids.update(
            m.group(1).upper()
            for m in re.finditer(r'w14:textId="([0-9A-Fa-f]+)"', doc_content)
        )
    return existing_ids


def _generate_unique_id(existing_ids: set[str]) -> str:
    """生成一个唯一且合规的 8 位十六进制 ID（< 0x80000000）。

    生成后自动将新 ID 添加到 existing_ids 集合中，防止后续调用产生重复。

    :param existing_ids: 已存在的 ID 集合（会被修改）
    :return: 新的唯一 ID
    """
    for __ in range(1000):
        value = random.randint(0x00000001, 0x7FFFFFFE)
        hex_id = f"{value:08X}"
        if hex_id not in existing_ids:
            existing_ids.add(hex_id)
            return hex_id
    # 极端情况：随机数碰撞超过 1000 次（几乎不可能）
    value = random.randint(0x00000001, 0x7FFFFFFE)
    hex_id = f"{value:08X}"
    existing_ids.add(hex_id)
    return hex_id


def _sanitize_ids(xml_content: str, unpacked_dir: str) -> str:
    """清理并修复 XML 片段中的 w14:paraId 和 w14:textId 属性值。

    agent 生成的 XML 常包含以下问题，会导致 Word 打开文档时报错：
    1. paraId 值 >= 0x80000000（OOXML 规范要求 < 0x80000000）
    2. paraId/textId 值重复（必须全文档唯一）
    3. textId 值全部相同（如全是 77777777）
    4. 片段中多个元素使用相同的 paraId（如全是 1B8C33C2）

    此函数会读取文档现有的 paraId 集合，为插入片段中的**每个** paraId/textId
    重新生成唯一且合规的随机值（每次调用 _generate_unique_id 都会产生不同的值）。

    :param xml_content: 要插入的 XML 片段
    :param unpacked_dir: 解包后的 DOCX 目录路径（用于读取现有 ID）
    :return: 修复后的 XML 内容
    """
    # 如果内容中没有 w14: 属性，直接返回
    if 'w14:paraId' not in xml_content and 'w14:textId' not in xml_content:
        return xml_content

    existing_ids = _collect_existing_ids(unpacked_dir)
    modified = xml_content
    replaced_count = 0

    # 替换所有 w14:paraId 值（每个匹配都生成全新唯一 ID）
    def _replace_para_id(match: re.Match) -> str:
        nonlocal replaced_count
        new_id = _generate_unique_id(existing_ids)
        replaced_count += 1
        return f'w14:paraId="{new_id}"'

    modified = re.sub(r'w14:paraId="[0-9A-Fa-f]+"', _replace_para_id, modified)

    # 替换所有 w14:textId 值（每个匹配都生成全新唯一 ID）
    def _replace_text_id(match: re.Match) -> str:
        nonlocal replaced_count
        new_id = _generate_unique_id(existing_ids)
        replaced_count += 1
        return f'w14:textId="{new_id}"'

    modified = re.sub(r'w14:textId="[0-9A-Fa-f]+"', _replace_text_id, modified)

    if replaced_count > 0:
        print(f"Note: Regenerated {replaced_count} paraId/textId values to ensure uniqueness and compliance")

    return modified


def _strip_xml_comments(xml_content: str) -> str:
    """移除 XML 片段中的注释节点。

    OOXML 规范中 <w:tbl>、<w:tr> 等元素内部不应包含 XML 注释，
    某些 Word 版本会将其视为无效内容并报错。

    :param xml_content: 原始 XML 内容
    :return: 移除注释后的 XML 内容
    """
    if '<!--' not in xml_content:
        return xml_content
    cleaned = re.sub(r'<!--.*?-->', '', xml_content, flags=re.DOTALL)
    if cleaned != xml_content:
        print("Note: Removed XML comments from inserted content (not allowed inside OOXML elements)")
    return cleaned


def _append_to_document_xml(unpacked_dir: str, xml_snippet: str) -> str:
    """将XML片段插入到document.xml末尾，位于最后一个body级<w:sectPr>之前。

    OOXML规范要求<w:body>的最后一个子元素必须是<w:sectPr>，
    因此XML片段必须插入到该<w:sectPr>的开始标签之前。

    :param unpacked_dir: 解包后的DOCX目录路径
    :param xml_snippet: 要插入的XML片段
    :return: 成功或失败的消息
    """
    doc_path = Path(unpacked_dir) / "word" / "document.xml"
    if not doc_path.exists():
        return f"Error: document.xml not found: {doc_path}"

    content = doc_path.read_text(encoding="utf-8")

    # 找到</w:body>的位置
    body_end = content.rfind('</w:body>')
    if body_end == -1:
        return "Error: </w:body> tag not found in document.xml"

    # 从</w:body>向前查找最后一个body级<w:sectPr（它是<w:body>的直接子元素）
    # 需要找到<w:sectPr的开始标签位置
    last_sect_start = content.rfind('<w:sectPr', 0, body_end)
    if last_sect_start != -1:
        # 在<w:sectPr之前插入XML片段
        content = content[:last_sect_start] + xml_snippet + "\n" + content[last_sect_start:]
    else:
        # 没有sectPr的情况，直接在</w:body>前插入
        content = content[:body_end] + xml_snippet + "\n" + content[body_end:]

    doc_path.write_text(content, encoding="utf-8")
    return "OK: XML inserted into document.xml before </w:body>"


def _prepend_to_document_xml(unpacked_dir: str, xml_snippet: str) -> str:
    """将XML片段插入到document.xml的第一个<w:p>之前（文档开头）。

    :param unpacked_dir: 解包后的DOCX目录路径
    :param xml_snippet: 要插入的XML片段
    :return: 成功或失败的消息
    """
    doc_path = Path(unpacked_dir) / "word" / "document.xml"
    if not doc_path.exists():
        return f"Error: document.xml not found: {doc_path}"

    content = doc_path.read_text(encoding="utf-8")

    # 在<w:body>之后的第一个<w:p>之前插入
    match = re.search(r'(<w:body[^>]*>)\s*(<w:p[\s>])', content)
    if not match:
        return "Error: Could not find first <w:p> element after <w:body>"

    insert_pos = match.start(2)
    content = content[:insert_pos] + xml_snippet + "\n" + content[insert_pos:]

    doc_path.write_text(content, encoding="utf-8")
    return "OK: XML inserted at the beginning of document (before first paragraph)"


def _is_inside_element(content: str, position: int, element_tag: str) -> bool:
    """检查指定位置是否在某个 XML 元素内部。

    通过向前搜索 element_tag 的开始标签和结束标签来判断。
    如果最近的标签是开始标签而非结束标签，则位置在该元素内部。

    :param content: XML 文本
    :param position: 要检查的字符偏移位置
    :param element_tag: 要检查的元素标签名（如 'w:p'）
    :return: 如果 position 在 element_tag 内部则返回 True
    """
    open_tag = f'<{element_tag} '
    open_tag_short = f'<{element_tag}>'
    close_tag = f'</{element_tag}>'

    # 向前搜索最近的开始/结束标签
    last_open = max(
        content.rfind(open_tag, 0, position),
        content.rfind(open_tag_short, 0, position),
    )
    last_close = content.rfind(close_tag, 0, position)

    # 如果最近的标签是开始标签，说明 position 在该元素内部
    return last_open > last_close


def _find_body_child_boundary(content: str, position: int) -> int:
    """从 position 开始，向后查找最近的 <w:body> 直接子元素边界。

    如果 position 本身就在 body 子元素边界上，直接返回。
    否则从 position 向后搜索第一个 body 子元素标签。

    :param content: document.xml 的完整文本
    :param position: 起始搜索位置
    :return: 找到的 body 子元素边界位置，找不到则返回 -1
    """
    body_child_prefixes = ('<w:p ', '<w:p>', '<w:tbl ', '<w:tbl>', '<w:sdt ',
                           '<w:sdt>', '<w:sectPr ', '<w:sectPr>')

    for prefix in body_child_prefixes:
        if content[position:position + len(prefix)] == prefix:
            return position

    # 向后搜索最近的 body 子元素
    best_pos = len(content)
    for prefix in body_child_prefixes:
        idx = content.find(prefix, position)
        if idx != -1 and idx < best_pos:
            best_pos = idx

    return best_pos if best_pos < len(content) else -1


def _snap_to_body_child_boundary(content: str, position: int) -> int:
    """将字符偏移位置对齐到最近的 <w:body> 直接子元素边界。

    find_page.py 返回的 position 应该指向一个 <w:p> 的起始位置，但由于
    解包时的美化打印（格式化）可能导致字符偏移量发生微小变化。此函数在
    position 附近搜索，找到最近的合法 body 子元素开始标签（<w:p、<w:tbl、
    <w:sdt、<w:sectPr 等），确保插入点不会落在 XML 标签中间。

    **关键安全检查**：如果候选位置在某个 <w:p> 或 <w:tbl> 内部（嵌套），
    则该位置不安全，需要跳过当前元素，在其 closing tag 之后继续搜索。

    :param content: document.xml 的完整文本
    :param position: 目标字符偏移位置
    :return: 调整后的安全插入位置
    """
    body_child_prefixes = ('<w:p ', '<w:p>', '<w:tbl ', '<w:tbl>', '<w:sdt ',
                           '<w:sdt>', '<w:sectPr ', '<w:sectPr>')

    # 如果 position 恰好落在一个 body 子元素开始标签上，直接使用
    for prefix in body_child_prefixes:
        if content[position:position + len(prefix)] == prefix:
            # 还需验证该位置不在另一个 w:p 或 w:tbl 内部
            if not _is_inside_element(content, position, 'w:p') \
                    and not _is_inside_element(content, position, 'w:tbl'):
                return position
            break

    # 在附近搜索（前后各 200 个字符的范围）
    search_range = 200
    best_pos = None
    best_distance = search_range + 1

    for prefix in body_child_prefixes:
        # 向后搜索
        idx = content.find(prefix, position, position + search_range)
        if idx != -1:
            dist = idx - position
            if dist < best_distance:
                # 验证不在嵌套元素内部
                if not _is_inside_element(content, idx, 'w:p') \
                        and not _is_inside_element(content, idx, 'w:tbl'):
                    best_distance = dist
                    best_pos = idx

        # 向前搜索
        start = max(0, position - search_range)
        idx = content.rfind(prefix, start, position)
        if idx != -1:
            dist = position - idx
            if dist < best_distance:
                if not _is_inside_element(content, idx, 'w:p') \
                        and not _is_inside_element(content, idx, 'w:tbl'):
                    best_distance = dist
                    best_pos = idx

    if best_pos is not None:
        return best_pos

    # 如果附近找不到安全位置，扩大范围：找到当前所在 w:p 的结束标签之后
    # 从 position 向后找 </w:p> 或 </w:tbl>，然后找下一个 body 子元素
    for close_tag in ('</w:p>', '</w:tbl>'):
        close_idx = content.find(close_tag, position)
        if close_idx != -1:
            after_close = close_idx + len(close_tag)
            boundary = _find_body_child_boundary(content, after_close)
            if boundary != -1 \
                    and not _is_inside_element(content, boundary, 'w:p') \
                    and not _is_inside_element(content, boundary, 'w:tbl'):
                return boundary

    # 找不到合法边界，返回原始位置（后续操作可能会失败）
    return position


def _validate_insertion_safety(content: str, position: int) -> tuple[bool, str]:
    """验证插入位置是否安全（不在 <w:p> 或嵌套 <w:tbl> 内部）。

    OOXML 规范要求 <w:tbl> 和 <w:p> 只能作为 <w:body> 的直接子元素，
    不能嵌套在其他 <w:p> 内部。此函数检测并拒绝不安全的插入位置。

    :param content: document.xml 的完整文本
    :param position: 要验证的插入位置
    :return: (是否安全, 说明消息)
    """
    if _is_inside_element(content, position, 'w:p'):
        return False, (
            f"Error: Position {position} is inside a <w:p> element. "
            "Inserting <w:tbl> or block-level elements inside <w:p> violates OOXML schema. "
            "Position was auto-adjusted to nearest safe body-child boundary."
        )
    return True, "OK"


def _insert_at_position(unpacked_dir: str, xml_snippet: str, position: int) -> str:
    """将XML片段插入到 document.xml 中的指定字符偏移位置。

    适用于先通过 find_page.py 等工具获取到精确位置后，直接按位置插入的场景。
    函数会自动将位置对齐到最近的 body 子元素边界，避免插入到 XML 标签中间。
    **安全检查**：如果位置在 <w:p> 内部，会自动跳到该 <w:p> 之后的安全位置。

    :param unpacked_dir: 解包后的DOCX目录路径
    :param xml_snippet: 要插入的XML片段
    :param position: document.xml 中的字符偏移位置（0-based）
    :return: 成功或失败的消息
    """
    doc_path = Path(unpacked_dir) / "word" / "document.xml"
    if not doc_path.exists():
        return f"Error: document.xml not found: {doc_path}"

    content = doc_path.read_text(encoding="utf-8")

    if position < 0 or position > len(content):
        return (
            f"Error: Position {position} is out of range. "
            f"document.xml length is {len(content)} characters."
        )

    # 将位置对齐到最近的 body 子元素边界，避免插入到 XML 标签中间
    # _snap_to_body_child_boundary 内部会验证不在 <w:p>/<w:tbl> 内部
    safe_position = _snap_to_body_child_boundary(content, position)

    content = content[:safe_position] + xml_snippet + "\n" + content[safe_position:]

    doc_path.write_text(content, encoding="utf-8")

    if safe_position != position:
        return (
            f"OK: XML inserted at position {safe_position} in document.xml "
            f"(adjusted from {position} to nearest safe element boundary)"
        )
    return f"OK: XML inserted at position {safe_position} in document.xml"


def _insert_at_page(unpacked_dir: str, xml_snippet: str, page_num: int) -> str:
    """将XML片段插入到指定页码的开头位置。

    复用 find_page.py 的 find_page() 函数获取页面位置，
    避免重复实现分页检测逻辑，保持定位结果一致。

    :param unpacked_dir: 解包后的DOCX目录路径
    :param xml_snippet: 要插入的XML片段
    :param page_num: 目标页码（从1开始）
    :return: 成功或失败的消息
    """
    if page_num < 1:
        return "Error: Page number must be >= 1"

    # 调用 find_page.py 的 find_page() 获取页面位置
    result = find_page(unpacked_dir, page_num)

    if "error" in result:
        return f"Error: {result['error']}"

    insert_pos = result["position"]
    total_pages = result["total_pages"]

    # 读取 document.xml 并在指定位置插入
    doc_path = Path(unpacked_dir) / "word" / "document.xml"
    content = doc_path.read_text(encoding="utf-8")

    # 将位置对齐到最近的 body 子元素边界，避免插入到 XML 标签中间
    safe_pos = _snap_to_body_child_boundary(content, insert_pos)

    # 对于第 1 页，在 safe_pos 之前插入（文档开头）。
    # 对于第 2+ 页，在 safe_pos 所指向的段落之后插入。
    #
    # safe_pos 指向包含 lastRenderedPageBreak 的段落起始位置（<w:p>）。
    # lastRenderedPageBreak 出现在该段落内部的某个 <w:r> 中，表示从该标记
    # 处开始是新的一页。但该段落的前半部分内容仍然属于上一页。
    #
    # 如果在该段落之前插入，新内容会出现在上一页的末尾（因为
    # lastRenderedPageBreak 在段落内部更后面的位置）。
    # 在该段落之后插入，新内容才会出现在 lastRenderedPageBreak 之后，
    # 即新页的开头区域。Word 重新排版后，新内容会显示在目标页。
    if page_num == 1:
        # 第 1 页：在文档开头插入
        final_pos = safe_pos
    else:
        # 第 2+ 页：找到 safe_pos 所在段落/表格的结束位置，在其后插入
        # 这样新内容会出现在包含 lastRenderedPageBreak 的段落之后
        close_tags = ['</w:p>', '</w:tbl>']
        end_pos = None
        for tag in close_tags:
            idx = content.find(tag, safe_pos)
            if idx != -1:
                candidate = idx + len(tag)
                if end_pos is None or candidate < end_pos:
                    end_pos = candidate
        if end_pos is not None:
            final_pos = end_pos
        else:
            # fallback：如果找不到结束标签，在 safe_pos 之前插入
            final_pos = safe_pos

    content = content[:final_pos] + "\n" + xml_snippet + content[final_pos:]

    doc_path.write_text(content, encoding="utf-8")

    msg = f"OK: XML inserted at the beginning of page {page_num} (detected {total_pages} page(s) total)"
    if final_pos != insert_pos:
        msg += f" [position adjusted from {insert_pos} to {final_pos}]"
    return msg


def _find_heading_positions(content: str) -> list[tuple[int, int, str, str]]:
    r"""查找document.xml中所有标题段落的位置和信息。

    使用字符串查找逐个定位<w:p>段落，避免[\s\S]*?正则在大文件上的
    灾难性回溯和内存爆炸问题。

    :param content: document.xml的完整文本
    :return: 列表，每项为(段落起始位置, 段落结束位置, 样式名, 标题文本)
    """
    headings = []
    end_tag = '</w:p>'
    end_tag_len = len(end_tag)
    search_start = 0

    while True:
        # 查找下一个<w:p开始标签
        p_start = content.find('<w:p ', search_start)
        p_start_alt = content.find('<w:p>', search_start)
        if p_start == -1 and p_start_alt == -1:
            break
        if p_start == -1:
            p_start = p_start_alt
        elif p_start_alt != -1:
            p_start = min(p_start, p_start_alt)

        # 查找对应的</w:p>结束标签
        p_end_pos = content.find(end_tag, p_start)
        if p_end_pos == -1:
            break
        p_end = p_end_pos + end_tag_len

        p_text = content[p_start:p_end]
        search_start = p_end

        # 检查是否有Heading样式
        style_match = re.search(
            r'<w:pStyle\s+w:val=\"(Heading\d+|heading\s*\d+|TOCHeading)\"',
            p_text,
            re.IGNORECASE,
        )
        if not style_match:
            # 也检查outlineLevel（有些文档用outlineLevel而非Heading样式）
            outline_match = re.search(r'<w:outlineLvl\s+w:val=\"(\d+)\"', p_text)
            if not outline_match:
                continue
            style_name = f"OutlineLevel{outline_match.group(1)}"
        else:
            style_name = style_match.group(1)

        # 提取标题文本（合并所有<w:t>的内容）
        texts = re.findall(r'<w:t[^>]*>(.*?)</w:t>', p_text)
        heading_text = "".join(texts).strip()

        headings.append((
            p_start,
            p_end,
            style_name,
            heading_text,
        ))

    return headings


def _match_heading(headings: list[tuple[int, int, str, str]], target: str) -> tuple[int, int, str, str] | None:
    """根据用户提供的文本匹配标题，支持精确匹配和模糊匹配。

    匹配优先级：
    1. 精确匹配（完整文本相等）
    2. 包含匹配（标题文本包含目标文本）
    3. 目标文本包含标题文本

    :param headings: _find_heading_positions返回的标题列表
    :param target: 用户指定的标题文本
    :return: 匹配到的标题元组，或None
    """
    target_stripped = target.strip()

    # 1. 精确匹配
    for h in headings:
        if h[3] == target_stripped:
            return h

    # 2. 包含匹配（标题包含目标）
    for h in headings:
        if target_stripped in h[3]:
            return h

    # 3. 反向包含（目标包含标题）
    for h in headings:
        if h[3] and h[3] in target_stripped:
            return h

    return None


def _find_text_positions(content: str) -> list[tuple[int, int, str]]:
    r"""查找 document.xml 中所有段落的位置和文本内容。

    遍历所有 <w:p> 段落，提取其中 <w:t> 的文本内容，不要求段落
    具有 Heading 样式。适用于按普通文本内容定位的场景。

    :param content: document.xml 的完整文本
    :return: 列表，每项为 (段落起始位置, 段落结束位置, 段落文本)
    """
    paragraphs = []
    end_tag = '</w:p>'
    end_tag_len = len(end_tag)
    search_start = 0

    while True:
        # 查找下一个 <w:p 开始标签
        p_start = content.find('<w:p ', search_start)
        p_start_alt = content.find('<w:p>', search_start)
        if p_start == -1 and p_start_alt == -1:
            break
        if p_start == -1:
            p_start = p_start_alt
        elif p_start_alt != -1:
            p_start = min(p_start, p_start_alt)

        # 查找对应的 </w:p> 结束标签
        p_end_pos = content.find(end_tag, p_start)
        if p_end_pos == -1:
            break
        p_end = p_end_pos + end_tag_len

        p_text = content[p_start:p_end]
        search_start = p_end

        # 提取段落文本（合并所有 <w:t> 的内容）
        texts = re.findall(r'<w:t[^>]*>(.*?)</w:t>', p_text)
        para_text = "".join(texts).strip()

        # 跳过空段落
        if not para_text:
            continue

        paragraphs.append((p_start, p_end, para_text))

    return paragraphs


def _match_text(
    paragraphs: list[tuple[int, int, str]],
    target: str,
) -> tuple[int, int, str] | None:
    """根据用户提供的文本匹配段落，支持精确匹配和模糊匹配。

    匹配优先级：
    1. 精确匹配（完整文本相等）
    2. 包含匹配（段落文本包含目标文本）
    3. 目标文本包含段落文本

    :param paragraphs: _find_text_positions 返回的段落列表
    :param target: 用户指定的文本
    :return: 匹配到的段落元组，或 None
    """
    target_stripped = target.strip()

    # 1. 精确匹配
    for p in paragraphs:
        if p[2] == target_stripped:
            return p

    # 2. 包含匹配（段落文本包含目标文本）
    for p in paragraphs:
        if target_stripped in p[2]:
            return p

    # 3. 反向包含（目标文本包含段落文本）
    for p in paragraphs:
        if p[2] in target_stripped:
            return p

    return None


def _insert_before_text(unpacked_dir: str, xml_snippet: str, target_text: str) -> str:
    """将 XML 片段插入到包含指定文本的段落之前。

    与 _insert_before_heading 不同，此函数搜索所有段落，
    不要求段落具有 Heading 样式或 outlineLevel。

    :param unpacked_dir: 解包后的 DOCX 目录路径
    :param xml_snippet: 要插入的 XML 片段
    :param target_text: 目标段落的文本内容（支持模糊匹配）
    :return: 成功或失败的消息
    """
    doc_path = Path(unpacked_dir) / "word" / "document.xml"
    if not doc_path.exists():
        return f"Error: document.xml not found: {doc_path}"

    content = doc_path.read_text(encoding="utf-8")
    paragraphs = _find_text_positions(content)

    if not paragraphs:
        return "Error: No non-empty paragraphs found in document.xml"

    matched = _match_text(paragraphs, target_text)
    if not matched:
        # 展示前 10 个段落帮助用户定位
        sample = paragraphs[:10]
        available = "\n".join(f"  - {p[2][:80]}" for p in sample)
        suffix = f"\n  ... and {len(paragraphs) - 10} more" if len(paragraphs) > 10 else ""
        return (
            f'Error: No paragraph containing "{target_text}" found.\n'
            f"First paragraphs in document:\n{available}{suffix}"
        )

    insert_pos = matched[0]
    content = content[:insert_pos] + xml_snippet + "\n" + content[insert_pos:]

    doc_path.write_text(content, encoding="utf-8")
    display_text = matched[2][:60] + ("..." if len(matched[2]) > 60 else "")
    return f'OK: XML inserted before paragraph "{display_text}"'


def _insert_after_text(unpacked_dir: str, xml_snippet: str, target_text: str) -> str:
    """将 XML 片段插入到包含指定文本的段落之后。

    与 _insert_after_heading 不同，此函数搜索所有段落，
    不要求段落具有 Heading 样式或 outlineLevel。

    :param unpacked_dir: 解包后的 DOCX 目录路径
    :param xml_snippet: 要插入的 XML 片段
    :param target_text: 目标段落的文本内容（支持模糊匹配）
    :return: 成功或失败的消息
    """
    doc_path = Path(unpacked_dir) / "word" / "document.xml"
    if not doc_path.exists():
        return f"Error: document.xml not found: {doc_path}"

    content = doc_path.read_text(encoding="utf-8")
    paragraphs = _find_text_positions(content)

    if not paragraphs:
        return "Error: No non-empty paragraphs found in document.xml"

    matched = _match_text(paragraphs, target_text)
    if not matched:
        sample = paragraphs[:10]
        available = "\n".join(f"  - {p[2][:80]}" for p in sample)
        suffix = f"\n  ... and {len(paragraphs) - 10} more" if len(paragraphs) > 10 else ""
        return (
            f'Error: No paragraph containing "{target_text}" found.\n'
            f"First paragraphs in document:\n{available}{suffix}"
        )

    insert_pos = matched[1]  # 段落结束位置（</w:p> 之后）
    content = content[:insert_pos] + "\n" + xml_snippet + content[insert_pos:]

    doc_path.write_text(content, encoding="utf-8")
    display_text = matched[2][:60] + ("..." if len(matched[2]) > 60 else "")
    return f'OK: XML inserted after paragraph "{display_text}"'


def _insert_before_heading(unpacked_dir: str, xml_snippet: str, heading_text: str) -> str:
    """将XML片段插入到指定标题段落之前。

    优先搜索具有 Heading 样式（如 Heading1、Heading2）或 outlineLevel 的段落。
    如果在 Heading 段落中找不到匹配，则自动 fallback 到搜索所有段落（按文本内容匹配），
    以兼容使用普通段落 + 手动加粗来模拟标题的文档。

    :param unpacked_dir: 解包后的DOCX目录路径
    :param xml_snippet: 要插入的XML片段
    :param heading_text: 目标标题的文本内容（支持模糊匹配）
    :return: 成功或失败的消息
    """
    doc_path = Path(unpacked_dir) / "word" / "document.xml"
    if not doc_path.exists():
        return f"Error: document.xml not found: {doc_path}"

    content = doc_path.read_text(encoding="utf-8")

    # 第一轮：搜索 Heading 样式段落
    headings = _find_heading_positions(content)
    matched = _match_heading(headings, heading_text) if headings else None

    # 第二轮：Heading 中找不到，自动 fallback 到所有段落
    fallback = False
    if not matched:
        paragraphs = _find_text_positions(content)
        matched_text = _match_text(paragraphs, heading_text) if paragraphs else None
        if matched_text:
            fallback = True
            insert_pos = matched_text[0]
            content = content[:insert_pos] + xml_snippet + "\n" + content[insert_pos:]
            doc_path.write_text(content, encoding="utf-8")
            display_text = matched_text[2][:60] + ("..." if len(matched_text[2]) > 60 else "")
            return (
                f'OK: XML inserted before paragraph "{display_text}" '
                f'(fallback: no Heading style matched, found in all paragraphs)'
            )

        # 两轮都没找到
        if headings:
            available = "\n".join(f"  - [{h[2]}] {h[3]}" for h in headings)
            return (
                f'Error: No heading or paragraph matching "{heading_text}" found.\n'
                f"Available headings:\n{available}"
            )
        sample = paragraphs[:10] if paragraphs else []
        available = "\n".join(f"  - {p[2][:80]}" for p in sample)
        suffix = f"\n  ... and {len(paragraphs) - 10} more" if len(paragraphs) > 10 else ""
        return (
            f'Error: No heading or paragraph matching "{heading_text}" found.\n'
            f"No headings in document. First paragraphs:\n{available}{suffix}"
        )

    insert_pos = matched[0]
    content = content[:insert_pos] + xml_snippet + "\n" + content[insert_pos:]

    doc_path.write_text(content, encoding="utf-8")
    return f"OK: XML inserted before heading \"{matched[3]}\" [{matched[2]}]"


def _insert_after_heading(unpacked_dir: str, xml_snippet: str, heading_text: str) -> str:
    """将XML片段插入到指定标题段落之后。

    优先搜索具有 Heading 样式（如 Heading1、Heading2）或 outlineLevel 的段落。
    如果在 Heading 段落中找不到匹配，则自动 fallback 到搜索所有段落（按文本内容匹配），
    以兼容使用普通段落 + 手动加粗来模拟标题的文档。

    :param unpacked_dir: 解包后的DOCX目录路径
    :param xml_snippet: 要插入的XML片段
    :param heading_text: 目标标题的文本内容（支持模糊匹配）
    :return: 成功或失败的消息
    """
    doc_path = Path(unpacked_dir) / "word" / "document.xml"
    if not doc_path.exists():
        return f"Error: document.xml not found: {doc_path}"

    content = doc_path.read_text(encoding="utf-8")

    # 第一轮：搜索 Heading 样式段落
    headings = _find_heading_positions(content)
    matched = _match_heading(headings, heading_text) if headings else None

    # 第二轮：Heading 中找不到，自动 fallback 到所有段落
    if not matched:
        paragraphs = _find_text_positions(content)
        matched_text = _match_text(paragraphs, heading_text) if paragraphs else None
        if matched_text:
            insert_pos = matched_text[1]  # 段落结束位置（</w:p> 之后）
            content = content[:insert_pos] + "\n" + xml_snippet + content[insert_pos:]
            doc_path.write_text(content, encoding="utf-8")
            display_text = matched_text[2][:60] + ("..." if len(matched_text[2]) > 60 else "")
            return (
                f'OK: XML inserted after paragraph "{display_text}" '
                f'(fallback: no Heading style matched, found in all paragraphs)'
            )

        # 两轮都没找到
        if headings:
            available = "\n".join(f"  - [{h[2]}] {h[3]}" for h in headings)
            return (
                f'Error: No heading or paragraph matching "{heading_text}" found.\n'
                f"Available headings:\n{available}"
            )
        sample = paragraphs[:10] if paragraphs else []
        available = "\n".join(f"  - {p[2][:80]}" for p in sample)
        suffix = f"\n  ... and {len(paragraphs) - 10} more" if len(paragraphs) > 10 else ""
        return (
            f'Error: No heading or paragraph matching "{heading_text}" found.\n'
            f"No headings in document. First paragraphs:\n{available}{suffix}"
        )

    insert_pos = matched[1]  # 段落结束位置（</w:p>之后）
    content = content[:insert_pos] + "\n" + xml_snippet + content[insert_pos:]

    doc_path.write_text(content, encoding="utf-8")
    return f"OK: XML inserted after heading \"{matched[3]}\" [{matched[2]}]"


def main():
    """主函数：解析参数并执行XML插入操作。"""
    parser = argparse.ArgumentParser(description="Insert XML content into an unpacked DOCX document")
    parser.add_argument("unpacked_dir", help="Unpacked DOCX directory")
    parser.add_argument(
        "xml_file",
        help="Path to an XML file containing the content to insert. "
             "Also supports @filepath syntax (strips leading '@').",
    )

    # 插入位置参数组（互斥）
    position = parser.add_mutually_exclusive_group()
    position.add_argument(
        "--append",
        action="store_true",
        default=False,
        help="Insert at the end of the document (before </w:body>)",
    )
    position.add_argument(
        "--prepend",
        action="store_true",
        default=False,
        help="Insert at the beginning of the document (before first paragraph)",
    )
    position.add_argument(
        "--position",
        type=int,
        default=None,
        metavar="POS",
        help="Insert at a specific character offset position in document.xml. "
             "Use with find_page.py output: first run find_page.py to get the position, "
             "then pass it here.",
    )
    position.add_argument(
        "--page",
        type=int,
        default=None,
        metavar="N",
        help="Insert at the beginning of page N (1-based). "
             "Page detection relies on page break markers in the XML.",
    )
    position.add_argument(
        "--before-heading",
        type=str,
        default=None,
        metavar="TEXT",
        help="Insert before the heading whose text matches TEXT. "
             "Searches Heading-style paragraphs first, then falls back to all paragraphs.",
    )
    position.add_argument(
        "--after-heading",
        type=str,
        default=None,
        metavar="TEXT",
        help="Insert after the heading whose text matches TEXT. "
             "Searches Heading-style paragraphs first, then falls back to all paragraphs.",
    )
    position.add_argument(
        "--before-text",
        type=str,
        default=None,
        metavar="TEXT",
        help="Insert before the paragraph whose text contains TEXT (searches all paragraphs, "
             "not just headings). Use when the target paragraph has no Heading style.",
    )
    position.add_argument(
        "--after-text",
        type=str,
        default=None,
        metavar="TEXT",
        help="Insert after the paragraph whose text contains TEXT (searches all paragraphs, "
             "not just headings). Use when the target paragraph has no Heading style.",
    )

    args = parser.parse_args()

    # 解析 xml_file 参数：必须是文件路径（兼容 @filepath 语法）
    xml_file_arg = args.xml_file
    if xml_file_arg.startswith('@'):
        # 向后兼容：@filepath 语法，去掉 @ 后作为文件路径
        xml_file_path = Path(xml_file_arg[1:])
    else:
        xml_file_path = Path(xml_file_arg)

    if not xml_file_path.exists():
        print(f"Error: XML file not found: {xml_file_path}", file=sys.stderr)
        sys.exit(1)

    xml_content = xml_file_path.read_text(encoding="utf-8").strip()

    # 检测并自动移除 XML 声明（<?xml ...?>），插入片段中不应包含声明
    xml_decl_pattern = re.match(r'<\?xml\s[^?]*\?>\s*', xml_content)
    if xml_decl_pattern:
        xml_content = xml_content[xml_decl_pattern.end():].strip()
        print(
            "Warning: XML declaration (<?xml ...?>) detected and auto-removed. "
            "XML snippets for insertion should not contain declarations.",
        )

    # 验证XML内容
    is_valid, msg = _validate_xml_content(xml_content)
    if not is_valid:
        print(msg, file=sys.stderr)
        sys.exit(1)

    # 自动补全表格 XML 中缺失的 OOXML 必要属性（如 w:tblW、w:tcW 等）
    original_content = xml_content
    xml_content = _ensure_table_completeness(xml_content, args.unpacked_dir)
    if xml_content != original_content:
        print("Note: Auto-completed missing OOXML table attributes (tblW, tcW, tblBorders)")

    # 移除 XML 注释（OOXML 元素内部不允许注释）
    xml_content = _strip_xml_comments(xml_content)

    # 清理 w14:paraId/textId：重新生成唯一且合规的值
    xml_content = _sanitize_ids(xml_content, args.unpacked_dir)

    # 判断插入位置
    if args.append:
        result = _append_to_document_xml(args.unpacked_dir, xml_content)
        print(result)
        if result.startswith("Error"):
            sys.exit(1)
    elif args.prepend:
        result = _prepend_to_document_xml(args.unpacked_dir, xml_content)
        print(result)
        if result.startswith("Error"):
            sys.exit(1)
    elif args.position is not None:
        result = _insert_at_position(args.unpacked_dir, xml_content, args.position)
        print(result)
        if result.startswith("Error"):
            sys.exit(1)
    elif args.page is not None:
        result = _insert_at_page(args.unpacked_dir, xml_content, args.page)
        print(result)
        if result.startswith("Error"):
            sys.exit(1)
    elif args.before_heading is not None:
        result = _insert_before_heading(args.unpacked_dir, xml_content, args.before_heading)
        print(result)
        if result.startswith("Error"):
            sys.exit(1)
    elif args.after_heading is not None:
        result = _insert_after_heading(args.unpacked_dir, xml_content, args.after_heading)
        print(result)
        if result.startswith("Error"):
            sys.exit(1)
    elif args.before_text is not None:
        result = _insert_before_text(args.unpacked_dir, xml_content, args.before_text)
        print(result)
        if result.startswith("Error"):
            sys.exit(1)
    elif args.after_text is not None:
        result = _insert_after_text(args.unpacked_dir, xml_content, args.after_text)
        print(result)
        if result.startswith("Error"):
            sys.exit(1)
    else:
        print("No position specified. XML content is valid and ready for manual insertion:")
        print("=" * 60)
        print(xml_content)
        print("=" * 60)
        print("\nUse one of the position flags to automatically insert the XML:")
        print("  --append        Insert at end of document")
        print("  --prepend       Insert at beginning of document")
        print("  --position POS  Insert at character offset POS in document.xml")
        print("  --page N        Insert at beginning of page N")
        print("  --before-heading TEXT  Insert before matching heading")
        print("  --after-heading TEXT   Insert after matching heading")
        print("  --before-text TEXT     Insert before paragraph containing TEXT (all paragraphs)")
        print("  --after-text TEXT      Insert after paragraph containing TEXT (all paragraphs)")


if __name__ == "__main__":
    main()
