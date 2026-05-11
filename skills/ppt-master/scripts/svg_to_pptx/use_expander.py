"""In-memory expansion of ``<use data-icon="lib/name">`` elements.

The icon placeholder ``<use data-icon="...">`` is a project-internal SVG
extension; standard renderers (browsers, PowerPoint's SVG parser) and our
own DrawingML dispatcher do not understand it. ``finalize_svg`` already
expands it on disk into ``svg_final/``; this module provides the same
expansion in memory so ``svg_to_pptx`` can consume ``svg_output/`` directly
without first running the on-disk finalize step.

Public API:
    expand_use_data_icons(root, icons_dir) -> int
        Walk the SVG element tree, replace every ``<use data-icon="...">``
        with its expanded ``<g>`` group of primitive shapes, and return
        the number of replacements made.

The heavy lifting (icon resolution, color application, scaling) is
delegated to ``svg_finalize.embed_icons`` so the two pipelines stay
behaviourally aligned.
"""

from __future__ import annotations

import sys
from pathlib import Path
from xml.etree import ElementTree as ET


SVG_NS = 'http://www.w3.org/2000/svg'


def _import_embed_icons():
    """Lazy import so svg_to_pptx doesn't hard-require svg_finalize at import time."""
    scripts_dir = Path(__file__).resolve().parent.parent
    if str(scripts_dir) not in sys.path:
        sys.path.insert(0, str(scripts_dir))
    from svg_finalize import embed_icons  # type: ignore
    return embed_icons


def _build_replacement_g(
    use_elem: ET.Element,
    icons_dir: Path,
    embed_icons_mod,
) -> ET.Element | None:
    """Resolve a single ``<use data-icon="...">`` into an expanded ``<g>``.

    Returns None when the icon name is missing, unresolved, or the icon
    file cannot be parsed. Callers should leave the original ``<use>`` in
    place in that case (matching the on-disk finalize_svg behaviour, which
    also leaves unresolvable placeholders untouched).
    """
    use_str = ET.tostring(use_elem, encoding='unicode')
    attrs = embed_icons_mod.parse_use_element(use_str)
    if 'icon' not in attrs:
        return None

    icon_path, _base_size = embed_icons_mod.resolve_icon_path(
        attrs['icon'], icons_dir,
    )
    if not icon_path.exists():
        return None

    color = attrs.get('fill', '#000000')
    elements, style, base_size = embed_icons_mod.extract_paths_from_icon(
        icon_path, color,
    )
    if not elements:
        return None

    g_xml = embed_icons_mod.generate_icon_group(attrs, elements, style, base_size)

    # Wrap with a namespaced root so the parsed subtree carries the SVG
    # namespace through to every primitive (path/circle/...).
    wrapped = f'<svg xmlns="{SVG_NS}">{g_xml}</svg>'
    try:
        parsed_root = ET.fromstring(wrapped)
    except ET.ParseError:
        return None

    for child in parsed_root:
        local = child.tag.split('}')[-1] if '}' in child.tag else child.tag
        if local == 'g':
            return child
    return None


def expand_use_data_icons(root: ET.Element, icons_dir: Path) -> int:
    """Replace every ``<use data-icon="...">`` in *root* with its expansion.

    Walks the tree, finds use elements that carry a ``data-icon`` attribute,
    builds a new ``<g>`` subtree from the corresponding icon library, and
    swaps it into the parent element at the same position.

    Returns the number of placeholders successfully expanded. Unresolvable
    placeholders are left in place so callers can decide whether to warn.
    """
    if not icons_dir.exists():
        return 0

    embed_icons_mod = _import_embed_icons()

    # ElementTree elements don't carry a parent reference, so build a map.
    parent_of: dict[ET.Element, ET.Element] = {}
    for parent in root.iter():
        for child in parent:
            parent_of[child] = parent

    targets: list[ET.Element] = []
    for elem in root.iter():
        local = elem.tag.split('}')[-1] if '}' in elem.tag else elem.tag
        if local == 'use' and elem.get('data-icon'):
            targets.append(elem)

    expanded = 0
    for use_elem in targets:
        parent = parent_of.get(use_elem)
        if parent is None:
            continue
        replacement = _build_replacement_g(use_elem, icons_dir, embed_icons_mod)
        if replacement is None:
            continue
        idx = list(parent).index(use_elem)
        parent.remove(use_elem)
        parent.insert(idx, replacement)
        expanded += 1

    return expanded
