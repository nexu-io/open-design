#!/usr/bin/env python3
"""补帧验收和网页动画资产目标体积压缩工具。"""

from __future__ import annotations

import argparse
import json
import math
import os
import shutil
import subprocess
import tempfile
from collections import Counter
from fractions import Fraction
from pathlib import Path
from typing import Any

import motion_pipeline
import motion_budget
from PIL import Image


MIB = 1024 * 1024


def positive_float(value: str) -> float:
    number = float(value)
    if number <= 0:
        raise argparse.ArgumentTypeError("必须大于 0")
    return number


def unit_float(value: str) -> float:
    number = float(value)
    if not 0 < number <= 1:
        raise argparse.ArgumentTypeError("必须位于 0 到 1 之间")
    return number


def run(command: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        command,
        check=True,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )


def ensure_output(path: Path, force: bool, directory: bool = False) -> None:
    if path.exists():
        occupied = path.is_file() or (path.is_dir() and any(path.iterdir()))
        if occupied and not force:
            raise SystemExit(f"输出已存在：{path}。确认后使用 --force。")
        if force:
            if path.is_dir():
                shutil.rmtree(path)
            else:
                path.unlink()
    if directory:
        path.mkdir(parents=True, exist_ok=True)
    else:
        path.parent.mkdir(parents=True, exist_ok=True)


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(value, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def size_mb(path: Path) -> float:
    return path.stat().st_size / MIB


def parse_rate(value: str | None) -> float:
    if not value or value == "0/0":
        return 0
    try:
        return float(Fraction(value))
    except (ValueError, ZeroDivisionError):
        return 0


def video_stream(probe: dict[str, Any]) -> dict[str, Any]:
    for stream in probe.get("streams", []):
        if stream.get("codec_type") == "video":
            return stream
    raise SystemExit("输入中没有视频流。")


def audio_stream(probe: dict[str, Any]) -> dict[str, Any] | None:
    for stream in probe.get("streams", []):
        if stream.get("codec_type") == "audio":
            return stream
    return None


def warning_counts(report: dict[str, Any]) -> dict[str, int]:
    return dict(Counter(item["type"] for item in report["warnings"]))


def artifact_warning_count(report: dict[str, Any]) -> int:
    artifact_types = {
        "blank",
        "canvas-size",
        "brightness-jump",
        "scale-jump",
        "center-jump",
    }
    return sum(
        1 for item in report["warnings"] if item["type"] in artifact_types
    )


def analysis_args() -> dict[str, float | int]:
    return {
        "alpha_threshold": 16,
        "duplicate_threshold": 0.004,
        "brightness_jump": 0.12,
        "scale_jump": 0.08,
        "center_jump": 0.08,
    }


def make_extract_args(
    source: Path,
    output: Path,
    fps: float,
    args: argparse.Namespace,
    interpolate: bool,
) -> argparse.Namespace:
    return argparse.Namespace(
        input=source,
        output=output,
        fps=fps,
        start=args.start,
        duration=args.duration,
        width=args.width,
        height=args.height,
        interpolate=interpolate,
        key=args.key,
        transparent_threshold=args.transparent_threshold,
        opaque_threshold=args.opaque_threshold,
        force=False,
    )


def command_interpolate(args: argparse.Namespace) -> None:
    source = args.input.expanduser().resolve()
    output = args.output.expanduser().resolve()
    if not source.is_file():
        raise SystemExit(f"输入视频不存在：{source}")
    ensure_output(output, args.force, directory=True)

    probe = motion_pipeline.probe_video(source)
    stream = video_stream(probe)
    source_fps = (
        parse_rate(stream.get("avg_frame_rate"))
        or parse_rate(stream.get("r_frame_rate"))
        or 24
    )
    if args.fps <= source_fps:
        raise SystemExit(
            f"目标帧率 {args.fps:g} 必须高于源帧率 {source_fps:g}。"
        )

    frames = output / "frames"
    qa = output / "qa"
    qa.mkdir(parents=True, exist_ok=True)
    interpolated_extract = motion_pipeline.extract_frames(
        make_extract_args(source, frames, args.fps, args, True)
    )
    thresholds = analysis_args()
    interpolated_report = motion_pipeline.analyze_directory(
        frames, **thresholds
    )
    motion_pipeline.write_json(
        qa / "analysis-interpolated.json", interpolated_report
    )
    motion_pipeline.create_contact_sheet(
        frames,
        qa / "contact-sheet-interpolated.jpg",
        args.contact_columns,
        args.thumb_width,
    )

    with tempfile.TemporaryDirectory(prefix="oil-motion-original-") as temp:
        original_frames = Path(temp) / "frames"
        original_extract = motion_pipeline.extract_frames(
            make_extract_args(
                source,
                original_frames,
                source_fps,
                args,
                False,
            )
        )
        original_report = motion_pipeline.analyze_directory(
            original_frames, **thresholds
        )
        motion_pipeline.create_contact_sheet(
            original_frames,
            qa / "contact-sheet-original.jpg",
            args.contact_columns,
            args.thumb_width,
        )

    original_artifacts = artifact_warning_count(original_report)
    interpolated_artifacts = artifact_warning_count(interpolated_report)
    original_rate = original_artifacts / max(1, original_report["frameCount"])
    interpolated_rate = interpolated_artifacts / max(
        1, interpolated_report["frameCount"]
    )
    passed = interpolated_rate <= original_rate + args.warning_rate_tolerance

    report = {
        "type": "motion-interpolation-report",
        "source": str(source),
        "sourceFps": source_fps,
        "targetFps": args.fps,
        "original": {
            "extraction": original_extract,
            "summary": original_report["summary"],
            "warningsByType": warning_counts(original_report),
            "artifactWarningRate": original_rate,
        },
        "interpolated": {
            "extraction": interpolated_extract,
            "summary": interpolated_report["summary"],
            "warningsByType": warning_counts(interpolated_report),
            "artifactWarningRate": interpolated_rate,
        },
        "verdict": {
            "passedAutomaticChecks": passed,
            "warningRateTolerance": args.warning_rate_tolerance,
            "manualReviewRequired": True,
            "note": (
                "自动检查只覆盖空帧、亮度、大小和中心跳变；"
                "仍需查看两张接触表确认重影、肢体扭曲和语义错误。"
            ),
        },
    }
    write_json(output / "interpolation-report.json", report)
    print(json.dumps(report["verdict"], ensure_ascii=False, indent=2))
    print(f"补帧序列：{frames}")
    print(f"对比报告：{output / 'interpolation-report.json'}")


def render_atlas_candidate(
    source: Path,
    directory: Path,
    columns: int | None,
    width: int,
    height: int,
    quality: int,
    max_texture: int,
) -> tuple[Path, dict[str, Any]]:
    output = directory / f"atlas-{width}x{height}-q{quality}.webp"
    manifest_path = output.with_suffix(".json")
    manifest = motion_pipeline.create_atlas(
        source,
        output,
        manifest_path,
        columns,
        width,
        height,
        quality,
        False,
        max_texture,
    )
    return output, manifest


def command_atlas(args: argparse.Namespace) -> None:
    source = args.input.expanduser().resolve()
    output = args.output.expanduser().resolve()
    if not source.is_dir() or not motion_pipeline.frame_files(source):
        raise SystemExit(f"找不到帧序列：{source}")
    if output.suffix.lower() != ".webp":
        raise SystemExit("图集输出必须使用 .webp。")
    ensure_output(output, args.force)
    report_path = (
        args.report.expanduser().resolve()
        if args.report
        else output.with_suffix(".optimize.json")
    )
    if report_path.exists() and not args.force:
        raise SystemExit(f"报告已存在：{report_path}。确认后使用 --force。")

    display_width, display_height = args.display
    required_width = math.ceil(display_width * args.dpr)
    required_height = math.ceil(display_height * args.dpr)
    if (
        args.cell_width < required_width
        or args.cell_height < required_height
    ):
        raise SystemExit(
            "清晰度阻断：初始单帧 "
            f"{args.cell_width}×{args.cell_height} px 低于展示所需 "
            f"{required_width}×{required_height} px。"
        )

    frames = motion_pipeline.frame_files(source)
    with Image.open(frames[0]) as first_frame:
        source_width, source_height = first_frame.size
    if source_width < required_width or source_height < required_height:
        raise SystemExit(
            "清晰度阻断：源帧 "
            f"{source_width}×{source_height} px 低于展示所需 "
            f"{required_width}×{required_height} px；禁止放大后交付。"
        )

    target_bytes = int(args.target_mb * MIB)
    trials: list[dict[str, Any]] = []
    chosen: dict[str, Any] | None = None
    best_fallback: dict[str, Any] | None = None
    frame_count = len(frames)
    clarity_scale = max(
        required_width / args.cell_width,
        required_height / args.cell_height,
    )
    minimum_scale = max(args.min_cell_scale, clarity_scale)

    required_columns = args.columns
    if required_columns is None:
        required_columns = max(
            1,
            math.ceil(
                math.sqrt(
                    frame_count
                    * (required_height / max(1, required_width))
                )
            ),
        )
    required_rows = math.ceil(frame_count / required_columns)
    if (
        required_columns * required_width > args.max_texture
        or required_rows * required_height > args.max_texture
    ):
        raise SystemExit(
            "清晰度阻断：满足实际展示尺寸时，单张图集至少为 "
            f"{required_columns * required_width}×"
            f"{required_rows * required_height} px，超过纹理上限 "
            f"{args.max_texture}。请重新运行 motion_budget.py，并执行其自动选择结果。"
        )

    with tempfile.TemporaryDirectory(prefix="oil-motion-atlas-") as temp:
        temp_path = Path(temp)
        scale = 1.0
        while scale + 1e-9 >= minimum_scale:
            width = max(required_width, round(args.cell_width * scale))
            height = max(required_height, round(args.cell_height * scale))
            columns = args.columns
            if columns is None:
                columns = max(
                    1,
                    math.ceil(
                        math.sqrt(frame_count * (height / max(1, width)))
                    ),
                )
            rows = math.ceil(frame_count / columns)
            if (
                columns * width > args.max_texture
                or rows * height > args.max_texture
            ):
                trials.append(
                    {
                        "cellWidth": width,
                        "cellHeight": height,
                        "scale": scale,
                        "targetMet": False,
                        "skipped": "texture-limit",
                        "atlasWidth": columns * width,
                        "atlasHeight": rows * height,
                    }
                )
                scale = round(scale - args.scale_step, 6)
                continue
            low = args.min_quality
            high = args.max_quality
            scale_best: dict[str, Any] | None = None

            while low <= high:
                quality = (low + high) // 2
                candidate, manifest = render_atlas_candidate(
                    source,
                    temp_path,
                    columns,
                    width,
                    height,
                    quality,
                    args.max_texture,
                )
                candidate_bytes = candidate.stat().st_size
                trial = {
                    "cellWidth": width,
                    "cellHeight": height,
                    "scale": scale,
                    "quality": quality,
                    "bytes": candidate_bytes,
                    "sizeMB": candidate_bytes / MIB,
                    "targetMet": candidate_bytes <= target_bytes,
                    "path": str(candidate),
                    "manifest": manifest,
                }
                trials.append(trial)
                if (
                    best_fallback is None
                    or trial["bytes"] < best_fallback["bytes"]
                ):
                    best_fallback = trial
                if candidate_bytes <= target_bytes:
                    scale_best = trial
                    low = quality + 1
                else:
                    high = quality - 1

            if scale_best is not None:
                chosen = scale_best
                break
            scale = round(scale - args.scale_step, 6)

        if chosen is None:
            chosen = best_fallback
        if chosen is None:
            raise SystemExit("没有生成任何图集候选。")

        shutil.copy2(chosen["path"], output)
        final_manifest = dict(chosen["manifest"])
        final_manifest["asset"] = output.name
        final_manifest["targetMB"] = args.target_mb
        final_manifest["targetMet"] = chosen["targetMet"]
        final_manifest["display"] = {
            "width": display_width,
            "height": display_height,
            "dpr": args.dpr,
        }
        final_manifest["requiredCell"] = {
            "width": required_width,
            "height": required_height,
        }
        final_manifest["clarityMet"] = (
            chosen["cellWidth"] >= required_width
            and chosen["cellHeight"] >= required_height
        )
        manifest_path = (
            args.manifest.expanduser().resolve()
            if args.manifest
            else output.with_suffix(".json")
        )
        write_json(manifest_path, final_manifest)

    report = {
        "type": "atlas-optimization-report",
        "source": str(source),
        "output": str(output),
        "targetMB": args.target_mb,
        "resultMB": size_mb(output),
        "targetMet": chosen["targetMet"],
        "clarityMet": True,
        "display": {
            "width": display_width,
            "height": display_height,
            "dpr": args.dpr,
        },
        "requiredCell": {
            "width": required_width,
            "height": required_height,
        },
        "sourceFrame": {
            "width": source_width,
            "height": source_height,
        },
        "selected": {
            key: chosen[key]
            for key in (
                "cellWidth",
                "cellHeight",
                "scale",
                "quality",
                "bytes",
            )
        },
        "trials": [
            {key: value for key, value in trial.items() if key not in {"path", "manifest"}}
            for trial in trials
        ],
    }
    write_json(report_path, report)
    print(json.dumps(report, ensure_ascii=False, indent=2))


def video_filters(args: argparse.Namespace) -> str | None:
    filters: list[str] = []
    if args.max_width and args.max_height:
        filters.append(
            "scale="
            f"'min(iw,{args.max_width})':'min(ih,{args.max_height})':"
            "force_original_aspect_ratio=decrease:"
            "force_divisible_by=2"
        )
    elif args.max_width:
        filters.append(f"scale='min(iw,{args.max_width})':-2")
    elif args.max_height:
        filters.append(f"scale=-2:'min(ih,{args.max_height})'")
    if args.fps:
        filters.append(f"fps={args.fps}")
    return ",".join(filters) or None


def encode_two_pass(
    source: Path,
    output: Path,
    bitrate_kbps: int,
    args: argparse.Namespace,
    passlog: Path,
) -> None:
    ffmpeg = motion_pipeline.require_tool("ffmpeg")
    extension = output.suffix.lower()
    if extension == ".mp4":
        codec = "libx264"
        preset_args = ["-preset", args.preset, "-pix_fmt", "yuv420p"]
        mux = "mp4"
        audio_args = (
            ["-c:a", "aac", "-b:a", f"{args.audio_kbps}k"]
            if args.keep_audio
            else ["-an"]
        )
        final_args = ["-movflags", "+faststart"]
    elif extension == ".webm":
        codec = "libvpx-vp9"
        preset_args = ["-deadline", "good", "-cpu-used", "2"]
        mux = "webm"
        audio_args = (
            ["-c:a", "libopus", "-b:a", f"{args.audio_kbps}k"]
            if args.keep_audio
            else ["-an"]
        )
        final_args = []
    else:
        raise SystemExit("视频输出只支持 .mp4 或 .webm。")

    common = [
        ffmpeg,
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-i",
        str(source),
    ]
    filters = video_filters(args)
    if filters:
        common.extend(["-vf", filters])
    video_args = [
        "-c:v",
        codec,
        "-b:v",
        f"{bitrate_kbps}k",
        *preset_args,
        "-passlogfile",
        str(passlog),
    ]
    run(
        [
            *common,
            *video_args,
            "-pass",
            "1",
            "-an",
            "-f",
            mux,
            os.devnull,
        ]
    )
    run(
        [
            *common,
            *video_args,
            "-pass",
            "2",
            *audio_args,
            *final_args,
            str(output),
        ]
    )


def command_video(args: argparse.Namespace) -> None:
    source = args.input.expanduser().resolve()
    output = args.output.expanduser().resolve()
    if not source.is_file():
        raise SystemExit(f"输入视频不存在：{source}")
    ensure_output(output, args.force)
    report_path = (
        args.report.expanduser().resolve()
        if args.report
        else output.with_suffix(".optimize.json")
    )
    if report_path.exists() and not args.force:
        raise SystemExit(f"报告已存在：{report_path}。确认后使用 --force。")

    probe = motion_pipeline.probe_video(source)
    stream = video_stream(probe)
    source_width = int(stream.get("width") or 0)
    source_height = int(stream.get("height") or 0)
    source_fps = (
        parse_rate(stream.get("avg_frame_rate"))
        or parse_rate(stream.get("r_frame_rate"))
        or 24
    )
    display_width, display_height = args.display
    required_width = math.ceil(display_width * args.dpr)
    required_height = math.ceil(display_height * args.dpr)
    if source_width < required_width or source_height < required_height:
        raise SystemExit(
            "清晰度阻断：源视频 "
            f"{source_width}×{source_height} px 低于展示所需 "
            f"{required_width}×{required_height} px；禁止放大后交付。"
        )
    args.max_width = args.max_width or required_width
    args.max_height = args.max_height or required_height
    if args.max_width < required_width or args.max_height < required_height:
        raise SystemExit(
            "清晰度阻断：视频输出上限不能低于展示所需 "
            f"{required_width}×{required_height} px。"
        )
    scale = min(
        1.0,
        args.max_width / source_width,
        args.max_height / source_height,
    )
    encoded_width = max(2, math.floor(source_width * scale / 2) * 2)
    encoded_height = max(2, math.floor(source_height * scale / 2) * 2)
    if encoded_width < required_width or encoded_height < required_height:
        raise SystemExit(
            "清晰度阻断：源视频比例放入当前输出框后只能得到 "
            f"{encoded_width}×{encoded_height} px，低于展示所需 "
            f"{required_width}×{required_height} px。请按实际内容比例填写 "
            "--display，或提供更高分辨率源视频。"
        )
    output_fps = args.fps or source_fps
    clarity_kbps = math.ceil(
        encoded_width
        * encoded_height
        * output_fps
        * args.min_bpp
        / 1000
    )
    quality_floor_kbps = max(args.min_video_kbps, clarity_kbps)
    duration = float(probe.get("format", {}).get("duration") or 0)
    if duration <= 0:
        raise SystemExit("无法读取视频时长。")
    has_audio = audio_stream(probe) is not None
    audio_kbps = args.audio_kbps if args.keep_audio and has_audio else 0
    target_bits = args.target_mb * MIB * 8 * 0.97
    bitrate_kbps = max(
        quality_floor_kbps,
        round(target_bits / duration / 1000 - audio_kbps),
    )
    attempts: list[dict[str, Any]] = []

    with tempfile.TemporaryDirectory(prefix="oil-motion-video-") as temp:
        passlog = Path(temp) / "pass"
        for attempt in range(1, 4):
            encode_two_pass(source, output, bitrate_kbps, args, passlog)
            actual_mb = size_mb(output)
            attempts.append(
                {
                    "attempt": attempt,
                    "videoKbps": bitrate_kbps,
                    "sizeMB": actual_mb,
                }
            )
            if actual_mb <= args.target_mb * 1.01:
                break
            ratio = args.target_mb / actual_mb
            bitrate_kbps = max(
                quality_floor_kbps,
                math.floor(bitrate_kbps * ratio * 0.98),
            )

    output_probe = motion_pipeline.probe_video(output)
    output_stream = video_stream(output_probe)
    output_width = int(output_stream.get("width") or 0)
    output_height = int(output_stream.get("height") or 0)
    result_mb = size_mb(output)
    clarity_met = (
        output_width >= required_width
        and output_height >= required_height
    )
    report = {
        "type": "video-optimization-report",
        "source": str(source),
        "output": str(output),
        "targetMB": args.target_mb,
        "resultMB": result_mb,
        "targetMet": result_mb <= args.target_mb * 1.01,
        "clarityMet": clarity_met,
        "display": {
            "width": display_width,
            "height": display_height,
            "dpr": args.dpr,
        },
        "requiredVideo": {
            "width": required_width,
            "height": required_height,
        },
        "encodedVideo": {
            "width": output_width,
            "height": output_height,
            "fps": output_fps,
        },
        "minBitsPerPixelPerFrame": args.min_bpp,
        "qualityFloorKbps": quality_floor_kbps,
        "sourceMB": size_mb(source),
        "compressionRatio": result_mb / max(size_mb(source), 1e-9),
        "audioKept": bool(args.keep_audio and has_audio),
        "attempts": attempts,
        "sourceProbe": probe,
        "outputProbe": output_probe,
    }
    write_json(report_path, report)
    print(
        json.dumps(
            {
                key: report[key]
                for key in (
                    "targetMB",
                    "resultMB",
                    "targetMet",
                    "clarityMet",
                    "sourceMB",
                    "compressionRatio",
                )
            },
            ensure_ascii=False,
            indent=2,
        )
    )


def add_extract_options(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--start", type=float)
    parser.add_argument("--duration", type=positive_float)
    parser.add_argument("--width", type=int)
    parser.add_argument("--height", type=int)
    parser.add_argument(
        "--key",
        default="none",
        help="'auto'、'none' 或十六进制色键。",
    )
    parser.add_argument("--transparent-threshold", type=float, default=12)
    parser.add_argument("--opaque-threshold", type=float, default=220)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)

    interpolate = subparsers.add_parser(
        "interpolate",
        help="光流补帧，并生成原始/补帧异常对比。",
    )
    interpolate.add_argument("input", type=Path)
    interpolate.add_argument("output", type=Path)
    interpolate.add_argument("--fps", type=positive_float, required=True)
    add_extract_options(interpolate)
    interpolate.add_argument("--warning-rate-tolerance", type=float, default=0.02)
    interpolate.add_argument("--contact-columns", type=int, default=8)
    interpolate.add_argument("--thumb-width", type=int, default=160)
    interpolate.add_argument("--force", action="store_true")
    interpolate.set_defaults(function=command_interpolate)

    atlas = subparsers.add_parser(
        "atlas",
        help="按目标体积自动选择图集尺寸和 WebP 质量。",
    )
    atlas.add_argument("input", type=Path)
    atlas.add_argument("--output", type=Path, required=True)
    atlas.add_argument("--target-mb", type=positive_float, required=True)
    atlas.add_argument(
        "--display",
        type=motion_budget.parse_size,
        required=True,
        help="最大实际 CSS 展示尺寸，如 360x360。",
    )
    atlas.add_argument("--dpr", type=positive_float, default=2.0)
    atlas.add_argument("--cell-width", type=int, required=True)
    atlas.add_argument("--cell-height", type=int, required=True)
    atlas.add_argument("--columns", type=int)
    atlas.add_argument("--min-quality", type=int, default=45)
    atlas.add_argument("--max-quality", type=int, default=92)
    atlas.add_argument("--min-cell-scale", type=unit_float, default=0.6)
    atlas.add_argument("--scale-step", type=positive_float, default=0.1)
    atlas.add_argument("--max-texture", type=int, default=4096)
    atlas.add_argument("--manifest", type=Path)
    atlas.add_argument("--report", type=Path)
    atlas.add_argument("--force", action="store_true")
    atlas.set_defaults(function=command_atlas)

    video = subparsers.add_parser(
        "video",
        help="按目标体积两遍编码 MP4/WebM。",
    )
    video.add_argument("input", type=Path)
    video.add_argument("--output", type=Path, required=True)
    video.add_argument("--target-mb", type=positive_float, required=True)
    video.add_argument(
        "--display",
        type=motion_budget.parse_size,
        required=True,
        help="最大实际 CSS 展示尺寸，如 360x360。",
    )
    video.add_argument("--dpr", type=positive_float, default=2.0)
    video.add_argument("--max-width", type=int)
    video.add_argument("--max-height", type=int)
    video.add_argument("--fps", type=positive_float)
    video.add_argument("--keep-audio", action="store_true")
    video.add_argument("--audio-kbps", type=int, default=96)
    video.add_argument("--min-video-kbps", type=int, default=80)
    video.add_argument(
        "--min-bpp",
        type=positive_float,
        default=0.08,
        help="每像素每帧最低码率；目标体积不能突破此清晰度底线。",
    )
    video.add_argument(
        "--preset",
        choices=("medium", "slow", "slower"),
        default="slow",
    )
    video.add_argument("--report", type=Path)
    video.add_argument("--force", action="store_true")
    video.set_defaults(function=command_video)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if hasattr(args, "width") and args.width is not None and args.width <= 0:
        raise SystemExit("--width 必须大于 0。")
    if hasattr(args, "height") and args.height is not None and args.height <= 0:
        raise SystemExit("--height 必须大于 0。")
    if hasattr(args, "min_quality") and not (
        0 <= args.min_quality <= args.max_quality <= 100
    ):
        raise SystemExit("质量范围必须满足 0 <= min <= max <= 100。")
    if hasattr(args, "scale_step") and args.scale_step > 1:
        raise SystemExit("--scale-step 不能大于 1。")
    args.function(args)


if __name__ == "__main__":
    main()
