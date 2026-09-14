#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""图片分辨率调整工具 — 供 AI Agent 通过 python_executor 调用的 resize 脚本。

设计原则:
- 参数极简，AI 容易理解和传参
- 永远不因宽高比不匹配报错，始终返回结果 + 提示
- 自动处理格式后缀与实际格式不符、文件夹批量、损坏文件等边界场景
"""

from __future__ import annotations

import os
import re
import traceback
from pathlib import Path
from typing import Any

from PIL import Image, UnidentifiedImageError

_PHOTO_SIZE_KEYS = {
    "1寸",
    "1英寸",
    "一寸",
    "小1寸",
    "2寸",
    "2英寸",
    "二寸",
    "大2寸",
    "3寸",
    "3英寸",
    "三寸",
    "5寸",
    "5英寸",
    "五寸",
    "6寸",
    "6英寸",
    "六寸",
    "7寸",
    "7英寸",
    "七寸",
    "8寸",
    "8英寸",
    "八寸",
}

# ── 物理尺寸 → 像素映射 (300 DPI) ─────────────────

_PHYSICAL_SIZE_MAP: dict[str, tuple[int, int]] = {
    "1寸": (295, 413),
    "1英寸": (295, 413),
    "一寸": (295, 413),
    "小1寸": (295, 413),
    "2寸": (413, 579),
    "2英寸": (413, 579),
    "二寸": (413, 579),
    "大2寸": (413, 626),
    "3寸": (1050, 744),
    "3英寸": (1050, 744),
    "三寸": (1050, 744),
    "5寸": (1500, 1050),
    "5英寸": (1500, 1050),
    "五寸": (1500, 1050),
    "6寸": (1800, 1200),
    "6英寸": (1800, 1200),
    "六寸": (1800, 1200),
    "7寸": (2100, 1500),
    "7英寸": (2100, 1500),
    "七寸": (2100, 1500),
    "8寸": (2400, 1800),
    "8英寸": (2400, 1800),
    "A4": (2480, 3508),
    "a4": (2480, 3508),
    "A3": (3508, 4961),
    "a3": (3508, 4961),
}

_SUPPORTED_EXTENSIONS: set[str] = {
    ".jpg", ".jpeg", ".png", ".webp", ".bmp",
    ".tiff", ".tif", ".gif", ".ico", ".heic", ".heif",
}

_OUTPUT_FORMATS: dict[str, str] = {
    "jpg": "JPEG",
    "jpeg": "JPEG",
    "png": "PNG",
    "webp": "WEBP",
    "bmp": "BMP",
    "tiff": "TIFF",
    "tif": "TIFF",
}


def resize_image(
    source: str,
    size: str,
    keep_aspect_ratio: bool = True,
    mode: str = "auto",
    output_format: str = "same",
    quality: int = 95,
    output_dir: str = "",
    suffix: str = "",
) -> dict[str, Any]:
    """调整图片分辨率，支持单张图片和文件夹批量处理。

    参数:
        suffix: 输出文件名后缀，插在 stem 与扩展名之间（如 suffix="_5inch" →
                "photo_5inch.jpg"）。为空则不加后缀，仅冲突时自动追加 _1、_2。
    """
    try:
        target_w, target_h = _parse_size(size)
    except ValueError as e:
        return {
            "success": False,
            "total": 0,
            "succeeded": 0,
            "skipped": 0,
            "failed": 0,
            "results": [],
            "summary": f"无法解析尺寸 '{size}'：{e}",
        }

    source_path = Path(source).expanduser().resolve()
    if not source_path.exists():
        return {
            "success": False,
            "total": 0,
            "succeeded": 0,
            "skipped": 0,
            "failed": 0,
            "results": [],
            "summary": f"路径不存在: {source}",
        }

    if source_path.is_dir():
        image_files = sorted([
            f for f in source_path.iterdir()
            if f.is_file() and f.suffix.lower() in _SUPPORTED_EXTENSIONS
        ])
    else:
        image_files = [source_path]

    if output_dir:
        out_dir = Path(output_dir).expanduser().resolve()
    elif source_path.is_dir():
        out_dir = source_path / "resized"
    else:
        out_dir = source_path.parent / "resized"
    out_dir.mkdir(parents=True, exist_ok=True)

    results: list[dict] = []
    total = len(image_files)

    for img_path in image_files:
        try:
            result = _resize_one(
                img_path, out_dir, target_w, target_h,
                keep_aspect_ratio, mode, output_format, quality, suffix, size,
            )
            results.append(result)
        except Exception:
            results.append({
                "input": str(img_path),
                "output": "",
                "original_size": "?",
                "target_size": _format_target_size(target_w, target_h),
                "final_size": "?",
                "status": "error",
                "warning": f"处理异常: {traceback.format_exc()}",
            })

    succeeded = sum(1 for r in results if r["status"] in ("ok", "warning"))
    skipped = sum(1 for r in results if r["status"] == "skipped")
    failed = sum(1 for r in results if r["status"] == "error")

    parts = []
    if succeeded:
        parts.append(f"成功{succeeded}张")
    if skipped:
        parts.append(f"跳过{skipped}张")
    if failed:
        parts.append(f"失败{failed}张")

    return {
        "success": failed == 0,
        "total": total,
        "succeeded": succeeded,
        "skipped": skipped,
        "failed": failed,
        "results": results,
        "summary": f"处理{total}张图片：{'，'.join(parts)}",
    }


def _resize_one(
    img_path: Path,
    out_dir: Path,
    target_w: int,
    target_h: int,
    keep_aspect_ratio: bool,
    mode: str,
    output_format: str,
    quality: int,
    suffix: str = "",
    size_key: str = "",
) -> dict[str, str]:
    """处理单张图片，永不完全崩溃，始终返回结构化结果。"""
    result_base: dict[str, str] = {
        "input": str(img_path),
        "output": "",
        "original_size": "?",
        "target_size": _format_target_size(target_w, target_h),
        "final_size": "?",
        "mode": "?",
        "status": "error",
        "warning": "",
    }

    try:
        img = Image.open(img_path)
    except UnidentifiedImageError:
        result_base["warning"] = "文件无法识别为图片格式"
        result_base["status"] = "skipped"
        return result_base
    except Exception as e:
        result_base["warning"] = f"读取失败: {e}"
        return result_base

    orig_w, orig_h = img.size
    result_base["original_size"] = f"{orig_w}×{orig_h}"

    if _should_match_source_orientation(size_key):
        source_is_portrait = orig_h > orig_w
        target_is_portrait = target_h > target_w
        if source_is_portrait != target_is_portrait:
            target_w, target_h = target_h, target_w
            result_base["target_size"] = _format_target_size(target_w, target_h)

    actual_format = (img.format or "").upper()
    ext_lower = img_path.suffix.lower()

    format_warnings: list[str] = []
    mismatch = _check_format_mismatch(ext_lower, actual_format)
    if mismatch:
        format_warnings.append(mismatch)

    both_specified = target_w > 0 and target_h > 0
    effective_mode = _resolve_mode(mode, keep_aspect_ratio, size_key, both_specified)
    result_base["mode"] = effective_mode

    try:
        was_animated = getattr(img, "is_animated", False)
        if was_animated:
            format_warnings.append("GIF动图只处理了第一帧")
        img_resized, new_w, new_h, transform_warning = _resize_with_mode(
            img, target_w, target_h, effective_mode,
        )
        if transform_warning:
            format_warnings.append(transform_warning)
    except Exception as e:
        result_base["warning"] = f"缩放失败: {e}"
        return result_base

    result_base["final_size"] = f"{new_w}×{new_h}"

    if output_format == "same":
        fmt_key = ext_lower.lstrip(".")
        if fmt_key == "jpeg":
            fmt_key = "jpg"
        save_format = _OUTPUT_FORMATS.get(fmt_key)
        if not save_format:
            save_format = "PNG"
            fmt_key = "png"
            format_warnings.append(f"原格式 {ext_lower} 不直接支持写入，转为 PNG")
    else:
        fmt_key = output_format.lower().lstrip(".")
        save_format = _OUTPUT_FORMATS.get(fmt_key, "PNG")

    # 生成输出文件名：支持自定义后缀（插在 stem 与扩展名之间）
    if suffix:
        out_name = f"{img_path.stem}{suffix}.{fmt_key}"
    else:
        out_name = f"{img_path.stem}.{fmt_key}"

    out_path = out_dir / out_name
    counter = 1
    while out_path.exists():
        if suffix:
            out_name = f"{img_path.stem}{suffix}_{counter}.{fmt_key}"
        else:
            out_name = f"{img_path.stem}_{counter}.{fmt_key}"
        out_path = out_dir / out_name
        counter += 1

    try:
        save_kwargs: dict = {}
        if save_format == "JPEG":
            if img_resized.mode in ("RGBA", "LA", "P"):
                if img_resized.mode == "P":
                    img_resized = img_resized.convert("RGBA")
                bg = Image.new("RGB", img_resized.size, (255, 255, 255))
                bg.paste(img_resized, mask=img_resized.split()[-1] if img_resized.mode == "RGBA" else None)
                img_resized = bg
                format_warnings.append("透明通道已转为白色背景（JPEG格式）")
            save_kwargs["quality"] = quality
        elif save_format == "WEBP":
            save_kwargs["quality"] = quality
        elif save_format == "PNG":
            save_kwargs["optimize"] = True

        img_resized.save(out_path, format=save_format, **save_kwargs)
    except Exception as e:
        result_base["warning"] = f"保存失败: {e}"
        return result_base

    warnings = list(format_warnings)
    both_specified = target_w > 0 and target_h > 0

    if effective_mode == "fit" and both_specified and (new_w != target_w or new_h != target_h):
        if orig_h and target_h:
            orig_ratio = round(orig_w / orig_h, 2)
            target_ratio = round(target_w / target_h, 2)
            if orig_ratio != target_ratio:
                warnings.append(
                    f"原图{orig_w}×{orig_h}等比缩放后为{new_w}×{new_h}，"
                    f"非目标尺寸{target_w}×{target_h}。"
                    "如需成品精确尺寸请设置 --mode fill 或 --mode pad"
                )

    if effective_mode == "stretch" and both_specified:
        if orig_h and target_h:
            orig_ratio = round(orig_w / orig_h, 2)
            target_ratio = round(target_w / target_h, 2)
            if abs(orig_ratio - target_ratio) > 0.01:
                warnings.append(
                    f"图片已被强制拉伸：{orig_w}×{orig_h} → {new_w}×{new_h}，画面可能变形"
                )

    return {
        "input": str(img_path),
        "output": str(out_path.resolve()),
        "original_size": f"{orig_w}×{orig_h}",
        "target_size": _format_target_size(target_w, target_h),
        "final_size": f"{new_w}×{new_h}",
        "mode": effective_mode,
        "status": "warning" if warnings else "ok",
        "warning": "; ".join(warnings) if warnings else "",
    }


def _parse_size(size: str) -> tuple[int, int]:
    """解析尺寸描述字符串 → (width, height)。"""
    s = size.strip()

    key = s.lower().replace(" ", "")
    for name, wh in _PHYSICAL_SIZE_MAP.items():
        if key == name.lower().replace(" ", ""):
            return wh

    m = re.match(r"^宽\s*(\d+)", s)
    if m:
        return (int(m.group(1)), 0)
    m = re.match(r"^高\s*(\d+)", s)
    if m:
        return (0, int(m.group(1)))
    m = re.match(r"^(\d+)\s*宽", s)
    if m:
        return (int(m.group(1)), 0)
    m = re.match(r"^(\d+)\s*高", s)
    if m:
        return (0, int(m.group(1)))

    m = re.match(r"^(\d*)\s*[x×\*X]\s*(\d*)$", s)
    if m:
        width_text = m.group(1)
        height_text = m.group(2)
        if width_text == "0" or height_text == "0":
            raise ValueError("宽度和高度必须大于 0")
        w = int(width_text) if width_text else 0
        h = int(height_text) if height_text else 0
        if w == 0 and h == 0:
            raise ValueError("尺寸不能为 0")
        return (w, h)

    if s.isdigit():
        width = int(s)
        if width <= 0:
            raise ValueError("宽度必须大于 0")
        return (width, 0)

    raise ValueError(
        f"无法识别的尺寸格式: '{size}'. 支持: '800x800', '800', 'x600', '宽800', '高600', '5寸', 'A4'"
    )


def _resolve_mode(mode: str, keep_aspect_ratio: bool, size_key: str, both_specified: bool) -> str:
    """解析最终缩放模式，保持 AI 调用侧参数简单。"""
    normalized_mode = mode.strip().lower()
    if normalized_mode not in {"auto", "fit", "fill", "stretch", "pad"}:
        raise ValueError(f"不支持的缩放模式: {mode}")
    if normalized_mode != "auto":
        return normalized_mode
    if not keep_aspect_ratio:
        return "stretch"
    if both_specified and _is_photo_or_physical_size(size_key):
        return "fill"
    return "fit"


def _is_photo_or_physical_size(size_key: str) -> bool:
    """判断尺寸是否为照片/纸张这类需要精确成品尺寸的规格。"""
    normalized = size_key.strip().lower().replace(" ", "")
    if normalized in {key.lower().replace(" ", "") for key in _PHOTO_SIZE_KEYS}:
        return True
    return normalized in {"a3", "a4"}


def _should_match_source_orientation(size_key: str) -> bool:
    """判断标准照片尺寸是否应跟随原图横竖方向。"""
    normalized = size_key.strip().lower().replace(" ", "")
    return normalized in {key.lower().replace(" ", "") for key in _PHOTO_SIZE_KEYS}


def _resize_with_mode(
    img: Image.Image,
    target_w: int,
    target_h: int,
    mode: str,
) -> tuple[Image.Image, int, int, str]:
    """按指定模式缩放图片，返回图片、最终宽高和提示。"""
    orig_w, orig_h = img.size
    if mode == "stretch":
        new_w = target_w if target_w > 0 else orig_w
        new_h = target_h if target_h > 0 else orig_h
        resized = img.resize((new_w, new_h), Image.LANCZOS)
        return resized, new_w, new_h, ""

    if target_w <= 0 and target_h <= 0:
        return img.copy(), orig_w, orig_h, ""

    if target_w <= 0:
        ratio = target_h / orig_h
        new_w = max(1, round(orig_w * ratio))
        new_h = target_h
        return img.resize((new_w, new_h), Image.LANCZOS), new_w, new_h, ""

    if target_h <= 0:
        ratio = target_w / orig_w
        new_w = target_w
        new_h = max(1, round(orig_h * ratio))
        return img.resize((new_w, new_h), Image.LANCZOS), new_w, new_h, ""

    if mode == "fill":
        ratio = max(target_w / orig_w, target_h / orig_h)
        resized_w = max(1, round(orig_w * ratio))
        resized_h = max(1, round(orig_h * ratio))
        resized = img.resize((resized_w, resized_h), Image.LANCZOS)
        left = max(0, (resized_w - target_w) // 2)
        top = max(0, (resized_h - target_h) // 2)
        filled = resized.crop((left, top, left + target_w, top + target_h))
        warning = "已等比裁剪填满目标尺寸" if resized_w != target_w or resized_h != target_h else ""
        return filled, target_w, target_h, warning

    if mode == "pad":
        ratio = min(target_w / orig_w, target_h / orig_h)
        resized_w = max(1, round(orig_w * ratio))
        resized_h = max(1, round(orig_h * ratio))
        resized = img.resize((resized_w, resized_h), Image.LANCZOS)
        canvas = _new_canvas_for_padding(img, target_w, target_h)
        canvas.paste(resized, ((target_w - resized_w) // 2, (target_h - resized_h) // 2))
        warning = "已等比缩放并补白边到目标尺寸" if resized_w != target_w or resized_h != target_h else ""
        return canvas, target_w, target_h, warning

    ratio = min(target_w / orig_w, target_h / orig_h)
    new_w = max(1, round(orig_w * ratio))
    new_h = max(1, round(orig_h * ratio))
    return img.resize((new_w, new_h), Image.LANCZOS), new_w, new_h, ""


def _new_canvas_for_padding(img: Image.Image, width: int, height: int) -> Image.Image:
    """创建用于补边的白色画布，避免默认黑边。"""
    if img.mode in {"RGBA", "LA"}:
        return Image.new("RGBA", (width, height), (255, 255, 255, 255))
    return Image.new("RGB", (width, height), (255, 255, 255))


def _format_target_size(w: int, h: int) -> str:
    """格式化目标尺寸为人类可读文本。"""
    if w > 0 and h > 0:
        return f"{w}×{h}"
    if w > 0:
        return f"宽{w}（高度自适应）"
    if h > 0:
        return f"高{h}（宽度自适应）"
    return "?"


def _check_format_mismatch(ext: str, actual_fmt: str) -> str:
    """检测后缀与实际格式是否一致，返回警告文本或空字符串。"""
    ext_map = {
        ".jpg": "JPEG", ".jpeg": "JPEG",
        ".png": "PNG",
        ".webp": "WEBP",
        ".bmp": "BMP",
        ".gif": "GIF",
        ".tiff": "TIFF", ".tif": "TIFF",
    }
    expected = ext_map.get(ext)
    if expected and actual_fmt and expected != actual_fmt.upper():
        return f"文件后缀为{ext}但实际格式为{actual_fmt}，已按实际格式处理"
    return ""


# ── CLI 入口 ──

if __name__ == "__main__":
    import argparse
    import json

    p = argparse.ArgumentParser(description="图片分辨率调整工具")
    p.add_argument("source", help="图片路径 或 文件夹路径")
    p.add_argument("size", help="目标尺寸: 800x800, 5寸, A4, 宽800, 高600 ...")
    p.add_argument(
        "--keep-aspect", dest="keep", action="store_true", default=True,
        help="等比缩放（默认）",
    )
    p.add_argument(
        "--stretch", dest="keep", action="store_false",
        help="兼容旧参数：强制拉伸到目标尺寸，等同于 --mode stretch",
    )
    p.add_argument(
        "--mode",
        choices=("auto", "fit", "fill", "pad", "stretch"),
        default="auto",
        help="缩放模式：auto/fit/fill/pad/stretch (默认: auto)",
    )
    p.add_argument(
        "--format", "-f", default="same",
        help="输出格式: same/jpg/png/webp/bmp/tiff (默认: same)",
    )
    p.add_argument(
        "--quality", "-q", type=int, default=95,
        help="JPEG/WebP 质量 1-100 (默认: 95)",
    )
    p.add_argument(
        "--output-dir", "-o", default="",
        help="输出目录 (默认: 源目录/resized)",
    )
    p.add_argument(
        "--suffix", default="",
        help="输出文件名后缀，插在文件名与扩展名之间（如 --suffix _5inch → photo_5inch.jpg）",
    )
    p.add_argument("--json", action="store_true", help="以JSON格式输出结果")
    args = p.parse_args()

    result = resize_image(
        source=args.source,
        size=args.size,
        keep_aspect_ratio=args.keep,
        mode=args.mode,
        output_format=args.format,
        quality=args.quality,
        output_dir=args.output_dir,
        suffix=args.suffix,
    )

    if args.json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        print(f"\n{result['summary']}")
        print("-" * 50)
        for r in result["results"]:
            status_icon = {
                "ok": "[OK]",
                "warning": "[WARN]",
                "skipped": "[SKIP]",
                "error": "[ERR]",
            }.get(r["status"], "[?]")
            print(f"{status_icon} {r['input']}")
            print(f"   原尺寸: {r['original_size']} → 目标: {r['target_size']} → 结果: {r['final_size']}")
            if r["warning"]:
                print(f"   ! {r['warning']}")
            if r["output"]:
                print(f"   -> {r['output']}")
        print()
