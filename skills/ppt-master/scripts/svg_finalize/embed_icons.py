#!/usr/bin/env python3
"""
SVG Icon Embedding Tool

Replaces icon placeholders in SVG files with actual icon code.

Placeholder syntax (new SVGs must include a library prefix):
    <use data-icon="chunk-filled/rocket" x="100" y="200" width="48" height="48" fill="#0076A8"/>
    <use data-icon="tabler-filled/home" x="100" y="200" width="48" height="48" fill="#0076A8"/>
    <use data-icon="tabler-outline/home" x="100" y="200" width="48" height="48" fill="#0076A8"/>
    <use data-icon="tabler-outline/home" x="100" y="200" width="48" height="48" fill="#0076A8" stroke-width="3"/>

Legacy compatibility accepted by the resolver:
    <use data-icon="rocket" .../> -> chunk-filled/rocket
    <use data-icon="chunk/rocket" .../> -> chunk-filled/rocket

Optional `stroke-width` (stroke-style libraries only — e.g. tabler-outline):
    Default 2 (matches the source). Pass 1.5 for thin, 3 for bold.
    Ignored on fill-style libraries.

After replacement:
    <g transform="translate(100, 200) scale(3)" fill="#0076A8">
      <path d="..."/>
    </g>

Icon libraries (subdirectories of templates/icons/):
    chunk-filled/      - 640+ fill icons, 16x16 viewBox  (use prefix: chunk-filled/name; legacy 'chunk/' also accepted)
    tabler-filled/     - 1000+ fill icons, 24x24 viewBox (use prefix: tabler-filled/name)
    tabler-outline/    - 5000+ stroke icons, 24x24 viewBox (use prefix: tabler-outline/name)
    phosphor-duotone/  - 1200+ duotone icons, 256x256 viewBox (single color + 0.2-opacity backplate)
    simple-icons/      - 3400+ brand logos, 24x24 viewBox (brand-inset library — used alongside the chosen primary library, NOT as a standalone library for generic icons)

Usage:
    python3 scripts/svg_finalize/embed_icons.py <svg_file> [svg_file2] ...
    python3 scripts/svg_finalize/embed_icons.py svg_output/*.svg

Options:
    --icons-dir <path>    Icon directory path (default: templates/icons/)
    --dry-run             Only show what would be replaced, without modifying files
    --verbose             Show detailed information
"""

import os
import re
import sys
import argparse
from pathlib import Path
from xml.etree import ElementTree as ET


# Default icon directory
DEFAULT_ICONS_DIR = Path(__file__).parent.parent.parent / 'templates' / 'icons'

# Icon base size per library
ICON_BASE_SIZES = {
    'chunk-filled': 16,
    'chunk': 16,          # backward compat alias → chunk-filled/
    'tabler-filled': 24,
    'tabler-outline': 24,
    'phosphor-duotone': 256,
    'simple-icons': 24,
}
DEFAULT_ICON_BASE_SIZE = 24


def _get_viewbox_size(content: str) -> float:
    """Extract the width from viewBox attribute (assumed square). Returns 0 if not found."""
    m = re.search(r'viewBox=["\']0 0 ([\d.]+)', content)
    if m:
        return float(m.group(1))
    return 0


def _detect_icon_style(content: str) -> str:
    """Detect whether an icon is fill-based or stroke-based."""
    # stroke="currentColor" with fill="none" → stroke style
    if 'stroke="currentColor"' in content and 'fill="none"' in content:
        return 'stroke'
    return 'fill'


def _extract_shape_elements(content: str, color: str) -> list[str]:
    """
    Extract all drawable shape elements from an icon SVG, replacing
    fill/stroke color references (currentColor or #xxxxxx) with the target color.

    Supports: <path>, <circle>, <rect>, <line>, <polyline>, <polygon>, <ellipse>
    """
    shape_tags = ('path', 'circle', 'rect', 'line', 'polyline', 'polygon', 'ellipse')
    pattern = r'<(' + '|'.join(shape_tags) + r')(\s[^>]*)?(?:/>|></\1>)'
    matches = re.findall(pattern, content, re.DOTALL)

    elements = []
    for tag, attrs in matches:
        # Remove standalone fill/stroke color attrs so outer <g> controls color.
        # Also strip stroke-width so the outer <g> can override it (otherwise the
        # icon's source stroke-width="2" would shadow any caller-specified value).
        attrs_clean = re.sub(r'\s*fill="(?:currentColor|#[0-9a-fA-F]{3,6}|none)"', '', attrs)
        attrs_clean = re.sub(r'\s*stroke="(?:currentColor|#[0-9a-fA-F]{3,6}|none)"', '', attrs_clean)
        attrs_clean = re.sub(r'\s*stroke-width="[^"]*"', '', attrs_clean)
        elements.append(f'<{tag}{attrs_clean}/>')

    return elements


def resolve_icon_path(icon_name: str, icons_dir: Path) -> tuple[Path, float]:
    """
    Resolve icon name to file path and base size.

    Supports:
      - "chunk-filled/home"     → icons_dir/chunk-filled/home.svg
      - "chunk/home"            → icons_dir/chunk-filled/home.svg (backward compat alias)
      - "tabler-filled/home"    → icons_dir/tabler-filled/home.svg
      - "tabler-outline/home"   → icons_dir/tabler-outline/home.svg
      - "home" (no prefix)      → falls back to icons_dir/chunk-filled/home.svg (legacy compat only)

    Returns (path, base_size). base_size=0 means not found.
    """
    # Backward compat: 'chunk/name' → 'chunk-filled/name'
    _LIB_ALIASES = {'chunk': 'chunk-filled'}

    if '/' in icon_name:
        lib, name = icon_name.split('/', 1)
        lib = _LIB_ALIASES.get(lib, lib)  # resolve aliases
        icon_path = icons_dir / lib / f'{name}.svg'
        base_size = ICON_BASE_SIZES.get(lib, 24)
    else:
        # Backward compatibility: un-prefixed names fall back to legacy chunk-filled/ library
        icon_path = icons_dir / 'chunk-filled' / f'{icon_name}.svg'
        base_size = 16
        if not icon_path.exists():
            icon_path = icons_dir / f'{icon_name}.svg'  # legacy flat layout
            base_size = 16

    return icon_path, base_size


def extract_paths_from_icon(icon_path: Path, target_color: str = '#000000') -> tuple[list[str], str, float]:
    """
    Extract drawable elements from an icon SVG file.

    Returns:
        (elements, style, base_size)
        style: 'fill' or 'stroke'
        base_size: detected from viewBox
    """
    if not icon_path.exists():
        return [], 'fill', 16

    content = icon_path.read_text(encoding='utf-8')
    style = _detect_icon_style(content)
    base_size = _get_viewbox_size(content) or 16
    elements = _extract_shape_elements(content, target_color)
    return elements, style, base_size


def parse_use_element(use_match: str) -> dict[str, str | float]:
    """
    Parse attributes of a use element.

    Args:
        use_match: Complete string of the use element

    Returns:
        Attribute dictionary
    """
    attrs: dict[str, str | float] = {}
    
    # Extract data-icon
    icon_match = re.search(r'data-icon="([^"]+)"', use_match)
    if icon_match:
        attrs['icon'] = icon_match.group(1)
    
    # Extract numeric attributes
    for attr in ['x', 'y', 'width', 'height']:
        match = re.search(rf'{attr}="([^"]+)"', use_match)
        if match:
            attrs[attr] = float(match.group(1))
    
    # Extract fill color
    fill_match = re.search(r'fill="([^"]+)"', use_match)
    if fill_match:
        attrs['fill'] = fill_match.group(1)

    # Extract optional stroke-width override (stroke-style icons only).
    # Tabler-outline ships at stroke-width=2; passing 1.5 reads thin, 3 reads bold.
    stroke_width_match = re.search(r'stroke-width="([^"]+)"', use_match)
    if stroke_width_match:
        attrs['stroke-width'] = stroke_width_match.group(1)

    return attrs


def generate_icon_group(attrs: dict[str, str | float], elements: list[str], style: str, base_size: float) -> str:
    """
    Generate the icon's <g> element.

    Args:
        attrs:     Attributes of the use element
        elements:  List of drawable SVG elements
        style:     'fill' or 'stroke'
        base_size: Icon's natural size (viewBox width)

    Returns:
        Complete <g> element string
    """
    x = attrs.get('x', 0)
    y = attrs.get('y', 0)
    width = attrs.get('width', base_size)
    height = attrs.get('height', base_size)
    color = attrs.get('fill', '#000000')
    icon_name = attrs.get('icon', 'unknown')

    scale_x = width / base_size
    scale_y = height / base_size

    if abs(scale_x - 1) < 1e-6 and abs(scale_y - 1) < 1e-6:
        transform = f'translate({x}, {y})'
    elif abs(scale_x - scale_y) < 1e-6:
        transform = f'translate({x}, {y}) scale({scale_x})'
    else:
        transform = f'translate({x}, {y}) scale({scale_x}, {scale_y})'

    elements_str = '\n    '.join(elements)

    if style == 'stroke':
        # Default to 2 — matches the source stroke-width baked into tabler-outline
        # (and any other stroke library) so omitting the attribute reproduces
        # pre-change visual output.
        stroke_width = attrs.get('stroke-width', '2')
        color_attrs = f'fill="none" stroke="{color}" stroke-width="{stroke_width}"'
    else:
        color_attrs = f'fill="{color}"'

    return f'''<!-- icon: {icon_name} -->
  <g transform="{transform}" {color_attrs}>
    {elements_str}
  </g>'''


def process_svg_file(svg_path: Path, icons_dir: Path, dry_run: bool = False, verbose: bool = False) -> int:
    """
    Process a single SVG file, replacing all icon placeholders.

    Args:
        svg_path: SVG file path
        icons_dir: Icon directory path
        dry_run: Whether to only preview without modifying
        verbose: Whether to show detailed information

    Returns:
        Number of icons replaced
    """
    if not svg_path.exists():
        print(f"[ERROR] File not found: {svg_path}")
        return 0
    
    content = svg_path.read_text(encoding='utf-8')
    
    # Match <use data-icon="xxx" ... /> elements
    use_pattern = r'<use\s+[^>]*data-icon="[^"]*"[^>]*/>'
    matches = list(re.finditer(use_pattern, content))
    
    if not matches:
        if verbose:
            print(f"[SKIP] No icon placeholders: {svg_path}")
        return 0
    
    replaced_count = 0
    new_content = content
    
    # Replace from back to front to avoid position offset
    for match in reversed(matches):
        use_str = match.group(0)
        attrs = parse_use_element(use_str)
        
        icon_name = attrs.get('icon')
        if not icon_name:
            continue

        icon_path, _ = resolve_icon_path(str(icon_name), icons_dir)
        color = str(attrs.get('fill', '#000000'))
        elements, style, base_size = extract_paths_from_icon(icon_path, color)
        
        if not elements:
            print(f"[WARN] Icon not found: {icon_name} (in {svg_path.name})")
            continue
        
        replacement = generate_icon_group(attrs, elements, style, base_size)
        
        if verbose or dry_run:
            print(f"  [*] {icon_name}: x={attrs.get('x', 0)}, y={attrs.get('y', 0)}, "
                  f"size={attrs.get('width', base_size)}, fill={color}, style={style}")
        
        new_content = new_content[:match.start()] + replacement + new_content[match.end():]
        replaced_count += 1
    
    if not dry_run and replaced_count > 0:
        svg_path.write_text(new_content, encoding='utf-8')
    
    status = "[PREVIEW]" if dry_run else "[OK]"
    print(f"{status} {svg_path.name} ({replaced_count} icons)")
    
    return replaced_count


def main() -> None:
    """Run the CLI entry point."""
    parser = argparse.ArgumentParser(
        description='Replace icon placeholders in SVG files with actual icon code',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog='''
Examples:
  python3 scripts/svg_finalize/embed_icons.py svg_output/01_cover.svg
  python3 scripts/svg_finalize/embed_icons.py svg_output/*.svg
  python3 scripts/svg_finalize/embed_icons.py --dry-run svg_output/*.svg
  python3 scripts/svg_finalize/embed_icons.py --icons-dir my_icons/ output.svg
        '''
    )
    
    parser.add_argument('files', nargs='+', help='SVG files to process')
    parser.add_argument('--icons-dir', type=Path, default=DEFAULT_ICONS_DIR,
                        help=f'Icon directory path (default: {DEFAULT_ICONS_DIR})')
    parser.add_argument('--dry-run', action='store_true',
                        help='Only show what would be replaced, without modifying files')
    parser.add_argument('--verbose', '-v', action='store_true',
                        help='Show detailed information')
    
    args = parser.parse_args()
    
    # Validate icon directory
    if not args.icons_dir.exists():
        print(f"[ERROR] Icon directory not found: {args.icons_dir}")
        sys.exit(1)

    print(f"[DIR] Icon directory: {args.icons_dir}")
    if args.dry_run:
        print("[PREVIEW] Preview mode (no files will be modified)")
    print()
    
    total_replaced = 0
    total_files = 0
    
    for file_pattern in args.files:
        svg_path = Path(file_pattern)
        if svg_path.exists():
            count = process_svg_file(svg_path, args.icons_dir, args.dry_run, args.verbose)
            total_replaced += count
            if count > 0:
                total_files += 1
    
    print()
    print(f"[Summary] Total: {total_files} file(s), {total_replaced} icon(s)" +
          (" (preview)" if args.dry_run else " replaced"))


if __name__ == '__main__':
    main()
