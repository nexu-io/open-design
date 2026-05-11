#!/usr/bin/env python3
"""PPT Master — single-pass image alignment + Base64 embedding.

Replaces the previous three independent finalize_svg steps:

    crop-images   →  for each <image preserveAspectRatio="… slice"/>, crop the
                     source bitmap to the target aspect ratio at the given
                     anchor and write to ``images/cropped/`` so the SVG
                     reference points to a pre-cropped asset.
    fix-aspect    →  for each <image>, read the source bitmap dimensions and
                     adjust x/y/width/height so the rendered box matches the
                     image aspect ratio (PowerPoint's "Convert to Shape"
                     ignores preserveAspectRatio and stretches otherwise).
    embed-images  →  Base64-inline every external image reference so the
                     legacy/preview pptx (which packages the SVG verbatim)
                     can resolve them — pptx-internal SVG cannot follow
                     ``../images/…`` relative URIs.

Why merge: each step independently parsed + serialized the SVG, each step
re-read the same bitmap from disk, and the two spatial transforms (crop and
fit-box) are mutually exclusive yet were sequenced one after the other.
The fix-aspect default ``preserveAspectRatio = "xMidYMid meet"`` could
also kick in on rects already cropped by crop-images (whose par was
already removed), with the only thing keeping it from corrupting the
geometry being that crop and fix-aspect happened to produce numerically
equal box dimensions — a brittle accident.

The merged pipeline:

    for image in svg:
        if href starts with data: → skip (already inline)
        if href is unresolvable / external URL → skip
        if missing preserveAspectRatio → just embed (do not assume meet)
        if align == none → just embed (no spatial transform)
        if mode == slice → crop in memory, embed cropped bytes
        if mode == meet → adjust x/y/w/h, embed original bytes
    write SVG once

Bonus: the cropped bitmap is base64-inlined directly without going through
``images/cropped/``, so that intermediate directory disappears and stale
crops can no longer accumulate across re-runs.
"""

from __future__ import annotations

import base64
import io
import os
import re
import sys
from pathlib import Path
from typing import TYPE_CHECKING
from urllib.parse import unquote
from xml.etree import ElementTree as ET

# Reuse helpers from the previous standalone modules.
from .crop_images import crop_image_to_size, get_crop_anchor, parse_preserve_aspect_ratio
from .embed_images import _optimize_image_bytes, get_mime_type
from .fix_image_aspect import calculate_fitted_dimensions

if TYPE_CHECKING:  # pragma: no cover
    from PIL import Image as PILImage  # noqa: F401


SVG_NS = 'http://www.w3.org/2000/svg'
XLINK_NS = 'http://www.w3.org/1999/xlink'

# PIL save format is named slightly differently from the file extension /
# MIME type set we expose elsewhere; this map covers the formats we accept.
_PIL_FORMAT_BY_MIME = {
    'image/png': 'PNG',
    'image/jpeg': 'JPEG',
    'image/gif': 'GIF',
    'image/webp': 'WEBP',
}


def _parse_float(val: str | None, default: float = 0.0) -> float:
    """Best-effort float parse, tolerating trailing ``px`` etc."""
    if val is None or val == '':
        return default
    try:
        return float(re.sub(r'(px|pt|em|%|rem)$', '', val.strip()))
    except (ValueError, AttributeError):
        return default


def _format_number(n: float) -> str:
    """Format a float for compact SVG attribute output."""
    if abs(n - round(n)) < 1e-6:
        return str(int(round(n)))
    s = f"{n:.2f}".rstrip('0').rstrip('.')
    return s or '0'


def _resolve_image_path(href: str, svg_dir: Path) -> Path | None:
    """Resolve an <image> href to a local filesystem path.

    Returns None for unresolvable references (http/https/etc.) so callers
    can leave those refs untouched.
    """
    if not href:
        return None
    decoded = unquote(href)
    if decoded.startswith(('http://', 'https://', 'file://')):
        return None
    if os.path.isabs(decoded):
        candidate = Path(decoded)
    else:
        candidate = (svg_dir / decoded).resolve()
    return candidate if candidate.exists() else None


def _load_pil_image(img_path: Path) -> 'PILImage' | None:
    """Open an image with PIL, returning None on any failure."""
    try:
        from PIL import Image
    except ImportError:
        return None
    try:
        return Image.open(img_path)
    except (OSError, ValueError):
        return None


def _normalize_for_save(img: 'PILImage', mime_type: str) -> 'PILImage':
    """Coerce a PIL image into a mode that the target format can save.

    JPEG cannot store alpha — flatten to white background. Other formats
    keep alpha when present.
    """
    if mime_type == 'image/jpeg':
        if img.mode in ('RGBA', 'LA'):
            from PIL import Image
            background = Image.new('RGB', img.size, (255, 255, 255))
            alpha = img.getchannel('A') if img.mode == 'RGBA' else None
            background.paste(img.convert('RGB'), mask=alpha)
            return background
        if img.mode != 'RGB':
            return img.convert('RGB')
        return img
    # PNG / GIF / WEBP — preserve alpha if present
    if img.mode == 'P':
        return img.convert('RGBA' if 'A' in img.getbands() else 'RGB')
    return img


def _encode_pil_to_data_uri(
    img: 'PILImage',
    src_path: Path,
    *,
    compress: bool,
    max_dimension: int | None,
    fallback_bytes: bytes | None,
) -> tuple[str, int] | None:
    """Serialize *img* to a base64 data URI.

    If the image hasn't been transformed (slice crop or meet fit), prefer
    re-encoding the original file bytes so we don't risk mutating an
    already-optimized asset. *fallback_bytes* carries the raw on-disk
    bytes for that path.
    """
    mime_type = get_mime_type(src_path.name, fallback_bytes)
    pil_format = _PIL_FORMAT_BY_MIME.get(mime_type, 'PNG')

    # Encode current PIL image
    try:
        prepared = _normalize_for_save(img, mime_type)
        buf = io.BytesIO()
        save_kwargs: dict = {'format': pil_format}
        if pil_format == 'JPEG':
            save_kwargs['quality'] = 95
            save_kwargs['optimize'] = True
        elif pil_format == 'PNG':
            save_kwargs['optimize'] = True
        prepared.save(buf, **save_kwargs)
        encoded_bytes = buf.getvalue()
    except (OSError, ValueError):
        return None

    # If caller passed the original bytes and they're smaller (because PIL
    # round-tripping an asset that was already well-compressed inflates it),
    # fall back to those.
    chosen = encoded_bytes
    if fallback_bytes and len(fallback_bytes) < len(encoded_bytes):
        chosen = fallback_bytes

    chosen = _optimize_image_bytes(
        chosen, mime_type, compress=compress, max_dimension=max_dimension,
    )

    b64 = base64.b64encode(chosen).decode('ascii')
    return f'data:{mime_type};base64,{b64}', len(chosen)


def _iter_image_elements(root: ET.Element):
    """Yield every <image> in the tree regardless of namespace prefix."""
    for image in root.iter(f'{{{SVG_NS}}}image'):
        yield image
    # Also catch namespace-stripped trees just in case
    for image in root.iter('image'):
        yield image


def _get_href(image: ET.Element) -> str | None:
    """Return the image href, supporting both ``href`` and ``xlink:href``."""
    return image.get('href') or image.get(f'{{{XLINK_NS}}}href')


def _set_href(image: ET.Element, value: str) -> None:
    """Write the data URI back to whichever href attribute the image used."""
    if image.get(f'{{{XLINK_NS}}}href') is not None:
        image.set(f'{{{XLINK_NS}}}href', value)
    else:
        image.set('href', value)


def _process_one_image(
    image: ET.Element,
    svg_dir: Path,
    *,
    compress: bool,
    max_dimension: int | None,
    verbose: bool,
) -> tuple[bool, str | None]:
    """Align (slice/meet) and embed a single <image>.

    Returns ``(processed, error)`` where *processed* is True iff the image
    was rewritten and *error* is a short message when something went wrong
    (the image is left untouched in that case).
    """
    href = _get_href(image)
    if not href:
        return False, None
    if href.startswith('data:'):
        return False, None  # already inline

    img_path = _resolve_image_path(href, svg_dir)
    if img_path is None:
        return False, f'unresolved href: {href[:60]}'

    try:
        with open(img_path, 'rb') as fh:
            raw_bytes = fh.read()
    except OSError as exc:
        return False, f'read failed: {exc}'

    img = _load_pil_image(img_path)
    if img is None:
        return False, 'PIL open failed'

    box_x = _parse_float(image.get('x'))
    box_y = _parse_float(image.get('y'))
    box_w = _parse_float(image.get('width'))
    box_h = _parse_float(image.get('height'))
    if box_w <= 0 or box_h <= 0:
        return False, 'zero-sized box'

    par_attr = image.get('preserveAspectRatio') or ''
    par_attr = par_attr.strip()

    # ------------------------------------------------------------------
    # Decide the spatial transform
    # ------------------------------------------------------------------
    final_img: 'PILImage' = img
    new_x, new_y, new_w, new_h = box_x, box_y, box_w, box_h
    transformed = False  # True iff bitmap content changed (crop happened)

    if not par_attr:
        # No preserveAspectRatio at all. The previous pipeline's fix-aspect
        # step assumed "xMidYMid meet" here, which silently re-fit images
        # that crop-images had already shaped. Treat absence as "leave it
        # alone": embed bytes, keep box.
        pass
    else:
        align, mode = parse_preserve_aspect_ratio(par_attr)
        if align == 'none':
            # Author wants stretch-to-box; preserve geometry, embed bytes.
            pass
        elif mode == 'slice':
            x_anchor, y_anchor = get_crop_anchor(align)
            cropped = crop_image_to_size(img, int(box_w), int(box_h),
                                         x_anchor, y_anchor)
            final_img = cropped
            transformed = True
        else:  # meet (or any other mode → treat as meet)
            new_w_calc, new_h_calc, off_x, off_y = calculate_fitted_dimensions(
                img.size[0], img.size[1], box_w, box_h, mode='meet',
            )
            new_x = box_x + off_x
            new_y = box_y + off_y
            new_w = new_w_calc
            new_h = new_h_calc

    # ------------------------------------------------------------------
    # Encode and rewrite
    # ------------------------------------------------------------------
    encoded = _encode_pil_to_data_uri(
        final_img,
        img_path,
        compress=compress,
        max_dimension=max_dimension,
        fallback_bytes=raw_bytes if not transformed else None,
    )
    if encoded is None:
        return False, 'encode failed'
    data_uri, _ = encoded

    _set_href(image, data_uri)
    image.set('x', _format_number(new_x))
    image.set('y', _format_number(new_y))
    image.set('width', _format_number(new_w))
    image.set('height', _format_number(new_h))
    if 'preserveAspectRatio' in image.attrib:
        del image.attrib['preserveAspectRatio']

    if verbose:
        suffix = ' (cropped)' if transformed else ''
        print(f'   [OK] {img_path.name}{suffix}')
    return True, None


def align_and_embed_images_in_svg(
    svg_path: str | Path,
    *,
    dry_run: bool = False,
    verbose: bool = False,
    compress: bool = False,
    max_dimension: int | None = None,
) -> tuple[int, int]:
    """Run the merged align + embed pass on a single SVG file.

    Returns ``(processed_count, error_count)``.
    """
    svg_path = Path(svg_path)
    svg_dir = svg_path.parent.resolve()

    # Register namespaces for clean serialization
    ET.register_namespace('', SVG_NS)
    ET.register_namespace('xlink', XLINK_NS)

    try:
        tree = ET.parse(svg_path)
    except ET.ParseError as exc:
        if verbose:
            print(f'  [ERROR] {svg_path.name}: parse failed ({exc})')
        return (0, 1)
    root = tree.getroot()

    # Avoid double-iteration if an element matches both namespaced and
    # bare-tag iteration paths.
    seen: set[int] = set()
    processed = 0
    errors = 0

    for image in _iter_image_elements(root):
        ident = id(image)
        if ident in seen:
            continue
        seen.add(ident)

        if dry_run:
            processed += 1
            continue

        ok, err = _process_one_image(
            image, svg_dir,
            compress=compress, max_dimension=max_dimension, verbose=verbose,
        )
        if ok:
            processed += 1
        elif err:
            errors += 1
            if verbose:
                print(f'   [WARN] {svg_path.name}: {err}')

    if processed > 0 and not dry_run:
        tree.write(svg_path, encoding='utf-8', xml_declaration=False)

    return (processed, errors)


# ---------------------------------------------------------------------------
# Standalone CLI (rare; the main entry point is finalize_svg.py)
# ---------------------------------------------------------------------------

def _cli() -> None:
    import argparse
    parser = argparse.ArgumentParser(
        description='Align (slice/meet) and Base64-embed all <image> refs in an SVG.',
    )
    parser.add_argument('svg', type=Path, help='SVG file to process in place')
    parser.add_argument('-n', '--dry-run', action='store_true')
    parser.add_argument('-v', '--verbose', action='store_true')
    parser.add_argument('--compress', action='store_true',
                        help='Compress images before embedding')
    parser.add_argument('--max-dimension', type=int, default=None,
                        help='Downscale images larger than this on either axis')
    args = parser.parse_args()

    if not args.svg.exists():
        print(f'Error: file not found: {args.svg}', file=sys.stderr)
        sys.exit(1)

    proc, err = align_and_embed_images_in_svg(
        args.svg,
        dry_run=args.dry_run,
        verbose=args.verbose,
        compress=args.compress,
        max_dimension=args.max_dimension,
    )
    print(f'Processed {proc} image(s), {err} error(s)')


if __name__ == '__main__':
    _cli()
