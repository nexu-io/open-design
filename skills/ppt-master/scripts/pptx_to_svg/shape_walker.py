"""Shape tree walker.

Reads <p:spTree> from a slide / layout / master and emits a normalized
ShapeNode tree that downstream converters can dispatch on.

Handles:
- <p:sp>           -> SHAPE
- <p:pic>          -> PICTURE
- <p:cxnSp>        -> CONNECTOR
- <p:grpSp>        -> GROUP (recurses; resolves a:chOff/a:chExt frame)
- <p:graphicFrame> -> GRAPHIC (table / chart / SmartArt — emitted as opaque
                     placeholder for v1 so callers can decide a fallback)
"""

from __future__ import annotations

from dataclasses import dataclass, field
from xml.etree import ElementTree as ET

from .emu_units import NS, Xfrm, parse_xfrm


# ---------------------------------------------------------------------------
# ShapeNode
# ---------------------------------------------------------------------------

SHAPE = "sp"
PICTURE = "pic"
CONNECTOR = "cxnSp"
GROUP = "grpSp"
GRAPHIC = "graphicFrame"


@dataclass
class PlaceholderInfo:
    """Resolved <p:ph> attributes for a shape if any."""

    type: str | None = None  # title / body / ctrTitle / subTitle / ftr / dt / ...
    idx: str | None = None
    sz: str | None = None  # full / half / quarter
    orient: str | None = None


@dataclass
class ShapeNode:
    """Normalized shape entry produced by the walker."""

    kind: str  # one of SHAPE / PICTURE / CONNECTOR / GROUP / GRAPHIC
    xml: ET.Element  # original element
    xfrm: Xfrm  # resolved geometry in absolute slide pixel space
    name: str = ""
    spid: str = ""
    hidden: bool = False
    placeholder: PlaceholderInfo | None = None
    # GROUP only: children, in z-order
    children: list["ShapeNode"] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Walker
# ---------------------------------------------------------------------------

def _read_nv_sp_pr(parent: ET.Element, nv_tag: str) -> tuple[str, str, bool, PlaceholderInfo | None]:
    """Extract name/id/hidden/placeholder from an nvXXXPr container.

    nv_tag is one of nvSpPr / nvPicPr / nvCxnSpPr / nvGrpSpPr / nvGraphicFramePr.
    """
    container = parent.find(f"p:{nv_tag}", NS)
    name = ""
    spid = ""
    hidden = False
    ph: PlaceholderInfo | None = None
    if container is None:
        return name, spid, hidden, ph

    cnv = container.find("p:cNvPr", NS)
    if cnv is not None:
        name = cnv.attrib.get("name", "")
        spid = cnv.attrib.get("id", "")
        if cnv.attrib.get("hidden") == "1":
            hidden = True

    nv_pr = container.find("p:nvPr", NS)
    if nv_pr is not None:
        ph_elem = nv_pr.find("p:ph", NS)
        if ph_elem is not None:
            ph = PlaceholderInfo(
                type=ph_elem.attrib.get("type"),
                idx=ph_elem.attrib.get("idx"),
                sz=ph_elem.attrib.get("sz"),
                orient=ph_elem.attrib.get("orient"),
            )

    return name, spid, hidden, ph


def _resolve_xfrm(shape: ET.Element, kind: str) -> ET.Element | None:
    """Find the <a:xfrm> element under the right spPr / grpSpPr container."""
    if kind == GROUP:
        sp_pr = shape.find("p:grpSpPr", NS)
    elif kind == GRAPHIC:
        # graphicFrame uses p:xfrm directly (no a: namespace)
        return shape.find("p:xfrm", NS)
    else:
        sp_pr = shape.find("p:spPr", NS)
    if sp_pr is None:
        return None
    return sp_pr.find("a:xfrm", NS)


def _adjust_for_group(child_xfrm: Xfrm, group_xfrm: Xfrm) -> Xfrm:
    """Map a child shape's xfrm from group's child coordinate space into the
    parent (group) coordinate space.

    DrawingML group rule: a child's a:off/a:ext is in the group's chOff/chExt
    coordinate system. We map to the group's actual off/ext on the slide.

    If the group has no chOff/chExt, fall back to identity translation.
    """
    if (group_xfrm.ch_w is None or group_xfrm.ch_h is None
            or group_xfrm.ch_w == 0 or group_xfrm.ch_h == 0):
        # No child frame — children already in slide space; just translate.
        return child_xfrm

    # Linear map: child-frame -> group's (off..off+ext)
    sx = group_xfrm.w / group_xfrm.ch_w if group_xfrm.ch_w else 1.0
    sy = group_xfrm.h / group_xfrm.ch_h if group_xfrm.ch_h else 1.0
    ch_x = group_xfrm.ch_x or 0.0
    ch_y = group_xfrm.ch_y or 0.0

    new_x = group_xfrm.x + (child_xfrm.x - ch_x) * sx
    new_y = group_xfrm.y + (child_xfrm.y - ch_y) * sy
    new_w = child_xfrm.w * sx
    new_h = child_xfrm.h * sy

    return Xfrm(
        x=new_x, y=new_y, w=new_w, h=new_h,
        rot=child_xfrm.rot,
        flip_h=child_xfrm.flip_h,
        flip_v=child_xfrm.flip_v,
        ch_x=child_xfrm.ch_x, ch_y=child_xfrm.ch_y,
        ch_w=child_xfrm.ch_w, ch_h=child_xfrm.ch_h,
    )


# Mapping from element tag -> kind / nv tag.
_KIND_MAP = {
    "sp": (SHAPE, "nvSpPr"),
    "pic": (PICTURE, "nvPicPr"),
    "cxnSp": (CONNECTOR, "nvCxnSpPr"),
    "grpSp": (GROUP, "nvGrpSpPr"),
    "graphicFrame": (GRAPHIC, "nvGraphicFramePr"),
}


def _walk_container(
    container: ET.Element,
    parent_group_xfrm: Xfrm | None,
    placeholder_xfrms: dict[tuple[str | None, str | None], Xfrm] | None = None,
) -> list[ShapeNode]:
    """Walk a p:spTree or p:grpSp subtree. Children kept in document (z) order.
    """
    nodes: list[ShapeNode] = []
    for child in list(container):
        if not isinstance(child.tag, str):
            continue
        local = child.tag.split("}", 1)[-1]
        kind_info = _KIND_MAP.get(local)
        if kind_info is None:
            continue
        kind, nv_tag = kind_info

        name, spid, hidden, ph = _read_nv_sp_pr(child, nv_tag)
        xfrm = parse_xfrm(_resolve_xfrm(child, kind))

        # Placeholders without their own xfrm inherit geometry from a matching
        # placeholder in the layout, then the master. This is what PowerPoint
        # itself does when rendering the slide. Without this fallback such
        # shapes get a 0×0 box and convert_txbody wraps every glyph onto its
        # own line — visually a vertical strip of single characters.
        if (ph is not None and placeholder_xfrms
                and (xfrm.w == 0 and xfrm.h == 0)):
            inherited = _lookup_placeholder_xfrm(ph, placeholder_xfrms)
            if inherited is not None:
                xfrm = Xfrm(
                    x=inherited.x, y=inherited.y,
                    w=inherited.w, h=inherited.h,
                    rot=xfrm.rot, flip_h=xfrm.flip_h, flip_v=xfrm.flip_v,
                    ch_x=xfrm.ch_x, ch_y=xfrm.ch_y,
                    ch_w=xfrm.ch_w, ch_h=xfrm.ch_h,
                )

        # If we're inside a group, remap to slide-absolute coordinates
        if parent_group_xfrm is not None:
            xfrm = _adjust_for_group(xfrm, parent_group_xfrm)

        node = ShapeNode(
            kind=kind, xml=child, xfrm=xfrm,
            name=name, spid=spid, hidden=hidden, placeholder=ph,
        )

        if kind == GROUP:
            node.children = _walk_container(
                child, xfrm, placeholder_xfrms=placeholder_xfrms,
            )

        nodes.append(node)
    return nodes


def _lookup_placeholder_xfrm(
    ph: PlaceholderInfo,
    table: dict[tuple[str | None, str | None], Xfrm],
) -> Xfrm | None:
    """Find an inherited xfrm for a placeholder. PowerPoint matches first by
    (type, idx) exactly, then by type alone, then by idx alone — so a slide
    body with idx="1" can pull from a layout body that omits idx, and a slide
    title with no idx can pull from a master title that has idx="0"."""
    for key in (
        (ph.type, ph.idx),
        (ph.type, None),
        (None, ph.idx),
    ):
        hit = table.get(key)
        if hit is not None and (hit.w > 0 or hit.h > 0):
            return hit
    return None


def _build_placeholder_xfrm_table(
    *parts: ET.Element | None,
) -> dict[tuple[str | None, str | None], Xfrm]:
    """Index placeholders that *do* have explicit geometry, in priority order.

    Pass parts most-specific to least-specific (layout first, master second);
    the first writer for a given key wins so layout overrides master, which is
    what PowerPoint's inheritance chain expects.
    """
    table: dict[tuple[str | None, str | None], Xfrm] = {}
    for part_xml in parts:
        if part_xml is None:
            continue
        sp_tree = part_xml.find("p:cSld/p:spTree", NS)
        if sp_tree is None:
            continue
        for sp in sp_tree.iter():
            if not isinstance(sp.tag, str) or sp.tag.split("}", 1)[-1] != "sp":
                continue
            ph_elem = sp.find("p:nvSpPr/p:nvPr/p:ph", NS)
            if ph_elem is None:
                continue
            xfrm_elem = sp.find("p:spPr/a:xfrm", NS)
            if xfrm_elem is None:
                continue
            xfrm = parse_xfrm(xfrm_elem)
            if xfrm.w <= 0 and xfrm.h <= 0:
                continue
            ph_type = ph_elem.attrib.get("type")
            ph_idx = ph_elem.attrib.get("idx")
            for key in ((ph_type, ph_idx),
                        (ph_type, None),
                        (None, ph_idx)):
                table.setdefault(key, xfrm)
    return table


def walk_sp_tree(
    slide_xml: ET.Element,
    *,
    layout_xml: ET.Element | None = None,
    master_xml: ET.Element | None = None,
) -> list[ShapeNode]:
    """Top-level entry: return shape nodes for a slide / layout / master XML.

    When ``slide_xml`` is a regular slide, pass its ``layout_xml`` and
    ``master_xml`` so that placeholders without explicit geometry can inherit
    from the layout/master. Layout and master walks pass neither — their own
    placeholders are the source of truth.
    """
    sp_tree = slide_xml.find("p:cSld/p:spTree", NS)
    if sp_tree is None:
        return []
    placeholder_xfrms = _build_placeholder_xfrm_table(layout_xml, master_xml)
    return _walk_container(
        sp_tree, parent_group_xfrm=None,
        placeholder_xfrms=placeholder_xfrms or None,
    )


def get_background(slide_xml: ET.Element) -> ET.Element | None:
    """Return the <p:bg> element if the slide defines its own background."""
    return slide_xml.find("p:cSld/p:bg", NS)
