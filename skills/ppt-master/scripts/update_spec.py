#!/usr/bin/env python3
"""Propagate a spec_lock.md value change to both the lock file and svg_output/*.svg.

Examples:
    python3 update_spec.py <project_path> primary=#0066AA
    python3 update_spec.py <project_path> colors.text=#111111
    python3 update_spec.py <project_path> typography.font_family='"PingFang SC", "Microsoft YaHei", sans-serif'

v2 scope:
- `colors.*` — HEX value replacement across svg_output/*.svg (case-insensitive match).
- `typography.font_family` — replaces the inner value of every `font-family="..."`
  / `font-family='...'` attribute in svg_output/*.svg. This is a global replace:
  every text element becomes the new family, regardless of role.

Bare `key=value` (no dot) is treated as `colors.key=value` for backward compat.

Other keys (typography sizes, per-role `typography.*_family` overrides, icons,
images, canvas, forbidden) are intentionally NOT supported — they involve
attribute-scoped or semantic replacements whose risk/benefit does not warrant
bulk propagation. For per-role family changes, edit spec_lock.md and re-author
the affected pages.
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

HEX_RE = re.compile(r"^#(?:[0-9A-Fa-f]{3,4}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$")
FONT_FAMILY_RE = re.compile(r"""(font-family\s*=\s*)(["'])(.*?)\2""")


def parse_lock(lock_path: Path) -> dict[str, dict[str, str]]:
    """Return {section_name: {key: value}} parsed from spec_lock.md.

    The format is:
        ## section
        - key: value
    """
    sections: dict[str, dict[str, str]] = {}
    current: str | None = None
    for raw in lock_path.read_text(encoding="utf-8").splitlines():
        line = raw.rstrip()
        if line.startswith("## "):
            current = line[3:].strip()
            sections.setdefault(current, {})
            continue
        if current is None:
            continue
        m = re.match(r"^-\s+([A-Za-z0-9_]+)\s*:\s*(.+?)\s*$", line)
        if m:
            sections[current][m.group(1)] = m.group(2)
    return sections


def rewrite_lock(lock_path: Path, section: str, key: str, new_value: str) -> None:
    """Rewrite the single `- key: old_value` line under `## section`."""
    lines = lock_path.read_text(encoding="utf-8").splitlines(keepends=True)
    in_section = False
    for i, raw in enumerate(lines):
        stripped = raw.rstrip("\n")
        if stripped.startswith("## "):
            in_section = stripped[3:].strip() == section
            continue
        if not in_section:
            continue
        m = re.match(r"^(-\s+)([A-Za-z0-9_]+)(\s*:\s*)(.+?)(\s*)$", stripped)
        if m and m.group(2) == key:
            lines[i] = f"{m.group(1)}{m.group(2)}{m.group(3)}{new_value}{m.group(5)}\n"
            lock_path.write_text("".join(lines), encoding="utf-8")
            return
    raise KeyError(f"key {key!r} not found under section {section!r} in {lock_path}")


def replace_color_in_svgs(
    svg_dir: Path, old_hex: str, new_hex: str, *, dry_run: bool = False
) -> list[tuple[Path, int]]:
    """Replace old_hex with new_hex in every .svg under svg_dir.

    Returns a list of (path, replacement_count) for each changed file. The
    count comes straight from re.subn so callers can spot anomalies —
    e.g. one file with 50 hits when the rest have 4-8 is likely a stray
    HEX literal inside <text> content rather than a styling attribute.

    Two-phase: plan all file updates in memory, then write to disk. If any
    exception is raised during planning (e.g. bad HEX, read failure), no files
    are touched. This keeps svg_output/ and the caller's spec_lock.md write
    in a consistent pair: either everything is applied or nothing is.

    When dry_run=True, the planning phase still runs (so bad HEX still raises
    and callers see which files would change), but no disk writes happen. The
    returned list describes the would-change files.
    """
    if not HEX_RE.match(old_hex) or not HEX_RE.match(new_hex):
        raise ValueError(f"not a HEX color: old={old_hex!r} new={new_hex!r}")
    pattern = re.compile(re.escape(old_hex), re.IGNORECASE)
    planned: list[tuple[Path, str, int]] = []
    for svg in sorted(svg_dir.glob("*.svg")):
        text = svg.read_text(encoding="utf-8")
        new_text, n = pattern.subn(new_hex, text)
        if n > 0:
            planned.append((svg, new_text, n))
    if not dry_run:
        for svg, new_text, _ in planned:
            svg.write_text(new_text, encoding="utf-8")
    return [(p, n) for p, _, n in planned]


def replace_font_family_in_svgs(
    svg_dir: Path, new_value: str, *, dry_run: bool = False
) -> list[tuple[Path, int]]:
    """Replace the inner value of every `font-family="..."` / `font-family='...'`
    attribute in every .svg under svg_dir.

    Returns a list of (path, replacement_count) for each changed file.

    Preserves the outer quote character when possible; if the new value contains
    that same quote type, switches the outer quote to the other kind.

    Two-phase: plan all file updates in memory, then write to disk. The inner
    `_sub` may raise ValueError when the new value contains both quote kinds —
    when that happens in the planning phase, no files have been touched yet.

    When dry_run=True, the planning phase still runs (so the ValueError still
    fires and callers see which files would change), but no disk writes happen.
    The returned list describes the would-change files.
    """
    def _sub(m: re.Match[str]) -> str:
        prefix, quote, _inner = m.group(1), m.group(2), m.group(3)
        outer = quote
        if outer in new_value:
            outer = "'" if quote == '"' else '"'
            if outer in new_value:
                raise ValueError(
                    f"new font_family value contains both ' and \" — cannot embed: {new_value!r}"
                )
        return f"{prefix}{outer}{new_value}{outer}"

    planned: list[tuple[Path, str, int]] = []
    for svg in sorted(svg_dir.glob("*.svg")):
        text = svg.read_text(encoding="utf-8")
        new_text, n = FONT_FAMILY_RE.subn(_sub, text)
        if n > 0 and new_text != text:
            planned.append((svg, new_text, n))
    if not dry_run:
        for svg, new_text, _ in planned:
            svg.write_text(new_text, encoding="utf-8")
    return [(p, n) for p, _, n in planned]


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("project_path", type=Path, help="project folder containing spec_lock.md and svg_output/")
    ap.add_argument(
        "assignment",
        help="section.key=value (e.g. colors.primary=#0066AA, typography.font_family='\"Inter\", Arial, sans-serif'). "
        "Bare key=value is treated as colors.key=value.",
    )
    ap.add_argument(
        "--dry-run",
        "-n",
        action="store_true",
        help="preview which SVGs would change; do not write anything to disk.",
    )
    args = ap.parse_args()

    project = args.project_path.resolve()
    lock = project / "spec_lock.md"
    svg_dir = project / "svg_output"

    if not lock.exists():
        print(f"error: spec_lock.md not found at {lock}", file=sys.stderr)
        return 2
    if not svg_dir.exists():
        print(f"error: svg_output/ not found at {svg_dir}", file=sys.stderr)
        return 2

    if "=" not in args.assignment:
        print("error: assignment must be [section.]key=value", file=sys.stderr)
        return 2
    lhs, new_value = args.assignment.split("=", 1)
    lhs = lhs.strip()
    new_value = new_value.strip()
    if "." in lhs:
        section, key = lhs.split(".", 1)
        section = section.strip()
        key = key.strip()
    else:
        section, key = "colors", lhs

    sections = parse_lock(lock)
    section_map = sections.get(section, {})
    if key not in section_map:
        known = {s: sorted(v) for s, v in sections.items()}
        print(
            f"error: {key!r} not found under `## {section}` in spec_lock.md.\n"
            f"known keys: {known}",
            file=sys.stderr,
        )
        return 2

    old_value = section_map[key]

    if section == "colors":
        if not HEX_RE.match(new_value):
            print(f"error: new value for colors.{key} must be a HEX color (got {new_value!r})", file=sys.stderr)
            return 2
        if old_value == new_value:
            print(f"no change: colors.{key} already = {new_value}")
            return 0
        # SVGs first (may raise on bad HEX), then lock. Writing lock last
        # avoids a state where lock claims new_value but SVGs still hold
        # old_value — that state silences re-runs (parse_lock would then
        # see new_value == old_value and exit early).
        changed = replace_color_in_svgs(svg_dir, old_value, new_value, dry_run=args.dry_run)
        if not args.dry_run:
            rewrite_lock(lock, "colors", key, new_value)
    elif section == "typography" and key == "font_family":
        if old_value == new_value:
            print(f"no change: typography.font_family already = {new_value}")
            return 0
        try:
            changed = replace_font_family_in_svgs(svg_dir, new_value, dry_run=args.dry_run)
        except ValueError as e:
            print(f"error: {e}", file=sys.stderr)
            return 2
        if not args.dry_run:
            rewrite_lock(lock, "typography", key, new_value)
    else:
        print(
            f"error: {section}.{key} is not supported by update_spec.py.\n"
            f"v2 supports: colors.* (HEX), typography.font_family.\n"
            f"Edit spec_lock.md and the affected SVGs by hand for other changes.",
            file=sys.stderr,
        )
        return 2

    if args.dry_run:
        print(f"[dry-run] spec_lock.md: {section}.{key}  {old_value} → {new_value}")
        print(f"[dry-run] svg_output/:  {len(changed)} file(s) would be updated")
    else:
        print(f"spec_lock.md: {section}.{key}  {old_value} → {new_value}")
        print(f"svg_output/:  {len(changed)} file(s) updated")
    for p, n in changed:
        suffix = "replacement" if n == 1 else "replacements"
        print(f"  - {p.name} ({n} {suffix})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
