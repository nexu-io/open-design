"""DrawingML fill -> SVG fill conversion.

Handles:
- <a:solidFill>     -> fill="#XXXXXX" (+ fill-opacity)
- <a:noFill/>       -> fill="none"
- <a:gradFill>      -> linearGradient/radialGradient in <defs>, fill="url(#id)"
- <a:blipFill>      -> handled by pic_to_svg (this module short-circuits)

Returned FillResult is a struct of attribute dict + optional <defs> XML so the
slide assembler can collect gradient defs without conflicting IDs.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from xml.etree import ElementTree as ET

from .color_resolver import ColorPalette, find_color_elem, resolve_color
from .emu_units import NS, fmt_num, percent_to_ratio


@dataclass
class FillResult:
    """Resolved fill: SVG attributes to apply + optional <defs> entries."""

    attrs: dict[str, str] = field(default_factory=dict)
    defs: list[str] = field(default_factory=list)  # XML strings of <linearGradient>/<radialGradient>

    @classmethod
    def none_fill(cls) -> "FillResult":
        return cls(attrs={"fill": "none"})

    @classmethod
    def inherit(cls) -> "FillResult":
        # No fill resolved — let caller decide whether to default
        return cls()


def resolve_fill(
    sp_pr: ET.Element | None,
    palette: ColorPalette | None,
    *,
    id_prefix: str = "g",
    id_seq: list[int] | None = None,
    placeholder_hex: str | None = None,
) -> FillResult:
    """Inspect <p:spPr>'s fill children and emit an SVG fill descriptor.

    Args:
        sp_pr: <p:spPr> or any element that may directly hold a fill child.
        palette: ColorPalette for scheme color resolution.
        id_prefix: prefix for generated gradient IDs.
        id_seq: external counter (single-element list) so callers can share
            unique gradient IDs across the whole slide.

    Returns:
        FillResult. If no recognized fill is found, result.attrs is empty —
        the caller should apply its own default (typically transparent /
        inherit from the source SVG).
    """
    if sp_pr is None:
        return FillResult.inherit()

    # Direct child fill (in priority order: explicit -> derived).
    handlers = (
        ("noFill", _resolve_no_fill),
        ("solidFill", _resolve_solid_fill),
        ("gradFill", _resolve_grad_fill),
        ("blipFill", _resolve_blip_fill),
        ("pattFill", _resolve_patt_fill),
    )

    local_name = sp_pr.tag.split("}", 1)[-1] if isinstance(sp_pr.tag, str) else ""
    for tag, handler in handlers:
        if local_name == tag:
            return handler(sp_pr, palette, id_prefix, id_seq, placeholder_hex)

    for tag, handler in handlers:
        elem = sp_pr.find(f"a:{tag}", NS)
        if elem is not None:
            return handler(elem, palette, id_prefix, id_seq, placeholder_hex)

    return FillResult.inherit()


# ---------------------------------------------------------------------------
# Per-fill handlers
# ---------------------------------------------------------------------------

def _resolve_no_fill(_elem, _palette, _prefix, _seq, _placeholder_hex) -> FillResult:
    return FillResult.none_fill()


def _resolve_solid_fill(elem: ET.Element, palette: ColorPalette | None,
                        _prefix: str, _seq, placeholder_hex: str | None) -> FillResult:
    color_elem = find_color_elem(elem)
    hex_, alpha = resolve_color(color_elem, palette, placeholder_hex=placeholder_hex)
    if hex_ is None:
        return FillResult.inherit()
    attrs: dict[str, str] = {"fill": hex_}
    if alpha < 1.0:
        attrs["fill-opacity"] = fmt_num(alpha, 4)
    return FillResult(attrs=attrs)


def _resolve_grad_fill(elem: ET.Element, palette: ColorPalette | None,
                       prefix: str, seq, placeholder_hex: str | None) -> FillResult:
    """Convert <a:gradFill> to an SVG linearGradient or radialGradient."""
    if seq is None:
        seq = [0]
    seq[0] += 1
    grad_id = f"{prefix}grad{seq[0]}"

    # Stops
    gs_lst = elem.find("a:gsLst", NS)
    if gs_lst is None:
        return FillResult.inherit()
    stops_xml = []
    for gs in gs_lst.findall("a:gs", NS):
        pos_pct = percent_to_ratio(gs.attrib.get("pos"), default=0.0)
        color_elem = find_color_elem(gs)
        hex_, alpha = resolve_color(color_elem, palette, placeholder_hex=placeholder_hex)
        if hex_ is None:
            continue
        opacity_attr = f' stop-opacity="{fmt_num(alpha, 4)}"' if alpha < 1.0 else ""
        stops_xml.append(
            f'<stop offset="{fmt_num(pos_pct, 4)}" stop-color="{hex_}"{opacity_attr}/>'
        )
    if not stops_xml:
        return FillResult.inherit()

    # Linear vs radial vs path
    lin = elem.find("a:lin", NS)
    rad = elem.find("a:path", NS)

    if lin is not None:
        # ang is 1/60000 deg. 0° = horizontal left-to-right.
        try:
            angle_deg = float(lin.attrib.get("ang", "0")) / 60000.0
        except ValueError:
            angle_deg = 0.0
        x1, y1, x2, y2 = _angle_to_unit_endpoints(angle_deg)
        defs_xml = (
            f'<linearGradient id="{grad_id}" '
            f'x1="{fmt_num(x1, 4)}" y1="{fmt_num(y1, 4)}" '
            f'x2="{fmt_num(x2, 4)}" y2="{fmt_num(y2, 4)}">'
            + "".join(stops_xml)
            + "</linearGradient>"
        )
    elif rad is not None:
        # Treat as radial regardless of path="circle" / "rect" / "shape" — SVG
        # only has circle/ellipse, and path="circle" maps to fillToRect=center.
        defs_xml = (
            f'<radialGradient id="{grad_id}" cx="0.5" cy="0.5" r="0.5">'
            + "".join(stops_xml)
            + "</radialGradient>"
        )
    else:
        # No direction specified — default to horizontal linear
        defs_xml = (
            f'<linearGradient id="{grad_id}" x1="0" y1="0" x2="1" y2="0">'
            + "".join(stops_xml)
            + "</linearGradient>"
        )

    return FillResult(
        attrs={"fill": f"url(#{grad_id})"},
        defs=[defs_xml],
    )


def _resolve_blip_fill(_elem, _palette, _prefix, _seq, _placeholder_hex) -> FillResult:
    """blipFill on <p:spPr> means a shape filled with an image — handled at
    pic_to_svg level. For now mark as transparent so the shape's outline
    still draws and pic_to_svg can layer the image on top.
    """
    return FillResult.none_fill()


def _resolve_patt_fill(elem: ET.Element, palette: ColorPalette | None,
                       _prefix, _seq, placeholder_hex: str | None) -> FillResult:
    """Pattern fills (<a:pattFill prst="..."/> with fg/bg colors). Approximate
    with the foreground color so the shape isn't transparent. Future work:
    emit a real <pattern> in defs.
    """
    fg = elem.find("a:fgClr", NS)
    color_elem = find_color_elem(fg)
    hex_, alpha = resolve_color(color_elem, palette, placeholder_hex=placeholder_hex)
    if hex_ is None:
        return FillResult.inherit()
    attrs: dict[str, str] = {"fill": hex_}
    if alpha < 1.0:
        attrs["fill-opacity"] = fmt_num(alpha, 4)
    return FillResult(attrs=attrs)


# ---------------------------------------------------------------------------
# Geometry helpers
# ---------------------------------------------------------------------------

def _angle_to_unit_endpoints(angle_deg: float) -> tuple[float, float, float, float]:
    """Convert a DrawingML linear gradient angle to SVG x1/y1/x2/y2 in unit box.

    DrawingML 0° = horizontal pointing right; angle is clockwise.
    SVG default linearGradient is also unit-box (objectBoundingBox).
    """
    rad = math.radians(angle_deg % 360)
    cos_a = math.cos(rad)
    sin_a = math.sin(rad)
    # Center of unit box
    cx, cy = 0.5, 0.5
    # Half-extent in the direction of the angle vector.
    # We project the unit box onto the angle direction; the line endpoints are
    # the projections of the box corners.
    half = abs(cos_a) * 0.5 + abs(sin_a) * 0.5
    x1 = cx - cos_a * half
    y1 = cy - sin_a * half
    x2 = cx + cos_a * half
    y2 = cy + sin_a * half
    return x1, y1, x2, y2
