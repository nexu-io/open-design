#!/usr/bin/env python3
"""Compose or normalize a Codex pet spritesheet atlas."""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image

COLUMNS = 8
ROWS = 9
CELL_WIDTH = 192
CELL_HEIGHT = 208
ATLAS_WIDTH = COLUMNS * CELL_WIDTH
ATLAS_HEIGHT = ROWS * CELL_HEIGHT
ATLAS_ASPECT_RATIO = ATLAS_WIDTH / ATLAS_HEIGHT
ROW_SPECS = [
    ("idle", 0, 6),
    ("running-right", 1, 8),
    ("running-left", 2, 8),
    ("waving", 3, 4),
    ("jumping", 4, 5),
    ("failed", 5, 8),
    ("waiting", 6, 6),
    ("running", 7, 6),
    ("review", 8, 6),
]
IMAGE_SUFFIXES = {".png", ".webp", ".jpg", ".jpeg"}


def image_files(path: Path) -> list[Path]:
    return sorted(p for p in path.iterdir() if p.suffix.lower() in IMAGE_SUFFIXES)


def find_row_frames(root: Path, state: str, row_index: int) -> list[Path]:
    candidates = [
        root / state,
        root / f"row-{row_index}",
        root / f"row{row_index}",
        root / f"{row_index}-{state}",
    ]
    for candidate in candidates:
        if candidate.is_dir():
            files = image_files(candidate)
            if files:
                return files
    globs = [
        f"{state}_*",
        f"{state}-*",
        f"row{row_index}_*",
        f"row-{row_index}-*",
    ]
    files: list[Path] = []
    for pattern in globs:
        files.extend(p for p in root.glob(pattern) if p.suffix.lower() in IMAGE_SUFFIXES)
    return sorted(set(files))


def paste_centered(atlas: Image.Image, source: Image.Image, row: int, column: int) -> None:
    frame = source.convert("RGBA")
    if frame.size != (CELL_WIDTH, CELL_HEIGHT):
        frame.thumbnail((CELL_WIDTH, CELL_HEIGHT), Image.Resampling.LANCZOS)
    left = column * CELL_WIDTH + (CELL_WIDTH - frame.width) // 2
    top = row * CELL_HEIGHT + (CELL_HEIGHT - frame.height) // 2
    atlas.alpha_composite(frame, (left, top))


def compose_from_source_atlas(path: Path, resize_source: bool) -> Image.Image:
    with Image.open(path) as opened:
        source = opened.convert("RGBA")
    if source.size != (ATLAS_WIDTH, ATLAS_HEIGHT):
        if not resize_source:
            raise SystemExit(
                f"source atlas must be {ATLAS_WIDTH}x{ATLAS_HEIGHT}; got {source.width}x{source.height}"
            )
        source_ratio = source.width / source.height
        if abs(source_ratio - ATLAS_ASPECT_RATIO) > 0.02:
            raise SystemExit(
                "refusing to resize source atlas because its aspect ratio does not match "
                f"the Codex atlas ratio {ATLAS_ASPECT_RATIO:.3f}; got {source_ratio:.3f}. "
                "Generate exact atlas dimensions or use --frames-root."
            )
        source = source.resize((ATLAS_WIDTH, ATLAS_HEIGHT), Image.Resampling.LANCZOS)

    atlas = Image.new("RGBA", (ATLAS_WIDTH, ATLAS_HEIGHT), (0, 0, 0, 0))
    for _state, row, frame_count in ROW_SPECS:
        for column in range(frame_count):
            left = column * CELL_WIDTH
            top = row * CELL_HEIGHT
            cell = source.crop((left, top, left + CELL_WIDTH, top + CELL_HEIGHT))
            atlas.alpha_composite(cell, (left, top))
    return atlas


def compose_from_frames(root: Path) -> Image.Image:
    atlas = Image.new("RGBA", (ATLAS_WIDTH, ATLAS_HEIGHT), (0, 0, 0, 0))
    for state, row, frame_count in ROW_SPECS:
        files = find_row_frames(root, state, row)
        if len(files) < frame_count:
            raise SystemExit(
                f"{state} row needs {frame_count} frames, found {len(files)} under {root}"
            )
        for column, frame_path in enumerate(files[:frame_count]):
            with Image.open(frame_path) as frame:
                paste_centered(atlas, frame, row, column)
    return atlas


def save_outputs(atlas: Image.Image, output: Path, webp_output: Path | None) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    atlas.save(output)
    if webp_output is not None:
        webp_output.parent.mkdir(parents=True, exist_ok=True)
        atlas.save(webp_output, format="WEBP", lossless=True, quality=100, method=6)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--source-atlas")
    source.add_argument("--frames-root")
    parser.add_argument("--output", required=True)
    parser.add_argument("--webp-output")
    parser.add_argument(
        "--resize-source",
        action="store_true",
        help="Resize a lower-resolution source atlas only when it already has the Codex atlas aspect ratio.",
    )
    args = parser.parse_args()

    if args.source_atlas:
        atlas = compose_from_source_atlas(
            Path(args.source_atlas).expanduser().resolve(), args.resize_source
        )
    else:
        atlas = compose_from_frames(Path(args.frames_root).expanduser().resolve())

    save_outputs(
        atlas,
        Path(args.output).expanduser().resolve(),
        Path(args.webp_output).expanduser().resolve() if args.webp_output else None,
    )
    print(f"wrote {Path(args.output).expanduser().resolve()}")
    if args.webp_output:
        print(f"wrote {Path(args.webp_output).expanduser().resolve()}")


if __name__ == "__main__":
    main()
