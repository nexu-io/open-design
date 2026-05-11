"""svg_to_pptx — SVG to PPTX conversion package.

Public API:
    - main(): CLI entry point
    - convert_svg_to_slide_shapes(): SVG -> DrawingML slide XML
    - create_pptx_with_native_svg(): Build PPTX from SVG files
"""

from .pptx_cli import main
from .drawingml_converter import convert_svg_to_slide_shapes
from .pptx_builder import create_pptx_with_native_svg

__all__ = [
    'main',
    'convert_svg_to_slide_shapes',
    'create_pptx_with_native_svg',
]
