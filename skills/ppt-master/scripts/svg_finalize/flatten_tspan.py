import os
import sys
import re
import argparse
from xml.etree import ElementTree as ET


SVG_NS = "http://www.w3.org/2000/svg"
NSMAP = {"svg": SVG_NS}

# Ensure pretty element names without ns0 prefix on write
ET.register_namespace("", SVG_NS)


TEXT_STYLE_ATTRS = {
    # common text styling
    "font-family",
    "font-size",
    "font-weight",
    "font-style",
    "font-variant",
    "font-stretch",
    "letter-spacing",
    "word-spacing",
    "kerning",
    "text-anchor",
    "text-decoration",
    "dominant-baseline",
    "writing-mode",
    "direction",
    # color/paint
    "fill",
    "fill-opacity",
    "stroke",
    "stroke-width",
    "stroke-opacity",
    "opacity",
    "paint-order",
    # transforms/filters
    "transform",
    "clip-path",
    "filter",
}


num_re = re.compile(r"^[\s,]*([+-]?(?:\d+\.?\d*|\d*\.\d+))")


def parse_first_number(val: str | None) -> float | None:
    """Parse the first numeric token from an SVG attribute value."""
    if val is None:
        return None
    m = num_re.match(val)
    if not m:
        return None
    try:
        return float(m.group(1))
    except ValueError:
        return None


def format_number(n: float | None) -> str | None:
    """Format a float for compact SVG attribute output."""
    if n is None:
        return None
    if abs(n - round(n)) < 1e-6:
        return str(int(round(n)))
    # Trim trailing zeros
    s = f"{n:.6f}".rstrip("0").rstrip(".")
    return s


def parse_style(style_str: str | None) -> dict[str, str]:
    """Parse an inline SVG style string into a mapping."""
    out: dict[str, str] = {}
    if not style_str:
        return out
    # split by ; and then :
    for chunk in style_str.split(";"):
        if not chunk.strip():
            continue
        if ":" in chunk:
            k, v = chunk.split(":", 1)
            out[k.strip()] = v.strip()
    return out


def style_to_string(style_map: dict[str, str]) -> str:
    """Serialize a style mapping back into an inline SVG style string."""
    if not style_map:
        return ""
    return ";".join(f"{k}:{v}" for k, v in style_map.items())


def merge_styles(parent_style: str | None, child_style: str | None) -> str:
    """Merge parent and child inline styles, preferring child values."""
    p = parse_style(parent_style)
    c = parse_style(child_style)
    p.update(c)  # child overrides
    return style_to_string(p)


def get_attr(elem: ET.Element | None, name: str, default: str | None = None) -> str | None:
    """Read an attribute from an element with a default fallback."""
    return elem.get(name) if elem is not None and name in elem.attrib else default


def compute_line_positions(
    text_el: ET.Element,
    tspan_el: ET.Element,
    cur_x: float | None,
    cur_y: float | None,
) -> tuple[float | None, float | None]:
    """
    Compute absolute x,y for a tspan based on parent <text> current baseline and tspan's x/y/dx/dy.
    Returns (new_x, new_y).
    """
    del text_el
    # Prefer explicit x/y on tspan
    t_x_attr = get_attr(tspan_el, "x")
    t_y_attr = get_attr(tspan_el, "y")
    t_dx_attr = get_attr(tspan_el, "dx")
    t_dy_attr = get_attr(tspan_el, "dy")

    if t_x_attr is not None:
        nx = parse_first_number(t_x_attr)
    elif t_dx_attr is not None:
        dx = parse_first_number(t_dx_attr) or 0.0
        nx = (cur_x or 0.0) + dx
    else:
        nx = cur_x

    if t_y_attr is not None:
        ny = parse_first_number(t_y_attr)
    elif t_dy_attr is not None:
        dy = parse_first_number(t_dy_attr) or 0.0
        ny = (cur_y or 0.0) + dy
    else:
        ny = cur_y

    return nx, ny


def collect_text_content(el: ET.Element) -> str:
    """Collect all text content from an element subtree."""
    # Gather all text within the element (flatten nested tspans if any)
    parts = []
    for s in el.itertext():
        if s:
            parts.append(s)
    return "".join(parts)


def copy_text_attrs(
    src_el: ET.Element,
    dst_el: ET.Element,
    exclude: set[str] | None = None,
) -> None:
    """Copy shared text styling attributes between SVG text elements."""
    exclude = exclude or set()
    # Copy style string first
    if "style" in src_el.attrib and "style" not in exclude:
        dst_el.set("style", src_el.attrib["style"])
    for k in TEXT_STYLE_ATTRS:
        if k in exclude:
            continue
        v = src_el.get(k)
        if v is not None:
            dst_el.set(k, v)
    # xml:space preservation
    xml_space = src_el.get("{http://www.w3.org/XML/1998/namespace}space")
    if xml_space is not None and "{http://www.w3.org/XML/1998/namespace}space" not in exclude:
        dst_el.set("{http://www.w3.org/XML/1998/namespace}space", xml_space)


def flatten_text_with_tspans(tree: ET.ElementTree) -> bool:
    """Flatten multi-line tspan text into independent text nodes when needed."""
    root = tree.getroot()
    parent_map = {c: p for p in root.iter() for c in p}
    changed = False

    def is_svg_tag(el: ET.Element, name: str) -> bool:
        return el.tag == f"{{{SVG_NS}}}{name}"

    def is_new_line_tspan(tspan: ET.Element) -> bool:
        """Determine whether a tspan represents a new line (has its own y or non-zero dy)."""
        t_dy_attr = get_attr(tspan, "dy")
        t_y_attr = get_attr(tspan, "y")
        t_x_attr = get_attr(tspan, "x")
        dy_val = parse_first_number(t_dy_attr) if t_dy_attr is not None else None
        # Has its own y attribute, or has non-zero dy, or has its own x attribute (indicating a new line)
        if t_y_attr is not None:
            return True
        if dy_val is not None and dy_val != 0:
            return True
        # If tspan has an x attribute and there are preceding sibling tspans, treat it as a new line
        if t_x_attr is not None:
            return True
        return False

    # Collect candidates first to avoid modifying while iterating
    candidates = []
    for el in root.iter():
        if is_svg_tag(el, "text"):
            has_tspan_child = any(is_svg_tag(c, "tspan") for c in list(el))
            if has_tspan_child:
                candidates.append(el)

    for text_el in candidates:
        parent = parent_map.get(text_el)
        if parent is None:
            continue

        # First check whether any tspan needs flattening (dy != 0 or has its own y attribute)
        needs_flatten = False
        for child in list(text_el):
            if not is_svg_tag(child, "tspan"):
                continue
            if is_new_line_tspan(child):
                needs_flatten = True
                break
        
        # If no tspan needs a line break, skip the entire text element
        if not needs_flatten:
            continue

        base_x = parse_first_number(get_attr(text_el, "x")) or 0.0
        base_y = parse_first_number(get_attr(text_el, "y")) or 0.0
        cur_x, cur_y = base_x, base_y

        new_texts = []
        
        # Collect tspan elements belonging to the same line
        current_line_tspans = []
        current_line_lead_text = None
        
        # Leading text directly under <text>
        lead_text = (text_el.text or "").strip()
        if lead_text:
            current_line_lead_text = lead_text

        for idx, child in enumerate(list(text_el)):
            if not is_svg_tag(child, "tspan"):
                continue

            content = collect_text_content(child)
            
            # Check whether this tspan starts a new line
            if is_new_line_tspan(child):
                # Save previously accumulated same-line tspans first
                if current_line_tspans or current_line_lead_text:
                    ne = _create_text_element_from_line(
                        text_el, current_line_lead_text, current_line_tspans, cur_x, cur_y
                    )
                    new_texts.append(ne)
                    current_line_tspans = []
                    current_line_lead_text = None
                
                # Update position
                nx, ny = compute_line_positions(text_el, child, cur_x, cur_y)
                cur_x, cur_y = nx, ny
            
            # If content is not empty, add to the current line
            if content.strip():
                current_line_tspans.append(child)
        
        # Process the last line
        if current_line_tspans or current_line_lead_text:
            ne = _create_text_element_from_line(
                text_el, current_line_lead_text, current_line_tspans, cur_x, cur_y
            )
            new_texts.append(ne)

        if new_texts:
            # Replace original <text> with the list of new <text> nodes
            try:
                idx = list(parent).index(text_el)
            except ValueError:
                idx = None

            # Insert in place to preserve drawing order
            for i, ne in enumerate(new_texts):
                if idx is not None:
                    parent.insert(idx + i, ne)
                else:
                    parent.append(ne)

            # Remove the original <text>
            parent.remove(text_el)
            changed = True

    return changed


def _has_tspan_children(elem: ET.Element) -> bool:
    """Return True if elem contains any nested <tspan> children (inline runs)."""
    return any(c.tag == f"{{{SVG_NS}}}tspan" for c in list(elem))


def _copy_inline_tspan(src: ET.Element, strip_line_attrs: bool) -> ET.Element:
    """Deep-copy a tspan as an inline run, preserving nested tspan structure, head text, and tail text.

    When strip_line_attrs is True, x/y/dy on the copied tspan are dropped because the
    enclosing <text> now positions the line. dx is preserved (safe inline kerning).
    Nested tspans are copied recursively without stripping (they are already inline-only).
    """
    new = ET.Element(f"{{{SVG_NS}}}tspan")
    for k, v in src.attrib.items():
        if strip_line_attrs and k in ("x", "y", "dy"):
            continue
        new.set(k, v)
    new.text = src.text
    for child in list(src):
        if child.tag == f"{{{SVG_NS}}}tspan":
            new.append(_copy_inline_tspan(child, strip_line_attrs=False))
    new.tail = src.tail
    return new


def _create_text_element_from_line(
    text_el: ET.Element,
    lead_text: str | None,
    tspans: list[ET.Element],
    x: float | None,
    y: float | None,
) -> ET.Element:
    """
    Create a text element from a line's content (may contain leading text and multiple tspans).
    If there is only one tspan with no nested tspan children and no leading text, the line
    collapses to a plain <text>...</text>. Otherwise the tspan structure (including any
    nested inline tspans) is preserved so per-run formatting survives the flatten step.
    """
    ne = ET.Element(f"{{{SVG_NS}}}text")

    # Copy attrs from parent <text>
    copy_text_attrs(text_el, ne, exclude={"x", "y"})
    ne.set("x", format_number(x))
    ne.set("y", format_number(y))

    # Transform
    p_tf = text_el.get("transform")
    if p_tf:
        ne.set("transform", p_tf)

    # Compact path: a single tspan with no nested inline runs collapses to <text>text</text>
    if not lead_text and len(tspans) == 1 and not _has_tspan_children(tspans[0]):
        tspan = tspans[0]
        content = collect_text_content(tspan)

        # Merge style
        merged_style = merge_styles(text_el.get("style"), tspan.get("style"))
        if merged_style:
            ne.set("style", merged_style)

        # Override specific attributes from tspan
        for attr in TEXT_STYLE_ATTRS:
            cv = tspan.get(attr)
            if cv is not None:
                ne.set(attr, cv)

        # Combine transform
        c_tf = tspan.get("transform")
        if p_tf and c_tf:
            ne.set("transform", f"{p_tf} {c_tf}")
        elif c_tf:
            ne.set("transform", c_tf)

        ne.text = content
    else:
        # Preserve tspan structure, including nested inline tspans and tail text
        if lead_text:
            ne.text = lead_text

        for tspan in tspans:
            ne.append(_copy_inline_tspan(tspan, strip_line_attrs=True))

    return ne


def process_svg_file(src_path: str, dst_path: str) -> bool:
    """Flatten eligible tspan lines in one SVG file."""
    try:
        tree = ET.parse(src_path)
    except ET.ParseError as e:
        print(f"[WARN] Failed to parse {src_path}: {e}")
        return False

    changed = flatten_text_with_tspans(tree)

    # Ensure destination directory exists
    os.makedirs(os.path.dirname(dst_path), exist_ok=True)

    # Write out XML without XML declaration to mimic input style
    tree.write(dst_path, encoding="utf-8", xml_declaration=False, method="xml")
    return changed


def _compute_default_out_base(inp: str) -> str:
    """Compute default output path for directory or file input."""
    if os.path.isdir(inp):
        # Default: if input ends with svg_output, use sibling svg_output_flattext;
        # otherwise append _flattext to the directory name at the same level.
        head, tail = os.path.split(os.path.normpath(inp))
        if tail == "svg_output":
            return os.path.join(head, "svg_output_flattext")
        return inp.rstrip("/\\") + "_flattext"
    else:
        base, ext = os.path.splitext(inp)
        return base + "_flattext" + ext


def _interactive_get_paths() -> tuple[str | None, str | None]:
    """
    Interactive mode: prompt the user for input path (SVG file or directory)
    and optional output path. Returns (inp, out_base) or (None, None) if cancelled.
    """
    print("[Interactive mode] No arguments provided; running interactively.")
    print("Please enter the path to process (SVG file or directory containing SVGs).")
    print("Enter q to quit.\n")

    while True:
        raw = input("Input path (file/dir): ").strip()
        if raw.lower() in {"q", "quit", "exit"} or raw == "":
            return None, None
        inp = os.path.expanduser(raw)
        if os.path.exists(inp):
            break
        print("Path does not exist. Please re-enter or enter q to quit.")

    default_out = _compute_default_out_base(inp)
    if os.path.isdir(inp):
        prompt = f"Output directory [default: {default_out}]: "
    else:
        prompt = f"Output file [default: {default_out}]: "

    raw_out = input(prompt).strip()
    out_base = os.path.expanduser(raw_out) if raw_out else default_out

    return inp, out_base


def main() -> None:
    """Run the CLI entry point."""
    # CLI parsing with optional interactive mode
    parser = argparse.ArgumentParser(
        description="Flatten <tspan> lines into multiple <text> nodes for better compatibility.",
        add_help=True,
    )
    parser.add_argument("input", nargs="?", help="Input path: SVG file or directory")
    parser.add_argument("output", nargs="?", help="Optional output file/dir")
    parser.add_argument(
        "-i",
        "--interactive",
        action="store_true",
        help="Run in interactive prompt mode to input paths",
    )

    args = parser.parse_args()

    if args.interactive or not args.input:
        inp, out_base = _interactive_get_paths()
        if not inp:
            print("Cancelled. Usage: python3 scripts/svg_finalize/flatten_tspan.py <input_dir_or_svg> [output_dir]")
            sys.exit(0)
    else:
        inp = args.input
        out_base = args.output

    if os.path.isdir(inp):
        # If output base not provided, create a sibling folder named svg_output_flattext for svg_output
        if out_base is None:
            out_base = _compute_default_out_base(inp)

        total = 0
        changed_count = 0
        out_base_abs = os.path.abspath(out_base)
        for root, dirs, files in os.walk(inp):
            # Avoid recursing into the output directory when it lives under input
            dirs[:] = [d for d in dirs if os.path.abspath(os.path.join(root, d)) != out_base_abs]
            rel_root = os.path.relpath(root, inp)
            for f in files:
                if not f.lower().endswith(".svg"):
                    continue
                src = os.path.join(root, f)
                dst = os.path.join(out_base, rel_root, f) if rel_root != "." else os.path.join(out_base, f)
                total += 1
                changed = process_svg_file(src, dst)
                if changed:
                    changed_count += 1
        print(f"Processed {total} SVG(s). With <tspan> flattened: {changed_count}.")
        print(f"Output written to: {out_base}")
    else:
        src = inp
        if out_base is None:
            out_base = _compute_default_out_base(src)
        changed = process_svg_file(src, out_base)
        print(f"Written: {out_base} (flattened: {changed})")


if __name__ == "__main__":
    main()
