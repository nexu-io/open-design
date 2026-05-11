"""Per-slide composition: dispatches every ShapeNode through the right
converter, accumulates <defs>, and produces one final SVG string.

The output structure mirrors what svg_to_pptx expects so the deck can be
round-tripped:
    <svg viewBox="0 0 W H">
        <defs>
            <linearGradient id=.../>
            <marker id=.../>
            <filter id=.../>
        </defs>
        <!-- background -->
        <rect ... />        (slide background, if any)
        <g id="shape-1">...</g>
        <g id="shape-2">...</g>
        ...
    </svg>

Each top-level <g> wraps one shape and is treated by svg_to_pptx as an
animation anchor.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from xml.etree import ElementTree as ET

from .color_resolver import ColorPalette, find_color_elem, resolve_color
from .custgeom_to_svg import convert_custom_geom
from .effect_to_svg import convert_effects
from .emu_units import NS, Xfrm, fmt_num
from .fill_to_svg import resolve_fill
from .ln_to_svg import resolve_stroke
from .ooxml_loader import OoxmlPackage, PartRef, SlideRef
from .pic_to_svg import convert_blip_fill, convert_picture
from .prstgeom_to_svg import GeomResult, convert_prst_geom
from .shape_walker import (
    CONNECTOR, GRAPHIC, GROUP, PICTURE, SHAPE,
    ShapeNode, get_background, walk_sp_tree,
)
from .tbl_to_svg import convert_tbl
from .txbody_to_svg import (
    TextResult,
    convert_txbody,
    convert_vertical_txbody,
    is_vertical_txbody,
)


# ---------------------------------------------------------------------------
# AssemblyContext
# ---------------------------------------------------------------------------

@dataclass
class AssemblyContext:
    """Per-slide accumulator for unique IDs + media + defs."""

    palette: ColorPalette | None
    pkg: OoxmlPackage
    slide_part: PartRef
    theme_fonts: dict[str, str] = field(default_factory=dict)
    media_subdir: str = "assets"
    embed_images: bool = False
    keep_hidden: bool = False
    group_id_prefix: str = ""
    render_graphic_previews: bool = True
    asset_name_map: dict[str, str] = field(default_factory=dict)

    # Sequence counters (single-element lists so handlers can mutate)
    grad_seq: list[int] = field(default_factory=lambda: [0])
    marker_seq: list[int] = field(default_factory=lambda: [0])
    filter_seq: list[int] = field(default_factory=lambda: [0])
    shape_seq: list[int] = field(default_factory=lambda: [0])
    clip_seq: list[int] = field(default_factory=lambda: [0])

    # Accumulated outputs
    defs: list[str] = field(default_factory=list)
    media: dict[str, bytes] = field(default_factory=dict)


# ---------------------------------------------------------------------------
# Public entry
# ---------------------------------------------------------------------------

def assemble_slide(
    pkg: OoxmlPackage,
    slide: SlideRef,
    palette: ColorPalette | None,
    *,
    theme_fonts: dict[str, str] | None = None,
    media_subdir: str = "assets",
    embed_images: bool = False,
    keep_hidden: bool = False,
    inheritance_mode: str = "flat",
    asset_name_map: dict[str, str] | None = None,
) -> tuple[str, dict[str, bytes]]:
    """Convert one slide to a complete SVG string + media files map.

    inheritance_mode controls how master/layout shapes are rendered:
        - "flat" (default): emit master + layout non-placeholder shapes inline
          inside the slide SVG. This is the historical behavior, used for
          round-trip fidelity with svg_to_pptx.
        - "layered": skip inherited shapes entirely. The slide SVG contains
          only its own shapes. Callers (e.g. /create-template's PPTX import)
          render master/layout once each as separate SVGs and record the
          inheritance graph in inheritance.json.
    """
    ctx = AssemblyContext(
        palette=palette,
        pkg=pkg,
        slide_part=slide.part,
        theme_fonts=theme_fonts or {},
        media_subdir=media_subdir,
        embed_images=embed_images,
        keep_hidden=keep_hidden,
        render_graphic_previews=(inheritance_mode == "flat"),
        asset_name_map=asset_name_map or {},
    )

    canvas_w, canvas_h = pkg.slide_size_px

    # Background (cSld/bg) — emit as the first body element.
    body_parts: list[str] = []
    bg_xml = (
        _emit_background(slide, ctx, canvas_w, canvas_h)
        if inheritance_mode == "flat"
        else _emit_part_background(
            SlideRef(index=slide.index, part=slide.part, layout=None, master=slide.master),
            ctx, canvas_w, canvas_h,
        )
    )
    if bg_xml:
        body_parts.append(bg_xml)

    if inheritance_mode == "flat":
        # Inherited layout/master shapes render behind slide-local shapes. Skip
        # placeholders; they define editable regions, not visible background.
        body_parts.extend(_emit_inherited_shapes(slide, ctx))
    elif inheritance_mode != "layered":
        raise ValueError(
            f"inheritance_mode must be 'flat' or 'layered', got {inheritance_mode!r}"
        )

    # Walk shapes — placeholders without their own xfrm inherit geometry from
    # layout, then master.
    nodes = walk_sp_tree(
        slide.part.xml,
        layout_xml=slide.layout.xml if slide.layout else None,
        master_xml=slide.master.xml if slide.master else None,
    )
    for node in nodes:
        chunk = _convert_node(node, ctx, top_level=True)
        if chunk:
            body_parts.append(chunk)

    # Compose final SVG
    defs_xml = "".join(ctx.defs) if ctx.defs else ""
    defs_block = f"<defs>{defs_xml}</defs>" if defs_xml else ""

    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" '
        f'xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1" '
        f'width="{fmt_num(canvas_w)}" height="{fmt_num(canvas_h)}" '
        f'viewBox="0 0 {fmt_num(canvas_w)} {fmt_num(canvas_h)}">'
        f"{defs_block}"
        + "\n".join(body_parts)
        + "</svg>"
    )
    return svg, ctx.media


def assemble_part_solo(
    pkg: OoxmlPackage,
    part: PartRef,
    palette: ColorPalette | None,
    *,
    role: str,
    parent_master: PartRef | None = None,
    theme_fonts: dict[str, str] | None = None,
    media_subdir: str = "assets",
    embed_images: bool = False,
    keep_hidden: bool = False,
    asset_name_map: dict[str, str] | None = None,
) -> tuple[str, dict[str, bytes]]:
    """Render a single slideMaster or slideLayout part as a standalone SVG.

    Used by the layered export path. Skips placeholders the same way
    `_emit_inherited_shapes` does, so the output represents the part's
    decorative / structural shapes only — what the part *contributes* to its
    descendants. The first ancestor's background (if any) is emitted as the
    first body element so the output reads like a real slide.

    Args:
        role: 'master' or 'layout'. Used as the group_id_prefix to keep ids
            unique when the workspace inlines multiple parts in a viewer.
        parent_master: when ``role == "layout"``, pass the parent slide
            master so theme-style background fills (``<p:bgRef idx=...>``)
            can resolve via the theme attached to that master. For
            ``role == "master"`` the master is its own parent and this
            argument is ignored.
    """
    if role not in {"master", "layout"}:
        raise ValueError(f"role must be 'master' or 'layout', got {role!r}")

    ctx = AssemblyContext(
        palette=palette,
        pkg=pkg,
        slide_part=part,
        theme_fonts=theme_fonts or {},
        media_subdir=media_subdir,
        embed_images=embed_images,
        keep_hidden=keep_hidden,
        group_id_prefix=f"{role}-",
        render_graphic_previews=False,
        asset_name_map=asset_name_map or {},
    )

    canvas_w, canvas_h = pkg.slide_size_px

    body_parts: list[str] = []

    # Layered semantics: each part's standalone SVG must contain only that
    # part's own contribution. The master gets its own bg, the layout gets
    # its own bg only if it overrides the master's, and consumers re-stack
    # the layers when they need a flat view. We therefore inspect <p:bg> on
    # this part alone — never inherited from above. Theme-style fills
    # (<p:bgRef idx=...>) still need the parent master's <a:fmtScheme> to
    # resolve, hence the SlideRef.master plumbing below.
    if role == "master":
        master_for_theme: PartRef | None = part
    else:
        master_for_theme = parent_master
    fake_slide = SlideRef(
        index=0,
        part=part,
        layout=None,
        master=master_for_theme,
    )
    bg_xml = _emit_part_background(fake_slide, ctx, canvas_w, canvas_h)
    if bg_xml:
        body_parts.append(bg_xml)

    # Walk shapes. Placeholders are visualized as lightweight layout guides in
    # layered master/layout SVGs so template slots remain machine-visible.
    for node in walk_sp_tree(part.xml):
        if _is_placeholder_node(node):
            chunk = _convert_placeholder_guide(node, ctx, top_level=True)
        else:
            chunk = _convert_node(node, ctx, top_level=True)
        if chunk:
            body_parts.append(chunk)

    defs_xml = "".join(ctx.defs) if ctx.defs else ""
    defs_block = f"<defs>{defs_xml}</defs>" if defs_xml else ""

    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" '
        f'xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1" '
        f'width="{fmt_num(canvas_w)}" height="{fmt_num(canvas_h)}" '
        f'viewBox="0 0 {fmt_num(canvas_w)} {fmt_num(canvas_h)}">'
        f"{defs_block}"
        + "\n".join(body_parts)
        + "</svg>"
    )
    return svg, ctx.media


# ---------------------------------------------------------------------------
# Per-node dispatch
# ---------------------------------------------------------------------------

def _convert_node(node: ShapeNode, ctx: AssemblyContext, *, top_level: bool) -> str:
    if node.hidden and not ctx.keep_hidden:
        return ""
    if node.kind == SHAPE:
        return _convert_shape(node, ctx, top_level=top_level)
    if node.kind == PICTURE:
        return _convert_picture(node, ctx, top_level=top_level)
    if node.kind == CONNECTOR:
        return _convert_connector(node, ctx, top_level=top_level)
    if node.kind == GROUP:
        return _convert_group(node, ctx, top_level=top_level)
    if node.kind == GRAPHIC:
        return _convert_graphic_fallback(node, ctx, top_level=top_level)
    return ""


# ---------------------------------------------------------------------------
# Shape (<p:sp>)
# ---------------------------------------------------------------------------

def _convert_shape(node: ShapeNode, ctx: AssemblyContext, *, top_level: bool) -> str:
    sp_pr = node.xml.find("p:spPr", NS)

    # Check for blipFill (image-filled shape, e.g. Canva exports where images
    # are expressed as <p:sp> + <a:blipFill> rather than <p:pic>).
    geom = _resolve_geometry(node, sp_pr)

    blip_fill_elem = sp_pr.find("a:blipFill", NS) if sp_pr is not None else None
    blip_image = ""
    if blip_fill_elem is not None:
        blip_result = convert_blip_fill(
            blip_fill_elem, node.xfrm, ctx.slide_part, ctx.pkg,
            media_subdir=ctx.media_subdir,
            embed_inline=ctx.embed_images,
            asset_name_map=ctx.asset_name_map,
        )
        if blip_result.svg:
            blip_image = _clip_blip_image(blip_result.svg, geom, ctx)
            ctx.media.update(blip_result.media)

    # Geometry (fill is "none" when blipFill is present, so only stroke draws)
    geom_xml = _build_geometry_xml(node, sp_pr, ctx, geom=geom)

    # Text body (a:txBody)
    tx_body = node.xml.find("p:txBody", NS)
    is_vertical = is_vertical_txbody(tx_body)
    if tx_body is not None and is_vertical:
        text_result = convert_vertical_txbody(
            tx_body, node.xfrm, ctx.palette,
            theme_fonts=ctx.theme_fonts,
        )
    else:
        text_result = convert_txbody(
            tx_body, node.xfrm, ctx.palette,
            theme_fonts=ctx.theme_fonts,
        ) if tx_body is not None else TextResult()

    if is_vertical:
        # Vertical text: geometry + image in one group, text in separate group
        geom_inner = (blip_image + "\n" + geom_xml) if blip_image else geom_xml
        shape_xml = _wrap_shape_group(geom_inner, node, ctx, top_level=top_level)
        if not text_result.svg:
            return shape_xml
        text_group = (
            f'<g id="{ctx.group_id_prefix}shape-{node.spid or ctx.shape_seq[0]}-text"'
            f' data-name="{_xml_escape(node.name)} text">\n'
            f"{text_result.svg}\n</g>"
        )
        return f"{shape_xml}\n{text_group}"

    # Normal: image (behind) + geometry (stroke) + text (top)
    inner_parts = []
    if blip_image:
        inner_parts.append(blip_image)
    if geom_xml:
        inner_parts.append(geom_xml)
    if text_result.svg:
        inner_parts.append(text_result.svg)
    inner = "\n".join(inner_parts) if inner_parts else ""
    return _wrap_shape_group(inner, node, ctx, top_level=top_level)


def _resolve_geometry(node: ShapeNode, sp_pr: ET.Element | None) -> GeomResult | None:
    """Resolve a DrawingML shape geometry into an absolute SVG geometry model."""
    prst_geom = sp_pr.find("a:prstGeom", NS) if sp_pr is not None else None
    cust_geom = sp_pr.find("a:custGeom", NS) if sp_pr is not None else None

    geom: GeomResult | None = None
    if prst_geom is not None:
        prst = prst_geom.attrib.get("prst", "rect")
        geom = convert_prst_geom(prst, node.xfrm, prst_geom)
        if geom is None:
            # Unknown prst — fall back to rect bounding box
            geom = convert_prst_geom("rect", node.xfrm, None)
    elif cust_geom is not None:
        d = convert_custom_geom(cust_geom, node.xfrm)
        if d:
            geom = GeomResult(tag="path", path_d=d)
    else:
        # No geometry hint at all — render bounding rect
        geom = convert_prst_geom("rect", node.xfrm, None)

    if geom is None:
        return None
    if geom.tag != "line" and (node.xfrm.w <= 0 or node.xfrm.h <= 0):
        return None
    return geom


def _build_geometry_xml(node: ShapeNode, sp_pr: ET.Element | None,
                        ctx: AssemblyContext,
                        geom: GeomResult | None = None) -> str:
    """Build the SVG geometry element with fill/stroke/effect attributes."""
    if geom is None:
        geom = _resolve_geometry(node, sp_pr)
    if geom is None:
        return ""

    # Fill / stroke / effect
    fill = resolve_fill(sp_pr, ctx.palette,
                        id_prefix="g", id_seq=ctx.grad_seq)
    stroke = resolve_stroke(sp_pr, ctx.palette,
                            id_prefix="m", id_seq=ctx.marker_seq)
    filter_id, effect_defs = convert_effects(sp_pr, ctx.palette,
                                             id_prefix="fx",
                                             id_seq=ctx.filter_seq)

    ctx.defs.extend(fill.defs)
    ctx.defs.extend(stroke.defs)
    ctx.defs.extend(effect_defs)

    attrs = {**fill.attrs, **stroke.attrs}
    style_defaults = _resolve_shape_style_defaults(node, ctx)
    for key, value in style_defaults.items():
        attrs.setdefault(key, value)
    if filter_id is not None:
        attrs["filter"] = f"url(#{filter_id})"

    # Default fill / stroke when not specified by spPr (matches PowerPoint
    # behavior: a:noFill on shape-level fill if there's a txBody, else any
    # explicit fill present in spPr should already have been captured).
    if "fill" not in attrs:
        attrs["fill"] = "none"
    if "stroke" not in attrs:
        # Spec default for shapes is no stroke unless ln says otherwise.
        # Skip emitting stroke="none" to keep markup tight.
        pass

    geom_attrs_xml = _attrs_to_xml({**geom.attrs, **attrs})
    return _geom_to_svg(geom, geom_attrs_xml)


def _resolve_shape_style_defaults(node: ShapeNode, ctx: AssemblyContext) -> dict[str, str]:
    """Resolve minimal p:style defaults used when spPr omits explicit style.

    Full theme style matrix reproduction is intentionally out of scope here;
    this only prevents common theme-styled placeholders/shapes from becoming
    transparent or unstroked when their visible color lives in p:style.
    """
    style = node.xml.find("p:style", NS)
    if style is None:
        return {}

    defaults: dict[str, str] = {}

    fill_ref = style.find("a:fillRef", NS)
    fill_color = _resolve_ref_color(fill_ref, ctx)
    if fill_color:
        defaults["fill"] = fill_color

    ln_ref = style.find("a:lnRef", NS)
    line_color = _resolve_ref_color(ln_ref, ctx)
    if line_color:
        defaults["stroke"] = line_color
        defaults.setdefault("stroke-width", "1")

    return defaults


def _resolve_ref_color(ref_elem: ET.Element | None, ctx: AssemblyContext) -> str | None:
    color_elem = find_color_elem(ref_elem)
    hex_, _alpha = resolve_color(color_elem, ctx.palette)
    return hex_


def _geom_to_svg(geom: GeomResult, attrs_xml: str = "") -> str:
    """Serialize a resolved geometry with optional SVG attributes."""
    if not attrs_xml:
        attrs_xml = _attrs_to_xml(geom.attrs)
    if geom.tag == "path":
        return f'<path d="{geom.path_d}"{attrs_xml}/>'
    if geom.tag in ("polygon", "polyline"):
        return f'<{geom.tag} points="{geom.points}"{attrs_xml}/>'
    return f"<{geom.tag}{attrs_xml}/>"


def _clip_blip_image(image_xml: str, geom: GeomResult | None,
                     ctx: AssemblyContext) -> str:
    """Clip image fills to the owning shape geometry when it is not a plain rect."""
    if geom is None or geom.tag == "line":
        return image_xml
    if geom.tag == "rect" and not geom.attrs.get("rx") and not geom.attrs.get("ry"):
        return image_xml

    ctx.clip_seq[0] += 1
    clip_id = f"{ctx.group_id_prefix}clip{ctx.clip_seq[0]}"
    clip_shape = _geom_to_svg(geom)
    ctx.defs.append(
        f'<clipPath id="{clip_id}" clipPathUnits="userSpaceOnUse">'
        f'{clip_shape}</clipPath>'
    )
    return _inject_clip_path(image_xml, clip_id)


def _inject_clip_path(image_xml: str, clip_id: str) -> str:
    clip_attr = f' clip-path="url(#{clip_id})"'
    if image_xml.startswith("<image"):
        return image_xml.replace("<image", f"<image{clip_attr}", 1)
    if image_xml.startswith("<svg"):
        return image_xml.replace("<svg", f'<svg data-pptx-crop="1"{clip_attr}', 1)
    return image_xml


# ---------------------------------------------------------------------------
# Picture (<p:pic>)
# ---------------------------------------------------------------------------

def _convert_picture(node: ShapeNode, ctx: AssemblyContext, *, top_level: bool) -> str:
    result = convert_picture(
        node.xml, node.xfrm, ctx.slide_part, ctx.pkg,
        media_subdir=ctx.media_subdir,
        embed_inline=ctx.embed_images,
        asset_name_map=ctx.asset_name_map,
    )
    if not result.svg:
        return ""
    ctx.media.update(result.media)
    return _wrap_shape_group(result.svg, node, ctx, top_level=top_level)


# ---------------------------------------------------------------------------
# Connector (<p:cxnSp>)
# ---------------------------------------------------------------------------

def _convert_connector(node: ShapeNode, ctx: AssemblyContext, *, top_level: bool) -> str:
    sp_pr = node.xml.find("p:spPr", NS)
    geom_xml = _build_geometry_xml(node, sp_pr, ctx)
    return _wrap_shape_group(geom_xml, node, ctx, top_level=top_level)


# ---------------------------------------------------------------------------
# Group (<p:grpSp>)
# ---------------------------------------------------------------------------

def _convert_group(node: ShapeNode, ctx: AssemblyContext, *, top_level: bool) -> str:
    """Render group contents flat (children already remapped to slide space)."""
    inner_parts: list[str] = []
    for child in node.children:
        chunk = _convert_node(child, ctx, top_level=False)
        if chunk:
            inner_parts.append(chunk)
    if not inner_parts:
        return ""
    inner = "\n".join(inner_parts)
    return _wrap_shape_group(inner, node, ctx, top_level=top_level)


# ---------------------------------------------------------------------------
# Graphic frame fallback (<p:graphicFrame>)
# ---------------------------------------------------------------------------

def _convert_graphic_fallback(node: ShapeNode, ctx: AssemblyContext,
                              *, top_level: bool) -> str:
    """Render a <p:graphicFrame> by dispatching on its graphicData uri.

    Currently:
    - ``...drawingml/2006/table`` → real table renderer (`convert_tbl`)
    - ``...presentationml/2006/ole`` → render the ``mc:Fallback`` preview
      bitmap that PowerPoint bakes alongside every embedded OLE object.
      Visually identical to what PowerPoint shows for an unedited embed.
    - everything else (chart / SmartArt / diagram) → labelled bounding
      rectangle so the slide composition is preserved even though the inner
      content can't be drawn yet.
    """
    graphic_data = node.xml.find("a:graphic/a:graphicData", NS)
    uri = graphic_data.attrib.get("uri", "graphicFrame") if graphic_data is not None else "graphicFrame"

    if uri == "http://schemas.openxmlformats.org/drawingml/2006/table":
        rendered = _render_graphic_table(node, ctx, graphic_data)
        if rendered:
            return _wrap_shape_group(rendered, node, ctx, top_level=top_level)

    if uri == "http://schemas.openxmlformats.org/presentationml/2006/ole" and ctx.render_graphic_previews:
        rendered = _render_graphic_preview(node, ctx)
        if rendered:
            labelled = rendered + "\n" + _graphic_preview_label(node, "ole preview")
            return _wrap_shape_group(labelled, node, ctx, top_level=top_level)

    if ctx.render_graphic_previews:
        rendered = _render_graphic_preview(node, ctx)
        if rendered:
            labelled = rendered + "\n" + _graphic_preview_label(node, f"{uri.rsplit('/', 1)[-1]} preview")
            return _wrap_shape_group(labelled, node, ctx, top_level=top_level)

    label = uri.rsplit("/", 1)[-1]
    placeholder = (
        f'<rect x="{fmt_num(node.xfrm.x)}" y="{fmt_num(node.xfrm.y)}" '
        f'width="{fmt_num(node.xfrm.w)}" height="{fmt_num(node.xfrm.h)}" '
        f'fill="none" stroke="#999999" stroke-dasharray="4 4"/>'
        f'<text x="{fmt_num(node.xfrm.x + node.xfrm.w / 2)}" '
        f'y="{fmt_num(node.xfrm.y + node.xfrm.h / 2)}" '
        f'text-anchor="middle" font-size="14" fill="#999999">'
        f"[{_xml_escape(label)}]</text>"
    )
    return _wrap_shape_group(placeholder, node, ctx, top_level=top_level)


def _graphic_preview_label(node: ShapeNode, label: str) -> str:
    return (
        f'<rect x="{fmt_num(node.xfrm.x)}" y="{fmt_num(node.xfrm.y)}" '
        f'width="{fmt_num(node.xfrm.w)}" height="22" '
        f'fill="#FFFFFF" fill-opacity="0.82" stroke="#999999" stroke-width="0.5"/>'
        f'<text x="{fmt_num(node.xfrm.x + 6)}" y="{fmt_num(node.xfrm.y + 15)}" '
        f'font-size="11" fill="#666666">[{_xml_escape(label)}]</text>'
    )


def _render_graphic_table(node: ShapeNode, ctx: AssemblyContext,
                          graphic_data: ET.Element | None) -> str:
    """Convert the <a:tbl> child of a graphicFrame to SVG, or return ''."""
    if graphic_data is None:
        return ""
    tbl = graphic_data.find("a:tbl", NS)
    if tbl is None:
        return ""
    result = convert_tbl(
        tbl, node.xfrm, ctx.palette,
        theme_fonts=ctx.theme_fonts,
        id_prefix=f"tbl{ctx.shape_seq[0]}",
        grad_seq=ctx.grad_seq,
        marker_seq=ctx.marker_seq,
    )
    if result.defs:
        ctx.defs.extend(result.defs)
    return result.svg


def _render_graphic_preview(node: ShapeNode, ctx: AssemblyContext) -> str:
    """Render a graphicFrame's baked fallback preview bitmap when present.

    PowerPoint stores a static raster preview for many embedded graphics
    inside ``mc:AlternateContent``. The Fallback branch is normally a plain
    ``p:pic`` (sometimes nested), so any conformant viewer that can't speak
    the richer object paints the preview. We do the same for flat preview SVGs.

    Falls back to '' when the deck has no Fallback pic (very old or
    third-party authoring tools sometimes omit it). Caller then emits the
    dashed placeholder.
    """
    ac = node.xml.find("a:graphic/a:graphicData/mc:AlternateContent", NS)
    if ac is None:
        return ""
    pic = ac.find("mc:Fallback//p:pic", NS)
    if pic is None:
        # Some authoring tools put the preview directly in mc:Choice.
        pic = ac.find("mc:Choice//p:pic", NS)
        if pic is None:
            return ""

    # The inner pic carries its own absolute xfrm in this deck (and in every
    # well-formed PPTX I've seen — PowerPoint copies the graphicFrame xfrm
    # there during save). If it's missing, fall back to the graphicFrame's
    # xfrm so the preview at least lands somewhere visible.
    inner_xfrm = node.xfrm
    pic_xfrm_elem = pic.find("p:spPr/a:xfrm", NS)
    if pic_xfrm_elem is not None:
        from .emu_units import parse_xfrm
        parsed = parse_xfrm(pic_xfrm_elem)
        if parsed.w > 0 and parsed.h > 0:
            inner_xfrm = parsed

    result = convert_picture(
        pic, inner_xfrm, ctx.slide_part, ctx.pkg,
        media_subdir=ctx.media_subdir,
        embed_inline=ctx.embed_images,
        asset_name_map=ctx.asset_name_map,
    )
    if not result.svg:
        return ""
    ctx.media.update(result.media)
    return result.svg


# ---------------------------------------------------------------------------
# Background
# ---------------------------------------------------------------------------

def _emit_background(slide: SlideRef, ctx: AssemblyContext,
                     w: float, h: float) -> str:
    """Inspect <p:bg> on slide / layout / master in inheritance order."""
    for part in (slide.part, slide.layout, slide.master):
        if part is None:
            continue
        bg = get_background(part.xml)
        if bg is None:
            continue
        bg_pr = bg.find("p:bgPr", NS)
        bg_ref = bg.find("p:bgRef", NS)
        placeholder_hex = None

        if bg_pr is None and bg_ref is not None:
            bg_pr = _theme_background_fill(slide, ctx, bg_ref)
            color_elem = find_color_elem(bg_ref)
            placeholder_hex, _ = resolve_color(color_elem, ctx.palette)
        if bg_pr is None:
            continue

        bg_image = _emit_background_image(bg_pr, part, ctx, w, h)
        if bg_image:
            return bg_image

        fill = resolve_fill(
            bg_pr, ctx.palette,
            id_prefix="bg", id_seq=ctx.grad_seq,
            placeholder_hex=placeholder_hex,
        )
        ctx.defs.extend(fill.defs)
        if not fill.attrs:
            return ""
        # Convert dict to attributes
        attrs_xml = _attrs_to_xml(fill.attrs)
        return (f'<rect x="0" y="0" width="{fmt_num(w)}" height="{fmt_num(h)}"'
                f"{attrs_xml}/>")
    return ""


def _emit_part_background(slide: SlideRef, ctx: AssemblyContext,
                          w: float, h: float) -> str:
    """Render the background declared on the part itself only.

    Distinct from `_emit_background`, which walks the slide → layout →
    master inheritance chain. Used by the layered solo renderer so each
    standalone master / layout SVG carries only its own ``<p:bg>`` — the
    inheritance is rebuilt by consumers re-stacking the layers, and we'd
    rather output nothing than have master decoration leak into a layout
    file.
    """
    bg = get_background(slide.part.xml)
    if bg is None:
        return ""
    bg_pr = bg.find("p:bgPr", NS)
    bg_ref = bg.find("p:bgRef", NS)
    placeholder_hex = None

    if bg_pr is None and bg_ref is not None:
        bg_pr = _theme_background_fill(slide, ctx, bg_ref)
        color_elem = find_color_elem(bg_ref)
        placeholder_hex, _ = resolve_color(color_elem, ctx.palette)
    if bg_pr is None:
        return ""

    bg_image = _emit_background_image(bg_pr, slide.part, ctx, w, h)
    if bg_image:
        return bg_image

    fill = resolve_fill(
        bg_pr, ctx.palette,
        id_prefix="bg", id_seq=ctx.grad_seq,
        placeholder_hex=placeholder_hex,
    )
    ctx.defs.extend(fill.defs)
    if not fill.attrs:
        return ""
    attrs_xml = _attrs_to_xml(fill.attrs)
    return (f'<rect x="0" y="0" width="{fmt_num(w)}" height="{fmt_num(h)}"'
            f"{attrs_xml}/>")


def _emit_background_image(
    bg_pr: ET.Element,
    source_part: PartRef,
    ctx: AssemblyContext,
    w: float,
    h: float,
) -> str:
    """Render a slide/layout/master background image fill as a full-canvas image."""
    blip_fill = bg_pr.find("a:blipFill", NS)
    if blip_fill is None:
        return ""

    result = convert_blip_fill(
        blip_fill,
        Xfrm(0.0, 0.0, w, h),
        source_part,
        ctx.pkg,
        media_subdir=ctx.media_subdir,
        embed_inline=ctx.embed_images,
        asset_name_map=ctx.asset_name_map,
    )
    if result.media:
        ctx.media.update(result.media)
    return result.svg


def _theme_background_fill(
    slide: SlideRef,
    ctx: AssemblyContext,
    bg_ref: ET.Element,
) -> ET.Element | None:
    """Resolve p:bgRef idx into the theme background fill style list."""
    idx_raw = bg_ref.attrib.get("idx")
    if not idx_raw:
        return None
    try:
        idx = int(idx_raw)
    except ValueError:
        return None
    # ECMA style matrix background fill references are 1001-based.
    bg_fill_index = idx - 1001
    if bg_fill_index < 0:
        return None

    theme = ctx.pkg.resolve_theme(slide.master)
    if theme is None:
        return None
    fill_list = theme.xml.find(".//a:fmtScheme/a:bgFillStyleLst", NS)
    if fill_list is None:
        return None
    fills = [child for child in list(fill_list) if isinstance(child.tag, str)]
    if bg_fill_index >= len(fills):
        return None
    return fills[bg_fill_index]


def _emit_inherited_shapes(slide: SlideRef, ctx: AssemblyContext) -> list[str]:
    parts: list[str] = []
    for prefix, part in (("master-", slide.master), ("layout-", slide.layout)):
        if part is None:
            continue
        original_part = ctx.slide_part
        original_prefix = ctx.group_id_prefix
        ctx.slide_part = part
        ctx.group_id_prefix = prefix
        try:
            for node in walk_sp_tree(part.xml):
                if _is_placeholder_node(node):
                    continue
                chunk = _convert_node(node, ctx, top_level=True)
                if chunk:
                    parts.append(chunk)
        finally:
            ctx.slide_part = original_part
            ctx.group_id_prefix = original_prefix
    return parts


def _is_placeholder_node(node: ShapeNode) -> bool:
    if node.placeholder is not None:
        return True
    if node.kind == GROUP:
        return all(_is_placeholder_node(child) for child in node.children)
    return False


def _convert_placeholder_guide(node: ShapeNode, ctx: AssemblyContext,
                               *, top_level: bool) -> str:
    """Emit a lightweight visible guide for template placeholder slots."""
    ph = node.placeholder
    label_parts = ["ph"]
    if ph is not None:
        if ph.type:
            label_parts.append(ph.type)
        if ph.idx:
            label_parts.append(f"idx={ph.idx}")
    label = " ".join(label_parts)
    guide = (
        f'<rect x="{fmt_num(node.xfrm.x)}" y="{fmt_num(node.xfrm.y)}" '
        f'width="{fmt_num(node.xfrm.w)}" height="{fmt_num(node.xfrm.h)}" '
        f'fill="#F8FAFC" fill-opacity="0.18" stroke="#94A3B8" '
        f'stroke-dasharray="6 4" stroke-width="1"/>'
        f'<text x="{fmt_num(node.xfrm.x + 8)}" y="{fmt_num(node.xfrm.y + 18)}" '
        f'font-size="12" fill="#64748B">{_xml_escape(label)}</text>'
    )
    return _wrap_shape_group(guide, node, ctx, top_level=top_level)


# ---------------------------------------------------------------------------
# Wrap / utilities
# ---------------------------------------------------------------------------

def _wrap_shape_group(inner: str, node: ShapeNode, ctx: AssemblyContext,
                      *, top_level: bool) -> str:
    """Wrap a shape's body in a <g> that carries the transform (rotation /
    flip) and an id for animation anchoring."""
    if not inner.strip():
        return ""

    transform = node.xfrm.to_svg_transform()
    ctx.shape_seq[0] += 1
    seq = ctx.shape_seq[0]
    sid = node.spid or str(seq)
    g_id = f"{ctx.group_id_prefix}shape-{sid}"

    attrs: list[str] = [f'id="{g_id}"']
    if node.name:
        attrs.append(f'data-name="{_xml_escape(node.name)}"')
    if node.placeholder is not None and node.placeholder.type:
        attrs.append(f'data-ph-type="{_xml_escape(node.placeholder.type)}"')
    if transform:
        attrs.append(f'transform="{transform}"')
    return f"<g {' '.join(attrs)}>\n{inner}\n</g>"


def _attrs_to_xml(attrs: dict[str, str]) -> str:
    if not attrs:
        return ""
    return "".join(f' {k}="{v}"' for k, v in attrs.items())


def _xml_escape(text: str) -> str:
    return (text.replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace('"', "&quot;"))
