# -*- coding: utf-8 -*-
"""音频处理工具模块。

提供音频下载、音频时长处理（截断/循环）、FFmpeg 音频滤镜构建等功能。
"""

import tempfile
import urllib.request
from pathlib import Path
from typing import Optional
from urllib.parse import urlparse

from loguru import logger


def is_url(path: str) -> bool:
    """判断路径是否为 URL。

    :param path: 路径字符串
    :return: 是否为 HTTP/HTTPS URL
    """
    parsed = urlparse(path)
    return parsed.scheme in ("http", "https")


def download_audio(url: str, dest_dir: Optional[str] = None) -> str:
    """从 HTTPS URL 下载音频文件到本地临时目录。

    :param url: 音频文件的 HTTPS URL
    :param dest_dir: 目标目录路径，None 则使用系统临时目录
    :return: 下载后的本地文件路径
    :raises RuntimeError: 下载失败
    :raises ValueError: URL 格式无效
    """
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise ValueError(f"不支持的 URL 协议: {parsed.scheme}（仅支持 HTTP/HTTPS）")

    # 从 URL 中提取文件名
    filename = Path(parsed.path).name
    if not filename:
        filename = "audio_download"

    # 确保文件有扩展名
    if not Path(filename).suffix:
        filename += ".mp3"

    # 确定目标目录
    if dest_dir is None:
        dest_dir = tempfile.mkdtemp(prefix="slideshow_audio_")
    else:
        Path(dest_dir).mkdir(parents=True, exist_ok=True)

    dest_path = str(Path(dest_dir) / filename)

    logger.info("Downloading audio from {} to {}", url, dest_path)

    try:
        # 设置请求头，模拟浏览器请求
        request = urllib.request.Request(
            url,
            headers={"User-Agent": "Mozilla/5.0 (photo-slideshow)"},
        )
        with urllib.request.urlopen(request, timeout=60) as response:
            with open(dest_path, "wb") as f:
                while True:
                    chunk = response.read(8192)
                    if not chunk:
                        break
                    f.write(chunk)

        file_size = Path(dest_path).stat().st_size
        logger.info("Audio downloaded successfully: {} ({} bytes)", dest_path, file_size)
        return dest_path

    except Exception as exc:
        logger.error("Failed to download audio from {}: {}", url, exc)
        raise RuntimeError(f"音频下载失败: {url}\n原因: {exc}")


def prepare_audio(audio_path: str, dest_dir: Optional[str] = None) -> str:
    """准备音频文件：如果是 URL 则下载，如果是本地文件则验证存在。

    :param audio_path: 音频文件路径或 URL
    :param dest_dir: 下载目标目录（仅 URL 时使用）
    :return: 本地音频文件路径
    :raises FileNotFoundError: 本地文件不存在
    :raises RuntimeError: 下载失败
    """
    if is_url(audio_path):
        return download_audio(audio_path, dest_dir)

    # 本地文件
    path = Path(audio_path)
    if not path.exists():
        raise FileNotFoundError(f"音频文件不存在: {audio_path}")
    if not path.is_file():
        raise FileNotFoundError(f"路径不是文件: {audio_path}")

    logger.info("Using local audio file: {}", audio_path)
    return str(path.resolve())


def build_audio_filter(
    video_duration: float,
    audio_duration: float,
    volume: float = 0.5,
    fadeout_duration: float = 2.0,
) -> str:
    """生成 FFmpeg 音频滤镜字符串。

    根据视频和音频时长关系，自动处理截断或循环，
    并在结尾添加淡出效果，支持音量调节。

    :param video_duration: 视频总时长（秒）
    :param audio_duration: 音频原始时长（秒）
    :param volume: 音量（0.0~1.0），默认 0.5
    :param fadeout_duration: 结尾淡出时长（秒），默认 2.0
    :return: FFmpeg 音频滤镜字符串
    """
    filters = []

    # 音量调节
    if volume != 1.0:
        filters.append(f"volume={volume}")

    # 音频时长处理
    if audio_duration > video_duration:
        # 音频比视频长：截断到视频时长
        # atrim 在 filtergraph 中截断音频
        filters.append(f"atrim=0:{video_duration}")
        filters.append("asetpts=PTS-STARTPTS")
    # 音频比视频短的情况在 FFmpeg 命令中通过 -stream_loop 处理

    # 结尾淡出效果
    fadeout_start = max(0, video_duration - fadeout_duration)
    filters.append(f"afade=t=out:st={fadeout_start}:d={fadeout_duration}")

    return ",".join(filters)


def build_audio_args(
    audio_path: str,
    video_duration: float,
    audio_duration: float,
    volume: float = 0.5,
    fadeout_duration: float = 2.0,
) -> list:
    """构建 FFmpeg 音频相关的命令行参数。

    :param audio_path: 音频文件路径
    :param video_duration: 视频总时长（秒）
    :param audio_duration: 音频原始时长（秒）
    :param volume: 音量（0.0~1.0）
    :param fadeout_duration: 结尾淡出时长（秒）
    :return: FFmpeg 命令行参数列表
    """
    args = []

    # 如果音频比视频短，需要循环播放
    if audio_duration < video_duration:
        # 计算需要循环的次数（向上取整）
        loop_count = int(video_duration / audio_duration) + 1
        args.extend(["-stream_loop", str(loop_count)])

    # 添加音频输入
    args.extend(["-i", audio_path])

    # 构建音频滤镜
    audio_filter = build_audio_filter(
        video_duration=video_duration,
        audio_duration=audio_duration,
        volume=volume,
        fadeout_duration=fadeout_duration,
    )

    return args, audio_filter


if __name__ == "__main__":
    import sys

    if len(sys.argv) < 2:
        print("用法: python audio_utils.py <音频文件路径或URL>", file=sys.stderr)
        sys.exit(1)

    audio_source = sys.argv[1]
    try:
        local_path = prepare_audio(audio_source)
        print(f"音频文件已准备: {local_path}")
    except (FileNotFoundError, RuntimeError, ValueError) as exc:
        print(f"错误: {exc}", file=sys.stderr)
        sys.exit(1)
