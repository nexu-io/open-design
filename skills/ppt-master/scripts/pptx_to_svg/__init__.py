"""PPTX -> SVG semantic converter (reverse of svg_to_pptx).

Reads OOXML (DrawingML) directly from a .pptx zip archive and emits SVG with
shape-level fidelity: <p:sp prst="rect"> -> <rect>, <p:txBody> -> <text>, etc.

Public entry: convert_pptx_to_svg().
"""

from __future__ import annotations

from .converter import convert_pptx_to_svg

__all__ = ["convert_pptx_to_svg"]
