#!/usr/bin/env python3
"""
PDF to Markdown Converter
Uses PyMuPDF to extract PDF text content and convert to Markdown format.
Supports heading levels, bold, italic, and list detection.
"""

import argparse
import hashlib
import os
import re
import sys
from pathlib import Path
from collections import Counter

try:
    import fitz  # PyMuPDF
except ImportError:
    print("[ERROR] PyMuPDF not installed. Run: pip install PyMuPDF", file=sys.stderr)
    sys.exit(1)

FONT_BODY_SIZE = 12
FONT_H1_SIZE = 24
FONT_H2_SIZE = 18
FONT_H3_SIZE = 14
HEADER_FOOTER_SAMPLE_LIMIT = 40
HEADER_FOOTER_EDGE_SAMPLE_SIZE = 20


def analyze_font_sizes(doc: fitz.Document) -> dict[str, float]:
    """Analyze font size distribution to infer heading levels.

    Args:
        doc: Open PDF document.

    Returns:
        A size mapping containing body and inferred heading sizes.
    """
    size_counter = Counter()

    for page in doc:
        blocks = page.get_text("dict")["blocks"]
        for block in blocks:
            if block["type"] == 0:
                for line in block["lines"]:
                    for span in line["spans"]:
                        size = round(span["size"], 1)
                        text = span["text"].strip()
                        if text:
                            size_counter[size] += len(text)

    if not size_counter:
        return {
            "body": FONT_BODY_SIZE,
            "h1": FONT_H1_SIZE,
            "h2": FONT_H2_SIZE,
            "h3": FONT_H3_SIZE,
        }

    sorted_sizes = sorted(size_counter.items(), key=lambda x: x[1], reverse=True)
    body_size = sorted_sizes[0][0]

    all_sizes = sorted(size_counter.keys(), reverse=True)
    larger_sizes = [s for s in all_sizes if s > body_size + 1]

    size_map = {"body": body_size}
    if len(larger_sizes) >= 1:
        size_map["h1"] = larger_sizes[0]
    if len(larger_sizes) >= 2:
        size_map["h2"] = larger_sizes[1]
    if len(larger_sizes) >= 3:
        size_map["h3"] = larger_sizes[2]

    return size_map


def get_heading_level(size: float, size_map: dict, text: str = "",
                      flags: int = 0, strict: bool = True) -> int:
    """
    Determine heading level using multiple heuristics.

    Args:
        size: Font size
        size_map: Font size mapping
        text: Text content (used for additional heuristics)
        flags: Font flags (bit 4 = bold)
        strict: Strict mode, requires more conditions to be met

    Returns:
        Heading level (0 = body text, 1-3 = H1-H3)
    """
    # Initial determination based on font size
    level = 0
    if "h1" in size_map and size >= size_map["h1"] - 0.5:
        level = 1
    elif "h2" in size_map and size >= size_map["h2"] - 0.5:
        level = 2
    elif "h3" in size_map and size >= size_map["h3"] - 0.5:
        level = 3

    if level == 0:
        return 0

    # Non-strict mode returns directly (backward compatible)
    if not strict or not text:
        return level

    # Strict mode: additional validation conditions
    text = text.strip()

    # Exclusion: text too long is unlikely to be a heading
    if len(text) > 80:
        return 0

    # Exclusion: complete sentences ending with punctuation
    sentence_endings = '.。!！?？'
    if text and text[-1] in sentence_endings:
        # But keep numbered headings like "1. Overview" or "Chapter 1."
        if not re.match(r'^[\d第]+[.、章节]', text):
            return 0

    # Bonus: bold text is more likely to be a heading
    is_bold = flags & 16
    if not is_bold and level >= 2:
        # Non-bold subheadings require a larger font size difference
        body_size = size_map.get("body", 12)
        if size < body_size + 2:
            return 0

    return level

def is_monospace_font(font_name: str) -> bool:
    """
    Determine if the font is monospace (typically used for code).
    """
    if not font_name:
        return False
    font_lower = font_name.lower()
    mono_fonts = [
        'courier', 'consolas', 'monaco', 'menlo', 'monospace',
        'source code', 'fira code', 'jetbrains', 'inconsolata',
        'dejavu sans mono', 'liberation mono', 'ubuntu mono',
        'roboto mono', 'robotomono', 'sf mono', 'cascadia', 'hack'
    ]
    return any(f in font_lower for f in mono_fonts)


def format_span_text(text: str, flags: int) -> str:
    """Format text based on font flags (bold, italic)."""
    text = text.strip()
    if not text:
        return ""

    is_bold = flags & 16
    is_italic = flags & 2

    if is_bold and is_italic:
        return f"***{text}***"
    elif is_bold:
        return f"**{text}**"
    elif is_italic:
        return f"*{text}*"
    return text


def detect_list_item(text: str) -> tuple:
    """Detect if the text is a list item. Returns (is_list, list_type, content)."""
    text = text.strip()

    ul_patterns = [
        (r'^[•●○◦▪▸►]\s*', '-'),
        (r'^[-–—]\s+', '-'),
        (r'^\*\s+', '-'),
    ]
    for pattern, marker in ul_patterns:
        match = re.match(pattern, text)
        if match:
            return (True, 'ul', marker + ' ' + text[match.end():])

    ol_pattern = r'^(\d+)[.、)]\s*'
    match = re.match(ol_pattern, text)
    if match:
        num = match.group(1)
        return (True, 'ol', f"{num}. " + text[match.end():])

    return (False, None, text)


def remove_page_footer(text: str) -> str:
    """
    Remove page number patterns from footers, e.g. 'November 2025 8' or '2025年11月 8'.
    """
    # English month + year + page number
    months_en = r'(?:January|February|March|April|May|June|July|August|September|October|November|December)'
    pattern_en = rf'\s*{months_en}\s+\d{{4}}\s+\d{{1,3}}\s*$'
    text = re.sub(pattern_en, '', text, flags=re.IGNORECASE)

    # Chinese format: 2025年11月 8
    pattern_cn = r'\s*\d{4}年\d{1,2}月\s+\d{1,3}\s*$'
    text = re.sub(pattern_cn, '', text)

    return text.rstrip()


def detect_headers_footers(doc: fitz.Document, threshold_ratio: float = 0.6) -> set[str]:
    """
    Detect headers and footers statistically.

    Principle: Headers and footers typically appear at fixed positions (top or bottom)
    on each page with the same content. We collect top and bottom text from all pages,
    and if certain text appears more frequently than the threshold, it is treated as noise.
    """
    if len(doc) < 3:
        return set()

    headers = []
    footers = []

    # Sample first 20 and last 20 pages (avoid processing too slowly)
    pages_to_scan = list(range(len(doc)))
    if len(doc) > HEADER_FOOTER_SAMPLE_LIMIT:
        pages_to_scan = (
            pages_to_scan[:HEADER_FOOTER_EDGE_SAMPLE_SIZE]
            + pages_to_scan[-HEADER_FOOTER_EDGE_SAMPLE_SIZE:]
        )

    for i in pages_to_scan:
        page = doc[i]
        rect = page.rect
        h = rect.height

        # Define top and bottom regions (15% each)
        top_rect = fitz.Rect(0, 0, rect.width, h * 0.15)
        bottom_rect = fitz.Rect(0, h * 0.85, rect.width, h)

        # Extract text blocks
        blocks = page.get_text("blocks")
        for b in blocks:
            b_rect = fitz.Rect(b[:4])
            text = b[4].strip()
            if not text:
                continue

            # Simple spatial determination
            if b_rect.intersects(top_rect):
                headers.append(text)
            elif b_rect.intersects(bottom_rect):
                footers.append(text)

    # Count frequencies
    noise_texts = set()
    total_scanned = len(pages_to_scan)

    for collection in [headers, footers]:
        counter = Counter(collection)
        for text, count in counter.items():
            # if text appears in > 60% of scanned pages, mark as noise
            if count / total_scanned > threshold_ratio:
                noise_texts.add(text)

    return noise_texts


def merge_adjacent_headings(elements: list) -> list:
    """
    Merge adjacent same-level short headings.
    Example: '# Agent Tools &' + '# Interoperability' -> '# Agent Tools & Interoperability'
    """
    if not elements:
        return elements

    merged = []
    i = 0

    while i < len(elements):
        el = elements[i]

        # Only process heading elements
        if el.get("type") != 0 or not el.get("is_heading"):
            merged.append(el)
            i += 1
            continue

        content = el["content"]
        # Extract heading level
        match = re.match(r'^(#{1,6})\s+(.+)$', content)
        if not match:
            merged.append(el)
            i += 1
            continue

        level = match.group(1)
        title_text = match.group(2)

        # If heading is short and the next one is also the same level, try to merge
        j = i + 1
        while j < len(elements) and len(title_text) < 60:
            next_el = elements[j]
            if next_el.get("type") != 0 or not next_el.get("is_heading"):
                break

            next_match = re.match(r'^(#{1,6})\s+(.+)$', next_el["content"])
            if not next_match or next_match.group(1) != level:
                break

            next_text = next_match.group(2)
            # Only merge short heading fragments
            if len(next_text) > 40:
                break

            # Merge
            title_text += " " + next_text
            j += 1

        # Create merged element
        merged_el = el.copy()
        merged_el["content"] = f"{level} {title_text}"
        merged.append(merged_el)
        i = j

    return merged


# Image filtering thresholds
MIN_IMAGE_PIXELS = 100       # Minimum pixel dimension (width AND height)
MIN_IMAGE_AREA = 30000       # Minimum pixel area (e.g. 200x150)
MIN_IMAGE_BYTES = 2048       # Minimum image data size (2KB)
MIN_PAGE_RATIO = 0.05        # Minimum render size relative to page (5%)
MAX_ASPECT_RATIO = 12        # Maximum aspect ratio (filters decorative bars)
MAX_LOW_INFO_BPP = 0.08      # Bytes-per-pixel threshold for low-info images
MAX_LOW_INFO_AREA = 500000   # Area threshold: only apply bpp filter below this


def should_keep_image(
    block: dict[str, object],
    page_rect: fitz.Rect,
    seen_hashes: set[str] | None = None,
) -> bool:
    """Filter out small, decorative, or duplicate images.

    Args:
        block: Image block extracted from PyMuPDF.
        page_rect: Current page rectangle.
        seen_hashes: Optional set used to deduplicate image payloads.

    Returns:
        Whether the image should be kept in the Markdown output.
    """
    w, h = block.get("width", 0), block.get("height", 0)

    # Pixel dimension filter
    if w < MIN_IMAGE_PIXELS or h < MIN_IMAGE_PIXELS:
        return False

    # Pixel area filter
    area = w * h
    if area < MIN_IMAGE_AREA:
        return False

    image_data = block.get("image", b"")
    if len(image_data) < MIN_IMAGE_BYTES:
        return False

    # Deduplicate: skip images with identical content (e.g. repeated backgrounds)
    if seen_hashes is not None:
        img_hash = hashlib.md5(image_data).hexdigest()
        if img_hash in seen_hashes:
            return False
        seen_hashes.add(img_hash)

    # Check render size relative to page
    bbox = block.get("bbox", (0, 0, 0, 0))
    render_w = bbox[2] - bbox[0]
    render_h = bbox[3] - bbox[1]
    page_w = page_rect.width
    page_h = page_rect.height
    if page_w > 0 and page_h > 0:
        if render_w / page_w < MIN_PAGE_RATIO and render_h / page_h < MIN_PAGE_RATIO:
            return False

    # Filter extreme aspect ratios (decorative bars/separators)
    aspect = max(w, h) / max(min(w, h), 1)
    if aspect > MAX_ASPECT_RATIO:
        return False

    # Filter low-info images: solid color blocks / gradients have very high
    # compression ratios (low bytes-per-pixel). Only apply to smaller images
    # to avoid filtering large photos with dark/uniform backgrounds.
    bpp = len(image_data) / area
    if bpp < MAX_LOW_INFO_BPP and area < MAX_LOW_INFO_AREA:
        return False

    return True


def clean_text(text: str) -> str:
    """Clean extracted text."""
    lines = text.split('\n')
    cleaned_lines = []
    prev_empty = False

    for line in lines:
        line = line.rstrip()
        is_empty = len(line.strip()) == 0

        if is_empty:
            if not prev_empty:
                cleaned_lines.append('')
            prev_empty = True
        else:
            cleaned_lines.append(line)
            prev_empty = False

    return '\n'.join(cleaned_lines)


def merge_adjacent_formatting(text: str) -> str:
    """Merge adjacent same-style formatted spans split across PDF tokens.

    PyMuPDF often emits a phrase as several spans, so per-span wrapping in
    ``format_span_text`` produces ``**X****Y**`` (bold) or ``***X******Y***``
    (bold-italic) where one phrase is intended. Collapse the abutting markers
    so the run reads as a single phrase: ``**X Y**`` / ``***X Y***``.

    Italic-italic adjacency (``*X**Y*``) is indistinguishable from a plain
    bold span's open/close pair and is left alone — merging it would corrupt
    every legitimate ``**bold**`` phrase on the page. The previous regexes
    ``\\*\\s*\\*`` and ``\\*\\*\\*\\s*\\*\\*\\*`` did exactly that, deleting
    all bold formatting from the converted Markdown.
    """
    # Bold-italic adjacency first so the inner ``******`` isn't half-eaten
    # by the bold pass.
    text = re.sub(r'\*{6}', ' ', text)
    text = re.sub(r'\*{4}', ' ', text)
    return text


def is_sentence_end(text: str) -> bool:
    """Check if the text ends with sentence-ending punctuation."""
    text = text.rstrip()
    if not text:
        return True
    end_puncts = '.。!！?？:：;；'
    return text[-1] in end_puncts


def should_merge_lines(current: dict, next_line: dict) -> bool:
    """Determine if two lines should be merged into the same paragraph."""
    if current.get("is_heading") or next_line.get("is_heading"):
        return False
    if current.get("is_list") or next_line.get("is_list"):
        return False
    if is_sentence_end(current.get("content", "")):
        return False
    return True


def extract_pdf_to_markdown(pdf_path: str, output_path: str = None, images: str = "filtered") -> str:
    """Extract text, images, and tables from a PDF and convert to Markdown.

    Args:
        pdf_path: Path to the PDF file.
        output_path: Optional output path for the Markdown file.
        images: Image extraction mode.
            "filtered" = apply size/quality filters (default),
            "all"      = extract all images without filtering,
            "none"     = skip all images.
    """
    try:
        doc = fitz.open(pdf_path)
    except Exception as e:
        print(f"[ERROR] Failed to open PDF file: {e}")
        return ""

    if len(doc) >= 200:
        print(f"[HINT] {len(doc)} pages — for very large PDFs, consider splitting "
              f"the source by chapter beforehand (e.g. with pdftk / qpdf / PyPDF2) "
              f"and converting each part individually.")

    filename = Path(pdf_path).stem
    title = re.sub(r'^\d+-', '', filename).strip()

    print(f"[INFO] Analyzing document structure...")
    size_map = analyze_font_sizes(doc)
    print(f"   Font size mapping: body={size_map.get('body', 'N/A')}, " +
          f"H1={size_map.get('h1', 'N/A')}, H2={size_map.get('h2', 'N/A')}, H3={size_map.get('h3', 'N/A')}")

    print(f"[INFO] Detecting repeated headers/footers...")
    noise_texts = detect_headers_footers(doc)
    if noise_texts:
        print(f"   Found {len(noise_texts)} repeated noise texts (will be removed):")
        for t in list(noise_texts)[:3]:
            print(f"     - {t[:30]}...")

    markdown_content = f"# {title}\n\n"
    seen_image_hashes = set()  # Track seen image hashes for deduplication

    img_dir = None
    rel_img_dir = None
    if output_path:
        output_path = Path(output_path)
        rel_img_dir = f"{output_path.stem}_files"
        img_dir = output_path.parent / rel_img_dir

    img_count = 0

    for page_num, page in enumerate(doc, 1):
        if page_num > 1:
            # Add page break marker to help LLM understand context segmentation
            markdown_content += f"\n\n<!-- Page {page_num} -->\n\n"

        try:
            tabs = page.find_tables()
        except Exception:
            tabs = []

        tab_rects = [fitz.Rect(t.bbox) for t in tabs]

        page_elements = []

        for tab in tabs:
            page_elements.append({
                "y0": tab.bbox[1],
                "type": 2,
                "content": tab.to_markdown()
            })
            print(f"  [OK] Found table: P{page_num}")

        blocks = page.get_text("dict")["blocks"]

        for block in blocks:
            block_rect = fitz.Rect(block["bbox"])

            # Check if this is table content
            is_in_table = False
            for tab_rect in tab_rects:
                intersect = block_rect & tab_rect
                if intersect.get_area() > 0.6 * block_rect.get_area():
                    is_in_table = True
                    break

            if is_in_table:
                continue

            if block["type"] == 0:
                # Check if this is noise text to be filtered (whole block match)
                block_text_full = "".join([span["text"] for line in block["lines"] for span in line["spans"]]).strip()
                if block_text_full in noise_texts:
                    continue

                for line in block["lines"]:
                    line_text = ""
                    line_size = 0
                    line_flags = 0
                    span_count = 0
                    is_code_line = False

                    formatted_spans = []
                    for span in line["spans"]:
                        span_text = span["text"]
                        if not span_text.strip():
                            if span_text:
                                formatted_spans.append(span_text)
                            continue

                        span_size = span["size"]
                        span_flags = span["flags"]

                        line_size = max(line_size, span_size)
                        line_flags |= span_flags
                        span_count += 1

                        heading_level = get_heading_level(span_size, size_map, span_text, span_flags)

                        # Detect code font
                        font_name = span.get("font", "")
                        if is_monospace_font(font_name):
                            is_code_line = True
                            formatted_spans.append(span_text)  # No formatting for code
                        elif heading_level > 0:
                            formatted_spans.append(span_text.strip())
                        else:
                            formatted_spans.append(format_span_text(span_text, span_flags))

                    line_text = ''.join(formatted_spans).strip()
                    if not line_text:
                        continue

                    # Secondary check: line-level noise match (sometimes blocks are split)
                    if line_text in noise_texts:
                        continue

                    line_text = merge_adjacent_formatting(line_text)

                    heading_level = get_heading_level(line_size, size_map, line_text, line_flags)

                    is_list, list_type, list_content = detect_list_item(line_text)

                    if heading_level > 0:
                        prefix = '#' * heading_level + ' '
                        clean_line = re.sub(r'\*+([^*]+)\*+', r'\1', line_text)
                        final_text = prefix + clean_line
                    elif is_list:
                        final_text = list_content
                    else:
                        final_text = line_text

                    page_elements.append({
                        "y0": line["bbox"][1],
                        "type": 0,
                        "content": final_text,
                        "is_heading": heading_level > 0,
                        "is_list": is_list,
                        "is_code": is_code_line
                    })

            elif block["type"] == 1:
                if images == "none":
                    pass
                elif images == "all" or should_keep_image(block, page.rect, seen_image_hashes):
                    page_elements.append({
                        "y0": block["bbox"][1],
                        "type": 1,
                        "content": block
                    })
                else:
                    w, h = block.get("width", 0), block.get("height", 0)
                    print(f"  [SKIP] Filtered small/decorative image: {w}x{h}px, {len(block.get('image', b''))} bytes")

        page_elements.sort(key=lambda x: x["y0"])

        # Merge adjacent same-level short headings
        page_elements = merge_adjacent_headings(page_elements)

        merged_elements = []
        i = 0
        while i < len(page_elements):
            el = page_elements[i]
            if el["type"] == 0 and not el.get("is_heading") and not el.get("is_list"):
                merged_content = el["content"]
                j = i + 1
                while j < len(page_elements):
                    next_el = page_elements[j]
                    if next_el["type"] != 0:
                        break
                    if not should_merge_lines({"content": merged_content, "is_heading": False, "is_list": False}, next_el):
                        break
                    merged_content += " " + next_el["content"]
                    j += 1
                merged_elements.append({
                    "type": 0,
                    "content": remove_page_footer(merged_content),
                    "is_heading": False,
                    "is_list": False
                })
                i = j
            else:
                merged_elements.append(el)
                i += 1

        prev_was_list = False
        prev_was_code = False
        code_block_lines = []

        def flush_code_block():
            """Flush accumulated code block."""
            nonlocal code_block_lines, markdown_content
            if code_block_lines:
                markdown_content += "```\n"
                markdown_content += "\n".join(code_block_lines) + "\n"
                markdown_content += "```\n\n"
                code_block_lines = []

        for el in merged_elements:
            if el["type"] == 0:
                is_list = el.get("is_list", False)
                is_heading = el.get("is_heading", False)
                is_code = el.get("is_code", False)

                if is_code:
                    # Accumulate code lines
                    if prev_was_list:
                        markdown_content += "\n"
                        prev_was_list = False
                    code_block_lines.append(el["content"])
                    prev_was_code = True
                else:
                    # Non-code line, flush accumulated code block first
                    if prev_was_code:
                        flush_code_block()
                        prev_was_code = False

                    if is_heading:
                        if prev_was_list:
                            markdown_content += "\n"
                        markdown_content += el["content"] + "\n\n"
                        prev_was_list = False
                    elif is_list:
                        markdown_content += el["content"] + "\n"
                        prev_was_list = True
                    else:
                        if prev_was_list:
                            markdown_content += "\n"
                        markdown_content += el["content"] + "\n\n"
                        prev_was_list = False

            elif el["type"] == 2:
                if prev_was_code:
                    flush_code_block()
                    prev_was_code = False
                if prev_was_list:
                    markdown_content += "\n"
                markdown_content += el["content"] + "\n\n"
                prev_was_list = False

            elif el["type"] == 1:
                if prev_was_code:
                    flush_code_block()
                    prev_was_code = False
                if img_dir:
                    block = el["content"]
                    ext = block["ext"]
                    image_data = block["image"]
                    safe_filename = filename.replace(" ", "_")
                    image_name = f"{safe_filename}_p{page_num}_{img_count}.{ext}"
                    image_path = img_dir / image_name

                    try:
                        img_dir.mkdir(parents=True, exist_ok=True)
                        with open(image_path, "wb") as f:
                            f.write(image_data)

                        if prev_was_list:
                            markdown_content += "\n"
                        markdown_content += f"![{image_name}]({rel_img_dir}/{image_name})\n\n"
                        img_count += 1
                        prev_was_list = False
                        print(f"  [OK] Extracted image: {image_name}")
                    except Exception as e:
                        print(f"  [WARN] Failed to save image: {e}")

        # Flush code block at end of page
        if prev_was_code:
            flush_code_block()

    doc.close()

    markdown_content = re.sub(r'\n{3,}', '\n\n', markdown_content)
    markdown_content = markdown_content.strip() + "\n"

    if output_path:
        os.makedirs(os.path.dirname(output_path) or '.', exist_ok=True)
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(markdown_content)
        print(f"[OK] Saved Markdown to: {output_path}")

    return markdown_content


def process_directory(input_dir: str, output_dir: str | None = None, images: str = "filtered") -> None:
    """Convert all PDFs in a directory to Markdown.

    Args:
        input_dir: Directory containing PDF files.
        output_dir: Optional output directory for Markdown files.
        images: Image extraction mode passed through to each file conversion.
    """
    input_path = Path(input_dir)

    if output_dir:
        output_path = Path(output_dir)
    else:
        output_path = input_path

    pdf_files = sorted(input_path.glob('*.pdf'))

    print(f"Found {len(pdf_files)} PDF files")

    for pdf_file in pdf_files:
        output_file = output_path / (pdf_file.stem + '.md')
        print(f"Processing: {pdf_file.name}")
        extract_pdf_to_markdown(str(pdf_file), str(output_file), images=images)


def main() -> int:
    """Run the CLI entry point."""
    parser = argparse.ArgumentParser(
        description='PDF to Markdown converter (with structure detection and LLM optimization)',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog='''
Examples:
  python pdf_to_md.py book.pdf                    # Convert a single file
  python pdf_to_md.py book.pdf -o output.md      # Specify output file
  python pdf_to_md.py ./pdfs                      # Convert all PDFs in directory
  python pdf_to_md.py ./pdfs -o ./markdown       # Specify output directory

Structure detection features:
  - Auto-detect heading levels (based on font size)
  - Detect bold and italic text
  - Detect ordered and unordered lists
  - Extract tables and convert to Markdown format (with deduplication)
  - [New] Smart detection and removal of repeated page headers/footers
  - [New] Add <!-- Page N --> page break markers to help LLM understanding
'''
    )

    parser.add_argument('input', help='PDF file or directory containing PDFs')
    parser.add_argument('-o', '--output', help='Output file or directory')
    parser.add_argument(
        '--images',
        choices=['all', 'filtered', 'none'],
        default='filtered',
        help='Image extraction mode: filtered=apply size/quality filters (default), all=no filtering, none=skip images',
    )

    args = parser.parse_args()

    input_path = Path(args.input)

    if input_path.is_file():
        output = args.output or str(input_path.with_suffix('.md'))
        extract_pdf_to_markdown(str(input_path), output, images=args.images)
    elif input_path.is_dir():
        process_directory(str(input_path), args.output, images=args.images)
    else:
        print(f"Error: File or directory not found: {args.input}")
        return 1

    return 0


if __name__ == '__main__':
    exit(main())
