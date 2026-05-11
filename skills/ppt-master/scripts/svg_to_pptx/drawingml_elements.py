"""SVG element converters: rect, circle, line, path, polygon, polyline, text, image, ellipse."""

from __future__ import annotations

import io
import math
import re
import base64
from typing import Any
from xml.etree import ElementTree as ET

from .drawingml_context import ConvertContext, ShapeResult
from .drawingml_utils import (
    SVG_NS, XLINK_NS, ANGLE_UNIT, FONT_PX_TO_HUNDREDTHS_PT, DASH_PRESETS,
    px_to_emu, _f, _get_attr,
    ctx_x, ctx_y, ctx_w, ctx_h,
    rect_to_dml_xfrm,
    parse_hex_color, resolve_url_id, get_effective_filter_id,
    parse_font_family, is_cjk_char, estimate_text_width,
    _xml_escape,
)
from .drawingml_styles import (
    build_solid_fill, build_gradient_fill,
    build_fill_xml, build_stroke_xml, build_effect_xml, classify_filter_effect,
    get_fill_opacity, get_stroke_opacity,
)
from .drawingml_paths import (
    PathCommand, parse_svg_path, svg_path_to_absolute,
    normalize_path_commands, path_commands_to_drawingml,
)


def _wrap_shape(
    shape_id: int, name: str,
    off_x: int, off_y: int,
    ext_cx: int, ext_cy: int,
    geom_xml: str, fill_xml: str, stroke_xml: str,
    effect_xml: str = '', extra_xml: str = '',
    rot: int = 0,
) -> str:
    """Wrap DrawingML content into a <p:sp> shape element."""
    rot_attr = f' rot="{rot}"' if rot else ''
    return f'''<p:sp>
<p:nvSpPr>
<p:cNvPr id="{shape_id}" name="{_xml_escape(name)}"/>
<p:cNvSpPr/><p:nvPr/>
</p:nvSpPr>
<p:spPr>
<a:xfrm{rot_attr}><a:off x="{off_x}" y="{off_y}"/><a:ext cx="{ext_cx}" cy="{ext_cy}"/></a:xfrm>
{geom_xml}
{fill_xml}
{stroke_xml}
{effect_xml}
</p:spPr>
{extra_xml}
</p:sp>'''


# ---------------------------------------------------------------------------
# rect
# ---------------------------------------------------------------------------

# Cubic-Bézier control distance for approximating a quarter circle / ellipse.
# Distance from corner to control point along the tangent, expressed as a
# fraction of the radius. Standard "magic number" for a 90° arc (max error
# ~0.027% of the radius).
_BEZIER_QUARTER_K = 0.5522847498


def _build_round_rect_custgeom(w: float, h: float, rx: float, ry: float) -> str:
    """Build a DrawingML ``custGeom`` for a rectangle with elliptical corners.

    Used when ``<rect>`` has rx ≠ ry, which DrawingML's preset ``roundRect``
    cannot express (the preset takes a single ``adj`` shared by all four
    corners and is implicitly symmetric). Each 90° elliptical arc is
    approximated by one cubic Bézier — within 0.03% of the true ellipse, far
    below any visible threshold at slide resolution.

    Trade-off vs. the symmetric ``prstGeom roundRect`` path: this geometry
    is custom, so PowerPoint's yellow corner-radius handle is gone and the
    shape can no longer be retuned in-place. That matches the underlying
    reality — rx ≠ ry has no single "radius" to drag — and remains far
    better than the previous behaviour (silently dropping all corners and
    rendering a hard rectangle).

    Args:
        w, h:   Pixel dimensions of the rectangle (post ctx-scale).
        rx, ry: Pixel corner radii along x and y. Will be clamped to half
                of w / h respectively per the SVG spec.

    Returns:
        A complete ``<a:custGeom>...</a:custGeom>`` XML string. Coordinates
        are emitted in EMU within a path-local coordinate system whose
        ``w`` / ``h`` equal the rectangle's pixel-converted dimensions.
    """
    # Clamp radii (SVG spec): rx > w/2 collapses to a half-circle end.
    rx = min(max(rx, 0.0), w / 2)
    ry = min(max(ry, 0.0), h / 2)

    width_emu = px_to_emu(w)
    height_emu = px_to_emu(h)
    rx_emu = px_to_emu(rx)
    ry_emu = px_to_emu(ry)

    cx_off = int(round(rx_emu * _BEZIER_QUARTER_K))
    cy_off = int(round(ry_emu * _BEZIER_QUARTER_K))

    def pt(x: int, y: int) -> str:
        return f'<a:pt x="{x}" y="{y}"/>'

    def cubic(c1: tuple[int, int], c2: tuple[int, int], end: tuple[int, int]) -> str:
        return (
            f'<a:cubicBezTo>{pt(*c1)}{pt(*c2)}{pt(*end)}</a:cubicBezTo>'
        )

    # Path traversed clockwise, starting just past the top-left corner.
    parts = [
        f'<a:moveTo>{pt(rx_emu, 0)}</a:moveTo>',
        f'<a:lnTo>{pt(width_emu - rx_emu, 0)}</a:lnTo>',
        # Top-right corner: (W-Rx, 0) → (W, Ry)
        cubic(
            (width_emu - rx_emu + cx_off, 0),
            (width_emu, ry_emu - cy_off),
            (width_emu, ry_emu),
        ),
        f'<a:lnTo>{pt(width_emu, height_emu - ry_emu)}</a:lnTo>',
        # Bottom-right corner: (W, H-Ry) → (W-Rx, H)
        cubic(
            (width_emu, height_emu - ry_emu + cy_off),
            (width_emu - rx_emu + cx_off, height_emu),
            (width_emu - rx_emu, height_emu),
        ),
        f'<a:lnTo>{pt(rx_emu, height_emu)}</a:lnTo>',
        # Bottom-left corner: (Rx, H) → (0, H-Ry)
        cubic(
            (rx_emu - cx_off, height_emu),
            (0, height_emu - ry_emu + cy_off),
            (0, height_emu - ry_emu),
        ),
        f'<a:lnTo>{pt(0, ry_emu)}</a:lnTo>',
        # Top-left corner: (0, Ry) → (Rx, 0)
        cubic(
            (0, ry_emu - cy_off),
            (rx_emu - cx_off, 0),
            (rx_emu, 0),
        ),
        '<a:close/>',
    ]

    path_xml = '\n'.join(parts)
    return (
        '<a:custGeom>'
        '<a:avLst/><a:gdLst/><a:ahLst/><a:cxnLst/>'
        '<a:rect l="l" t="t" r="r" b="b"/>'
        f'<a:pathLst><a:path w="{width_emu}" h="{height_emu}">'
        f'\n{path_xml}\n'
        '</a:path></a:pathLst>'
        '</a:custGeom>'
    )


def convert_rect(elem: ET.Element, ctx: ConvertContext) -> ShapeResult | None:
    """Convert SVG <rect> to DrawingML shape.

    Symmetric rounded corners (rx == ry) are emitted as ``prstGeom roundRect``
    so PowerPoint treats them as a native rounded-rectangle shape: the yellow
    adjustment handle stays draggable, and "Reset Picture / Shape" works as
    expected. Elliptical corners (rx != ry) fall back to plain rect geometry
    for now — current corpora contain none, but the branch keeps callers from
    silently producing distorted custom geometry if one ever appears.
    """
    x = ctx_x(_f(elem.get('x')), ctx)
    y = ctx_y(_f(elem.get('y')), ctx)
    w = ctx_w(_f(elem.get('width')), ctx)
    h = ctx_h(_f(elem.get('height')), ctx)

    if w <= 0 or h <= 0:
        return None

    # SVG spec: when only one of rx/ry is specified, the other inherits its
    # value. Real-world svg_output decks always write only `rx`, so ry must
    # be inferred to keep round corners from collapsing to zero on one axis.
    rx_attr = elem.get('rx')
    ry_attr = elem.get('ry')
    rx_raw = _f(rx_attr) if rx_attr is not None else 0.0
    ry_raw = _f(ry_attr) if ry_attr is not None else 0.0
    if rx_attr is not None and ry_attr is None:
        ry_raw = rx_raw
    elif ry_attr is not None and rx_attr is None:
        rx_raw = ry_raw
    rx = rx_raw * ctx.scale_x
    ry = ry_raw * ctx.scale_y

    fill_op = get_fill_opacity(elem, ctx)
    stroke_op = get_stroke_opacity(elem, ctx)
    fill = build_fill_xml(elem, ctx, fill_op)
    stroke = build_stroke_xml(elem, ctx, stroke_op)

    effect = ''
    filt_id = get_effective_filter_id(elem, ctx)
    if filt_id and filt_id in ctx.defs:
        effect = build_effect_xml(ctx.defs[filt_id])

    rot = 0
    transform = elem.get('transform')
    if transform:
        r_match = re.search(r'rotate\(\s*([-\d.]+)', transform)
        if r_match:
            rot = int(float(r_match.group(1)) * ANGLE_UNIT)

    if rx > 0 and abs(rx - ry) < 0.5:
        # Symmetric corners → native PowerPoint rounded rectangle. adj is
        # the corner radius as a fraction of the shorter side, in 1/1000-
        # percent units, capped at 50000 (= radius equals half the shorter
        # side, i.e. capsule end).
        short_side = min(w, h)
        radius = min(rx, short_side / 2)
        adj = max(0, min(50000, int(round(radius / short_side * 100000))))
        geom = (
            '<a:prstGeom prst="roundRect">'
            f'<a:avLst><a:gd name="adj" fmla="val {adj}"/></a:avLst>'
            '</a:prstGeom>'
        )
    elif rx > 0 or ry > 0:
        # Asymmetric corners (rx != ry) → DrawingML has no preset for
        # elliptical-corner rectangles, so emit a custGeom with one cubic
        # Bézier per 90° arc. We lose the prstGeom roundRect adjustment
        # handle, but symmetric and asymmetric cases now both render with
        # rounded corners instead of one of them silently flattening to
        # a hard rectangle.
        geom = _build_round_rect_custgeom(w, h, rx, ry)
    else:
        geom = '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>'

    shape_id = ctx.next_id()
    off_x = px_to_emu(x)
    off_y = px_to_emu(y)
    ext_cx = px_to_emu(w)
    ext_cy = px_to_emu(h)
    return ShapeResult(
        xml=_wrap_shape(
            shape_id, f'Rectangle {shape_id}',
            off_x, off_y, ext_cx, ext_cy,
            geom, fill, stroke, effect, rot=rot,
        ),
        bounds_emu=(off_x, off_y, off_x + ext_cx, off_y + ext_cy),
    )


# ---------------------------------------------------------------------------
# circle (including donut-chart arc segments)
# ---------------------------------------------------------------------------

def _build_arc_ring_path(
    cx: float, cy: float, r: float,
    stroke_width: float,
    dash_len: float, dash_offset: float,
    rotate_deg: float,
    sx: float, sy: float,
) -> tuple[str, int, int, int, int]:
    """Build a filled annular-sector (donut segment) as DrawingML custGeom.

    SVG donut charts use stroke-dasharray on a circle to draw arc segments.
    DrawingML cannot reproduce this, so we convert each arc segment into a
    filled ring shape (outer arc -> line -> inner arc -> close).

    Returns:
        (geom_xml, min_x_emu, min_y_emu, w_emu, h_emu).
    """
    circumference = 2 * math.pi * r
    if circumference <= 0:
        return '', 0, 0, 0, 0

    start_frac = -dash_offset / circumference
    end_frac = start_frac + dash_len / circumference

    start_angle = start_frac * 2 * math.pi + math.radians(rotate_deg)
    end_angle = end_frac * 2 * math.pi + math.radians(rotate_deg)

    half_sw = stroke_width / 2
    r_outer = r + half_sw
    r_inner = r - half_sw

    num_segments = max(16, int(abs(end_angle - start_angle) / (math.pi / 32)))
    angles = [
        start_angle + (end_angle - start_angle) * i / num_segments
        for i in range(num_segments + 1)
    ]

    outer_pts = [(cx + r_outer * math.sin(a), cy - r_outer * math.cos(a)) for a in angles]
    inner_pts = [(cx + r_inner * math.sin(a), cy - r_inner * math.cos(a)) for a in reversed(angles)]

    all_pts = [(px * sx, py * sy) for px, py in outer_pts + inner_pts]

    xs = [p[0] for p in all_pts]
    ys = [p[1] for p in all_pts]
    min_x, max_x = min(xs), max(xs)
    min_y, max_y = min(ys), max(ys)
    width = max_x - min_x
    height = max_y - min_y

    if width < 0.5 or height < 0.5:
        return '', 0, 0, 0, 0

    w_emu = px_to_emu(width)
    h_emu = px_to_emu(height)

    lines: list[str] = []
    for i, (px, py) in enumerate(all_pts):
        lx = px_to_emu(px - min_x)
        ly = px_to_emu(py - min_y)
        if i == 0:
            lines.append(f'<a:moveTo><a:pt x="{lx}" y="{ly}"/></a:moveTo>')
        else:
            lines.append(f'<a:lnTo><a:pt x="{lx}" y="{ly}"/></a:lnTo>')
    lines.append('<a:close/>')

    path_xml = '\n'.join(lines)
    geom = f'''<a:custGeom>
<a:avLst/><a:gdLst/><a:ahLst/><a:cxnLst/>
<a:rect l="l" t="t" r="r" b="b"/>
<a:pathLst><a:path w="{w_emu}" h="{h_emu}">
{path_xml}
</a:path></a:pathLst>
</a:custGeom>'''

    return geom, px_to_emu(min_x), px_to_emu(min_y), w_emu, h_emu


def _is_donut_circle(elem: ET.Element, ctx: ConvertContext) -> bool:
    """Detect if a circle uses stroke-dasharray to simulate an arc segment."""
    dasharray = _get_attr(elem, 'stroke-dasharray', ctx)
    if not dasharray or dasharray == 'none':
        return False
    stroke = _get_attr(elem, 'stroke', ctx)
    if not stroke or stroke == 'none':
        return False

    sw = _f(_get_attr(elem, 'stroke-width', ctx), 0)
    r = _f(elem.get('r'), 0)
    if sw <= 0 or r <= 0:
        return False

    # Standard dash presets are not donut segments
    if dasharray.strip() in DASH_PRESETS:
        return False

    # Thin strokes relative to radius are decorative dashed rings, not donut arcs.
    # Real donut arcs need sw/r >= 0.15 (e.g. sw=40 on r=100 → 0.40).
    if sw / r < 0.15:
        return False

    return True


def convert_circle(elem: ET.Element, ctx: ConvertContext) -> ShapeResult | None:
    """Convert SVG <circle> to DrawingML ellipse or donut-arc shape."""
    cx_ = _f(elem.get('cx'))
    cy_ = _f(elem.get('cy'))
    r = _f(elem.get('r'))

    if r <= 0:
        return None

    # --- Donut-chart arc segment detection ---
    if _is_donut_circle(elem, ctx):
        dasharray = _get_attr(elem, 'stroke-dasharray', ctx)
        dash_vals = re.split(r'[\s,]+', dasharray.strip())
        dash_len = float(dash_vals[0]) if dash_vals else 0
        dash_offset = _f(elem.get('stroke-dashoffset'), 0)
        stroke_width = _f(_get_attr(elem, 'stroke-width', ctx), 1)

        rotate_deg = 0.0
        transform = elem.get('transform', '')
        r_match = re.search(r'rotate\(\s*([-\d.]+)', transform)
        if r_match:
            rotate_deg = float(r_match.group(1))

        geom, min_x, min_y, w_emu, h_emu = _build_arc_ring_path(
            ctx_x(cx_, ctx) / ctx.scale_x,
            ctx_y(cy_, ctx) / ctx.scale_y,
            r, stroke_width, dash_len, dash_offset, rotate_deg,
            ctx.scale_x, ctx.scale_y,
        )
        if not geom:
            return None

        # Use the stroke color/gradient as fill for the arc shape
        stroke_val = _get_attr(elem, 'stroke', ctx)
        op = get_fill_opacity(elem, ctx)
        grad_id = resolve_url_id(stroke_val) if stroke_val else None
        if grad_id and grad_id in ctx.defs:
            fill = build_gradient_fill(ctx.defs[grad_id], op)
        elif stroke_val:
            color = parse_hex_color(stroke_val)
            fill = build_solid_fill(color, op) if color else '<a:noFill/>'
        else:
            fill = '<a:noFill/>'

        stroke_xml = '<a:ln><a:noFill/></a:ln>'

        effect = ''
        filt_id = get_effective_filter_id(elem, ctx)
        if filt_id and filt_id in ctx.defs:
            effect = build_effect_xml(ctx.defs[filt_id])

        shape_id = ctx.next_id()
        return ShapeResult(
            xml=_wrap_shape(
                shape_id, f'Arc {shape_id}',
                min_x, min_y, w_emu, h_emu,
                geom, fill, stroke_xml, effect,
            ),
            bounds_emu=(min_x, min_y, min_x + w_emu, min_y + h_emu),
        )

    # --- Normal circle ---
    cx_s = ctx_x(cx_, ctx)
    cy_s = ctx_y(cy_, ctx)
    r_x = r * ctx.scale_x
    r_y = r * ctx.scale_y

    x = cx_s - r_x
    y = cy_s - r_y
    w = r_x * 2
    h = r_y * 2

    fill_op = get_fill_opacity(elem, ctx)
    stroke_op = get_stroke_opacity(elem, ctx)
    fill = build_fill_xml(elem, ctx, fill_op)
    stroke = build_stroke_xml(elem, ctx, stroke_op)

    effect = ''
    filt_id = get_effective_filter_id(elem, ctx)
    if filt_id and filt_id in ctx.defs:
        effect = build_effect_xml(ctx.defs[filt_id])

    geom = '<a:prstGeom prst="ellipse"><a:avLst/></a:prstGeom>'

    shape_id = ctx.next_id()
    off_x = px_to_emu(x)
    off_y = px_to_emu(y)
    ext_cx = px_to_emu(w)
    ext_cy = px_to_emu(h)
    return ShapeResult(
        xml=_wrap_shape(
            shape_id, f'Ellipse {shape_id}',
            off_x, off_y, ext_cx, ext_cy,
            geom, fill, stroke, effect,
        ),
        bounds_emu=(off_x, off_y, off_x + ext_cx, off_y + ext_cy),
    )


# ---------------------------------------------------------------------------
# line
# ---------------------------------------------------------------------------

def convert_line(elem: ET.Element, ctx: ConvertContext) -> ShapeResult | None:
    """Convert SVG <line> to DrawingML shape.

    Lines with marker-start / marker-end are converted using the 'line' preset
    geometry (prstGeom prst="line") so that PowerPoint renders native arrow
    heads (headEnd / tailEnd) correctly.  Plain lines (no markers) continue to
    use custom geometry which is sufficient and avoids flipH/flipV complexity.
    """
    x1 = ctx_x(_f(elem.get('x1')), ctx)
    y1 = ctx_y(_f(elem.get('y1')), ctx)
    x2 = ctx_x(_f(elem.get('x2')), ctx)
    y2 = ctx_y(_f(elem.get('y2')), ctx)

    min_x = min(x1, x2)
    min_y = min(y1, y2)

    stroke_op = get_stroke_opacity(elem, ctx)
    stroke = build_stroke_xml(elem, ctx, stroke_op)

    rot = 0
    transform = elem.get('transform')
    if transform:
        r_match = re.search(r'rotate\(\s*([-\d.]+)', transform)
        if r_match:
            rot = int(float(r_match.group(1)) * ANGLE_UNIT)

    shape_id = ctx.next_id()
    off_x = px_to_emu(min_x)
    off_y = px_to_emu(min_y)

    # Determine if this line carries arrow markers.
    has_marker = bool(
        _get_attr(elem, 'marker-start', ctx) or
        _get_attr(elem, 'marker-end', ctx)
    )

    if has_marker:
        # ----------------------------------------------------------------
        # Preset geometry approach: prstGeom prst="line"
        # PowerPoint only renders headEnd / tailEnd on lines whose geometry
        # it can intrinsically understand as a "line" (i.e. preset or
        # connector shapes).  Custom geometry shapes silently ignore
        # headEnd / tailEnd in most PowerPoint versions.
        #
        # The "line" preset draws from (0,0) to (w,h).
        #   headEnd  → placed at the start of the line = (x1, y1)
        #   tailEnd  → placed at the end   of the line = (x2, y2)
        # We set flipH / flipV so that the preset start/end align with the
        # original SVG endpoints:
        #   default  (no flip)  : top-left  → bottom-right  (x1≤x2, y1≤y2)
        #   flipH               : top-right → bottom-left   (x1>x2, y1≤y2)
        #   flipV               : bottom-left → top-right   (x1≤x2, y1>y2)
        #   flipH + flipV       : bottom-right → top-left   (x1>x2, y1>y2)
        # ----------------------------------------------------------------
        w = abs(x2 - x1)
        h = abs(y2 - y1)
        # DrawingML requires ext cx/cy ≥ 1 EMU
        w_emu = px_to_emu(w) if w > 0 else 1
        h_emu = px_to_emu(h) if h > 0 else 1

        flip_h = x1 > x2
        flip_v = y1 > y2
        flip_attr = ''
        if flip_h and flip_v:
            flip_attr = ' flipH="1" flipV="1"'
        elif flip_h:
            flip_attr = ' flipH="1"'
        elif flip_v:
            flip_attr = ' flipV="1"'

        rot_attr = f' rot="{rot}"' if rot else ''
        xml = (
            f'<p:sp>'
            f'<p:nvSpPr>'
            f'<p:cNvPr id="{shape_id}" name="{_xml_escape(f"Line {shape_id}")}"/>'
            f'<p:cNvSpPr/><p:nvPr/>'
            f'</p:nvSpPr>'
            f'<p:spPr>'
            f'<a:xfrm{flip_attr}{rot_attr}>'
            f'<a:off x="{off_x}" y="{off_y}"/>'
            f'<a:ext cx="{w_emu}" cy="{h_emu}"/>'
            f'</a:xfrm>'
            f'<a:prstGeom prst="line"><a:avLst/></a:prstGeom>'
            f'<a:noFill/>'
            f'{stroke}'
            f'</p:spPr>'
            f'</p:sp>'
        )
    else:
        # ----------------------------------------------------------------
        # Custom geometry (original behaviour) for plain lines.
        # ----------------------------------------------------------------
        w = max(abs(x2 - x1), 1)
        h = max(abs(y2 - y1), 1)
        w_emu = px_to_emu(w)
        h_emu = px_to_emu(h)

        lx1 = px_to_emu(x1 - min_x)
        ly1 = px_to_emu(y1 - min_y)
        lx2 = px_to_emu(x2 - min_x)
        ly2 = px_to_emu(y2 - min_y)

        geom = (
            f'<a:custGeom>'
            f'<a:avLst/><a:gdLst/><a:ahLst/><a:cxnLst/>'
            f'<a:rect l="l" t="t" r="r" b="b"/>'
            f'<a:pathLst><a:path w="{w_emu}" h="{h_emu}">'
            f'<a:moveTo><a:pt x="{lx1}" y="{ly1}"/></a:moveTo>'
            f'<a:lnTo><a:pt x="{lx2}" y="{ly2}"/></a:lnTo>'
            f'</a:path></a:pathLst>'
            f'</a:custGeom>'
        )
        xml = _wrap_shape(
            shape_id, f'Line {shape_id}',
            off_x, off_y, w_emu, h_emu,
            geom, '<a:noFill/>', stroke, rot=rot,
        )

    return ShapeResult(
        xml=xml,
        bounds_emu=(off_x, off_y, off_x + w_emu, off_y + h_emu),
    )


# ---------------------------------------------------------------------------
# path
# ---------------------------------------------------------------------------

def convert_path(elem: ET.Element, ctx: ConvertContext) -> ShapeResult | None:
    """Convert SVG <path> to DrawingML custom geometry shape."""
    d = elem.get('d', '')
    if not d:
        return None

    commands = parse_svg_path(d)
    commands = svg_path_to_absolute(commands)
    commands = normalize_path_commands(commands)

    tx, ty = 0.0, 0.0
    rot = 0
    transform = elem.get('transform')
    if transform:
        t_match = re.search(r'translate\(\s*([-\d.]+)[\s,]+([-\d.]+)\s*\)', transform)
        if t_match:
            tx = float(t_match.group(1))
            ty = float(t_match.group(2))
        r_match = re.search(r'rotate\(\s*([-\d.]+)', transform)
        if r_match:
            rot = int(float(r_match.group(1)) * ANGLE_UNIT)

    path_xml, min_x, min_y, width, height = path_commands_to_drawingml(
        commands, ctx.translate_x + tx, ctx.translate_y + ty,
        ctx.scale_x, ctx.scale_y,
    )

    if not path_xml:
        return None

    w_emu = px_to_emu(width)
    h_emu = px_to_emu(height)

    geom = f'''<a:custGeom>
<a:avLst/><a:gdLst/><a:ahLst/><a:cxnLst/>
<a:rect l="l" t="t" r="r" b="b"/>
<a:pathLst><a:path w="{w_emu}" h="{h_emu}">
{path_xml}
</a:path></a:pathLst>
</a:custGeom>'''

    fill_op = get_fill_opacity(elem, ctx)
    stroke_op = get_stroke_opacity(elem, ctx)
    fill = build_fill_xml(elem, ctx, fill_op)
    stroke = build_stroke_xml(elem, ctx, stroke_op)

    effect = ''
    filt_id = get_effective_filter_id(elem, ctx)
    if filt_id and filt_id in ctx.defs:
        effect = build_effect_xml(ctx.defs[filt_id])

    shape_id = ctx.next_id()
    off_x = px_to_emu(min_x)
    off_y = px_to_emu(min_y)
    return ShapeResult(
        xml=_wrap_shape(
            shape_id, f'Freeform {shape_id}',
            off_x, off_y, w_emu, h_emu,
            geom, fill, stroke, effect, rot=rot,
        ),
        bounds_emu=(off_x, off_y, off_x + w_emu, off_y + h_emu),
    )


# ---------------------------------------------------------------------------
# polygon / polyline
# ---------------------------------------------------------------------------

def _parse_points(points_str: str) -> list[tuple[float, float]]:
    """Parse SVG points attribute into a list of (x, y) tuples."""
    nums = re.findall(r'[-+]?(?:\d+\.?\d*|\.\d+)', points_str)
    if len(nums) < 4:
        return []
    return [(float(nums[i]), float(nums[i + 1])) for i in range(0, len(nums) - 1, 2)]


def convert_polygon(elem: ET.Element, ctx: ConvertContext) -> ShapeResult | None:
    """Convert SVG <polygon> to DrawingML custom geometry shape."""
    points = _parse_points(elem.get('points', ''))
    if not points:
        return None

    commands = [PathCommand('M', [points[0][0], points[0][1]])]
    for px_, py_ in points[1:]:
        commands.append(PathCommand('L', [px_, py_]))
    commands.append(PathCommand('Z', []))

    path_xml, min_x, min_y, width, height = path_commands_to_drawingml(
        commands, ctx.translate_x, ctx.translate_y,
        ctx.scale_x, ctx.scale_y,
    )

    if not path_xml:
        return None

    w_emu = px_to_emu(width)
    h_emu = px_to_emu(height)

    geom = f'''<a:custGeom>
<a:avLst/><a:gdLst/><a:ahLst/><a:cxnLst/>
<a:rect l="l" t="t" r="r" b="b"/>
<a:pathLst><a:path w="{w_emu}" h="{h_emu}">
{path_xml}
</a:path></a:pathLst>
</a:custGeom>'''

    fill_op = get_fill_opacity(elem, ctx)
    stroke_op = get_stroke_opacity(elem, ctx)
    fill = build_fill_xml(elem, ctx, fill_op)
    stroke = build_stroke_xml(elem, ctx, stroke_op)

    rot = 0
    transform = elem.get('transform')
    if transform:
        r_match = re.search(r'rotate\(\s*([-\d.]+)', transform)
        if r_match:
            rot = int(float(r_match.group(1)) * ANGLE_UNIT)

    shape_id = ctx.next_id()
    off_x = px_to_emu(min_x)
    off_y = px_to_emu(min_y)
    return ShapeResult(
        xml=_wrap_shape(
            shape_id, f'Polygon {shape_id}',
            off_x, off_y, w_emu, h_emu,
            geom, fill, stroke, rot=rot,
        ),
        bounds_emu=(off_x, off_y, off_x + w_emu, off_y + h_emu),
    )


def convert_polyline(elem: ET.Element, ctx: ConvertContext) -> ShapeResult | None:
    """Convert SVG <polyline> to DrawingML custom geometry shape."""
    points = _parse_points(elem.get('points', ''))
    if not points:
        return None

    commands = [PathCommand('M', [points[0][0], points[0][1]])]
    for px_, py_ in points[1:]:
        commands.append(PathCommand('L', [px_, py_]))

    path_xml, min_x, min_y, width, height = path_commands_to_drawingml(
        commands, ctx.translate_x, ctx.translate_y,
        ctx.scale_x, ctx.scale_y,
    )

    if not path_xml:
        return None

    w_emu = px_to_emu(width)
    h_emu = px_to_emu(height)

    geom = f'''<a:custGeom>
<a:avLst/><a:gdLst/><a:ahLst/><a:cxnLst/>
<a:rect l="l" t="t" r="r" b="b"/>
<a:pathLst><a:path w="{w_emu}" h="{h_emu}">
{path_xml}
</a:path></a:pathLst>
</a:custGeom>'''

    fill_op = get_fill_opacity(elem, ctx)
    stroke_op = get_stroke_opacity(elem, ctx)
    fill = build_fill_xml(elem, ctx, fill_op)
    stroke = build_stroke_xml(elem, ctx, stroke_op)

    rot = 0
    transform = elem.get('transform')
    if transform:
        r_match = re.search(r'rotate\(\s*([-\d.]+)', transform)
        if r_match:
            rot = int(float(r_match.group(1)) * ANGLE_UNIT)

    shape_id = ctx.next_id()
    off_x = px_to_emu(min_x)
    off_y = px_to_emu(min_y)
    return ShapeResult(
        xml=_wrap_shape(
            shape_id, f'Polyline {shape_id}',
            off_x, off_y, w_emu, h_emu,
            geom, '<a:noFill/>', stroke, rot=rot,
        ),
        bounds_emu=(off_x, off_y, off_x + w_emu, off_y + h_emu),
    )


# ---------------------------------------------------------------------------
# text
# ---------------------------------------------------------------------------

def _normalize_text(text: str, *, preserve_space: bool = False) -> str:
    """Collapse runs of whitespace into a single space; do NOT strip the ends.

    Stripping at this layer would silently delete the inline boundary
    spaces in nested-tspan structures like
    ``<tspan>foo <tspan>bar</tspan> baz</tspan>``: the parent's text
    ("foo ") and the child's tail (" baz") would each lose the only space
    that separated them from the inner run, producing "foobarbaz".

    The paragraph's overall leading / trailing whitespace is removed once
    in ``_build_text_runs`` after all inline runs have been concatenated.
    """
    if not text:
        return ''
    if preserve_space:
        return text
    return re.sub(r'\s+', ' ', text)


def _preserves_space(elem: ET.Element) -> bool:
    xml_space = elem.get('{http://www.w3.org/XML/1998/namespace}space') or elem.get('xml:space')
    return xml_space == 'preserve'


def _override_run_attrs(
    parent_attrs: dict[str, Any],
    tspan: ET.Element,
) -> dict[str, Any]:
    """Layer a tspan's styling attributes over the inherited run attrs."""
    run_attrs = dict(parent_attrs)
    if tspan.get('font-weight'):
        run_attrs['font_weight'] = tspan.get('font-weight')
    if tspan.get('fill'):
        child_fill = tspan.get('fill')
        run_attrs['fill_raw'] = child_fill
        c = parse_hex_color(child_fill)
        if c:
            run_attrs['fill'] = c
    if tspan.get('font-size'):
        run_attrs['font_size'] = _f(tspan.get('font-size'), run_attrs['font_size'])
    if tspan.get('font-family'):
        run_attrs['font_family'] = tspan.get('font-family')
    if tspan.get('font-style'):
        run_attrs['font_style'] = tspan.get('font-style')
    if tspan.get('text-decoration'):
        run_attrs['text_decoration'] = tspan.get('text-decoration')
    return run_attrs


def _collect_tspan_runs(
    tspan: ET.Element,
    inherited_attrs: dict[str, Any],
    preserve_space: bool = False,
) -> list[dict[str, Any]]:
    """Recursively turn a tspan subtree into runs, propagating styling through nested tspans.

    Order: tspan.text → (each nested child tspan's runs → that child's tail under THIS tspan's attrs).
    """
    runs: list[dict[str, Any]] = []
    own_attrs = _override_run_attrs(inherited_attrs, tspan)
    child_preserve_space = preserve_space or _preserves_space(tspan)

    if tspan.text:
        t = _normalize_text(tspan.text, preserve_space=child_preserve_space)
        if t:
            runs.append({**own_attrs, 'text': t})

    for child in tspan:
        child_tag = child.tag.replace(f'{{{SVG_NS}}}', '')
        if child_tag == 'tspan':
            runs.extend(_collect_tspan_runs(child, own_attrs, child_preserve_space))
            if child.tail:
                t = _normalize_text(child.tail, preserve_space=child_preserve_space)
                if t:
                    runs.append({**own_attrs, 'text': t})

    return runs


def _build_text_runs(
    elem: ET.Element,
    parent_attrs: dict[str, Any],
) -> list[dict[str, Any]]:
    """Build a list of text runs from a <text> element, handling <tspan> children.

    Each run is a dict with keys: text, fill, fill_raw, font_weight,
    font_style, font_family, font_size. Nested tspans are walked recursively so
    inline format changes inside a tspan still produce distinct runs.
    """
    runs: list[dict[str, Any]] = []
    preserve_space = _preserves_space(elem)

    if elem.text:
        t = _normalize_text(elem.text, preserve_space=preserve_space)
        if t:
            runs.append({**parent_attrs, 'text': t})

    for child in elem:
        child_tag = child.tag.replace(f'{{{SVG_NS}}}', '')
        if child_tag == 'tspan':
            runs.extend(_collect_tspan_runs(child, parent_attrs, preserve_space))
            if child.tail:
                t = _normalize_text(child.tail, preserve_space=preserve_space)
                if t:
                    runs.append({**parent_attrs, 'text': t})

    # Strip the paragraph's overall leading / trailing whitespace once unless
    # xml:space="preserve" asks us to keep source indentation.
    if runs and not preserve_space:
        runs[0]['text'] = runs[0]['text'].lstrip(' ')
        runs[-1]['text'] = runs[-1]['text'].rstrip(' ')
        runs = [r for r in runs if r['text']]

    return runs


def _build_run_xml(
    run: dict[str, Any],
    default_fonts: dict[str, str],
    ctx: ConvertContext | None = None,
    effect_xml: str = '',
) -> str:
    """Build a single <a:r> XML from a run dict. Supports gradient fills on text."""
    text = run['text']
    fill = run.get('fill', '000000')
    fill_raw = run.get('fill_raw', '')
    fw = run.get('font_weight', '400')
    fs_px = run.get('font_size', 16)
    fstyle = run.get('font_style', '')
    ff = run.get('font_family', '')
    opacity = run.get('opacity')

    text_dec = run.get('text_decoration', '')

    sz = round(fs_px * FONT_PX_TO_HUNDREDTHS_PT)
    b_attr = ' b="1"' if fw in ('bold', '600', '700', '800', '900') else ''
    i_attr = ' i="1"' if fstyle == 'italic' else ''
    u_attr = ' u="sng"' if 'underline' in text_dec else ''
    strike_attr = ' strike="sngStrike"' if 'line-through' in text_dec else ''

    fonts = parse_font_family(ff) if ff else default_fonts

    # Build fill XML - gradient or solid
    grad_id = resolve_url_id(fill_raw)
    if grad_id and ctx and grad_id in ctx.defs:
        fill_xml = build_gradient_fill(ctx.defs[grad_id], opacity)
    else:
        alpha_xml = ''
        if opacity is not None and opacity < 1.0:
            alpha_xml = f'<a:alpha val="{int(opacity * 100000)}"/>'
        fill_xml = f'<a:solidFill><a:srgbClr val="{fill}">{alpha_xml}</a:srgbClr></a:solidFill>'

    space_attr = ' xml:space="preserve"' if text != text.strip() or '  ' in text else ''

    return f'''<a:r>
<a:rPr lang="zh-CN" sz="{sz}"{b_attr}{i_attr}{u_attr}{strike_attr} dirty="0">
{fill_xml}
{effect_xml}
<a:latin typeface="{_xml_escape(fonts['latin'])}"/>
<a:ea typeface="{_xml_escape(fonts['ea'])}"/>
<a:cs typeface="{_xml_escape(fonts['latin'])}"/>
</a:rPr>
<a:t{space_attr}>{_xml_escape(text)}</a:t>
</a:r>'''


def convert_text(elem: ET.Element, ctx: ConvertContext) -> ShapeResult | None:
    """Convert SVG <text> to DrawingML text shape with multi-run support."""
    x = ctx_x(_f(elem.get('x')), ctx)
    y = ctx_y(_f(elem.get('y')), ctx)
    font_size = _f(_get_attr(elem, 'font-size', ctx), 16) * ctx.scale_y
    font_weight = _get_attr(elem, 'font-weight', ctx) or '400'
    font_family_str = _get_attr(elem, 'font-family', ctx) or ''
    text_anchor = _get_attr(elem, 'text-anchor', ctx) or 'start'
    fill_raw = _get_attr(elem, 'fill', ctx) or '#000000'
    fill_color = parse_hex_color(fill_raw) or '000000'
    opacity = get_fill_opacity(elem, ctx)
    font_style = _get_attr(elem, 'font-style', ctx) or ''
    text_decoration = _get_attr(elem, 'text-decoration', ctx) or ''

    fonts = parse_font_family(font_family_str)

    parent_attrs: dict[str, Any] = {
        'fill': fill_color,
        'fill_raw': fill_raw,
        'font_weight': font_weight,
        'font_size': font_size,
        'font_family': font_family_str,
        'font_style': font_style,
        'text_decoration': text_decoration,
        'opacity': opacity,
    }
    runs = _build_text_runs(elem, parent_attrs)

    if not runs:
        return None

    full_text = ''.join(r['text'] for r in runs)
    if not full_text.strip():
        return None

    # Estimate text dimensions
    text_width = estimate_text_width(full_text, font_size, font_weight) * 1.15
    text_height = font_size * 1.5
    padding = font_size * 0.1

    # Adjust position based on text-anchor
    if text_anchor == 'middle':
        box_x = x - text_width / 2 - padding
    elif text_anchor == 'end':
        box_x = x - text_width - padding
    else:
        box_x = x - padding

    box_y = y - font_size * 0.85
    box_w = text_width + padding * 2
    box_h = text_height + padding

    # Letter spacing
    spc_attr = ''
    letter_spacing = _get_attr(elem, 'letter-spacing', ctx)
    if letter_spacing:
        try:
            spc_val = float(letter_spacing) * 100
            spc_attr = f' spc="{int(spc_val)}"'
        except ValueError:
            pass

    # Text rotation. SVG's rotate(angle [cx cy]) rotates around (cx, cy), but
    # DrawingML's <a:xfrm rot="..."> rotates the shape around its own center.
    # When a pivot is given (and differs from the box center), translate the
    # box so its center lands where SVG would place the rotated visual center —
    # otherwise rotated y-axis labels etc. drift to the wrong location.
    text_rot = 0
    text_transform = elem.get('transform', '')
    if text_transform:
        rot_match = re.search(
            r'rotate\(\s*([-\d.]+)(?:[\s,]+([-\d.]+)[\s,]+([-\d.]+))?',
            text_transform,
        )
        if rot_match:
            angle_deg = float(rot_match.group(1))
            text_rot = int(angle_deg * ANGLE_UNIT)
            if rot_match.group(2) is not None:
                pivot_x = ctx_x(float(rot_match.group(2)), ctx)
                pivot_y = ctx_y(float(rot_match.group(3)), ctx)
                cx_box = box_x + box_w / 2
                cy_box = box_y + box_h / 2
                rad = math.radians(angle_deg)
                dx = cx_box - pivot_x
                dy = cy_box - pivot_y
                new_cx = pivot_x + dx * math.cos(rad) - dy * math.sin(rad)
                new_cy = pivot_y + dx * math.sin(rad) + dy * math.cos(rad)
                box_x = new_cx - box_w / 2
                box_y = new_cy - box_h / 2

    # Alignment
    algn_map = {'start': 'l', 'middle': 'ctr', 'end': 'r'}
    algn = algn_map.get(text_anchor, 'l')

    # Shadow effect
    shape_effect_xml = ''
    text_effect_xml = ''
    filt_id = get_effective_filter_id(elem, ctx)
    if filt_id and filt_id in ctx.defs:
        filter_elem = ctx.defs[filt_id]
        effect_kind = classify_filter_effect(filter_elem)
        if effect_kind == 'glow':
            text_effect_xml = build_effect_xml(filter_elem)
        elif effect_kind == 'shadow':
            shape_effect_xml = build_effect_xml(filter_elem)

    shape_id = ctx.next_id()
    rot_attr = f' rot="{text_rot}"' if text_rot else ''

    runs_xml = '\n'.join(_build_run_xml(r, fonts, ctx, text_effect_xml) for r in runs)
    off_x = px_to_emu(box_x)
    off_y = px_to_emu(box_y)
    ext_cx = px_to_emu(box_w)
    ext_cy = px_to_emu(box_h)

    return ShapeResult(xml=f'''<p:sp>
<p:nvSpPr>
<p:cNvPr id="{shape_id}" name="TextBox {shape_id}"/>
<p:cNvSpPr txBox="1"/><p:nvPr/>
</p:nvSpPr>
<p:spPr>
<a:xfrm{rot_attr}><a:off x="{off_x}" y="{off_y}"/>
<a:ext cx="{ext_cx}" cy="{ext_cy}"/></a:xfrm>
<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
<a:noFill/>
<a:ln><a:noFill/></a:ln>
{shape_effect_xml}
</p:spPr>
<p:txBody>
<a:bodyPr wrap="none" lIns="0" tIns="0" rIns="0" bIns="0" anchor="t" anchorCtr="0">
<a:spAutoFit/>
</a:bodyPr>
<a:lstStyle/>
<a:p>
<a:pPr algn="{algn}"/>
{runs_xml}
</a:p>
</p:txBody>
</p:sp>''', bounds_emu=(off_x, off_y, off_x + ext_cx, off_y + ext_cy))


# ---------------------------------------------------------------------------
# clipPath support (image clipping)
# ---------------------------------------------------------------------------

def _clip_commands_to_geom(
    commands: list[PathCommand],
    img_x: float, img_y: float,
    img_w: float, img_h: float,
    object_bbox: bool,
) -> str:
    """Convert clip path commands to DrawingML custGeom XML.

    Coordinates are transformed relative to the image bounding box so that
    (img_x, img_y) maps to (0, 0) and (img_x+img_w, img_y+img_h) maps to
    (w_emu, h_emu).
    """
    w_emu = px_to_emu(img_w)
    h_emu = px_to_emu(img_h)

    if w_emu <= 0 or h_emu <= 0:
        return '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>'

    def _tx(x: float) -> int:
        if object_bbox:
            return int(x * w_emu)
        return px_to_emu(x - img_x)

    def _ty(y: float) -> int:
        if object_bbox:
            return int(y * h_emu)
        return px_to_emu(y - img_y)

    parts: list[str] = []
    for cmd in commands:
        if cmd.cmd == 'M':
            parts.append(
                f'<a:moveTo><a:pt x="{_tx(cmd.args[0])}" '
                f'y="{_ty(cmd.args[1])}"/></a:moveTo>'
            )
        elif cmd.cmd == 'L':
            parts.append(
                f'<a:lnTo><a:pt x="{_tx(cmd.args[0])}" '
                f'y="{_ty(cmd.args[1])}"/></a:lnTo>'
            )
        elif cmd.cmd == 'C':
            pts = ''.join(
                f'<a:pt x="{_tx(cmd.args[i])}" y="{_ty(cmd.args[i + 1])}"/>'
                for i in range(0, 6, 2)
            )
            parts.append(f'<a:cubicBezTo>{pts}</a:cubicBezTo>')
        elif cmd.cmd == 'Z':
            parts.append('<a:close/>')

    path_inner = '\n'.join(parts)
    return f'''<a:custGeom>
<a:avLst/><a:gdLst/><a:ahLst/><a:cxnLst/>
<a:rect l="l" t="t" r="r" b="b"/>
<a:pathLst><a:path w="{w_emu}" h="{h_emu}">
{path_inner}
</a:path></a:pathLst>
</a:custGeom>'''


def _resolve_clip_geometry(
    elem: ET.Element,
    ctx: ConvertContext,
    raw_x: float, raw_y: float,
    raw_w: float, raw_h: float,
) -> str:
    """Resolve clip-path on an image element to DrawingML geometry XML.

    Supports:
      - circle / ellipse  → prstGeom ellipse
      - rect with rx/ry   → prstGeom roundRect
      - path / polygon     → custGeom

    Args:
        elem: SVG element bearing a clip-path attribute.
        ctx:  Conversion context (carries defs).
        raw_x, raw_y: Image position in SVG space (pre-ctx-transform).
        raw_w, raw_h: Image dimensions in SVG space (pre-ctx-transform).

    Returns:
        DrawingML geometry XML string.
    """
    DEFAULT = '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>'

    clip_ref = elem.get('clip-path', '')
    if not clip_ref or clip_ref == 'none':
        return DEFAULT

    clip_id = resolve_url_id(clip_ref)
    if not clip_id or clip_id not in ctx.defs:
        return DEFAULT

    clip_elem = ctx.defs[clip_id]
    clip_tag = clip_elem.tag.replace(f'{{{SVG_NS}}}', '')
    if clip_tag != 'clipPath':
        return DEFAULT

    # Find the first shape child of the clipPath
    shape = None
    for child in clip_elem:
        child_tag = child.tag.replace(f'{{{SVG_NS}}}', '')
        if child_tag in ('circle', 'ellipse', 'rect', 'path', 'polygon'):
            shape = child
            break

    if shape is None:
        return DEFAULT

    shape_tag = shape.tag.replace(f'{{{SVG_NS}}}', '')
    is_obb = clip_elem.get('clipPathUnits') == 'objectBoundingBox'

    # --- Circle / Ellipse → preset ellipse ---
    if shape_tag in ('circle', 'ellipse'):
        return '<a:prstGeom prst="ellipse"><a:avLst/></a:prstGeom>'

    # --- Rect with rx/ry → preset roundRect ---
    if shape_tag == 'rect':
        rx = _f(shape.get('rx'))
        ry = _f(shape.get('ry'), rx)
        if rx <= 0 and ry <= 0:
            return DEFAULT  # plain rect clip is a no-op
        r = max(rx, ry)
        if is_obb:
            r = r * min(raw_w, raw_h)
        shorter = min(raw_w, raw_h)
        if shorter <= 0:
            return DEFAULT
        adj = int(min(r / (shorter / 2), 1.0) * 50000)
        return (
            f'<a:prstGeom prst="roundRect"><a:avLst>'
            f'<a:gd name="adj" fmla="val {adj}"/>'
            f'</a:avLst></a:prstGeom>'
        )

    # --- Path → custGeom ---
    if shape_tag == 'path':
        d = shape.get('d', '')
        if not d:
            return DEFAULT
        commands = parse_svg_path(d)
        commands = svg_path_to_absolute(commands)
        commands = normalize_path_commands(commands)
        if not commands:
            return DEFAULT
        return _clip_commands_to_geom(
            commands, raw_x, raw_y, raw_w, raw_h, is_obb,
        )

    # --- Polygon → custGeom ---
    if shape_tag == 'polygon':
        pts = _parse_points(shape.get('points', ''))
        if not pts:
            return DEFAULT
        commands = [PathCommand('M', [pts[0][0], pts[0][1]])]
        for px_, py_ in pts[1:]:
            commands.append(PathCommand('L', [px_, py_]))
        commands.append(PathCommand('Z', []))
        return _clip_commands_to_geom(
            commands, raw_x, raw_y, raw_w, raw_h, is_obb,
        )

    return DEFAULT


# ---------------------------------------------------------------------------
# image
# ---------------------------------------------------------------------------

def _picture_xfrm_from_rect(
    ctx: ConvertContext,
    x: float,
    y: float,
    w: float,
    h: float,
) -> tuple[str, int, int, int, int, tuple[int, int, int, int]]:
    """Build DrawingML xfrm data for a picture rectangle."""
    if ctx.use_transform_matrix:
        return rect_to_dml_xfrm(x, y, w, h, ctx.transform_matrix)

    x_t = ctx_x(x, ctx)
    y_t = ctx_y(y, ctx)
    w_t = ctx_w(w, ctx)
    h_t = ctx_h(h, ctx)
    off_x = px_to_emu(x_t)
    off_y = px_to_emu(y_t)
    ext_cx = px_to_emu(w_t)
    ext_cy = px_to_emu(h_t)
    return '', off_x, off_y, ext_cx, ext_cy, (off_x, off_y, off_x + ext_cx, off_y + ext_cy)


def _read_image_size(data: bytes) -> tuple[int | None, int | None]:
    """Read intrinsic image dimensions (width, height) from raw bytes.

    Used by ``convert_image`` to translate SVG ``preserveAspectRatio`` into
    DrawingML ``<a:srcRect>`` so the original image is preserved and remains
    croppable inside PowerPoint.

    Returns ``(None, None)`` on any failure — callers fall back to the
    legacy stretch behaviour.
    """
    try:
        from PIL import Image, UnidentifiedImageError  # type: ignore
    except ImportError:
        return (None, None)
    try:
        with Image.open(io.BytesIO(data)) as img:
            return img.size
    except (UnidentifiedImageError, OSError, ValueError):
        return (None, None)


def _compute_slice_src_rect(
    img_w: float, img_h: float,
    box_w: float, box_h: float,
    align: str,
) -> tuple[int, int, int, int] | None:
    """Compute DrawingML ``<a:srcRect>`` (l, t, r, b) for SVG slice mode.

    SVG ``preserveAspectRatio="<align> slice"`` means: scale the image so it
    fully covers the box (CSS object-fit: cover) and crop the overflow at the
    given alignment anchor. DrawingML ``srcRect`` expresses the same intent
    by specifying which sub-rectangle of the source image to display, in
    units of 1/1000 of a percent (0–100000).

    Returns ``None`` when no cropping is required (image and box already
    match) or when inputs are degenerate.
    """
    if img_w <= 0 or img_h <= 0 or box_w <= 0 or box_h <= 0:
        return None

    # Scale factor that makes the image cover the box (cover semantics).
    scale = max(box_w / img_w, box_h / img_h)
    visible_w = box_w / scale  # ≤ img_w
    visible_h = box_h / scale  # ≤ img_h

    if abs(visible_w - img_w) < 0.5 and abs(visible_h - img_h) < 0.5:
        return None  # No crop needed

    crop_w_total = max(0.0, img_w - visible_w)
    crop_h_total = max(0.0, img_h - visible_h)

    x_anchor = {'xMin': 0.0, 'xMid': 0.5, 'xMax': 1.0}.get(align[:4], 0.5)
    y_anchor = {'YMin': 0.0, 'YMid': 0.5, 'YMax': 1.0}.get(align[4:], 0.5)

    crop_l = crop_w_total * x_anchor
    crop_r = crop_w_total - crop_l
    crop_t = crop_h_total * y_anchor
    crop_b = crop_h_total - crop_t

    l = max(0, min(100000, int(round(crop_l / img_w * 100000))))
    t = max(0, min(100000, int(round(crop_t / img_h * 100000))))
    r = max(0, min(100000, int(round(crop_r / img_w * 100000))))
    b = max(0, min(100000, int(round(crop_b / img_h * 100000))))

    return (l, t, r, b)


def _resolve_image_src_rect(
    elem: ET.Element,
    img_data: bytes,
    box_w: float, box_h: float,
) -> str:
    """Build ``<a:srcRect .../>`` XML for an SVG <image> based on its
    preserveAspectRatio. Returns an empty string when no srcRect is needed
    (meet mode, none mode, or already-aligned content).

    Slice mode is resolved into a srcRect so the original image is embedded
    intact and PowerPoint's crop tool / "Reset Picture" continue to work.
    Meet mode is handled separately by ``_resolve_image_meet_fit`` (which
    shrinks the picture frame to match image aspect ratio); none mode keeps
    the legacy stretch behaviour intentionally.
    """
    par = (elem.get('preserveAspectRatio') or 'xMidYMid meet').strip()
    parts = par.split()
    align = parts[0] if parts else 'xMidYMid'
    mode = parts[1] if len(parts) > 1 else 'meet'

    if align == 'none' or mode != 'slice':
        return ''  # meet handled by frame fit; none → stretch is correct per SVG spec

    img_w, img_h = _read_image_size(img_data)
    if img_w is None or img_h is None:
        return ''

    rect = _compute_slice_src_rect(float(img_w), float(img_h), box_w, box_h, align)
    if rect is None:
        return ''

    l, t, r, b = rect
    return f'<a:srcRect l="{l}" t="{t}" r="{r}" b="{b}"/>'


def _resolve_image_meet_fit(
    elem: ET.Element,
    img_data: bytes,
    box_w: float, box_h: float,
) -> tuple[float, float, float, float] | None:
    """For SVG ``preserveAspectRatio="<align> meet"``, compute the letterboxed
    sub-rectangle ``(dx, dy, fit_w, fit_h)`` inside the original box that
    matches the image's intrinsic aspect ratio.

    PowerPoint has no native ``meet`` semantic — ``<a:stretch><a:fillRect/>``
    fills the entire frame and would distort the image whenever the SVG
    container ratio differs from the source image ratio. The fix is to shrink
    the ``<p:pic>`` frame itself (off + ext) so the frame and image share an
    aspect ratio; the stretch then fills a correctly-shaped frame.

    Returns ``None`` when the adjustment is not applicable:
      - mode is ``slice`` (handled by srcRect path)
      - align is ``none`` (SVG spec says: stretch — do not adjust)
      - intrinsic image dimensions cannot be read
      - frame already matches image ratio (no-op)
    """
    par = (elem.get('preserveAspectRatio') or 'xMidYMid meet').strip()
    parts = par.split()
    align = parts[0] if parts else 'xMidYMid'
    mode = parts[1] if len(parts) > 1 else 'meet'

    if align == 'none' or mode == 'slice':
        return None

    img_w, img_h = _read_image_size(img_data)
    if img_w is None or img_h is None or img_w <= 0 or img_h <= 0:
        return None
    if box_w <= 0 or box_h <= 0:
        return None

    scale = min(box_w / img_w, box_h / img_h)
    fit_w = img_w * scale
    fit_h = img_h * scale

    if abs(fit_w - box_w) < 0.5 and abs(fit_h - box_h) < 0.5:
        return None  # already matches — no adjustment

    x_anchor = {'xMin': 0.0, 'xMid': 0.5, 'xMax': 1.0}.get(align[:4], 0.5)
    y_anchor = {'YMin': 0.0, 'YMid': 0.5, 'YMax': 1.0}.get(align[4:], 0.5)

    dx = (box_w - fit_w) * x_anchor
    dy = (box_h - fit_h) * y_anchor

    return (dx, dy, fit_w, fit_h)


def convert_image(elem: ET.Element, ctx: ConvertContext) -> ShapeResult | None:
    """Convert SVG <image> to DrawingML picture element.

    Supports clip-path attribute: when present, the clipPath shape is mapped
    to DrawingML picture geometry (prstGeom or custGeom) so the image is
    natively clipped in PowerPoint.
    """
    href = elem.get('href') or elem.get(f'{{{XLINK_NS}}}href')
    if not href:
        return None

    # Raw coordinates (pre-context-transform) for clip path calculations
    raw_x = _f(elem.get('x'))
    raw_y = _f(elem.get('y'))
    raw_w = _f(elem.get('width'))
    raw_h = _f(elem.get('height'))

    if ctx.use_transform_matrix:
        x = raw_x
        y = raw_y
        w = raw_w
        h = raw_h
    else:
        x = ctx_x(raw_x, ctx)
        y = ctx_y(raw_y, ctx)
        w = ctx_w(raw_w, ctx)
        h = ctx_h(raw_h, ctx)

    if w <= 0 or h <= 0:
        return None

    # Extract image data
    if href.startswith('data:'):
        match = re.match(r'data:image/([A-Za-z0-9.+-]+);base64,(.+)', href, re.DOTALL)
        if not match:
            return None
        img_format = match.group(1).lower()
        if img_format == 'svg+xml':
            img_format = 'svg'
        if img_format == 'jpeg':
            img_format = 'jpg'
        img_data = base64.b64decode(match.group(2))
    else:
        if ctx.svg_dir is None:
            return None
        img_path = ctx.svg_dir / href
        if not img_path.exists():
            img_path = ctx.svg_dir.parent / href
        if not img_path.exists():
            raise FileNotFoundError(f'External image not found: {href}')
        img_format = img_path.suffix.lstrip('.').lower()
        if img_format == 'jpeg':
            img_format = 'jpg'
        img_data = img_path.read_bytes()

    img_idx = len(ctx.media_files) + 1
    img_filename = f's{ctx.slide_num}_img{img_idx}.{img_format}'
    ctx.media_files[img_filename] = img_data

    r_id = ctx.next_rel_id()
    ctx.rel_entries.append({
        'id': r_id,
        'type': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image',
        'target': f'../media/{img_filename}',
    })

    rot = 0
    transform = elem.get('transform')
    if transform and not ctx.use_transform_matrix:
        r_match = re.search(r'rotate\(\s*([-\d.]+)', transform)
        if r_match:
            rot = int(float(r_match.group(1)) * ANGLE_UNIT)
    rot_attr = f' rot="{rot}"' if rot else ''

    # Resolve clip-path → DrawingML geometry
    clip_geom = _resolve_clip_geometry(elem, ctx, raw_x, raw_y, raw_w, raw_h)

    # Resolve preserveAspectRatio="<align> slice" → DrawingML <a:srcRect>.
    # This keeps the original image intact in the .pptx and lets users
    # re-crop or reset the picture in PowerPoint, instead of permanently
    # baking the crop into the embedded asset.
    src_rect_xml = _resolve_image_src_rect(elem, img_data, w, h)

    # Resolve preserveAspectRatio="<align> meet" by shrinking the picture
    # frame to match the image's aspect ratio. Skipped when a real clip-path
    # is in effect: clip geometry is computed against the original-box
    # coordinate space and would no longer line up after a frame shift.
    has_clip = bool(elem.get('clip-path')) and elem.get('clip-path') != 'none'
    meet_fit = None if has_clip else _resolve_image_meet_fit(elem, img_data, w, h)

    shape_id = ctx.next_id()
    if meet_fit is not None:
        dx, dy, fit_w, fit_h = meet_fit
        xfrm_attr, off_x, off_y, ext_cx, ext_cy, bounds_emu = _picture_xfrm_from_rect(
            ctx, x + dx, y + dy, fit_w, fit_h,
        )
    else:
        xfrm_attr, off_x, off_y, ext_cx, ext_cy, bounds_emu = _picture_xfrm_from_rect(
            ctx, x, y, w, h,
        )
    if rot_attr:
        xfrm_attr += rot_attr

    return ShapeResult(xml=f'''<p:pic>
<p:nvPicPr>
<p:cNvPr id="{shape_id}" name="Image {shape_id}"/>
<p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr>
<p:nvPr/>
</p:nvPicPr>
<p:blipFill>
<a:blip r:embed="{r_id}"/>
{src_rect_xml}<a:stretch><a:fillRect/></a:stretch>
</p:blipFill>
<p:spPr>
<a:xfrm{xfrm_attr}><a:off x="{off_x}" y="{off_y}"/>
<a:ext cx="{ext_cx}" cy="{ext_cy}"/></a:xfrm>
{clip_geom}
</p:spPr>
</p:pic>''', bounds_emu=bounds_emu)


# ---------------------------------------------------------------------------
# ellipse
# ---------------------------------------------------------------------------

def convert_ellipse(elem: ET.Element, ctx: ConvertContext) -> ShapeResult | None:
    """Convert SVG <ellipse> to DrawingML ellipse shape."""
    cx_ = ctx_x(_f(elem.get('cx')), ctx)
    cy_ = ctx_y(_f(elem.get('cy')), ctx)
    rx = _f(elem.get('rx')) * ctx.scale_x
    ry = _f(elem.get('ry')) * ctx.scale_y

    if rx <= 0 or ry <= 0:
        return None

    x = cx_ - rx
    y = cy_ - ry
    w = rx * 2
    h = ry * 2

    fill_op = get_fill_opacity(elem, ctx)
    stroke_op = get_stroke_opacity(elem, ctx)
    fill = build_fill_xml(elem, ctx, fill_op)
    stroke = build_stroke_xml(elem, ctx, stroke_op)

    geom = '<a:prstGeom prst="ellipse"><a:avLst/></a:prstGeom>'

    rot = 0
    transform = elem.get('transform')
    if transform:
        r_match = re.search(r'rotate\(\s*([-\d.]+)', transform)
        if r_match:
            rot = int(float(r_match.group(1)) * ANGLE_UNIT)

    shape_id = ctx.next_id()
    off_x = px_to_emu(x)
    off_y = px_to_emu(y)
    ext_cx = px_to_emu(w)
    ext_cy = px_to_emu(h)
    return ShapeResult(
        xml=_wrap_shape(
            shape_id, f'Ellipse {shape_id}',
            off_x, off_y, ext_cx, ext_cy,
            geom, fill, stroke, rot=rot,
        ),
        bounds_emu=(off_x, off_y, off_x + ext_cx, off_y + ext_cy),
    )


# ---------------------------------------------------------------------------
# nested <svg> sprite (template-import round-trip)
# ---------------------------------------------------------------------------

# Inverse of pptx_to_svg/pic_to_svg.py:101-113 — that path writes a cropped
# DrawingML picture as an outer <svg viewBox> wrapping a unit-rectangle <image>.
# Without this converter, every cropped picture in a template-import SVG is
# silently dropped on re-export.

def convert_nested_svg(elem: ET.Element, ctx: ConvertContext) -> ShapeResult | None:
    """Convert a nested <svg> sprite-crop wrapper to a DrawingML picture.

    Pattern produced by pptx_to_svg::

        <svg x="10" y="20" width="200" height="300" viewBox="0.5 0.3 0.5 0.7">
          <image href="..." x="0" y="0" width="1" height="1" preserveAspectRatio="none"/>
        </svg>

    The viewBox crops the unit-rectangle inner image; that crop is mapped to a
    DrawingML <a:srcRect> so PowerPoint can re-crop / "Reset Picture".
    """
    image_elem = elem.find(f'{{{SVG_NS}}}image')
    if image_elem is None:
        image_elem = elem.find('image')
    if image_elem is None:
        return None

    href = image_elem.get('href') or image_elem.get(f'{{{XLINK_NS}}}href')
    if not href:
        return None

    svg_x = _f(elem.get('x'))
    svg_y = _f(elem.get('y'))
    svg_w = _f(elem.get('width'))
    svg_h = _f(elem.get('height'))
    if svg_w <= 0 or svg_h <= 0:
        return None

    if ctx.use_transform_matrix:
        x = svg_x
        y = svg_y
        w = svg_w
        h = svg_h
    else:
        x = ctx_x(svg_x, ctx)
        y = ctx_y(svg_y, ctx)
        w = ctx_w(svg_w, ctx)
        h = ctx_h(svg_h, ctx)

    src_rect_xml = ''
    view_box = elem.get('viewBox', '')
    if view_box:
        parts = view_box.strip().split()
        if len(parts) == 4:
            vb_x, vb_y, vb_w, vb_h = (float(p) for p in parts)
            l = max(0, min(int(round(vb_x * 100000)), 100000))
            t = max(0, min(int(round(vb_y * 100000)), 100000))
            r = max(0, min(int(round((1.0 - vb_x - vb_w) * 100000)), 100000))
            b = max(0, min(int(round((1.0 - vb_y - vb_h) * 100000)), 100000))
            if l or t or r or b:
                src_rect_xml = f'<a:srcRect l="{l}" t="{t}" r="{r}" b="{b}"/>'

    if href.startswith('data:'):
        match = re.match(r'data:image/([A-Za-z0-9.+-]+);base64,(.+)', href, re.DOTALL)
        if not match:
            return None
        img_format = match.group(1).lower()
        if img_format == 'svg+xml':
            img_format = 'svg'
        if img_format == 'jpeg':
            img_format = 'jpg'
        img_data = base64.b64decode(match.group(2))
    else:
        if ctx.svg_dir is None:
            return None
        img_path = ctx.svg_dir / href
        if not img_path.exists():
            img_path = ctx.svg_dir.parent / href
        if not img_path.exists():
            raise FileNotFoundError(f'External image not found: {href}')
        img_format = img_path.suffix.lstrip('.').lower()
        if img_format == 'jpeg':
            img_format = 'jpg'
        img_data = img_path.read_bytes()

    img_idx = len(ctx.media_files) + 1
    img_filename = f's{ctx.slide_num}_img{img_idx}.{img_format}'
    ctx.media_files[img_filename] = img_data

    r_id = ctx.next_rel_id()
    ctx.rel_entries.append({
        'id': r_id,
        'type': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image',
        'target': f'../media/{img_filename}',
    })

    rot = 0
    transform = elem.get('transform')
    if transform and not ctx.use_transform_matrix:
        r_match = re.search(r'rotate\(\s*([-\d.]+)', transform)
        if r_match:
            rot = int(float(r_match.group(1)) * ANGLE_UNIT)
    rot_attr = f' rot="{rot}"' if rot else ''

    shape_id = ctx.next_id()
    xfrm_attr, off_x, off_y, ext_cx, ext_cy, bounds_emu = _picture_xfrm_from_rect(
        ctx, x, y, w, h,
    )
    if rot_attr:
        xfrm_attr += rot_attr
    clip_geom = _resolve_clip_geometry(elem, ctx, svg_x, svg_y, svg_w, svg_h)

    return ShapeResult(xml=f'''<p:pic>
<p:nvPicPr>
<p:cNvPr id="{shape_id}" name="Image {shape_id}"/>
<p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr>
<p:nvPr/>
</p:nvPicPr>
<p:blipFill>
<a:blip r:embed="{r_id}"/>
{src_rect_xml}<a:stretch><a:fillRect/></a:stretch>
</p:blipFill>
<p:spPr>
<a:xfrm{xfrm_attr}><a:off x="{off_x}" y="{off_y}"/>
<a:ext cx="{ext_cx}" cy="{ext_cy}"/></a:xfrm>
{clip_geom}
</p:spPr>
</p:pic>''', bounds_emu=bounds_emu)
