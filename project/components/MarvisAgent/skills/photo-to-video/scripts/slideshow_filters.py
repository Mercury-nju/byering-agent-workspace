# -*- coding: utf-8 -*-
"""视频滤镜构建模块。

提供 Ken Burns 效果、淡入淡出、交叉溶解转场等 FFmpeg 滤镜的构建功能，
以及将多张图片的动效和转场组合为完整 filtergraph 的能力。
"""

import random
from typing import Optional

from loguru import logger


def build_kenburns_filter(
    index: int,
    duration: float,
    fps: int,
    width: int,
    height: int,
    zoom_start: float = 1.0,
    zoom_end: float = 1.2,
    pan_direction: str = "random",
) -> str:
    """为单张图片生成 Ken Burns 效果的 zoompan 滤镜。

    Ken Burns 效果通过缓慢的缩放和平移让静态图片产生运动感。

    :param index: 图片索引（用于生成唯一的滤镜标签）
    :param duration: 图片显示时长（秒）
    :param fps: 帧率
    :param width: 输出宽度
    :param height: 输出高度
    :param zoom_start: 起始缩放比例
    :param zoom_end: 结束缩放比例
    :param pan_direction: 平移方向，可选 "random"、"left"、"right"、"up"、"down"、"center"
    :return: FFmpeg zoompan 滤镜字符串
    """
    total_frames = int(duration * fps)

    # 确定平移方向
    if pan_direction == "random":
        directions = ["left_to_right", "right_to_left", "top_to_bottom", "bottom_to_top"]
        direction = directions[index % len(directions)]
    else:
        direction = pan_direction

    # zoompan 滤镜参数
    # z: 缩放因子，从 zoom_start 线性变化到 zoom_end
    # x, y: 平移位置
    zoom_expr = f"if(eq(on,1),{zoom_start},{zoom_start}+({zoom_end}-{zoom_start})*on/{total_frames})"

    # 根据方向计算平移表达式
    if direction == "left_to_right":
        x_expr = f"on/{total_frames}*(iw-iw/zoom)"
        y_expr = "(ih-ih/zoom)/2"
    elif direction == "right_to_left":
        x_expr = f"(1-on/{total_frames})*(iw-iw/zoom)"
        y_expr = "(ih-ih/zoom)/2"
    elif direction == "top_to_bottom":
        x_expr = "(iw-iw/zoom)/2"
        y_expr = f"on/{total_frames}*(ih-ih/zoom)"
    elif direction == "bottom_to_top":
        x_expr = "(iw-iw/zoom)/2"
        y_expr = f"(1-on/{total_frames})*(ih-ih/zoom)"
    else:
        # center: 只缩放不平移
        x_expr = "(iw-iw/zoom)/2"
        y_expr = "(ih-ih/zoom)/2"

    # zoompan 滤镜
    filter_str = (
        f"zoompan=z='{zoom_expr}'"
        f":x='{x_expr}'"
        f":y='{y_expr}'"
        f":d={total_frames}"
        f":s={width}x{height}"
        f":fps={fps}"
    )

    return filter_str


def build_fade_filter(
    duration: float,
    fps: int,
    fade_in_duration: float = 0.3,
    fade_out_duration: float = 0.3,
) -> str:
    """为单张图片生成淡入淡出滤镜。

    :param duration: 图片显示时长（秒）
    :param fps: 帧率
    :param fade_in_duration: 淡入时长（秒）
    :param fade_out_duration: 淡出时长（秒）
    :return: FFmpeg fade 滤镜字符串
    """
    total_frames = int(duration * fps)
    fade_in_frames = int(fade_in_duration * fps)
    fade_out_start = total_frames - int(fade_out_duration * fps)

    parts = []
    if fade_in_duration > 0:
        parts.append(f"fade=t=in:st=0:d={fade_in_duration}")
    if fade_out_duration > 0:
        parts.append(f"fade=t=out:st={duration - fade_out_duration}:d={fade_out_duration}")

    return ",".join(parts)


def build_slideshow_filter_graph(
    image_count: int,
    duration_per_image: float,
    fps: int,
    width: int,
    height: int,
    effects: list,
    transition: dict,
    background_color: str = "black",
) -> tuple:
    """将多张图片的动效和转场组合为完整的 FFmpeg filtergraph。

    此函数生成完整的 FFmpeg complex filtergraph 字符串，
    包括每张图片的缩放、动效和图片之间的转场。

    策略说明：
    - 每张图片先通过 scale+pad 统一到目标分辨率
    - 然后应用 Ken Burns 效果（zoompan）
    - 最后通过 xfade 或 fade 实现图片间的转场

    :param image_count: 图片数量
    :param duration_per_image: 每张图片显示时长（秒）
    :param fps: 帧率
    :param width: 输出宽度
    :param height: 输出高度
    :param effects: 动效配置列表
    :param transition: 转场配置字典
    :param background_color: 背景颜色
    :return: (filtergraph 字符串, 最终输出标签)
    """
    # 将 #RRGGBB 格式转为 FFmpeg 的 0xRRGGBB 格式
    if background_color.startswith("#"):
        background_color = "0x" + background_color[1:]

    if image_count == 0:
        raise ValueError("图片数量不能为 0")

    transition_type = transition.get("type", "fade")
    transition_duration = transition.get("duration", 0.5)

    # 解析动效配置
    use_kenburns = False
    kenburns_config = {}
    for effect in effects:
        if effect.get("type") == "kenburns":
            use_kenburns = True
            kenburns_config = effect

    filter_parts = []

    # 第一阶段：为每张图片生成独立的处理链
    for i in range(image_count):
        input_label = f"[{i}:v]"

        # 缩放 + 填充到目标分辨率
        scale_filter = (
            f"scale={width}:{height}:force_original_aspect_ratio=decrease:flags=lanczos,"
            f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2:color={background_color},"
            f"setsar=1"
        )

        total_frames = int(duration_per_image * fps)

        if use_kenburns:
            # Ken Burns 效果：先缩放到更大尺寸（给 zoompan 留空间），再 zoompan
            # zoompan 需要输入尺寸大于输出尺寸才能实现平移效果
            zoom_end = kenburns_config.get("zoom_end", 1.2)
            # 放大输入图片以给 zoompan 留出空间
            upscale_factor = zoom_end + 0.1
            upscale_w = int(width * upscale_factor)
            upscale_h = int(height * upscale_factor)
            # 确保为偶数
            upscale_w = upscale_w + (upscale_w % 2)
            upscale_h = upscale_h + (upscale_h % 2)

            kenburns_filter = build_kenburns_filter(
                index=i,
                duration=duration_per_image,
                fps=fps,
                width=width,
                height=height,
                zoom_start=kenburns_config.get("zoom_start", 1.0),
                zoom_end=zoom_end,
                pan_direction=kenburns_config.get("pan_direction", "random"),
            )

            # 先缩放到放大尺寸，再应用 zoompan
            # 关键修复：
            # 1) zoompan 之前插入 fps=<fps>,loop 把单帧扩成输入流，保证 zoompan 能拿到足够的输入帧
            # 2) zoompan 之后用 trim=duration + setpts=PTS-STARTPTS 精确截到 duration_per_image 秒
            #    这样 xfade 的 offset 才有稳定的时间线对齐，不会出现只播 1~2 秒就结束的问题
            # 3) 最后统一 fps 和 format，确保所有流的参数一致，xfade 不会因格式不匹配失败
            chain = (
                f"{input_label}"
                f"scale={upscale_w}:{upscale_h}:force_original_aspect_ratio=decrease:flags=lanczos,"
                f"pad={upscale_w}:{upscale_h}:(ow-iw)/2:(oh-ih)/2:color={background_color},"
                f"setsar=1,"
                f"fps={fps},"
                f"loop=loop={total_frames}:size=1:start=0,"
                f"{kenburns_filter},"
                f"trim=duration={duration_per_image},"
                f"setpts=PTS-STARTPTS,"
                f"format=yuv420p"
                f"[v{i}]"
            )
        else:
            # 无 Ken Burns，只做缩放 + 设置时长
            chain = (
                f"{input_label}"
                f"{scale_filter},"
                f"fps={fps},"
                f"loop=loop={total_frames}:size=1:start=0,"
                f"trim=duration={duration_per_image},"
                f"setpts=PTS-STARTPTS,"
                f"format=yuv420p"
                f"[v{i}]"
            )

        filter_parts.append(chain)

    # 第二阶段：图片间的转场
    if image_count == 1:
        # 只有一张图片，添加淡入淡出
        fade_filter = build_fade_filter(duration_per_image, fps)
        if fade_filter:
            filter_parts.append(f"[v0]{fade_filter}[outv]")
            return ";\n".join(filter_parts), "[outv]"
        return ";\n".join(filter_parts), "[v0]"

    # 多张图片：使用 xfade 转场
    if transition_type in ("xfade", "fade"):
        # xfade 转场：逐对连接
        current_label = "v0"
        for i in range(1, image_count):
            next_label = f"v{i}"
            # xfade 的 offset 是前一个视频流中转场开始的时间点
            # 每张图片时长 - 转场时长 * 已经过的图片数
            offset = duration_per_image * i - transition_duration * i
            if offset < 0:
                offset = 0

            if transition_type == "xfade":
                xfade_transition = "dissolve"
            else:
                xfade_transition = "fade"

            out_label = f"xf{i}" if i < image_count - 1 else "outv"
            filter_parts.append(
                f"[{current_label}][{next_label}]"
                f"xfade=transition={xfade_transition}:duration={transition_duration}:offset={offset}"
                f"[{out_label}]"
            )
            current_label = out_label

        return ";\n".join(filter_parts), "[outv]"

    # 无转场：直接拼接
    concat_inputs = "".join(f"[v{i}]" for i in range(image_count))
    filter_parts.append(f"{concat_inputs}concat=n={image_count}:v=1:a=0[outv]")
    return ";\n".join(filter_parts), "[outv]"


def calculate_total_duration(
    image_count: int,
    duration_per_image: float,
    transition_duration: float,
) -> float:
    """计算视频总时长。

    考虑转场重叠时间。

    :param image_count: 图片数量
    :param duration_per_image: 每张图片显示时长（秒）
    :param transition_duration: 转场时长（秒）
    :return: 视频总时长（秒）
    """
    if image_count <= 0:
        return 0.0
    if image_count == 1:
        return duration_per_image

    # 总时长 = 所有图片时长 - 转场重叠时长
    total = duration_per_image * image_count - transition_duration * (image_count - 1)
    return max(total, duration_per_image)
