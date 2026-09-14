# -*- coding: utf-8 -*-
"""
将一组图片打包成 PPTX 演示文稿（高保真相册脚本）。

设计目标：
- **无损嵌入**：直接把图片字节流写入 PPTX，绝不经过二次编码（避免 JPEG 重压缩）。
- **不裁剪不变形**：每张图按 contain 模式等比缩放并在 slide 内居中，多余区域用背景色填充。
- **统一 16:9 画布**：默认所有 slide 统一使用 16:9 宽屏画布；如需其他比例可通过 ``--aspect``
  显式指定（PPTX 格式本身不支持每页独立尺寸，所以一份文件只能有一个全局画布）。
- **抗 PowerPoint 自动压缩**：生成后向 ppt/presentation.xml 注入 ``p15:doNotCompress``
  扩展标记，使 PowerPoint 在保存或重新打开时不会按默认 ppi 降采样图片。

典型用法：
    python scripts/images_to_pptx.py <image_dir_or_files...> -o <output.pptx>

示例：
    # 1) 一个目录下的所有图片，按文件名排序，默认 16:9 宽屏画布
    python scripts/images_to_pptx.py D:/photos -o output/album.pptx

    # 2) 显式枚举图片，并用第一张图的比例作为统一画布
    python scripts/images_to_pptx.py a.jpg b.png c.jpg -o output/out.pptx --aspect first

    # 3) 9:16 竖屏画布 + 白色背景
    python scripts/images_to_pptx.py D:/photos -o output/out.pptx --aspect 9:16 --bg FFFFFF

依赖：
    pip install python-pptx Pillow
"""

import argparse
import io
import os
import shutil
import sys
import tempfile
import zipfile
from pathlib import Path
from typing import Iterable

from PIL import Image
from pptx import Presentation
from pptx.util import Emu

# Windows 终端默认编码可能不是 UTF-8，强制设置以避免中文路径乱码
if os.name == "nt" and hasattr(sys.stdout, "buffer"):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")


# 支持的图片扩展名（小写比对）
SUPPORTED_EXTS = {".jpg", ".jpeg", ".png", ".bmp", ".gif", ".tif", ".tiff", ".webp"}

# python-pptx 默认空白演示文稿尺寸为 9144000 x 6858000 EMU（10in x 7.5in，4:3）。
# 这里默认采用 16:9 宽屏 13.333in x 7.5in。
EMU_PER_INCH = 914400
DEFAULT_LONG_SIDE_INCH = 13.333  # 长边英寸数（足够保证渲染清晰）

# 预置画布比例（宽 / 高）
PRESET_ASPECTS = {
    "16:9": 16.0 / 9.0,
    "9:16": 9.0 / 16.0,
    "4:3": 4.0 / 3.0,
    "3:4": 3.0 / 4.0,
    "1:1": 1.0,
}

# 注入到 ppt/presentation.xml 的 doNotCompress 扩展节点
# 该 ext uri 是 Microsoft 公开的扩展标识；val=1 即关闭自动压缩
P15_NS = "http://schemas.microsoft.com/office/powerpoint/2012/main"
DONOTCOMPRESS_EXT_URI = "{EFAFB233-063F-42B5-8137-9DF3F51BA10A}"
DONOTCOMPRESS_EXT_XML = (
    '<p:extLst>'
    f'<p:ext uri="{DONOTCOMPRESS_EXT_URI}">'
    f'<p15:doNotAutoCompressPictures xmlns:p15="{P15_NS}" val="1"/>'
    '</p:ext>'
    '</p:extLst>'
)


def _build_parser() -> argparse.ArgumentParser:
    """构造命令行参数解析器。"""
    parser = argparse.ArgumentParser(
        prog="images_to_pptx.py",
        description="将一组图片高保真打包为 PPTX（无损嵌入 + 不裁剪 + 抗自动压缩）。",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "inputs",
        nargs="+",
        help="图片文件或包含图片的目录（可混合传入多个），目录会按文件名升序遍历。",
    )
    parser.add_argument(
        "-o",
        "--output",
        required=True,
        help="输出 .pptx 文件路径（建议放到会话 output/ 目录）。",
    )
    parser.add_argument(
        "--aspect",
        default="16:9",
        help=(
            "画布比例，默认 16:9 宽屏；可选 9:16 / 4:3 / 3:4 / 1:1 等预置，"
            "或 first（用第一张图比例）、自定义如 1920x1080。"
        ),
    )
    parser.add_argument(
        "--bg",
        default="FFFFFF",
        help="留白区域背景色（6 位 16 进制 RGB，默认 FFFFFF 白色；如需相册感深底可改 000000 黑色）。",
    )
    parser.add_argument(
        "--margin",
        type=float,
        default=0.0,
        help="图片到 slide 四边的最小留白英寸数，默认 0（图片尽可能铺满画布）。",
    )
    parser.add_argument(
        "--no-do-not-compress",
        action="store_true",
        help="不注入 doNotCompress 标记（仅用于调试，不推荐）。",
    )
    parser.add_argument(
        "--quiet",
        action="store_true",
        help="抑制逐张预览输出。",
    )
    return parser


def _iter_image_paths(inputs: Iterable[str]) -> list[Path]:
    """把命令行输入展开为文件列表。

    :param inputs: 文件或目录路径的混合列表。
    :return: 去重后的有序图片文件列表。
    """
    seen: set = set()
    result: list = []
    for raw in inputs:
        path = Path(raw)
        if path.is_dir():
            for child in sorted(path.iterdir(), key=lambda p: p.name.lower()):
                if child.is_file() and child.suffix.lower() in SUPPORTED_EXTS:
                    key = child.resolve()
                    if key not in seen:
                        seen.add(key)
                        result.append(child)
        elif path.is_file():
            if path.suffix.lower() not in SUPPORTED_EXTS:
                print(f"警告：跳过不支持的扩展名：{path}", file=sys.stderr)
                continue
            key = path.resolve()
            if key not in seen:
                seen.add(key)
                result.append(path)
        else:
            print(f"警告：路径不存在，已跳过：{path}", file=sys.stderr)
    return result


def _read_image_size(path: Path) -> tuple:
    """读取图片像素尺寸 (width, height)。"""
    with Image.open(path) as img:
        return img.size


def _decide_canvas_aspect(
    aspect_arg: str,
    image_sizes: list,
) -> tuple:
    """根据 --aspect 参数与图片像素尺寸决定画布的 (宽, 高) EMU。

    - 预置比例（如 16:9）：长边按 ``DEFAULT_LONG_SIDE_INCH`` 取值。
    - first：使用第一张图的像素比例。
    - auto：等同于 16:9，仅为向后兼容保留。
    - 自定义如 ``1920x1080`` / ``1920:1080``：按显式像素比例。

    :param aspect_arg: 命令行 --aspect 字符串。
    :param image_sizes: [(w, h), ...] 像素尺寸列表。
    :return: (slide_width_emu, slide_height_emu)
    """
    arg = aspect_arg.strip().lower()

    if arg == "first":
        if not image_sizes:
            raise ValueError("没有可用图片用于 first 模式")
        ratio = image_sizes[0][0] / image_sizes[0][1]
    elif arg == "auto":
        # 向后兼容：auto 现在等同于默认的 16:9 宽屏画布
        ratio = PRESET_ASPECTS["16:9"]
    elif arg in PRESET_ASPECTS:
        ratio = PRESET_ASPECTS[arg]
    else:
        # 支持 "1920x1080" 或 "16:9" 形式的自定义
        sep = "x" if "x" in arg else ":"
        if sep not in arg:
            raise ValueError(f"无法识别的 --aspect 取值：{aspect_arg}")
        left, right = arg.split(sep, 1)
        ratio = float(left) / float(right)

    if ratio >= 1.0:
        # 横向：长边为宽
        width_in = DEFAULT_LONG_SIDE_INCH
        height_in = width_in / ratio
    else:
        # 纵向：长边为高
        height_in = DEFAULT_LONG_SIDE_INCH
        width_in = height_in * ratio

    return Emu(int(width_in * EMU_PER_INCH)), Emu(int(height_in * EMU_PER_INCH))


def _hex_to_rgb(hex_str: str) -> tuple:
    """把 6 位 16 进制颜色字符串转为 (r, g, b) 整数元组。"""
    cleaned = hex_str.strip().lstrip("#")
    if len(cleaned) != 6:
        raise ValueError(f"颜色必须是 6 位 16 进制字符串，例如 FFFFFF：{hex_str!r}")
    try:
        red = int(cleaned[0:2], 16)
        green = int(cleaned[2:4], 16)
        blue = int(cleaned[4:6], 16)
    except ValueError as exc:
        raise ValueError(f"颜色解析失败：{hex_str!r}") from exc
    return (red, green, blue)


def _set_slide_background(slide, rgb: tuple) -> None:
    """为单张幻灯片设置纯色背景。

    python-pptx 没有直接 API 设置 slide 背景色，这里通过修改底层 XML 添加
    ``<p:bg>`` 节点实现。这样留白区域才会显示我们指定的背景色。
    """
    from pptx.oxml.ns import qn
    from lxml import etree

    red, green, blue = rgb
    hex_color = f"{red:02X}{green:02X}{blue:02X}"
    cSld = slide.background._cSld  # pylint: disable=protected-access

    # 移除已有的 bg 节点（如果有）
    existing = cSld.find(qn("p:bg"))
    if existing is not None:
        cSld.remove(existing)

    bg_xml = (
        '<p:bg xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" '
        'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">'
        '<p:bgPr>'
        f'<a:solidFill><a:srgbClr val="{hex_color}"/></a:solidFill>'
        '<a:effectLst/>'
        '</p:bgPr>'
        '</p:bg>'
    )
    bg_elem = etree.fromstring(bg_xml)
    # bg 必须作为 cSld 的第一个子节点
    cSld.insert(0, bg_elem)


def _compute_contain_box(
    slide_w_emu: int,
    slide_h_emu: int,
    img_w_px: int,
    img_h_px: int,
    margin_emu: int,
) -> tuple:
    """计算 contain 模式下图片在 slide 中的 (x, y, w, h) EMU。"""
    avail_w = slide_w_emu - margin_emu * 2
    avail_h = slide_h_emu - margin_emu * 2
    if avail_w <= 0 or avail_h <= 0:
        raise ValueError("margin 过大，导致可用区域为零")

    img_ratio = img_w_px / img_h_px
    box_ratio = avail_w / avail_h

    if img_ratio >= box_ratio:
        # 图片更"宽"，以宽度为准
        target_w = avail_w
        target_h = int(round(avail_w / img_ratio))
    else:
        target_h = avail_h
        target_w = int(round(avail_h * img_ratio))

    x = margin_emu + (avail_w - target_w) // 2
    y = margin_emu + (avail_h - target_h) // 2
    return x, y, target_w, target_h


def _build_pptx(
    image_paths: list,
    output_path: Path,
    slide_w_emu: int,
    slide_h_emu: int,
    bg_rgb: tuple,
    margin_emu: int,
    quiet: bool,
) -> int:
    """生成 PPTX 文件，返回成功添加的幻灯片数。"""
    prs = Presentation()
    prs.slide_width = slide_w_emu
    prs.slide_height = slide_h_emu

    # 使用空白布局（layouts[6] = blank），这是 python-pptx 默认模板的固定布局
    blank_layout = prs.slide_layouts[6]

    added = 0
    for idx, img_path in enumerate(image_paths, start=1):
        try:
            img_w, img_h = _read_image_size(img_path)
        except (OSError, ValueError) as exc:
            print(f"警告：无法读取图片 {img_path}：{exc}，已跳过", file=sys.stderr)
            continue

        slide = prs.slides.add_slide(blank_layout)
        _set_slide_background(slide, bg_rgb)

        x, y, target_w, target_h = _compute_contain_box(
            slide_w_emu, slide_h_emu, img_w, img_h, margin_emu,
        )
        slide.shapes.add_picture(
            str(img_path),
            Emu(x),
            Emu(y),
            width=Emu(target_w),
            height=Emu(target_h),
        )
        added += 1
        if not quiet:
            print(f"slide {idx}: {img_path.name}  ({img_w}x{img_h})")

    output_path.parent.mkdir(parents=True, exist_ok=True)
    prs.save(str(output_path))
    return added


def _inject_do_not_compress(pptx_path: Path) -> None:
    """向 ppt/presentation.xml 注入 doNotAutoCompressPictures 扩展标记。

    PowerPoint 默认会按 "文件 -> 选项 -> 高级 -> 默认分辨率" 设置在保存或重新打开时
    对所有内嵌图片进行降采样。注入此标记后，PowerPoint 将跳过对该文档的自动压缩。
    """
    tmp_fd, tmp_name = tempfile.mkstemp(suffix=".pptx")
    os.close(tmp_fd)
    tmp_path = Path(tmp_name)

    target_member = "ppt/presentation.xml"
    try:
        with zipfile.ZipFile(pptx_path, "r") as zin:
            namelist = zin.namelist()
            if target_member not in namelist:
                raise RuntimeError(f"PPTX 内未找到 {target_member}")
            with zipfile.ZipFile(tmp_path, "w", zipfile.ZIP_DEFLATED) as zout:
                for name in namelist:
                    data = zin.read(name)
                    if name == target_member:
                        data = _patch_presentation_xml(data)
                    zout.writestr(name, data)
        shutil.move(str(tmp_path), str(pptx_path))
    finally:
        if tmp_path.exists():
            try:
                tmp_path.unlink()
            except OSError:
                pass


def _patch_presentation_xml(raw: bytes) -> bytes:
    """在 presentation.xml 末尾的 </p:presentation> 之前插入 extLst 节点。

    若已存在 extLst，则在其内部追加我们的 ext 节点（避免重复插入相同 uri）。
    采用字符串级处理而非完整 DOM 解析，以最大限度避免命名空间被重排导致 PowerPoint
    对扩展节点的兼容性问题。
    """
    text = raw.decode("utf-8")

    # 已经包含我们的扩展则跳过
    if DONOTCOMPRESS_EXT_URI in text:
        return raw

    closing_tag = "</p:presentation>"
    if closing_tag not in text:
        return raw

    if "<p:extLst>" in text and "</p:extLst>" in text:
        # 已存在 extLst：在其闭合标签前追加我们的 ext
        ext_only = (
            f'<p:ext uri="{DONOTCOMPRESS_EXT_URI}">'
            f'<p15:doNotAutoCompressPictures xmlns:p15="{P15_NS}" val="1"/>'
            '</p:ext>'
        )
        patched = text.replace("</p:extLst>", ext_only + "</p:extLst>", 1)
    else:
        # 不存在则在 </p:presentation> 前直接插入完整 extLst
        patched = text.replace(closing_tag, DONOTCOMPRESS_EXT_XML + closing_tag, 1)

    return patched.encode("utf-8")


def main() -> int:
    """脚本主入口。"""
    parser = _build_parser()
    args = parser.parse_args()

    image_paths = _iter_image_paths(args.inputs)
    if not image_paths:
        print("错误：未找到任何受支持的图片", file=sys.stderr)
        return 1

    try:
        bg_rgb = _hex_to_rgb(args.bg)
    except ValueError as exc:
        print(f"错误：{exc}", file=sys.stderr)
        return 1

    # 预扫描所有图片尺寸，决定画布比例
    image_sizes: list = []
    valid_paths: list = []
    for path in image_paths:
        try:
            image_sizes.append(_read_image_size(path))
            valid_paths.append(path)
        except (OSError, ValueError) as exc:
            print(f"警告：跳过损坏图片 {path}：{exc}", file=sys.stderr)

    if not valid_paths:
        print("错误：没有可用的图片", file=sys.stderr)
        return 1

    try:
        slide_w_emu, slide_h_emu = _decide_canvas_aspect(args.aspect, image_sizes)
    except ValueError as exc:
        print(f"错误：{exc}", file=sys.stderr)
        return 1

    margin_emu = int(args.margin * EMU_PER_INCH)

    output_path = Path(args.output)
    try:
        added = _build_pptx(
            valid_paths,
            output_path,
            slide_w_emu,
            slide_h_emu,
            bg_rgb,
            margin_emu,
            args.quiet,
        )
    except (OSError, ValueError) as exc:
        print(f"错误：生成 pptx 失败：{exc}", file=sys.stderr)
        return 1
    except Exception as exc:  # pylint: disable=broad-except
        # python-pptx / lxml 可能抛出形态各异的异常，这里兜底以确保中文错误输出
        print(f"错误：未预期的异常：{exc}", file=sys.stderr)
        return 1

    if not args.no_do_not_compress:
        try:
            _inject_do_not_compress(output_path)
        except (OSError, RuntimeError, zipfile.BadZipFile) as exc:
            print(
                f"警告：注入 doNotCompress 标记失败（不影响生成结果）：{exc}",
                file=sys.stderr,
            )

    canvas_w_in = slide_w_emu / EMU_PER_INCH
    canvas_h_in = slide_h_emu / EMU_PER_INCH
    print(
        f"已生成 PPTX：{output_path}（共 {added} 张幻灯片，"
        f"画布 {canvas_w_in:.3f}in x {canvas_h_in:.3f}in）"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
