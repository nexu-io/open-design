"""DrawingML <a:prstGeom> -> SVG geometry conversion.

svg_to_pptx only emits 4 prstGeom presets (rect / roundRect / ellipse / line);
everything else goes through custGeom. So the reverse pipeline only needs
strong support for those four to handle round-tripped decks. We additionally
include an extended preset map covering the most common PowerPoint-authored
shapes (triangle, diamond, hexagon, parallelogram, arrow, star, etc.) so
hand-built decks like muban.pptx don't fall through to a placeholder.

Each handler returns a SHAPE_TAG + attribute dict that the slide assembler
wraps with fill/stroke/effect attributes plus the absolute (x, y) translation.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from xml.etree import ElementTree as ET

from .emu_units import NS, Xfrm, fmt_num


# ---------------------------------------------------------------------------
# GeomResult
# ---------------------------------------------------------------------------

@dataclass
class GeomResult:
    """Result of converting a prst preset to SVG.

    `tag` is the SVG element tag (rect / ellipse / line / polygon / path /
    polyline). `attrs` are absolute SVG coordinates already in slide space.
    `path_d` (when tag == 'path') is the d attribute. The slide assembler
    merges fill/stroke attrs from fill_to_svg/ln_to_svg.
    """

    tag: str
    attrs: dict[str, str] = field(default_factory=dict)
    # When tag == 'path' use path_d for the d attribute.
    path_d: str | None = None
    # When tag == 'polygon' / 'polyline' use points for the points attribute.
    points: str | None = None


# ---------------------------------------------------------------------------
# Adjustment helper
# ---------------------------------------------------------------------------

def _adj_value(sp_pr: ET.Element | None, adj_name: str = "adj",
               default_pct: float = 0.0) -> float:
    """Read an adjustment value from <a:avLst><a:gd name="..." fmla="val N"/>.

    Returns the value as a fraction in [0, 1] of the relevant dimension. If
    the gd is absent or the formula is unparseable, returns default_pct.
    """
    if sp_pr is None:
        return default_pct
    av_lst = sp_pr.find(".//a:avLst", NS)
    if av_lst is None:
        return default_pct
    for gd in av_lst.findall("a:gd", NS):
        if gd.attrib.get("name") == adj_name:
            fmla = gd.attrib.get("fmla", "")
            if fmla.startswith("val "):
                try:
                    return float(fmla[4:]) / 100000.0
                except ValueError:
                    return default_pct
    return default_pct


# ---------------------------------------------------------------------------
# Dispatch
# ---------------------------------------------------------------------------

def convert_prst_geom(
    prst: str,
    xfrm: Xfrm,
    sp_pr: ET.Element | None,
) -> GeomResult | None:
    """Convert <a:prstGeom prst="..."> to a GeomResult.

    Returns None if the preset has no v1 mapping; the caller can then choose
    to render a fallback rect.
    """
    if prst == "line":
        if xfrm.w == 0 and xfrm.h == 0:
            return None
        return _line(xfrm, sp_pr)
    if xfrm.w <= 0 or xfrm.h <= 0:
        return None
    handler = _PRESET_HANDLERS.get(prst)
    if handler is None:
        return None
    return handler(xfrm, sp_pr)


# ---------------------------------------------------------------------------
# Per-preset handlers
# ---------------------------------------------------------------------------

def _rect(xfrm: Xfrm, _sp_pr) -> GeomResult:
    return GeomResult(
        tag="rect",
        attrs={
            "x": fmt_num(xfrm.x),
            "y": fmt_num(xfrm.y),
            "width": fmt_num(xfrm.w),
            "height": fmt_num(xfrm.h),
        },
    )


def _round_rect(xfrm: Xfrm, sp_pr) -> GeomResult:
    """roundRect adj = ratio of corner radius to half of shorter side.

    DrawingML default adj = 16667 (16.667%) when avLst is absent.
    """
    adj = _adj_value(sp_pr, "adj", default_pct=0.16667)
    short = min(xfrm.w, xfrm.h)
    radius = adj * short / 2.0  # adj is fraction of "half shorter side"
    # Actually DrawingML "adj" for roundRect is fraction of the shorter side
    # itself (i.e. up to 50000 = half side = capsule). svg_to_pptx writes
    # adj = radius / shorterSide * 100000, so we invert: radius = adj * shorter.
    radius = adj * short
    radius = min(radius, short / 2.0)
    return GeomResult(
        tag="rect",
        attrs={
            "x": fmt_num(xfrm.x),
            "y": fmt_num(xfrm.y),
            "width": fmt_num(xfrm.w),
            "height": fmt_num(xfrm.h),
            "rx": fmt_num(radius),
            "ry": fmt_num(radius),
        },
    )


def _round_2_diag_rect(xfrm: Xfrm, sp_pr) -> GeomResult:
    """Rectangle with two diagonal rounded corners.

    DrawingML's round2DiagRect rounds the top-left and bottom-right corners.
    SVG has no direct primitive for per-corner radii, so emit a native-friendly
    path with quadratic curves.
    """
    adj = _adj_value(sp_pr, "adj", default_pct=0.16667)
    r = min(adj * min(xfrm.w, xfrm.h), min(xfrm.w, xfrm.h) / 2.0)
    x, y, w, h = xfrm.x, xfrm.y, xfrm.w, xfrm.h
    d = (
        f"M {fmt_num(x + r)} {fmt_num(y)} "
        f"L {fmt_num(x + w)} {fmt_num(y)} "
        f"L {fmt_num(x + w)} {fmt_num(y + h - r)} "
        f"Q {fmt_num(x + w)} {fmt_num(y + h)} {fmt_num(x + w - r)} {fmt_num(y + h)} "
        f"L {fmt_num(x)} {fmt_num(y + h)} "
        f"L {fmt_num(x)} {fmt_num(y + r)} "
        f"Q {fmt_num(x)} {fmt_num(y)} {fmt_num(x + r)} {fmt_num(y)} Z"
    )
    return GeomResult(tag="path", path_d=d)


def _ellipse(xfrm: Xfrm, _sp_pr) -> GeomResult:
    cx = xfrm.x + xfrm.w / 2.0
    cy = xfrm.y + xfrm.h / 2.0
    rx = xfrm.w / 2.0
    ry = xfrm.h / 2.0
    return GeomResult(
        tag="ellipse",
        attrs={
            "cx": fmt_num(cx), "cy": fmt_num(cy),
            "rx": fmt_num(rx), "ry": fmt_num(ry),
        },
    )


def _line(xfrm: Xfrm, _sp_pr) -> GeomResult:
    # cxnSp line endpoints: x1,y1 = (x, y); x2,y2 = (x+w, y+h). flipH/flipV
    # already baked into the xfrm via to_svg_transform.
    return GeomResult(
        tag="line",
        attrs={
            "x1": fmt_num(xfrm.x), "y1": fmt_num(xfrm.y),
            "x2": fmt_num(xfrm.x + xfrm.w), "y2": fmt_num(xfrm.y + xfrm.h),
        },
    )


# ---------- Polygon-based shapes ----------

def _polygon(points: list[tuple[float, float]]) -> GeomResult:
    pts = " ".join(f"{fmt_num(x)},{fmt_num(y)}" for x, y in points)
    return GeomResult(tag="polygon", points=pts)


def _triangle(xfrm: Xfrm, sp_pr) -> GeomResult:
    """Isoceles triangle. adj controls apex x position (default 50%)."""
    adj = _adj_value(sp_pr, "adj", default_pct=0.5)
    apex_x = xfrm.x + adj * xfrm.w
    return _polygon([
        (apex_x, xfrm.y),
        (xfrm.x + xfrm.w, xfrm.y + xfrm.h),
        (xfrm.x, xfrm.y + xfrm.h),
    ])


def _rt_triangle(xfrm: Xfrm, _sp_pr) -> GeomResult:
    return _polygon([
        (xfrm.x, xfrm.y),
        (xfrm.x, xfrm.y + xfrm.h),
        (xfrm.x + xfrm.w, xfrm.y + xfrm.h),
    ])


def _diamond(xfrm: Xfrm, _sp_pr) -> GeomResult:
    cx = xfrm.x + xfrm.w / 2.0
    cy = xfrm.y + xfrm.h / 2.0
    return _polygon([
        (cx, xfrm.y),
        (xfrm.x + xfrm.w, cy),
        (cx, xfrm.y + xfrm.h),
        (xfrm.x, cy),
    ])


def _parallelogram(xfrm: Xfrm, sp_pr) -> GeomResult:
    """adj = horizontal skew offset as fraction of width (default 25%)."""
    adj = _adj_value(sp_pr, "adj", default_pct=0.25)
    skew = adj * xfrm.w
    return _polygon([
        (xfrm.x + skew, xfrm.y),
        (xfrm.x + xfrm.w, xfrm.y),
        (xfrm.x + xfrm.w - skew, xfrm.y + xfrm.h),
        (xfrm.x, xfrm.y + xfrm.h),
    ])


def _trapezoid(xfrm: Xfrm, sp_pr) -> GeomResult:
    """adj = horizontal inset of top edge (default 25%)."""
    adj = _adj_value(sp_pr, "adj", default_pct=0.25)
    inset = adj * xfrm.w
    return _polygon([
        (xfrm.x + inset, xfrm.y),
        (xfrm.x + xfrm.w - inset, xfrm.y),
        (xfrm.x + xfrm.w, xfrm.y + xfrm.h),
        (xfrm.x, xfrm.y + xfrm.h),
    ])


def _regular_polygon(xfrm: Xfrm, n_sides: int, *, rot_deg: float = -90.0) -> GeomResult:
    """Regular polygon inscribed in the bounding box."""
    cx = xfrm.x + xfrm.w / 2.0
    cy = xfrm.y + xfrm.h / 2.0
    rx = xfrm.w / 2.0
    ry = xfrm.h / 2.0
    pts: list[tuple[float, float]] = []
    for i in range(n_sides):
        ang = math.radians(rot_deg + i * 360.0 / n_sides)
        pts.append((cx + rx * math.cos(ang), cy + ry * math.sin(ang)))
    return _polygon(pts)


def _pentagon(xfrm: Xfrm, _sp_pr) -> GeomResult:
    return _regular_polygon(xfrm, 5)


def _hexagon(xfrm: Xfrm, _sp_pr) -> GeomResult:
    return _regular_polygon(xfrm, 6, rot_deg=0)


def _heptagon(xfrm: Xfrm, _sp_pr) -> GeomResult:
    return _regular_polygon(xfrm, 7)


def _octagon(xfrm: Xfrm, _sp_pr) -> GeomResult:
    return _regular_polygon(xfrm, 8, rot_deg=22.5)


def _decagon(xfrm: Xfrm, _sp_pr) -> GeomResult:
    return _regular_polygon(xfrm, 10)


def _dodecagon(xfrm: Xfrm, _sp_pr) -> GeomResult:
    return _regular_polygon(xfrm, 12)


def _star(n_points: int):
    def handler(xfrm: Xfrm, _sp_pr) -> GeomResult:
        cx = xfrm.x + xfrm.w / 2.0
        cy = xfrm.y + xfrm.h / 2.0
        r_outer_x = xfrm.w / 2.0
        r_outer_y = xfrm.h / 2.0
        # Inner radius: classic 5-pointed star uses ~0.382 of outer.
        inner_ratio = 0.382 if n_points == 5 else 0.5
        r_inner_x = r_outer_x * inner_ratio
        r_inner_y = r_outer_y * inner_ratio
        pts: list[tuple[float, float]] = []
        for i in range(n_points * 2):
            angle = math.radians(-90 + i * (360.0 / (n_points * 2)))
            rx = r_outer_x if i % 2 == 0 else r_inner_x
            ry = r_outer_y if i % 2 == 0 else r_inner_y
            pts.append((cx + rx * math.cos(angle), cy + ry * math.sin(angle)))
        return _polygon(pts)
    return handler


# ---------- Arrow shapes ----------

def _right_arrow(xfrm: Xfrm, sp_pr) -> GeomResult:
    """Right-pointing block arrow. adj1 = head width / shape height (50%);
    adj2 = head length / shape width (50%)."""
    adj1 = _adj_value(sp_pr, "adj1", default_pct=0.5)
    adj2 = _adj_value(sp_pr, "adj2", default_pct=0.5)
    head_h = xfrm.h * adj1
    head_w = xfrm.w * adj2
    body_y_top = xfrm.y + (xfrm.h - head_h) / 2.0
    body_y_bot = xfrm.y + (xfrm.h + head_h) / 2.0
    head_x = xfrm.x + xfrm.w - head_w
    return _polygon([
        (xfrm.x, body_y_top),
        (head_x, body_y_top),
        (head_x, xfrm.y),
        (xfrm.x + xfrm.w, xfrm.y + xfrm.h / 2.0),
        (head_x, xfrm.y + xfrm.h),
        (head_x, body_y_bot),
        (xfrm.x, body_y_bot),
    ])


def _left_arrow(xfrm: Xfrm, sp_pr) -> GeomResult:
    adj1 = _adj_value(sp_pr, "adj1", default_pct=0.5)
    adj2 = _adj_value(sp_pr, "adj2", default_pct=0.5)
    head_h = xfrm.h * adj1
    head_w = xfrm.w * adj2
    body_y_top = xfrm.y + (xfrm.h - head_h) / 2.0
    body_y_bot = xfrm.y + (xfrm.h + head_h) / 2.0
    head_x = xfrm.x + head_w
    return _polygon([
        (xfrm.x + xfrm.w, body_y_top),
        (head_x, body_y_top),
        (head_x, xfrm.y),
        (xfrm.x, xfrm.y + xfrm.h / 2.0),
        (head_x, xfrm.y + xfrm.h),
        (head_x, body_y_bot),
        (xfrm.x + xfrm.w, body_y_bot),
    ])


def _down_arrow(xfrm: Xfrm, sp_pr) -> GeomResult:
    adj1 = _adj_value(sp_pr, "adj1", default_pct=0.5)
    adj2 = _adj_value(sp_pr, "adj2", default_pct=0.5)
    head_w = xfrm.w * adj1
    head_h = xfrm.h * adj2
    body_x_l = xfrm.x + (xfrm.w - head_w) / 2.0
    body_x_r = xfrm.x + (xfrm.w + head_w) / 2.0
    head_y = xfrm.y + xfrm.h - head_h
    return _polygon([
        (body_x_l, xfrm.y),
        (body_x_l, head_y),
        (xfrm.x, head_y),
        (xfrm.x + xfrm.w / 2.0, xfrm.y + xfrm.h),
        (xfrm.x + xfrm.w, head_y),
        (body_x_r, head_y),
        (body_x_r, xfrm.y),
    ])


def _up_arrow(xfrm: Xfrm, sp_pr) -> GeomResult:
    adj1 = _adj_value(sp_pr, "adj1", default_pct=0.5)
    adj2 = _adj_value(sp_pr, "adj2", default_pct=0.5)
    head_w = xfrm.w * adj1
    head_h = xfrm.h * adj2
    body_x_l = xfrm.x + (xfrm.w - head_w) / 2.0
    body_x_r = xfrm.x + (xfrm.w + head_w) / 2.0
    head_y = xfrm.y + head_h
    return _polygon([
        (body_x_l, xfrm.y + xfrm.h),
        (body_x_l, head_y),
        (xfrm.x, head_y),
        (xfrm.x + xfrm.w / 2.0, xfrm.y),
        (xfrm.x + xfrm.w, head_y),
        (body_x_r, head_y),
        (body_x_r, xfrm.y + xfrm.h),
    ])


# ---------- Decorative shapes ----------

def _plaque(xfrm: Xfrm, sp_pr) -> GeomResult:
    """Approximate DrawingML plaque with concave curved corner cuts."""
    adj = _adj_value(sp_pr, "adj", default_pct=0.16667)
    r = min(adj * min(xfrm.w, xfrm.h), min(xfrm.w, xfrm.h) / 2.0)
    x, y, w, h = xfrm.x, xfrm.y, xfrm.w, xfrm.h
    d = (
        f"M {fmt_num(x + r)} {fmt_num(y)} "
        f"L {fmt_num(x + w - r)} {fmt_num(y)} "
        f"Q {fmt_num(x + w - r)} {fmt_num(y + r)} {fmt_num(x + w)} {fmt_num(y + r)} "
        f"L {fmt_num(x + w)} {fmt_num(y + h - r)} "
        f"Q {fmt_num(x + w - r)} {fmt_num(y + h - r)} {fmt_num(x + w - r)} {fmt_num(y + h)} "
        f"L {fmt_num(x + r)} {fmt_num(y + h)} "
        f"Q {fmt_num(x + r)} {fmt_num(y + h - r)} {fmt_num(x)} {fmt_num(y + h - r)} "
        f"L {fmt_num(x)} {fmt_num(y + r)} "
        f"Q {fmt_num(x + r)} {fmt_num(y + r)} {fmt_num(x + r)} {fmt_num(y)} Z"
    )
    return GeomResult(tag="path", path_d=d)


# ---------- Pie / chord / arc (path-based) ----------

def _pie(xfrm: Xfrm, sp_pr) -> GeomResult:
    """Pie slice. adj1 = start angle, adj2 = end angle (1/60000 deg)."""
    adj1 = _adj_value(sp_pr, "adj1", default_pct=0.0)  # default 0°
    adj2 = _adj_value(sp_pr, "adj2", default_pct=270.0 / 360.0)  # default 270°
    # adj is in 100000ths of percent → degrees by * 360
    start_deg = adj1 * 360.0
    end_deg = adj2 * 360.0
    return _arc_path(xfrm, start_deg, end_deg, mode="pie")


def _chord(xfrm: Xfrm, sp_pr) -> GeomResult:
    adj1 = _adj_value(sp_pr, "adj1", default_pct=0.0)
    adj2 = _adj_value(sp_pr, "adj2", default_pct=270.0 / 360.0)
    return _arc_path(xfrm, adj1 * 360.0, adj2 * 360.0, mode="chord")


def _arc(xfrm: Xfrm, sp_pr) -> GeomResult:
    adj1 = _adj_value(sp_pr, "adj1", default_pct=270.0 / 360.0)
    adj2 = _adj_value(sp_pr, "adj2", default_pct=0.0)
    return _arc_path(xfrm, adj1 * 360.0, adj2 * 360.0, mode="arc")


def _arc_path(xfrm: Xfrm, start_deg: float, end_deg: float, *, mode: str) -> GeomResult:
    cx = xfrm.x + xfrm.w / 2.0
    cy = xfrm.y + xfrm.h / 2.0
    rx = xfrm.w / 2.0
    ry = xfrm.h / 2.0
    sa = math.radians(start_deg)
    ea = math.radians(end_deg)
    sx = cx + rx * math.cos(sa)
    sy = cy + ry * math.sin(sa)
    ex = cx + rx * math.cos(ea)
    ey = cy + ry * math.sin(ea)
    # Sweep direction: PowerPoint draws clockwise; SVG arc sweep_flag = 1 = clockwise.
    delta = (end_deg - start_deg) % 360.0
    large_arc = 1 if delta > 180 else 0
    sweep = 1
    parts = [f"M {fmt_num(sx)} {fmt_num(sy)}",
             f"A {fmt_num(rx)} {fmt_num(ry)} 0 {large_arc} {sweep} {fmt_num(ex)} {fmt_num(ey)}"]
    if mode == "pie":
        parts.append(f"L {fmt_num(cx)} {fmt_num(cy)}")
        parts.append("Z")
    elif mode == "chord":
        parts.append("Z")
    return GeomResult(tag="path", path_d=" ".join(parts))


# ---------------------------------------------------------------------------
# Preset table
# ---------------------------------------------------------------------------

_PRESET_HANDLERS = {
    # Core 4 (svg_to_pptx round-trip)
    "rect": _rect,
    "roundRect": _round_rect,
    "round2DiagRect": _round_2_diag_rect,
    "ellipse": _ellipse,
    "line": _line,

    # Polygons
    "triangle": _triangle,
    "rtTriangle": _rt_triangle,
    "diamond": _diamond,
    "parallelogram": _parallelogram,
    "trapezoid": _trapezoid,
    "pentagon": _pentagon,
    "hexagon": _hexagon,
    "heptagon": _heptagon,
    "octagon": _octagon,
    "decagon": _decagon,
    "dodecagon": _dodecagon,

    # Stars
    "star4": _star(4),
    "star5": _star(5),
    "star6": _star(6),
    "star7": _star(7),
    "star8": _star(8),
    "star10": _star(10),
    "star12": _star(12),
    "star16": _star(16),
    "star24": _star(24),
    "star32": _star(32),

    # Arrows
    "rightArrow": _right_arrow,
    "leftArrow": _left_arrow,
    "downArrow": _down_arrow,
    "upArrow": _up_arrow,

    # Decorative
    "plaque": _plaque,

    # Pie / chord / arc
    "pie": _pie,
    "chord": _chord,
    "arc": _arc,
}


def supported_presets() -> set[str]:
    """Return the set of recognized prst values for diagnostics."""
    return set(_PRESET_HANDLERS.keys())
