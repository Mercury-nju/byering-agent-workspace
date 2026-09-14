# -*- coding: utf-8 -*-
"""FFmpeg 命令构建与执行工具模块。

提供 FFmpeg 环境检测、命令执行封装、媒体文件时长获取等功能。
通过 subprocess 调用 FFmpeg 命令行，不依赖任何需要商业许可的第三方库。
"""

import json
import re
import subprocess
import sys
from pathlib import Path
from typing import Optional

from loguru import logger

# FFmpeg 最低版本要求
MIN_FFMPEG_VERSION = "4.0"

# FFmpeg 安装指引
FFMPEG_INSTALL_GUIDE = """
FFmpeg 未安装或不在系统 PATH 中。请按以下方式安装：

  Windows:
    1. 访问 https://www.gyan.dev/ffmpeg/builds/ 下载 release full 版本
    2. 解压到任意目录（如 C:\\ffmpeg）
    3. 将 C:\\ffmpeg\\bin 添加到系统 PATH 环境变量
    或使用 scoop: scoop install ffmpeg
    或使用 choco: choco install ffmpeg

  macOS:
    brew install ffmpeg

  Linux (Ubuntu/Debian):
    sudo apt update && sudo apt install ffmpeg

  Linux (CentOS/RHEL):
    sudo yum install ffmpeg

安装完成后，请确保在终端中执行 `ffmpeg -version` 能正常输出版本信息。
""".strip()


def _parse_version(version_str: str) -> tuple:
    """解析版本号字符串为可比较的元组。

    :param version_str: 版本号字符串，如 "5.1.2"
    :return: 版本号元组，如 (5, 1, 2)
    """
    parts = []
    for part in version_str.split("."):
        # 只取数字部分，忽略后缀（如 "5.1.2-static"）
        match = re.match(r"(\d+)", part)
        if match:
            parts.append(int(match.group(1)))
    return tuple(parts)


def check_ffmpeg() -> dict:
    """检测 FFmpeg 是否已安装且可用。

    检测 ffmpeg 和 ffprobe 两个命令是否在 PATH 中可用，
    解析版本号并检查是否满足最低版本要求。

    :return: 包含检测结果的字典，格式如下：
        {
            "available": True/False,
            "ffmpeg_path": "ffmpeg 可执行文件路径",
            "ffprobe_path": "ffprobe 可执行文件路径",
            "version": "版本号字符串",
            "version_ok": True/False,
            "error": "错误信息（仅在 available=False 时存在）"
        }
    """
    result = {
        "available": False,
        "ffmpeg_path": None,
        "ffprobe_path": None,
        "version": None,
        "version_ok": False,
    }

    # 检测 ffmpeg
    try:
        proc = subprocess.run(
            ["ffmpeg", "-version"],
            capture_output=True,
            text=True,
            timeout=10,
        )
        if proc.returncode != 0:
            result["error"] = f"ffmpeg 命令执行失败（退出码 {proc.returncode}）"
            logger.error("ffmpeg command failed with return code {}", proc.returncode)
            return result

        # 解析版本号：第一行格式通常为 "ffmpeg version N.N.N ..."
        first_line = proc.stdout.split("\n")[0]
        version_match = re.search(r"version\s+(\S+)", first_line)
        if version_match:
            result["version"] = version_match.group(1)
        else:
            result["version"] = "unknown"

        result["ffmpeg_path"] = "ffmpeg"

    except FileNotFoundError:
        result["error"] = "ffmpeg 未安装或不在系统 PATH 中"
        logger.error("ffmpeg not found in PATH")
        return result
    except subprocess.TimeoutExpired:
        result["error"] = "ffmpeg 命令执行超时"
        logger.error("ffmpeg version check timed out")
        return result

    # 检测 ffprobe
    try:
        proc = subprocess.run(
            ["ffprobe", "-version"],
            capture_output=True,
            text=True,
            timeout=10,
        )
        if proc.returncode == 0:
            result["ffprobe_path"] = "ffprobe"
    except (FileNotFoundError, subprocess.TimeoutExpired):
        logger.warning("ffprobe not found, some features may be limited")

    # 检查版本是否满足最低要求
    if result["version"] and result["version"] != "unknown":
        try:
            current = _parse_version(result["version"])
            minimum = _parse_version(MIN_FFMPEG_VERSION)
            result["version_ok"] = current >= minimum
            if not result["version_ok"]:
                logger.warning(
                    "FFmpeg version {} is below minimum required version {}",
                    result["version"],
                    MIN_FFMPEG_VERSION,
                )
        except (ValueError, IndexError):
            # 版本号解析失败，假设可用
            result["version_ok"] = True
            logger.warning("Could not parse FFmpeg version: {}", result["version"])

    result["available"] = True
    logger.info("FFmpeg detected: version={}, path={}", result["version"], result["ffmpeg_path"])

    return result


def ensure_ffmpeg() -> None:
    """确保 FFmpeg 可用，不可用时抛出异常。

    :raises RuntimeError: FFmpeg 不可用或版本过低
    """
    info = check_ffmpeg()

    if not info["available"]:
        error_msg = info.get("error", "FFmpeg 不可用")
        raise RuntimeError(f"{error_msg}\n\n{FFMPEG_INSTALL_GUIDE}")

    if not info["version_ok"]:
        raise RuntimeError(
            f"FFmpeg 版本过低（当前: {info['version']}，最低要求: {MIN_FFMPEG_VERSION}）。"
            f"请升级 FFmpeg 到 {MIN_FFMPEG_VERSION} 或更高版本。\n\n{FFMPEG_INSTALL_GUIDE}"
        )


def run_ffmpeg(
    args: list,
    timeout: Optional[int] = None,
    cwd: Optional[str] = None,
) -> subprocess.CompletedProcess:
    """执行 FFmpeg 命令。

    封装 subprocess.run，提供日志输出、错误捕获和超时控制。

    :param args: FFmpeg 命令参数列表（不含 "ffmpeg" 本身）
    :param timeout: 超时时间（秒），None 表示不限制
    :param cwd: 工作目录
    :return: subprocess.CompletedProcess 对象
    :raises RuntimeError: FFmpeg 命令执行失败
    :raises subprocess.TimeoutExpired: 命令执行超时
    """
    cmd = ["ffmpeg"] + args
    cmd_str = " ".join(cmd)
    logger.info("Running FFmpeg command: {}", cmd_str)

    try:
        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout,
            cwd=cwd,
        )

        if proc.returncode != 0:
            # FFmpeg 的错误信息通常在 stderr 中
            error_output = proc.stderr[-2000:] if len(proc.stderr) > 2000 else proc.stderr
            logger.error("FFmpeg command failed (exit code {}): {}", proc.returncode, error_output)
            raise RuntimeError(
                f"FFmpeg 命令执行失败（退出码 {proc.returncode}）:\n{error_output}"
            )

        logger.info("FFmpeg command completed successfully")
        return proc

    except subprocess.TimeoutExpired:
        logger.error("FFmpeg command timed out after {} seconds", timeout)
        raise
    except FileNotFoundError:
        raise RuntimeError(f"FFmpeg 未找到，请确保已安装并添加到 PATH。\n\n{FFMPEG_INSTALL_GUIDE}")


def get_media_duration(filepath: str) -> float:
    """通过 ffprobe 获取音视频文件的时长。

    :param filepath: 媒体文件路径
    :return: 时长（秒）
    :raises RuntimeError: ffprobe 不可用或无法获取时长
    :raises FileNotFoundError: 文件不存在
    """
    filepath = str(Path(filepath).resolve())

    if not Path(filepath).exists():
        raise FileNotFoundError(f"媒体文件不存在: {filepath}")

    try:
        proc = subprocess.run(
            [
                "ffprobe",
                "-v", "quiet",
                "-print_format", "json",
                "-show_format",
                filepath,
            ],
            capture_output=True,
            text=True,
            timeout=30,
        )

        if proc.returncode != 0:
            raise RuntimeError(f"ffprobe 执行失败: {proc.stderr}")

        data = json.loads(proc.stdout)
        duration = float(data["format"]["duration"])
        logger.info("Media duration for {}: {:.2f}s", filepath, duration)
        return duration

    except FileNotFoundError:
        raise RuntimeError(
            "ffprobe 未找到。ffprobe 通常随 FFmpeg 一起安装，"
            "请确保 FFmpeg 已正确安装。"
        )
    except (KeyError, json.JSONDecodeError) as exc:
        raise RuntimeError(f"无法解析 ffprobe 输出: {exc}")


def get_file_info(filepath: str) -> dict:
    """获取媒体文件的基本信息（大小、时长）。

    :param filepath: 媒体文件路径
    :return: 包含文件信息的字典
    """
    path = Path(filepath)
    info = {
        "path": str(path.resolve()),
        "filename": path.name,
        "size_bytes": 0,
        "size_human": "0 B",
        "duration": 0.0,
        "duration_human": "0:00",
    }

    if path.exists():
        size = path.stat().st_size
        info["size_bytes"] = size
        info["size_human"] = _format_file_size(size)

        try:
            duration = get_media_duration(str(path))
            info["duration"] = duration
            info["duration_human"] = _format_duration(duration)
        except (RuntimeError, FileNotFoundError):
            logger.warning("Could not get duration for {}", filepath)

    return info


def _format_file_size(size_bytes: int) -> str:
    """将字节数格式化为人类可读的文件大小。

    :param size_bytes: 文件大小（字节）
    :return: 格式化后的字符串，如 "12.5 MB"
    """
    if size_bytes < 1024:
        return f"{size_bytes} B"
    elif size_bytes < 1024 * 1024:
        return f"{size_bytes / 1024:.1f} KB"
    elif size_bytes < 1024 * 1024 * 1024:
        return f"{size_bytes / (1024 * 1024):.1f} MB"
    else:
        return f"{size_bytes / (1024 * 1024 * 1024):.2f} GB"


def _format_duration(seconds: float) -> str:
    """将秒数格式化为人类可读的时长。

    :param seconds: 时长（秒）
    :return: 格式化后的字符串，如 "1:23" 或 "1:02:03"
    """
    total_seconds = int(seconds)
    hours = total_seconds // 3600
    minutes = (total_seconds % 3600) // 60
    secs = total_seconds % 60

    if hours > 0:
        return f"{hours}:{minutes:02d}:{secs:02d}"
    return f"{minutes}:{secs:02d}"


if __name__ == "__main__":
    # 独立运行时执行环境检测
    info = check_ffmpeg()
    if info["available"]:
        print(f"FFmpeg 可用: 版本 {info['version']}")
        if not info["version_ok"]:
            print(f"警告: 版本低于最低要求 {MIN_FFMPEG_VERSION}")
    else:
        print(f"FFmpeg 不可用: {info.get('error', '未知错误')}")
        print(FFMPEG_INSTALL_GUIDE)
        sys.exit(1)
