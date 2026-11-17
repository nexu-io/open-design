#!/usr/bin/env python3
"""Deterministic media pipeline for interactive motion assets.

Commands:
  probe      Inspect video metadata with ffprobe.
  extract    Extract ordered frames and optionally remove a uniform key color.
  normalize  Correct small scale/anchor drift in fixed-subject transparent frames.
  analyze    Detect blank, duplicate, scale, center, and brightness anomalies.
  contact    Build a numbered checkerboard contact sheet.
  atlas      Pack ordered frames into a PNG/WebP atlas and JSON manifest.
  build      Run extract, optional normalize, analyze, contact, and atlas.
"""

from __future__ import annotations

import argparse
import json
import math
import re
import shutil
import subprocess
import tempfile
from pathlib import Path
from statistics import median
from typing import Any, Iterable

from PIL import Image, ImageChops, ImageDraw, ImageFont, ImageStat


IMAGE_SUFFIXES = {".png", ".webp", ".jpg", ".jpeg"}
ALPHA_NOISE_FLOOR = 8
KEY_DOMINANCE_THRESHOLD = 16


def natural_key(path: Path) -> list[Any]:
    return [
        int(part) if part.isdigit() else part.lower()
        for part in re.split(r"(\d+)", path.name)
    ]


def frame_files(path: Path) -> list[Path]:
    return sorted(
        (
            item
            for item in path.iterdir()
            if item.is_file() and item.suffix.lower() in IMAGE_SUFFIXES
        ),
        key=natural_key,
    )


def require_tool(name: str) -> str:
    resolved = shutil.which(name)
    if not resolved:
        raise SystemExit(f"Required tool not found: {name}")
    return resolved


def run(command: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        command,
        check=True,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(value, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def prepare_output_directory(path: Path, force: bool) -> None:
    if path.exists() and any(path.iterdir()):
        if not force:
            raise SystemExit(
                f"Output directory is not empty: {path}. Use --force only for a disposable build target."
            )
        shutil.rmtree(path)
    path.mkdir(parents=True, exist_ok=True)


def parse_hex_color(value: str) -> tuple[int, int, int]:
    normalized = value.strip().lower().replace("0x", "").lstrip("#")
    if len(normalized) == 3:
        normalized = "".join(character * 2 for character in normalized)
    if len(normalized) != 6 or any(
        character not in "0123456789abcdef" for character in normalized
    ):
        raise SystemExit(f"Invalid key color: {value}")
    return tuple(
        int(normalized[index : index + 2], 16) for index in (0, 2, 4)
    )


def clamp_byte(value: float) -> int:
    return max(0, min(255, int(round(value))))


def color_distance(
    color: tuple[int, int, int],
    key: tuple[int, int, int],
) -> int:
    return max(abs(color[index] - key[index]) for index in range(3))


def smoothstep(value: float) -> float:
    normalized = max(0.0, min(1.0, value))
    return normalized * normalized * (3.0 - 2.0 * normalized)


def distance_alpha(
    distance: int,
    transparent_threshold: float,
    opaque_threshold: float,
) -> int:
    if distance <= transparent_threshold:
        return 0
    if distance >= opaque_threshold:
        return 255
    ratio = (distance - transparent_threshold) / (
        opaque_threshold - transparent_threshold
    )
    return clamp_byte(255 * smoothstep(ratio))


def key_channels(key: tuple[int, int, int]) -> list[int]:
    strongest = max(key)
    if strongest < 128:
        return []
    return [
        index
        for index, value in enumerate(key)
        if value >= strongest - 16 and value >= 128
    ]


def key_dominance(
    color: tuple[int, int, int],
    key: tuple[int, int, int],
) -> int:
    selected = key_channels(key)
    if not selected:
        return 0
    other = [index for index in range(3) if index not in selected]
    key_strength = min(color[index] for index in selected)
    other_strength = max((color[index] for index in other), default=0)
    return key_strength - other_strength


def dominance_alpha(
    color: tuple[int, int, int],
    key: tuple[int, int, int],
) -> int:
    selected = key_channels(key)
    if not selected:
        return 255
    other = [index for index in range(3) if index not in selected]
    key_strength = min(color[index] for index in selected)
    other_strength = max((color[index] for index in other), default=0)
    dominance = key_strength - other_strength
    if dominance <= 0:
        return 255
    denominator = max(1, max(key) - other_strength)
    return clamp_byte(255 * (1 - min(1.0, dominance / denominator)))


def looks_key_colored(
    color: tuple[int, int, int],
    key: tuple[int, int, int],
    distance: int,
) -> bool:
    if distance <= 32:
        return True
    if not key_channels(key):
        return True
    return key_dominance(color, key) >= KEY_DOMINANCE_THRESHOLD


def despill(
    color: tuple[int, int, int],
    key: tuple[int, int, int],
    alpha: int,
) -> tuple[int, int, int]:
    if alpha >= 252:
        return color
    selected = key_channels(key)
    other = [index for index in range(3) if index not in selected]
    if not selected or not other:
        return color
    channels = list(color)
    neutral_edge = max(channels[index] for index in other)
    for index in selected:
        channels[index] = min(channels[index], neutral_edge)
    return channels[0], channels[1], channels[2]


def sample_border_key(image: Image.Image) -> tuple[int, int, int]:
    rgba = image.convert("RGBA")
    pixels = rgba.load()
    width, height = rgba.size
    band = max(1, min(width, height, 6))
    step = max(1, min(width, height) // 256)
    samples: list[tuple[int, int, int]] = []
    for x in range(0, width, step):
        for offset in range(band):
            samples.append(pixels[x, offset][:3])
            samples.append(pixels[x, height - 1 - offset][:3])
    for y in range(0, height, step):
        for offset in range(band):
            samples.append(pixels[offset, y][:3])
            samples.append(pixels[width - 1 - offset, y][:3])
    return tuple(
        int(round(median(sample[channel] for sample in samples)))
        for channel in range(3)
    )


def remove_key(
    source: Path,
    output: Path,
    key: tuple[int, int, int],
    transparent_threshold: float,
    opaque_threshold: float,
) -> dict[str, int]:
    image = Image.open(source).convert("RGBA")
    pixels = image.load()
    transparent = 0
    partial = 0
    for y in range(image.height):
        for x in range(image.width):
            red, green, blue, source_alpha = pixels[x, y]
            color = (red, green, blue)
            distance = color_distance(color, key)
            key_like = looks_key_colored(color, key, distance)
            alpha = distance_alpha(
                distance,
                transparent_threshold,
                opaque_threshold,
            )
            if key_like:
                alpha = min(alpha, dominance_alpha(color, key))
            alpha = clamp_byte(alpha * (source_alpha / 255))
            if alpha <= ALPHA_NOISE_FLOOR:
                pixels[x, y] = (0, 0, 0, 0)
                transparent += 1
                continue
            if key_like:
                red, green, blue = despill(color, key, alpha)
            pixels[x, y] = (red, green, blue, alpha)
            if alpha < 255:
                partial += 1
    output.parent.mkdir(parents=True, exist_ok=True)
    image.save(output)
    return {"transparentPixels": transparent, "partialPixels": partial}


def probe_video(path: Path) -> dict[str, Any]:
    ffprobe = require_tool("ffprobe")
    result = run(
        [
            ffprobe,
            "-v",
            "error",
            "-show_entries",
            "format=duration,size,bit_rate:stream=index,codec_type,codec_name,width,height,pix_fmt,r_frame_rate,avg_frame_rate,nb_frames",
            "-of",
            "json",
            str(path),
        ]
    )
    return json.loads(result.stdout)


def command_probe(args: argparse.Namespace) -> None:
    source = args.input.expanduser().resolve()
    if not source.is_file():
        raise SystemExit(f"Input video not found: {source}")
    data = probe_video(source)
    if args.output:
        write_json(args.output.expanduser().resolve(), data)
    print(json.dumps(data, ensure_ascii=False, indent=2))


def build_video_filter(args: argparse.Namespace) -> str:
    filters: list[str] = []
    if args.interpolate:
        filters.append(
            "minterpolate="
            f"fps={args.fps}:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1"
        )
    else:
        filters.append(f"fps={args.fps}")
    if args.width and args.height:
        filters.append(
            f"scale={args.width}:{args.height}:force_original_aspect_ratio=decrease"
        )
        filters.append(
            f"pad={args.width}:{args.height}:(ow-iw)/2:(oh-ih)/2:color=0x00FF00"
        )
    elif args.width:
        filters.append(f"scale={args.width}:-2")
    elif args.height:
        filters.append(f"scale=-2:{args.height}")
    return ",".join(filters)


def extract_frames(args: argparse.Namespace) -> dict[str, Any]:
    source = args.input.expanduser().resolve()
    output = args.output.expanduser().resolve()
    if not source.is_file():
        raise SystemExit(f"Input video not found: {source}")
    if not 0 <= args.transparent_threshold < args.opaque_threshold <= 255:
        raise SystemExit(
            "Thresholds must satisfy 0 <= transparent < opaque <= 255"
        )
    prepare_output_directory(output, args.force)
    ffmpeg = require_tool("ffmpeg")
    key_enabled = args.key.lower() != "none"

    with tempfile.TemporaryDirectory(prefix="oil-motion-raw-") as temp:
        raw = Path(temp) if key_enabled else output
        command = [ffmpeg, "-hide_banner", "-loglevel", "error"]
        if args.start is not None:
            command.extend(["-ss", str(args.start)])
        command.extend(["-i", str(source)])
        if args.duration is not None:
            command.extend(["-t", str(args.duration)])
        command.extend(
            [
                "-an",
                "-vf",
                build_video_filter(args),
                "-fps_mode",
                "passthrough",
                str(raw / "frame_%05d.png"),
            ]
        )
        run(command)
        raw_frames = frame_files(raw)
        if not raw_frames:
            raise SystemExit("ffmpeg produced no frames")

        key: tuple[int, int, int] | None = None
        cutout_stats: dict[str, int] = {
            "transparentPixels": 0,
            "partialPixels": 0,
        }
        if key_enabled:
            with Image.open(raw_frames[0]) as first:
                key = (
                    sample_border_key(first)
                    if args.key.lower() == "auto"
                    else parse_hex_color(args.key)
                )
            for index, frame in enumerate(raw_frames, start=1):
                stats = remove_key(
                    frame,
                    output / f"frame_{index:05d}.png",
                    key,
                    args.transparent_threshold,
                    args.opaque_threshold,
                )
                cutout_stats["transparentPixels"] += stats[
                    "transparentPixels"
                ]
                cutout_stats["partialPixels"] += stats["partialPixels"]

    frames = frame_files(output)
    first_image = Image.open(frames[0])
    width, height = first_image.size
    first_image.close()
    manifest = {
        "source": str(source),
        "frameCount": len(frames),
        "fps": args.fps,
        "width": width,
        "height": height,
        "interpolated": bool(args.interpolate),
        "key": (
            None
            if key is None
            else f"#{key[0]:02X}{key[1]:02X}{key[2]:02X}"
        ),
        "transparentThreshold": (
            args.transparent_threshold if key is not None else None
        ),
        "opaqueThreshold": args.opaque_threshold if key is not None else None,
        "cutout": cutout_stats if key is not None else None,
    }
    write_json(output / "extract.json", manifest)
    return manifest


def command_extract(args: argparse.Namespace) -> None:
    manifest = extract_frames(args)
    print(json.dumps(manifest, ensure_ascii=False, indent=2))


def alpha_bbox(image: Image.Image, threshold: int = 16) -> tuple[int, int, int, int] | None:
    alpha = image.convert("RGBA").getchannel("A")
    mask = alpha.point(lambda value: 255 if value >= threshold else 0)
    return mask.getbbox()


def normalize_frames(args: argparse.Namespace) -> dict[str, Any]:
    source = args.input.expanduser().resolve()
    output = args.output.expanduser().resolve()
    if not source.is_dir():
        raise SystemExit(f"Frame directory not found: {source}")
    frames = frame_files(source)
    if not frames:
        raise SystemExit(f"No frames found: {source}")
    prepare_output_directory(output, args.force)

    measurements: list[dict[str, float | tuple[int, int, int, int] | Path]] = []
    canvas_size: tuple[int, int] | None = None
    for path in frames:
        with Image.open(path) as opened:
            image = opened.convert("RGBA")
        canvas_size = canvas_size or image.size
        if image.size != canvas_size:
            raise SystemExit("All frames must share one canvas size")
        bbox = alpha_bbox(image, args.alpha_threshold)
        if bbox is None:
            raise SystemExit(f"Cannot normalize blank frame: {path}")
        left, top, right, bottom = bbox
        measurements.append(
            {
                "path": path,
                "bbox": bbox,
                "width": right - left,
                "height": bottom - top,
                "centerX": (left + right) / 2,
                "centerY": (top + bottom) / 2,
                "bottom": bottom,
            }
        )

    target_height = median(float(item["height"]) for item in measurements)
    target_center_x = median(
        float(item["centerX"]) for item in measurements
    )
    target_center_y = median(
        float(item["centerY"]) for item in measurements
    )
    target_bottom = median(float(item["bottom"]) for item in measurements)
    assert canvas_size is not None

    applied_scales: list[float] = []
    for index, item in enumerate(measurements, start=1):
        path = item["path"]
        bbox = item["bbox"]
        assert isinstance(path, Path)
        assert isinstance(bbox, tuple)
        with Image.open(path) as opened:
            image = opened.convert("RGBA")
        crop = image.crop(bbox)
        raw_scale = target_height / max(1.0, float(item["height"]))
        scale = max(
            1 - args.max_scale_change,
            min(1 + args.max_scale_change, raw_scale),
        )
        applied_scales.append(scale)
        resized = crop.resize(
            (
                max(1, round(crop.width * scale)),
                max(1, round(crop.height * scale)),
            ),
            Image.Resampling.LANCZOS,
        )
        if args.anchor == "bottom":
            left = round(target_center_x - resized.width / 2)
            top = round(target_bottom - resized.height)
        else:
            left = round(target_center_x - resized.width / 2)
            top = round(target_center_y - resized.height / 2)
        canvas = Image.new("RGBA", canvas_size, (0, 0, 0, 0))
        canvas.paste(resized, (left, top), resized)
        canvas.save(output / f"frame_{index:05d}.png")

    manifest = {
        "source": str(source),
        "frameCount": len(frames),
        "anchor": args.anchor,
        "targetHeight": target_height,
        "targetCenterX": target_center_x,
        "targetCenterY": target_center_y,
        "targetBottom": target_bottom,
        "maxScaleChange": args.max_scale_change,
        "minAppliedScale": min(applied_scales),
        "maxAppliedScale": max(applied_scales),
    }
    write_json(output / "normalize.json", manifest)
    return manifest


def command_normalize(args: argparse.Namespace) -> None:
    manifest = normalize_frames(args)
    print(json.dumps(manifest, ensure_ascii=False, indent=2))


def flatten_for_difference(image: Image.Image, size: int = 96) -> Image.Image:
    rgba = image.convert("RGBA")
    background = Image.new("RGBA", rgba.size, (255, 255, 255, 255))
    background.alpha_composite(rgba)
    return background.convert("RGB").resize(
        (size, size),
        Image.Resampling.BILINEAR,
    )


def visible_luminance(image: Image.Image) -> float:
    rgba = image.convert("RGBA")
    gray = rgba.convert("L")
    alpha = rgba.getchannel("A")
    if not alpha.getbbox():
        return 0.0
    return float(ImageStat.Stat(gray, alpha).mean[0]) / 255


def mean_difference(first: Image.Image, second: Image.Image) -> float:
    difference = ImageChops.difference(first, second)
    means = ImageStat.Stat(difference).mean
    return float(sum(means) / len(means)) / 255


def analyze_directory(
    source: Path,
    alpha_threshold: int,
    duplicate_threshold: float,
    brightness_jump: float,
    scale_jump: float,
    center_jump: float,
) -> dict[str, Any]:
    frames = frame_files(source)
    if not frames:
        raise SystemExit(f"No frames found: {source}")
    frame_data: list[dict[str, Any]] = []
    warnings: list[dict[str, Any]] = []
    previous_flat: Image.Image | None = None
    previous: dict[str, Any] | None = None
    canvas_size: tuple[int, int] | None = None

    for index, path in enumerate(frames):
        with Image.open(path) as opened:
            image = opened.convert("RGBA")
        canvas_size = canvas_size or image.size
        if image.size != canvas_size:
            warnings.append(
                {
                    "frame": index,
                    "type": "canvas-size",
                    "message": f"{path.name} has size {image.size}, expected {canvas_size}",
                }
            )
        bbox = alpha_bbox(image, alpha_threshold)
        item: dict[str, Any] = {
            "index": index,
            "file": path.name,
            "width": image.width,
            "height": image.height,
            "bbox": list(bbox) if bbox else None,
            "luminance": visible_luminance(image),
        }
        if bbox:
            left, top, right, bottom = bbox
            item.update(
                {
                    "subjectWidthRatio": (right - left) / image.width,
                    "subjectHeightRatio": (bottom - top) / image.height,
                    "centerX": ((left + right) / 2) / image.width,
                    "centerY": ((top + bottom) / 2) / image.height,
                    "occupancy": (
                        ((right - left) * (bottom - top))
                        / (image.width * image.height)
                    ),
                }
            )
        else:
            warnings.append(
                {
                    "frame": index,
                    "type": "blank",
                    "message": f"{path.name} has no visible alpha content",
                }
            )

        flat = flatten_for_difference(image)
        if previous_flat is not None:
            difference = mean_difference(previous_flat, flat)
            item["differenceFromPrevious"] = difference
            if difference < duplicate_threshold:
                warnings.append(
                    {
                        "frame": index,
                        "type": "near-duplicate",
                        "value": difference,
                        "message": f"{path.name} is very similar to its previous frame",
                    }
                )
        if previous and bbox and previous.get("bbox"):
            luminance_delta = abs(item["luminance"] - previous["luminance"])
            scale_delta = abs(
                item["subjectHeightRatio"] - previous["subjectHeightRatio"]
            )
            center_delta = math.hypot(
                item["centerX"] - previous["centerX"],
                item["centerY"] - previous["centerY"],
            )
            if luminance_delta > brightness_jump:
                warnings.append(
                    {
                        "frame": index,
                        "type": "brightness-jump",
                        "value": luminance_delta,
                        "message": f"{path.name} changes brightness abruptly",
                    }
                )
            if scale_delta > scale_jump:
                warnings.append(
                    {
                        "frame": index,
                        "type": "scale-jump",
                        "value": scale_delta,
                        "message": f"{path.name} changes subject scale abruptly",
                    }
                )
            if center_delta > center_jump:
                warnings.append(
                    {
                        "frame": index,
                        "type": "center-jump",
                        "value": center_delta,
                        "message": f"{path.name} moves the subject center abruptly",
                    }
                )
        frame_data.append(item)
        previous_flat = flat
        previous = item

    subject_heights = [
        item["subjectHeightRatio"]
        for item in frame_data
        if "subjectHeightRatio" in item
    ]
    centers_x = [item["centerX"] for item in frame_data if "centerX" in item]
    centers_y = [item["centerY"] for item in frame_data if "centerY" in item]
    differences = [
        item["differenceFromPrevious"]
        for item in frame_data
        if "differenceFromPrevious" in item
    ]
    return {
        "source": str(source),
        "frameCount": len(frames),
        "canvas": list(canvas_size) if canvas_size else None,
        "summary": {
            "medianSubjectHeightRatio": (
                median(subject_heights) if subject_heights else None
            ),
            "subjectHeightRange": (
                [min(subject_heights), max(subject_heights)]
                if subject_heights
                else None
            ),
            "centerXRange": (
                [min(centers_x), max(centers_x)] if centers_x else None
            ),
            "centerYRange": (
                [min(centers_y), max(centers_y)] if centers_y else None
            ),
            "medianFrameDifference": (
                median(differences) if differences else None
            ),
            "warningCount": len(warnings),
        },
        "warnings": warnings,
        "frames": frame_data,
    }


def command_analyze(args: argparse.Namespace) -> None:
    source = args.input.expanduser().resolve()
    if not source.is_dir():
        raise SystemExit(f"Frame directory not found: {source}")
    report = analyze_directory(
        source,
        args.alpha_threshold,
        args.duplicate_threshold,
        args.brightness_jump,
        args.scale_jump,
        args.center_jump,
    )
    if args.output:
        write_json(args.output.expanduser().resolve(), report)
    print(json.dumps(report["summary"], ensure_ascii=False, indent=2))


def checkerboard(size: tuple[int, int], square: int = 12) -> Image.Image:
    image = Image.new("RGB", size, "#f7f7f7")
    draw = ImageDraw.Draw(image)
    for y in range(0, size[1], square):
        for x in range(0, size[0], square):
            if (x // square + y // square) % 2:
                draw.rectangle(
                    (x, y, x + square - 1, y + square - 1),
                    fill="#dfdfdf",
                )
    return image


def create_contact_sheet(
    source: Path,
    output: Path,
    columns: int,
    thumb_width: int,
) -> dict[str, Any]:
    frames = frame_files(source)
    if not frames:
        raise SystemExit(f"No frames found: {source}")
    with Image.open(frames[0]) as first:
        ratio = first.height / first.width
    thumb_height = max(1, round(thumb_width * ratio))
    label_height = 22
    rows = math.ceil(len(frames) / columns)
    sheet = Image.new(
        "RGB",
        (columns * thumb_width, rows * (thumb_height + label_height)),
        "#ffffff",
    )
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.load_default()
    for index, path in enumerate(frames):
        with Image.open(path) as opened:
            frame = opened.convert("RGBA")
        frame.thumbnail((thumb_width, thumb_height), Image.Resampling.LANCZOS)
        background = checkerboard((thumb_width, thumb_height))
        left = (thumb_width - frame.width) // 2
        top = (thumb_height - frame.height) // 2
        background.paste(frame, (left, top), frame)
        column = index % columns
        row = index // columns
        x = column * thumb_width
        y = row * (thumb_height + label_height)
        sheet.paste(background, (x, y))
        draw.rectangle(
            (x, y + thumb_height, x + thumb_width - 1, y + thumb_height + label_height - 1),
            fill="#111111",
        )
        draw.text(
            (x + 5, y + thumb_height + 5),
            f"{index:04d}",
            fill="#ffffff",
            font=font,
        )
    output.parent.mkdir(parents=True, exist_ok=True)
    save_kwargs: dict[str, Any] = {}
    if output.suffix.lower() in {".jpg", ".jpeg"}:
        save_kwargs = {"quality": 88, "optimize": True}
    sheet.save(output, **save_kwargs)
    return {
        "output": str(output),
        "frameCount": len(frames),
        "columns": columns,
        "rows": rows,
        "thumbWidth": thumb_width,
        "thumbHeight": thumb_height,
    }


def command_contact(args: argparse.Namespace) -> None:
    source = args.input.expanduser().resolve()
    if not source.is_dir():
        raise SystemExit(f"Frame directory not found: {source}")
    result = create_contact_sheet(
        source,
        args.output.expanduser().resolve(),
        args.columns,
        args.thumb_width,
    )
    print(json.dumps(result, ensure_ascii=False, indent=2))


def fit_frame_to_cell(
    image: Image.Image,
    cell_width: int,
    cell_height: int,
) -> Image.Image:
    frame = image.convert("RGBA")
    frame.thumbnail((cell_width, cell_height), Image.Resampling.LANCZOS)
    cell = Image.new("RGBA", (cell_width, cell_height), (0, 0, 0, 0))
    left = (cell_width - frame.width) // 2
    top = (cell_height - frame.height) // 2
    cell.alpha_composite(frame, (left, top))
    return cell


def create_atlas(
    source: Path,
    output: Path,
    manifest_path: Path,
    columns: int | None,
    cell_width: int,
    cell_height: int,
    quality: int,
    lossless: bool,
    max_texture: int,
) -> dict[str, Any]:
    frames = frame_files(source)
    if not frames:
        raise SystemExit(f"No frames found: {source}")
    if columns is None:
        columns = max(
            1,
            math.ceil(
                math.sqrt(
                    len(frames) * (cell_height / max(1, cell_width))
                )
            ),
        )
    rows = math.ceil(len(frames) / columns)
    atlas_width = columns * cell_width
    atlas_height = rows * cell_height
    if atlas_width > max_texture or atlas_height > max_texture:
        raise SystemExit(
            f"Atlas would be {atlas_width}x{atlas_height}, exceeding --max-texture {max_texture}. "
            "Reduce the cell size, split the sequence, or use video/sequence-frame playback."
        )
    atlas = Image.new(
        "RGBA",
        (atlas_width, atlas_height),
        (0, 0, 0, 0),
    )
    for index, path in enumerate(frames):
        with Image.open(path) as opened:
            cell = fit_frame_to_cell(opened, cell_width, cell_height)
        atlas.alpha_composite(
            cell,
            (
                (index % columns) * cell_width,
                (index // columns) * cell_height,
            ),
        )
    output.parent.mkdir(parents=True, exist_ok=True)
    if output.suffix.lower() == ".webp":
        atlas.save(
            output,
            format="WEBP",
            quality=quality,
            lossless=lossless,
            method=6,
        )
    elif output.suffix.lower() == ".png":
        atlas.save(output, optimize=True)
    else:
        raise SystemExit("Atlas output must end in .webp or .png")
    manifest = {
        "version": 1,
        "type": "sprite-atlas",
        "asset": output.name,
        "frameCount": len(frames),
        "columns": columns,
        "rows": rows,
        "cellWidth": cell_width,
        "cellHeight": cell_height,
        "atlasWidth": atlas_width,
        "atlasHeight": atlas_height,
        "quality": quality if output.suffix.lower() == ".webp" else None,
        "lossless": lossless if output.suffix.lower() == ".webp" else True,
        "files": [path.name for path in frames],
    }
    write_json(manifest_path, manifest)
    return manifest


def command_atlas(args: argparse.Namespace) -> None:
    source = args.input.expanduser().resolve()
    if not source.is_dir():
        raise SystemExit(f"Frame directory not found: {source}")
    manifest = create_atlas(
        source,
        args.output.expanduser().resolve(),
        args.manifest.expanduser().resolve(),
        args.columns,
        args.cell_width,
        args.cell_height,
        args.quality,
        args.lossless,
        args.max_texture,
    )
    print(json.dumps(manifest, ensure_ascii=False, indent=2))


def command_build(args: argparse.Namespace) -> None:
    work = args.output.expanduser().resolve()
    prepare_output_directory(work, args.force)
    raw_frames = work / "frames" / ("raw" if args.normalize else "final")
    final_frames = work / "frames" / "final"
    raw_frames.parent.mkdir(parents=True, exist_ok=True)

    extract_args = argparse.Namespace(
        input=args.input,
        output=raw_frames,
        fps=args.fps,
        start=args.start,
        duration=args.duration,
        width=args.width,
        height=args.height,
        interpolate=args.interpolate,
        key=args.key,
        transparent_threshold=args.transparent_threshold,
        opaque_threshold=args.opaque_threshold,
        force=False,
    )
    extraction = extract_frames(extract_args)

    normalization = None
    if args.normalize:
        normalization = normalize_frames(
            argparse.Namespace(
                input=raw_frames,
                output=final_frames,
                anchor=args.anchor,
                max_scale_change=args.max_scale_change,
                alpha_threshold=args.alpha_threshold,
                force=False,
            )
        )

    qa = work / "qa"
    final = work / "final"
    qa.mkdir(parents=True, exist_ok=True)
    final.mkdir(parents=True, exist_ok=True)
    analysis = analyze_directory(
        final_frames,
        args.alpha_threshold,
        args.duplicate_threshold,
        args.brightness_jump,
        args.scale_jump,
        args.center_jump,
    )
    write_json(qa / "analysis.json", analysis)
    contact = create_contact_sheet(
        final_frames,
        qa / "contact-sheet.jpg",
        args.contact_columns,
        args.thumb_width,
    )
    atlas = create_atlas(
        final_frames,
        final / "motion.webp",
        final / "motion.json",
        args.columns,
        args.cell_width,
        args.cell_height,
        args.quality,
        args.lossless,
        args.max_texture,
    )
    build_manifest = {
        "source": str(args.input.expanduser().resolve()),
        "extraction": extraction,
        "normalization": normalization,
        "analysisSummary": analysis["summary"],
        "contactSheet": contact,
        "atlas": atlas,
    }
    write_json(work / "build.json", build_manifest)
    print(json.dumps(build_manifest, ensure_ascii=False, indent=2))


def add_extract_options(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--fps", type=float, default=24)
    parser.add_argument("--start", type=float)
    parser.add_argument("--duration", type=float)
    parser.add_argument("--width", type=int)
    parser.add_argument("--height", type=int)
    parser.add_argument(
        "--interpolate",
        action="store_true",
        help="Use ffmpeg motion interpolation instead of simple FPS sampling.",
    )
    parser.add_argument(
        "--key",
        default="auto",
        help="'auto', 'none', or a hex key color such as '#00FF00'.",
    )
    parser.add_argument("--transparent-threshold", type=float, default=12)
    parser.add_argument("--opaque-threshold", type=float, default=220)


def add_analysis_options(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--alpha-threshold", type=int, default=16)
    parser.add_argument("--duplicate-threshold", type=float, default=0.004)
    parser.add_argument("--brightness-jump", type=float, default=0.12)
    parser.add_argument("--scale-jump", type=float, default=0.08)
    parser.add_argument("--center-jump", type=float, default=0.08)


def add_atlas_options(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--columns", type=int)
    parser.add_argument("--cell-width", type=int, required=True)
    parser.add_argument("--cell-height", type=int, required=True)
    parser.add_argument("--quality", type=int, default=88)
    parser.add_argument("--lossless", action="store_true")
    parser.add_argument("--max-texture", type=int, default=4096)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)

    probe = subparsers.add_parser("probe")
    probe.add_argument("input", type=Path)
    probe.add_argument("--output", type=Path)
    probe.set_defaults(function=command_probe)

    extract = subparsers.add_parser("extract")
    extract.add_argument("input", type=Path)
    extract.add_argument("output", type=Path)
    add_extract_options(extract)
    extract.add_argument("--force", action="store_true")
    extract.set_defaults(function=command_extract)

    normalize = subparsers.add_parser("normalize")
    normalize.add_argument("input", type=Path)
    normalize.add_argument("output", type=Path)
    normalize.add_argument("--anchor", choices=["center", "bottom"], default="bottom")
    normalize.add_argument("--max-scale-change", type=float, default=0.08)
    normalize.add_argument("--alpha-threshold", type=int, default=16)
    normalize.add_argument("--force", action="store_true")
    normalize.set_defaults(function=command_normalize)

    analyze = subparsers.add_parser("analyze")
    analyze.add_argument("input", type=Path)
    analyze.add_argument("--output", type=Path)
    add_analysis_options(analyze)
    analyze.set_defaults(function=command_analyze)

    contact = subparsers.add_parser("contact")
    contact.add_argument("input", type=Path)
    contact.add_argument("--output", type=Path, required=True)
    contact.add_argument("--columns", type=int, default=8)
    contact.add_argument("--thumb-width", type=int, default=160)
    contact.set_defaults(function=command_contact)

    atlas = subparsers.add_parser("atlas")
    atlas.add_argument("input", type=Path)
    atlas.add_argument("--output", type=Path, required=True)
    atlas.add_argument("--manifest", type=Path, required=True)
    add_atlas_options(atlas)
    atlas.set_defaults(function=command_atlas)

    build = subparsers.add_parser("build")
    build.add_argument("input", type=Path)
    build.add_argument("output", type=Path)
    add_extract_options(build)
    add_analysis_options(build)
    add_atlas_options(build)
    build.add_argument("--normalize", action="store_true")
    build.add_argument("--anchor", choices=["center", "bottom"], default="bottom")
    build.add_argument("--max-scale-change", type=float, default=0.08)
    build.add_argument("--contact-columns", type=int, default=8)
    build.add_argument("--thumb-width", type=int, default=160)
    build.add_argument("--force", action="store_true")
    build.set_defaults(function=command_build)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if hasattr(args, "fps") and args.fps <= 0:
        raise SystemExit("--fps must be positive")
    if hasattr(args, "quality") and not 0 <= args.quality <= 100:
        raise SystemExit("--quality must be between 0 and 100")
    if hasattr(args, "max_scale_change") and not 0 <= args.max_scale_change <= 0.5:
        raise SystemExit("--max-scale-change must be between 0 and 0.5")
    args.function(args)


if __name__ == "__main__":
    main()
