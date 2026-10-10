#!/usr/bin/env python3
"""把同一透明角色层精确放到轨道顶部和底部，生成一致的首尾帧。"""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image, ImageDraw


def parse_size(raw: str) -> tuple[int, int]:
    try:
        width, height = raw.lower().split("x", 1)
        return int(width), int(height)
    except (ValueError, AttributeError) as error:
        raise ValueError("--size 必须是 WIDTHxHEIGHT") from error


def build(args: argparse.Namespace) -> int:
    source = Path(args.source).expanduser().resolve()
    first_output = Path(args.first_output).expanduser().resolve()
    last_output = Path(args.last_output).expanduser().resolve()
    width, height = parse_size(args.size)

    image = Image.open(source).convert("RGBA")
    bbox = image.getbbox()
    if not bbox:
        raise ValueError("输入没有可见像素")
    subject = image.crop(bbox)

    target_height = round(height * args.subject_height)
    scale = target_height / subject.height
    target_width = round(subject.width * scale)
    if target_width > width * args.max_subject_width:
        scale = (width * args.max_subject_width) / subject.width
        target_width = round(subject.width * scale)
        target_height = round(subject.height * scale)
    subject = subject.resize((target_width, target_height), Image.Resampling.LANCZOS)

    pole_x = round(width * args.pole_x)
    anchor_x = round(subject.width * args.subject_anchor_x)
    subject_x = pole_x - anchor_x
    start_y = round(height * args.top_margin)
    end_y = height - round(height * args.bottom_margin) - subject.height
    if end_y <= start_y:
        raise ValueError("角色过高，没有足够的上下移动空间")

    def compose(y: int) -> Image.Image:
        canvas = Image.new("RGB", (width, height), args.key_color)
        draw = ImageDraw.Draw(canvas)
        outline = max(2, round(width * args.pole_outline_ratio))
        pole_width = max(outline + 2, round(width * args.pole_width_ratio))
        draw.rectangle(
            (
                pole_x - pole_width // 2 - outline,
                0,
                pole_x + pole_width // 2 + outline,
                height,
            ),
            fill=args.pole_outline,
        )
        draw.rectangle(
            (
                pole_x - pole_width // 2,
                0,
                pole_x + pole_width // 2,
                height,
            ),
            fill=args.pole_fill,
        )
        canvas.paste(subject, (subject_x, y), subject)
        return canvas

    first_output.parent.mkdir(parents=True, exist_ok=True)
    last_output.parent.mkdir(parents=True, exist_ok=True)
    compose(start_y).save(first_output)
    compose(end_y).save(last_output)
    print(
        {
            "source": str(source),
            "subjectSize": [subject.width, subject.height],
            "canvas": [width, height],
            "poleX": pole_x,
            "subjectX": subject_x,
            "startY": start_y,
            "endY": end_y,
            "first": str(first_output),
            "last": str(last_output),
        }
    )
    return 0


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(
        description="用同一透明主体生成沿竖直轨道移动的首帧和尾帧"
    )
    result.add_argument("source", help="已抠图的 RGBA PNG")
    result.add_argument("--first-output", required=True)
    result.add_argument("--last-output", required=True)
    result.add_argument("--size", default="864x1536")
    result.add_argument("--key-color", default="#00FF00")
    result.add_argument("--pole-x", type=float, default=0.5)
    result.add_argument("--pole-fill", default="#B8B8B2")
    result.add_argument("--pole-outline", default="#181818")
    result.add_argument("--pole-width-ratio", type=float, default=0.012)
    result.add_argument("--pole-outline-ratio", type=float, default=0.004)
    result.add_argument("--subject-height", type=float, default=0.36)
    result.add_argument("--max-subject-width", type=float, default=0.84)
    result.add_argument(
        "--subject-anchor-x",
        type=float,
        default=0.535,
        help="透明主体中应与轨道重合的横向比例",
    )
    result.add_argument("--top-margin", type=float, default=0.045)
    result.add_argument("--bottom-margin", type=float, default=0.045)
    return result


if __name__ == "__main__":
    try:
        raise SystemExit(build(parser().parse_args()))
    except (FileNotFoundError, ValueError) as error:
        raise SystemExit(f"错误：{error}") from error
