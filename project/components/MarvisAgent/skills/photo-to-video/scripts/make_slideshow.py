#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""照片幻灯片视频生成主入口脚本。

将多张图片合成为一个带背景音乐和简单动效的 MP4 幻灯片视频。
通过 FFmpeg 命令行实现，无需 Node.js 运行时，无商业许可风险。

用法：
    python make_slideshow.py --images <图片目录或文件列表> --output <输出路径>
    python make_slideshow.py --config <JSON配置文件>

示例：
    # 基本用法：将目录下的图片生成视频
    python make_slideshow.py --images ./photos --output output.mp4

    # 指定模板和背景音乐
    python make_slideshow.py --images ./photos --output output.mp4 --template vlog --music bgm.mp3

    # 自定义参数
    python make_slideshow.py --images ./photos --output output.mp4 --duration 4 --fps 30 --resolution 1080x1920

    # 使用 JSON 配置文件
    python make_slideshow.py --config config.json
"""

import argparse
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

from loguru import logger

# 将 scripts 目录添加到 Python 路径，以便导入同级模块
_SCRIPT_DIR = Path(__file__).parent
if str(_SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPT_DIR))

from audio_utils import build_audio_args, prepare_audio
from ffmpeg_utils import ensure_ffmpeg, get_file_info, get_media_duration, run_ffmpeg
from image_utils import collect_images, collect_images_from_list
from slideshow_filters import build_slideshow_filter_graph, calculate_total_duration
from template_utils import load_template, merge_config_with_args


def parse_args() -> argparse.Namespace:
    """解析命令行参数。

    :return: 解析后的参数命名空间
    """
    parser = argparse.ArgumentParser(
        description="照片幻灯片视频生成工具 — 将多张图片合成为带背景音乐和动效的 MP4 视频",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例:
  %(prog)s --images ./photos --output slideshow.mp4
  %(prog)s --images ./photos --output slideshow.mp4 --template vlog --music bgm.mp3
  %(prog)s --images img1.jpg img2.jpg img3.jpg --output slideshow.mp4
  %(prog)s --config config.json
        """,
    )

    parser.add_argument(
        "--images",
        nargs="+",
        help="图片文件路径列表或包含图片的目录路径（必选，除非使用 --config）",
    )
    parser.add_argument(
        "--output",
        help="输出视频文件路径（必选，除非使用 --config）",
    )
    parser.add_argument(
        "--music",
        help="背景音乐文件路径或 HTTPS URL（可选）",
    )
    parser.add_argument(
        "--template",
        default="classic",
        help="模板名称（默认: classic，可选: vlog）",
    )
    parser.add_argument(
        "--duration",
        type=float,
        help="每张图片显示时长，单位秒（可选，默认由模板决定）",
    )
    parser.add_argument(
        "--resolution",
        help="输出分辨率，如 1920x1080 或 1080x1920（可选，默认由模板决定）",
    )
    parser.add_argument(
        "--fps",
        type=int,
        help="帧率（可选，默认由模板决定）",
    )
    parser.add_argument(
        "--quality",
        type=int,
        help="视频质量 CRF 值，范围 18~28（可选，默认 23）",
    )
    parser.add_argument(
        "--volume",
        type=float,
        default=0.5,
        help="背景音乐音量 0.0~1.0（默认: 0.5）",
    )
    parser.add_argument(
        "--config",
        help="JSON 配置文件路径（可替代命令行参数）",
    )

    args = parser.parse_args()

    # 如果使用 --config 模式，从 JSON 文件加载参数
    if args.config:
        args = _load_config_file(args.config, parser)

    # 参数校验
    if not args.images:
        parser.error("必须指定 --images 参数（图片路径）或使用 --config 配置文件")
    if not args.output:
        parser.error("必须指定 --output 参数（输出视频路径）或使用 --config 配置文件")

    # 校验 quality 范围
    if args.quality is not None and not (18 <= args.quality <= 28):
        parser.error(f"--quality 值必须在 18~28 范围内，当前值: {args.quality}")

    # 校验 volume 范围
    if not (0.0 <= args.volume <= 1.0):
        parser.error(f"--volume 值必须在 0.0~1.0 范围内，当前值: {args.volume}")

    # 校验 fps 范围
    if args.fps is not None and args.fps not in (24, 25, 30, 60):
        parser.error(f"--fps 值必须为 24/25/30/60 之一，当前值: {args.fps}")

    return args


def _load_config_file(config_path: str, parser: argparse.ArgumentParser) -> argparse.Namespace:
    """从 JSON 配置文件加载参数。

    :param config_path: JSON 配置文件路径
    :param parser: argparse 解析器（用于错误提示）
    :return: 解析后的参数命名空间
    """
    config_file = Path(config_path)
    if not config_file.exists():
        parser.error(f"配置文件不存在: {config_path}")

    try:
        with open(config_file, "r", encoding="utf-8") as f:
            config = json.load(f)
    except json.JSONDecodeError as exc:
        parser.error(f"配置文件 JSON 格式无效: {exc}")

    # 将 JSON 配置映射到 argparse 命名空间
    args = argparse.Namespace(
        images=config.get("images"),
        output=config.get("output"),
        music=config.get("music"),
        template=config.get("template", "classic"),
        duration=config.get("duration"),
        resolution=config.get("resolution"),
        fps=config.get("fps"),
        quality=config.get("quality"),
        volume=config.get("volume", 0.5),
        config=config_path,
    )

    # images 可以是字符串（目录路径）或列表（文件路径列表）
    if isinstance(args.images, str):
        args.images = [args.images]

    return args


def main() -> None:
    """主流程函数。

    串联完整的幻灯片生成流水线：
    1. FFmpeg 环境检测
    2. 加载模板配置
    3. 收集并预处理图片
    4. 构建视频滤镜图
    5. 处理背景音乐
    6. 调用 FFmpeg 生成视频
    7. 输出文件信息
    """
    args = parse_args()

    logger.info("=== Photo Slideshow Generator ===")

    # 1. FFmpeg 环境检测
    logger.info("Step 1: Checking FFmpeg environment...")
    try:
        ensure_ffmpeg()
    except RuntimeError as exc:
        logger.error("FFmpeg check failed: {}", exc)
        print(f"\n错误: {exc}", file=sys.stderr)
        sys.exit(1)

    # 2. 加载模板配置
    logger.info("Step 2: Loading template '{}'...", args.template)
    try:
        template_config = load_template(args.template)
    except (FileNotFoundError, ValueError) as exc:
        logger.error("Template loading failed: {}", exc)
        print(f"\n错误: {exc}", file=sys.stderr)
        sys.exit(1)

    # 合并命令行参数到模板配置
    config = merge_config_with_args(
        template_config,
        duration=args.duration,
        fps=args.fps,
        resolution=args.resolution,
        quality=args.quality,
    )

    width = config["resolution"]["width"]
    height = config["resolution"]["height"]
    fps = config["fps"]
    duration_per_image = config["duration_per_image"]
    quality = config.get("quality", 23)
    effects = config["effects"]
    transition = config["transition"]
    background_color = config.get("background_color", "black")

    logger.info(
        "Config: {}x{} @ {}fps, {:.1f}s/image, CRF={}, template={}",
        width, height, fps, duration_per_image, quality, config["name"],
    )

    # 3. 收集并预处理图片
    logger.info("Step 3: Collecting images...")
    try:
        # 判断是目录还是文件列表
        if len(args.images) == 1 and Path(args.images[0]).is_dir():
            images = collect_images(args.images[0])
        else:
            images = collect_images_from_list(args.images)
    except (FileNotFoundError, ValueError) as exc:
        logger.error("Image collection failed: {}", exc)
        print(f"\n错误: {exc}", file=sys.stderr)
        sys.exit(1)

    image_count = len(images)
    logger.info("Collected {} images", image_count)

    # 4. 构建视频滤镜图
    logger.info("Step 4: Building filter graph...")
    transition_duration = transition.get("duration", 0.5)

    try:
        filtergraph, output_label = build_slideshow_filter_graph(
            image_count=image_count,
            duration_per_image=duration_per_image,
            fps=fps,
            width=width,
            height=height,
            effects=effects,
            transition=transition,
            background_color=background_color,
        )
    except ValueError as exc:
        logger.error("Filter graph build failed: {}", exc)
        print(f"\n错误: {exc}", file=sys.stderr)
        sys.exit(1)

    # 计算视频总时长
    video_duration = calculate_total_duration(image_count, duration_per_image, transition_duration)
    logger.info("Video duration: {:.2f}s ({} images x {:.1f}s - {:.1f}s transitions)",
                video_duration, image_count, duration_per_image,
                transition_duration * (image_count - 1) if image_count > 1 else 0)

    # 5. 处理背景音乐
    audio_path = None
    audio_args = []
    audio_filter = None
    temp_audio_dir = None

    # 如果用户未指定 --music，尝试使用模板中的 default_music
    music_source = args.music
    if not music_source:
        music_source = config.get("default_music")
        if music_source:
            logger.info("Using default music from template: {}", music_source)

    if music_source:
        logger.info("Step 5: Preparing background music...")
        try:
            temp_audio_dir = tempfile.mkdtemp(prefix="slideshow_")
            audio_path = prepare_audio(music_source, dest_dir=temp_audio_dir)
            audio_duration = get_media_duration(audio_path)
            logger.info("Audio duration: {:.2f}s", audio_duration)

            audio_args, audio_filter = build_audio_args(
                audio_path=audio_path,
                video_duration=video_duration,
                audio_duration=audio_duration,
                volume=args.volume,
            )
        except (FileNotFoundError, RuntimeError, ValueError) as exc:
            logger.warning("Audio preparation failed, continuing without music: {}", exc)
            print(f"\n警告: 背景音乐处理失败，将生成无音频视频: {exc}", file=sys.stderr)
            audio_path = None
            audio_args = []
            audio_filter = None
    else:
        logger.info("Step 5: No background music specified, skipping...")

    # 6. 构建并执行 FFmpeg 命令
    logger.info("Step 6: Generating video with FFmpeg...")

    # 确保输出目录存在
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    # 构建 FFmpeg 命令
    ffmpeg_args = ["-y"]  # 覆盖已有文件

    # 添加图片输入
    for img in images:
        ffmpeg_args.extend([
            "-loop", "1",
            "-t", str(duration_per_image),
            "-i", img["filepath"],
        ])

    # 添加音频输入（如果有）
    if audio_path and audio_args:
        ffmpeg_args.extend(audio_args)

    # 添加 filtergraph
    if audio_path and audio_filter:
        # 有音频时，将音频滤镜也加入 filtergraph
        audio_input_index = image_count  # 音频输入的索引
        full_filtergraph = (
            f"{filtergraph};\n"
            f"[{audio_input_index}:a]{audio_filter}[outa]"
        )
        ffmpeg_args.extend(["-filter_complex", full_filtergraph])
        ffmpeg_args.extend(["-map", output_label, "-map", "[outa]"])
    else:
        ffmpeg_args.extend(["-filter_complex", filtergraph])
        ffmpeg_args.extend(["-map", output_label])

    # 输出参数
    ffmpeg_args.extend([
        "-c:v", "libx264",
        "-preset", "medium",
        "-crf", str(quality),
        "-pix_fmt", "yuv420p",
        "-movflags", "+faststart",
        "-t", str(video_duration),
    ])

    if audio_path:
        ffmpeg_args.extend(["-c:a", "aac", "-b:a", "192k"])
    else:
        ffmpeg_args.extend(["-an"])

    ffmpeg_args.append(str(output_path))

    try:
        run_ffmpeg(ffmpeg_args, timeout=600)
    except (RuntimeError, subprocess.TimeoutExpired) as exc:
        logger.error("Video generation failed: {}", exc)
        print(f"\n错误: 视频生成失败: {exc}", file=sys.stderr)
        sys.exit(1)

    # 7. 输出文件信息
    logger.info("Step 7: Video generation complete!")
    file_info = get_file_info(str(output_path))

    print(f"\n✅ 视频生成成功!")
    print(f"   文件: {file_info['path']}")
    print(f"   大小: {file_info['size_human']}")
    print(f"   时长: {file_info['duration_human']}")
    print(f"   分辨率: {width}x{height}")
    print(f"   帧率: {fps} fps")
    print(f"   图片数: {image_count}")
    if music_source:
        print(f"   背景音乐: {'有' if audio_path else '无（处理失败）'}")

    # 清理临时文件
    if temp_audio_dir:
        try:
            import shutil
            shutil.rmtree(temp_audio_dir, ignore_errors=True)
            logger.info("Cleaned up temp directory: {}", temp_audio_dir)
        except OSError:
            pass


if __name__ == "__main__":
    main()
