"""In-memory flattening of positional ``<tspan>`` elements.

DrawingML's text-run model has no way to express "jump to a new x/y inside
the same paragraph". Every ``<tspan>`` carrying ``x``, ``y`` or non-zero
``dy`` is therefore a layout instruction this converter cannot honour
inline — without flattening, a 4-line dy-stacked block collapses onto a
single baseline and an x-anchored tspan jumps to the wrong column.

The on-disk ``finalize_svg`` pipeline solves this by promoting each
positional tspan to an independent ``<text>`` element. This module
performs the same transformation in memory so ``svg_to_pptx`` can consume
``svg_output/`` directly without that disk step.

Public API:
    flatten_positional_tspans(tree) -> bool
        Walk the SVG element tree, replace every positional ``<tspan>``
        with an independent ``<text>``, and return whether anything
        changed.

Heavy lifting is delegated to ``svg_finalize.flatten_tspan`` so the two
pipelines stay behaviourally aligned.
"""

from __future__ import annotations

import sys
from pathlib import Path
from xml.etree import ElementTree as ET


def flatten_positional_tspans(tree: ET.ElementTree) -> bool:
    """Flatten positional ``<tspan>`` elements into independent ``<text>``.

    Delegates to ``svg_finalize.flatten_tspan.flatten_text_with_tspans`` so
    the in-memory transform exactly matches the on-disk one.

    Returns True if any tspan was rewritten.
    """
    scripts_dir = Path(__file__).resolve().parent.parent
    if str(scripts_dir) not in sys.path:
        sys.path.insert(0, str(scripts_dir))
    from svg_finalize.flatten_tspan import flatten_text_with_tspans  # type: ignore
    return flatten_text_with_tspans(tree)
