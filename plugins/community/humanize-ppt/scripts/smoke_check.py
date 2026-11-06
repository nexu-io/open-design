#!/usr/bin/env python3
"""No-dependency smoke check for the stable Humanize PPT entrypoint."""

import argparse
import shutil
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

# v1.1.2: the public entrypoints that must each propagate a non-zero exit
# code for a rejected request. humanize_ppt.py is the stable recommended
# entrypoint; _v2 is the shared implementation; _v3/_v4/_v5 are thin
# compatibility shims around it. v1 is an independent legacy implementation
# and is intentionally not part of this matrix.
ENTRYPOINTS = [
    "humanize_ppt.py",
    "humanize_ppt_v2.py",
    "humanize_ppt_v3.py",
    "humanize_ppt_v4.py",
    "humanize_ppt_v5.py",
]

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


def resolve_source(explicit):
    """Resolve which source markdown file a smoke run should read.

    Returns (source_path, cleanup) where cleanup is a TemporaryDirectory to
    .cleanup() when done, or None if nothing needs cleaning up.
    """
    if explicit:
        return Path(explicit).expanduser(), None
    if DEFAULT_SOURCE.exists():
        return DEFAULT_SOURCE, None
    # Packaged/marketplace install without examples/: generate a throwaway
    # fixture instead of failing with file-not-found.
    fallback_dir = tempfile.TemporaryDirectory(prefix="humanize-ppt-smoke-fixture-")
    source_path = Path(fallback_dir.name) / "source.md"
    source_path.write_text(INLINE_FIXTURE_MARKDOWN, encoding="utf-8")
    print(f"smoke check: examples/ not found, using inline fixture at {source_path}")
    return source_path, fallback_dir


def run_stable_entrypoint_check(args):
    """Original smoke check: one full brief-mode run through the stable
    scripts/humanize_ppt.py entrypoint, asserting the output contract."""
    out = Path(args.out).expanduser().resolve()
    entrypoint = ROOT / "scripts" / "humanize_ppt.py"

    source_path, fallback_dir = resolve_source(args.source)

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


def run_outline_gate_check(title):
    """v1.1.2 follow-up (PR #5655 review): drive --preview-outline ->
    --confirm-outline -> brief mode against the SAME --out directory and
    assert the final brief write succeeds instead of being refused by the
    out-dir guard. Before the Fix 1 out-dir guard fix, ensure_clean_out_dir
    did not recognize outline-preview.md / preview-confirmed.json as
    Humanize markers, so this third step used to exit 2.

    Also re-asserts the pre-existing negative path: brief mode must still
    refuse a non-empty --out that holds an unrelated file and no Humanize
    marker, leaving that file untouched.
    """
    entrypoint = ROOT / "scripts" / "humanize_ppt.py"

    out = Path("/tmp/humanize-ppt-smoke-outline-gate").expanduser().resolve()
    if out.exists():
        shutil.rmtree(out)

    source_path, fallback_dir = resolve_source(None)
    base_command = [
        sys.executable,
        str(entrypoint),
        "--source",
        str(source_path),
        "--out",
        str(out),
        "--title",
        title,
        "--renderer",
        "guizang",
    ]
    try:
        preview_result = subprocess.run(base_command + ["--preview-outline"], cwd=ROOT, text=True, capture_output=True)
        if preview_result.returncode != 0:
            print(preview_result.stdout, end="")
            print(preview_result.stderr, end="", file=sys.stderr)
            print("smoke check failed: --preview-outline step did not exit 0", file=sys.stderr)
            return 1
        if not (out / "outline-preview.md").exists():
            print("smoke check failed: --preview-outline did not write outline-preview.md", file=sys.stderr)
            return 1

        confirm_result = subprocess.run(base_command + ["--confirm-outline"], cwd=ROOT, text=True, capture_output=True)
        if confirm_result.returncode != 0:
            print(confirm_result.stdout, end="")
            print(confirm_result.stderr, end="", file=sys.stderr)
            print("smoke check failed: --confirm-outline step did not exit 0", file=sys.stderr)
            return 1
        if not (out / "preview-confirmed.json").exists():
            print("smoke check failed: --confirm-outline did not write preview-confirmed.json", file=sys.stderr)
            return 1

        # Step 3: re-run WITHOUT --preview-outline/--confirm-outline to write
        # the production brief into the SAME --out (now carrying only the
        # outline-gate markers).
        brief_result = subprocess.run(base_command, cwd=ROOT, text=True, capture_output=True)
        if brief_result.returncode != 0:
            print(brief_result.stdout, end="")
            print(brief_result.stderr, end="", file=sys.stderr)
            print(
                "smoke check failed: brief mode refused a --out dir carrying only the "
                "outline-preview/confirm markers (out-dir guard regression)",
                file=sys.stderr,
            )
            return 1
        if not (out / "run_manifest.json").exists():
            print("smoke check failed: brief mode did not write run_manifest.json after the outline gate", file=sys.stderr)
            return 1
    finally:
        if fallback_dir is not None:
            fallback_dir.cleanup()

    guard_out = Path("/tmp/humanize-ppt-smoke-outline-gate-guard").expanduser().resolve()
    if guard_out.exists():
        shutil.rmtree(guard_out)
    guard_out.mkdir(parents=True, exist_ok=True)
    precious = guard_out / "precious.txt"
    precious.write_text("do not delete me\n", encoding="utf-8")

    source_path2, fallback_dir2 = resolve_source(None)
    try:
        guard_command = [
            sys.executable,
            str(entrypoint),
            "--source",
            str(source_path2),
            "--out",
            str(guard_out),
            "--title",
            title,
            "--renderer",
            "guizang",
        ]
        guard_result = subprocess.run(guard_command, cwd=ROOT, text=True, capture_output=True)
    finally:
        if fallback_dir2 is not None:
            fallback_dir2.cleanup()
    if guard_result.returncode != 2:
        print(
            f"smoke check failed: brief mode against an unrelated non-empty --out should exit 2, got {guard_result.returncode}",
            file=sys.stderr,
        )
        return 1
    if not precious.exists():
        print(
            "smoke check failed: brief mode deleted precious.txt from an unrelated --out it should have refused",
            file=sys.stderr,
        )
        return 1

    print(f"smoke check passed: outline gate (preview -> confirm -> brief) at {out}; unrelated-out-dir guard held at {guard_out}")
    return 0


def run_exit_code_matrix():
    """v1.1.2 follow-up (PR #5655 review): assert every public entrypoint
    (stable + v2..v5 compatibility shims) propagates a non-zero exit code
    for a known-bad invocation. Guards against the v3/v4/v5 exit-code
    regression: those shims used to call bare `main()` (no sys.exit), which
    discarded main()'s returned int and always exited 0 even when main()
    rejected the request.
    """
    out_root = Path(tempfile.mkdtemp(prefix="humanize-ppt-smoke-exitcode-"))
    failures = []
    for name in ENTRYPOINTS:
        script = ROOT / "scripts" / name
        # --out satisfies argparse's only required=True flag. Omitting
        # --title/--source fails main()'s own validation, which `return`s 2
        # rather than raising SystemExit — exactly the case a bare `main()`
        # call swallows.
        command = [sys.executable, str(script), "--out", str(out_root / name)]
        result = subprocess.run(command, cwd=ROOT, text=True, capture_output=True)
        if result.returncode == 0:
            failures.append(f"{name}: expected non-zero exit for a known-bad invocation (missing --title/--source), got 0")

    if failures:
        print("smoke check failed: exit-code matrix", file=sys.stderr)
        for failure in failures:
            print(f"- {failure}", file=sys.stderr)
        return 1

    print(f"smoke check passed: exit-code matrix ({', '.join(ENTRYPOINTS)})")
    return 0


def main():
    args = parse_args()

    exit_code = run_stable_entrypoint_check(args)
    if exit_code != 0:
        return exit_code

    exit_code = run_outline_gate_check(args.title)
    if exit_code != 0:
        return exit_code

    return run_exit_code_matrix()


if __name__ == "__main__":
    raise SystemExit(main())
