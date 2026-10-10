#!/usr/bin/env python3
"""Composite a native-transparent keyframe onto a uniform video chroma backdrop."""

from __future__ import annotations

import argparse
import re
from pathlib import Path

from PIL import Image


def parse_color(value: str) -> tuple[int, int, int, int]:
    if not re.fullmatch(r"#[0-9a-fA-F]{6}", value):
        raise SystemExit(f"invalid key color: {value}; expected #RRGGBB")
    return tuple(int(value[index : index + 2], 16) for index in (1, 3, 5)) + (255,)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", help="Accepted native-transparent keyframe PNG")
    parser.add_argument("output", help="RGB PNG for the video model")
    parser.add_argument("--key-color", default="#00FF00")
    args = parser.parse_args()

    source = Path(args.source).expanduser().resolve()
    output = Path(args.output).expanduser().resolve()
    if source == output:
        raise SystemExit("source and output must differ; preserve the native-transparent keyframe")

    with Image.open(source) as opened:
        if "A" not in opened.getbands():
            raise SystemExit("source has no alpha channel; regenerate it with native transparency")
        foreground = opened.convert("RGBA")
    alpha_min, alpha_max = foreground.getchannel("A").getextrema()
    if alpha_min > 16 or alpha_max <= 16:
        raise SystemExit("source must contain both transparent background and visible subject pixels")

    background = Image.new("RGBA", foreground.size, parse_color(args.key_color))
    background.alpha_composite(foreground)
    output.parent.mkdir(parents=True, exist_ok=True)
    background.convert("RGB").save(output)
    print(output)


if __name__ == "__main__":
    main()
