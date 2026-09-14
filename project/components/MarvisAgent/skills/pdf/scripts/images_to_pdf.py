#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
images_to_pdf.py
================

将多张图片合并为单个 PDF 文件的技能脚本。

设计目标：
- 覆盖"材料合并"类高频场景（身份证正反面、证件照、票据、合同扫描件等）。
- 默认纯净输出：不添加任何页码、标题、文件名、水印、边框等装饰元素。
- 智能默认布局：未指定每页张数时，按图片数量自动推断
  （恰好 2 张 -> 每页 2 张上下堆叠；其他情况 -> 每页 1 张）。

非目标（需回退到手写 pypdf + reportlab 代码）：
- 与已有 PDF 混合合并。
- 添加页码 / 标题 / 水印 / 文字标注。
- 非均匀布局 / 逐图片定制尺寸 / 书签 / 元数据。
- 图片裁剪 / 滤镜 / 圈注等额外处理。

用法示例：
    python images_to_pdf.py a.jpg b.jpg -o out.pdf
    python images_to_pdf.py front.jpg back.jpg -o idcard.pdf --per-page 2 --layout vertical
    python images_to_pdf.py "imgs/*.jpg" -o grid.pdf --per-page 4 --layout grid
"""

import argparse
import glob
import io
import os
import sys
import traceback
from typing import List, Tuple

from PIL import Image, ImageOps, UnidentifiedImageError
from reportlab.lib.pagesizes import A4, A5, LETTER, landscape, portrait
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas

# 支持的输入图片扩展名（小写、去点号）
SUPPORTED_IMAGE_EXTS = {"jpg", "jpeg", "png", "webp", "bmp"}

# 每页张数枚举值
PER_PAGE_CHOICES = ("auto", "1", "2", "4", "6", "9")

# 排列方式枚举值
LAYOUT_CHOICES = ("vertical", "horizontal", "grid")

# 页面尺寸枚举值
PAGE_SIZE_CHOICES = ("A4", "A5", "Letter")

# 页面方向枚举值
ORIENTATION_CHOICES = ("portrait", "landscape")

# 毫米到点的换算系数（1 英寸 = 25.4 毫米 = 72 点）
MM_TO_PT = 72.0 / 25.4

# 超大图片向下采样阈值：单边像素超过此值即进行等比缩放
MAX_DIMENSION_THRESHOLD = 10000

# 超大图片向下采样目标：最长边缩放到此值
MAX_DIMENSION_TARGET = 4000


def log_error(message: str) -> None:
    """向 stderr 打印错误消息（英文），不换行时由调用方自行控制。"""
    sys.stderr.write("[images_to_pdf][ERROR] {}\n".format(message))


def log_warning(message: str) -> None:
    """向 stderr 打印警告消息（英文）。"""
    sys.stderr.write("[images_to_pdf][WARN] {}\n".format(message))


def log_info(message: str) -> None:
    """向 stderr 打印信息消息（英文）；stdout 仅用于返回最终 PDF 路径。"""
    sys.stderr.write("[images_to_pdf][INFO] {}\n".format(message))


def _safe_glob(pattern: str) -> List[str]:
    """对含通配符的 pattern 执行 glob，自动转义前缀路径中的特殊字符。

    glob 会将 []、? 等字符识别为通配符字符类，当文件路径本身包含这些字符时
    会导致匹配失败。本函数将含通配符的最后一段与目录前缀分离，仅转义前缀部分。

    :param pattern: 可能含通配符（*、?、[）的路径模式。
    :return: 匹配到的路径列表（未排序）。
    """
    if any(ch in pattern for ch in ("*", "?", "[")):
        prefix, sep, suffix = pattern.rpartition(os.sep)
        if prefix:
            safe_pattern = glob.escape(prefix) + sep + suffix
        else:
            safe_pattern = pattern
    else:
        safe_pattern = glob.escape(pattern)
    return glob.glob(safe_pattern)


def expand_inputs(raw_inputs: List[str]) -> List[str]:
    """
    展开位置参数中的 glob 模式与目录。

    规则：
    - 若为已存在的目录：展开为该目录下所有受支持扩展名的文件（按文件名排序）。
    - 若包含通配符（*、?、[）：执行 glob 匹配，命中结果按文件名排序。
    - 其他情况：保留原字符串（后续校验其真实性）。

    :param raw_inputs: 原始输入字符串列表。
    :return: 展开后的图片路径列表，保留调用方给定的相对顺序。
    """
    expanded: List[str] = []
    for raw in raw_inputs:
        # 情况 1：已存在的目录
        if os.path.isdir(raw):
            matched = []
            for name in sorted(os.listdir(raw)):
                ext = os.path.splitext(name)[1].lower().lstrip(".")
                if ext in SUPPORTED_IMAGE_EXTS:
                    matched.append(os.path.join(raw, name))
            expanded.extend(matched)
            continue
        # 情况 2：包含通配符
        # 前置检查：如果 raw 是已存在的文件，直接走情况 3（避免路径中的 [] 被误解析为 glob 字符类）
        if os.path.isfile(raw):
            expanded.append(raw)
            continue
        if any(ch in raw for ch in ("*", "?", "[")):
            matched = sorted(_safe_glob(raw))
            expanded.extend(matched)
            continue
        # 情况 3：普通路径原样保留
        expanded.append(raw)
    return expanded


def load_and_normalize_image(path: str) -> Image.Image:
    """
    加载并规范化单张图片。

    处理内容：
    - 按 EXIF Orientation 标签自动旋转（使用 ImageOps.exif_transpose）。
    - 将 RGBA / LA / P 模式等带透明通道的图片合成到白色背景并转为 RGB。
    - 对单边超过阈值的超大图片按比例向下采样，防止 PDF 体积过大。

    :param path: 图片文件绝对路径或相对路径。
    :return: 规范化后的 PIL.Image.Image 对象（RGB 模式）。
    :raises OSError: 文件无法打开或格式不支持时抛出。
    :raises UnidentifiedImageError: Pillow 无法识别图片内容时抛出。
    """
    # 打开原图并立即 load，避免延迟读取导致 transpose 失败
    with Image.open(path) as raw:
        raw.load()
        # 按 EXIF 旋转为正方向
        oriented = ImageOps.exif_transpose(raw)

    # 处理透明通道：合成到白色背景
    if oriented.mode in ("RGBA", "LA"):
        background = Image.new("RGB", oriented.size, (255, 255, 255))
        alpha = oriented.split()[-1]
        if oriented.mode == "RGBA":
            background.paste(oriented, mask=alpha)
        else:
            # LA 模式：先转 RGBA 再贴
            rgba = oriented.convert("RGBA")
            background.paste(rgba, mask=rgba.split()[-1])
        oriented = background
    elif oriented.mode == "P":
        # 调色板模式可能带透明，统一转 RGBA 后再合成白底
        rgba = oriented.convert("RGBA")
        background = Image.new("RGB", rgba.size, (255, 255, 255))
        background.paste(rgba, mask=rgba.split()[-1])
        oriented = background
    elif oriented.mode != "RGB":
        oriented = oriented.convert("RGB")

    # 超大图片向下采样
    width, height = oriented.size
    max_side = max(width, height)
    if max_side > MAX_DIMENSION_THRESHOLD:
        scale = MAX_DIMENSION_TARGET / float(max_side)
        new_size = (int(width * scale), int(height * scale))
        oriented = oriented.resize(new_size, Image.LANCZOS)

    return oriented


def resolve_per_page(per_page_arg: str, image_count: int) -> int:
    """
    根据 --per-page 参数值与图片数量解析实际的每页张数。

    auto 模式规则（需求 1 规则 B）：
    - 图片数量恰好为 2 -> 返回 2（大概率是证件正反面）。
    - 图片数量为 1 或 >= 3 -> 返回 1（更通用的阅读体验）。

    :param per_page_arg: --per-page 参数原始字符串（auto 或 1/2/4/6/9）。
    :param image_count: 实际待合并的图片数量。
    :return: 实际每页张数整数。
    """
    if per_page_arg == "auto":
        return 2 if image_count == 2 else 1
    return int(per_page_arg)


def compute_slots(
    page_width_pt: float,
    page_height_pt: float,
    per_page: int,
    layout: str,
    margin_pt: float,
    gap_pt: float,
) -> List[Tuple[float, float, float, float]]:
    """
    计算单页上每个图片槽位的矩形坐标。

    坐标系：reportlab 以页面左下角为原点，x 向右、y 向上，单位为点（pt）。
    返回的槽位按"从左到右、从上到下"的阅读顺序排列。

    :param page_width_pt: 页面宽度（点）。
    :param page_height_pt: 页面高度（点）。
    :param per_page: 每页图片数（1/2/4/6/9）。
    :param layout: 排列方式（vertical/horizontal/grid）。
    :param margin_pt: 页面边距（点）。
    :param gap_pt: 图片间距（点）。
    :return: 槽位列表，每个元素为 (x, y, width, height)。
    :raises ValueError: per_page 与 layout 组合非法时抛出。
    """
    content_width = page_width_pt - 2 * margin_pt
    content_height = page_height_pt - 2 * margin_pt
    if content_width <= 0 or content_height <= 0:
        raise ValueError("Page margin too large for the given page size")

    # 根据 per_page + layout 决定行列数
    rows, cols = _resolve_rows_cols(per_page, layout)

    slot_width = (content_width - gap_pt * (cols - 1)) / cols
    slot_height = (content_height - gap_pt * (rows - 1)) / rows

    slots: List[Tuple[float, float, float, float]] = []
    # 按阅读顺序（从上到下、从左到右）生成槽位
    for row_idx in range(rows):
        for col_idx in range(cols):
            x = margin_pt + col_idx * (slot_width + gap_pt)
            # y 轴从页面顶部向下计算，再转为 reportlab 的左下原点坐标
            y_from_top = margin_pt + row_idx * (slot_height + gap_pt)
            y = page_height_pt - y_from_top - slot_height
            slots.append((x, y, slot_width, slot_height))
    return slots


def _resolve_rows_cols(per_page: int, layout: str) -> Tuple[int, int]:
    """
    根据 per_page 与 layout 推断行列数。

    :param per_page: 每页图片数（1/2/4/6/9）。
    :param layout: 排列方式（vertical/horizontal/grid）。
    :return: (rows, cols) 元组。
    :raises ValueError: 非法组合时抛出。
    """
    if per_page == 1:
        if layout not in ("vertical", "horizontal"):
            # 单张场景下 grid 无意义，拒绝该组合
            raise ValueError("layout={} is not compatible with per-page=1".format(layout))
        return (1, 1)
    if per_page == 2:
        if layout == "vertical":
            return (2, 1)
        if layout == "horizontal":
            return (1, 2)
        raise ValueError("layout=grid is not compatible with per-page=2")
    if per_page == 4:
        if layout != "grid":
            raise ValueError("per-page=4 must use layout=grid")
        return (2, 2)
    if per_page == 6:
        if layout != "grid":
            raise ValueError("per-page=6 must use layout=grid")
        return (3, 2)
    if per_page == 9:
        if layout != "grid":
            raise ValueError("per-page=9 must use layout=grid")
        return (3, 3)
    raise ValueError("Unsupported per-page value: {}".format(per_page))


def resolve_page_size(size_name: str, orientation: str) -> Tuple[float, float]:
    """
    根据尺寸名称与方向返回页面（宽, 高）点坐标。

    :param size_name: A4/A5/Letter。
    :param orientation: portrait/landscape。
    :return: (width_pt, height_pt) 元组。
    """
    size_map = {
        "A4": A4,
        "A5": A5,
        "Letter": LETTER,
    }
    base = size_map[size_name]
    return portrait(base) if orientation == "portrait" else landscape(base)


def fit_image_into_slot(
    image_size: Tuple[int, int],
    slot: Tuple[float, float, float, float],
) -> Tuple[float, float, float, float]:
    """
    将图片等比缩放并在槽位内居中，返回实际绘制矩形。

    :param image_size: (image_width_px, image_height_px)。
    :param slot: 槽位 (x, y, width, height)。
    :return: (draw_x, draw_y, draw_width, draw_height)。
    """
    img_w, img_h = image_size
    slot_x, slot_y, slot_w, slot_h = slot

    # 计算等比缩放比例（取短边限制以保证完整显示）
    scale = min(slot_w / float(img_w), slot_h / float(img_h))
    draw_w = img_w * scale
    draw_h = img_h * scale

    # 居中放置
    draw_x = slot_x + (slot_w - draw_w) / 2.0
    draw_y = slot_y + (slot_h - draw_h) / 2.0
    return (draw_x, draw_y, draw_w, draw_h)


def render_pdf(
    images: List[Image.Image],
    output_path: str,
    page_width_pt: float,
    page_height_pt: float,
    per_page: int,
    slots: List[Tuple[float, float, float, float]],
) -> None:
    """
    按页绘制 PDF，不添加任何装饰元素。

    :param images: 已经预处理过的 PIL 图像列表。
    :param output_path: 输出 PDF 绝对路径。
    :param page_width_pt: 页面宽度（点）。
    :param page_height_pt: 页面高度（点）。
    :param per_page: 每页图片数。
    :param slots: 单页槽位列表。
    """
    pdf = canvas.Canvas(output_path, pagesize=(page_width_pt, page_height_pt))
    total = len(images)

    for page_start in range(0, total, per_page):
        page_images = images[page_start:page_start + per_page]
        # 最后一页不足 per_page 张时，仅占用靠前的槽位，其余留白（不绘制任何东西）
        for idx, image in enumerate(page_images):
            slot = slots[idx]
            draw_x, draw_y, draw_w, draw_h = fit_image_into_slot(image.size, slot)
            reader = _build_image_reader(image)
            pdf.drawImage(
                reader,
                draw_x,
                draw_y,
                width=draw_w,
                height=draw_h,
                preserveAspectRatio=True,
                anchor="c",
                mask="auto",
            )
        pdf.showPage()

    pdf.save()


def _build_image_reader(image: Image.Image) -> ImageReader:
    """
    将内存中的 PIL 图片封装为 reportlab 可消费的 ImageReader。

    实现方式：把图片以 PNG 格式编码到 BytesIO，再交给 ImageReader。
    这样可以保证 reportlab 拿到的是稳定的内存字节流，避免对本地原文件格式的依赖。

    :param image: 已处理过的 PIL 图像。
    :return: reportlab 的 ImageReader 实例。
    """
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    buffer.seek(0)
    return ImageReader(buffer)


def validate_output_path(output_path: str) -> str:
    """
    校验并规范化输出 PDF 路径。

    - 扩展名必须为 .pdf。
    - 输出目录不存在时自动创建。

    :param output_path: 用户传入的输出路径。
    :return: 规范化后的绝对路径。
    :raises ValueError: 扩展名非法时抛出。
    :raises OSError: 目录创建失败时抛出。
    """
    abs_path = os.path.abspath(output_path)
    ext = os.path.splitext(abs_path)[1].lower()
    if ext != ".pdf":
        raise ValueError("Output file must have .pdf extension, got: {}".format(ext or "(none)"))
    parent = os.path.dirname(abs_path)
    if parent and not os.path.isdir(parent):
        os.makedirs(parent, exist_ok=True)
    return abs_path


def validate_and_filter_inputs(paths: List[str]) -> List[str]:
    """
    校验输入图片路径列表：仅保留扩展名合法且文件存在的项。

    对不存在/扩展名非法的项打印英文警告到 stderr，但不直接抛出；
    真正的"全部失败"判定在图片加载阶段完成。

    :param paths: 展开后的图片路径列表。
    :return: 过滤后的合法路径列表。
    """
    valid: List[str] = []
    for path in paths:
        if not os.path.isfile(path):
            log_warning("Input not found or not a regular file: {}".format(path))
            continue
        ext = os.path.splitext(path)[1].lower().lstrip(".")
        if ext not in SUPPORTED_IMAGE_EXTS:
            log_warning(
                "Unsupported image extension '.{}' (supported: {}): {}".format(
                    ext, ",".join(sorted(SUPPORTED_IMAGE_EXTS)), path,
                )
            )
            continue
        valid.append(path)
    return valid


def load_images(paths: List[str]) -> List[Image.Image]:
    """
    批量加载并预处理图片，自动跳过损坏文件。

    :param paths: 合法的图片路径列表（已通过扩展名与存在性校验）。
    :return: 成功加载的 PIL 图像列表。
    """
    images: List[Image.Image] = []
    for path in paths:
        try:
            images.append(load_and_normalize_image(path))
        except (UnidentifiedImageError, OSError) as exc:
            log_warning("Failed to open image '{}': {}".format(path, exc))
        except Exception as exc:  # pylint: disable=broad-except
            # 防御性兜底：单张图片异常不应影响整批处理
            log_warning("Unexpected error while loading '{}': {}".format(path, exc))
    return images


def build_arg_parser() -> argparse.ArgumentParser:
    """构造命令行参数解析器。"""
    parser = argparse.ArgumentParser(
        prog="images_to_pdf.py",
        description=(
            "Merge multiple images into a single PDF. "
            "Pure output by default (no page numbers, titles, watermarks)."
        ),
    )
    parser.add_argument(
        "inputs",
        nargs="+",
        help="Input image paths, directories, or glob patterns (jpg/jpeg/png/webp/bmp).",
    )
    parser.add_argument(
        "-o", "--output",
        required=True,
        help="Output PDF file path (must end with .pdf).",
    )
    parser.add_argument(
        "--per-page",
        choices=PER_PAGE_CHOICES,
        default="auto",
        help="Images per page. 'auto' (default) picks 2 when exactly 2 inputs, otherwise 1.",
    )
    parser.add_argument(
        "--layout",
        choices=LAYOUT_CHOICES,
        default="vertical",
        help="Arrangement on each page (default: vertical).",
    )
    parser.add_argument(
        "--page-size",
        choices=PAGE_SIZE_CHOICES,
        default="A4",
        help="Page size (default: A4).",
    )
    parser.add_argument(
        "--orientation",
        choices=ORIENTATION_CHOICES,
        default="portrait",
        help="Page orientation (default: portrait).",
    )
    parser.add_argument(
        "--margin",
        type=float,
        default=15.0,
        help="Page margin in millimeters (default: 15).",
    )
    parser.add_argument(
        "--gap",
        type=float,
        default=10.0,
        help="Gap between images in millimeters (default: 10).",
    )
    return parser


def run(args: argparse.Namespace) -> int:
    """
    主流程：参数校验 -> 输入展开 -> 图片加载 -> 布局计算 -> 渲染输出。

    :param args: argparse 解析后的命名空间。
    :return: 退出码，0 表示成功，非 0 表示失败。
    """
    # 展开输入 + 扩展名/存在性校验
    expanded = expand_inputs(args.inputs)
    if not expanded:
        log_error("No input images provided")
        return 2
    valid_paths = validate_and_filter_inputs(expanded)
    if not valid_paths:
        log_error("No input images provided")
        return 2

    # 校验边距与间距为非负数
    if args.margin < 0 or args.gap < 0:
        log_error("margin and gap must be non-negative")
        return 2

    # 校验输出路径
    try:
        output_path = validate_output_path(args.output)
    except ValueError as exc:
        log_error(str(exc))
        return 2
    except OSError as exc:
        log_error("Failed to create output directory: {}".format(exc))
        return 2

    # 加载图片
    images = load_images(valid_paths)
    if not images:
        log_error("All input images failed to load")
        return 3

    # 解析每页张数与布局
    per_page = resolve_per_page(args.per_page, len(images))
    layout = args.layout
    # per-page=1 时 layout=grid 非法，per-page>=4 时强制 grid：此处在 _resolve_rows_cols 中校验
    # 这里提前做一次组合校验以便更早报错
    try:
        page_width_pt, page_height_pt = resolve_page_size(args.page_size, args.orientation)
        margin_pt = args.margin * MM_TO_PT
        gap_pt = args.gap * MM_TO_PT
        slots = compute_slots(page_width_pt, page_height_pt, per_page, layout, margin_pt, gap_pt)
    except ValueError as exc:
        log_error(str(exc))
        return 2

    # 渲染 PDF
    try:
        render_pdf(images, output_path, page_width_pt, page_height_pt, per_page, slots)
    except OSError as exc:
        log_error("Failed to write PDF: {}".format(exc))
        return 4
    except Exception as exc:  # pylint: disable=broad-except
        log_error("Unexpected rendering error: {}".format(exc))
        traceback.print_exc(file=sys.stderr)
        return 5

    # 成功：输出绝对路径到 stdout 供调用方捕获
    log_info(
        "Generated PDF with {} image(s), {} per page, layout={}".format(
            len(images), per_page, layout,
        )
    )
    sys.stdout.write(output_path + "\n")
    sys.stdout.flush()
    return 0


def main() -> int:
    """脚本入口。"""
    parser = build_arg_parser()
    args = parser.parse_args()
    return run(args)


if __name__ == "__main__":
    sys.exit(main())
