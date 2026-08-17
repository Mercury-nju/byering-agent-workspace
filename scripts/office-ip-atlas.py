#!/usr/bin/env python3
"""Pack Byering pilot frames into copies of the legacy office atlases."""

from __future__ import annotations

import json
from statistics import median
import sys
from pathlib import Path

from PIL import Image


ATLAS_COLUMNS = 8


PILOT_SOURCE_BY_ACTION = {
    "fc_cheer1_sub": "fc_standby",
    "fc_cheer2_sub": "fc_standby",
    "fc_cheer_main": "fc_standby",
    "fc_coffee": "fc_standby",
    "fc_drink_coffee": "fc_standby",
    "fc_fall_down": "fc_standby",
    "fc_high_press": "fc_working",
    "fc_leaving": "fc_standby",
    "fc_off_chair": "fc_standby",
    "fc_peek": "fc_standby",
    "fc_pooping": "fc_standby",
    "fc_running_treadmill": "fc_walking_h",
    "fc_salute": "fc_standby",
    "fc_screen_playing1": "fc_working",
    "fc_screen_playing2": "fc_working",
    "fc_screen_playing3": "fc_working",
    "fc_screen_working_apk_use": "fc_working",
    "fc_screen_working_file_use": "fc_working",
    "fc_screen_working_main": "fc_working",
    "fc_screen_working_search_or_browser_use": "fc_working",
    "fc_screen_working_win_use": "fc_working",
    "fc_sigh": "fc_standby",
    "fc_sleeping": "fc_standby",
    "fc_standby": "fc_standby",
    "fc_talking_on_seat": "fc_talking_on_seat",
    "fc_talking_on_stand": "fc_standby",
    "fc_ticket": "fc_standby",
    "fc_walking_h": "fc_walking_h",
    "fc_walking_up": "fc_walking_h",
    "fc_working": "fc_working",
}


def fail(message: str) -> None:
    raise SystemExit(f"office-ip-atlas: {message}")


def load_spec(path: Path) -> dict:
    try:
        return json.loads(path.read_text())
    except Exception as error:
        fail(f"invalid spec: {error}")


def load_pilot_frames(source: Path, source_action: str) -> list[Image.Image]:
    frames = []
    for index in range(5):
        frame_path = source / f"{source_action}-{index}.png"
        if not frame_path.exists():
            fail(f"missing pilot frame: {frame_path}")
        image = Image.open(frame_path).convert("RGBA")
        alpha_box = image.getchannel("A").getbbox()
        if not alpha_box:
            fail(f"pilot frame has no visible pixels: {frame_path}")
        frames.append(image.crop(alpha_box))
    return frames


def stable_pilot_frames(pilot_frames: list[Image.Image], metadata: dict) -> list[Image.Image]:
    legacy_frames = list(metadata["frames"].values())
    target_width = round(median(item["frame"]["w"] for item in legacy_frames))
    target_height = round(median(item["frame"]["h"] for item in legacy_frames))
    maximum_width = max(image.width for image in pilot_frames)
    maximum_height = max(image.height for image in pilot_frames)
    scale = min(
        max(1, target_width - 8) / maximum_width,
        max(1, target_height - 8) / maximum_height,
    )
    return [
        image.resize(
            (max(1, round(image.width * scale)), max(1, round(image.height * scale))),
            Image.Resampling.LANCZOS,
        )
        for image in pilot_frames
    ]


def pack_action(action: str, spec: dict) -> None:
    legacy_root = Path(spec["legacy"])
    legacy_path = legacy_root / f"{action}.webp.json"
    if not legacy_path.exists():
        variants = sorted(legacy_root.glob(f"{action}-*.webp.json"))
        if not variants:
            fail(f"missing legacy metadata: {legacy_path}")
        legacy_path = variants[0]
    metadata = json.loads(legacy_path.read_text())
    source_action = PILOT_SOURCE_BY_ACTION.get(action)
    if source_action is None:
        fail(f"action is not an approved non-cat alias: {action}")
    pilot_frames = stable_pilot_frames(
        load_pilot_frames(Path(spec["source"]), source_action),
        metadata,
    )
    source_size = metadata["frames"][next(iter(metadata["frames"]))]["sourceSize"]
    tile_width = round(median(item["frame"]["w"] for item in metadata["frames"].values()))
    tile_height = round(median(item["frame"]["h"] for item in metadata["frames"].values()))
    logical_x = round(median(item["spriteSourceSize"]["x"] for item in metadata["frames"].values()))
    logical_y = round(median(item["spriteSourceSize"]["y"] for item in metadata["frames"].values()))

    animation_name, animation_frames = next(iter(metadata.get("animations", {}).items()))
    atlas_rows = (len(animation_frames) + ATLAS_COLUMNS - 1) // ATLAS_COLUMNS
    atlas_size = {"w": tile_width * ATLAS_COLUMNS, "h": tile_height * atlas_rows}
    atlas = Image.new("RGBA", (atlas_size["w"], atlas_size["h"]), (0, 0, 0, 0))
    generated_frames = {}
    for index, frame_name in enumerate(animation_frames):
        legacy_frame = metadata["frames"][frame_name]
        frame = {
            "x": (index % ATLAS_COLUMNS) * tile_width,
            "y": (index // ATLAS_COLUMNS) * tile_height,
            "w": tile_width,
            "h": tile_height,
        }
        pilot_frame = pilot_frames[index % len(pilot_frames)]
        fitted = Image.new("RGBA", (tile_width, tile_height), (0, 0, 0, 0))
        fitted.alpha_composite(
            pilot_frame,
            ((tile_width - pilot_frame.width) // 2, tile_height - pilot_frame.height),
        )
        atlas.alpha_composite(fitted, (frame["x"], frame["y"]))
        generated = dict(legacy_frame)
        generated["frame"] = frame
        generated["rotated"] = False
        generated["spriteSourceSize"] = {
            "x": logical_x,
            "y": logical_y,
            "w": tile_width,
            "h": tile_height,
        }
        generated_frames[frame_name] = generated

    generated_metadata = dict(metadata)
    generated_metadata["frames"] = generated_frames
    generated_metadata["animations"] = {animation_name: list(animation_frames)}
    generated_metadata["meta"] = dict(metadata["meta"])
    generated_metadata["meta"]["size"] = atlas_size
    generated_metadata["meta"]["related_multi_packs"] = []
    generated_metadata["meta"]["image"] = f"{action}.webp"
    generated_metadata["meta"]["realImage"] = f"{action}.webp"
    generated_metadata["meta"]["placeholderApplied"] = False

    output_dir = Path(spec["output"])
    output_dir.mkdir(parents=True, exist_ok=True)
    atlas.save(output_dir / f"{action}.webp", format="WEBP", lossless=True, method=6)
    (output_dir / f"{action}.webp.json").write_text(
        json.dumps(generated_metadata, ensure_ascii=False, indent=2) + "\n"
    )


def main() -> None:
    if len(sys.argv) != 2:
        fail("usage: office-ip-atlas.py SPEC.json")
    spec = load_spec(Path(sys.argv[1]))
    for action in spec["actions"]:
        pack_action(action, spec)
    print(f"packed {len(spec['actions'])} Byering pilot atlases into {spec['output']}")


if __name__ == "__main__":
    main()
