#!/usr/bin/env python3
"""
PPT Master - Smart Image Cropping Tool

Smartly crops images based on the preserveAspectRatio attribute of <image> elements in SVG:
- slice: Crop to fill (similar to CSS object-fit: cover)
- meet: Display fully without cropping (similar to CSS object-fit: contain)

Supports 9 alignment modes:
- xMinYMin / xMidYMin / xMaxYMin (top alignment)
- xMinYMid / xMidYMid / xMaxYMid (vertical center)
- xMinYMax / xMidYMax / xMaxYMax (bottom alignment)

Usage:
    python3 scripts/svg_finalize/crop_images.py <SVG file or directory> [--dry-run]
"""

import os
import re
import hashlib
import sys
import argparse
from pathlib import Path
from xml.etree import ElementTree as ET
from urllib.parse import unquote

try:
    from PIL import Image
except ImportError:
    print("Error: PIL (Pillow) is required. Run: pip install Pillow")
    exit(1)


def parse_preserve_aspect_ratio(attr: str) -> tuple[str, str]:
    """
    Parse the preserveAspectRatio attribute.

    Returns: (align, meet_or_slice)
        align: e.g. 'xMidYMid'
        meet_or_slice: 'meet' or 'slice'
    """
    if not attr:
        return ('xMidYMid', 'meet')  # Default value
    
    parts = attr.strip().split()
    align = parts[0] if parts else 'xMidYMid'
    meet_or_slice = parts[1] if len(parts) > 1 else 'meet'
    
    return (align, meet_or_slice)


def get_crop_anchor(align: str) -> tuple[float, float]:
    """
    Return the crop anchor point based on the align value.

    Returns: (x_anchor, y_anchor)
        x_anchor: 0.0 (left), 0.5 (center), 1.0 (right)
        y_anchor: 0.0 (top), 0.5 (center), 1.0 (bottom)
    """
    x_map = {'xMin': 0.0, 'xMid': 0.5, 'xMax': 1.0}
    y_map = {'YMin': 0.0, 'YMid': 0.5, 'YMax': 1.0}
    
    x_anchor = 0.5
    y_anchor = 0.5
    
    for key, val in x_map.items():
        if key in align:
            x_anchor = val
            break
    
    for key, val in y_map.items():
        if key in align:
            y_anchor = val
            break
    
    return (x_anchor, y_anchor)


def crop_image_to_size(
    img: Image.Image,
    target_width: int,
    target_height: int,
    x_anchor: float = 0.5,
    y_anchor: float = 0.5,
) -> Image.Image:
    """
    Crop an image to the target aspect ratio, preserving original resolution (no scaling).

    New logic: Only crops the original image to the target aspect ratio without any scaling,
    thus preserving the original resolution and clarity.

    Args:
        img: PIL Image object
        target_width: Target width (used to calculate ratio)
        target_height: Target height (used to calculate ratio)
        x_anchor: Horizontal anchor (0=left, 0.5=center, 1=right)
        y_anchor: Vertical anchor (0=top, 0.5=center, 1=bottom)

    Returns:
        Cropped PIL Image object (preserving original resolution)
    """
    img_width, img_height = img.size
    
    # Calculate target aspect ratio
    target_ratio = target_width / target_height
    img_ratio = img_width / img_height
    
    # Calculate crop region on the original image based on ratio (no scaling)
    if img_ratio > target_ratio:
        # Original image is wider; crop left and right sides
        crop_height = img_height
        crop_width = int(img_height * target_ratio)
    else:
        # Original image is taller; crop top and bottom sides
        crop_width = img_width
        crop_height = int(img_width / target_ratio)
    
    # Calculate crop position based on anchor point
    extra_width = img_width - crop_width
    extra_height = img_height - crop_height
    
    left = int(extra_width * x_anchor)
    top = int(extra_height * y_anchor)
    right = left + crop_width
    bottom = top + crop_height
    
    # Crop only, no scaling
    return img.crop((left, top, right, bottom))


def process_svg_images(
    svg_file: str,
    output_dir: str | Path | None = None,
    dry_run: bool = False,
    verbose: bool = True,
) -> tuple[int, int]:
    """
    Process images in an SVG file, cropping based on the preserveAspectRatio attribute.

    Args:
        svg_file: SVG file path
        output_dir: Output directory for cropped images (default: images/cropped/)
        dry_run: Preview only, no actual processing
        verbose: Verbose output

    Returns:
        (processed_count, error_count)
    """
    svg_path = Path(svg_file)
    svg_dir = svg_path.parent
    
    # Default output directory
    if output_dir is None:
        # Find the project's images directory
        # Parent directory of svg_output or svg_final, under images
        project_dir = svg_dir.parent
        output_dir = project_dir / 'images' / 'cropped'
    else:
        output_dir = Path(output_dir)
    
    # Parse SVG
    try:
        ET.register_namespace('', 'http://www.w3.org/2000/svg')
        ET.register_namespace('xlink', 'http://www.w3.org/1999/xlink')
        tree = ET.parse(str(svg_path))
        root = tree.getroot()
    except Exception as e:
        if verbose:
            print(f"  [ERROR] Failed to parse SVG: {e}")
        return (0, 1)
    
    ns = {'svg': 'http://www.w3.org/2000/svg', 'xlink': 'http://www.w3.org/1999/xlink'}
    
    processed_count = 0
    error_count = 0
    modified = False
    
    # Find all image elements
    for image in root.iter('{http://www.w3.org/2000/svg}image'):
        # Get href attribute
        href = image.get('{http://www.w3.org/1999/xlink}href') or image.get('href')
        if not href:
            continue
        
        # Skip Base64 inline images
        if href.startswith('data:'):
            continue
        
        # Get preserveAspectRatio attribute
        par = image.get('preserveAspectRatio', '')
        align, mode = parse_preserve_aspect_ratio(par)
        
        # Only process slice mode
        if mode != 'slice':
            continue
        
        # Get target dimensions
        try:
            target_width = int(float(image.get('width', 0)))
            target_height = int(float(image.get('height', 0)))
        except (ValueError, TypeError):
            continue
        
        if target_width <= 0 or target_height <= 0:
            continue
        
        # Parse image path
        href_decoded = unquote(href)
        if href_decoded.startswith('../'):
            img_path = (svg_dir / href_decoded).resolve()
        else:
            img_path = (svg_dir / href_decoded).resolve()
        
        if not img_path.exists():
            if verbose:
                print(f"    [SKIP] Image not found: {href}")
            continue
        
        # Get crop anchor point
        x_anchor, y_anchor = get_crop_anchor(align)
        
        if dry_run:
            if verbose:
                print(f"    [DRY] {img_path.name} -> {target_width}x{target_height} "
                      f"(align: {align}, anchor: {x_anchor},{y_anchor})")
            processed_count += 1
            continue
        
        # Create output directory
        output_dir.mkdir(parents=True, exist_ok=True)
        
        try:
            # Open and process image
            img = Image.open(img_path)
            output_is_png = img_path.suffix.lower() == '.png'

            # Preserve alpha for PNG assets such as translucent overlays.
            if output_is_png:
                if img.mode == 'P':
                    img = img.convert('RGBA')
                elif img.mode not in ('RGBA', 'LA', 'RGB', 'L'):
                    img = img.convert('RGBA' if 'A' in img.getbands() else 'RGB')
            else:
                if img.mode in ('RGBA', 'LA'):
                    background = Image.new('RGB', img.size, (255, 255, 255))
                    alpha = img.getchannel('A')
                    background.paste(img.convert('RGB'), mask=alpha)
                    img = background
                elif img.mode == 'P':
                    img = img.convert('RGB')
                elif img.mode not in ('RGB', 'L'):
                    img = img.convert('RGB')
            
            # Crop
            cropped = crop_image_to_size(img, target_width, target_height, x_anchor, y_anchor)
            
            # Generate output filename (keep original name, place in cropped directory)
            output_filename = img_path.name
            output_path = output_dir / output_filename
            
            # Save
            if output_is_png:
                cropped.save(output_path, 'PNG', optimize=True)
            else:
                cropped.save(output_path, 'JPEG', quality=90, optimize=True)
            
            if verbose:
                print(f"    [OK] {img_path.name}: {img.size} -> {target_width}x{target_height} "
                      f"({align})")
            
            # Update image path in SVG
            new_href = f"../images/cropped/{output_filename}"
            if image.get('{http://www.w3.org/1999/xlink}href'):
                image.set('{http://www.w3.org/1999/xlink}href', new_href)
            else:
                image.set('href', new_href)
            
            # Remove preserveAspectRatio (image is now correctly sized)
            if 'preserveAspectRatio' in image.attrib:
                del image.attrib['preserveAspectRatio']
            
            modified = True
            processed_count += 1
            
        except Exception as e:
            if verbose:
                print(f"    [ERROR] {img_path.name}: {e}")
            error_count += 1
    
    # Save modified SVG
    if modified and not dry_run:
        tree.write(str(svg_path), encoding='unicode', xml_declaration=False)
    
    return (processed_count, error_count)


def process_directory(directory: str, dry_run: bool = False, verbose: bool = True) -> tuple[int, int]:
    """Process all SVG files in a directory."""
    directory_path = Path(directory)
    total_processed = 0
    total_errors = 0
    
    for svg_file in directory_path.glob('*.svg'):
        if verbose:
            print(f"  Processing: {svg_file.name}")
        processed, errors = process_svg_images(str(svg_file), dry_run=dry_run, verbose=verbose)
        total_processed += processed
        total_errors += errors
    
    return (total_processed, total_errors)


def main() -> None:
    """Run the CLI entry point."""
    parser = argparse.ArgumentParser(
        description='PPT Master - Smart Image Cropping Tool',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog='''
Examples:
  %(prog)s projects/my_project/svg_output
  %(prog)s page_01.svg --dry-run

preserveAspectRatio usage:
  xMidYMid slice   Center crop (default)
  xMidYMin slice   Keep top
  xMidYMax slice   Keep bottom
  xMinYMid slice   Keep left
  xMaxYMid slice   Keep right
  xMidYMid meet    Display fully, no cropping
        '''
    )
    
    parser.add_argument('path', type=Path, help='SVG file or directory')
    parser.add_argument('--dry-run', '-n', action='store_true', help='Preview only, no actual processing')
    parser.add_argument('--quiet', '-q', action='store_true', help='Quiet mode')
    
    args = parser.parse_args()
    
    if not args.path.exists():
        print(f"[ERROR] Path not found: {args.path}")
        sys.exit(1)

    print("PPT Master - Smart Image Cropping")
    print("=" * 50)
    
    if args.path.is_file():
        processed, errors = process_svg_images(str(args.path), dry_run=args.dry_run, 
                                                verbose=not args.quiet)
    else:
        processed, errors = process_directory(str(args.path), dry_run=args.dry_run,
                                               verbose=not args.quiet)
    
    print()
    print(f"Done: {processed} image(s) cropped, {errors} error(s)")


if __name__ == '__main__':
    main()
