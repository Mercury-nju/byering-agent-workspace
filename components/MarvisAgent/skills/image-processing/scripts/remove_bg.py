#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
抠图/去背景工具 — 使用 rembg，默认采用轻量 u2netp 模型。
兼容 Windows 和 macOS，使用 Path 自动处理路径分隔符。

用法:
    python remove_bg.py <输入图片路径> [--output <输出路径>] [--model <模型名>] [--alpha-matting]

示例:
    python remove_bg.py C:\\Users\\xxx\\photo.jpg
    python remove_bg.py /Users/xxx/photo.jpg --output cutout.png
    python remove_bg.py photo.jpg --model u2netp        # 轻量快速模式
    python remove_bg.py photo.jpg --alpha-matting        # 边缘羽化

依赖:
    pip install "rembg[cpu]" pillow
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from PIL import Image


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
    from rembg import remove, new_session

    parser = argparse.ArgumentParser(description="AI抠图/去背景 — 输出带透明通道的PNG图片")
    parser.add_argument("input", type=str, help="输入图片路径（支持相对路径和绝对路径）")
    parser.add_argument(
        "--output", "-o", type=str, default=None,
        help="输出图片路径（默认：原文件名_cutout.png，保存到输入文件同目录）",
    )
    parser.add_argument(
        "--model", "-m", type=str, default="u2netp",
        help="抠图模型（默认: u2netp; 可选: isnet-general-use, u2net, silueta, birefnet-general-lite）",
    )
    parser.add_argument("--alpha-matting", action="store_true",
                        help="启用 alpha matting 边缘羽化（发丝等细节更自然，但处理更慢）")
    parser.add_argument("--alpha-fg-threshold", type=int, default=240,
                        help="alpha matting 前景阈值（默认: 240）")
    parser.add_argument("--alpha-bg-threshold", type=int, default=10,
                        help="alpha matting 背景阈值（默认: 10）")
    parser.add_argument("--alpha-erode-size", type=int, default=10,
                        help="alpha matting 腐蚀大小（默认: 10）")
    args = parser.parse_args()

    # 使用 Path 对象，自动兼容 Windows (\) 和 macOS (/)
    input_path = Path(args.input)
    if not input_path.exists():
        print(f"❌ 文件不存在: {args.input}", file=sys.stderr)
        sys.exit(1)

    # 输出路径：未指定时自动生成
    if args.output:
        output_path = Path(args.output)
    else:
        output_path = input_path.parent / f"{input_path.stem}_cutout.png"
    output_path = resolve_safe_output_path(input_path, output_path)

    print(f"📥 加载模型: {args.model}（首次使用会自动下载到本地缓存）...")
    session = new_session(args.model)

    print(f"🖼️  读取图片: {input_path} ...")
    input_img = Image.open(input_path).convert("RGBA")

    if args.alpha_matting:
        print(f"✂️  正在抠图（alpha matting 边缘羽化）...")
        output_img = remove(
            input_img,
            session=session,
            alpha_matting=True,
            alpha_matting_foreground_threshold=args.alpha_fg_threshold,
            alpha_matting_background_threshold=args.alpha_bg_threshold,
            alpha_matting_erode_size=args.alpha_erode_size,
        )
    else:
        print(f"✂️  正在抠图...")
        output_img = remove(input_img, session=session)

    # 确保输出目录存在
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_img.save(output_path)
    print(f"✅ 抠图完成: {output_path}")
    return output_path


if __name__ == "__main__":
    main()
