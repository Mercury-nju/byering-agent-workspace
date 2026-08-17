#!/usr/bin/env python3
"""Split Byering role contact sheets into normalized transparent state frames."""

from __future__ import annotations

import json
import sys
from pathlib import Path

from PIL import Image


STATES = (
    "standby",
    "walking_right",
    "walking_left",
    "seated_review",
    "search",
    "working",
    "celebrate",
    "rest",
)
CANVAS_WIDTH = 534
CANVAS_HEIGHT = 400
MAX_VISIBLE_WIDTH = 250
MAX_VISIBLE_HEIGHT = 280
BASELINE = 330


def fail(message: str) -> None:
    raise SystemExit(f"office-ip-role-frames: {message}")


def split_sheet(image: Image.Image) -> list[Image.Image]:
    width, height = image.size
    cells: list[Image.Image] = []
    for row in range(2):
        for column in range(4):
            left = round(column * width / 4) + 14
            top = round(row * height / 2) + 14
            right = round((column + 1) * width / 4) - 14
            bottom = round((row + 1) * height / 2) - 14
            cell = image.crop((left, top, right, bottom)).convert("RGBA")
            alpha_box = cell.getchannel("A").getbbox()
            if not alpha_box:
                fail(f"empty contact-sheet cell {row},{column}")
            cells.append(cell.crop(alpha_box))
    return cells


def normalize(cells: list[Image.Image]) -> list[Image.Image]:
    max_width = max(cell.width for cell in cells)
    max_height = max(cell.height for cell in cells)
    scale = min(MAX_VISIBLE_WIDTH / max_width, MAX_VISIBLE_HEIGHT / max_height)
    normalized: list[Image.Image] = []
    for cell in cells:
        width = max(1, round(cell.width * scale))
        height = max(1, round(cell.height * scale))
        resized = cell.resize((width, height), Image.Resampling.LANCZOS)
        frame = Image.new("RGBA", (CANVAS_WIDTH, CANVAS_HEIGHT), (0, 0, 0, 0))
        frame.alpha_composite(resized, ((CANVAS_WIDTH - width) // 2, BASELINE - height))
        normalized.append(frame)
    return normalized


def main() -> None:
    if len(sys.argv) != 4:
        fail("usage: office-ip-role-frames.py INPUT_DIR OUTPUT_DIR MANIFEST")
    input_dir, output_dir, manifest_path = map(Path, sys.argv[1:])
    output_dir.mkdir(parents=True, exist_ok=True)
    manifest: dict[str, dict[str, object]] = {}
    sheets = sorted(input_dir.glob("*-v3-alpha.png"))
    if len(sheets) != 6:
        fail(f"expected 6 alpha sheets, found {len(sheets)}")
    for sheet_path in sheets:
        role = sheet_path.name.removesuffix("-v3-alpha.png")
        role_dir = output_dir / role
        role_dir.mkdir(parents=True, exist_ok=True)
        frames = normalize(split_sheet(Image.open(sheet_path)))
        manifest[role] = {
            "states": list(STATES),
            "canvas": {"width": CANVAS_WIDTH, "height": CANVAS_HEIGHT},
            "maxVisible": {"width": MAX_VISIBLE_WIDTH, "height": MAX_VISIBLE_HEIGHT},
            "baseline": BASELINE,
        }
        for state, frame in zip(STATES, frames):
            frame_path = role_dir / f"{state}.png"
            frame.save(frame_path, format="PNG", optimize=True)
    Path(manifest_path).write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    print(f"normalized {len(sheets)} role sheets into {output_dir}")


if __name__ == "__main__":
    main()
