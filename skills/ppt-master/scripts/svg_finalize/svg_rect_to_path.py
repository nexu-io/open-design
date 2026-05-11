#!/usr/bin/env python3
"""
PPT Master - SVG Rounded Rectangle to Path Tool

Solves the issue of rounded corners being lost when using "Convert to Shape" in PowerPoint:
Converts <rect> elements with rx/ry to equivalent <path> elements.

Usage:
    python3 scripts/svg_finalize/svg_rect_to_path.py <SVG file or directory>
    python3 scripts/svg_finalize/svg_rect_to_path.py <project_path> -s output
    python3 scripts/svg_finalize/svg_rect_to_path.py <project_path> -s final -o svg_rounded

Examples:
    python3 scripts/svg_finalize/svg_rect_to_path.py examples/ppt169_demo
    python3 scripts/svg_finalize/svg_rect_to_path.py examples/ppt169_demo/svg_output/01_cover.svg

Output:
    - Directory mode: outputs to svg_rounded/ subdirectory
    - File mode: outputs to <filename>_rounded.svg
"""

import sys
import re
import argparse
from pathlib import Path
from typing import Any, Tuple
from xml.etree import ElementTree as ET


def rect_to_rounded_path(
    x: float,
    y: float,
    width: float,
    height: float,
    rx: float,
    ry: float,
) -> str:
    """
    Convert a rounded rectangle to an SVG path string.
    Uses elliptical arc commands to draw rounded corners.
    """
    # Limit corner radius to half of width/height
    rx = min(rx, width / 2)
    ry = min(ry, height / 2)
    
    # Calculate key points
    x1 = x + rx
    x2 = x + width - rx
    y1 = y + ry
    y2 = y + height - ry
    
    # Build path
    path = (
        f"M{x1:.2f},{y:.2f} "
        f"H{x2:.2f} "
        f"A{rx:.2f},{ry:.2f} 0 0 1 {x + width:.2f},{y1:.2f} "
        f"V{y2:.2f} "
        f"A{rx:.2f},{ry:.2f} 0 0 1 {x2:.2f},{y + height:.2f} "
        f"H{x1:.2f} "
        f"A{rx:.2f},{ry:.2f} 0 0 1 {x:.2f},{y2:.2f} "
        f"V{y1:.2f} "
        f"A{rx:.2f},{ry:.2f} 0 0 1 {x1:.2f},{y:.2f} "
        f"Z"
    )
    
    # Clean up excess decimals
    path = re.sub(r'\.00(?=\s|,|[A-Za-z]|$)', '', path)
    
    return path


def parse_float(val: str, default: float = 0.0) -> float:
    """Safely parse a float value."""
    if not val:
        return default
    try:
        # Remove units
        val = re.sub(r'(px|pt|em|%|rem)$', '', val.strip())
        return float(val)
    except ValueError:
        return default


def process_svg(content: str, verbose: bool = False) -> Tuple[str, int]:
    """
    Process SVG content, converting rounded rectangles to paths.
    Returns (processed content, conversion count).
    """
    converted_count = 0
    
    # Save original XML declaration
    xml_declaration = ''
    if content.strip().startswith('<?xml'):
        match = re.match(r'(<\?xml[^?]*\?>)', content)
        if match:
            xml_declaration = match.group(1) + '\n'
    
    # Register SVG namespaces
    ET.register_namespace('', 'http://www.w3.org/2000/svg')
    ET.register_namespace('xlink', 'http://www.w3.org/1999/xlink')
    
    try:
        root = ET.fromstring(content)
    except ET.ParseError as e:
        if verbose:
            print(f"    XML parse error: {e}")
        return content, 0
    
    # Get default namespace
    ns = ''
    if root.tag.startswith('{'):
        ns = root.tag.split('}')[0] + '}'
    
    def get_tag_name(tag: str) -> str:
        """Get tag name without namespace."""
        if tag.startswith('{'):
            return tag.split('}')[1]
        return tag
    
    def process_element(elem: ET.Element) -> None:
        """Process a single element."""
        nonlocal converted_count
        tag_name = get_tag_name(elem.tag)
        
        # Process rounded rectangles
        if tag_name == 'rect':
            rx = parse_float(elem.get('rx', '0'))
            ry = parse_float(elem.get('ry', '0'))
            
            # If only one is specified, the other takes the same value
            if rx == 0 and ry > 0:
                rx = ry
            elif ry == 0 and rx > 0:
                ry = rx
            
            if rx > 0 or ry > 0:
                x = parse_float(elem.get('x', '0'))
                y = parse_float(elem.get('y', '0'))
                width = parse_float(elem.get('width', '0'))
                height = parse_float(elem.get('height', '0'))
                
                if width > 0 and height > 0:
                    # Generate path
                    path_d = rect_to_rounded_path(x, y, width, height, rx, ry)
                    
                    # rect-specific attributes
                    rect_attrs = {'x', 'y', 'width', 'height', 'rx', 'ry'}
                    
                    # Change element to path
                    elem.tag = ns + 'path' if ns else 'path'
                    elem.set('d', path_d)
                    
                    # Remove rect-specific attributes
                    for attr in rect_attrs:
                        if attr in elem.attrib:
                            del elem.attrib[attr]
                    
                    converted_count += 1
                    if verbose:
                        print(f"    Converted rounded rect: rx={rx}, ry={ry}")
        
        # Recursively process child elements
        for child in elem:
            process_element(child)
    
    # Process all elements
    process_element(root)
    
    # Convert back to string
    result = ET.tostring(root, encoding='unicode')
    
    # Add XML declaration (if originally present)
    if xml_declaration:
        result = xml_declaration + result
    
    return result, converted_count


def process_svg_file(input_path: Path, output_path: Path, verbose: bool = False) -> tuple[bool, int]:
    """Process a single SVG file."""
    try:
        with open(input_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        processed, count = process_svg(content, verbose)
        
        # Ensure output directory exists
        output_path.parent.mkdir(parents=True, exist_ok=True)
        
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(processed)
        
        return True, count
        
    except Exception as e:
        if verbose:
            print(f"  Error: {e}")
        return False, 0


def find_svg_files(project_path: Path, source: str = 'output') -> tuple[list[Path], str]:
    """Find SVG files in a project."""
    dir_map = {
        'output': 'svg_output',
        'final': 'svg_final',
        'flat': 'svg_output_flattext',
        'final_flat': 'svg_final_flattext',
    }
    
    dir_name = dir_map.get(source, source)
    svg_dir = project_path / dir_name
    
    if not svg_dir.exists():
        if (project_path / 'svg_output').exists():
            dir_name = 'svg_output'
            svg_dir = project_path / dir_name
        elif project_path.is_dir():
            svg_dir = project_path
            dir_name = project_path.name
    
    if not svg_dir.exists():
        return [], ''
    
    return sorted(svg_dir.glob('*.svg')), dir_name


def main() -> None:
    """Run the CLI entry point."""
    parser = argparse.ArgumentParser(
        description='PPT Master - SVG Rounded Rectangle to Path Tool',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog='''
Examples:
    %(prog)s examples/ppt169_demo
    %(prog)s examples/ppt169_demo -s final
    %(prog)s examples/ppt169_demo/svg_output/01_cover.svg

What it does:
    Converts <rect> elements with rx/ry to equivalent <path> elements.
    Processed SVGs preserve rounded corners when using "Convert to Shape" in PowerPoint.
'''
    )
    
    parser.add_argument('path', type=str, help='SVG file or project directory path')
    parser.add_argument('-s', '--source', type=str, default='output',
                        help='SVG source: output/final/flat/final_flat or subdirectory name (default: output)')
    parser.add_argument('-o', '--output', type=str, default='svg_rounded',
                        help='Output directory name (default: svg_rounded)')
    parser.add_argument('-v', '--verbose', action='store_true', help='Verbose output')
    parser.add_argument('-q', '--quiet', action='store_true', help='Quiet mode')
    
    args = parser.parse_args()
    
    input_path = Path(args.path)
    
    if not input_path.exists():
        print(f"Error: Path not found: {input_path}")
        sys.exit(1)
    
    verbose = args.verbose and not args.quiet
    quiet = args.quiet
    
    if not quiet:
        print("PPT Master - SVG Rounded Rectangle to Path Tool")
        print("=" * 50)
    
    total_converted = 0
    
    if input_path.is_file() and input_path.suffix.lower() == '.svg':
        # Single file mode
        output_path = input_path.with_stem(input_path.stem + '_rounded')

        if not quiet:
            print(f"  Input: {input_path}")
            print(f"  Output: {output_path}")
            print()
        
        success, count = process_svg_file(input_path, output_path, verbose)
        total_converted = count
        
        if success:
            if not quiet:
                print(f"[DONE] Saved: {output_path}")
        else:
            print(f"[FAIL] Processing failed")
            sys.exit(1)
    
    else:
        # Directory/project mode
        svg_files, source_dir = find_svg_files(input_path, args.source)
        
        if not svg_files:
            print("Error: No SVG files found")
            sys.exit(1)
        
        output_dir = input_path / args.output
        
        if not quiet:
            print(f"  Project path: {input_path}")
            print(f"  SVG source: {source_dir}")
            print(f"  Output directory: {args.output}")
            print(f"  File count: {len(svg_files)}")
            print()
        
        success_count = 0
        for i, svg_file in enumerate(svg_files, 1):
            output_path = output_dir / svg_file.name
            
            if verbose:
                print(f"  [{i}/{len(svg_files)}] {svg_file.name}")
            
            success, count = process_svg_file(svg_file, output_path, verbose)
            
            if success:
                success_count += 1
                total_converted += count
                if not verbose and not quiet:
                    print(f"  [{i}/{len(svg_files)}] {svg_file.name} OK")
            else:
                if not quiet:
                    print(f"  [{i}/{len(svg_files)}] {svg_file.name} FAILED")
        
        if not quiet:
            print()
            print(f"[DONE] Succeeded: {success_count}/{len(svg_files)}")
            print(f"  Output directory: {output_dir}")
    
    # Show statistics
    if not quiet:
        print()
        print(f"Conversion stats: rounded rect -> path: {total_converted}")
    
    sys.exit(0)


if __name__ == '__main__':
    main()
