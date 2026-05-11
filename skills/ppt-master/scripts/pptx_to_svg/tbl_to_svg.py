"""Convert a DrawingML <a:tbl> into SVG.

Tables in PowerPoint are stored under <p:graphicFrame> with
graphicData uri="...drawingml/2006/table" wrapping a single <a:tbl>:

    <p:graphicFrame>
      <p:xfrm>...</p:xfrm>
      <a:graphic><a:graphicData uri="...table">
        <a:tbl>
          <a:tblPr/>
          <a:tblGrid>
            <a:gridCol w="..."/>...
          </a:tblGrid>
          <a:tr h="...">
            <a:tc [gridSpan=N] [rowSpan=N] [hMerge=1] [vMerge=1]>
              <a:txBody>...</a:txBody>
              <a:tcPr>
                <a:lnL/><a:lnR/><a:lnT/><a:lnB/>
                <a:solidFill/>... or <a:gradFill/> ...
              </a:tcPr>
            </a:tc>
          </a:tr>
        </a:tbl>
      </a:graphicData></a:graphic>
    </p:graphicFrame>

The graphicFrame's <p:xfrm> gives the table's slide-space position and total
size; <a:tblGrid> + <a:tr> heights distribute that size across columns/rows.

Cell painting order:
1. background fill (rect at cell box)
2. text body (re-uses convert_txbody)
3. cell borders (lnT / lnR / lnB / lnL — stroked as separate <line>s so
   neighbouring cells with different border styles render correctly)
"""

from __future__ import annotations

from dataclasses import dataclass
from xml.etree import ElementTree as ET

from .color_resolver import ColorPalette
from .emu_units import NS, Xfrm, emu_to_px, fmt_num
from .fill_to_svg import resolve_fill
from .ln_to_svg import resolve_stroke
from .txbody_to_svg import convert_txbody


@dataclass
class TableResult:
    """Composite render output: SVG body + accumulated <defs>."""

    svg: str = ""
    defs: list[str] = None

    def __post_init__(self) -> None:
        if self.defs is None:
            self.defs = []


# ---------------------------------------------------------------------------
# Public entry
# ---------------------------------------------------------------------------

def convert_tbl(
    tbl: ET.Element,
    xfrm: Xfrm,
    palette: ColorPalette | None,
    *,
    theme_fonts: dict[str, str] | None = None,
    id_prefix: str = "tbl",
    grad_seq: list[int] | None = None,
    marker_seq: list[int] | None = None,
) -> TableResult:
    """Render an <a:tbl> at the given absolute xfrm into SVG markup."""
    grad_seq = grad_seq if grad_seq is not None else [0]
    marker_seq = marker_seq if marker_seq is not None else [0]

    col_widths_px = _column_widths_px(tbl)
    if not col_widths_px:
        return TableResult()
    rows = tbl.findall("a:tr", NS)
    if not rows:
        return TableResult()
    row_heights_px = [_row_height_px(r) for r in rows]

    # PowerPoint's tblGrid widths and tr heights together describe the
    # *intrinsic* table size. The graphicFrame xfrm width/height may differ;
    # if it does, scale rows/columns proportionally so the table fills the
    # frame the way PowerPoint renders it.
    intrinsic_w = sum(col_widths_px) or xfrm.w
    intrinsic_h = sum(row_heights_px) or xfrm.h
    sx = (xfrm.w / intrinsic_w) if intrinsic_w else 1.0
    sy = (xfrm.h / intrinsic_h) if intrinsic_h else 1.0
    col_widths = [w * sx for w in col_widths_px]
    row_heights = [h * sy for h in row_heights_px]

    col_lefts = _cumulative_starts(xfrm.x, col_widths)
    row_tops = _cumulative_starts(xfrm.y, row_heights)

    # First pass: resolve merge state so spanned cells get the union geometry
    # and dropped cells don't render anything. PowerPoint expresses merges via
    # gridSpan/rowSpan on the anchor cell + hMerge/vMerge on the dropped cells.
    cells = _build_cell_grid(rows, len(col_widths))

    body_parts: list[str] = []
    defs: list[str] = []

    # Pass A: cell backgrounds.
    for r, row_cells in enumerate(cells):
        for c, cell in enumerate(row_cells):
            if cell is None or cell.is_dropped:
                continue
            rect_x = col_lefts[c]
            rect_y = row_tops[r]
            rect_w = sum(col_widths[c:c + cell.col_span])
            rect_h = sum(row_heights[r:r + cell.row_span])
            tcPr = cell.element.find("a:tcPr", NS)
            fill = resolve_fill(
                tcPr, palette,
                id_prefix=f"{id_prefix}fill",
                id_seq=grad_seq,
            )
            defs.extend(fill.defs)
            attrs = fill.attrs or {"fill": "none"}
            attr_str = "".join(f' {k}="{v}"' for k, v in attrs.items())
            body_parts.append(
                f'<rect x="{fmt_num(rect_x)}" y="{fmt_num(rect_y)}" '
                f'width="{fmt_num(rect_w)}" height="{fmt_num(rect_h)}"'
                f'{attr_str}/>'
            )

    # Pass B: cell text. Cell xfrm uses default tcPr insets if none specified.
    for r, row_cells in enumerate(cells):
        for c, cell in enumerate(row_cells):
            if cell is None or cell.is_dropped:
                continue
            tx_body = cell.element.find("a:txBody", NS)
            if tx_body is None:
                continue
            tcPr = cell.element.find("a:tcPr", NS)
            cell_x = col_lefts[c]
            cell_y = row_tops[r]
            cell_w = sum(col_widths[c:c + cell.col_span])
            cell_h = sum(row_heights[r:r + cell.row_span])
            cell_xfrm = Xfrm(x=cell_x, y=cell_y, w=cell_w, h=cell_h)
            text_result = _convert_cell_text(
                tx_body, tcPr, cell_xfrm, palette, theme_fonts,
            )
            if text_result.svg:
                body_parts.append(text_result.svg)

    # Pass C: cell borders. Drawn last so they appear on top of fills/text.
    for r, row_cells in enumerate(cells):
        for c, cell in enumerate(row_cells):
            if cell is None or cell.is_dropped:
                continue
            cell_x = col_lefts[c]
            cell_y = row_tops[r]
            cell_w = sum(col_widths[c:c + cell.col_span])
            cell_h = sum(row_heights[r:r + cell.row_span])
            tcPr = cell.element.find("a:tcPr", NS)
            for tag, x1, y1, x2, y2 in (
                ("a:lnT", cell_x, cell_y, cell_x + cell_w, cell_y),
                ("a:lnR", cell_x + cell_w, cell_y, cell_x + cell_w, cell_y + cell_h),
                ("a:lnB", cell_x, cell_y + cell_h, cell_x + cell_w, cell_y + cell_h),
                ("a:lnL", cell_x, cell_y, cell_x, cell_y + cell_h),
            ):
                line_xml = _border_line(
                    tcPr, tag, x1, y1, x2, y2, palette,
                    id_prefix=f"{id_prefix}stk", id_seq=marker_seq, defs=defs,
                )
                if line_xml:
                    body_parts.append(line_xml)

    return TableResult(svg="\n".join(body_parts), defs=defs)


# ---------------------------------------------------------------------------
# Geometry helpers
# ---------------------------------------------------------------------------

def _column_widths_px(tbl: ET.Element) -> list[float]:
    grid = tbl.find("a:tblGrid", NS)
    if grid is None:
        return []
    widths: list[float] = []
    for col in grid.findall("a:gridCol", NS):
        w_emu = col.attrib.get("w")
        if w_emu is None:
            continue
        try:
            widths.append(emu_to_px(int(w_emu)))
        except ValueError:
            widths.append(0.0)
    return widths


def _row_height_px(row: ET.Element) -> float:
    h_emu = row.attrib.get("h")
    if h_emu is None:
        return 0.0
    try:
        return emu_to_px(int(h_emu))
    except ValueError:
        return 0.0


def _cumulative_starts(origin: float, sizes: list[float]) -> list[float]:
    out = [origin]
    acc = origin
    for size in sizes[:-1]:
        acc += size
        out.append(acc)
    return out


# ---------------------------------------------------------------------------
# Cell grid
# ---------------------------------------------------------------------------

@dataclass
class _CellSlot:
    """Per-grid-position resolution of <a:tc> attributes."""

    element: ET.Element
    col_span: int = 1
    row_span: int = 1
    is_dropped: bool = False  # True for h/vMerge slaves: don't paint anything


def _build_cell_grid(rows: list[ET.Element], col_count: int) -> list[list[_CellSlot | None]]:
    """Map each (row, col) to the <a:tc> that owns it.

    Anchor cells (the top-left of a merge) carry col_span/row_span; merged
    slaves are marked is_dropped so the renderer skips them. Cells not part
    of any merge get span 1×1.
    """
    grid: list[list[_CellSlot | None]] = [[None] * col_count for _ in rows]

    for r, row in enumerate(rows):
        c = 0
        for tc in row.findall("a:tc", NS):
            # Skip already-occupied slots from a row above's rowSpan anchor.
            while c < col_count and grid[r][c] is not None:
                c += 1
            if c >= col_count:
                break

            grid_span = _safe_int(tc.attrib.get("gridSpan"), 1)
            row_span = _safe_int(tc.attrib.get("rowSpan"), 1)
            h_merge = tc.attrib.get("hMerge") == "1"
            v_merge = tc.attrib.get("vMerge") == "1"

            if h_merge or v_merge:
                # This cell is a merge slave; leave the slot tied to the anchor
                # if one was already placed there, else mark as dropped placeholder.
                if grid[r][c] is None:
                    grid[r][c] = _CellSlot(element=tc, is_dropped=True)
                c += 1
                continue

            slot = _CellSlot(
                element=tc,
                col_span=max(grid_span, 1),
                row_span=max(row_span, 1),
            )
            for dr in range(slot.row_span):
                for dc in range(slot.col_span):
                    rr = r + dr
                    cc = c + dc
                    if rr >= len(rows) or cc >= col_count:
                        continue
                    if dr == 0 and dc == 0:
                        grid[rr][cc] = slot
                    else:
                        grid[rr][cc] = _CellSlot(
                            element=tc, is_dropped=True,
                        )
            c += slot.col_span

    return grid


def _safe_int(value: str | None, default: int) -> int:
    if value is None:
        return default
    try:
        return int(value)
    except ValueError:
        return default


# ---------------------------------------------------------------------------
# Cell text & borders
# ---------------------------------------------------------------------------

def _convert_cell_text(
    tx_body: ET.Element,
    tcPr: ET.Element | None,
    cell_xfrm: Xfrm,
    palette: ColorPalette | None,
    theme_fonts: dict[str, str] | None,
):
    """Render cell text. PowerPoint's <a:tcPr> can override txBody insets via
    its own marL/marR/marT/marB attrs; convert_txbody reads from <a:bodyPr>,
    so we materialise a synthetic bodyPr by mutating the txBody in place when
    tcPr has its own insets. (We undo the mutation afterwards to keep the
    slide tree pristine for any subsequent passes.)"""
    body_pr = tx_body.find("a:bodyPr", NS)
    overrides = _tcPr_inset_overrides(tcPr)
    saved: dict[str, str | None] = {}
    if overrides and body_pr is not None:
        for key, val in overrides.items():
            saved[key] = body_pr.attrib.get(key)
            body_pr.set(key, val)
    try:
        return convert_txbody(
            tx_body, cell_xfrm, palette, theme_fonts=theme_fonts,
        )
    finally:
        if overrides and body_pr is not None:
            for key, prior in saved.items():
                if prior is None:
                    body_pr.attrib.pop(key, None)
                else:
                    body_pr.set(key, prior)


def _tcPr_inset_overrides(tcPr: ET.Element | None) -> dict[str, str]:
    if tcPr is None:
        return {}
    out: dict[str, str] = {}
    for src, dst in (("marL", "lIns"), ("marR", "rIns"),
                     ("marT", "tIns"), ("marB", "bIns")):
        if src in tcPr.attrib:
            out[dst] = tcPr.attrib[src]
    return out


def _border_line(
    tcPr: ET.Element | None,
    tag: str,
    x1: float, y1: float, x2: float, y2: float,
    palette: ColorPalette | None,
    *,
    id_prefix: str,
    id_seq: list[int],
    defs: list[str],
) -> str:
    """Emit a single border <line> for a given cell side, or empty string when
    that side is explicitly noFill / not specified."""
    if tcPr is None:
        return ""
    ln = tcPr.find(tag, NS)
    if ln is None:
        return ""
    # Skip explicit no-line.
    if ln.find("a:noFill", NS) is not None:
        return ""

    stroke = resolve_stroke(
        # resolve_stroke expects a parent that contains <a:ln>; wrap so it
        # finds our tag's own children as the line spec.
        _make_ln_wrapper(ln),
        palette,
        id_prefix=id_prefix,
        id_seq=id_seq,
    )
    defs.extend(stroke.defs)
    attrs = stroke.attrs
    if not attrs.get("stroke"):
        return ""
    attr_str = "".join(f' {k}="{v}"' for k, v in attrs.items())
    return (
        f'<line x1="{fmt_num(x1)}" y1="{fmt_num(y1)}" '
        f'x2="{fmt_num(x2)}" y2="{fmt_num(y2)}"{attr_str}/>'
    )


def _make_ln_wrapper(ln: ET.Element) -> ET.Element:
    """resolve_stroke walks for ``parent.find('a:ln')``; tcPr borders ARE the
    <a:ln> already, so wrap them in a synthetic parent that points back at
    the original element under the expected tag.
    """
    wrapper = ET.Element(f"{{{NS['a']}}}wrapper")
    proxy = ET.SubElement(wrapper, f"{{{NS['a']}}}ln")
    # Carry attributes (e.g. w="...") and children (solidFill, prstDash, ...).
    for k, v in ln.attrib.items():
        proxy.set(k, v)
    for child in list(ln):
        proxy.append(child)
    return wrapper
