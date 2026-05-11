"""EMU <-> pixel conversion and DrawingML unit constants.

Mirrors svg_to_pptx/drawingml_utils.py and pptx_dimensions.py, in reverse.

DrawingML unit conventions:
- Coordinates / sizes: EMU (English Metric Unit). 914400 EMU = 1 inch = 96 px.
- Font size: hundredths of a point. 1 px = 0.75 pt = 75 hundredths-of-a-point.
- Angle: 60000ths of a degree.
- Color tint/shade/lumMod/lumOff/satMod: percent in 1000ths (100% = 100000).
- srcRect / fillRect: percent in 1000ths of the unit rect.
"""

from __future__ import annotations

from xml.etree import ElementTree as ET

EMU_PER_INCH = 914400
EMU_PER_PX = 9525  # 96 dpi
HUNDREDTHS_PT_PER_PX = 75  # 1 px = 0.75 pt = 75 hundredths
ANGLE_UNIT = 60000  # 1 degree = 60000 angle units
PERCENT_UNIT = 100000  # 100% = 100000 (DrawingML "ST_PositivePercentage")
SRCRECT_UNIT = 100000  # srcRect l/t/r/b are in 1000ths of percent (i.e. 100000 = 100%)


# Namespaces used throughout OOXML
NS = {
    "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
    "p": "http://schemas.openxmlformats.org/presentationml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "rel": "http://schemas.openxmlformats.org/package/2006/relationships",
    "ct": "http://schemas.openxmlformats.org/package/2006/content-types",
    "asvg": "http://schemas.microsoft.com/office/drawing/2016/SVG/main",
    "mc": "http://schemas.openxmlformats.org/markup-compatibility/2006",
}

# Register so ET output emits clean prefixes (writers normally don't need this
# since the SVG output uses the SVG namespace, but keep it consistent).
for prefix, uri in NS.items():
    try:
        ET.register_namespace(prefix, uri)
    except (ValueError, AttributeError):
        pass


# ---------------------------------------------------------------------------
# Length conversions
# ---------------------------------------------------------------------------

def emu_to_px(emu: float | int | None, default: float = 0.0) -> float:
    """Convert EMU to SVG px (96 dpi). None / unparsable -> default."""
    if emu is None:
        return default
    try:
        return float(emu) / EMU_PER_PX
    except (ValueError, TypeError):
        return default


def emu_attr_to_px(elem: ET.Element | None, attr: str, default: float = 0.0) -> float:
    """Read EMU integer attribute and return px."""
    if elem is None:
        return default
    return emu_to_px(elem.get(attr), default)


def hundredths_pt_to_px(val: float | int | str | None, default: float = 0.0) -> float:
    """Convert font size (a:rPr@sz) to px. 100 = 1 pt = 4/3 px."""
    if val is None:
        return default
    try:
        return float(val) / HUNDREDTHS_PT_PER_PX
    except (ValueError, TypeError):
        return default


def angle_to_deg(val: float | int | str | None, default: float = 0.0) -> float:
    """Convert DrawingML angle (1/60000 deg) to plain degrees."""
    if val is None:
        return default
    try:
        return float(val) / ANGLE_UNIT
    except (ValueError, TypeError):
        return default


def percent_to_ratio(val: float | int | str | None, default: float = 0.0) -> float:
    """DrawingML positive percent (100000 = 100%) -> ratio in [0, 1]."""
    if val is None:
        return default
    try:
        return float(val) / PERCENT_UNIT
    except (ValueError, TypeError):
        return default


# ---------------------------------------------------------------------------
# xfrm / transform parsing
# ---------------------------------------------------------------------------

class Xfrm:
    """Resolved <a:xfrm> in pixel space.

    Attributes:
        x, y: top-left position (px).
        w, h: size (px).
        rot: rotation in degrees, clockwise around the shape center.
        flip_h: bool — horizontal flip.
        flip_v: bool — vertical flip.
        ch_x, ch_y, ch_w, ch_h: only set when this is a group <p:grpSpPr>'s
            xfrm; describes the child coordinate frame (a:chOff / a:chExt).
            None on leaf shapes.
    """

    __slots__ = ("x", "y", "w", "h", "rot", "flip_h", "flip_v",
                 "ch_x", "ch_y", "ch_w", "ch_h")

    def __init__(
        self,
        x: float = 0.0,
        y: float = 0.0,
        w: float = 0.0,
        h: float = 0.0,
        rot: float = 0.0,
        flip_h: bool = False,
        flip_v: bool = False,
        ch_x: float | None = None,
        ch_y: float | None = None,
        ch_w: float | None = None,
        ch_h: float | None = None,
    ) -> None:
        self.x = x
        self.y = y
        self.w = w
        self.h = h
        self.rot = rot
        self.flip_h = flip_h
        self.flip_v = flip_v
        self.ch_x = ch_x
        self.ch_y = ch_y
        self.ch_w = ch_w
        self.ch_h = ch_h

    def __repr__(self) -> str:
        parts = [f"x={self.x:.1f}", f"y={self.y:.1f}",
                 f"w={self.w:.1f}", f"h={self.h:.1f}"]
        if self.rot:
            parts.append(f"rot={self.rot:.2f}")
        if self.flip_h:
            parts.append("flipH")
        if self.flip_v:
            parts.append("flipV")
        return f"Xfrm({', '.join(parts)})"

    def to_svg_transform(self) -> str | None:
        """Build SVG transform attribute for rotation / flip around the center.

        Returns None if no rotation / flip is needed.
        """
        if not self.rot and not self.flip_h and not self.flip_v:
            return None
        cx = self.x + self.w / 2.0
        cy = self.y + self.h / 2.0
        parts: list[str] = []
        if self.rot:
            parts.append(f"rotate({_fmt(self.rot)} {_fmt(cx)} {_fmt(cy)})")
        if self.flip_h or self.flip_v:
            sx = -1 if self.flip_h else 1
            sy = -1 if self.flip_v else 1
            # scale around shape center
            parts.append(f"translate({_fmt(cx)} {_fmt(cy)})")
            parts.append(f"scale({sx} {sy})")
            parts.append(f"translate({_fmt(-cx)} {_fmt(-cy)})")
        return " ".join(parts) if parts else None


def parse_xfrm(xfrm_elem: ET.Element | None) -> Xfrm:
    """Parse <a:xfrm> into an Xfrm object. None -> zero Xfrm."""
    if xfrm_elem is None:
        return Xfrm()

    rot = angle_to_deg(xfrm_elem.get("rot"))
    flip_h = xfrm_elem.get("flipH") == "1"
    flip_v = xfrm_elem.get("flipV") == "1"

    off = xfrm_elem.find("a:off", NS)
    ext = xfrm_elem.find("a:ext", NS)
    ch_off = xfrm_elem.find("a:chOff", NS)
    ch_ext = xfrm_elem.find("a:chExt", NS)

    x = emu_attr_to_px(off, "x")
    y = emu_attr_to_px(off, "y")
    w = emu_attr_to_px(ext, "cx")
    h = emu_attr_to_px(ext, "cy")

    ch_x = emu_attr_to_px(ch_off, "x") if ch_off is not None else None
    ch_y = emu_attr_to_px(ch_off, "y") if ch_off is not None else None
    ch_w = emu_attr_to_px(ch_ext, "cx") if ch_ext is not None else None
    ch_h = emu_attr_to_px(ch_ext, "cy") if ch_ext is not None else None

    return Xfrm(x=x, y=y, w=w, h=h, rot=rot,
                flip_h=flip_h, flip_v=flip_v,
                ch_x=ch_x, ch_y=ch_y, ch_w=ch_w, ch_h=ch_h)


# ---------------------------------------------------------------------------
# Number formatting for SVG output
# ---------------------------------------------------------------------------

def _fmt(val: float, ndigits: int = 2) -> str:
    """Format a number for SVG attributes: trim trailing zeros, keep ints clean."""
    if val == 0:
        return "0"
    rounded = round(val, ndigits)
    if rounded == int(rounded):
        return str(int(rounded))
    s = f"{rounded:.{ndigits}f}"
    # trim trailing zeros after decimal
    if "." in s:
        s = s.rstrip("0").rstrip(".")
    return s


fmt_num = _fmt
