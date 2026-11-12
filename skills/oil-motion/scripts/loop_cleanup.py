#!/usr/bin/env python3
"""清理 AI 闭环视频切帧中的重复帧和尾部停帧。"""

from __future__ import annotations

import argparse
import json
import shutil
from pathlib import Path

from PIL import Image, ImageChops, ImageStat


IMAGE_SUFFIXES = {".png", ".webp", ".jpg", ".jpeg"}


def difference(left: Path, right: Path, sample_size: int = 128) -> float:
    with Image.open(left) as first, Image.open(right) as second:
        def visible_rgb(image: Image.Image) -> Image.Image:
            if "A" not in image.getbands():
                return image.convert("RGB")
            rgba = image.convert("RGBA")
            background = Image.new("RGBA", rgba.size, (255, 255, 255, 255))
            return Image.alpha_composite(background, rgba).convert("RGB")

        first_rgb = visible_rgb(first)
        second_rgb = visible_rgb(second)
        first_rgb.thumbnail((sample_size, sample_size), Image.Resampling.LANCZOS)
        second_rgb.thumbnail((sample_size, sample_size), Image.Resampling.LANCZOS)
        if first_rgb.size != second_rgb.size:
            second_rgb = second_rgb.resize(first_rgb.size, Image.Resampling.LANCZOS)
        means = ImageStat.Stat(ImageChops.difference(first_rgb, second_rgb)).mean
        return sum(means) / (3 * 255)


def frames_in(directory: Path) -> list[Path]:
    return sorted(
        path
        for path in directory.iterdir()
        if path.is_file() and path.suffix.lower() in IMAGE_SUFFIXES
    )


def clean(args: argparse.Namespace) -> int:
    source = Path(args.source).expanduser().resolve()
    output = Path(args.output).expanduser().resolve()
    report_path = (
        Path(args.report).expanduser().resolve()
        if args.report
        else output.parent / f"{output.name}-cleanup.json"
    )
    frames = frames_in(source)
    if len(frames) < 3:
        raise ValueError("至少需要 3 帧")
    if output.exists() and any(output.iterdir()) and not args.force:
        raise FileExistsError(f"输出目录非空：{output}；确认后使用 --force")
    output.mkdir(parents=True, exist_ok=True)
    if args.force:
        for item in output.iterdir():
            if item.is_file() or item.is_symlink():
                item.unlink()
            elif item.is_dir():
                shutil.rmtree(item)

    seam_window_start = max(1, len(frames) - args.seam_window)
    end_reference = (
        Path(args.end_reference).expanduser().resolve()
        if args.end_reference
        else frames[0]
    )
    seam_candidates = [
        (index, difference(end_reference, frames[index]))
        for index in range(seam_window_start, len(frames))
    ]
    seam_index, seam_difference = min(seam_candidates, key=lambda item: item[1])

    kept = [0]
    dropped: list[dict[str, float | int | str]] = []
    for index in range(1, seam_index):
        delta = difference(frames[kept[-1]], frames[index])
        if delta < args.duplicate_threshold:
            dropped.append(
                {
                    "index": index,
                    "file": frames[index].name,
                    "difference": round(delta, 8),
                }
            )
            continue
        kept.append(index)
    if kept[-1] != seam_index:
        kept.append(seam_index)

    digits = max(5, len(str(len(kept))))
    for output_index, source_index in enumerate(kept, start=1):
        source_path = frames[source_index]
        target = output / f"frame_{output_index:0{digits}d}{source_path.suffix.lower()}"
        shutil.copy2(source_path, target)

    report = {
        "source": str(source),
        "output": str(output),
        "inputFrameCount": len(frames),
        "outputFrameCount": len(kept),
        "seamWindow": args.seam_window,
        "endReference": str(end_reference),
        "seamSourceIndex": seam_index,
        "seamDifference": round(seam_difference, 8),
        "duplicateThreshold": args.duplicate_threshold,
        "keptSourceIndices": kept,
        "droppedNearDuplicates": dropped,
        "trimmedTailSourceIndices": list(range(seam_index + 1, len(frames))),
    }
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(
        json.dumps(report, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(
        description="选择最接近首帧的尾部接缝，并删除视觉近重复帧"
    )
    result.add_argument("source")
    result.add_argument("output")
    result.add_argument(
        "--seam-window",
        type=int,
        default=24,
        help="只在最后 N 帧中寻找最接近首帧的接缝",
    )
    result.add_argument(
        "--end-reference",
        help="单向转场的目标尾帧；省略时使用首帧，适合闭环",
    )
    result.add_argument(
        "--duplicate-threshold",
        type=float,
        default=0.003,
        help="与上一保留帧的归一化 RGB 差异低于此值时删除",
    )
    result.add_argument("--report")
    result.add_argument("--force", action="store_true")
    return result


if __name__ == "__main__":
    try:
        raise SystemExit(clean(parser().parse_args()))
    except (FileNotFoundError, FileExistsError, ValueError) as error:
        raise SystemExit(f"错误：{error}") from error
