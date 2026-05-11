"""Slide dimensions, format detection, EMU conversion, and constants."""

from __future__ import annotations

import re
import sys
from pathlib import Path
from xml.etree import ElementTree as ET

# Import project utility modules
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
try:
    from project_utils import get_project_info
    from config import CANVAS_FORMATS
except ImportError:
    CANVAS_FORMATS = {
        'ppt169': {'name': 'PPT 16:9', 'dimensions': '1280×720', 'viewbox': '0 0 1280 720'},
    }

    def get_project_info(path: str) -> dict:
        return {'format': 'unknown', 'name': Path(path).name}

# EMU conversion constants
EMU_PER_INCH = 914400
EMU_PER_PIXEL = EMU_PER_INCH / 96

# XML namespaces
NAMESPACES = {
    'a': 'http://schemas.openxmlformats.org/drawingml/2006/main',
    'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
    'p': 'http://schemas.openxmlformats.org/presentationml/2006/main',
    'asvg': 'http://schemas.microsoft.com/office/drawing/2016/SVG/main',
}

# Register namespaces for ElementTree output
for prefix, uri in NAMESPACES.items():
    ET.register_namespace(prefix, uri)


def get_slide_dimensions(
    canvas_format: str,
    custom_pixels: tuple[int, int] | None = None,
) -> tuple[int, int]:
    """Get slide dimensions in EMU units.

    Args:
        canvas_format: Canvas format key (e.g. 'ppt169').
        custom_pixels: Optional custom pixel dimensions override.

    Returns:
        (width_emu, height_emu) tuple.
    """
    if custom_pixels:
        width_px, height_px = custom_pixels
    else:
        if canvas_format not in CANVAS_FORMATS:
            canvas_format = 'ppt169'

        dimensions = CANVAS_FORMATS[canvas_format]['dimensions']
        match = re.match(r'(\d+)[×x](\d+)', dimensions)
        if match:
            width_px = int(match.group(1))
            height_px = int(match.group(2))
        else:
            width_px, height_px = 1280, 720

    return int(width_px * EMU_PER_PIXEL), int(height_px * EMU_PER_PIXEL)


def get_pixel_dimensions(
    canvas_format: str,
    custom_pixels: tuple[int, int] | None = None,
) -> tuple[int, int]:
    """Get canvas pixel dimensions.

    Args:
        canvas_format: Canvas format key.
        custom_pixels: Optional custom pixel dimensions override.

    Returns:
        (width_px, height_px) tuple.
    """
    if custom_pixels:
        return custom_pixels

    if canvas_format not in CANVAS_FORMATS:
        canvas_format = 'ppt169'

    dimensions = CANVAS_FORMATS[canvas_format]['dimensions']
    match = re.match(r'(\d+)[×x](\d+)', dimensions)
    if match:
        return int(match.group(1)), int(match.group(2))
    return 1280, 720


def get_viewbox_dimensions(svg_path: Path) -> tuple[int, int] | None:
    """Extract pixel dimensions from SVG viewBox.

    Args:
        svg_path: Path to the SVG file.

    Returns:
        (width, height) as integers, or None if not found.
    """
    try:
        with open(svg_path, 'r', encoding='utf-8') as f:
            content = f.read(2000)

        match = re.search(r'viewBox="([^"]+)"', content)
        if not match:
            return None

        parts = re.split(r'[\s,]+', match.group(1).strip())
        if len(parts) < 4:
            return None

        width = float(parts[2])
        height = float(parts[3])
        if width <= 0 or height <= 0:
            return None

        return int(round(width)), int(round(height))
    except Exception:
        return None


def detect_format_from_svg(svg_path: Path) -> str | None:
    """Detect canvas format from an SVG file's viewBox.

    Args:
        svg_path: Path to the SVG file.

    Returns:
        Canvas format key (e.g. 'ppt169'), or None if not detected.
    """
    try:
        with open(svg_path, 'r', encoding='utf-8') as f:
            content = f.read(2000)

        match = re.search(r'viewBox="([^"]+)"', content)
        if match:
            viewbox = match.group(1)
            for fmt_key, fmt_info in CANVAS_FORMATS.items():
                if fmt_info['viewbox'] == viewbox:
                    return fmt_key
    except Exception:
        pass
    return None
