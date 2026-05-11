"""Fill, stroke, and shadow XML builders for DrawingML conversion."""

from __future__ import annotations

import math
import re
from xml.etree import ElementTree as ET

from .drawingml_context import ConvertContext
from .drawingml_utils import (
    SVG_NS, ANGLE_UNIT, DASH_PRESETS,
    px_to_emu, _f, _get_attr,
    parse_hex_color, parse_stop_style, resolve_url_id,
)


def build_solid_fill(color: str, opacity: float | None = None) -> str:
    """Build <a:solidFill> XML."""
    alpha = ''
    if opacity is not None and opacity < 1.0:
        alpha = f'<a:alpha val="{int(opacity * 100000)}"/>'
    return f'<a:solidFill><a:srgbClr val="{color}">{alpha}</a:srgbClr></a:solidFill>'


def build_gradient_fill(
    grad_elem: ET.Element,
    opacity: float | None = None,
) -> str:
    """Build <a:gradFill> from SVG linearGradient or radialGradient element."""
    tag = grad_elem.tag.replace(f'{{{SVG_NS}}}', '')

    stops_xml = []
    for child in grad_elem:
        child_tag = child.tag.replace(f'{{{SVG_NS}}}', '')
        if child_tag != 'stop':
            continue

        offset_str = child.get('offset', '0').strip().rstrip('%')
        try:
            offset = float(offset_str)
            if offset > 1.0:
                offset = offset / 100.0
        except ValueError:
            offset = 0.0
        pos = int(offset * 100000)

        # Parse color from style attribute or direct attributes
        style = child.get('style', '')
        color, stop_opacity = parse_stop_style(style)
        if not color:
            color = parse_hex_color(child.get('stop-color', '#000000'))
        if color is None:
            color = '000000'

        direct_stop_op = child.get('stop-opacity')
        if direct_stop_op is not None:
            try:
                stop_opacity = float(direct_stop_op)
            except ValueError:
                pass

        alpha_xml = ''
        effective_opacity = stop_opacity
        if opacity is not None:
            effective_opacity *= opacity
        if effective_opacity < 1.0:
            alpha_xml = f'<a:alpha val="{int(effective_opacity * 100000)}"/>'

        stops_xml.append(
            f'<a:gs pos="{pos}"><a:srgbClr val="{color}">{alpha_xml}</a:srgbClr></a:gs>'
        )

    if not stops_xml:
        return ''

    gs_list = '\n'.join(stops_xml)

    if tag == 'linearGradient':
        def parse_grad_coord(val_str: str, default: float = 0.0) -> float:
            val_str = val_str.strip()
            if val_str.endswith('%'):
                return float(val_str.rstrip('%')) / 100.0
            v = float(val_str)
            return v / 100.0 if v > 1.0 else v

        x1 = parse_grad_coord(grad_elem.get('x1', '0'))
        y1 = parse_grad_coord(grad_elem.get('y1', '0'))
        x2 = parse_grad_coord(grad_elem.get('x2', '1'))
        y2 = parse_grad_coord(grad_elem.get('y2', '1'))

        angle_rad = math.atan2(y2 - y1, x2 - x1)
        angle_deg = math.degrees(angle_rad)
        dml_angle = int((angle_deg % 360) * ANGLE_UNIT)

        return f'''<a:gradFill>
<a:gsLst>{gs_list}</a:gsLst>
<a:lin ang="{dml_angle}" scaled="1"/>
</a:gradFill>'''

    elif tag == 'radialGradient':
        return f'''<a:gradFill>
<a:gsLst>{gs_list}</a:gsLst>
<a:path path="circle">
<a:fillToRect l="50000" t="50000" r="50000" b="50000"/>
</a:path>
</a:gradFill>'''

    return ''


def build_fill_xml(
    elem: ET.Element,
    ctx: ConvertContext,
    opacity: float | None = None,
) -> str:
    """Build fill XML for a shape element, with inherited style support."""
    fill = _get_attr(elem, 'fill', ctx)
    if fill is None:
        fill = '#000000'  # SVG default fill is black

    if fill == 'none':
        return '<a:noFill/>'

    grad_id = resolve_url_id(fill)
    if grad_id and grad_id in ctx.defs:
        return build_gradient_fill(ctx.defs[grad_id], opacity)

    color = parse_hex_color(fill)
    if color:
        return build_solid_fill(color, opacity)

    return '<a:noFill/>'


# ---------------------------------------------------------------------------
# Marker (arrow-head) support
# ---------------------------------------------------------------------------

# Matches an (x, y) pair in a path "d" attribute: "M 10, 20" / "L -5 7.5" / etc.
_MARKER_POINT_RE = re.compile(
    r'[MLml]\s*(-?\d+(?:\.\d+)?)\s*[,\s]\s*(-?\d+(?:\.\d+)?)'
)
_MARKER_POLY_POINT_RE = re.compile(
    r'(-?\d+(?:\.\d+)?)\s*[,\s]\s*(-?\d+(?:\.\d+)?)'
)


def _marker_size_buckets(w_attr: float, h_attr: float) -> tuple[str, str]:
    """Map SVG markerWidth / markerHeight to DrawingML (w, len) buckets.

    DrawingML arrow-end sizing is categorical: sm / med / lg.
    Width (perpendicular to the line) maps from markerHeight;
    length (along the line) maps from markerWidth.
    """

    def bucket(v: float) -> str:
        if v < 6:
            return 'sm'
        if v > 12:
            return 'lg'
        return 'med'

    return bucket(h_attr), bucket(w_attr)


def _classify_marker(marker_elem: ET.Element) -> tuple[str, str, str] | None:
    """Classify an SVG <marker> into a DrawingML line-end preset.

    Returns (type, w, len) where:
        type in {'triangle', 'stealth', 'diamond', 'oval', 'arrow'}
        w, len in {'sm', 'med', 'lg'}
    or None if the marker cannot be classified.

    Current coverage (80/20): triangles (3-vertex closed paths or polygons),
    diamonds (4-vertex symmetric), and circles / ellipses. Anything else
    returns None so the caller can warn and skip.
    """
    mw = _f(marker_elem.get('markerWidth'), 3.0)
    mh = _f(marker_elem.get('markerHeight'), 3.0)
    w_bucket, len_bucket = _marker_size_buckets(mw, mh)

    for child in marker_elem:
        tag = child.tag.replace(f'{{{SVG_NS}}}', '')

        if tag in ('circle', 'ellipse'):
            return ('oval', w_bucket, len_bucket)

        if tag == 'path':
            d = child.get('d', '')
            if not d:
                continue
            points = _MARKER_POINT_RE.findall(d)
            n = len(points)
            closed = bool(re.search(r'[Zz]\s*$', d.strip()))
            if n == 3 and closed:
                return ('triangle', w_bucket, len_bucket)
            if n == 4 and closed:
                return ('diamond', w_bucket, len_bucket)
            continue

        if tag in ('polygon', 'polyline'):
            pts_attr = child.get('points', '')
            pts = _MARKER_POLY_POINT_RE.findall(pts_attr)
            n = len(pts)
            if n == 3:
                return ('triangle', w_bucket, len_bucket)
            if n == 4:
                return ('diamond', w_bucket, len_bucket)
            continue

    return None


def _emit_line_end(
    elem: ET.Element,
    ctx: ConvertContext,
    which: str,
) -> str:
    """Build <a:headEnd> or <a:tailEnd> XML for an element's marker reference.

    Args:
        which: 'head' (SVG marker-start) or 'tail' (SVG marker-end).

    Returns empty string if no marker, cannot resolve, or cannot classify.
    """
    attr = 'marker-start' if which == 'head' else 'marker-end'
    ref = _get_attr(elem, attr, ctx)
    if not ref or ref == 'none':
        return ''

    marker_id = resolve_url_id(ref)
    if not marker_id or marker_id not in ctx.defs:
        return ''

    marker_elem = ctx.defs[marker_id]
    tag = marker_elem.tag.replace(f'{{{SVG_NS}}}', '')
    if tag != 'marker':
        # ID collision with non-marker defs entry; ignore.
        return ''

    cls = _classify_marker(marker_elem)
    if cls is None:
        print(
            f'  Warning: marker "{marker_id}" shape cannot be classified; '
            f'skipping (supported: triangle, diamond, oval)'
        )
        return ''

    typ, w_bucket, len_bucket = cls

    # Reclassify size buckets based on markerUnits semantics:
    #
    # markerUnits="strokeWidth" (SVG default):
    #   markerWidth IS a ratio to stroke-width, and DrawingML headEnd/tailEnd
    #   also scale proportionally with line width.  We should compare the ratio
    #   (markerWidth) directly against ratio-based thresholds — do NOT multiply
    #   by stroke-width, because that double-counts the scaling.
    #   Empirical DrawingML arrow ratios:
    #     sm  ≈ 1.5×  stroke-width  →  markerWidth ≤ 2.0
    #     med ≈ 2.5×  stroke-width  →  markerWidth  2.0 – 3.5
    #     lg  ≈ 3.5×  stroke-width  →  markerWidth ≥ 3.5
    #
    # markerUnits="userSpaceOnUse":
    #   markerWidth/Height are absolute pixel values – keep the existing
    #   absolute-pixel thresholds from _marker_size_buckets (6 / 12).
    marker_units = marker_elem.get('markerUnits', 'strokeWidth')
    if marker_units != 'userSpaceOnUse':
        mw = _f(marker_elem.get('markerWidth'), 3.0)
        mh = _f(marker_elem.get('markerHeight'), 3.0)

        def _ratio_bucket(v: float) -> str:
            if v <= 2.0:
                return 'sm'
            if v >= 3.5:
                return 'lg'
            return 'med'

        w_bucket = _ratio_bucket(mh)    # h → perpendicular width
        len_bucket = _ratio_bucket(mw)  # w → length along line

    dml_tag = 'headEnd' if which == 'head' else 'tailEnd'
    return f'<a:{dml_tag} type="{typ}" w="{w_bucket}" len="{len_bucket}"/>'


def build_stroke_xml(
    elem: ET.Element,
    ctx: ConvertContext,
    opacity: float | None = None,
) -> str:
    """Build <a:ln> XML for stroke, with inherited style support."""
    stroke = _get_attr(elem, 'stroke', ctx)
    if not stroke or stroke == 'none':
        return '<a:ln><a:noFill/></a:ln>'

    width = _f(_get_attr(elem, 'stroke-width', ctx), 1.0)
    width_emu = px_to_emu(width)

    # Dash pattern
    dash_xml = ''
    dasharray = _get_attr(elem, 'stroke-dasharray', ctx)
    if dasharray and dasharray != 'none':
        preset = DASH_PRESETS.get(dasharray.strip())
        if preset:
            dash_xml = f'<a:prstDash val="{preset}"/>'
        else:
            # Unknown pattern → build custDash proportional to stroke width
            try:
                parts = re.split(r'[\s,]+', dasharray.strip())
                d_raw = float(parts[0])
                sp_raw = float(parts[1]) if len(parts) > 1 else d_raw
                sw = max(width, 0.001)
                d_pct = int(d_raw / sw * 100000)
                sp_pct = int(sp_raw / sw * 100000)
                dash_xml = f'<a:custDash><a:ds d="{d_pct}" sp="{sp_pct}"/></a:custDash>'
            except (ValueError, IndexError):
                dash_xml = '<a:prstDash val="sysDash"/>'

    # Line cap
    cap_map = {'round': 'rnd', 'square': 'sq', 'butt': 'flat'}
    cap_attr = ''
    linecap = _get_attr(elem, 'stroke-linecap', ctx)
    if linecap and linecap in cap_map:
        cap_attr = f' cap="{cap_map[linecap]}"'

    # Line join
    join_xml = ''
    linejoin = _get_attr(elem, 'stroke-linejoin', ctx)
    if linejoin == 'round':
        join_xml = '<a:round/>'
    elif linejoin == 'bevel':
        join_xml = '<a:bevel/>'
    elif linejoin == 'miter':
        join_xml = '<a:miter lim="800000"/>'

    # Line-end markers (SVG marker-start / marker-end → <a:headEnd>/<a:tailEnd>)
    # DrawingML schema order is: fill → prstDash → join → headEnd → tailEnd,
    # so these must be appended after join_xml.
    head_end = _emit_line_end(elem, ctx, 'head')
    tail_end = _emit_line_end(elem, ctx, 'tail')
    line_ends = head_end + tail_end

    # Gradient stroke
    grad_id = resolve_url_id(stroke)
    if grad_id and grad_id in ctx.defs:
        grad_fill = build_gradient_fill(ctx.defs[grad_id], opacity)
        return f'<a:ln w="{width_emu}"{cap_attr}>{grad_fill}{dash_xml}{join_xml}{line_ends}</a:ln>'

    # Solid color stroke
    color = parse_hex_color(stroke)
    if not color:
        return '<a:ln><a:noFill/></a:ln>'

    alpha_xml = ''
    if opacity is not None and opacity < 1.0:
        alpha_xml = f'<a:alpha val="{int(opacity * 100000)}"/>'

    return f'''<a:ln w="{width_emu}"{cap_attr}>
<a:solidFill><a:srgbClr val="{color}">{alpha_xml}</a:srgbClr></a:solidFill>{dash_xml}{join_xml}{line_ends}
</a:ln>'''


def _parse_filter_params(
    filter_elem: ET.Element,
) -> dict[str, float | str]:
    """Extract common parameters from an SVG filter element.

    Returns:
        Dict with keys: std_dev, dx, dy, opacity, color, has_offset.
    """
    std_dev = 4.0
    dx = 0.0
    dy = 0.0
    opacity = 0.3
    color = '000000'
    has_offset = False

    for child in filter_elem.iter():
        tag = child.tag.replace(f'{{{SVG_NS}}}', '')
        if tag == 'feDropShadow':
            # Shorthand element: all params in one place
            std_dev = _f(child.get('stdDeviation'), 4.0)
            dx = _f(child.get('dx'), 0.0)
            dy = _f(child.get('dy'), 0.0)
            if abs(dx) > 0.01 or abs(dy) > 0.01:
                has_offset = True
            opacity = _f(child.get('flood-opacity'), 0.3)
            raw_color = child.get('flood-color', '').strip().lstrip('#')
            if len(raw_color) == 6 and all(c in '0123456789abcdefABCDEF' for c in raw_color):
                color = raw_color.upper()
        elif tag == 'feGaussianBlur':
            std_dev = _f(child.get('stdDeviation'), 4.0)
        elif tag == 'feOffset':
            dx = _f(child.get('dx'), 0.0)
            dy = _f(child.get('dy'), 0.0)
            if abs(dx) > 0.01 or abs(dy) > 0.01:
                has_offset = True
        elif tag == 'feFlood':
            opacity = _f(child.get('flood-opacity'), 0.3)
            raw_color = child.get('flood-color', '').strip().lstrip('#')
            if len(raw_color) == 6 and all(c in '0123456789abcdefABCDEF' for c in raw_color):
                color = raw_color.upper()
        elif tag == 'feFuncA':
            if child.get('type') == 'linear':
                opacity = _f(child.get('slope'), 0.3)

    return {
        'std_dev': std_dev, 'dx': dx, 'dy': dy,
        'opacity': opacity, 'color': color, 'has_offset': has_offset,
    }


def _infer_shadow_alignment(dx: float, dy: float, threshold: float = 0.5) -> str:
    """Infer outer shadow alignment from the SVG offset vector.

    DrawingML applies alignment before blur/offset transforms, so we anchor the
    shadow opposite to the dominant offset direction:
    - diagonal offsets map to the opposite corner
    - pure vertical offsets stay centered, matching common PPT shadow presets
    - pure horizontal offsets anchor to the opposite side
    """
    if abs(dx) < threshold and abs(dy) < threshold:
        return 'ctr'
    if abs(dx) < threshold:
        return 'ctr'
    if abs(dy) < threshold:
        return 'l' if dx > 0 else 'r'
    if dx > 0 and dy > 0:
        return 'tl'
    if dx < 0 and dy > 0:
        return 'tr'
    if dx > 0 and dy < 0:
        return 'bl'
    return 'br'


def _shadow_dir_angle(dx: float, dy: float) -> int:
    """Convert an SVG offset vector to DrawingML clockwise angle units.

    OOXML angles are expressed in 60,000ths of a degree, with positive angles
    rotating clockwise toward the positive Y axis. SVG uses the same screen
    coordinate orientation (positive Y points downward), so the raw screen-space
    vector angle can be mapped directly with atan2(dy, dx).
    """
    if abs(dx) < 0.001 and abs(dy) < 0.001:
        return 0
    angle_deg = math.degrees(math.atan2(dy, dx)) % 360
    return int(angle_deg * ANGLE_UNIT)


def build_shadow_xml(filter_elem: ET.Element) -> str:
    """Build <a:effectLst> with <a:outerShdw> from SVG filter element.

    SVG-to-DrawingML shadow mapping notes:
    - SVG feGaussianBlur stdDeviation (σ) maps to DrawingML blurRad using a
      2.0× scale. Rationale: σ is a standard deviation whose visual radius
      is ~3σ, while DrawingML blurRad is an outer-spread pixel distance.
      A 1.0× scale makes PowerPoint render sharp, concentrated shadows
      ("heavy" visual). 2.0× matches the CSS drop-shadow↔box-shadow
      convention and produces softer diffusion closer to the SVG preview.
    - The algn attribute is inferred from the offset direction so that
      the shadow aligns naturally with the shape edge.
    """
    if filter_elem is None:
        return ''

    p = _parse_filter_params(filter_elem)
    std_dev = p['std_dev']
    dx = p['dx']
    dy = p['dy']
    # For shadow, default dy to 4 if no offset was found
    if not p['has_offset']:
        dy = 4.0

    blur_rad = px_to_emu(std_dev * 2.0)
    dist = px_to_emu(math.sqrt(dx * dx + dy * dy))
    dir_angle = _shadow_dir_angle(dx, dy)
    # PowerPoint renders outerShdw alpha slightly heavier than SVG's filter
    # composite (different blending path). Scale by 0.75 to match the SVG
    # preview after blur has been corrected to 2.0× σ.
    alpha_val = int(p['opacity'] * 75000)
    algn = _infer_shadow_alignment(dx, dy)

    return f'''<a:effectLst>
<a:outerShdw blurRad="{blur_rad}" dist="{dist}" dir="{dir_angle}" algn="{algn}" rotWithShape="0">
<a:srgbClr val="{p['color']}"><a:alpha val="{alpha_val}"/></a:srgbClr>
</a:outerShdw>
</a:effectLst>'''


def build_glow_xml(filter_elem: ET.Element) -> str:
    """Build <a:effectLst> with <a:glow> from SVG filter element.

    Used for filters that have feGaussianBlur without meaningful feOffset,
    typically title glow or highlight effects.
    """
    if filter_elem is None:
        return ''

    p = _parse_filter_params(filter_elem)
    rad = px_to_emu(p['std_dev'])
    alpha_val = int(p['opacity'] * 100000)

    return f'''<a:effectLst>
<a:glow rad="{rad}">
<a:srgbClr val="{p['color']}"><a:alpha val="{alpha_val}"/></a:srgbClr>
</a:glow>
</a:effectLst>'''


def classify_filter_effect(filter_elem: ET.Element) -> str | None:
    """Classify an SVG filter into a supported DrawingML effect kind."""
    if filter_elem is None:
        return None

    p = _parse_filter_params(filter_elem)
    return 'shadow' if p['has_offset'] else 'glow'


def build_effect_xml(filter_elem: ET.Element) -> str:
    """Build effect XML by classifying the SVG filter as shadow or glow.

    Classification rules:
    - feOffset with non-zero dx/dy → outer shadow
    - No feOffset or zero offset → glow effect
    """
    if filter_elem is None:
        return ''

    effect_kind = classify_filter_effect(filter_elem)
    if effect_kind == 'shadow':
        return build_shadow_xml(filter_elem)
    if effect_kind == 'glow':
        return build_glow_xml(filter_elem)
    return ''


def get_element_opacity(elem: ET.Element) -> float | None:
    """Get opacity value from element. Returns None if 1.0 or not set."""
    op = elem.get('opacity')
    if op is None:
        return None
    try:
        val = float(op)
        return val if val < 1.0 else None
    except ValueError:
        return None


def get_fill_opacity(
    elem: ET.Element,
    ctx: ConvertContext | None = None,
) -> float | None:
    """Get effective fill opacity combining 'opacity' and 'fill-opacity'.

    Returns:
        Combined opacity value, or None if fully opaque.
    """
    base = 1.0

    op = _get_attr(elem, 'opacity', ctx) if ctx else elem.get('opacity')
    if op:
        try:
            base = float(op)
        except ValueError:
            pass

    fill_op = _get_attr(elem, 'fill-opacity', ctx) if ctx else elem.get('fill-opacity')
    if fill_op:
        try:
            base *= float(fill_op)
        except ValueError:
            pass

    return base if base < 1.0 else None


def get_stroke_opacity(
    elem: ET.Element,
    ctx: ConvertContext | None = None,
) -> float | None:
    """Get effective stroke opacity combining 'opacity' and 'stroke-opacity'.

    Returns:
        Combined opacity value, or None if fully opaque.
    """
    base = 1.0

    op = _get_attr(elem, 'opacity', ctx) if ctx else elem.get('opacity')
    if op:
        try:
            base = float(op)
        except ValueError:
            pass

    stroke_op = _get_attr(elem, 'stroke-opacity', ctx) if ctx else elem.get('stroke-opacity')
    if stroke_op:
        try:
            base *= float(stroke_op)
        except ValueError:
            pass

    return base if base < 1.0 else None
