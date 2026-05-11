"""DrawingML <a:ln> -> SVG stroke conversion.

Reverse of svg_to_pptx/drawingml_styles.build_stroke_xml.

Produces an SVG attribute dict with stroke / stroke-width / stroke-opacity /
stroke-dasharray / stroke-linecap / stroke-linejoin / marker-start /
marker-end (markers also need a <defs> entry which is returned alongside).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from xml.etree import ElementTree as ET

from .color_resolver import ColorPalette, find_color_elem, resolve_color
from .emu_units import NS, emu_to_px, fmt_num


@dataclass
class StrokeResult:
    """Resolved stroke: SVG attributes to apply + optional <defs> for markers."""

    attrs: dict[str, str] = field(default_factory=dict)
    defs: list[str] = field(default_factory=list)


# Reverse of svg_to_pptx DASH_PRESETS (preset name -> dasharray).
PRST_DASH_TO_ARRAY = {
    "solid": None,           # no dasharray
    "dot": "1 3",
    "dash": "4 4",
    "lgDash": "8 4",
    "dashDot": "4 4 1 4",
    "lgDashDot": "8 4 2 4",
    "lgDashDotDot": "8 4 2 4 2 4",
    "sysDash": "3 3",
    "sysDot": "1 3",
    "sysDashDot": "3 3 1 3",
    "sysDashDotDot": "3 3 1 3 1 3",
}

# DrawingML cap -> SVG stroke-linecap
CAP_MAP = {
    "rnd": "round",
    "sq": "square",
    "flat": "butt",
}


def resolve_stroke(
    sp_pr: ET.Element | None,
    palette: ColorPalette | None,
    *,
    id_prefix: str = "m",
    id_seq: list[int] | None = None,
) -> StrokeResult:
    """Resolve <a:ln> child of <p:spPr>.

    Returns:
        StrokeResult.attrs is empty if no <a:ln> present (caller falls back to
        the spec default). If <a:ln> exists with <a:noFill/>, attrs has
        stroke="none".
    """
    if sp_pr is None:
        return StrokeResult()

    ln = sp_pr.find("a:ln", NS)
    if ln is None:
        return StrokeResult()

    attrs: dict[str, str] = {}
    defs: list[str] = []

    # Width (a:ln@w in EMU)
    width_emu = ln.attrib.get("w")
    if width_emu is not None:
        try:
            width_px = emu_to_px(int(width_emu))
            attrs["stroke-width"] = fmt_num(width_px, 3)
        except (ValueError, TypeError):
            pass

    # Cap
    cap = ln.attrib.get("cap")
    if cap and cap in CAP_MAP:
        attrs["stroke-linecap"] = CAP_MAP[cap]

    # Fill: noFill / solidFill / gradFill
    no_fill = ln.find("a:noFill", NS)
    if no_fill is not None:
        attrs["stroke"] = "none"
    else:
        solid = ln.find("a:solidFill", NS)
        if solid is not None:
            color_elem = find_color_elem(solid)
            hex_, alpha = resolve_color(color_elem, palette)
            if hex_:
                attrs["stroke"] = hex_
                if alpha < 1.0:
                    attrs["stroke-opacity"] = fmt_num(alpha, 4)
        else:
            grad = ln.find("a:gradFill", NS)
            if grad is not None:
                # Approximate gradient stroke as the first stop color (SVG
                # supports gradient strokes via fill="url()" but it adds a lot
                # of plumbing; first-stop is good enough for v1).
                first_gs = grad.find("a:gsLst/a:gs", NS)
                if first_gs is not None:
                    color_elem = find_color_elem(first_gs)
                    hex_, alpha = resolve_color(color_elem, palette)
                    if hex_:
                        attrs["stroke"] = hex_
                        if alpha < 1.0:
                            attrs["stroke-opacity"] = fmt_num(alpha, 4)

    # Dash pattern
    prst_dash = ln.find("a:prstDash", NS)
    if prst_dash is not None:
        preset = prst_dash.attrib.get("val", "")
        dasharray = PRST_DASH_TO_ARRAY.get(preset)
        if dasharray:
            attrs["stroke-dasharray"] = dasharray
    else:
        cust_dash = ln.find("a:custDash", NS)
        if cust_dash is not None:
            ds_parts: list[str] = []
            sw = float(attrs.get("stroke-width", "1") or "1") or 1.0
            for ds in cust_dash.findall("a:ds", NS):
                # d, sp are percentages of stroke width (1000ths)
                try:
                    d_pct = int(ds.attrib.get("d", "0"))
                    sp_pct = int(ds.attrib.get("sp", "0"))
                except ValueError:
                    continue
                ds_parts.append(fmt_num(d_pct / 100000.0 * sw, 2))
                ds_parts.append(fmt_num(sp_pct / 100000.0 * sw, 2))
            if ds_parts:
                attrs["stroke-dasharray"] = " ".join(ds_parts)

    # Join
    if ln.find("a:round", NS) is not None:
        attrs["stroke-linejoin"] = "round"
    elif ln.find("a:bevel", NS) is not None:
        attrs["stroke-linejoin"] = "bevel"
    elif ln.find("a:miter", NS) is not None:
        attrs["stroke-linejoin"] = "miter"

    # Arrow markers (head / tail)
    if id_seq is None:
        id_seq = [0]
    for which, attr in (("headEnd", "marker-start"), ("tailEnd", "marker-end")):
        end_elem = ln.find(f"a:{which}", NS)
        if end_elem is None:
            continue
        marker_id, marker_def = _build_arrow_marker(
            end_elem,
            attrs.get("stroke", "#000000"),
            id_prefix=id_prefix,
            seq=id_seq,
            reversed_=(which == "headEnd"),
        )
        if marker_id is None:
            continue
        defs.append(marker_def)
        attrs[attr] = f"url(#{marker_id})"

    return StrokeResult(attrs=attrs, defs=defs)


# ---------------------------------------------------------------------------
# Arrow marker generation
# ---------------------------------------------------------------------------

# Bucket -> markerWidth/markerHeight ratio (in stroke widths)
SIZE_BUCKET = {"sm": 1.5, "med": 2.5, "lg": 3.5}


def _build_arrow_marker(
    end_elem: ET.Element,
    stroke_color: str,
    *,
    id_prefix: str,
    seq: list[int],
    reversed_: bool,
) -> tuple[str | None, str]:
    """Build an SVG <marker> def for an <a:headEnd>/<a:tailEnd>."""
    typ = end_elem.attrib.get("type", "")
    if typ in ("none", ""):
        return None, ""

    w_b = end_elem.attrib.get("w", "med")
    l_b = end_elem.attrib.get("len", "med")
    mw = SIZE_BUCKET.get(l_b, 2.5)
    mh = SIZE_BUCKET.get(w_b, 2.5)

    seq[0] += 1
    marker_id = f"{id_prefix}arrow{seq[0]}"

    # SVG markers are drawn in their own viewBox; we use a 0..10 box and place
    # the path so refX is at the line endpoint.
    if typ == "triangle":
        path = "M 0 0 L 10 5 L 0 10 z"
    elif typ == "stealth":
        path = "M 0 0 L 10 5 L 0 10 L 3 5 z"
    elif typ == "arrow":
        path = "M 0 0 L 10 5 L 0 10"
    elif typ == "diamond":
        path = "M 0 5 L 5 0 L 10 5 L 5 10 z"
    elif typ == "oval":
        path = ""  # use circle below
    else:
        # Unknown type — fall back to triangle so user still sees something
        path = "M 0 0 L 10 5 L 0 10 z"

    if typ == "oval":
        body = f'<circle cx="5" cy="5" r="4" fill="{stroke_color}"/>'
    else:
        body = f'<path d="{path}" fill="{stroke_color}"/>'

    orient = "auto-start-reverse" if reversed_ else "auto"
    fill_attr = "" if typ == "arrow" else ""  # no extra
    # Note: stroke="none" prevents marker from inheriting parent stroke.
    marker_def = (
        f'<marker id="{marker_id}" viewBox="0 0 10 10" '
        f'refX="{"0" if reversed_ else "10"}" refY="5" '
        f'markerWidth="{fmt_num(mw, 2)}" markerHeight="{fmt_num(mh, 2)}" '
        f'orient="{orient}" markerUnits="strokeWidth">'
        f"{body}</marker>"
    )
    return marker_id, marker_def
