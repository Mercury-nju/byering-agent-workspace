#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
换背景/换底色工具 — 基于 rembg AI 抠图 + Pillow 合成。
兼容 Windows 和 macOS。

用法:
    python change_bg.py <输入图片路径> --color "#0000FF"         # 十六进制纯色背景
    python change_bg.py <输入图片路径> --image <背景图路径>      # 图片背景
    python change_bg.py <输入图片路径> --color 蓝                # 中文颜色名

示例:
    # 证件照换蓝底
    python change_bg.py C:\\Users\\xxx\\photo.jpg --color "#438EDB"
    # 换图片背景
    python change_bg.py /Users/xxx/person.jpg --image beach.jpg
    # 换红色底（支持中文颜色名）
    python change_bg.py photo.jpg --color 红
    # 质量优先，适合边缘复杂或首次效果不佳时重试
    python change_bg.py photo.jpg --color 红 --quality-mode precise
    # 二次修复纯色背景渗色
    python change_bg.py photo.jpg --color 红 --quality-mode precise --despill
    # 输出 JPEG 格式
    python change_bg.py photo.jpg --color 白 --format jpg

依赖:
    pip install "rembg[cpu]" pillow
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from PIL import Image


_QUALITY_MODEL_MAP = {
    "fast": "u2netp",
    "balanced": "silueta",
    "precise": "isnet-general-use",
}


# 支持的颜色名称（中英文通用）
_COLOR_MAP = {
    # 英文
    "red": (255, 0, 0),
    "green": (0, 255, 0),
    "blue": (0, 0, 255),
    "white": (255, 255, 255),
    "black": (0, 0, 0),
    "gray": (128, 128, 128),
    "grey": (128, 128, 128),
    "yellow": (255, 255, 0),
    "cyan": (0, 255, 255),
    "magenta": (255, 0, 255),
    "purple": (128, 0, 128),
    "orange": (255, 165, 0),
    "pink": (255, 192, 203),
    # 中文
    "红": (255, 0, 0),
    "红色": (255, 0, 0),
    "绿": (0, 255, 0),
    "绿色": (0, 255, 0),
    "蓝": (0, 0, 255),
    "蓝色": (0, 0, 255),
    "白": (255, 255, 255),
    "白色": (255, 255, 255),
    "黑": (0, 0, 0),
    "黑色": (0, 0, 0),
    "灰": (128, 128, 128),
    "灰色": (128, 128, 128),
    "黄": (255, 255, 0),
    "黄色": (255, 255, 0),
    "青": (0, 255, 255),
    "青色": (0, 255, 255),
    "紫": (128, 0, 128),
    "紫色": (128, 0, 128),
    "橙": (255, 165, 0),
    "橙色": (255, 165, 0),
    "粉": (255, 192, 203),
    "粉色": (255, 192, 203),
    # 证件照常见颜色
    "证件照蓝": (67, 142, 219),
    "标准蓝底": (67, 142, 219),
    "证件照红": (255, 0, 0),
    "标准红底": (255, 0, 0),
}


def parse_color(color_str: str) -> tuple[int, int, int]:
    """解析颜色字符串为 RGB 元组。

    支持格式：
        #RRGGBB 十六进制  →  "#438EDB"
        r,g,b    逗号分隔 →  "67,142,219"
        颜色名    中英文   →  "red", "蓝", "证件照蓝"
    """
    color_str = color_str.strip()

    # 先查颜色名表（中英文）
    if color_str in _COLOR_MAP:
        return _COLOR_MAP[color_str]
    if color_str.lower() in _COLOR_MAP:
        return _COLOR_MAP[color_str.lower()]

    # #RRGGBB 十六进制
    if color_str.startswith("#"):
        hex_str = color_str.lstrip("#")
        if len(hex_str) != 6:
            raise ValueError(f"十六进制颜色格式错误（需为6位）: {color_str}")
        return tuple(int(hex_str[i:i+2], 16) for i in (0, 2, 4))

    # r,g,b 逗号分隔
    if "," in color_str:
        parts = color_str.split(",")
        if len(parts) < 3:
            raise ValueError(f"RGB 逗号分隔格式需提供3个值: {color_str}")
        return tuple(int(p.strip()) for p in parts[:3])

    raise ValueError(
        f"无法解析颜色: '{color_str}'。"
        f"支持的格式: #hex（如 #438EDB）、颜色名（如 red/蓝）、RGB逗号（如 67,142,219）"
    )


def change_background(
    input_img: Image.Image,
    background: Image.Image | tuple[int, int, int],
    session,
    alpha_matting: bool = False,
    despill: bool = False,
) -> Image.Image:
    """换背景核心逻辑：先抠图得到前景，再合成到新背景上。"""
    from rembg import remove

    # 第一步：AI抠图
    if alpha_matting:
        foreground = remove(
            input_img,
            session=session,
            alpha_matting=True,
            alpha_matting_foreground_threshold=240,
            alpha_matting_background_threshold=10,
            alpha_matting_erode_size=10,
        )
    else:
        foreground = remove(input_img, session=session)

    if despill and isinstance(background, tuple):
        foreground = reduce_background_spill(foreground, background)

    # 第二步：背景合成
    if isinstance(background, tuple):
        # 纯色背景
        bg = Image.new("RGB", foreground.size, background)
        bg.paste(foreground, (0, 0), foreground)
        return bg
    # 图片背景
    bg = background.convert("RGBA").resize(foreground.size, Image.LANCZOS)
    bg.paste(foreground, (0, 0), foreground)
    return bg


def resolve_model(quality_mode: str, model: str | None) -> str:
    """根据质量档位和显式模型参数解析实际模型。"""
    if model:
        return model
    return _QUALITY_MODEL_MAP[quality_mode]


def should_use_alpha_matting(quality_mode: str, explicit_alpha_matting: bool) -> bool:
    """解析是否启用 alpha matting。

    仅在用户显式传 --alpha-matting 时启用。alpha matting 的 erode 会向内侵蚀主体
    边缘，在证件照黑发等深色低对比边缘上会把发丝整片判为背景抠掉，因此不作为任何
    档位的默认行为。quality_mode 仍作为档位入参保留（与 resolve_model 的档位选择
    保持签名一致），但档位与 alpha matting 之间不再联动。
    """
    del quality_mode
    return explicit_alpha_matting


def reduce_background_spill(foreground: Image.Image, background_color: tuple[int, int, int]) -> Image.Image:
    """减轻纯色背景在半透明前景边缘中的颜色渗透。"""
    image = foreground.convert("RGBA")
    pixels = image.load()
    dominant_channel = max(range(3), key=lambda index: background_color[index])
    width, height = image.size

    for y in range(height):
        for x in range(width):
            r, g, b, alpha = pixels[x, y]
            if alpha < 16 or alpha > 245:
                continue

            channels = [r, g, b]
            dominant_value = channels[dominant_channel]
            other_values = [value for index, value in enumerate(channels) if index != dominant_channel]
            other_max = max(other_values)
            if dominant_value - other_max < 18:
                continue

            neutral = round(sum(other_values) / len(other_values))
            strength = min(1.0, (dominant_value - other_max) / 96) * (1 - alpha / 255)
            channels[dominant_channel] = round(dominant_value * (1 - strength) + neutral * strength)
            pixels[x, y] = (channels[0], channels[1], channels[2], alpha)

    return image


def resolve_safe_output_path(input_path: Path, output_path: Path) -> Path:
    """返回不会覆盖输入文件和已有文件的安全输出路径。"""
    input_resolved = input_path.resolve()
    output_path = output_path.expanduser()
    if not output_path.is_absolute():
        output_path = input_path.parent / output_path

    base_stem = output_path.stem
    suffix = output_path.suffix
    output_resolved = output_path.resolve(strict=False)
    if output_resolved == input_resolved or output_path.exists():
        output_path = output_path.with_name(f"{base_stem}_1{suffix}")
        counter = 2
        while output_path.resolve(strict=False) == input_resolved or output_path.exists():
            output_path = output_path.with_name(f"{base_stem}_{counter}{suffix}")
            counter += 1
    return output_path


def main():
    parser = argparse.ArgumentParser(description="AI抠图 + 背景合成 — 一键换背景/换底色")
    parser.add_argument("input", type=str, help="输入图片路径（支持相对路径和绝对路径）")
    parser.add_argument("--output", "-o", type=str, default=None,
                        help="输出图片路径（默认: 原文件名_newbg.png）")
    parser.add_argument(
        "--color", "-c", type=str, default=None,
        help="纯色背景，支持 #hex / 颜色名（red、蓝、证件照蓝）/ RGB逗号（67,142,219）",
    )
    parser.add_argument("--image", "-i", type=str, default=None,
                        help="背景图片路径")
    parser.add_argument(
        "--quality-mode", choices=("fast", "balanced", "precise"), default="fast",
        help="质量档位：fast/balanced/precise（precise 启用边缘羽化）",
    )
    parser.add_argument(
        "--model", "-m", type=str, default=None,
        help="显式指定抠图模型，会覆盖 --quality-mode 的模型选择",
    )
    parser.add_argument("--alpha-matting", action="store_true",
                        help="启用边缘羽化（发丝等细节更自然）")
    parser.add_argument(
        "--despill", action="store_true",
        help="减轻纯色背景在半透明边缘的渗色；仅在发现染色/溢色时使用，默认关闭",
    )
    parser.add_argument("--format", "-f", type=str, default="png",
                        help="输出格式（默认: png; 可选: jpg, png, webp）")
    args = parser.parse_args()

    # 必须指定 color 或 image
    if not args.color and not args.image:
        print("❌ 请指定背景：--color 纯色 或 --image 图片", file=sys.stderr)
        sys.exit(1)

    # 输入文件检查
    input_path = Path(args.input)
    if not input_path.exists():
        print(f"❌ 文件不存在: {args.input}", file=sys.stderr)
        sys.exit(1)

    # 输出路径
    if args.output:
        output_path = Path(args.output)
    else:
        ext = args.format
        output_path = input_path.parent / f"{input_path.stem}_newbg.{ext}"
    output_path = resolve_safe_output_path(input_path, output_path)

    model_name = resolve_model(args.quality_mode, args.model)
    alpha_matting = should_use_alpha_matting(args.quality_mode, args.alpha_matting)

    from rembg import new_session

    # 加载抠图模型
    print(f"📥 加载模型: {model_name}（首次使用会自动下载）...")
    session = new_session(model_name)

    print(f"🖼️  读取图片: {input_path} ...")
    input_img = Image.open(input_path).convert("RGBA")

    # 解析背景
    if args.color:
        bg_color = parse_color(args.color)
        print(f"🎨 纯色背景: RGB{bg_color}")
        background = bg_color
    else:
        bg_path = Path(args.image)
        if not bg_path.exists():
            print(f"❌ 背景图不存在: {args.image}", file=sys.stderr)
            sys.exit(1)
        print(f"🖼️  背景图片: {bg_path} ...")
        background = Image.open(bg_path).convert("RGBA")

    if alpha_matting:
        print(f"✂️  正在抠图 + 合成（alpha matting 边缘羽化）...")
    else:
        print(f"✂️  正在抠图 + 合成...")
    if args.despill:
        print(f"🧽  已启用边缘去溢色后处理...")

    result = change_background(input_img, background, session, alpha_matting, args.despill)

    # 保存
    output_path.parent.mkdir(parents=True, exist_ok=True)

    save_kwargs = {}
    if args.format.lower() in ("jpg", "jpeg"):
        save_kwargs["quality"] = 95
        result = result.convert("RGB")

    result.save(output_path, **save_kwargs)
    print(f"✅ 换背景完成: {output_path}")
    return output_path


if __name__ == "__main__":
    main()
