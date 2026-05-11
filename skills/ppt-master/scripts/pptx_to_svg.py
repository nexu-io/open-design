#!/usr/bin/env python3
"""CLI entry: convert a .pptx file to one SVG per slide.

Usage:
    python3 pptx_to_svg.py <pptx_file> [-o <output_dir>] [--embed-images]
                                       [--media-subdir <name>] [--keep-hidden]
                                       [--inheritance-mode {both,layered,flat}]

Output structure (default --inheritance-mode both):
    <output_dir>/
        svg/                    layered machine input: masters/layouts/slides
        svg-flat/               self-contained visual preview slides
        <media_subdir>/         (default: assets/)
            image1.png
            image2.png
            ...

If -o is omitted, writes alongside the source file as <pptx_stem>_pptx_to_svg/.

This is the reverse of svg_to_pptx.py: it reads OOXML directly and emits
shape-level SVG without going through PowerPoint or PDF rendering.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

# Allow running this script from anywhere
sys.path.insert(0, str(Path(__file__).resolve().parent))

from pptx_to_svg import convert_pptx_to_svg
from pptx_to_svg.converter import ConvertOptions


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Convert .pptx to per-slide SVG by reading OOXML directly.",
    )
    parser.add_argument("pptx_file", help="Path to the source .pptx file")
    parser.add_argument(
        "-o",
        "--output",
        help="Output directory (default: <pptx_stem>_pptx_to_svg beside source)",
    )
    parser.add_argument(
        "--media-subdir",
        default="assets",
        help="Subdirectory for extracted media (default: assets)",
    )
    parser.add_argument(
        "--embed-images",
        action="store_true",
        help="Base64-embed images inline instead of writing files",
    )
    parser.add_argument(
        "--keep-hidden",
        action="store_true",
        help='Include shapes marked hidden="1"',
    )
    parser.add_argument(
        "--inheritance-mode",
        choices=("both", "layered", "flat"),
        default="both",
        help=(
            "How to render inheritance. 'both' (default) writes layered SVGs "
            "under svg/ and complete preview slides under svg-flat/. "
            "'layered' writes only svg/ plus inheritance.json. 'flat' writes "
            "self-contained slides under svg/ for backward compatibility."
        ),
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    pptx_path = Path(args.pptx_file).expanduser().resolve()
    if not pptx_path.exists():
        print(f"Error: file does not exist: {pptx_path}", file=sys.stderr)
        return 1
    if pptx_path.suffix.lower() != ".pptx":
        print(f"Error: expected a .pptx file, got: {pptx_path.name}", file=sys.stderr)
        return 1

    output_dir = (
        Path(args.output).expanduser().resolve()
        if args.output
        else pptx_path.with_name(f"{pptx_path.stem}_pptx_to_svg")
    )

    options = ConvertOptions(
        media_subdir=args.media_subdir,
        embed_images=args.embed_images,
        keep_hidden=args.keep_hidden,
        inheritance_mode=args.inheritance_mode,
    )

    result = convert_pptx_to_svg(pptx_path, output_dir, options)

    print(f"Source: {pptx_path.name}")
    print(f"Canvas: {result.canvas_px[0]:.0f} x {result.canvas_px[1]:.0f} px")
    if result.theme_colors:
        scheme = ", ".join(f"{k}={v}" for k, v in sorted(result.theme_colors.items()))
        print(f"Theme colors: {scheme}")
    if result.theme_fonts:
        fonts = ", ".join(f"{k}={v}" for k, v in result.theme_fonts.items())
        print(f"Theme fonts: {fonts}")
    print(f"Slides converted: {len(result.slides)}")
    print(f"Output: {output_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
