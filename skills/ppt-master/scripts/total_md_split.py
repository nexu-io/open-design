#!/usr/bin/env python3
"""
PPT Master - Speaker Notes Splitting Tool

Splits the total.md speaker notes file into multiple individual notes files,
each corresponding to one SVG page.

Usage:
    python3 scripts/total_md_split.py <project_path>
    python3 scripts/total_md_split.py <project_path> -o output_dir

Examples:
    python3 scripts/total_md_split.py projects/<svg_title>_ppt169_YYYYMMDD
    python3 scripts/total_md_split.py projects/<svg_title>_ppt169_YYYYMMDD -o notes

Dependencies:
    None (only uses standard library)

Notes:
    - Checks the one-to-one mapping between SVG files and speaker notes
    - Outputs a notice if any SVG file has no corresponding notes
    - Split documents do not include the level-1 heading
    - Split document names match the SVG filenames with .md extension
"""

import sys
import argparse
import re
from pathlib import Path

HEADING_RE = re.compile(r'^(#{1,6})\s*(.+?)\s*$')
HR_RE = re.compile(r'^\s*[-*]{3,}\s*$')


def normalize_title(title: str) -> str:
    """Normalize titles for fuzzy matching with SVG stems."""
    if not title:
        return ''
    text = title.strip()
    # Replace any non-alnum / non-CJK run with underscore
    text = re.sub(r'[^0-9A-Za-z\u4e00-\u9fff]+', '_', text)
    text = re.sub(r'_+', '_', text).strip('_')
    return text.lower()




def extract_leading_number(text: str) -> int | None:
    """Extract leading slide number if present."""
    if not text:
        return None

    # Try 1: Start with digits (standard)
    m = re.match(r'^(\d{1,3})', text.strip())
    if m:
        return int(m.group(1))

    # Try 2: Common prefixes (Slide X, Page X, 第X页)
    # Case insensitive for English
    text_lower = text.lower().strip()

    # Slide/Page X
    m = re.match(r'^(?:slide|page|p)\s*[-_:]?\s*(\d{1,3})', text_lower)
    if m:
        return int(m.group(1))

    # 第X页/张
    m = re.match(r'^第\s*(\d{1,3})\s*[页张]', text_lower)
    if m:
        return int(m.group(1))

    return None


def build_match_maps(svg_stems: list[str]) -> tuple[set[str], dict[str, list[str]], dict[int, list[str]]]:
    """Build exact, normalized, and numeric maps for SVG stem matching."""
    exact = set(svg_stems)
    norm_map: dict[str, list[str]] = {}
    num_map: dict[int, list[str]] = {}
    for stem in svg_stems:
        norm = normalize_title(stem)
        if norm:
            norm_map.setdefault(norm, []).append(stem)
        num = extract_leading_number(stem)
        if num is not None:
            num_map.setdefault(num, []).append(stem)
    return exact, norm_map, num_map


def match_title(
    raw_title: str,
    exact: set[str],
    norm_map: dict[str, list[str]],
    num_map: dict[int, list[str]],
    svg_stems: list[str] | None = None,
) -> str | None:
    """Match a note heading to its corresponding SVG stem."""
    if raw_title in exact:
        return raw_title
    norm = normalize_title(raw_title)
    if norm in norm_map and len(norm_map[norm]) == 1:
        return norm_map[norm][0]
    num = extract_leading_number(raw_title)
    if num is not None and num in num_map and len(num_map[num]) == 1:
        return num_map[num][0]
    if norm and svg_stems:
        candidates = [s for s in svg_stems if norm in normalize_title(s)]
        if len(candidates) == 1:
            return candidates[0]
    return None


def find_svg_files(project_path: Path) -> list[Path]:
    """
    Find SVG files in the project

    Args:
        project_path: Project directory path

    Returns:
        List of SVG files (sorted by filename)
    """
    svg_dir = project_path / 'svg_output'

    if not svg_dir.exists():
        print(f"Error: {svg_dir} directory does not exist")
        return []

    return sorted(svg_dir.glob('*.svg'))


def parse_total_md(
    md_path: Path,
    svg_stems: list[str] | None = None,
    verbose: bool = True,
) -> dict[str, str]:
    """
    Parse total.md file and extract speaker notes content for each level-1 heading

    Args:
        md_path: Path to total.md file

    Returns:
        Dictionary where key is the level-1 heading (without #) and value is the notes content
    """
    if not md_path.exists():
        print(f"Error: {md_path} file does not exist")
        return {}

    try:
        with open(md_path, 'r', encoding='utf-8') as f:
            content = f.read()
    except Exception as e:
        print(f"Error: Unable to read file {md_path}: {e}")
        return {}

    svg_stems = svg_stems or []
    exact, norm_map, num_map = build_match_maps(svg_stems)

    # Parse by headings (supports # / ## / ###)
    notes: dict[str, str] = {}
    current_key: str | None = None
    current_lines: list[str] = []
    unmatched_headings: list[str] = []

    lines = content.splitlines()
    for line in lines:
        m = HEADING_RE.match(line)
        if m:
            raw_title = m.group(2).strip()
            matched = match_title(raw_title, exact, norm_map, num_map, svg_stems)
            if matched:
                if current_key is not None:
                    text = '\n'.join(current_lines).strip()
                    if current_key in notes and text:
                        notes[current_key] = (notes[current_key].rstrip() + "\n\n" + text).strip()
                    elif current_key not in notes:
                        notes[current_key] = text
                current_key = matched
                current_lines = []
                continue
            unmatched_headings.append(raw_title)

        if HR_RE.match(line):
            continue
        if current_key is not None:
            current_lines.append(line)

    if current_key is not None:
        text = '\n'.join(current_lines).strip()
        if current_key in notes and text:
            notes[current_key] = (notes[current_key].rstrip() + "\n\n" + text).strip()
        elif current_key not in notes:
            notes[current_key] = text

    if verbose and unmatched_headings:
        print("\n[Notice] Found unmatched headings (ignored):")
        for t in unmatched_headings[:10]:
            print(f"  - {t}")
        if len(unmatched_headings) > 10:
            print(f"  ... and {len(unmatched_headings) - 10} more")

    return notes


def check_svg_note_mapping(svg_files: list[Path], notes: dict[str, str]) -> tuple[bool, list[str]]:
    """
    Check the mapping between SVG files and speaker notes

    Args:
        svg_files: List of SVG files
        notes: Notes dictionary (key is heading)

    Returns:
        (whether all matched, list of missing notes headings)
    """
    missing_notes = []

    for svg_path in svg_files:
        # Extract SVG filename (without extension)
        svg_stem = svg_path.stem

        # Check if a corresponding heading exists in the notes
        if svg_stem not in notes:
            missing_notes.append(svg_stem)

    return len(missing_notes) == 0, missing_notes


def split_notes(notes: dict[str, str], output_dir: Path, verbose: bool = True) -> bool:
    """
    Split and save notes dictionary into multiple files

    Args:
        notes: Notes dictionary (key is heading, value is content)
        output_dir: Output directory
        verbose: Whether to output detailed information

    Returns:
        Whether successful
    """
    if not notes:
        print("Error: No notes content found")
        return False

    output_dir.mkdir(parents=True, exist_ok=True)

    success_count = 0

    for title, content in notes.items():
        # Generate output filename (same name as SVG file, with .md extension)
        output_path = output_dir / f"{title}.md"

        try:
            with open(output_path, 'w', encoding='utf-8') as f:
                f.write(content)

            if verbose:
                print(f"  Generated: {output_path.name}")

            success_count += 1

        except Exception as e:
            if verbose:
                print(f"  Error: Unable to write file {output_path}: {e}")

    if verbose:
        print(f"\n[Done] Successfully generated {success_count}/{len(notes)} file(s)")

    return success_count == len(notes)


def main() -> None:
    """Run the CLI entry point."""
    parser = argparse.ArgumentParser(
        description='PPT Master - Speaker Notes Splitting Tool',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog='''
Examples:
    %(prog)s projects/<svg_title>_ppt169_YYYYMMDD
    %(prog)s projects/<svg_title>_ppt169_YYYYMMDD -o notes
    %(prog)s projects/<svg_title>_ppt169_YYYYMMDD -q

Features:
    - Reads the total.md speaker notes file
    - Checks the mapping between SVG files and notes
    - Splits notes into multiple individual files
    - Output filenames match SVG filenames
'''
    )

    parser.add_argument('project_path', type=str, help='Project directory path')
    parser.add_argument('-o', '--output', type=str, default=None, help='Output directory path (default: notes directory under project)')
    parser.add_argument('-q', '--quiet', action='store_true', help='Quiet mode')

    args = parser.parse_args()

    project_path = Path(args.project_path)
    if not project_path.exists():
        print(f"Error: Path does not exist: {project_path}")
        sys.exit(1)

    # Determine output directory
    if args.output:
        output_dir = Path(args.output)
    else:
        output_dir = project_path / 'notes'

    verbose = not args.quiet

    if verbose:
        print("PPT Master - Speaker Notes Splitting Tool")
        print("=" * 50)
        print(f"  Project path: {project_path}")
        print(f"  Output directory: {output_dir}")
        print()

    # Find SVG files
    svg_files = find_svg_files(project_path)

    if not svg_files:
        print("Error: No SVG files found")
        sys.exit(1)

    if verbose:
        print(f"  Found {len(svg_files)} SVG file(s)")

    # Parse total.md
    total_md_path = project_path / 'notes' / 'total.md'
    svg_stems = [p.stem for p in svg_files]
    notes = parse_total_md(total_md_path, svg_stems, verbose)

    if not notes:
        print("Error: No notes content found")
        sys.exit(1)

    if verbose:
        print(f"  Found {len(notes)} notes section(s)")
        print()

    # Check mapping
    all_match, missing_notes = check_svg_note_mapping(svg_files, notes)

    if not all_match:
        print("Error: SVG files and notes do not match")
        print(f"  Missing notes: {', '.join(missing_notes)}")
        print("\nPlease regenerate the notes file to ensure every SVG has corresponding notes.")
        sys.exit(1)

    if verbose:
        print("[OK] SVG files and notes have one-to-one correspondence")
        print()

    # Split notes
    success = split_notes(notes, output_dir, verbose)

    if success:
        if verbose:
            print(f"\n[Done] Notes splitting complete")
        sys.exit(0)
    else:
        print(f"\n[Failed] Notes splitting failed")
        sys.exit(1)


if __name__ == '__main__':
    main()
