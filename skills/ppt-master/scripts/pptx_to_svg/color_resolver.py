"""DrawingML color resolution.

Resolves any of the 6 OOXML color types (srgbClr, schemeClr, sysClr, prstClr,
hslClr, scrgbClr) plus modifiers (tint/shade/lumMod/lumOff/satMod/satOff/
hueMod/hueOff/alpha) into an (#RRGGBB, alpha) pair.

Theme palette is resolved from the slide master's a:clrMap and theme1.xml's
a:clrScheme.
"""

from __future__ import annotations

import colorsys
from xml.etree import ElementTree as ET

from .emu_units import NS, percent_to_ratio
from .ooxml_loader import PartRef


# ---------------------------------------------------------------------------
# Preset color names (DrawingML <a:prstClr val="...">)
# ---------------------------------------------------------------------------

# Source: ECMA-376 ST_PresetColorVal (subset — full list has ~140 entries).
PRST_COLORS = {
    "aliceBlue": "F0F8FF", "antiqueWhite": "FAEBD7", "aqua": "00FFFF",
    "aquamarine": "7FFFD4", "azure": "F0FFFF", "beige": "F5F5DC",
    "bisque": "FFE4C4", "black": "000000", "blanchedAlmond": "FFEBCD",
    "blue": "0000FF", "blueViolet": "8A2BE2", "brown": "A52A2A",
    "burlyWood": "DEB887", "cadetBlue": "5F9EA0", "chartreuse": "7FFF00",
    "chocolate": "D2691E", "coral": "FF7F50", "cornflowerBlue": "6495ED",
    "cornsilk": "FFF8DC", "crimson": "DC143C", "cyan": "00FFFF",
    "darkBlue": "00008B", "darkCyan": "008B8B", "darkGoldenrod": "B8860B",
    "darkGray": "A9A9A9", "darkGrey": "A9A9A9", "darkGreen": "006400",
    "darkKhaki": "BDB76B", "darkMagenta": "8B008B", "darkOliveGreen": "556B2F",
    "darkOrange": "FF8C00", "darkOrchid": "9932CC", "darkRed": "8B0000",
    "darkSalmon": "E9967A", "darkSeaGreen": "8FBC8F", "darkSlateBlue": "483D8B",
    "darkSlateGray": "2F4F4F", "darkSlateGrey": "2F4F4F",
    "darkTurquoise": "00CED1", "darkViolet": "9400D3", "deepPink": "FF1493",
    "deepSkyBlue": "00BFFF", "dimGray": "696969", "dimGrey": "696969",
    "dkBlue": "00008B", "dkCyan": "008B8B", "dkGoldenrod": "B8860B",
    "dkGray": "A9A9A9", "dkGrey": "A9A9A9", "dkGreen": "006400",
    "dkKhaki": "BDB76B", "dkMagenta": "8B008B", "dkOliveGreen": "556B2F",
    "dkOrange": "FF8C00", "dkOrchid": "9932CC", "dkRed": "8B0000",
    "dkSalmon": "E9967A", "dkSeaGreen": "8FBC8F", "dkSlateBlue": "483D8B",
    "dkSlateGray": "2F4F4F", "dkSlateGrey": "2F4F4F",
    "dkTurquoise": "00CED1", "dkViolet": "9400D3",
    "dodgerBlue": "1E90FF", "firebrick": "B22222", "floralWhite": "FFFAF0",
    "forestGreen": "228B22", "fuchsia": "FF00FF", "gainsboro": "DCDCDC",
    "ghostWhite": "F8F8FF", "gold": "FFD700", "goldenrod": "DAA520",
    "gray": "808080", "grey": "808080", "green": "008000",
    "greenYellow": "ADFF2F", "honeydew": "F0FFF0", "hotPink": "FF69B4",
    "indianRed": "CD5C5C", "indigo": "4B0082", "ivory": "FFFFF0",
    "khaki": "F0E68C", "lavender": "E6E6FA", "lavenderBlush": "FFF0F5",
    "lawnGreen": "7CFC00", "lemonChiffon": "FFFACD",
    "lightBlue": "ADD8E6", "lightCoral": "F08080", "lightCyan": "E0FFFF",
    "lightGoldenrodYellow": "FAFAD2", "lightGray": "D3D3D3",
    "lightGrey": "D3D3D3", "lightGreen": "90EE90", "lightPink": "FFB6C1",
    "lightSalmon": "FFA07A", "lightSeaGreen": "20B2AA",
    "lightSkyBlue": "87CEFA", "lightSlateGray": "778899",
    "lightSlateGrey": "778899", "lightSteelBlue": "B0C4DE",
    "lightYellow": "FFFFE0", "ltBlue": "ADD8E6", "ltCoral": "F08080",
    "ltCyan": "E0FFFF", "ltGoldenrodYellow": "FAFAD2", "ltGray": "D3D3D3",
    "ltGrey": "D3D3D3", "ltGreen": "90EE90", "ltPink": "FFB6C1",
    "ltSalmon": "FFA07A", "ltSeaGreen": "20B2AA", "ltSkyBlue": "87CEFA",
    "ltSlateGray": "778899", "ltSlateGrey": "778899",
    "ltSteelBlue": "B0C4DE", "ltYellow": "FFFFE0",
    "lime": "00FF00", "limeGreen": "32CD32", "linen": "FAF0E6",
    "magenta": "FF00FF", "maroon": "800000", "medAquamarine": "66CDAA",
    "medBlue": "0000CD", "medOrchid": "BA55D3", "medPurple": "9370DB",
    "medSeaGreen": "3CB371", "medSlateBlue": "7B68EE",
    "medSpringGreen": "00FA9A", "medTurquoise": "48D1CC",
    "medVioletRed": "C71585", "mediumAquamarine": "66CDAA",
    "mediumBlue": "0000CD", "mediumOrchid": "BA55D3", "mediumPurple": "9370DB",
    "mediumSeaGreen": "3CB371", "mediumSlateBlue": "7B68EE",
    "mediumSpringGreen": "00FA9A", "mediumTurquoise": "48D1CC",
    "mediumVioletRed": "C71585",
    "midnightBlue": "191970", "mintCream": "F5FFFA", "mistyRose": "FFE4E1",
    "moccasin": "FFE4B5", "navajoWhite": "FFDEAD", "navy": "000080",
    "oldLace": "FDF5E6", "olive": "808000", "oliveDrab": "6B8E23",
    "orange": "FFA500", "orangeRed": "FF4500", "orchid": "DA70D6",
    "paleGoldenrod": "EEE8AA", "paleGreen": "98FB98", "paleTurquoise": "AFEEEE",
    "paleVioletRed": "DB7093", "papayaWhip": "FFEFD5", "peachPuff": "FFDAB9",
    "peru": "CD853F", "pink": "FFC0CB", "plum": "DDA0DD",
    "powderBlue": "B0E0E6", "purple": "800080", "red": "FF0000",
    "rosyBrown": "BC8F8F", "royalBlue": "4169E1", "saddleBrown": "8B4513",
    "salmon": "FA8072", "sandyBrown": "F4A460", "seaGreen": "2E8B57",
    "seaShell": "FFF5EE", "sienna": "A0522D", "silver": "C0C0C0",
    "skyBlue": "87CEEB", "slateBlue": "6A5ACD", "slateGray": "708090",
    "slateGrey": "708090", "snow": "FFFAFA", "springGreen": "00FF7F",
    "steelBlue": "4682B4", "tan": "D2B48C", "teal": "008080",
    "thistle": "D8BFD8", "tomato": "FF6347", "turquoise": "40E0D0",
    "violet": "EE82EE", "wheat": "F5DEB3", "white": "FFFFFF",
    "whiteSmoke": "F5F5F5", "yellow": "FFFF00", "yellowGreen": "9ACD32",
}


# Scheme color name normalization
SCHEME_ALIASES = {
    "bg1": "lt1", "bg2": "lt2",
    "tx1": "dk1", "tx2": "dk2",
}


# ---------------------------------------------------------------------------
# ColorPalette
# ---------------------------------------------------------------------------

class ColorPalette:
    """Resolves scheme colors via the master's a:clrMap + theme1's a:clrScheme.

    a:clrMap remaps presentation-level scheme names (bg1/tx1) to theme-level
    names (lt1/dk1) — this is rarely overridden but must be honored.
    """

    def __init__(self, master: PartRef | None, theme: PartRef | None) -> None:
        self.scheme: dict[str, str] = {}
        self.clr_map: dict[str, str] = {}
        if theme is not None:
            self._load_scheme(theme.xml)
        if master is not None:
            self._load_clr_map(master.xml)

    def _load_scheme(self, theme_root: ET.Element) -> None:
        clr_scheme = theme_root.find(".//a:clrScheme", NS)
        if clr_scheme is None:
            return
        for child in list(clr_scheme):
            if not isinstance(child.tag, str):
                continue
            name = child.tag.split("}", 1)[-1]
            srgb = child.find("a:srgbClr", NS)
            sys_clr = child.find("a:sysClr", NS)
            if srgb is not None and srgb.attrib.get("val"):
                self.scheme[name] = srgb.attrib["val"].upper()
            elif sys_clr is not None:
                last = sys_clr.attrib.get("lastClr")
                if last:
                    self.scheme[name] = last.upper()

    def _load_clr_map(self, master_root: ET.Element) -> None:
        clr_map = master_root.find("p:clrMap", NS)
        if clr_map is None:
            return
        # Each attribute on clrMap is a remap: bg1="lt1" tx1="dk1" ...
        for attr, val in clr_map.attrib.items():
            self.clr_map[attr] = val

    def resolve_scheme(self, name: str) -> str | None:
        """scheme name (e.g. 'accent1', 'bg1') -> 'RRGGBB'. None on miss."""
        # apply clrMap remap (bg1 -> lt1, tx1 -> dk1, etc.)
        mapped = self.clr_map.get(name, name)
        # canonical alias (bg1 -> lt1)
        mapped = SCHEME_ALIASES.get(mapped, mapped)
        return self.scheme.get(mapped)


# ---------------------------------------------------------------------------
# Color resolution
# ---------------------------------------------------------------------------

# All concrete color element names under the a: namespace.
COLOR_TAGS = ("srgbClr", "schemeClr", "sysClr", "prstClr",
              "hslClr", "scrgbClr")


def find_color_elem(parent: ET.Element | None) -> ET.Element | None:
    """Return the first child color element (any of the 6 OOXML color tags)."""
    if parent is None:
        return None
    for tag in COLOR_TAGS:
        elem = parent.find(f"a:{tag}", NS)
        if elem is not None:
            return elem
    return None


def resolve_color(
    color_elem: ET.Element | None,
    palette: ColorPalette | None,
    *,
    placeholder_hex: str | None = None,
) -> tuple[str | None, float]:
    """Resolve a color element to (#RRGGBB, alpha).

    Args:
        color_elem: a:srgbClr / a:schemeClr / etc. May be None.
        palette: ColorPalette for resolving schemeClr.
        placeholder_hex: when a child uses schemeClr val="phClr" (placeholder
            color used inside theme styles), substitute this hex.

    Returns:
        (hex string with leading '#', alpha in [0,1]) or (None, 1.0) on failure.
    """
    if color_elem is None:
        return None, 1.0

    tag = color_elem.tag.split("}", 1)[-1]
    base_hex: str | None = None
    alpha: float = 1.0

    if tag == "srgbClr":
        val = color_elem.attrib.get("val", "")
        base_hex = _normalize_hex(val)
    elif tag == "schemeClr":
        name = color_elem.attrib.get("val", "")
        if name == "phClr":
            base_hex = _normalize_hex(placeholder_hex) if placeholder_hex else None
        elif palette is not None:
            base_hex = palette.resolve_scheme(name)
    elif tag == "sysClr":
        last = color_elem.attrib.get("lastClr") or color_elem.attrib.get("val")
        base_hex = _normalize_hex(last) if last else None
    elif tag == "prstClr":
        name = color_elem.attrib.get("val", "")
        base_hex = PRST_COLORS.get(name)
    elif tag == "hslClr":
        h = float(color_elem.attrib.get("hue", "0")) / 60000.0  # 1/60000 deg
        s = float(color_elem.attrib.get("sat", "0")) / 100000.0
        lum = float(color_elem.attrib.get("lum", "0")) / 100000.0
        base_hex = _hsl_to_hex(h, s, lum)
    elif tag == "scrgbClr":
        # 0..100000 per channel
        r = float(color_elem.attrib.get("r", "0")) / 100000.0
        g = float(color_elem.attrib.get("g", "0")) / 100000.0
        b = float(color_elem.attrib.get("b", "0")) / 100000.0
        base_hex = _rgb01_to_hex(r, g, b)

    if base_hex is None:
        return None, 1.0

    # Apply modifiers (children of the color element).
    base_hex, alpha = _apply_modifiers(base_hex, color_elem)
    return f"#{base_hex}", alpha


def _apply_modifiers(hex_color: str, color_elem: ET.Element) -> tuple[str, float]:
    """Apply tint / shade / lumMod / lumOff / satMod / hueMod / alpha modifiers
    in document order. DrawingML stacks these on the color in order.
    """
    r, g, b = _hex_to_rgb01(hex_color)
    # Convert to HSL for luminance/saturation ops; convert back when emitting.
    h, lum, sat = colorsys.rgb_to_hls(r, g, b)
    alpha = 1.0

    for child in list(color_elem):
        if not isinstance(child.tag, str):
            continue
        tag = child.tag.split("}", 1)[-1]
        val_ratio = percent_to_ratio(child.attrib.get("val"), default=0.0)

        if tag == "tint":
            # Tint blends toward white. r' = r + (1-r)*(1-val) is the common
            # interpretation; OOXML actually defines tint on luminance.
            # Use luminance-based tint per ECMA-376.
            lum = lum * val_ratio + (1.0 - val_ratio)
        elif tag == "shade":
            # Shade blends toward black on luminance.
            lum = lum * val_ratio
        elif tag == "lumMod":
            lum = lum * val_ratio
        elif tag == "lumOff":
            lum = lum + val_ratio
        elif tag == "satMod":
            sat = sat * val_ratio
        elif tag == "satOff":
            sat = sat + val_ratio
        elif tag == "hueMod":
            h = (h * val_ratio) % 1.0
        elif tag == "hueOff":
            # hueOff is in 1/60000 deg
            try:
                deg = float(child.attrib.get("val", "0")) / 60000.0
            except ValueError:
                deg = 0.0
            h = (h + deg / 360.0) % 1.0
        elif tag == "alpha":
            alpha = max(0.0, min(1.0, val_ratio))
        elif tag == "alphaMod":
            alpha *= val_ratio
        elif tag == "alphaOff":
            alpha = max(0.0, min(1.0, alpha + val_ratio))
        elif tag == "gray":
            # Convert to grayscale based on luminance.
            sat = 0.0
        elif tag == "comp":
            # Complement: hue rotated 180°
            h = (h + 0.5) % 1.0
        elif tag == "inv":
            # RGB invert
            rr, gg, bb = colorsys.hls_to_rgb(h, lum, sat)
            rr, gg, bb = 1.0 - rr, 1.0 - gg, 1.0 - bb
            h, lum, sat = colorsys.rgb_to_hls(rr, gg, bb)

        # Clamp luminance / saturation to [0,1]
        lum = max(0.0, min(1.0, lum))
        sat = max(0.0, min(1.0, sat))

    rr, gg, bb = colorsys.hls_to_rgb(h, lum, sat)
    return _rgb01_to_hex(rr, gg, bb), alpha


# ---------------------------------------------------------------------------
# Hex / RGB / HSL helpers
# ---------------------------------------------------------------------------

def _normalize_hex(value: str | None) -> str | None:
    """Strip '#' and validate 6-digit hex. Return uppercase or None on failure."""
    if value is None:
        return None
    v = value.strip()
    if v.startswith("#"):
        v = v[1:]
    if len(v) == 3:
        v = "".join(c * 2 for c in v)
    if len(v) != 6:
        return None
    try:
        int(v, 16)
    except ValueError:
        return None
    return v.upper()


def _hex_to_rgb01(hex_color: str) -> tuple[float, float, float]:
    h = _normalize_hex(hex_color) or "000000"
    r = int(h[0:2], 16) / 255.0
    g = int(h[2:4], 16) / 255.0
    b = int(h[4:6], 16) / 255.0
    return r, g, b


def _rgb01_to_hex(r: float, g: float, b: float) -> str:
    r = max(0.0, min(1.0, r))
    g = max(0.0, min(1.0, g))
    b = max(0.0, min(1.0, b))
    return f"{int(round(r * 255)):02X}{int(round(g * 255)):02X}{int(round(b * 255)):02X}"


def _hsl_to_hex(h: float, s: float, l: float) -> str:
    h = h % 1.0 if h != 1.0 else 1.0
    s = max(0.0, min(1.0, s))
    l = max(0.0, min(1.0, l))
    r, g, b = colorsys.hls_to_rgb(h, l, s)
    return _rgb01_to_hex(r, g, b)
