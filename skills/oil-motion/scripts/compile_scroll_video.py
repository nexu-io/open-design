#!/usr/bin/env python3
"""把动作母版编译为可精确控制的全关键帧 MP4。

适合一维连续时间轴的大尺寸动画，支持逐帧、分段和自主播放，以及两种背景归属：

- `--background-owner page`（chroma 路线）：保留均匀色键背景，网页使用
  WebGL 实时抠色；编译前逐帧模拟同一套 shader 参数，检查主体内部绿块、边缘溢色
  和压缩脏边，并输出多种测试底色上的抠色合成图供验收。
- `--background-owner video`（baked 路线）：背景与主体在同一视频中烘焙生成，
  不做任何抠色；视频本身就是最终画面。
"""

from __future__ import annotations

import argparse
import bisect
import json
import shutil
import subprocess
import sys
from pathlib import Path
from statistics import median
from typing import Any

from PIL import Image, ImageDraw

from chroma_key import (
    ChromaKeyParameters,
    analyze_frame,
    default_parameters,
    key_image,
    key_mode,
)

SCRIPT_DIR = Path(__file__).resolve().parent
PIPELINE = SCRIPT_DIR / "motion_pipeline.py"
CLEANUP = SCRIPT_DIR / "loop_cleanup.py"
OPTIMIZE = SCRIPT_DIR / "optimize_motion.py"

POST_ENCODE_LIMITS = {
    "keyLikeAlphaP99": 0.01,
    "visibleKeyPixelRatio": 0.01,
    "opaqueKeyPixelRatio": 0.005,
    "edgeKeyDominanceP95": 0.02,
}


def run(command: list[str]) -> None:
    print("+ " + " ".join(command), flush=True)
    subprocess.run(command, check=True)


def require_command(name: str) -> None:
    if shutil.which(name) is None:
        raise RuntimeError(f"找不到 {name}，请先安装 ffmpeg")


def probe(path: Path) -> dict[str, Any]:
    completed = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_streams",
            "-show_format",
            "-of",
            "json",
            str(path),
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    return json.loads(completed.stdout)


def video_stream(report: dict[str, Any]) -> dict[str, Any]:
    for stream in report.get("streams", []):
        if stream.get("codec_type") == "video":
            return stream
    raise ValueError("输入文件没有视频流")


def parse_rate(value: str | None) -> float | None:
    if not value or value in {"0/0", "N/A"}:
        return None
    if "/" in value:
        numerator, denominator = value.split("/", 1)
        denominator_value = float(denominator)
        return float(numerator) / denominator_value if denominator_value else None
    return float(value)


def parse_segment_specs(values: list[str]) -> list[dict[str, int | str]]:
    segments: list[dict[str, int | str]] = []
    identifiers: set[str] = set()
    for raw in values:
        try:
            identifier, frames = raw.split("=", 1)
            start_text, hold_text, end_text = frames.split(":", 2)
            start, hold, end_exclusive = (
                int(start_text),
                int(hold_text),
                int(end_text),
            )
        except ValueError as error:
            raise ValueError(
                "--segment 必须写成 DESTINATION_STATE_ID=START:HOLD:END_EXCLUSIVE"
            ) from error
        identifier = identifier.strip()
        if not identifier or identifier in identifiers:
            raise ValueError(f"片段 ID 为空或重复：{identifier or raw}")
        if not 0 <= start <= hold < end_exclusive:
            raise ValueError(f"片段 {identifier} 必须满足 START <= HOLD < END_EXCLUSIVE")
        identifiers.add(identifier)
        segments.append(
            {
                "id": identifier,
                "start": start,
                "hold": hold,
                "endExclusive": end_exclusive,
            }
        )
    return segments


def build_timeline(
    specs: list[dict[str, int | str]],
    kept_source_indices: list[int],
    raw_count: int,
    fps: float,
    curve: dict[str, float | str],
    initial_state_id: str = "state-0",
) -> dict[str, Any]:
    final_count = len(kept_source_indices)
    if not specs:
        specs = [
            {
                "id": "state-1",
                "start": 0,
                "hold": raw_count - 1,
                "endExclusive": raw_count,
            }
        ]
    initial_state_id = initial_state_id.strip()
    if not initial_state_id:
        raise ValueError("--initial-state-id 不能为空")
    destination_ids = {str(spec["id"]) for spec in specs}
    if initial_state_id in destination_ids:
        raise ValueError("初始状态 ID 不能与目标状态 ID 重复")
    segments: list[dict[str, Any]] = []
    states: list[dict[str, Any]] = []
    previous_end = 0
    previous_state_id = initial_state_id
    for spec in specs:
        source_start = int(spec["start"])
        source_hold = int(spec["hold"])
        source_end = int(spec["endExclusive"])
        if source_end > raw_count:
            raise ValueError(
                f"片段 {spec['id']} 的 END_EXCLUSIVE 超出源帧数 {raw_count}"
            )
        start = bisect.bisect_left(kept_source_indices, source_start)
        hold = bisect.bisect_right(kept_source_indices, source_hold) - 1
        end_exclusive = bisect.bisect_left(kept_source_indices, source_end)
        if not 0 <= start <= hold < end_exclusive <= final_count:
            raise ValueError(f"片段 {spec['id']} 在清理后没有有效连续帧")
        if start < previous_end:
            raise ValueError(f"片段 {spec['id']} 与上一片段重叠")
        destination_state_id = str(spec["id"])
        if not states:
            states.append(
                {
                    "id": initial_state_id,
                    "frame": start,
                    "hold": start / fps,
                }
            )
        segments.append(
            {
                "id": f"{previous_state_id}->{destination_state_id}",
                "from": previous_state_id,
                "to": destination_state_id,
                "sourceFrames": {
                    "start": source_start,
                    "hold": source_hold,
                    "endExclusive": source_end,
                },
                "frames": {
                    "start": start,
                    "hold": hold,
                    "endExclusive": end_exclusive,
                },
                "start": start / fps,
                "hold": hold / fps,
                "endExclusive": end_exclusive / fps,
                "curve": curve,
            }
        )
        states.append(
            {
                "id": destination_state_id,
                "frame": hold,
                "hold": hold / fps,
            }
        )
        previous_end = end_exclusive
        previous_state_id = destination_state_id
    return {
        "schemaVersion": 1,
        "fps": fps,
        "frameDuration": 1 / fps,
        "frameCount": final_count,
        "initialState": initial_state_id,
        "states": states,
        "segments": segments,
    }


def dimensions_for_width(
    requested_width: int,
    source_width: int,
    source_height: int,
    allow_upscale: bool,
) -> tuple[int, int]:
    width = requested_width
    if width > source_width and not allow_upscale:
        width = source_width
        print(
            f"提示：请求宽度 {requested_width}px 超过母版，自动限制为 {source_width}px",
            flush=True,
        )
    width = max(2, width - width % 2)
    height = round(width * source_height / source_width)
    height = max(2, height - height % 2)
    return width, height


def image_frames(directory: Path) -> list[Path]:
    return sorted(directory.glob("frame_*.png"))


def representative_frames(paths: list[Path], limit: int = 48) -> list[Path]:
    if limit < 1:
        raise ValueError("代表帧数量必须大于 0")
    if len(paths) <= limit:
        return paths
    if limit == 1:
        return [paths[0]]
    return [
        paths[round(index * (len(paths) - 1) / (limit - 1))]
        for index in range(limit)
    ]


def representative_indices(count: int, limit: int = 48) -> list[int]:
    if count < 1:
        raise ValueError("帧数必须大于 0")
    if limit < 1:
        raise ValueError("代表帧数量必须大于 0")
    if count <= limit:
        return list(range(count))
    if limit == 1:
        return [0]
    return [
        round(index * (count - 1) / (limit - 1))
        for index in range(limit)
    ]


def border_samples(path: Path) -> list[tuple[int, int, int]]:
    with Image.open(path) as opened:
        image = opened.convert("RGB")
    width, height = image.size
    band = max(1, min(width, height, 6))
    step = max(1, min(width, height) // 256)
    pixels = image.load()
    samples: list[tuple[int, int, int]] = []
    for x in range(0, width, step):
        for offset in range(band):
            samples.append(pixels[x, offset])
            samples.append(pixels[x, height - 1 - offset])
    for y in range(0, height, step):
        for offset in range(band):
            samples.append(pixels[offset, y])
            samples.append(pixels[width - 1 - offset, y])
    return samples


def sample_key_color(path: Path) -> tuple[int, int, int]:
    samples = border_samples(path)
    return tuple(
        int(round(median(sample[channel] for sample in samples)))
        for channel in range(3)
    )


def sample_key_color_many(paths: list[Path]) -> tuple[int, int, int]:
    if not paths:
        raise ValueError("没有可用于采样色键的帧")
    per_frame = [sample_key_color(path) for path in paths]
    return tuple(
        int(round(median(color[channel] for color in per_frame)))
        for channel in range(3)
    )


def key_color_hex(key: tuple[int, int, int]) -> str:
    return f"#{key[0]:02X}{key[1]:02X}{key[2]:02X}"


def validate_key_source(
    paths: list[Path],
    key: tuple[int, int, int],
) -> dict[str, object]:
    try:
        kind = key_mode(key)
    except ValueError as error:
        raise ValueError("母版边缘不是可识别的绿色或洋红色键背景") from error
    checked = representative_frames(paths)
    worst_spread = 0
    for path in checked:
        spreads = sorted(
            max(abs(color[channel] - key[channel]) for channel in range(3))
            for color in border_samples(path)
        )
        spread_p95 = spreads[round((len(spreads) - 1) * 0.95)]
        worst_spread = max(worst_spread, spread_p95)
        if spread_p95 > 32:
            raise ValueError(
                f"母版色键边缘不均匀：{path.name} 的 95% 色差范围为 "
                f"{spread_p95}，上限 32"
            )
    return {
        "kind": kind,
        "borderSpreadP95Max": worst_spread,
        "checkedFrames": len(checked),
    }


def decode_video_frames(
    video: Path,
    output: Path,
    indices: list[int],
) -> dict[int, Path]:
    if not indices:
        raise ValueError("至少需要解码一帧")
    output.mkdir(parents=True, exist_ok=True)
    expression = "+".join(f"eq(n\\,{index})" for index in indices)
    run(
        [
            "ffmpeg",
            "-hide_banner",
            "-loglevel",
            "warning",
            "-y",
            "-i",
            str(video),
            "-vf",
            f"select={expression}",
            "-fps_mode",
            "vfr",
            str(output / "frame_%05d.png"),
        ]
    )
    decoded = image_frames(output)
    if len(decoded) != len(indices):
        raise RuntimeError(
            f"编码后抽帧数量错误：期望 {len(indices)}，实际 {len(decoded)}"
        )
    return dict(zip(indices, decoded, strict=True))


def parse_anchors(values: list[str]) -> dict[str, int]:
    anchors: dict[str, int] = {}
    for value in values:
        if "=" not in value:
            raise ValueError("--anchor 格式必须是 NAME=SOURCE_FRAME")
        name, raw_frame = value.split("=", 1)
        name = name.strip()
        if not name or not name.replace("-", "_").isidentifier():
            raise ValueError(f"无效锚点名称：{name or value}")
        if name in anchors:
            raise ValueError(f"锚点名称重复：{name}")
        try:
            source_frame = int(raw_frame)
        except ValueError as error:
            raise ValueError(f"锚点帧必须是整数：{value}") from error
        if source_frame < 0:
            raise ValueError(f"锚点帧不能小于 0：{value}")
        anchors[name] = source_frame
    return anchors


def map_source_frame(source_frame: int, kept_source_indices: list[int]) -> int:
    if not kept_source_indices:
        raise ValueError("清理报告没有保留帧")
    return min(
        range(len(kept_source_indices)),
        key=lambda index: (abs(kept_source_indices[index] - source_frame), index),
    )


def create_background_matrix(alpha_frames: list[Path], output: Path) -> None:
    selected = representative_frames(alpha_frames, limit=6)
    if not selected:
        raise ValueError("没有可生成背景验收矩阵的 Alpha 帧")
    thumb_width = 160
    with Image.open(selected[0]) as opened:
        thumb_height = max(1, round(thumb_width * opened.height / opened.width))
    backgrounds = [
        (255, 255, 255),
        (8, 8, 10),
        (245, 24, 88),
        (0, 112, 255),
    ]
    gutter = 8
    label_height = 18
    width = gutter + len(selected) * (thumb_width + gutter)
    height = gutter + len(backgrounds) * (thumb_height + label_height + gutter)
    sheet = Image.new("RGB", (width, height), (32, 32, 34))
    draw = ImageDraw.Draw(sheet)
    for row, background_color in enumerate(backgrounds):
        y = gutter + row * (thumb_height + label_height + gutter)
        draw.text((gutter, y + thumb_height + 2), f"BG {row + 1}", fill=(230, 230, 230))
        for column, path in enumerate(selected):
            with Image.open(path) as opened:
                foreground = opened.convert("RGBA")
            foreground.thumbnail(
                (thumb_width, thumb_height),
                Image.Resampling.LANCZOS,
            )
            background = Image.new(
                "RGBA",
                (thumb_width, thumb_height),
                (*background_color, 255),
            )
            x = gutter + column * (thumb_width + gutter)
            paste_x = (thumb_width - foreground.width) // 2
            paste_y = (thumb_height - foreground.height) // 2
            background.alpha_composite(foreground, (paste_x, paste_y))
            sheet.paste(background.convert("RGB"), (x, y))
    output.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(output, quality=90)


def analyze_encoded_frames(
    name: str,
    decoded: dict[int, Path],
    alpha_output: Path,
    parameters: ChromaKeyParameters,
    qa: Path,
    contact_columns: int,
) -> dict[str, Any]:
    alpha_output.mkdir(parents=True, exist_ok=True)
    records: list[dict[str, Any]] = []
    for sequence, (frame_index, source) in enumerate(decoded.items(), start=1):
        alpha_path = alpha_output / f"frame_{sequence:05d}.png"
        key_image(source, alpha_path, parameters)
        records.append(
            {
                "frame": frame_index,
                "file": source.name,
                **analyze_frame(source, parameters),
            }
        )
    maxima = {
        metric: max(float(record[metric]) for record in records)
        for metric in POST_ENCODE_LIMITS
    }
    violations = [
        {
            "metric": metric,
            "actual": maxima[metric],
            "limit": limit,
        }
        for metric, limit in POST_ENCODE_LIMITS.items()
        if maxima[metric] > limit
    ]
    run(
        [
            sys.executable,
            str(PIPELINE),
            "contact",
            str(alpha_output),
            "--output",
            str(qa / f"{name}-alpha-contact.jpg"),
            "--columns",
            str(contact_columns),
        ]
    )
    create_background_matrix(
        image_frames(alpha_output),
        qa / f"{name}-background-matrix.jpg",
    )
    return {
        "passed": not violations,
        "checkedFrames": len(records),
        "limits": POST_ENCODE_LIMITS,
        "maxima": maxima,
        "violations": violations,
        "frames": records,
    }
def load_budget_report(
    path: Path,
    expected: str = "chroma-video",
) -> dict[str, Any]:
    if not path.is_file():
        raise FileNotFoundError(f"找不到预算报告：{path}")
    report = json.loads(path.read_text(encoding="utf-8"))
    delivery = report.get("delivery", {})
    if delivery.get("selected") != expected:
        raise ValueError(
            f"预算报告没有选择 {expected}，禁止执行视频编译路线"
        )
    if not report.get("passes"):
        raise ValueError("预算报告存在阻断项，禁止执行视频编译路线")
    return report


def require_frame_preparation_pass(path: Path) -> dict[str, Any]:
    report = json.loads(path.read_text(encoding="utf-8"))
    verdict = report.get("verdict", {})
    if not verdict.get("passedAutomaticChecks"):
        raise RuntimeError("帧准备自动检查未通过，禁止继续编码视频")
    return report


def encode_all_intra(
    frames: Path,
    output: Path,
    fps: float,
    width: int,
    height: int,
    crf: int,
) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    run(
        [
            "ffmpeg",
            "-hide_banner",
            "-loglevel",
            "warning",
            "-y",
            "-framerate",
            str(fps),
            "-start_number",
            "1",
            "-i",
            str(frames / "frame_%05d.png"),
            "-vf",
            f"scale={width}:{height}:flags=lanczos,setsar=1",
            "-c:v",
            "libx264",
            "-preset",
            "slow",
            "-crf",
            str(crf),
            "-g",
            "1",
            "-keyint_min",
            "1",
            "-sc_threshold",
            "0",
            "-pix_fmt",
            "yuv420p",
            "-an",
            "-movflags",
            "+faststart",
            str(output),
        ]
    )


def all_frames_are_keyframes(path: Path) -> bool:
    completed = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-select_streams",
            "v:0",
            "-show_entries",
            "frame=key_frame",
            "-of",
            "csv=p=0",
            str(path),
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    values = [
        line.strip().split(",", 1)[0]
        for line in completed.stdout.splitlines()
        if line.strip()
    ]
    return bool(values) and all(value == "1" for value in values)


def safe_prepare_output(output: Path, force: bool) -> None:
    output = output.resolve()
    if output == Path(output.anchor) or output == Path.home().resolve():
        raise ValueError("输出目录不能是磁盘根目录或用户主目录")
    if output.exists() and any(output.iterdir()):
        if not force:
            raise FileExistsError(f"输出目录非空：{output}；确认后使用 --force")
        for item in output.iterdir():
            if item.is_dir() and not item.is_symlink():
                shutil.rmtree(item)
            else:
                item.unlink()
    output.mkdir(parents=True, exist_ok=True)


def compile_motion(args: argparse.Namespace) -> int:
    require_command("ffmpeg")
    require_command("ffprobe")

    source = Path(args.source).expanduser().resolve()
    output = Path(args.output_dir).expanduser().resolve()
    budget_path = Path(args.budget_report).expanduser().resolve()
    if not source.is_file():
        raise FileNotFoundError(f"找不到视频：{source}")
    background_owner = args.background_owner
    expected_delivery = (
        "baked-video" if background_owner == "video" else "chroma-video"
    )
    budget_report = load_budget_report(budget_path, expected_delivery)
    if args.loop and args.end_reference:
        raise ValueError("--loop 与 --end-reference 不能同时使用")
    if args.fps is not None and args.fps <= 0:
        raise ValueError("--fps 必须大于 0")
    if args.desktop_width < 2 or args.mobile_width < 2:
        raise ValueError("输出宽度必须至少为 2")
    if not 0 <= args.desktop_crf <= 51 or not 0 <= args.mobile_crf <= 51:
        raise ValueError("CRF 必须在 0–51 之间")
    if args.seam_window < 1:
        raise ValueError("--seam-window 必须至少为 1")
    if args.duplicate_threshold < 0:
        raise ValueError("--duplicate-threshold 不能小于 0")
    if args.contact_columns < 1:
        raise ValueError("--contact-columns 必须至少为 1")
    for name, value in (
        ("--playback-rate", args.playback_rate),
        ("--edge-rate", args.edge_rate),
        ("--mid-rate", args.mid_rate),
    ):
        if value <= 0:
            raise ValueError(f"{name} 必须大于 0")
    if args.poster_source_frame < 0:
        raise ValueError("--poster-source-frame 不能小于 0")
    anchor_sources = parse_anchors(args.anchor)
    segment_specs = parse_segment_specs(args.segment)
    safe_prepare_output(output, args.force)

    source_probe = probe(source)
    source_video = video_stream(source_probe)
    source_width = int(source_video["width"])
    source_height = int(source_video["height"])
    source_fps = (
        parse_rate(source_video.get("avg_frame_rate"))
        or parse_rate(source_video.get("r_frame_rate"))
        or 24.0
    )
    if args.frame_policy == "native":
        if args.fps is not None and abs(args.fps - source_fps) > 0.01:
            raise ValueError("frame-policy=native 时 --fps 必须省略或等于源帧率")
        args.fps = source_fps
    else:
        args.fps = args.fps or 48.0
        if args.fps <= source_fps:
            raise ValueError("frame-policy=interpolate 时 --fps 必须高于源帧率")

    preparation = output / "frame-preparation"
    raw_frames = preparation / "frames"
    cleaned_frames = output / "frames" / "final"
    post_encode_frames = output / "post-encode-frames"
    qa = output / "qa"
    final = output / "final"
    qa.mkdir(parents=True, exist_ok=True)
    final.mkdir(parents=True, exist_ok=True)

    if args.frame_policy == "interpolate":
        run(
            [
                sys.executable,
                str(OPTIMIZE),
                "interpolate",
                str(source),
                str(preparation),
                "--fps",
                str(args.fps),
                "--key",
                "none",
            ]
        )
        frame_report_path = preparation / "interpolation-report.json"
    else:
        run(
            [
                sys.executable,
                str(PIPELINE),
                "extract",
                str(source),
                str(raw_frames),
                "--fps",
                str(args.fps),
                "--key",
                "none",
            ]
        )
        native_qa = preparation / "qa"
        native_qa.mkdir(parents=True, exist_ok=True)
        analysis_path = native_qa / "analysis-native.json"
        run(
            [
                sys.executable,
                str(PIPELINE),
                "analyze",
                str(raw_frames),
                "--output",
                str(analysis_path),
            ]
        )
        run(
            [
                sys.executable,
                str(PIPELINE),
                "contact",
                str(raw_frames),
                "--output",
                str(native_qa / "contact-sheet-native.jpg"),
                "--columns",
                str(args.contact_columns),
            ]
        )
        frame_report_path = preparation / "frame-preparation-report.json"
        frame_report_path.write_text(
            json.dumps(
                {
                    "type": "motion-frame-preparation-report",
                    "policy": "native",
                    "sourceFps": source_fps,
                    "targetFps": args.fps,
                    "analysis": str(analysis_path),
                    "verdict": {
                        "passedAutomaticChecks": True,
                        "manualReviewRequired": True,
                    },
                },
                ensure_ascii=False,
                indent=2,
            ),
            encoding="utf-8",
        )
    frame_report = require_frame_preparation_pass(frame_report_path)
    raw_count = len(image_frames(raw_frames))
    if raw_count < 3:
        raise RuntimeError("母版切帧后少于 3 帧")
    requested_source_frames = {
        "poster": args.poster_source_frame,
        **anchor_sources,
    }
    for name, source_frame in requested_source_frames.items():
        if source_frame >= raw_count:
            raise ValueError(
                f"{name} 源帧 {source_frame} 超出插帧范围 0..{raw_count - 1}"
            )

    cleanup_report_path = qa / "cleanup.json"
    if args.loop or args.end_reference:
        cleanup_command = [
            sys.executable,
            str(CLEANUP),
            str(raw_frames),
            str(cleaned_frames),
            "--seam-window",
            str(args.seam_window),
            "--duplicate-threshold",
            str(args.duplicate_threshold),
            "--report",
            str(cleanup_report_path),
        ]
        if args.end_reference:
            cleanup_command.extend(
                [
                    "--end-reference",
                    str(Path(args.end_reference).expanduser().resolve()),
                ]
            )
        run(cleanup_command)
        final_frames = cleaned_frames
        cleanup_data = json.loads(cleanup_report_path.read_text(encoding="utf-8"))
        kept_source_indices = [
            int(index) for index in cleanup_data["keptSourceIndices"]
        ]
    else:
        final_frames = raw_frames
        kept_source_indices = list(range(raw_count))
        print("提示：未传 --loop 或 --end-reference，使用全部准备帧", flush=True)

    final_frame_paths = image_frames(final_frames)
    if not final_frame_paths:
        raise RuntimeError("清理后没有可编码帧")
    final_count = len(final_frame_paths)
    if final_count != len(kept_source_indices):
        raise RuntimeError("清理报告帧数与最终帧目录不一致")
    anchor_manifest = {
        name: {
            "sourceFrame": source_frame,
            "finalFrame": map_source_frame(source_frame, kept_source_indices),
        }
        for name, source_frame in anchor_sources.items()
    }
    poster_final_frame = map_source_frame(
        args.poster_source_frame,
        kept_source_indices,
    )
    curve = (
        {"type": "constant", "rate": args.playback_rate}
        if args.playback_curve == "constant"
        else {
            "type": "edge-mid-edge",
            "edgeRate": args.edge_rate,
            "midRate": args.mid_rate,
        }
    )
    timeline = build_timeline(
        segment_specs,
        kept_source_indices,
        raw_count,
        args.fps,
        curve,
        args.initial_state_id,
    )
    timeline_path = Path(args.timeline_output).expanduser().resolve()
    if timeline_path.exists() and not args.force:
        raise FileExistsError(f"时间轴已存在：{timeline_path}；确认后使用 --force")
    source_key_color: str | None = None
    source_key_validation: dict[str, object] | None = None
    if background_owner == "page":
        source_key = sample_key_color_many(
            representative_frames(final_frame_paths)
        )
        source_key_color = key_color_hex(source_key)
        source_key_validation = validate_key_source(
            final_frame_paths,
            source_key,
        )
    else:
        shutil.copy2(final_frame_paths[poster_final_frame], final / "poster.png")
        run(
            [
                sys.executable,
                str(PIPELINE),
                "contact",
                str(final_frames),
                "--output",
                str(qa / "contact-sheet.jpg"),
                "--columns",
                str(args.contact_columns),
            ]
        )

    desktop_size = dimensions_for_width(
        args.desktop_width,
        source_width,
        source_height,
        args.allow_upscale,
    )
    mobile_size = dimensions_for_width(
        args.mobile_width,
        source_width,
        source_height,
        args.allow_upscale,
    )
    asset_kind = "chroma" if background_owner == "page" else "baked"
    desktop_output = final / f"motion-{asset_kind}-desktop.mp4"
    mobile_output = final / f"motion-{asset_kind}-mobile.mp4"
    encode_all_intra(
        final_frames,
        desktop_output,
        args.fps,
        desktop_size[0],
        desktop_size[1],
        args.desktop_crf,
    )
    encode_all_intra(
        final_frames,
        mobile_output,
        args.fps,
        mobile_size[0],
        mobile_size[1],
        args.mobile_crf,
    )

    desktop_all_intra = all_frames_are_keyframes(desktop_output)
    mobile_all_intra = all_frames_are_keyframes(mobile_output)
    if not desktop_all_intra or not mobile_all_intra:
        raise RuntimeError("最终 MP4 不是全关键帧编码，禁止交付")

    qa_indices: list[int] = []
    runtime_key_color: str | None = None
    keying_parameters: ChromaKeyParameters | None = None
    post_encode_qa_path: Path | None = None
    post_encode_qa: dict[str, Any] | None = None
    if background_owner == "page":
        qa_indices = sorted(
            set(representative_indices(final_count) + [poster_final_frame])
        )
        desktop_decoded = decode_video_frames(
            desktop_output,
            post_encode_frames / "desktop" / "source",
            qa_indices,
        )
        mobile_decoded = decode_video_frames(
            mobile_output,
            post_encode_frames / "mobile" / "source",
            qa_indices,
        )
        runtime_key = sample_key_color_many(
            list(desktop_decoded.values()) + list(mobile_decoded.values())
        )
        runtime_key_color = key_color_hex(runtime_key)
        keying_parameters = default_parameters(runtime_key)
        desktop_keying_qa = analyze_encoded_frames(
            "desktop",
            desktop_decoded,
            post_encode_frames / "desktop" / "alpha",
            keying_parameters,
            qa,
            args.contact_columns,
        )
        mobile_keying_qa = analyze_encoded_frames(
            "mobile",
            mobile_decoded,
            post_encode_frames / "mobile" / "alpha",
            keying_parameters,
            qa,
            args.contact_columns,
        )
        post_encode_qa = {
            "passed": (
                desktop_keying_qa["passed"] and mobile_keying_qa["passed"]
            ),
            "algorithm": keying_parameters.algorithm,
            "runtimeKeyColor": runtime_key_color,
            "parameters": keying_parameters.manifest(),
            "frameIndices": qa_indices,
            "desktop": desktop_keying_qa,
            "mobile": mobile_keying_qa,
        }
        post_encode_qa_path = qa / "post-encode-keying.json"
        post_encode_qa_path.write_text(
            json.dumps(post_encode_qa, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        if not post_encode_qa["passed"]:
            raise RuntimeError(
                f"编码后色键检查未通过，请查看 {post_encode_qa_path}"
            )
        key_image(
            desktop_decoded[poster_final_frame],
            final / "poster-alpha.png",
            keying_parameters,
        )

    desktop_probe = probe(desktop_output)
    mobile_probe = probe(mobile_output)
    manifest = {
        "source": {
            "path": str(source),
            "width": source_width,
            "height": source_height,
            "probe": source_probe,
        },
        "compile": {
            "backgroundOwner": background_owner,
            "framePolicy": args.frame_policy,
            "sourceKeyColor": source_key_color,
            "runtimeKeyColor": runtime_key_color,
            "sourceKeyValidation": source_key_validation,
            "fps": args.fps,
            "rawFrameCount": raw_count,
            "finalFrameCount": final_count,
            "alphaQaFrameCount": len(qa_indices),
            "duration": final_count / args.fps,
            "cleanup": (
                "loop"
                if args.loop
                else "end-reference"
                if args.end_reference
                else "none"
            ),
            "duplicateThreshold": args.duplicate_threshold,
            "seamWindow": args.seam_window,
            "framePreparationReport": str(frame_report_path),
            "framePreparationVerdict": frame_report["verdict"],
            "budgetReport": str(budget_path),
            "selection": budget_report["delivery"],
            "timeline": str(timeline_path),
            "postEncodeKeyingReport": (
                str(post_encode_qa_path) if post_encode_qa_path else None
            ),
            "postEncodeKeyingPassed": (
                post_encode_qa["passed"] if post_encode_qa else None
            ),
            "intermediateFramesRetained": args.keep_frames,
        },
        "runtime": {
            "type": "chroma-video" if background_owner == "page" else "baked-video",
            "frameCount": final_count,
            "fps": args.fps,
            "keying": keying_parameters.manifest() if keying_parameters else None,
            "anchors": anchor_manifest,
            "posterFrame": poster_final_frame,
            "assets": {
                "poster": (
                    "final/poster-alpha.png"
                    if background_owner == "page"
                    else "final/poster.png"
                ),
                "desktop": f"final/motion-{asset_kind}-desktop.mp4",
                "mobile": f"final/motion-{asset_kind}-mobile.mp4",
                "timeline": str(timeline_path),
            },
        },
        "outputs": {
            "poster": {
                "path": str(
                    final / "poster-alpha.png"
                    if background_owner == "page"
                    else final / "poster.png"
                ),
                "alpha": background_owner == "page",
                "sourceFrame": args.poster_source_frame,
                "finalFrame": poster_final_frame,
            },
            "desktop": {
                "path": str(desktop_output),
                "width": desktop_size[0],
                "height": desktop_size[1],
                "bytes": desktop_output.stat().st_size,
                "allFramesAreKeyframes": desktop_all_intra,
                "probe": desktop_probe,
            },
            "mobile": {
                "path": str(mobile_output),
                "width": mobile_size[0],
                "height": mobile_size[1],
                "bytes": mobile_output.stat().st_size,
                "allFramesAreKeyframes": mobile_all_intra,
                "probe": mobile_probe,
            },
        },
    }
    timeline_path.parent.mkdir(parents=True, exist_ok=True)
    timeline_path.write_text(
        json.dumps(timeline, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    manifest_path = output / "compile.json"
    manifest_path.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    if not args.keep_frames:
        for directory in (raw_frames, preparation, cleaned_frames, post_encode_frames):
            if directory.is_dir():
                shutil.rmtree(directory)
        frames_root = output / "frames"
        if frames_root.is_dir() and not any(frames_root.iterdir()):
            frames_root.rmdir()
    print(f"编译完成：{manifest_path}", flush=True)
    return 0


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(
        description=(
            "按帧策略准备动作母版，并编译为桌面与移动端全关键帧视频；"
            "chroma 路线供 WebGL 实时抠色，baked 路线直接呈现烘焙场景"
        )
    )
    result.add_argument(
        "source",
        help="MiniMax 生成的动作母版 MP4（chroma 路线必须为均匀色键背景）",
    )
    result.add_argument("output_dir", help="新的构建目录")
    result.add_argument(
        "--background-owner",
        choices=("page", "video"),
        required=True,
        help=(
            "page：色键母版，编译前逐帧模拟运行时抠色并检查残留，供 WebGL 实时抠色；"
            "video：背景已烘焙进视频，不做抠色。必须显式传入，禁止静默回退绿幕"
        ),
    )
    result.add_argument(
        "--budget-report",
        required=True,
        help=(
            "motion_budget.py 生成的 JSON 报告；page 要求选择 chroma-video，"
            "video 要求选择 baked-video"
        ),
    )
    mode = result.add_mutually_exclusive_group()
    mode.add_argument("--loop", action="store_true", help="按闭环首帧裁掉尾部停顿")
    mode.add_argument("--end-reference", help="单向转场目标尾帧，用于裁掉尾部停顿")
    result.add_argument(
        "--frame-policy",
        choices=("native", "interpolate"),
        required=True,
        help="native 保留源帧；interpolate 补到更高目标帧率",
    )
    result.add_argument(
        "--fps",
        type=float,
        help="目标帧率；native 默认源帧率，interpolate 默认 48",
    )
    result.add_argument(
        "--timeline-output",
        required=True,
        help="编译生成的时间轴 JSON 路径，例如 build/timeline.json",
    )
    result.add_argument(
        "--segment",
        action="append",
        default=[],
        metavar="DESTINATION_STATE_ID=START:HOLD:END_EXCLUSIVE",
        help="按目标状态 ID 和帧准备后的源帧索引定义片段；可重复传入",
    )
    result.add_argument(
        "--initial-state-id",
        default="state-0",
        help="时间轴初始状态的稳定 ID，默认 state-0",
    )
    result.add_argument(
        "--playback-curve",
        choices=("constant", "edge-mid-edge"),
        default="constant",
    )
    result.add_argument("--playback-rate", type=float, default=1.0)
    result.add_argument("--edge-rate", type=float, default=1.6)
    result.add_argument("--mid-rate", type=float, default=1.0)
    result.add_argument(
        "--desktop-width",
        type=int,
        default=1920,
        help="桌面资源像素宽度，通常为最大 CSS 宽度 × DPR；默认 1920",
    )
    result.add_argument(
        "--mobile-width",
        type=int,
        default=1280,
        help="移动端资源像素宽度，通常为最大 CSS 宽度 × DPR；默认 1280",
    )
    result.add_argument("--desktop-crf", type=int, default=12)
    result.add_argument("--mobile-crf", type=int, default=14)
    result.add_argument("--seam-window", type=int, default=40)
    result.add_argument("--duplicate-threshold", type=float, default=0.003)
    result.add_argument("--contact-columns", type=int, default=8)
    result.add_argument(
        "--anchor",
        action="append",
        default=[],
        metavar="NAME=SOURCE_FRAME",
        help="记录清理前插帧序列中的语义锚点，可重复传入",
    )
    result.add_argument(
        "--poster-source-frame",
        type=int,
        default=0,
        help="静态降级图对应的清理前插帧索引；默认 0",
    )
    result.add_argument(
        "--allow-upscale",
        action="store_true",
        help="允许输出宽度超过母版；默认自动限制为母版宽度",
    )
    result.add_argument(
        "--keep-frames",
        action="store_true",
        help="保留帧准备和清理帧用于调试；默认成功后删除中间 PNG",
    )
    result.add_argument("--force", action="store_true")
    return result


if __name__ == "__main__":
    try:
        raise SystemExit(compile_motion(parser().parse_args()))
    except (
        FileNotFoundError,
        FileExistsError,
        RuntimeError,
        ValueError,
        subprocess.CalledProcessError,
    ) as error:
        print(f"错误：{error}", file=sys.stderr)
        raise SystemExit(1) from error
