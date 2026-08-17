# -*- coding: utf-8 -*-
"""模板配置加载与校验工具模块。

提供模板 JSON 文件的加载、校验和默认值填充功能。
"""

import json
from pathlib import Path
from typing import Optional

from loguru import logger

# 模板目录路径（相对于本文件）
TEMPLATES_DIR = Path(__file__).parent.parent / "assets" / "templates"

# 模板必需字段
REQUIRED_FIELDS = {"name", "duration_per_image", "fps", "resolution", "effects", "transition"}

# 模板默认值
DEFAULT_TEMPLATE_VALUES = {
    "display_name": "",
    "description": "",
    "duration_per_image": 3,
    "fps": 30,
    "resolution": {"width": 1920, "height": 1080},
    "effects": [{"type": "kenburns", "zoom_start": 1.0, "zoom_end": 1.2, "pan_direction": "random"}],
    "transition": {"type": "fade", "duration": 0.5},
    "background_color": "black",
    "default_music": "",
}

# 支持的动效类型
SUPPORTED_EFFECTS = {"kenburns", "none"}

# 支持的转场类型
SUPPORTED_TRANSITIONS = {"fade", "xfade", "none"}


def list_templates() -> list:
    """列出所有可用的模板。

    :return: 模板名称列表
    """
    if not TEMPLATES_DIR.exists():
        logger.warning("Templates directory not found: {}", TEMPLATES_DIR)
        return []

    templates = []
    for json_file in sorted(TEMPLATES_DIR.glob("*.json")):
        templates.append(json_file.stem)

    logger.info("Found {} templates: {}", len(templates), templates)
    return templates


def load_template(name: str) -> dict:
    """加载并校验模板配置。

    :param name: 模板名称（不含 .json 后缀）或模板 JSON 文件的完整路径
    :return: 校验后的模板配置字典
    :raises FileNotFoundError: 模板文件不存在
    :raises ValueError: 模板配置格式无效
    """
    # 判断是模板名称还是文件路径
    template_path = Path(name)
    if not template_path.exists():
        # 尝试从模板目录查找
        template_path = TEMPLATES_DIR / f"{name}.json"

    if not template_path.exists():
        available = list_templates()
        raise FileNotFoundError(
            f"模板 '{name}' 不存在。"
            f"可用模板: {', '.join(available) if available else '无'}"
        )

    logger.info("Loading template from: {}", template_path)

    with open(template_path, "r", encoding="utf-8") as f:
        try:
            config = json.load(f)
        except json.JSONDecodeError as exc:
            raise ValueError(f"模板文件 JSON 格式无效: {template_path}\n{exc}")

    # 校验并填充默认值
    config = _validate_and_fill_defaults(config, str(template_path))

    logger.info("Template loaded: {} ({})", config["name"], config.get("display_name", ""))
    return config


def _validate_and_fill_defaults(config: dict, source: str) -> dict:
    """校验模板配置并填充缺失的默认值。

    :param config: 原始模板配置字典
    :param source: 配置来源（用于错误提示）
    :return: 校验并填充默认值后的配置字典
    :raises ValueError: 配置格式无效
    """
    # 检查必需字段
    missing = REQUIRED_FIELDS - set(config.keys())
    if missing:
        raise ValueError(f"模板配置缺少必需字段: {', '.join(missing)}（来源: {source}）")

    # 填充可选字段的默认值
    for key, default_value in DEFAULT_TEMPLATE_VALUES.items():
        if key not in config:
            config[key] = default_value

    # 校验 resolution
    resolution = config["resolution"]
    if not isinstance(resolution, dict) or "width" not in resolution or "height" not in resolution:
        raise ValueError(f"模板 resolution 格式无效，需要包含 width 和 height 字段（来源: {source}）")

    width = resolution["width"]
    height = resolution["height"]
    if not isinstance(width, int) or not isinstance(height, int):
        raise ValueError(f"模板 resolution 的 width 和 height 必须为整数（来源: {source}）")
    if width <= 0 or height <= 0:
        raise ValueError(f"模板 resolution 的 width 和 height 必须为正整数（来源: {source}）")
    # 确保为偶数（FFmpeg 要求）
    if width % 2 != 0 or height % 2 != 0:
        config["resolution"]["width"] = width + (width % 2)
        config["resolution"]["height"] = height + (height % 2)
        logger.warning("Resolution adjusted to even numbers: {}x{}", config["resolution"]["width"],
                        config["resolution"]["height"])

    # 校验 fps
    fps = config["fps"]
    if not isinstance(fps, (int, float)) or fps <= 0:
        raise ValueError(f"模板 fps 必须为正数（来源: {source}）")

    # 校验 duration_per_image
    duration = config["duration_per_image"]
    if not isinstance(duration, (int, float)) or duration <= 0:
        raise ValueError(f"模板 duration_per_image 必须为正数（来源: {source}）")

    # 校验 effects
    effects = config["effects"]
    if not isinstance(effects, list):
        raise ValueError(f"模板 effects 必须为列表（来源: {source}）")
    for effect in effects:
        if not isinstance(effect, dict) or "type" not in effect:
            raise ValueError(f"模板 effects 中的每项必须包含 type 字段（来源: {source}）")
        if effect["type"] not in SUPPORTED_EFFECTS:
            logger.warning("Unknown effect type: {} (supported: {})", effect["type"],
                            SUPPORTED_EFFECTS)

    # 校验 transition
    transition = config["transition"]
    if not isinstance(transition, dict) or "type" not in transition:
        raise ValueError(f"模板 transition 必须包含 type 字段（来源: {source}）")
    if "duration" not in transition:
        transition["duration"] = 0.5

    return config


def merge_config_with_args(
    template_config: dict,
    duration: Optional[float] = None,
    fps: Optional[int] = None,
    resolution: Optional[str] = None,
    quality: Optional[int] = None,
) -> dict:
    """将命令行参数合并到模板配置中（命令行参数优先）。

    :param template_config: 模板配置字典
    :param duration: 每张图片显示时长（秒）
    :param fps: 帧率
    :param resolution: 分辨率字符串，如 "1920x1080"
    :param quality: CRF 质量值
    :return: 合并后的配置字典
    """
    config = template_config.copy()

    if duration is not None:
        config["duration_per_image"] = duration

    if fps is not None:
        config["fps"] = fps

    if resolution is not None:
        # 解析分辨率字符串
        parts = resolution.lower().split("x")
        if len(parts) == 2:
            try:
                width = int(parts[0])
                height = int(parts[1])
                config["resolution"] = {"width": width, "height": height}
            except ValueError:
                logger.warning("Invalid resolution format: {}, using template default", resolution)
        else:
            logger.warning("Invalid resolution format: {}, using template default", resolution)

    if quality is not None:
        config["quality"] = quality
    elif "quality" not in config:
        config["quality"] = 23  # 默认 CRF 值

    return config


if __name__ == "__main__":
    import sys

    # 列出所有可用模板
    templates = list_templates()
    print(f"可用模板: {templates}")

    # 加载指定模板
    if len(sys.argv) > 1:
        name = sys.argv[1]
        try:
            config = load_template(name)
            print(json.dumps(config, ensure_ascii=False, indent=2))
        except (FileNotFoundError, ValueError) as exc:
            print(f"错误: {exc}", file=sys.stderr)
            sys.exit(1)
