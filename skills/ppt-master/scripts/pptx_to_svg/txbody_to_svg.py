"""DrawingML <p:txBody> -> SVG <text> conversion.

Reverse of svg_to_pptx/drawingml_elements.convert_text.

Strategy (v1):
- Each <a:p> paragraph emits one <text> element (one line of baseline).
  Multiple <a:r> runs in one paragraph become <tspan>s sharing the text
  element's x.
- Vertical layout: y of first paragraph is determined by anchor (t/ctr/b)
  and tIns/bIns. Subsequent paragraphs stack downward with line height
  derived from the largest font in the paragraph * 1.2 (default leading).
- Horizontal layout: text-anchor follows pPr@algn. x is computed from the
  text frame plus lIns/rIns and the alignment.
- No automatic word wrap (PPT's wrap is layout-time; v1 trusts the existing
  text frame width and emits text as-is). a:br produces an explicit linebreak.
- Bullet points (a:buChar / a:buAutoNum) are rendered as literal prefixes
  so the visual lands without relying on PowerPoint list semantics.

Color / font / size attributes propagate from a:rPr; missing attributes fall
back to the paragraph's endParaRPr or to spec-default values.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from xml.etree import ElementTree as ET

from .color_resolver import ColorPalette, find_color_elem, resolve_color
from .emu_units import (
    NS, Xfrm, fmt_num, emu_to_px, hundredths_pt_to_px,
)


# ---------------------------------------------------------------------------
# Defaults (matches DrawingML spec)
# ---------------------------------------------------------------------------

# Default body insets when bodyPr omits them: 0.1 inch left/right, 0.05 top/bot.
DEFAULT_INSETS_EMU = {"l": 91440, "t": 45720, "r": 91440, "b": 45720}

# Default font size = 1800 (= 18 pt = 24 px). Spec is actually 1800 (18pt).
DEFAULT_FONT_SIZE_PX = 24.0
DEFAULT_LINE_HEIGHT_RATIO = 1.2  # leading multiplier
DEFAULT_FILL_HEX = "#000000"


@dataclass
class TextRun:
    """A single run with resolved style + text."""

    text: str
    font_size_px: float
    font_family: str  # full font-family stack (latin, ea fallback joined)
    fill: str
    fill_opacity: float = 1.0
    bold: bool = False
    italic: bool = False
    underline: bool = False
    strikethrough: bool = False
    letter_spacing_px: float = 0.0
    is_break: bool = False  # marks an a:br within a paragraph


@dataclass
class TextParagraph:
    """One <a:p>: a list of runs sharing alignment + level."""

    runs: list[TextRun] = field(default_factory=list)
    align: str = "l"  # l / ctr / r / just / dist
    level: int = 0
    indent_px: float = 0.0
    margin_left_px: float = 0.0
    line_height_ratio: float = DEFAULT_LINE_HEIGHT_RATIO
    space_before_px: float = 0.0
    space_after_px: float = 0.0
    bullet_prefix: str = ""  # rendered prefix like '• ' or '1. '


@dataclass
class TextResult:
    """Resolved text body ready for SVG emission.

    `svg` is one or more <text> elements, already absolutely positioned
    inside the slide coordinate system. `defs` is empty for now.
    """

    svg: str = ""
    defs: list[str] = field(default_factory=list)


VERTICAL_TEXT_MODES = {"eaVert", "vert", "wordArtVert", "wordArtVertRtl"}


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def convert_txbody(
    tx_body: ET.Element | None,
    xfrm: Xfrm,
    palette: ColorPalette | None,
    *,
    theme_fonts: dict[str, str] | None = None,
) -> TextResult:
    """Convert <p:txBody> under the given shape geometry to SVG <text>(s)."""
    if tx_body is None:
        return TextResult()

    body_pr = tx_body.find("a:bodyPr", NS)
    paragraphs = _parse_paragraphs(tx_body, palette, theme_fonts or {})
    if not paragraphs or not _has_visible_text(paragraphs):
        return TextResult()

    # Insets + anchor + wrap
    lins = _read_emu_attr(body_pr, "lIns", DEFAULT_INSETS_EMU["l"])
    tins = _read_emu_attr(body_pr, "tIns", DEFAULT_INSETS_EMU["t"])
    rins = _read_emu_attr(body_pr, "rIns", DEFAULT_INSETS_EMU["r"])
    bins = _read_emu_attr(body_pr, "bIns", DEFAULT_INSETS_EMU["b"])
    anchor = body_pr.attrib.get("anchor", "t") if body_pr is not None else "t"
    wrap_mode = body_pr.attrib.get("wrap", "square") if body_pr is not None else "square"

    inner_x = xfrm.x + lins
    inner_y = xfrm.y + tins
    inner_w = max(xfrm.w - lins - rins, 1.0)
    inner_h = max(xfrm.h - tins - bins, 1.0)

    # Pre-wrap each paragraph into concrete display lines.
    wrap_width = inner_w if wrap_mode == "square" else float("inf")
    para_lines: list[list[list[TextRun]]] = [
        _wrap_paragraph_into_lines(p, wrap_width) for p in paragraphs
    ]

    # Pre-compute heights to support anchor=ctr / b
    para_heights = [
        _paragraph_height_from_lines(p, lines)
        for p, lines in zip(paragraphs, para_lines)
    ]
    total_h = sum(para_heights)
    if anchor == "ctr":
        cursor_y = inner_y + max(0.0, (inner_h - total_h) / 2.0)
    elif anchor == "b":
        cursor_y = inner_y + max(0.0, inner_h - total_h)
    else:
        cursor_y = inner_y

    bottom_y = inner_y + inner_h
    text_blocks: list[str] = []
    for para, lines, height in zip(paragraphs, para_lines, para_heights):
        cursor_y += para.space_before_px
        visible_lines = _clip_lines_to_bottom(para, lines, cursor_y, bottom_y)
        if visible_lines:
            text_blocks.append(
                _emit_paragraph(para, visible_lines, inner_x, inner_w, cursor_y)
            )
        cursor_y += height + para.space_after_px
        if cursor_y >= bottom_y:
            break

    return TextResult(svg="\n".join(text_blocks))


def is_vertical_txbody(tx_body: ET.Element | None) -> bool:
    if tx_body is None:
        return False
    body_pr = tx_body.find("a:bodyPr", NS)
    if body_pr is None:
        return False
    return body_pr.attrib.get("vert") in VERTICAL_TEXT_MODES


def convert_vertical_txbody(
    tx_body: ET.Element | None,
    xfrm: Xfrm,
    palette: ColorPalette | None,
    *,
    theme_fonts: dict[str, str] | None = None,
) -> TextResult:
    """Render East Asian vertical text as upright stacked glyphs.

    PowerPoint often combines ``bodyPr@vert=eaVert`` with a rotated text box.
    Rendering the text inside the rotated shape group makes Chinese glyphs lie
    sideways. This helper computes the final rotated box and places glyphs
    upright in slide coordinates.
    """
    if tx_body is None:
        return TextResult()

    paragraphs = _parse_paragraphs(tx_body, palette, theme_fonts or {})
    runs = [
        run
        for para in paragraphs
        for run in para.runs
        if not run.is_break and run.text
    ]
    if not runs:
        return TextResult()

    box_x, box_y, box_w, box_h = _rotated_bbox(xfrm)
    center_x = box_x + box_w / 2.0

    glyphs: list[tuple[str, TextRun]] = []
    for run in runs:
        for char in run.text:
            if char in "\r\n":
                continue
            if char == " ":
                continue
            glyphs.append((char, run))

    if not glyphs:
        return TextResult()

    advances = [glyph_run.font_size_px * 1.05 for _, glyph_run in glyphs]
    total_h = sum(advances)
    top_y = box_y + max(0.0, (box_h - total_h) / 2.0)

    bottom_y = box_y + box_h
    spans: list[str] = []
    cursor_y = top_y
    first_run: TextRun | None = None
    first_baseline: float | None = None
    previous_baseline: float | None = None
    for (char, run), advance in zip(glyphs, advances):
        if cursor_y + advance > bottom_y:
            break
        baseline_y = cursor_y + run.font_size_px * 0.85
        tspan_attrs = _run_tspan_attrs(run)
        if first_run is None:
            first_run = run
            first_baseline = baseline_y
            spans.append(f"<tspan{tspan_attrs}>{_xml_escape(char)}</tspan>")
        else:
            dy = baseline_y - (previous_baseline or baseline_y)
            spans.append(
                f'<tspan x="{fmt_num(center_x)}" dy="{fmt_num(dy)}"'
                f"{tspan_attrs}>{_xml_escape(char)}</tspan>"
            )
        previous_baseline = baseline_y
        cursor_y += advance

    if first_run is None or first_baseline is None:
        return TextResult()

    attrs = _text_base_attrs(first_run, center_x, first_baseline, "middle")
    return TextResult(svg=f"<text{attrs}>{''.join(spans)}</text>")


def _rotated_bbox(xfrm: Xfrm) -> tuple[float, float, float, float]:
    rot = round(xfrm.rot) % 360
    cx = xfrm.x + xfrm.w / 2.0
    cy = xfrm.y + xfrm.h / 2.0
    if rot in (90, 270):
        return cx - xfrm.h / 2.0, cy - xfrm.w / 2.0, xfrm.h, xfrm.w
    return xfrm.x, xfrm.y, xfrm.w, xfrm.h


# ---------------------------------------------------------------------------
# Parsing helpers
# ---------------------------------------------------------------------------

def _read_emu_attr(elem: ET.Element | None, attr: str, default_emu: int) -> float:
    """Read an EMU integer attribute and return px."""
    if elem is None:
        return emu_to_px(default_emu)
    val = elem.attrib.get(attr)
    if val is None:
        return emu_to_px(default_emu)
    try:
        return emu_to_px(int(val))
    except ValueError:
        return emu_to_px(default_emu)


def _parse_paragraphs(
    tx_body: ET.Element,
    palette: ColorPalette | None,
    theme_fonts: dict[str, str],
) -> list[TextParagraph]:
    """Walk <a:p> children producing TextParagraph objects."""
    paragraphs: list[TextParagraph] = []
    autonum_state: dict[int, int] = {}

    for p_elem in tx_body.findall("a:p", NS):
        para = _parse_paragraph(p_elem, palette, theme_fonts, autonum_state)
        paragraphs.append(para)

    return paragraphs


def _parse_paragraph(
    p_elem: ET.Element,
    palette: ColorPalette | None,
    theme_fonts: dict[str, str],
    autonum_state: dict[int, int],
) -> TextParagraph:
    para = TextParagraph()

    p_pr = p_elem.find("a:pPr", NS)
    if p_pr is not None:
        para.align = p_pr.attrib.get("algn", "l")
        try:
            para.level = int(p_pr.attrib.get("lvl", "0"))
        except ValueError:
            para.level = 0
        try:
            para.margin_left_px = emu_to_px(int(p_pr.attrib.get("marL", "0")))
        except ValueError:
            para.margin_left_px = 0.0
        try:
            para.indent_px = emu_to_px(int(p_pr.attrib.get("indent", "0")))
        except ValueError:
            para.indent_px = 0.0
        ln_spc = p_pr.find("a:lnSpc", NS)
        if ln_spc is not None:
            spc_pct = ln_spc.find("a:spcPct", NS)
            if spc_pct is not None:
                try:
                    para.line_height_ratio = float(spc_pct.attrib.get("val", "100000")) / 100000.0
                except ValueError:
                    pass
        spc_bef = p_pr.find("a:spcBef/a:spcPts", NS)
        if spc_bef is not None:
            try:
                para.space_before_px = hundredths_pt_to_px(int(spc_bef.attrib.get("val", "0")))
            except ValueError:
                pass
        spc_aft = p_pr.find("a:spcAft/a:spcPts", NS)
        if spc_aft is not None:
            try:
                para.space_after_px = hundredths_pt_to_px(int(spc_aft.attrib.get("val", "0")))
            except ValueError:
                pass

        # Bullet / basic auto-numbering
        para.bullet_prefix = _resolve_bullet_prefix(p_pr, para.level, autonum_state)

    # Default endParaRPr style (applies if a run has no rPr)
    end_rpr = p_elem.find("a:endParaRPr", NS)

    for child in list(p_elem):
        if not isinstance(child.tag, str):
            continue
        local = child.tag.split("}", 1)[-1]
        if local == "r":
            rpr = child.find("a:rPr", NS)
            text_elem = child.find("a:t", NS)
            text = text_elem.text or "" if text_elem is not None else ""
            run = _build_run(text, rpr, end_rpr, palette, theme_fonts)
            para.runs.append(run)
        elif local == "br":
            para.runs.append(TextRun(
                text="", font_size_px=DEFAULT_FONT_SIZE_PX,
                font_family="sans-serif", fill=DEFAULT_FILL_HEX,
                is_break=True,
            ))
        elif local == "fld":
            # Field (datetime / slidenum). Use the literal a:t fallback.
            rpr = child.find("a:rPr", NS)
            text_elem = child.find("a:t", NS)
            text = text_elem.text or "" if text_elem is not None else ""
            if text:
                run = _build_run(text, rpr, end_rpr, palette, theme_fonts)
                para.runs.append(run)

    return para


def _build_run(
    text: str,
    rpr: ET.Element | None,
    end_rpr: ET.Element | None,
    palette: ColorPalette | None,
    theme_fonts: dict[str, str],
) -> TextRun:
    """Resolve a single <a:r> run from its rPr (with endParaRPr as default)."""
    # font-size: rPr@sz; default 1800 (18pt = 24px)
    sz = _attr_chain((rpr, end_rpr), "sz")
    font_size_px = hundredths_pt_to_px(sz, DEFAULT_FONT_SIZE_PX)

    # Bold / italic
    bold = _attr_chain((rpr, end_rpr), "b") == "1"
    italic = _attr_chain((rpr, end_rpr), "i") == "1"

    # Underline / strike
    u_val = _attr_chain((rpr, end_rpr), "u")
    underline = u_val not in (None, "", "none")
    strike_val = _attr_chain((rpr, end_rpr), "strike")
    strikethrough = strike_val in ("sngStrike", "dblStrike")

    # Letter spacing (rPr@spc, in 1/100 pt)
    spc = _attr_chain((rpr, end_rpr), "spc")
    letter_spacing_px = 0.0
    if spc is not None:
        try:
            letter_spacing_px = float(spc) / 100.0 * 4.0 / 3.0  # pt -> px
        except ValueError:
            pass

    # Color
    fill = DEFAULT_FILL_HEX
    fill_opacity = 1.0
    color_source = None
    for src in (rpr, end_rpr):
        if src is None:
            continue
        solid = src.find("a:solidFill", NS)
        if solid is not None:
            color_source = solid
            break
    if color_source is not None:
        color_elem = find_color_elem(color_source)
        hex_, alpha = resolve_color(color_elem, palette)
        if hex_:
            fill = hex_
            fill_opacity = alpha

    # Font typeface
    latin_face = _typeface(rpr, "latin") or _typeface(end_rpr, "latin")
    ea_face = _typeface(rpr, "ea") or _typeface(end_rpr, "ea")
    cs_face = _typeface(rpr, "cs") or _typeface(end_rpr, "cs")

    # Resolve theme refs (e.g. typeface="+mn-lt" / "+mj-ea")
    latin_face = _resolve_theme_typeface(latin_face, theme_fonts)
    ea_face = _resolve_theme_typeface(ea_face, theme_fonts)
    cs_face = _resolve_theme_typeface(cs_face, theme_fonts)

    font_family = _build_font_stack(latin_face, ea_face, cs_face)

    return TextRun(
        text=text,
        font_size_px=font_size_px,
        font_family=font_family,
        fill=fill,
        fill_opacity=fill_opacity,
        bold=bold,
        italic=italic,
        underline=underline,
        strikethrough=strikethrough,
        letter_spacing_px=letter_spacing_px,
    )


def _attr_chain(sources: tuple[ET.Element | None, ...], attr: str) -> str | None:
    """Return the first non-empty value of `attr` from any source element."""
    for src in sources:
        if src is None:
            continue
        v = src.attrib.get(attr)
        if v is not None:
            return v
    return None


def _typeface(rpr: ET.Element | None, child_tag: str) -> str | None:
    if rpr is None:
        return None
    elem = rpr.find(f"a:{child_tag}", NS)
    if elem is None:
        return None
    val = elem.attrib.get("typeface")
    return val or None


def _resolve_theme_typeface(face: str | None, theme_fonts: dict[str, str]) -> str | None:
    """Theme references look like '+mj-lt' (major latin) / '+mn-ea' (minor EA)."""
    if not face or not face.startswith("+"):
        return face
    code = face[1:]
    if code == "mj-lt":
        return theme_fonts.get("majorLatin") or face
    if code == "mn-lt":
        return theme_fonts.get("minorLatin") or face
    if code == "mj-ea":
        return theme_fonts.get("majorEastAsia") or theme_fonts.get("majorLatin") or face
    if code == "mn-ea":
        return theme_fonts.get("minorEastAsia") or theme_fonts.get("minorLatin") or face
    return face


def _build_font_stack(latin: str | None, ea: str | None, cs: str | None) -> str:
    """Build a CSS font-family stack: original PPT names first, then fallbacks."""
    parts: list[str] = []
    seen: set[str] = set()
    for face in (latin, ea, cs):
        if face and face not in seen:
            parts.append(_quote_font(face))
            seen.add(face)
    # Generic fallback so the browser can render even if PPT fonts are absent.
    parts.append("sans-serif")
    return ", ".join(parts)


def _quote_font(name: str) -> str:
    """Quote a font name if it contains spaces or non-ASCII chars.

    Uses XML entity-escaped double quotes (&quot;) so the resulting CSS string
    survives being embedded inside an SVG attribute that itself uses double
    quotes. CSS parsers accept the unescaped form after attribute parsing.
    """
    if any(c.isspace() or ord(c) > 127 for c in name):
        return f"&quot;{name}&quot;"
    return name


def _resolve_bullet_prefix(
    p_pr: ET.Element,
    level: int,
    autonum_state: dict[int, int],
) -> str:
    """Render bullet glyphs / numbering as a literal text prefix."""
    bu_none = p_pr.find("a:buNone", NS)
    if bu_none is not None:
        autonum_state.pop(level, None)
        return ""
    bu_char = p_pr.find("a:buChar", NS)
    if bu_char is not None:
        ch = bu_char.attrib.get("char", "•")
        return f"{ch} "
    bu_auto = p_pr.find("a:buAutoNum", NS)
    if bu_auto is not None:
        start_at = bu_auto.attrib.get("startAt")
        if start_at is not None:
            try:
                autonum_state[level] = int(start_at)
            except ValueError:
                autonum_state[level] = 1
        else:
            autonum_state[level] = autonum_state.get(level, 0) + 1
        return _format_auto_number(
            autonum_state[level],
            bu_auto.attrib.get("type", "arabicPeriod"),
        )
    return ""


def _format_auto_number(value: int, kind: str) -> str:
    lower = kind.lower()
    if "alphalc" in lower:
        token = _alpha_number(value, uppercase=False)
    elif "alphauc" in lower:
        token = _alpha_number(value, uppercase=True)
    elif "romanlc" in lower:
        token = _roman_number(value).lower()
    elif "romanuc" in lower:
        token = _roman_number(value).upper()
    else:
        token = str(value)

    if "parenboth" in lower:
        return f"({token}) "
    if "parenr" in lower:
        return f"{token}) "
    if "period" in lower:
        return f"{token}. "
    return f"{token} "


def _alpha_number(value: int, *, uppercase: bool) -> str:
    value = max(1, value)
    chars: list[str] = []
    while value:
        value -= 1
        chars.append(chr(ord("A") + (value % 26)))
        value //= 26
    text = "".join(reversed(chars))
    return text if uppercase else text.lower()


def _roman_number(value: int) -> str:
    value = max(1, min(value, 3999))
    parts: list[str] = []
    for n, token in (
        (1000, "M"), (900, "CM"), (500, "D"), (400, "CD"),
        (100, "C"), (90, "XC"), (50, "L"), (40, "XL"),
        (10, "X"), (9, "IX"), (5, "V"), (4, "IV"), (1, "I"),
    ):
        while value >= n:
            parts.append(token)
            value -= n
    return "".join(parts)


# ---------------------------------------------------------------------------
# Layout / emission
# ---------------------------------------------------------------------------

def _has_visible_text(paragraphs: list[TextParagraph]) -> bool:
    for p in paragraphs:
        for r in p.runs:
            if r.text.strip():
                return True
    return False


# ---------------------------------------------------------------------------
# Word-wrap / text measurement
# ---------------------------------------------------------------------------

def _is_cjk(ch: str) -> bool:
    """Check if a character is CJK (Chinese/Japanese/Korean) or full-width."""
    cp = ord(ch)
    return (0x4E00 <= cp <= 0x9FFF or 0x3400 <= cp <= 0x4DBF or
            0x2E80 <= cp <= 0x2EFF or 0x3000 <= cp <= 0x303F or
            0xFF00 <= cp <= 0xFFEF or 0xF900 <= cp <= 0xFAFF or
            0x20000 <= cp <= 0x2A6DF)


def _char_width(ch: str, font_size: float, bold: bool) -> float:
    """Estimate a single character's rendered width in pixels.

    Mirrors svg_to_pptx/drawingml_utils.estimate_text_width so wrapping breaks
    align with the same heuristic used to estimate text-box sizes elsewhere.
    """
    if _is_cjk(ch):
        w = font_size  # CJK is approximately 1em per glyph
    elif ch == ' ':
        w = font_size * 0.3
    elif ch in 'mMwWOQ':
        w = font_size * 0.75
    elif ch in 'iIlj1!|':
        w = font_size * 0.3
    else:
        w = font_size * 0.55
    # Bold Latin generally expands a little. CJK glyphs keep their em advance
    # in common PPT fonts; applying the bold multiplier causes short Chinese
    # titles such as "少年强国说" to wrap even though PowerPoint keeps them on
    # one line.
    if bold and not _is_cjk(ch):
        w *= 1.05
    return w


def _estimate_run_width(text: str, run: TextRun) -> float:
    return sum(_char_width(c, run.font_size_px, run.bold) for c in text) * 1.05


def _find_break_point(
    text: str, start: int, max_width: float, run: TextRun,
) -> tuple[int, float]:
    """Find the longest prefix of text[start:] that fits in max_width.

    Returns (end_index, used_width). Prefers breaking after whitespace, after
    CJK characters, or after hyphens. If even the first character doesn't fit,
    returns (start, 0.0) — the caller should flush the current line first.
    """
    cur_w = 0.0
    last_break = start
    last_break_w = 0.0

    for i in range(start, len(text)):
        ch = text[i]
        ch_w = _char_width(ch, run.font_size_px, run.bold)
        if cur_w + ch_w > max_width:
            if last_break > start:
                return last_break, last_break_w
            return start, 0.0
        cur_w += ch_w
        # Update last_break point
        if ch.isspace() or _is_cjk(ch) or ch in "-—、，。！？：；":
            last_break = i + 1
            last_break_w = cur_w
    # Whole rest fits
    return len(text), cur_w


def _wrap_paragraph_into_lines(
    para: TextParagraph,
    max_width: float,
) -> list[list[TextRun]]:
    """Split a paragraph's runs into display lines respecting `max_width`.

    Each line is a list of (possibly truncated) TextRuns. Explicit a:br runs
    force a new line. When max_width is +inf the original runs are returned
    unchanged (one logical line per a:br segment).

    Bullet prefix is prepended to the first non-empty run if present.
    """
    lines: list[list[TextRun]] = [[]]
    cur_w = 0.0

    if _should_keep_single_line(para, max_width):
        return [[_copy_run(run, text=run.text) for run in para.runs if not run.is_break and run.text]]

    if para.bullet_prefix and para.runs:
        first_run = next((r for r in para.runs if not r.is_break), None)
        if first_run is not None:
            bullet_run = _copy_run(first_run, text=para.bullet_prefix)
            lines[-1].append(bullet_run)
            cur_w = _estimate_run_width(para.bullet_prefix, bullet_run)

    for run in para.runs:
        if run.is_break:
            lines.append([])
            cur_w = 0.0
            continue
        if not run.text:
            continue
        text = run.text
        i = 0
        while i < len(text):
            remaining = text[i:]
            avail = max_width - cur_w
            if avail <= 0 and lines[-1]:
                # Line is full; start a new one
                lines.append([])
                cur_w = 0.0
                avail = max_width

            end, used = _find_break_point(remaining, 0, avail, run)
            if end == 0:
                # Nothing fits even from a fresh line — force one char to avoid
                # an infinite loop.
                if lines[-1]:
                    lines.append([])
                    cur_w = 0.0
                    continue
                end = 1
                used = _char_width(remaining[0], run.font_size_px, run.bold)

            chunk = remaining[:end]
            lines[-1].append(_copy_run(run, text=chunk))
            cur_w += used
            i += end

            if i < len(text):
                # More to render — wrap to next line
                lines.append([])
                cur_w = 0.0

    return lines


def _should_keep_single_line(para: TextParagraph, max_width: float) -> bool:
    if max_width == float("inf") or para.bullet_prefix:
        return False
    if any(run.is_break for run in para.runs):
        return False

    text_runs = [run for run in para.runs if run.text]
    if not text_runs:
        return False
    text = "".join(run.text for run in text_runs)
    non_space_count = sum(1 for ch in text if not ch.isspace())

    # Short labels/titles are usually intentionally single-line in PPT. Let
    # them overflow slightly rather than inventing a line break from imperfect
    # font metrics or alignment spaces.
    if non_space_count <= 18:
        return True

    estimated = sum(_estimate_run_width(run.text, run) for run in text_runs)
    return estimated <= max_width * 1.12


def _copy_run(run: TextRun, *, text: str) -> TextRun:
    return TextRun(
        text=text,
        font_size_px=run.font_size_px,
        font_family=run.font_family,
        fill=run.fill,
        fill_opacity=run.fill_opacity,
        bold=run.bold,
        italic=run.italic,
        underline=run.underline,
        strikethrough=run.strikethrough,
        letter_spacing_px=run.letter_spacing_px,
    )


def _paragraph_height_from_lines(p: TextParagraph,
                                 lines: list[list[TextRun]]) -> float:
    """Total px height after wrapping. Each line uses its own max font size."""
    if not lines:
        return DEFAULT_FONT_SIZE_PX * p.line_height_ratio
    height = 0.0
    for line in lines:
        height += _line_height(p, line)
    return height


def _line_height(p: TextParagraph, line: list[TextRun]) -> float:
    max_font = max((r.font_size_px for r in line), default=DEFAULT_FONT_SIZE_PX)
    return max_font * p.line_height_ratio


def _clip_lines_to_bottom(
    para: TextParagraph,
    lines: list[list[TextRun]],
    top_y: float,
    bottom_y: float,
) -> list[list[TextRun]]:
    """Return the leading display lines whose line boxes fit in the text frame."""
    visible: list[list[TextRun]] = []
    cursor_y = top_y
    for line in lines:
        line_h = _line_height(para, line)
        if cursor_y + line_h > bottom_y:
            break
        visible.append(line)
        cursor_y += line_h
    return visible


def _paragraph_height(p: TextParagraph) -> float:
    """Legacy helper kept for callers that don't pre-wrap (currently unused)."""
    lines = 1
    max_font = 0.0
    for r in p.runs:
        if r.is_break:
            lines += 1
            continue
        max_font = max(max_font, r.font_size_px)
    if max_font == 0.0:
        max_font = DEFAULT_FONT_SIZE_PX
    return lines * max_font * p.line_height_ratio


def _emit_paragraph(
    para: TextParagraph,
    lines: list[list[TextRun]],
    inner_x: float, inner_w: float,
    top_y: float,
) -> str:
    """Render a paragraph (already split into lines) as one <text> element.

    Each pre-wrapped display line becomes a sequence of <tspan>s: the first
    tspan on a line carries the explicit x and dy (line-height advance);
    subsequent tspans on the same line inherit x.
    """
    align = para.align
    if align == "ctr":
        anchor_x = inner_x + inner_w / 2.0
        text_anchor = "middle"
    elif align == "r":
        anchor_x = inner_x + inner_w
        text_anchor = "end"
    else:  # 'l' / 'just' / 'dist' / unknown
        anchor_x = inner_x + para.indent_px + para.margin_left_px
        text_anchor = "start"

    if not lines or all(not line for line in lines):
        return ""

    # First non-empty line drives the text-level baseline + default style
    first_line_idx = next((i for i, ln in enumerate(lines) if ln), 0)
    first_line = lines[first_line_idx]
    first_run = first_line[0] if first_line else None
    first_font = first_run.font_size_px if first_run else DEFAULT_FONT_SIZE_PX
    first_baseline = top_y + 0.85 * first_font

    spans: list[str] = []
    for line_idx, line in enumerate(lines):
        if not line:
            # Blank line (e.g. consecutive a:br): still advance baseline
            spans.append(
                f'<tspan x="{fmt_num(anchor_x)}" '
                f'dy="{fmt_num(first_font * para.line_height_ratio)}"></tspan>'
            )
            continue
        line_font = max(r.font_size_px for r in line)
        for run_idx, run in enumerate(line):
            attrs = _run_tspan_attrs(run)
            if run_idx == 0 and line_idx > 0:
                # Start-of-line tspan: position via x + dy
                spans.append(
                    f'<tspan x="{fmt_num(anchor_x)}" '
                    f'dy="{fmt_num(line_font * para.line_height_ratio)}"'
                    f'{attrs}>{_xml_escape(run.text)}</tspan>'
                )
            else:
                spans.append(
                    f"<tspan{attrs}>{_xml_escape(run.text)}</tspan>"
                )

    base_attrs = _text_base_attrs(first_run, anchor_x, first_baseline, text_anchor)
    return f"<text{base_attrs}>{''.join(spans)}</text>"


def _text_base_attrs(run: TextRun | None, x: float, y: float,
                     text_anchor: str) -> str:
    parts = [
        f'x="{fmt_num(x)}"',
        f'y="{fmt_num(y)}"',
        f'text-anchor="{text_anchor}"',
        'xml:space="preserve"',
    ]
    if run is None:
        return " " + " ".join(parts)
    parts.append(f'font-family="{run.font_family}"')
    parts.append(f'font-size="{fmt_num(run.font_size_px)}"')
    parts.append(f'fill="{run.fill}"')
    if run.fill_opacity < 1.0:
        parts.append(f'fill-opacity="{fmt_num(run.fill_opacity, 4)}"')
    if run.bold:
        parts.append('font-weight="bold"')
    if run.italic:
        parts.append('font-style="italic"')
    if run.underline and run.strikethrough:
        parts.append('text-decoration="underline line-through"')
    elif run.underline:
        parts.append('text-decoration="underline"')
    elif run.strikethrough:
        parts.append('text-decoration="line-through"')
    if run.letter_spacing_px:
        parts.append(f'letter-spacing="{fmt_num(run.letter_spacing_px)}"')
    return " " + " ".join(parts)


def _run_tspan_attrs(run: TextRun) -> str:
    """Per-run overrides on a <tspan>. Only emit attributes that differ from
    the run that drove the parent <text> (we keep things simple: emit only
    overrides that can plausibly change run-to-run, never re-emit common
    defaults). For v1 we just always emit fill / font-size / weight to be
    safe — tspan inherits when omitted, so callers can simplify later.
    """
    parts = [
        f'fill="{run.fill}"',
        f'font-size="{fmt_num(run.font_size_px)}"',
    ]
    if run.fill_opacity < 1.0:
        parts.append(f'fill-opacity="{fmt_num(run.fill_opacity, 4)}"')
    if run.bold:
        parts.append('font-weight="bold"')
    if run.italic:
        parts.append('font-style="italic"')
    if run.underline and run.strikethrough:
        parts.append('text-decoration="underline line-through"')
    elif run.underline:
        parts.append('text-decoration="underline"')
    elif run.strikethrough:
        parts.append('text-decoration="line-through"')
    if run.letter_spacing_px:
        parts.append(f'letter-spacing="{fmt_num(run.letter_spacing_px)}"')
    return " " + " ".join(parts)


def _xml_escape(text: str) -> str:
    return (text.replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace('"', "&quot;"))
