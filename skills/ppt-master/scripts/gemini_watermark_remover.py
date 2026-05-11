#!/usr/bin/env python3
"""
PPT Master - Gemini Watermark Remover

Removes the watermark logo from the bottom-right corner of Gemini-generated images.
Uses a reverse blending algorithm to restore original pixels.

Usage:
    python3 scripts/gemini_watermark_remover.py <image_path>
    python3 scripts/gemini_watermark_remover.py <image_path> -o output_path.png

Examples:
    python3 scripts/gemini_watermark_remover.py projects/demo/images/bg_01.png
    python3 scripts/gemini_watermark_remover.py image.jpg -o image_clean.jpg

Dependencies:
    pip install Pillow numpy

Notes:
    - Supports PNG, JPG, JPEG formats
    - Automatically detects watermark size (48px or 96px)
    - Output file defaults to adding an _unwatermarked suffix
"""

import sys
import argparse
from pathlib import Path

import numpy as np
from PIL import Image

# Import modules from the same directory
sys.path.insert(0, str(Path(__file__).parent))

# Algorithm parameters
ALPHA_THRESHOLD = 0.002  # Alpha threshold; values below this are not processed
MAX_ALPHA = 0.99  # Maximum alpha value to prevent division by zero
LOGO_VALUE = 255  # Logo pixel value (white)
LARGE_IMAGE_THRESHOLD = 1024
LARGE_LOGO_SIZE = 96
SMALL_LOGO_SIZE = 48
LARGE_MARGIN = 64
SMALL_MARGIN = 32

# Watermark background image paths
SCRIPT_DIR = Path(__file__).parent
BG_48_PATH = SCRIPT_DIR / "assets" / "bg_48.png"
BG_96_PATH = SCRIPT_DIR / "assets" / "bg_96.png"


def detect_watermark_config(width: int, height: int) -> dict[str, int]:
    """
    Detect watermark configuration based on image dimensions

    Args:
        width: Image width
        height: Image height

    Returns:
        Configuration dict containing logo_size, margin_right, margin_bottom
    """
    if width > LARGE_IMAGE_THRESHOLD and height > LARGE_IMAGE_THRESHOLD:
        return {
            "logo_size": LARGE_LOGO_SIZE,
            "margin_right": LARGE_MARGIN,
            "margin_bottom": LARGE_MARGIN,
        }
    return {
        "logo_size": SMALL_LOGO_SIZE,
        "margin_right": SMALL_MARGIN,
        "margin_bottom": SMALL_MARGIN,
    }


def calculate_watermark_position(width: int, height: int, config: dict[str, int]) -> dict[str, int]:
    """
    Calculate watermark position

    Args:
        width: Image width
        height: Image height
        config: Watermark configuration

    Returns:
        Position dict containing x, y, width, height
    """
    logo_size = config["logo_size"]
    return {
        "x": width - config["margin_right"] - logo_size,
        "y": height - config["margin_bottom"] - logo_size,
        "width": logo_size,
        "height": logo_size,
    }


def calculate_alpha_map(bg_image: Image.Image) -> np.ndarray:
    """
    Calculate the alpha channel map from the watermark background image

    Args:
        bg_image: Watermark background PNG image

    Returns:
        Alpha map array (range 0-1)
    """
    bg_array = np.array(bg_image.convert("RGB"), dtype=np.float32)
    max_channel = np.max(bg_array, axis=2)
    return max_channel / 255.0


def remove_watermark(image: Image.Image, alpha_map: np.ndarray, position: dict) -> Image.Image:
    """
    Remove watermark using a reverse blending algorithm

    Args:
        image: Original image
        alpha_map: Alpha map array
        position: Watermark position

    Returns:
        Image with watermark removed
    """
    img_array = np.array(image.convert("RGBA"), dtype=np.float32)
    x, y, w, h = position["x"], position["y"], position["width"], position["height"]

    for row in range(h):
        for col in range(w):
            alpha = alpha_map[row, col]
            if alpha < ALPHA_THRESHOLD:
                continue
            alpha = min(alpha, MAX_ALPHA)
            one_minus_alpha = 1.0 - alpha

            img_y, img_x = y + row, x + col
            for c in range(3):
                watermarked = img_array[img_y, img_x, c]
                original = (watermarked - alpha * LOGO_VALUE) / one_minus_alpha
                img_array[img_y, img_x, c] = np.clip(original, 0, 255)

    return Image.fromarray(img_array.astype(np.uint8))


def process_image(input_path: Path, output_path: Path | None = None, verbose: bool = True) -> Path:
    """
    Process a single image to remove its watermark

    Args:
        input_path: Input image path
        output_path: Output image path (optional)
        verbose: Whether to output detailed information

    Returns:
        Output file path
    """
    image = Image.open(input_path)
    width, height = image.size

    config = detect_watermark_config(width, height)
    position = calculate_watermark_position(width, height, config)

    if verbose:
        print(f"  Image size: {width} x {height}")
        print(f"  Watermark size: {config['logo_size']} x {config['logo_size']}")
        print(f"  Watermark position: ({position['x']}, {position['y']})")

    bg_path = BG_96_PATH if config["logo_size"] == 96 else BG_48_PATH

    if not bg_path.exists():
        print(f"Error: Watermark background image not found: {bg_path}")
        sys.exit(1)

    bg_image = Image.open(bg_path)
    alpha_map = calculate_alpha_map(bg_image)

    result = remove_watermark(image, alpha_map, position)

    if output_path is None:
        stem = input_path.stem
        suffix = input_path.suffix or ".png"
        output_path = input_path.parent / f"{stem}_unwatermarked{suffix}"

    if output_path.suffix.lower() in (".jpg", ".jpeg"):
        result = result.convert("RGB")

    result.save(output_path)
    return output_path


def main() -> None:
    """Run the CLI entry point."""
    parser = argparse.ArgumentParser(
        description='PPT Master - Gemini Watermark Remover',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog='''
Examples:
    %(prog)s projects/demo/images/bg_01.png
    %(prog)s image.jpg -o image_clean.jpg

Notes:
    - Automatically detects watermark size (96px for large images, 48px for small)
    - Supports PNG, JPG, JPEG formats
    - Output file defaults to adding an _unwatermarked suffix
'''
    )

    parser.add_argument('input', type=Path, help='Input image path')
    parser.add_argument('-o', '--output', type=Path, default=None, help='Output image path')
    parser.add_argument('-q', '--quiet', action='store_true', help='Quiet mode')

    args = parser.parse_args()

    if not args.input.exists():
        print(f"Error: File not found: {args.input}")
        sys.exit(1)

    verbose = not args.quiet
    if verbose:
        print("PPT Master - Gemini Watermark Remover")
        print("=" * 40)
        print(f"  Input file: {args.input}")

    output = process_image(args.input, args.output, verbose=verbose)

    if verbose:
        print()
        print(f"[Done] Saved to: {output}")


if __name__ == "__main__":
    main()
