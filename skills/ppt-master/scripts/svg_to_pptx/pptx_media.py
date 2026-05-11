"""SVG to PNG conversion for Office compatibility mode."""

from __future__ import annotations

from pathlib import Path

# SVG to PNG library detection
# Prefer CairoSVG (better quality), fall back to svglib
PNG_RENDERER: str | None = None

try:
    import cairosvg
    PNG_RENDERER = 'cairosvg'
except (ImportError, OSError):
    try:
        from svglib.svglib import svg2rlg
        from reportlab.graphics import renderPM
        PNG_RENDERER = 'svglib'
    except (ImportError, OSError):
        pass


def get_png_renderer_info() -> tuple[str | None, str, str | None]:
    """Get PNG renderer status information.

    Returns:
        (renderer_name, status_text, install_hint) tuple.
    """
    if PNG_RENDERER == 'cairosvg':
        return ('cairosvg', '(full gradient/filter support)', None)
    elif PNG_RENDERER == 'svglib':
        return ('svglib', '(some gradients may be lost)',
                'Install cairosvg for better results: pip install cairosvg')
    else:
        return (None, '(not installed)',
                'Install via: pip install cairosvg or pip install svglib reportlab')


def convert_svg_to_png(
    svg_path: Path,
    png_path: Path,
    width: int | None = None,
    height: int | None = None,
) -> bool:
    """Convert SVG to PNG using the available renderer.

    Args:
        svg_path: SVG file path.
        png_path: Output PNG file path.
        width: Output width in pixels.
        height: Output height in pixels.

    Returns:
        Whether the conversion was successful.
    """
    if PNG_RENDERER is None:
        return False

    try:
        if PNG_RENDERER == 'cairosvg':
            cairosvg.svg2png(
                url=str(svg_path),
                write_to=str(png_path),
                output_width=width,
                output_height=height,
            )
            return True

        elif PNG_RENDERER == 'svglib':
            drawing = svg2rlg(str(svg_path))
            if drawing is None:
                print(f"  Warning: Unable to parse SVG ({svg_path.name})")
                return False
            renderPM.drawToFile(
                drawing,
                str(png_path),
                fmt="PNG",
                configPIL={'quality': 95},
            )
            return True

    except Exception as e:
        print(f"  Warning: SVG to PNG conversion failed ({svg_path.name}): {e}")
        return False

    return False
