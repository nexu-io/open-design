#!/usr/bin/env python3
"""
SVG Image Aspect Ratio Fix Tool

Fixes the dimensions of <image> elements in SVG to match the original image aspect ratio.
This prevents images from being stretched when PowerPoint converts SVG to editable shapes.

Principle:
    When PowerPoint converts SVG to editable shapes, it ignores the preserveAspectRatio attribute
    and directly stretches the image to fill the area specified by width/height.

    This tool reads the actual image aspect ratio and recalculates the x, y, width, height of
    <image> elements so that images are centered and maintain their original aspect ratio.

Usage:
    python3 scripts/svg_finalize/fix_image_aspect.py <svg_file> [svg_file2] ...
    python3 scripts/svg_finalize/fix_image_aspect.py projects/xxx/svg_output/*.svg

    # Preview mode
    python3 scripts/svg_finalize/fix_image_aspect.py --dry-run projects/xxx/svg_output/*.svg

Examples:
    python3 scripts/svg_finalize/fix_image_aspect.py projects/demo/svg_output/slide_06_current_overview.svg
"""

import os
import re
import sys
import base64
import argparse
from pathlib import Path
from xml.etree import ElementTree as ET

# Try to import PIL for getting image dimensions
try:
    from PIL import Image
    HAS_PIL = True
except ImportError:
    HAS_PIL = False
    print("[WARN] PIL not installed. Install with: pip install Pillow")
    print("       Will try to use basic method for JPEG/PNG files.")


def get_image_dimensions_pil(image_path: str) -> tuple[int | None, int | None]:
    """Get image dimensions using PIL."""
    try:
        with Image.open(image_path) as img:
            return img.width, img.height
    except Exception as e:
        print(f"  [WARN] Cannot read image with PIL: {e}")
        return None, None


def get_image_dimensions_basic(image_path: str) -> tuple[int | None, int | None]:
    """Get image dimensions using basic parsing without PIL."""
    try:
        with open(image_path, 'rb') as f:
            data = f.read(64)  # Read header information
        
        # PNG
        if data[:8] == b'\x89PNG\r\n\x1a\n':
            w = int.from_bytes(data[16:20], 'big')
            h = int.from_bytes(data[20:24], 'big')
            return w, h
        
        # JPEG
        if data[:2] == b'\xff\xd8':
            # Need to read full file to parse JPEG
            with open(image_path, 'rb') as f:
                f.seek(2)
                while True:
                    marker = f.read(2)
                    if not marker or len(marker) < 2:
                        break
                    if marker[0] != 0xff:
                        break
                    m = marker[1]
                    # SOF0, SOF2 markers contain dimensions
                    if m in (0xC0, 0xC2):
                        f.read(3)  # Skip length and precision
                        h = int.from_bytes(f.read(2), 'big')
                        w = int.from_bytes(f.read(2), 'big')
                        return w, h
                    elif m == 0xD9:  # EOI
                        break
                    elif m == 0xD8:  # SOI
                        continue
                    elif 0xD0 <= m <= 0xD7:  # RST
                        continue
                    else:
                        length = int.from_bytes(f.read(2), 'big')
                        f.seek(length - 2, 1)
        
        return None, None
    except Exception as e:
        print(f"  [WARN] Cannot read image dimensions: {e}")
        return None, None


def get_image_dimensions_from_base64(data_uri: str) -> tuple[int | None, int | None]:
    """Get image dimensions from a Base64 data URI."""
    import io
    try:
        # Parse data URI
        match = re.match(r'data:image/(\w+);base64,(.+)', data_uri)
        if not match:
            return None, None
        
        img_format = match.group(1)
        b64_data = match.group(2)
        img_bytes = base64.b64decode(b64_data)
        
        if HAS_PIL:
            with Image.open(io.BytesIO(img_bytes)) as img:
                return img.width, img.height
        else:
            # Use basic method
            if img_bytes[:8] == b'\x89PNG\r\n\x1a\n':
                w = int.from_bytes(img_bytes[16:20], 'big')
                h = int.from_bytes(img_bytes[20:24], 'big')
                return w, h
        
        return None, None
    except Exception as e:
        print(f"  [WARN] Cannot parse base64 image: {e}")
        return None, None


def get_image_dimensions(href: str, svg_dir: str) -> tuple[int | None, int | None]:
    """Get image dimensions for either inline or external images."""
    # Handle data URI
    if href.startswith('data:'):
        return get_image_dimensions_from_base64(href)
    
    # Handle external files
    if not os.path.isabs(href):
        full_path = os.path.join(svg_dir, href)
    else:
        full_path = href
    
    if not os.path.exists(full_path):
        print(f"  [WARN] Image not found: {href}")
        return None, None
    
    if HAS_PIL:
        return get_image_dimensions_pil(full_path)
    else:
        return get_image_dimensions_basic(full_path)


def calculate_fitted_dimensions(
    img_width: int,
    img_height: int,
    box_width: float,
    box_height: float,
    mode: str = 'meet',
) -> tuple[float, float, float, float]:
    """
    Calculate the fitted dimensions for an image within a bounding box.

    Args:
        img_width, img_height: Original image dimensions
        box_width, box_height: Container box dimensions
        mode: 'meet' preserves aspect ratio and fully displays image (may have whitespace)
              'slice' preserves aspect ratio and fully fills container (may crop)

    Returns:
        (new_width, new_height, offset_x, offset_y)
    """
    img_ratio = img_width / img_height
    box_ratio = box_width / box_height
    
    if mode == 'meet':
        # Fully display image, may have whitespace
        if img_ratio > box_ratio:
            # Image is wider, fit by width
            new_width = box_width
            new_height = box_width / img_ratio
        else:
            # Image is taller, fit by height
            new_height = box_height
            new_width = box_height * img_ratio
    else:  # slice
        # Fully fill container, may crop
        if img_ratio > box_ratio:
            # Image is wider, fit by height
            new_height = box_height
            new_width = box_height * img_ratio
        else:
            # Image is taller, fit by width
            new_width = box_width
            new_height = box_width / img_ratio

    # Center offset
    offset_x = (box_width - new_width) / 2
    offset_y = (box_height - new_height) / 2
    
    return new_width, new_height, offset_x, offset_y


def fix_image_aspect_in_svg(svg_path: str, dry_run: bool = False, verbose: bool = True) -> int:
    """
    Fix image aspect ratios in an SVG file.

    Args:
        svg_path: SVG file path
        dry_run: Whether to only preview without modifying
        verbose: Whether to output detailed information

    Returns:
        Number of images fixed
    """
    svg_dir = os.path.dirname(os.path.abspath(svg_path))
    
    with open(svg_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Register SVG namespaces
    namespaces = {
        '': 'http://www.w3.org/2000/svg',
        'xlink': 'http://www.w3.org/1999/xlink',
        'svg': 'http://www.w3.org/2000/svg',
        'sodipodi': 'http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd',
        'inkscape': 'http://www.inkscape.org/namespaces/inkscape',
    }
    
    for prefix, uri in namespaces.items():
        if prefix:
            ET.register_namespace(prefix, uri)
        else:
            ET.register_namespace('', uri)
    
    try:
        tree = ET.parse(svg_path)
        root = tree.getroot()
    except ET.ParseError as e:
        print(f"  [ERROR] Cannot parse SVG: {e}")
        return 0
    
    # Find all image elements
    fixed_count = 0
    
    # Check image elements with and without namespace
    for ns_prefix in ['', '{http://www.w3.org/2000/svg}']:
        for image_elem in root.iter(f'{ns_prefix}image'):
            # Get href attribute (supports xlink:href and href)
            href = image_elem.get('{http://www.w3.org/1999/xlink}href')
            if href is None:
                href = image_elem.get('href')
            if href is None:
                continue
            
            # Get current dimensions and position
            try:
                x = float(image_elem.get('x', 0))
                y = float(image_elem.get('y', 0))
                width = float(image_elem.get('width', 0))
                height = float(image_elem.get('height', 0))
            except (ValueError, TypeError):
                continue
            
            if width <= 0 or height <= 0:
                continue
            
            # Get preserveAspectRatio
            par = image_elem.get('preserveAspectRatio', 'xMidYMid meet')
            
            # Parse preserveAspectRatio
            # Format: <align> [<meetOrSlice>]
            # e.g.: xMidYMid meet, xMidYMid slice, none
            par_parts = par.split()
            align = par_parts[0] if par_parts else 'xMidYMid'
            meet_or_slice = par_parts[1] if len(par_parts) > 1 else 'meet'
            
            if align == 'none':
                # If none, no fix needed
                continue
            
            # Get original image dimensions
            img_width, img_height = get_image_dimensions(href, svg_dir)
            if img_width is None or img_height is None:
                continue
            
            # Calculate fitted dimensions
            mode = 'slice' if meet_or_slice == 'slice' else 'meet'
            new_width, new_height, offset_x, offset_y = calculate_fitted_dimensions(
                img_width, img_height, width, height, mode
            )
            
            # Check if modification is needed
            tolerance = 0.5  # Allowed tolerance
            if (abs(new_width - width) < tolerance and 
                abs(new_height - height) < tolerance):
                # Dimensions are already correct, no modification needed
                continue
            
            if verbose:
                img_name = os.path.basename(href.split('?')[0][:50] if not href.startswith('data:') else '[base64]')
                print(f"  [FIX] {img_name}")
                print(f"        Original image: {img_width}x{img_height} (ratio: {img_width/img_height:.3f})")
                print(f"        Original box: {width}x{height} @ ({x}, {y})")
                print(f"        New box: {new_width:.1f}x{new_height:.1f} @ ({x + offset_x:.1f}, {y + offset_y:.1f})")
            
            if not dry_run:
                # Update attributes
                image_elem.set('x', f'{x + offset_x:.1f}')
                image_elem.set('y', f'{y + offset_y:.1f}')
                image_elem.set('width', f'{new_width:.1f}')
                image_elem.set('height', f'{new_height:.1f}')
                # Remove preserveAspectRatio since dimensions are now correct
                if 'preserveAspectRatio' in image_elem.attrib:
                    del image_elem.attrib['preserveAspectRatio']
            
            fixed_count += 1
    
    if not dry_run and fixed_count > 0:
        # Save modifications
        tree.write(svg_path, encoding='unicode', xml_declaration=True)
    
    return fixed_count


def main() -> None:
    """Run the CLI entry point."""
    parser = argparse.ArgumentParser(
        description='Fix image aspect ratios in SVG to prevent stretching when PowerPoint converts to shapes',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog='''
Examples:
  %(prog)s slide_01.svg                    # Process a single file
  %(prog)s *.svg                           # Process all SVGs in current directory
  %(prog)s --dry-run *.svg                 # Preview files to be processed
  %(prog)s projects/xxx/svg_output/*.svg   # Process project directory
        '''
    )
    parser.add_argument('files', nargs='+', help='SVG files to process')
    parser.add_argument('--dry-run', '-n', action='store_true',
                        help='Only show which images would be fixed, without modifying files')
    parser.add_argument('--quiet', '-q', action='store_true',
                        help='Quiet mode, reduce output')
    
    args = parser.parse_args()
    
    if args.dry_run:
        print("[INFO] Preview mode: only showing what would be modified, no files will be changed\n")
    
    total_fixed = 0
    total_files = 0
    
    for svg_file in args.files:
        if not os.path.exists(svg_file):
            if not args.quiet:
                print(f"[ERROR] File not found: {svg_file}")
            continue
        
        if not svg_file.endswith('.svg'):
            if not args.quiet:
                print(f"[SKIP] Skipping non-SVG file: {svg_file}")
            continue
        
        if not args.quiet:
            print(f"\n[FILE] {os.path.basename(svg_file)}")
        
        fixed = fix_image_aspect_in_svg(svg_file, dry_run=args.dry_run, verbose=not args.quiet)
        
        if fixed > 0:
            total_fixed += fixed
            total_files += 1
        elif not args.quiet:
            print("       No fix needed")
    
    print(f"\n{'=' * 50}")
    if args.dry_run:
        print(f"[PREVIEW] Will fix {total_fixed} image(s) in {total_files} file(s)")
    else:
        print(f"[DONE] Fixed {total_fixed} image(s) in {total_files} file(s)")


if __name__ == '__main__':
    main()
