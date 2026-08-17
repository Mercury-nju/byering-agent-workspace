"""Insert an image into an unpacked DOCX document.

Usage:
    python insert_image.py <unpacked_dir> <image_path> [--width <cm>] [--height <cm>]

Examples:
    python insert_image.py unpacked/ photo.jpg
    python insert_image.py unpacked/ photo.jpg --width 10
    python insert_image.py unpacked/ photo.jpg --width 15 --height 10

The script will:
1. Copy the image to word/media/
2. Add a relationship in word/_rels/document.xml.rels
3. Add content type in [Content_Types].xml (if needed)
4. Print the complete XML snippet to insert into document.xml

After running, paste the printed XML into document.xml at the desired location
(inside a <w:p> element, or as a new <w:p> block).
"""

import argparse
import shutil
import struct
import sys
from pathlib import Path

import defusedxml.minidom

# 复用 insert_xml.py 的通用位置插入函数，避免重复实现
from insert_xml import (
    _append_to_document_xml,
    _insert_after_heading,
    _insert_after_text,
    _insert_at_page,
    _insert_before_heading,
    _insert_before_text,
    _prepend_to_document_xml,
)


# EMU 单位转换：1 英寸 = 914400 EMU, 1 厘米 = 360000 EMU
EMU_PER_CM = 360000
EMU_PER_INCH = 914400
# 默认 DPI
DEFAULT_DPI = 96

CONTENT_TYPE_MAP = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".bmp": "image/bmp",
    ".tif": "image/tiff",
    ".tiff": "image/tiff",
    ".svg": "image/svg+xml",
}


def _get_image_size_pixels(image_path: Path) -> tuple[int, int]:
    """获取图片的像素尺寸。支持 PNG、JPEG、GIF、BMP。"""
    data = image_path.read_bytes()
    ext = image_path.suffix.lower()

    if ext == ".png" and data[:8] == b"\x89PNG\r\n\x1a\n":
        # PNG: IHDR chunk 在 offset 16
        width = struct.unpack(">I", data[16:20])[0]
        height = struct.unpack(">I", data[20:24])[0]
        return (width, height)

    if ext in (".jpg", ".jpeg"):
        # JPEG: 搜索 SOF0/SOF2 marker
        i = 2
        while i < len(data) - 1:
            if data[i] != 0xFF:
                break
            marker = data[i + 1]
            if marker in (0xC0, 0xC2):
                height = struct.unpack(">H", data[i + 5:i + 7])[0]
                width = struct.unpack(">H", data[i + 7:i + 9])[0]
                return (width, height)
            if marker == 0xD9:
                break
            if marker in (0xD0, 0xD1, 0xD2, 0xD3, 0xD4, 0xD5, 0xD6, 0xD7, 0xD8, 0x01):
                i += 2
            else:
                length = struct.unpack(">H", data[i + 2:i + 4])[0]
                i += 2 + length
        return (0, 0)

    if ext == ".gif" and data[:3] in (b"GIF",):
        width = struct.unpack("<H", data[6:8])[0]
        height = struct.unpack("<H", data[8:10])[0]
        return (width, height)

    if ext == ".bmp" and data[:2] == b"BM":
        width = struct.unpack("<I", data[18:22])[0]
        height = abs(struct.unpack("<i", data[22:26])[0])
        return (width, height)

    return (0, 0)


def _pixels_to_emu(pixels: int, dpi: int = DEFAULT_DPI) -> int:
    """将像素转换为 EMU 单位。"""
    return int(pixels * EMU_PER_INCH / dpi)


def _cm_to_emu(cm: float) -> int:
    """将厘米转换为 EMU 单位。"""
    return int(cm * EMU_PER_CM)


def _get_next_rid(rels_path: Path) -> int:
    """获取下一个可用的 rId 编号。"""
    dom = defusedxml.minidom.parseString(rels_path.read_text(encoding="utf-8"))
    max_rid = 0
    for rel in dom.getElementsByTagName("Relationship"):
        rid = rel.getAttribute("Id")
        if rid and rid.startswith("rId"):
            try:
                max_rid = max(max_rid, int(rid[3:]))
            except ValueError:
                pass
    return max_rid + 1


def _get_next_image_number(media_dir: Path) -> int:
    """获取下一个可用的图片编号（image1, image2, ...）。"""
    max_num = 0
    if media_dir.exists():
        for f in media_dir.iterdir():
            name = f.stem
            if name.startswith("image"):
                try:
                    num = int(name[5:])
                    max_num = max(max_num, num)
                except ValueError:
                    pass
    return max_num + 1


def _add_relationship(rels_path: Path, rid: str, target: str) -> None:
    """在 document.xml.rels 中添加图片关系。"""
    dom = defusedxml.minidom.parseString(rels_path.read_text(encoding="utf-8"))
    root = dom.documentElement
    rel = dom.createElement("Relationship")
    rel.setAttribute("Id", rid)
    rel.setAttribute(
        "Type",
        "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image",
    )
    rel.setAttribute("Target", target)
    root.appendChild(rel)
    rels_path.write_bytes(dom.toxml(encoding="UTF-8"))


def _ensure_content_type(ct_path: Path, extension: str) -> None:
    """确保 [Content_Types].xml 中包含对应图片格式的 Default 条目。"""
    ext_no_dot = extension.lstrip(".")
    content_type = CONTENT_TYPE_MAP.get(f".{ext_no_dot}")
    if not content_type:
        return

    dom = defusedxml.minidom.parseString(ct_path.read_text(encoding="utf-8"))
    # 检查是否已存在
    for default in dom.getElementsByTagName("Default"):
        if default.getAttribute("Extension").lower() == ext_no_dot.lower():
            return

    root = dom.documentElement
    default_elem = dom.createElement("Default")
    default_elem.setAttribute("Extension", ext_no_dot)
    default_elem.setAttribute("ContentType", content_type)
    # 插入到第一个子元素之前，保持 Default 在 Override 之前
    first_child = root.firstChild
    root.insertBefore(default_elem, first_child)
    ct_path.write_bytes(dom.toxml(encoding="UTF-8"))


def _generate_xml_snippet(rid: str, cx: int, cy: int, image_name: str) -> str:
    """生成完整的图片 XML 片段，可以直接插入到 document.xml 中。"""
    return f"""<w:p xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:r>
    <w:rPr>
      <w:noProof/>
    </w:rPr>
    <w:drawing>
      <wp:inline distT="0" distB="0" distL="0" distR="0">
        <wp:extent cx="{cx}" cy="{cy}"/>
        <wp:docPr id="1" name="{image_name}"/>
        <a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
          <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
            <pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
              <pic:nvPicPr>
                <pic:cNvPr id="0" name="{image_name}"/>
                <pic:cNvPicPr/>
              </pic:nvPicPr>
              <pic:blipFill>
                <a:blip r:embed="{rid}"/>
                <a:stretch>
                  <a:fillRect/>
                </a:stretch>
              </pic:blipFill>
              <pic:spPr>
                <a:xfrm>
                  <a:off x="0" y="0"/>
                  <a:ext cx="{cx}" cy="{cy}"/>
                </a:xfrm>
                <a:prstGeom prst="rect">
                  <a:avLst/>
                </a:prstGeom>
              </pic:spPr>
            </pic:pic>
          </a:graphicData>
        </a:graphic>
      </wp:inline>
    </w:drawing>
  </w:r>
</w:p>"""


def insert_image(
    unpacked_dir: str,
    image_path: str,
    width_cm: float | None = None,
    height_cm: float | None = None,
) -> tuple[str, str]:
    """插入图片到解包后的 DOCX 文档。

    :param unpacked_dir: 解包后的 DOCX 目录路径
    :param image_path: 要插入的图片文件路径
    :param width_cm: 指定宽度（厘米），None 则使用图片原始尺寸
    :param height_cm: 指定高度（厘米），None 则等比缩放
    :return: (xml_snippet, message) 元组
    """
    unpacked = Path(unpacked_dir)
    image = Path(image_path)

    if not unpacked.exists():
        return ("", f"Error: Unpacked directory not found: {unpacked}")
    if not image.exists():
        return ("", f"Error: Image file not found: {image}")

    ext = image.suffix.lower()
    if ext not in CONTENT_TYPE_MAP:
        return ("", f"Error: Unsupported image format: {ext}")

    word_dir = unpacked / "word"
    media_dir = word_dir / "media"
    rels_path = word_dir / "_rels" / "document.xml.rels"
    ct_path = unpacked / "[Content_Types].xml"

    if not rels_path.exists():
        return ("", f"Error: Relationships file not found: {rels_path}")
    if not ct_path.exists():
        return ("", f"Error: Content types file not found: {ct_path}")

    # 1. 复制图片到 word/media/
    media_dir.mkdir(parents=True, exist_ok=True)
    img_num = _get_next_image_number(media_dir)
    dest_name = f"image{img_num}{ext}"
    dest_path = media_dir / dest_name
    shutil.copy2(image, dest_path)

    # 2. 添加关系
    rid = f"rId{_get_next_rid(rels_path)}"
    _add_relationship(rels_path, rid, f"media/{dest_name}")

    # 3. 添加内容类型
    _ensure_content_type(ct_path, ext)

    # 4. 计算 EMU 尺寸
    px_w, px_h = _get_image_size_pixels(image)

    if width_cm is not None and height_cm is not None:
        # 两者都指定
        cx = _cm_to_emu(width_cm)
        cy = _cm_to_emu(height_cm)
    elif width_cm is not None:
        cx = _cm_to_emu(width_cm)
        if px_w > 0 and px_h > 0:
            cy = int(cx * px_h / px_w)
        else:
            cy = cx  # 无法获取原始尺寸时默认正方形
    elif height_cm is not None:
        cy = _cm_to_emu(height_cm)
        if px_w > 0 and px_h > 0:
            cx = int(cy * px_w / px_h)
        else:
            cx = cy
    elif px_w > 0 and px_h > 0:
        # 使用原始像素尺寸
        cx = _pixels_to_emu(px_w)
        cy = _pixels_to_emu(px_h)
        # 如果图片太大，限制最大宽度为 15cm（约 A4 内容宽度）
        max_cx = _cm_to_emu(15)
        if cx > max_cx:
            ratio = max_cx / cx
            cx = max_cx
            cy = int(cy * ratio)
    else:
        # 无法获取尺寸，默认 10cm x 10cm
        cx = _cm_to_emu(10)
        cy = _cm_to_emu(10)

    # 5. 生成 XML 片段
    xml_snippet = _generate_xml_snippet(rid, cx, cy, dest_name)

    msg = (
        f"Image prepared: {dest_name} ({rid})\n"
        f"  Size: {cx} x {cy} EMU"
    )
    if px_w > 0:
        msg += f" (original: {px_w} x {px_h} px)"

    return (xml_snippet, msg)


# 注意：位置插入函数（_append_to_document_xml, _prepend_to_document_xml,
# _insert_at_page, _insert_before_heading, _insert_after_heading）
# 已从 insert_xml.py 导入，避免重复实现。
# 其中 _insert_at_page 内部复用 find_page.py 的 find_page() 函数。


if __name__ == "__main__":
    p = argparse.ArgumentParser(description="Insert an image into an unpacked DOCX")
    p.add_argument("unpacked_dir", help="Unpacked DOCX directory")
    p.add_argument("image_path", help="Path to the image file")
    p.add_argument(
        "--width",
        type=float,
        default=None,
        help="Image width in centimeters (auto-scales height if only width given)",
    )
    p.add_argument(
        "--height",
        type=float,
        default=None,
        help="Image height in centimeters (auto-scales width if only height given)",
    )

    # 插入位置参数组（互斥）
    position = p.add_mutually_exclusive_group()
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
             "not just headings)",
    )
    position.add_argument(
        "--after-text",
        type=str,
        default=None,
        metavar="TEXT",
        help="Insert after the paragraph whose text contains TEXT (searches all paragraphs, "
             "not just headings)",
    )

    args = p.parse_args()

    xml, msg = insert_image(args.unpacked_dir, args.image_path, args.width, args.height)
    if msg.startswith("Error"):
        print(msg, file=sys.stderr)
        sys.exit(1)

    print(msg)

    # 判断插入位置
    if args.append:
        result = _append_to_document_xml(args.unpacked_dir, xml)
        print(result)
        if result.startswith("Error"):
            sys.exit(1)
    elif args.prepend:
        result = _prepend_to_document_xml(args.unpacked_dir, xml)
        print(result)
        if result.startswith("Error"):
            sys.exit(1)
    elif args.page is not None:
        result = _insert_at_page(args.unpacked_dir, xml, args.page)
        print(result)
        if result.startswith("Error"):
            sys.exit(1)
    elif args.before_heading is not None:
        result = _insert_before_heading(args.unpacked_dir, xml, args.before_heading)
        print(result)
        if result.startswith("Error"):
            sys.exit(1)
    elif args.after_heading is not None:
        result = _insert_after_heading(args.unpacked_dir, xml, args.after_heading)
        print(result)
        if result.startswith("Error"):
            sys.exit(1)
    elif args.before_text is not None:
        result = _insert_before_text(args.unpacked_dir, xml, args.before_text)
        print(result)
        if result.startswith("Error"):
            sys.exit(1)
    elif args.after_text is not None:
        result = _insert_after_text(args.unpacked_dir, xml, args.after_text)
        print(result)
        if result.startswith("Error"):
            sys.exit(1)
    else:
        print()
        print("Insert the following XML into document.xml at the desired position:")
        print("(Place before </w:body> to append at end, or replace an existing <w:p> block)")
        print()
        print(xml)
