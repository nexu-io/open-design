#!/usr/bin/env python3
"""Validate a Codex pet spritesheet atlas."""

from __future__ import annotations

import argparse
import json
from collections import defaultdict
from pathlib import Path

from PIL import Image

COLUMNS = 8
ROWS = 9
CELL_WIDTH = 192
CELL_HEIGHT = 208
ATLAS_WIDTH = COLUMNS * CELL_WIDTH
ATLAS_HEIGHT = ROWS * CELL_HEIGHT
ROW_BY_INDEX = {
    0: ("idle", 6),
    1: ("running-right", 8),
    2: ("running-left", 8),
    3: ("waving", 4),
    4: ("jumping", 5),
    5: ("failed", 8),
    6: ("waiting", 6),
    7: ("running", 6),
    8: ("review", 6),
}


def alpha_nonzero_count(image: Image.Image) -> int:
    alpha = image.getchannel("A")
    return sum(alpha.histogram()[1:])


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("atlas")
    parser.add_argument("--json-out")
    parser.add_argument("--min-used-pixels", type=int, default=50)
    parser.add_argument("--near-opaque-threshold", type=float, default=0.95)
    parser.add_argument("--allow-opaque", action="store_true")
    parser.add_argument("--allow-near-opaque-used-cells", action="store_true")
    args = parser.parse_args()

    atlas_path = Path(args.atlas).expanduser().resolve()
    errors: list[str] = []
    warnings: list[str] = []
    near_opaque_used_cells: dict[str, list[int]] = defaultdict(list)
    cells: list[dict[str, object]] = []

    try:
        with Image.open(atlas_path) as opened:
            source_mode = opened.mode
            source_format = opened.format
            image = opened.convert("RGBA")
    except Exception as exc:  # noqa: BLE001
        result = {"ok": False, "errors": [f"could not open atlas: {exc}"], "warnings": []}
        print(json.dumps(result, indent=2))
        raise SystemExit(1)

    if image.size != (ATLAS_WIDTH, ATLAS_HEIGHT):
        errors.append(f"expected {ATLAS_WIDTH}x{ATLAS_HEIGHT}, got {image.width}x{image.height}")

    if source_format not in {"PNG", "WEBP"}:
        errors.append(f"expected PNG or WebP, got {source_format}")

    if "A" not in source_mode and not args.allow_opaque:
        errors.append("atlas does not have an alpha channel")

    for row_index in range(ROWS):
        state, frame_count = ROW_BY_INDEX[row_index]
        for column_index in range(COLUMNS):
            left = column_index * CELL_WIDTH
            top = row_index * CELL_HEIGHT
            cell = image.crop((left, top, left + CELL_WIDTH, top + CELL_HEIGHT))
            nontransparent = alpha_nonzero_count(cell)
            used = column_index < frame_count
            cell_info = {
                "state": state,
                "row": row_index,
                "column": column_index,
                "used": used,
                "nontransparent_pixels": nontransparent,
            }
            cells.append(cell_info)
            if used and nontransparent < args.min_used_pixels:
                errors.append(
                    f"{state} row {row_index} column {column_index} is empty or too sparse ({nontransparent} pixels)"
                )
            if used and nontransparent > CELL_WIDTH * CELL_HEIGHT * args.near_opaque_threshold:
                near_opaque_used_cells[f"{state} row {row_index}"].append(column_index)
            if not used and nontransparent != 0:
                errors.append(
                    f"{state} row {row_index} unused column {column_index} is not transparent ({nontransparent} pixels)"
                )

    for row_label, columns in near_opaque_used_cells.items():
        message = (
            f"{row_label} has {len(columns)} nearly opaque used cells; "
            "this usually means the sprite has a non-transparent background"
        )
        if args.allow_near_opaque_used_cells:
            warnings.append(message)
        else:
            errors.append(message)

    alpha_count = alpha_nonzero_count(image)
    if alpha_count == ATLAS_WIDTH * ATLAS_HEIGHT:
        message = "atlas is fully opaque; custom pets require a transparent sprite background"
        if args.allow_opaque:
            warnings.append(message)
        else:
            errors.append(message)

    result = {
        "ok": not errors,
        "file": str(atlas_path),
        "format": source_format,
        "mode": source_mode,
        "width": image.width,
        "height": image.height,
        "errors": errors,
        "warnings": warnings,
        "cells": cells,
    }

    if args.json_out:
        Path(args.json_out).expanduser().resolve().write_text(
            json.dumps(result, indent=2) + "\n", encoding="utf-8"
        )

    print(json.dumps({k: v for k, v in result.items() if k != "cells"}, indent=2))
    raise SystemExit(0 if result["ok"] else 1)


if __name__ == "__main__":
    main()
