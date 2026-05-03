#!/usr/bin/env python3
"""Create a labeled contact sheet from a Codex pet atlas."""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

COLUMNS = 8
ROWS = 9
CELL_WIDTH = 192
CELL_HEIGHT = 208
LABEL_HEIGHT = 22
ROW_NAMES = [
    "idle",
    "running-right",
    "running-left",
    "waving",
    "jumping",
    "failed",
    "waiting",
    "running",
    "review",
]
USED_COUNTS = [6, 8, 8, 4, 5, 8, 6, 6, 6]


def checker(size: tuple[int, int], square: int = 16) -> Image.Image:
    image = Image.new("RGB", size, "#ffffff")
    draw = ImageDraw.Draw(image)
    for y in range(0, size[1], square):
        for x in range(0, size[0], square):
            if (x // square + y // square) % 2:
                draw.rectangle((x, y, x + square - 1, y + square - 1), fill="#e8e8e8")
    return image


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("atlas")
    parser.add_argument("--output", required=True)
    parser.add_argument("--scale", type=float, default=0.5)
    args = parser.parse_args()

    with Image.open(Path(args.atlas).expanduser().resolve()) as opened:
        atlas = opened.convert("RGBA")

    cell_w = max(1, round(CELL_WIDTH * args.scale))
    cell_h = max(1, round(CELL_HEIGHT * args.scale))
    width = COLUMNS * cell_w
    height = ROWS * (cell_h + LABEL_HEIGHT)
    sheet = Image.new("RGB", (width, height), "#f7f7f7")
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.load_default()

    for row in range(ROWS):
        y = row * (cell_h + LABEL_HEIGHT)
        draw.rectangle((0, y, width, y + LABEL_HEIGHT - 1), fill="#111111")
        draw.text((6, y + 5), f"row {row}: {ROW_NAMES[row]}", fill="#ffffff", font=font)
        draw.text(
            (width - 92, y + 5),
            f"{USED_COUNTS[row]} frames",
            fill="#ffffff",
            font=font,
        )
        for column in range(COLUMNS):
            crop = atlas.crop(
                (
                    column * CELL_WIDTH,
                    row * CELL_HEIGHT,
                    (column + 1) * CELL_WIDTH,
                    (row + 1) * CELL_HEIGHT,
                )
            )
            crop = crop.resize((cell_w, cell_h), Image.Resampling.LANCZOS)
            bg = checker((cell_w, cell_h))
            bg.paste(crop, (0, 0), crop)
            x = column * cell_w
            sheet.paste(bg, (x, y + LABEL_HEIGHT))
            outline = "#18a058" if column < USED_COUNTS[row] else "#cc3344"
            draw.rectangle(
                (x, y + LABEL_HEIGHT, x + cell_w - 1, y + LABEL_HEIGHT + cell_h - 1),
                outline=outline,
            )
            draw.text((x + 4, y + LABEL_HEIGHT + 4), str(column), fill="#111111", font=font)

    output = Path(args.output).expanduser().resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(output)
    print(f"wrote {output}")


if __name__ == "__main__":
    main()
