"""Core SVG -> DrawingML dispatcher, group handling, and main entry point."""

from __future__ import annotations

import re
from pathlib import Path
from xml.etree import ElementTree as ET

from .drawingml_context import ConvertContext, ShapeResult
from .drawingml_utils import (
    SVG_NS,
    _extract_inheritable_styles, parse_transform_matrix, resolve_url_id,
)
from .drawingml_styles import build_effect_xml
from .drawingml_elements import (
    convert_rect, convert_circle, convert_ellipse,
    convert_line, convert_path,
    convert_polygon, convert_polyline,
    convert_text, convert_image, convert_nested_svg,
)


class SvgNativeConversionError(RuntimeError):
    """Raised when an SVG cannot be faithfully converted to native DrawingML."""


# ---------------------------------------------------------------------------
# Animation anchor selection
# ---------------------------------------------------------------------------

# Tokens that mark a top-level <g id="..."> as page chrome rather than animated
# content. When any token (after splitting id on '-' and '_') matches, the group
# is excluded from the per-element entrance animation cascade so background,
# header/footer, decorations etc. appear together with the slide instead of
# requiring presenter clicks.
_CHROME_ID_TOKENS = frozenset({
    'background', 'bg',
    'decoration', 'decorations', 'decor',
    'header', 'footer',
    'chrome', 'watermark',
    'pagenumber', 'pagenum',
})


def _is_chrome_id(elem_id: str | None) -> bool:
    if not elem_id:
        return False
    lower = elem_id.lower()
    if lower.replace('-', '').replace('_', '') in _CHROME_ID_TOKENS:
        return True
    tokens = re.split(r'[-_]', lower)
    return any(t in _CHROME_ID_TOKENS for t in tokens if t)


# ---------------------------------------------------------------------------
# Transform & layout helpers
# ---------------------------------------------------------------------------

def parse_transform(transform_str: str) -> tuple[float, float, float, float, float]:
    """Parse SVG transform string, extract translate, scale, and rotate.

    Returns:
        (dx, dy, sx, sy, angle_deg) tuple.
    """
    if not transform_str:
        return 0.0, 0.0, 1.0, 1.0, 0.0

    dx, dy = 0.0, 0.0
    sx, sy = 1.0, 1.0
    angle_deg = 0.0

    m = re.search(r'translate\(\s*([-\d.]+)[\s,]+([-\d.]+)\s*\)', transform_str)
    if m:
        dx = float(m.group(1))
        dy = float(m.group(2))

    m = re.search(r'scale\(\s*([-\d.]+)(?:[\s,]+([-\d.]+))?\s*\)', transform_str)
    if m:
        sx = float(m.group(1))
        sy = float(m.group(2)) if m.group(2) else sx

    m = re.search(r'rotate\(\s*([-\d.]+)', transform_str)
    if m:
        angle_deg = float(m.group(1))

    return dx, dy, sx, sy, angle_deg


# ---------------------------------------------------------------------------
# Group handling
# ---------------------------------------------------------------------------

def convert_g(elem: ET.Element, ctx: ConvertContext) -> ShapeResult | None:
    """Convert SVG <g> to DrawingML group shape <p:grpSp>.

    Preserves group structure so elements can be selected and moved together
    in PowerPoint. Single-child groups are flattened to avoid unnecessary nesting.

    Uses identity coordinate mapping (chOff/chExt == off/ext) so child shapes
    keep their absolute slide coordinates unchanged.
    """
    transform = elem.get('transform', '')
    dx, dy, sx, sy, angle_deg = parse_transform(transform)

    filter_id = resolve_url_id(elem.get('filter', ''))
    style_overrides = _extract_inheritable_styles(elem)

    elem_id = elem.get('id')
    should_animate_group = ctx.depth == 0 and elem_id and not _is_chrome_id(elem_id)
    visual_children = [
        child for child in elem
        if child.tag.replace(f'{{{SVG_NS}}}', '') not in _NON_VISUAL_TAGS
    ]
    matrix_supported = bool(transform) and visual_children and all(
        _supports_matrix_transform(child) for child in visual_children
    )
    if matrix_supported:
        child_ctx = ctx.child(
            0, 0, 1.0, 1.0,
            transform_matrix=parse_transform_matrix(transform),
            filter_id=filter_id,
            style_overrides=style_overrides,
        )
    else:
        child_ctx = ctx.child(dx, dy, sx, sy, filter_id=filter_id, style_overrides=style_overrides)

    child_results: list[ShapeResult] = []
    for child in elem:
        result = convert_element(child, child_ctx)
        if result:
            child_results.append(result)

    ctx.sync_from_child(child_ctx)

    if not child_results:
        return None

    # Single-child non-semantic groups are flattened to reduce nesting. Top-level
    # semantic groups are preserved so animations target the group, not its
    # individual child shapes.
    if len(child_results) == 1 and not should_animate_group:
        return child_results[0]

    # Multiple children, or a top-level semantic one-child group: wrap in
    # <p:grpSp> so PowerPoint can animate the group as one unit.
    min_x = min_y = float('inf')
    max_x = max_y = float('-inf')

    for child_result in child_results:
        bounds = child_result.bounds_emu
        if bounds is None:
            continue
        min_x = min(min_x, bounds[0])
        min_y = min(min_y, bounds[1])
        max_x = max(max_x, bounds[2])
        max_y = max(max_y, bounds[3])

    if min_x == float('inf'):
        return ShapeResult(xml='\n'.join(result.xml for result in child_results))

    group_x = int(min_x)
    group_y = int(min_y)
    group_w = max(int(max_x - min_x), 1)
    group_h = max(int(max_y - min_y), 1)

    shapes_xml = '\n'.join(result.xml for result in child_results)
    group_id = ctx.next_id()

    # Record top-level semantic groups (e.g. <g id="p02-title">) so the
    # PPTX builder can emit per-element entrance timing. Only the outermost
    # multi-child wrapper qualifies — flattened single-child groups have no
    # <p:grpSp> to anchor a timing target on, and nested groups are
    # ignored to keep the animation budget at ~per-section granularity.
    if should_animate_group:
        ctx.anim_targets.append((group_id, elem_id))

    group_effect = ''
    if filter_id and filter_id in ctx.defs:
        group_effect = build_effect_xml(ctx.defs[filter_id])

    rot_emu = 0 if matrix_supported else int(angle_deg * 60000)
    rot_attr = f' rot="{rot_emu}"' if rot_emu else ''

    return ShapeResult(xml=f'''<p:grpSp>
<p:nvGrpSpPr>
<p:cNvPr id="{group_id}" name="Group {group_id}"/>
<p:cNvGrpSpPr/>
<p:nvPr/>
</p:nvGrpSpPr>
<p:grpSpPr>
<a:xfrm{rot_attr}>
<a:off x="{group_x}" y="{group_y}"/>
<a:ext cx="{group_w}" cy="{group_h}"/>
<a:chOff x="{group_x}" y="{group_y}"/>
<a:chExt cx="{group_w}" cy="{group_h}"/>
</a:xfrm>
{group_effect}
</p:grpSpPr>
{shapes_xml}
</p:grpSp>''', bounds_emu=(group_x, group_y, group_x + group_w, group_y + group_h))


# ---------------------------------------------------------------------------
# Defs collection & element dispatch
# ---------------------------------------------------------------------------

_NON_VISUAL_TAGS = frozenset(('defs', 'title', 'desc', 'metadata', 'style'))


def _supports_matrix_transform(elem: ET.Element) -> bool:
    """Return whether this subtree can consume a full affine matrix directly."""
    tag = elem.tag.replace(f'{{{SVG_NS}}}', '')
    if tag == 'image':
        return True
    if tag == 'svg':
        visual_children = [
            child for child in elem
            if child.tag.replace(f'{{{SVG_NS}}}', '') not in _NON_VISUAL_TAGS
        ]
        return len(visual_children) == 1 and (
            visual_children[0].tag.replace(f'{{{SVG_NS}}}', '') == 'image'
        )
    if tag == 'g':
        visual_children = [
            child for child in elem
            if child.tag.replace(f'{{{SVG_NS}}}', '') not in _NON_VISUAL_TAGS
        ]
        return bool(visual_children) and all(
            _supports_matrix_transform(child) for child in visual_children
        )
    return False

_CONVERTERS = {
    'rect': convert_rect,
    'circle': convert_circle,
    'ellipse': convert_ellipse,
    'line': convert_line,
    'path': convert_path,
    'polygon': convert_polygon,
    'polyline': convert_polyline,
    'text': convert_text,
    'image': convert_image,
    'g': convert_g,
    'svg': convert_nested_svg,
}

_SUPPORTED_VISUAL_CHILD_TAGS = frozenset(('tspan',))


def collect_defs(root: ET.Element) -> dict[str, ET.Element]:
    """Collect all <defs> children into an {id: element} dictionary."""
    defs: dict[str, ET.Element] = {}
    for defs_elem in root.iter(f'{{{SVG_NS}}}defs'):
        for child in defs_elem:
            elem_id = child.get('id')
            if elem_id:
                defs[elem_id] = child
    # Also check for defs without namespace
    for defs_elem in root.iter('defs'):
        for child in defs_elem:
            elem_id = child.get('id')
            if elem_id:
                defs[elem_id] = child
    return defs


def convert_element(elem: ET.Element, ctx: ConvertContext) -> ShapeResult | None:
    """Dispatch an SVG element to the appropriate converter."""
    tag = elem.tag.replace(f'{{{SVG_NS}}}', '')

    converter = _CONVERTERS.get(tag)
    if converter:
        try:
            return converter(elem, ctx)
        except Exception as e:
            raise SvgNativeConversionError(f'Failed to convert <{tag}>: {e}') from e

    if tag in _NON_VISUAL_TAGS:
        return None

    raise SvgNativeConversionError(f'Unsupported visual SVG element <{tag}>')


def _local_tag(elem: ET.Element) -> str:
    return elem.tag.split('}', 1)[-1] if isinstance(elem.tag, str) and '}' in elem.tag else str(elem.tag)


def _collect_unsupported_visuals(root: ET.Element) -> list[str]:
    issues: list[str] = []

    def walk(elem: ET.Element, path: str, in_defs: bool = False) -> None:
        tag = _local_tag(elem)
        current = f'{path}/{tag}'
        if in_defs:
            return
        if tag in _NON_VISUAL_TAGS:
            return
        if (tag not in _CONVERTERS
                and tag not in _NON_VISUAL_TAGS
                and tag not in _SUPPORTED_VISUAL_CHILD_TAGS):
            issues.append(current)
        for idx, child in enumerate(list(elem), start=1):
            walk(child, f'{current}[{idx}]', in_defs=(tag == 'defs'))

    for idx, child in enumerate(list(root), start=1):
        walk(child, f'/svg[{idx}]')
    return issues


def convert_svg_to_slide_shapes(
    svg_path: Path,
    slide_num: int = 1,
    verbose: bool = False,
) -> tuple[str, dict[str, bytes], list[dict[str, str]], list]:
    """Convert an SVG file to a complete DrawingML slide XML.

    Args:
        svg_path: Path to the SVG file.
        slide_num: Slide number (for naming).
        verbose: Print progress info.

    Returns:
        (slide_xml, media_files, rel_entries, anim_targets) where:
        - slide_xml: Complete slide XML string.
        - media_files: Dict of {filename: bytes} for media to write.
        - rel_entries: List of relationship entries to add.
        - anim_targets: List of (shape_id, svg_id) tuples for top-level
          semantic groups, in z-order; consumed by the builder's optional
          per-element entrance timing emitter.
    """
    tree = ET.parse(str(svg_path))
    root = tree.getroot()

    # Expand <use data-icon="..."/> placeholders in-memory so this dispatcher
    # can consume svg_output/ directly. Standard renderers and this converter
    # both ignore data-icon, so without expansion icons would silently drop.
    # The on-disk finalize_svg pipeline does the same expansion for svg_final/;
    # running this here makes the two pipelines behaviourally aligned.
    icons_dir = Path(__file__).resolve().parent.parent.parent / 'templates' / 'icons'
    if icons_dir.exists():
        from .use_expander import expand_use_data_icons
        expanded = expand_use_data_icons(root, icons_dir)
        if verbose and expanded:
            print(f'  Expanded {expanded} <use data-icon="..."/> placeholder(s)')

    # Flatten positional <tspan> (those with x/y/non-zero dy) into independent
    # <text> elements. DrawingML runs cannot reposition mid-paragraph, so a
    # dy-stacked block of tspans would otherwise collapse onto one baseline,
    # and an x-anchored tspan would render in the wrong column. finalize_svg
    # does the same flattening on disk; doing it here keeps native pptx output
    # correct when reading raw svg_output/.
    from .tspan_flattener import flatten_positional_tspans
    if flatten_positional_tspans(tree) and verbose:
        print('  Flattened positional <tspan> into independent <text>')

    unsupported = _collect_unsupported_visuals(root)
    if unsupported:
        preview = '; '.join(unsupported[:8])
        suffix = '' if len(unsupported) <= 8 else f'; +{len(unsupported) - 8} more'
        raise SvgNativeConversionError(
            f'{svg_path.name}: unsupported visual SVG element(s): {preview}{suffix}'
        )

    defs = collect_defs(root)
    ctx = ConvertContext(defs=defs, slide_num=slide_num, svg_dir=Path(svg_path).parent)

    shapes: list[str] = []
    converted = 0
    skipped = 0
    # Per-element shape ids of every top-level child, used as an animation
    # fallback when no <g id="..."> groups are present at the root.
    fallback_targets: list = []

    for child in root:
        tag = child.tag.replace(f'{{{SVG_NS}}}', '')
        if tag == 'defs':
            continue
        result = convert_element(child, ctx)
        if result:
            shapes.append(result.xml)
            converted += 1
            m = re.search(r'<p:cNvPr id="(\d+)"', result.xml)
            if m:
                fallback_targets.append((int(m.group(1)), tag))
        else:
            if tag not in _NON_VISUAL_TAGS:
                skipped += 1

    # Animation target fallback. Semantic <g id="..."> groups are the
    # preferred anchors (set inside convert_g). When the SVG has none
    # at the root we fall back to top-level primitives, but only when
    # the count is reasonable. Presenter-click animation should reveal
    # semantic blocks, not atomized drawing primitives, so fallback is
    # intentionally capped at a low count.
    _ANIM_FALLBACK_CAP = 8
    if not ctx.anim_targets and 0 < len(fallback_targets) <= _ANIM_FALLBACK_CAP:
        ctx.anim_targets = fallback_targets

    if verbose:
        print(f'  Converted {converted} elements, skipped {skipped}')

    shapes_xml = '\n'.join(shapes)

    slide_xml = f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
       xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
       xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
<p:cSld>
<p:spTree>
<p:nvGrpSpPr>
<p:cNvPr id="1" name=""/>
<p:cNvGrpSpPr/><p:nvPr/>
</p:nvGrpSpPr>
<p:grpSpPr>
<a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/>
<a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm>
</p:grpSpPr>
{shapes_xml}
</p:spTree>
</p:cSld>
<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
</p:sld>'''

    return slide_xml, ctx.media_files, ctx.rel_entries, ctx.anim_targets
