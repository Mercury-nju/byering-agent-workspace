# -*- coding: utf-8 -*-
"""图片预处理工具模块。

提供图片方向检测、图片收集、FFmpeg 缩放滤镜构建等功能。
图片方向检测逻辑迁移自原 remotion skill 的 detect-image-orientation.py，
支持 Pillow 检测和纯文件头解析两种模式。
"""

import os
import struct
from pathlib import Path
from typing import Optional

from loguru import logger

# 支持的图片扩展名
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".gif", ".webp", ".tiff", ".tif"}


def get_image_size_pillow(filepath: str) -> tuple:
    """使用 Pillow 获取图片尺寸。

    :param filepath: 图片文件路径
    :return: (width, height) 元组
    :raises ImportError: Pillow 未安装
    """
    from PIL import Image

    with Image.open(filepath) as img:
        return img.size


def get_image_size_fallback(filepath: str) -> tuple:
    """不依赖 Pillow，通过解析文件头获取图片尺寸。

    支持 JPEG、PNG、BMP、GIF 格式。

    :param filepath: 图片文件路径
    :return: (width, height) 元组
    :raises ValueError: 无法解析的图片格式
    """
    with open(filepath, "rb") as f:
        header = f.read(32)

        # PNG: 固定文件头 + IHDR chunk
        if header[:8] == b"\x89PNG\r\n\x1a\n":
            width = struct.unpack(">I", header[16:20])[0]
            height = struct.unpack(">I", header[20:24])[0]
            return (width, height)

        # GIF: GIF87a 或 GIF89a
        if header[:6] in (b"GIF87a", b"GIF89a"):
            width = struct.unpack("<H", header[6:8])[0]
            height = struct.unpack("<H", header[8:10])[0]
            return (width, height)

        # BMP: 'BM' 文件头
        if header[:2] == b"BM":
            width = struct.unpack("<I", header[18:22])[0]
            height = abs(struct.unpack("<i", header[22:26])[0])
            return (width, height)

        # JPEG: 需要遍历 marker 段找到 SOF
        if header[:2] == b"\xff\xd8":
            f.seek(2)
            while True:
                marker_bytes = f.read(2)
                if len(marker_bytes) < 2:
                    break
                marker = struct.unpack(">H", marker_bytes)[0]

                # 跳过填充字节
                if marker == 0xFFFF:
                    f.seek(-1, 1)
                    continue

                # SOF0 ~ SOF15（排除 DHT=0xFFC4、DQT=0xFFDB 等非帧标记）
                if 0xFFC0 <= marker <= 0xFFCF and marker not in (0xFFC4, 0xFFC8, 0xFFCC):
                    length_bytes = f.read(2)
                    if len(length_bytes) < 2:
                        break
                    # 跳过 precision 字节
                    f.read(1)
                    height_bytes = f.read(2)
                    width_bytes = f.read(2)
                    if len(height_bytes) < 2 or len(width_bytes) < 2:
                        break
                    height = struct.unpack(">H", height_bytes)[0]
                    width = struct.unpack(">H", width_bytes)[0]
                    return (width, height)

                # 跳过当前 marker 段
                length_bytes = f.read(2)
                if len(length_bytes) < 2:
                    break
                length = struct.unpack(">H", length_bytes)[0]
                f.seek(length - 2, 1)

    raise ValueError(f"无法解析图片尺寸: {filepath}")


def get_image_size(filepath: str) -> tuple:
    """获取图片尺寸，优先使用 Pillow，回退到文件头解析。

    :param filepath: 图片文件路径
    :return: (width, height) 元组
    """
    try:
        return get_image_size_pillow(filepath)
    except ImportError:
        return get_image_size_fallback(filepath)


def detect_orientation(filepath: str) -> dict:
    """检测单张图片的尺寸和方向。

    :param filepath: 图片文件路径
    :return: 包含图片信息的字典：
        {
            "filepath": "完整路径",
            "filename": "文件名",
            "width": 宽度,
            "height": 高度,
            "orientation": "landscape" 或 "portrait"
        }
    """
    path = Path(filepath)
    try:
        width, height = get_image_size(str(path))
        orientation = "landscape" if width >= height else "portrait"
        logger.debug(
            "Image {}: {}x{} ({})",
            path.name, width, height, orientation,
        )
        return {
            "filepath": str(path.resolve()),
            "filename": path.name,
            "width": width,
            "height": height,
            "orientation": orientation,
        }
    except (ValueError, OSError) as exc:
        logger.warning("Could not detect image {}: {}", path.name, exc)
        return {
            "filepath": str(path.resolve()),
            "filename": path.name,
            "width": 0,
            "height": 0,
            "orientation": "unknown",
        }


def collect_images(source: str) -> list:
    """从文件路径列表或目录路径收集图片文件。

    :param source: 图片目录路径或单个图片文件路径
    :return: 图片信息字典列表（每项包含 filepath、filename、width、height、orientation）
    :raises FileNotFoundError: 路径不存在
    :raises ValueError: 未找到任何支持的图片文件
    """
    source_path = Path(source)

    if not source_path.exists():
        raise FileNotFoundError(f"路径不存在: {source}")

    image_files = []

    if source_path.is_dir():
        # 从目录收集图片
        for item in sorted(source_path.iterdir()):
            if item.is_file() and item.suffix.lower() in IMAGE_EXTENSIONS:
                image_files.append(str(item))
    elif source_path.is_file():
        # 单个文件
        if source_path.suffix.lower() in IMAGE_EXTENSIONS:
            image_files.append(str(source_path))
        else:
            raise ValueError(f"不支持的图片格式: {source_path.suffix}")
    else:
        raise FileNotFoundError(f"路径不存在: {source}")

    if not image_files:
        raise ValueError(f"在 {source} 中未找到支持的图片文件（支持格式: {', '.join(sorted(IMAGE_EXTENSIONS))}）")

    logger.info("Collected {} images from {}", len(image_files), source)

    # 检测每张图片的尺寸和方向
    results = []
    for img_path in image_files:
        info = detect_orientation(img_path)
        results.append(info)

    return results


def collect_images_from_list(paths: list) -> list:
    """从文件路径列表收集图片文件。

    :param paths: 图片文件路径列表
    :return: 图片信息字典列表
    :raises FileNotFoundError: 某个文件不存在
    :raises ValueError: 列表为空或包含不支持的格式
    """
    if not paths:
        raise ValueError("图片路径列表为空")

    results = []
    for img_path in paths:
        path = Path(img_path)
        if not path.exists():
            raise FileNotFoundError(f"图片文件不存在: {img_path}")
        if path.suffix.lower() not in IMAGE_EXTENSIONS:
            raise ValueError(
                f"不支持的图片格式 {path.suffix}: {img_path}"
                f"（支持格式: {', '.join(sorted(IMAGE_EXTENSIONS))}）"
            )
        info = detect_orientation(str(path))
        results.append(info)

    logger.info("Collected {} images from path list", len(results))
    return results


def build_scale_filter(
    src_width: int,
    src_height: int,
    dst_width: int,
    dst_height: int,
    background_color: str = "black",
) -> str:
    """根据图片尺寸和目标分辨率，生成 FFmpeg 的 scale+pad 滤镜字符串。

    保持宽高比，使用 lanczos 缩放算法，不足部分用背景色填充。

    :param src_width: 源图片宽度
    :param src_height: 源图片高度
    :param dst_width: 目标宽度
    :param dst_height: 目标高度
    :param background_color: 背景填充颜色，默认 "black"
    :return: FFmpeg 滤镜字符串
    """
    # 计算缩放比例，保持宽高比，使图片完全放入目标区域
    scale_w = dst_width / src_width
    scale_h = dst_height / src_height
    scale = min(scale_w, scale_h)

    # 计算缩放后的尺寸（确保为偶数，FFmpeg 要求）
    scaled_w = int(src_width * scale)
    scaled_h = int(src_height * scale)
    # 确保为偶数
    scaled_w = scaled_w - (scaled_w % 2)
    scaled_h = scaled_h - (scaled_h % 2)

    # 构建 scale + pad 滤镜
    # scale: 缩放到合适大小，使用 lanczos 算法
    # pad: 填充到目标分辨率，居中放置
    filter_str = (
        f"scale={scaled_w}:{scaled_h}:flags=lanczos,"
        f"pad={dst_width}:{dst_height}:(ow-iw)/2:(oh-ih)/2:color={background_color},"
        f"setsar=1"
    )

    return filter_str


def build_scale_filter_expr(
    dst_width: int,
    dst_height: int,
    background_color: str = "black",
) -> str:
    """生成通用的 FFmpeg scale+pad 滤镜表达式（使用 FFmpeg 表达式语法）。

    此版本不需要预先知道源图片尺寸，使用 FFmpeg 内置表达式动态计算。

    :param dst_width: 目标宽度
    :param dst_height: 目标高度
    :param background_color: 背景填充颜色
    :return: FFmpeg 滤镜字符串
    """
    # 使用 FFmpeg 表达式语法动态计算缩放
    # 先缩放到目标尺寸内（保持宽高比），再 pad 到目标尺寸
    filter_str = (
        f"scale={dst_width}:{dst_height}:force_original_aspect_ratio=decrease:flags=lanczos,"
        f"pad={dst_width}:{dst_height}:(ow-iw)/2:(oh-ih)/2:color={background_color},"
        f"setsar=1"
    )

    return filter_str


if __name__ == "__main__":
    import json
    import sys

    if len(sys.argv) < 2:
        print("用法: python image_utils.py <图片目录或文件路径>", file=sys.stderr)
        sys.exit(1)

    source = sys.argv[1]
    output_json = "--json" in sys.argv

    try:
        results = collect_images(source)
    except (FileNotFoundError, ValueError) as exc:
        print(f"错误: {exc}", file=sys.stderr)
        sys.exit(1)

    if output_json:
        print(json.dumps(results, ensure_ascii=False, indent=2))
    else:
        max_name = max(len(r["filename"]) for r in results)
        max_name = max(max_name, 8)

        print(f"{'文件名':<{max_name}}  {'尺寸':>12}  {'朝向'}")
        print(f"{'-' * max_name}  {'-' * 12}  {'-' * 10}")
        for r in results:
            size_str = f"{r['width']}x{r['height']}"
            if r["orientation"] == "landscape":
                orientation_display = "横图(landscape)"
            elif r["orientation"] == "portrait":
                orientation_display = "竖图(portrait)"
            else:
                orientation_display = "未知(unknown)"
            print(f"{r['filename']:<{max_name}}  {size_str:>12}  {orientation_display}")

        landscape_count = sum(1 for r in results if r["orientation"] == "landscape")
        portrait_count = sum(1 for r in results if r["orientation"] == "portrait")
        print(f"\n共 {len(results)} 张图片: {landscape_count} 张横图, {portrait_count} 张竖图")
