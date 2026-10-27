#!/usr/bin/env python3
"""从通用模板生成独立的动画原理展示页。"""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path
from typing import Any


SKILL_ROOT = Path(__file__).resolve().parent.parent
TEMPLATE_PATH = SKILL_ROOT / "assets" / "motion-explainer-template.html"
CONFIG_PLACEHOLDER = "__MOTION_EXPLAINER_CONFIG__"
DRIVERS = ("pointer-angle", "pointer-x", "drag", "scroll", "autoplay")
PLAY_MODES = ("loop", "pingpong", "once")


def positive_int(value: str) -> int:
    number = int(value)
    if number <= 0:
        raise argparse.ArgumentTypeError("必须是正整数")
    return number


def positive_float(value: str) -> float:
    number = float(value)
    if number <= 0:
        raise argparse.ArgumentTypeError("必须大于 0")
    return number


def load_manifest(path: Path | None) -> dict[str, Any]:
    if path is None:
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise SystemExit(f"无法读取 manifest：{error}") from error
    if not isinstance(data, dict):
        raise SystemExit("manifest 顶层必须是 JSON 对象")
    return data


def first_value(
    explicit: Any,
    manifest: dict[str, Any],
    *keys: str,
    default: Any = None,
) -> Any:
    if explicit is not None:
        return explicit
    for key in keys:
        if key in manifest and manifest[key] is not None:
            return manifest[key]
    return default


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="生成带雪碧图、母版视频和实时帧高亮的独立 HTML 展示页。"
    )
    parser.add_argument("--title", default="一张图，很多种运动。")
    parser.add_argument(
        "--atlas-url",
        required=True,
        help="HTML 中使用的图集 URL；相对地址以输出 HTML 所在目录为基准。",
    )
    parser.add_argument(
        "--video-url",
        help="可选母版视频 URL；不传时隐藏视频 Tab。",
    )
    parser.add_argument("--manifest", type=Path, help="可选本地图集 manifest。")
    parser.add_argument("--frames", type=positive_int)
    parser.add_argument("--columns", type=positive_int)
    parser.add_argument("--rows", type=positive_int)
    parser.add_argument("--cell-width", type=positive_int)
    parser.add_argument("--cell-height", type=positive_int)
    parser.add_argument("--rest-frame", type=int)
    parser.add_argument("--driver", choices=DRIVERS, default="pointer-angle")
    parser.add_argument("--angle-start-deg", type=float)
    parser.add_argument("--smooth-time", type=positive_float, default=0.11)
    parser.add_argument("--max-frame-speed", type=positive_float)
    parser.add_argument("--autoplay-fps", type=positive_float, default=24)
    parser.add_argument(
        "--autoplay-mode",
        choices=PLAY_MODES,
        default="loop",
    )
    parser.add_argument("--scroll-pages", type=positive_float, default=3)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--force", action="store_true")
    return parser.parse_args()


def build_config(args: argparse.Namespace) -> dict[str, Any]:
    manifest = load_manifest(args.manifest)
    frame_count = int(
        first_value(args.frames, manifest, "frameCount", "frames", default=0)
    )
    columns = int(first_value(args.columns, manifest, "columns", default=0))
    rows = int(first_value(args.rows, manifest, "rows", default=0))
    cell_width = int(
        first_value(args.cell_width, manifest, "cellWidth", default=1)
    )
    cell_height = int(
        first_value(args.cell_height, manifest, "cellHeight", default=1)
    )

    if frame_count <= 0 or columns <= 0 or rows <= 0:
        raise SystemExit(
            "缺少图集尺寸：请提供 --frames、--columns、--rows，或传入包含这些字段的 manifest。"
        )
    if columns * rows < frame_count:
        raise SystemExit(
            f"图集网格只有 {columns * rows} 个格子，无法容纳 {frame_count} 帧。"
        )
    if cell_width <= 0 or cell_height <= 0:
        raise SystemExit("cellWidth 和 cellHeight 必须大于 0。")

    rest_frame = int(
        first_value(
            args.rest_frame,
            manifest,
            "initialFrame",
            "restFrame",
            default=0,
        )
    )
    if not 0 <= rest_frame < frame_count:
        raise SystemExit(
            f"rest frame 必须位于 0 到 {frame_count - 1} 之间。"
        )

    manifest_angle = manifest.get("startAngleRadians")
    if args.angle_start_deg is not None:
        angle_start_deg = args.angle_start_deg
    elif manifest_angle is not None:
        angle_start_deg = math.degrees(float(manifest_angle))
    else:
        angle_start_deg = -135

    max_frame_speed = (
        args.max_frame_speed
        if args.max_frame_speed is not None
        else max(60.0, frame_count * 2.0)
    )

    return {
        "title": args.title,
        "atlasUrl": args.atlas_url,
        "videoUrl": args.video_url or "",
        "frameCount": frame_count,
        "columns": columns,
        "rows": rows,
        "cellWidth": cell_width,
        "cellHeight": cell_height,
        "restFrame": rest_frame,
        "driver": args.driver,
        "angleStartDeg": angle_start_deg,
        "smoothTime": args.smooth_time,
        "maxFrameSpeed": max_frame_speed,
        "autoplayFps": args.autoplay_fps,
        "autoplayMode": args.autoplay_mode,
        "scrollPages": args.scroll_pages,
    }


def main() -> None:
    args = parse_args()
    if args.output.exists() and not args.force:
        raise SystemExit(
            f"输出已存在：{args.output}。确认后使用 --force 覆盖。"
        )
    if not TEMPLATE_PATH.exists():
        raise SystemExit(f"找不到模板：{TEMPLATE_PATH}")

    template = TEMPLATE_PATH.read_text(encoding="utf-8")
    if template.count(CONFIG_PLACEHOLDER) != 1:
        raise SystemExit("模板配置占位符缺失或不唯一。")

    config = build_config(args)
    embedded = json.dumps(
        config,
        ensure_ascii=False,
        separators=(",", ":"),
    ).replace("</", "<\\/")
    output = template.replace(CONFIG_PLACEHOLDER, embedded)

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(output, encoding="utf-8")
    print(f"已生成：{args.output.resolve()}")
    print(
        "配置："
        f"{config['frameCount']} 帧，"
        f"{config['columns']}×{config['rows']}，"
        f"driver={config['driver']}"
    )


if __name__ == "__main__":
    main()
