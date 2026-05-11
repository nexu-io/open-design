#!/usr/bin/env python3
"""
Image Size Analysis Tool
========================
Reports objective parameters (width, height, aspect ratio, category) for all
images in a folder. Intentionally does NOT prescribe a layout — the Strategist
decides narrative intent (hero / atmosphere / side-by-side / accent) per
references/strategist.md §h; this tool only supplies the numbers.

When a canvas is specified, also reports the reference image/text area sizes
that would apply *if* an image is placed side-by-side with body text. Those
numbers are conditional on the Strategist picking the side-by-side intent.

Usage:
    python scripts/analyze_images.py <images_folder_path>
    python scripts/analyze_images.py projects/xxx/images
    python scripts/analyze_images.py projects/xxx/images --canvas ppt43

Output:
    - Analysis report displayed in console
    - Generates image_analysis.csv in the parent directory of the images folder
"""

import argparse
import os
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    print("Error: PIL/Pillow not installed. Run: pip install Pillow")
    sys.exit(1)

try:
    from config import CANVAS_FORMATS, LAYOUT_MARGINS
except ImportError:
    CANVAS_FORMATS = {
        'ppt169': {
            'name': 'PPT 16:9',
            'width': 1280,
            'height': 720,
        },
    }
    LAYOUT_MARGINS = {
        'ppt169': {
            'top': 60, 'right': 60, 'bottom': 60, 'left': 60,
            'content_width': 1160, 'content_height': 600
        },
    }

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".tiff", ".tif"}
REPORT_WIDTH = 100
CATEGORY_WIDTH = 50

# Title area height and gap between image/text areas (px)
TITLE_HEIGHT = 60
LAYOUT_GAP = 20
# Minimum text area dimensions (px)
MIN_TEXT_HEIGHT = 150
MIN_TEXT_WIDTH = 280

ImageAnalysis = dict[str, str | float | int]


def classify_ratio(aspect_ratio: float) -> str:
    """Classify image aspect ratio into layout category.

    Thresholds aligned with image-layout-spec.md:
      >2.0 ultra-wide, 1.5-2.0 wide, 1.2-1.5 standard landscape,
      0.8-1.2 square, <0.8 portrait.
    """
    if aspect_ratio > 2.0:
        return "Ultra-wide"
    elif aspect_ratio > 1.5:
        return "Wide landscape"
    elif aspect_ratio > 1.2:
        return "Standard landscape"
    elif aspect_ratio > 0.8:
        return "Near square"
    else:
        return "Portrait"


def compute_layout_dimensions(
    ratio: float,
    content_w: int,
    content_h: int,
    gap: int = LAYOUT_GAP,
) -> dict:
    """Compute image and text area dimensions following image-layout-spec.md.

    Returns dict with layout_type, image_w, image_h, text_w, text_h.
    """
    # Effective content height (below title)
    H = content_h
    W = content_w

    def _try_top_bottom() -> dict | None:
        img_w = W
        img_h = int(round(W / ratio))
        text_h = H - img_h - gap
        if text_h >= MIN_TEXT_HEIGHT:
            return {
                'layout_type': 'top-bottom',
                'image_w': img_w,
                'image_h': img_h,
                'text_w': W,
                'text_h': text_h,
            }
        return None

    def _try_left_right_height_first() -> dict | None:
        img_h = H
        img_w = int(round(H * ratio))
        text_w = W - img_w - gap
        if text_w >= MIN_TEXT_WIDTH:
            return {
                'layout_type': 'left-right',
                'image_w': img_w,
                'image_h': img_h,
                'text_w': text_w,
                'text_h': H,
            }
        return None

    def _try_left_right_width_constrained() -> dict:
        img_w = int(round(W * 0.7))
        img_h = int(round(img_w / ratio))
        text_w = W - img_w - gap
        return {
            'layout_type': 'left-right',
            'image_w': img_w,
            'image_h': min(img_h, H),
            'text_w': max(text_w, MIN_TEXT_WIDTH),
            'text_h': H,
        }

    # Decision tree per image-layout-spec.md
    if ratio > 1.5:
        # Ultra-wide or wide → try top-bottom first
        result = _try_top_bottom()
        if result:
            return result
        # Fallback to left-right (wide-constrained)
        return _try_left_right_width_constrained()
    else:
        # Standard landscape, square, portrait → try left-right (height-first)
        result = _try_left_right_height_first()
        if result:
            return result
        # Fallback to left-right (width-constrained)
        return _try_left_right_width_constrained()


def analyze_images(images_dir: str) -> list[ImageAnalysis]:
    """Analyze all image files in a directory.

    Args:
        images_dir: Directory that contains image files.

    Returns:
        A list of image analysis records sorted by filename.
    """

    results: list[ImageAnalysis] = []

    # Iterate through all files in the directory
    for filename in sorted(os.listdir(images_dir)):
        filepath = os.path.join(images_dir, filename)

        # Check if it is an image file
        if os.path.isfile(filepath) and Path(filename).suffix.lower() in IMAGE_EXTENSIONS:
            try:
                with Image.open(filepath) as img:
                    width, height = img.size
                    aspect_ratio = width / height
                    layout_hint = classify_ratio(aspect_ratio)

                    results.append({
                        'filename': filename,
                        'width': width,
                        'height': height,
                        'aspect_ratio': aspect_ratio,
                        'layout_hint': layout_hint,
                        'filesize_kb': os.path.getsize(filepath) / 1024
                    })
            except Exception as e:
                print(f"[WARN] Cannot read {filename}: {e}")

    return results


def enrich_with_layout(
    results: list[ImageAnalysis],
    canvas_key: str,
) -> None:
    """Add computed layout dimensions to each result in-place."""
    fmt = CANVAS_FORMATS.get(canvas_key, {})
    margins = LAYOUT_MARGINS.get(canvas_key)

    if not margins:
        print(f"[WARN] No layout margins for canvas '{canvas_key}', skipping dimension calculation")
        return

    content_w = margins['content_width']
    content_h = margins['content_height']

    for img in results:
        dims = compute_layout_dimensions(img['aspect_ratio'], content_w, content_h)
        img.update(dims)


def print_results(results: list[ImageAnalysis]) -> None:
    """Print the analysis report to stdout."""

    print("\n" + "=" * REPORT_WIDTH)
    print("Image Size Analysis Report")
    print("=" * REPORT_WIDTH)

    has_layout = 'layout_type' in results[0] if results else False

    if has_layout:
        print("\nNote: 'Img (SxS)' shows the image area *if* the Strategist chooses the")
        print("side-by-side intent for this image. Decide narrative intent first — see")
        print("references/strategist.md §h. Hero / atmosphere / accent intents ignore it.\n")
        print(f"{'No.':<4} {'Width':<7} {'Height':<7} {'Ratio':<7} {'Size':<10} {'Category':<20} {'Img (SxS)':<14} {'Filename'}")
    else:
        print(f"\n{'No.':<4} {'Width':<7} {'Height':<7} {'Ratio':<7} {'Size':<10} {'Category':<20} {'Filename'}")
    print("-" * REPORT_WIDTH)

    for i, img in enumerate(results, 1):
        base = f"{i:<4} {img['width']:<7} {img['height']:<7} {img['aspect_ratio']:<7.2f} {img['filesize_kb']:<10.1f}KB {img['layout_hint']:<20}"
        if has_layout:
            img_area = f"{img['image_w']}x{img['image_h']}"
            print(f"{base} {img_area:<14} {img['filename'][:35]}")
        else:
            print(f"{base} {img['filename'][:40]}")

    print("-" * REPORT_WIDTH)
    print(f"Total: {len(results)} images\n")

    # Group statistics by aspect ratio (aligned with image-layout-spec.md thresholds)
    print("\nGroup by Aspect Ratio:")
    print("-" * CATEGORY_WIDTH)

    categories = {
        "Ultra-wide (>2.0)": [],
        "Wide (1.5-2.0)": [],
        "Standard (1.2-1.5)": [],
        "Square (0.8-1.2)": [],
        "Portrait (<0.8)": [],
    }

    for img in results:
        ar = img['aspect_ratio']
        if ar > 2.0:
            categories["Ultra-wide (>2.0)"].append(img)
        elif ar > 1.5:
            categories["Wide (1.5-2.0)"].append(img)
        elif ar > 1.2:
            categories["Standard (1.2-1.5)"].append(img)
        elif ar > 0.8:
            categories["Square (0.8-1.2)"].append(img)
        else:
            categories["Portrait (<0.8)"].append(img)

    for cat, imgs in categories.items():
        if imgs:
            print(f"\n{cat}: {len(imgs)} images")
            for img in imgs[:5]:  # Show only the first 5
                print(f"  - {img['width']}x{img['height']} (ratio {img['aspect_ratio']:.2f}) - {img['filename'][:35]}...")
            if len(imgs) > 5:
                print(f"  ... and {len(imgs) - 5} more")


def generate_markdown(results: list[ImageAnalysis], canvas_key: str) -> None:
    """Print a Markdown-ready image inventory section."""
    print("\n" + "=" * REPORT_WIDTH)
    print("Markdown Snippet for Strategist (Copy & Paste)")
    print("=" * REPORT_WIDTH)

    has_layout = 'layout_type' in results[0] if results else False
    fmt_name = CANVAS_FORMATS.get(canvas_key, {}).get('name', canvas_key)

    print(f"\n## Image Resource Inventory (Auto-scan Results — {fmt_name})\n")

    print("> Decide narrative intent per image (hero / atmosphere / side-by-side /")
    print("> accent) per `references/strategist.md` §h before filling the table. The")
    print("> `Img Area (SxS)` / `Text Area (SxS)` columns only apply if the chosen")
    print("> intent is side-by-side; ignore them for hero / atmosphere / accent intents.\n")

    if has_layout:
        print("| Filename | Size | Ratio | Category | Img Area (SxS) | Text Area (SxS) | Intent | Usage | Type | Status | Generation Description |")
        print("|----------|------|-------|----------|----------------|-----------------|--------|-------|------|--------|-----------------------|")
    else:
        print("| Filename | Size | Ratio | Category | Intent | Usage | Type | Status | Generation Description |")
        print("|----------|------|-------|----------|--------|-------|------|--------|-----------------------|")

    for img in results:
        ratio_str = f"{img['aspect_ratio']:.2f}"

        if has_layout:
            img_area = f"{img['image_w']}x{img['image_h']}"
            text_area = f"{img['text_w']}x{img['text_h']}"
            print(f"| {img['filename']} | {img['width']}x{img['height']} | {ratio_str} | {img['layout_hint']} | {img_area} | {text_area} | (to be filled) | (to be filled) | | Existing | - |")
        else:
            print(f"| {img['filename']} | {img['width']}x{img['height']} | {ratio_str} | {img['layout_hint']} | (to be filled) | (to be filled) | | Existing | - |")

    print("\n" + "=" * REPORT_WIDTH + "\n")


def save_csv(results: list[ImageAnalysis], csv_path: str) -> None:
    """Save analysis results to a CSV file."""
    has_layout = 'layout_type' in results[0] if results else False

    # NOTE: ImageArea_SxS / TextArea_SxS apply only if Strategist picks the
    # side-by-side intent for this image (see strategist.md §h). The tool
    # does not prescribe a layout.
    with open(csv_path, 'w', encoding='utf-8') as f:
        if has_layout:
            f.write("No,Filename,Width,Height,AspectRatio,SizeKB,Category,ImageArea_SxS,TextArea_SxS\n")
            for i, img in enumerate(results, 1):
                f.write(f"{i},{img['filename']},{img['width']},{img['height']},{img['aspect_ratio']:.2f},{img['filesize_kb']:.1f},{img['layout_hint']},{img['image_w']}x{img['image_h']},{img['text_w']}x{img['text_h']}\n")
        else:
            f.write("No,Filename,Width,Height,AspectRatio,SizeKB,Category\n")
            for i, img in enumerate(results, 1):
                f.write(f"{i},{img['filename']},{img['width']},{img['height']},{img['aspect_ratio']:.2f},{img['filesize_kb']:.1f},{img['layout_hint']}\n")
    print(f"\nCSV saved to: {csv_path}")


def main() -> None:
    """Run the CLI entry point."""
    parser = argparse.ArgumentParser(
        description="Analyze image sizes and compute PPT layout dimensions"
    )
    parser.add_argument(
        "images_dir",
        help="Path to the images directory"
    )
    parser.add_argument(
        "--canvas",
        default="ppt169",
        help=f"Canvas format key (default: ppt169). Available: {', '.join(sorted(CANVAS_FORMATS.keys()))}"
    )

    args = parser.parse_args()

    images_dir = os.path.abspath(args.images_dir)

    if not os.path.exists(images_dir):
        print(f"Error: Directory not found: {images_dir}")
        sys.exit(1)

    if not os.path.isdir(images_dir):
        print(f"Error: Not a directory: {images_dir}")
        sys.exit(1)

    canvas_key = args.canvas
    if canvas_key not in CANVAS_FORMATS:
        print(f"Error: Unknown canvas format '{canvas_key}'. Available: {', '.join(sorted(CANVAS_FORMATS.keys()))}")
        sys.exit(1)

    fmt = CANVAS_FORMATS[canvas_key]
    print(f"Analyzing: {images_dir}")
    print(f"Canvas: {fmt.get('name', canvas_key)} ({fmt.get('width', '?')}x{fmt.get('height', '?')})")

    results = analyze_images(images_dir)

    if results:
        enrich_with_layout(results, canvas_key)
        print_results(results)
        generate_markdown(results, canvas_key)

        # Save to CSV file (saved in the parent directory of the images folder)
        parent_dir = os.path.dirname(images_dir)
        csv_path = os.path.join(parent_dir, "image_analysis.csv")
        save_csv(results, csv_path)
    else:
        print("No image files found in the directory.")


if __name__ == "__main__":
    main()
