"""DrawingML <a:effectLst> -> SVG <filter> conversion.

Reverse of svg_to_pptx/drawingml_styles.build_effect_xml.

Covers the most common DrawingML effects:
- <a:outerShdw>  -> feDropShadow (or feGaussianBlur+feOffset+feFlood)
- <a:innerShdw>  -> approximated via inverted SourceAlpha pipeline
- <a:glow>       -> outer glow (no offset, uses flood color)
- <a:blur>       -> feGaussianBlur on whole shape
- <a:softEdge>   -> feGaussianBlur (approximation; SVG has no direct match)

Output: each call returns (filter_id, defs_xml). Caller adds filter="url(#id)"
to the shape and accumulates defs_xml into the slide's <defs>.
"""

from __future__ import annotations

import math
from xml.etree import ElementTree as ET

from .color_resolver import ColorPalette, find_color_elem, resolve_color
from .emu_units import NS, emu_to_px, fmt_num


def convert_effects(
    sp_pr: ET.Element | None,
    palette: ColorPalette | None,
    *,
    id_prefix: str = "fx",
    id_seq: list[int] | None = None,
) -> tuple[str | None, list[str]]:
    """Inspect <p:spPr> for <a:effectLst> and return (filter_id, defs_xml).

    If no effect is present returns (None, []). Multiple effects are layered
    inside one <filter> using SVG primitive results.
    """
    if sp_pr is None:
        return None, []
    effect_lst = sp_pr.find("a:effectLst", NS)
    if effect_lst is None:
        return None, []
    if len(list(effect_lst)) == 0:
        return None, []

    if id_seq is None:
        id_seq = [0]
    id_seq[0] += 1
    filter_id = f"{id_prefix}{id_seq[0]}"

    primitives: list[str] = []
    last_result = "SourceGraphic"
    # Filter region needs to extend beyond the bounding box to render shadows
    # and glows; choose generous defaults.
    filter_x = "-25%"
    filter_y = "-25%"
    filter_w = "150%"
    filter_h = "150%"

    for child in list(effect_lst):
        if not isinstance(child.tag, str):
            continue
        local = child.tag.split("}", 1)[-1]
        prim, last_result = _convert_one_effect(child, last_result, palette)
        if prim:
            primitives.append(prim)

    if not primitives:
        return None, []

    defs_xml = (
        f'<filter id="{filter_id}" x="{filter_x}" y="{filter_y}" '
        f'width="{filter_w}" height="{filter_h}">'
        + "".join(primitives)
        + "</filter>"
    )
    return filter_id, [defs_xml]


# ---------------------------------------------------------------------------
# Per-effect conversion
# ---------------------------------------------------------------------------

def _convert_one_effect(
    elem: ET.Element,
    last_result: str,
    palette: ColorPalette | None,
) -> tuple[str, str]:
    """Convert one effect to SVG filter primitives.

    Returns (primitives_xml, new_last_result_name).
    """
    local = elem.tag.split("}", 1)[-1]
    if local == "outerShdw":
        return _outer_shadow(elem, last_result, palette)
    if local == "innerShdw":
        return _inner_shadow(elem, last_result, palette)
    if local == "glow":
        return _glow(elem, last_result, palette)
    if local == "blur":
        return _blur(elem, last_result)
    if local == "softEdge":
        return _soft_edge(elem, last_result)
    if local == "reflection":
        # v1 approximation: skip (would require feImage + feFlood + transform)
        return "", last_result
    return "", last_result


def _color_alpha(elem: ET.Element, palette: ColorPalette | None) -> tuple[str, float]:
    color = find_color_elem(elem)
    hex_, alpha = resolve_color(color, palette)
    return hex_ or "#000000", alpha


def _direction_offset(elem: ET.Element) -> tuple[float, float]:
    """Read dir / dist into (dx, dy) px."""
    try:
        direction_units = float(elem.attrib.get("dir", "0"))
        dist_emu = float(elem.attrib.get("dist", "0"))
    except ValueError:
        return 0.0, 0.0
    direction_deg = direction_units / 60000.0
    dist_px = emu_to_px(dist_emu)
    rad = math.radians(direction_deg)
    return dist_px * math.cos(rad), dist_px * math.sin(rad)


def _blur_radius(elem: ET.Element, attr: str = "blurRad", default_emu: float = 0.0) -> float:
    try:
        v = float(elem.attrib.get(attr, str(default_emu)))
    except ValueError:
        return 0.0
    return emu_to_px(v)


def _outer_shadow(elem: ET.Element, last_result: str,
                  palette: ColorPalette | None) -> tuple[str, str]:
    dx, dy = _direction_offset(elem)
    blur = _blur_radius(elem, "blurRad")
    color, alpha = _color_alpha(elem, palette)
    # std deviation ~= blur radius / 2 (rough; PowerPoint shadows are larger)
    std = max(blur / 2.0, 0.1)
    # Use feDropShadow for compactness — it's well-supported in modern browsers.
    return (
        f'<feDropShadow dx="{fmt_num(dx)}" dy="{fmt_num(dy)}" '
        f'stdDeviation="{fmt_num(std)}" '
        f'flood-color="{color}" flood-opacity="{fmt_num(alpha, 4)}"/>',
        "shadow",
    )


def _inner_shadow(elem: ET.Element, last_result: str,
                  palette: ColorPalette | None) -> tuple[str, str]:
    """Inner shadow via inverted alpha + offset + blur + composite-in.

    Approximation: produces a darkened inner edge similar to PowerPoint.
    """
    dx, dy = _direction_offset(elem)
    blur = _blur_radius(elem, "blurRad")
    color, alpha = _color_alpha(elem, palette)
    std = max(blur / 2.0, 0.1)
    # Pipeline:
    #   feFlood (color) -> compose with inverted alpha -> blur -> offset ->
    #   composite-in original alpha
    return (
        f'<feFlood flood-color="{color}" flood-opacity="{fmt_num(alpha, 4)}" result="flood"/>'
        f'<feComposite in="flood" in2="SourceAlpha" operator="out" result="inverted"/>'
        f'<feGaussianBlur in="inverted" stdDeviation="{fmt_num(std)}" result="blurred"/>'
        f'<feOffset in="blurred" dx="{fmt_num(dx)}" dy="{fmt_num(dy)}" result="offset"/>'
        f'<feComposite in="offset" in2="SourceAlpha" operator="in" result="innerShadow"/>'
        f'<feMerge><feMergeNode in="SourceGraphic"/><feMergeNode in="innerShadow"/></feMerge>',
        "innerShadow",
    )


def _glow(elem: ET.Element, last_result: str,
          palette: ColorPalette | None) -> tuple[str, str]:
    rad = _blur_radius(elem, "rad")
    color, alpha = _color_alpha(elem, palette)
    std = max(rad / 2.0, 0.1)
    return (
        f'<feMorphology operator="dilate" radius="{fmt_num(rad / 4.0)}" '
        f'in="SourceAlpha" result="dilated"/>'
        f'<feGaussianBlur in="dilated" stdDeviation="{fmt_num(std)}" result="blurred"/>'
        f'<feFlood flood-color="{color}" flood-opacity="{fmt_num(alpha, 4)}" result="flood"/>'
        f'<feComposite in="flood" in2="blurred" operator="in" result="glow"/>'
        f'<feMerge><feMergeNode in="glow"/><feMergeNode in="SourceGraphic"/></feMerge>',
        "glow",
    )


def _blur(elem: ET.Element, last_result: str) -> tuple[str, str]:
    rad = _blur_radius(elem, "rad")
    std = max(rad / 2.0, 0.1)
    return (
        f'<feGaussianBlur stdDeviation="{fmt_num(std)}"/>',
        "blurred",
    )


def _soft_edge(elem: ET.Element, last_result: str) -> tuple[str, str]:
    # softEdge fades the edges; approximate with an alpha-only Gaussian blur
    # then composite-in. v1 just outputs a gentle blur.
    rad = _blur_radius(elem, "rad")
    std = max(rad / 4.0, 0.1)
    return (
        f'<feGaussianBlur in="SourceAlpha" stdDeviation="{fmt_num(std)}" result="softEdge"/>'
        f'<feComposite in="SourceGraphic" in2="softEdge" operator="in"/>',
        "softEdge",
    )
