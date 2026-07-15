#!/usr/bin/env python3
"""No-dependency smoke check for the stable Humanize PPT entrypoint."""

import argparse
import subprocess
import sys
import tempfile
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

# v1.1.1: marketplace packages ship without examples/. If DEFAULT_SOURCE is
# missing, fall back to this minimal inline fixture instead of failing with
# file-not-found — the smoke check should still exercise the brief-only path.
INLINE_FIXTURE_MARKDOWN = """# AI 工具更新，不只是功能清单

## 更新不是罗列功能

新版本发布时,大多数团队做的是穷举 changelog。但用户真正想知道的是:这个更新
改变了我的工作方式吗?

## 从功能到叙事

把每条更新翻译成"它解决了什么问题""它替代了哪个旧流程"，比一份功能列表更
容易被记住,也更容易被转发。

## 收束

一次好的更新说明,最后要留下一句用户能复述给同事听的话。
"""


def parse_args():
    parser = argparse.ArgumentParser(description="Run a no-dependency Humanize PPT smoke check.")
    parser.add_argument("--source", default=None, help="Source markdown file to use for the smoke run. Defaults to the packaged example, falling back to an inline fixture if that is not present.")
    parser.add_argument("--out", default=str(DEFAULT_OUT), help="Output directory. It will be replaced by the smoke run.")
    parser.add_argument("--title", default=DEFAULT_TITLE, help="Deck title for the smoke run.")
    return parser.parse_args()


def main():
    args = parse_args()
    out = Path(args.out).expanduser().resolve()
    entrypoint = ROOT / "scripts" / "humanize_ppt.py"

    fallback_dir = None
    if args.source:
        source_path = Path(args.source).expanduser()
    elif DEFAULT_SOURCE.exists():
        source_path = DEFAULT_SOURCE
    else:
        # Packaged/marketplace install without examples/: generate a
        # throwaway fixture instead of failing with file-not-found.
        fallback_dir = tempfile.TemporaryDirectory(prefix="humanize-ppt-smoke-fixture-")
        source_path = Path(fallback_dir.name) / "source.md"
        source_path.write_text(INLINE_FIXTURE_MARKDOWN, encoding="utf-8")
        print(f"smoke check: examples/ not found, using inline fixture at {source_path}")

    command = [
        sys.executable,
        str(entrypoint),
        "--source",
        str(source_path),
        "--out",
        str(out),
        "--title",
        args.title,
        "--renderer",
        "guizang",
        # v0.6.4: --no-render now also skips the production brief.
        # Smoke must exercise the brief-only path.
    ]
    try:
        result = subprocess.run(command, cwd=ROOT, text=True, capture_output=True)
    finally:
        if fallback_dir is not None:
            fallback_dir.cleanup()
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
