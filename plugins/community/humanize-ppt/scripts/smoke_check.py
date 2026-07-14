#!/usr/bin/env python3
"""No-dependency smoke check for the stable Humanize PPT entrypoint."""

import argparse
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE = ROOT / "examples" / "01-ai-tool-update" / "source.md"
DEFAULT_OUT = Path("/tmp/humanize-ppt-smoke")
DEFAULT_TITLE = "AI 工具更新，不只是功能清单"
REQUIRED_FILES = [
    "deck_brief.md",
    "ast_outline.md",
    "slide_plan.json",
    "router_plan.json",
    "run_manifest.json",
    "outputs/qa/qa_report.md",
]
# v0.6.4: Guizang path now writes a production brief, not a fake HTML deck.
GUIZANG_BRIEF_FILE = "guizang-production-prompt.md"
NO_FAKE_GUIZANG_HTML = "outputs/guizang/index.html"


def parse_args():
    parser = argparse.ArgumentParser(description="Run a no-dependency Humanize PPT smoke check.")
    parser.add_argument("--source", default=str(DEFAULT_SOURCE), help="Source markdown file to use for the smoke run.")
    parser.add_argument("--out", default=str(DEFAULT_OUT), help="Output directory. It will be replaced by the smoke run.")
    parser.add_argument("--title", default=DEFAULT_TITLE, help="Deck title for the smoke run.")
    return parser.parse_args()


def main():
    args = parse_args()
    out = Path(args.out).expanduser().resolve()
    entrypoint = ROOT / "scripts" / "humanize_ppt.py"
    command = [
        sys.executable,
        str(entrypoint),
        "--source",
        str(Path(args.source).expanduser()),
        "--out",
        str(out),
        "--title",
        args.title,
        "--renderer",
        "guizang",
        # v0.6.4: --no-render now also skips the production brief.
        # Smoke must exercise the brief-only path.
    ]
    result = subprocess.run(command, cwd=ROOT, text=True, capture_output=True)
    if result.returncode != 0:
        print(result.stdout, end="")
        print(result.stderr, end="", file=sys.stderr)
        return result.returncode

    missing = [relative for relative in REQUIRED_FILES if not (out / relative).exists()]
    if missing:
        print("smoke check failed: missing required files", file=sys.stderr)
        for relative in missing:
            print(f"- {relative}", file=sys.stderr)
        return 1

    # v0.6.4: brief-only contract — prompt file present, no fake Guizang HTML.
    if not (out / GUIZANG_BRIEF_FILE).exists():
        print(f"smoke check failed: missing {GUIZANG_BRIEF_FILE}", file=sys.stderr)
        return 1
    if (out / NO_FAKE_GUIZANG_HTML).exists():
        print(
            f"smoke check failed: {NO_FAKE_GUIZANG_HTML} should not be produced in v0.6.4",
            file=sys.stderr,
        )
        return 1

    print(f"smoke check passed: {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
