"""svg_finalize — shared self-containment + DrawingML-compat utilities.

Used by two consumers:

  1. finalize_svg.py — writes svg_output/ → svg_final/ on disk
  2. svg_to_pptx (use_expander, tspan_flattener) — reuses these modules
     in memory during native pptx conversion

Deleting any module here is likely to break native pptx output, not just
svg_final/. See docs/technical-design.md "Post-Processing Pipeline" for
the full per-module consumer table.
"""
