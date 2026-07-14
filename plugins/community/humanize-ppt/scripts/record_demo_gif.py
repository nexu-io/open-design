#!/usr/bin/env python3
"""Record a short demo GIF of Humanize PPT's zero-dependency working drafts.

Humanize never renders a deck — so the only things it can honestly record are
its own working drafts: the audience state-transfer map (`preview-outline.html`,
v0.7) and the cover-style gallery picker (`style_gallery.html`, v0.9). This
script builds those artifacts from a sample source, captures a scripted scroll
of each in a headless browser, and stitches the frames into one GIF.

It is dependency-honest: it preflights for Playwright (Python) and ffmpeg and
exits with install guidance rather than half-recording. Run it from the repo
root. The real recording lands at docs/showcase/demo/humanize-ppt-demo.gif.

    python3 scripts/record_demo_gif.py \
      --source examples/01-ai-tool-update/source.md \
      --title "AI 工具更新，不只是功能清单" \
      --out docs/showcase/demo/humanize-ppt-demo.gif

Note on the gallery: its covers are rendered by the downstream skill, not by
Humanize. Pass --covers-dir <dir> to overlay real rendered covers into the
picker before recording; without it the picker records in its honest pending
state (empty frames + captions). Either way, no faked thumbnails.
"""

import argparse
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ENTRY = ROOT / "scripts" / "humanize_ppt.py"
PREVIEW_HTML = ROOT / "scripts" / "preview_outline_html.py"


def _preflight():
    """Return (ok, message). Checks ffmpeg + Playwright (Python) availability."""
    missing = []
    if shutil.which("ffmpeg") is None:
        missing.append("ffmpeg (brew install ffmpeg)")
    try:
        import playwright  # noqa: F401
    except ImportError:
        missing.append("playwright (pip install playwright && python3 -m playwright install chromium)")
    if missing:
        return False, "Missing dependencies:\n  - " + "\n  - ".join(missing)
    return True, "ok"


def _build_artifacts(source, title, workdir):
    """Run brief mode + preview-outline HTML + style-gallery into workdir.

    Returns (preview_outline_html, style_gallery_html) paths.
    """
    run_dir = workdir / "run"
    # Brief mode → slide_plan.json (no render; --no-render keeps it pure).
    subprocess.run(
        [sys.executable, str(ENTRY), "--source", source, "--out", str(run_dir),
         "--title", title, "--renderer", "guizang", "--guizang-style", "A",
         "--guizang-theme", "ink-classic", "--no-render", "--skip-install-check"],
        cwd=ROOT, check=True, capture_output=True,
    )
    # Audience state-transfer map from the slide plan.
    preview_html = run_dir / "preview-outline.html"
    subprocess.run(
        [sys.executable, str(PREVIEW_HTML), "--slide-plan", str(run_dir / "slide_plan.json"),
         "--out", str(preview_html), "--title", title],
        cwd=ROOT, check=True, capture_output=True,
    )
    # Style gallery (the v0.9 gate) → its own out dir so it doesn't clobber.
    gallery_dir = workdir / "gallery"
    subprocess.run(
        [sys.executable, str(ENTRY), "--source", source, "--out", str(gallery_dir),
         "--title", title, "--renderer", "guizang", "--style-gallery",
         "--skip-install-check"],
        cwd=ROOT, check=True, capture_output=True,
    )
    return preview_html, gallery_dir / "style_gallery.html"


def _overlay_covers(gallery_dir, covers_dir):
    """Copy real downstream-rendered covers into the gallery before recording.

    Copies each candidate's whole subdir (cover.html + cover.png + any local
    assets like motion.min.js), so an embedded cover renders fully offline
    rather than relying on a CDN fallback.
    """
    src = Path(covers_dir)
    dst = gallery_dir / "outputs" / "style-gallery"
    if not src.exists():
        return
    for sub in src.iterdir():
        if sub.is_dir():
            shutil.copytree(sub, dst / sub.name, dirs_exist_ok=True)


def _capture(pages, out_gif, frames_per_page, workdir):
    """Capture a scripted scroll of each page and stitch a GIF via ffmpeg."""
    from playwright.sync_api import sync_playwright

    frames_dir = workdir / "frames"
    frames_dir.mkdir(parents=True, exist_ok=True)
    idx = 0
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1280, "height": 800})
        for html_path in pages:
            page.goto(html_path.as_uri())
            page.wait_for_timeout(1800)  # let WebGL covers paint (>=1.5s, see qa-failure-modes)
            height = page.evaluate("document.body.scrollHeight")
            for f in range(frames_per_page):
                y = int(height * f / max(1, frames_per_page - 1))
                page.evaluate(f"window.scrollTo(0, {y})")
                page.wait_for_timeout(120)
                page.screenshot(path=str(frames_dir / f"frame-{idx:04d}.png"))
                idx += 1
        browser.close()

    out_gif = Path(out_gif)
    out_gif.parent.mkdir(parents=True, exist_ok=True)
    palette = workdir / "palette.png"
    subprocess.run(
        ["ffmpeg", "-y", "-framerate", "8", "-i", str(frames_dir / "frame-%04d.png"),
         "-vf", "scale=900:-1:flags=lanczos,palettegen", str(palette)],
        check=True, capture_output=True,
    )
    subprocess.run(
        ["ffmpeg", "-y", "-framerate", "8", "-i", str(frames_dir / "frame-%04d.png"),
         "-i", str(palette), "-lavfi", "scale=900:-1:flags=lanczos[x];[x][1:v]paletteuse",
         "-loop", "0", str(out_gif)],
        check=True, capture_output=True,
    )
    return out_gif


def main(argv=None):
    ap = argparse.ArgumentParser(description="Record a Humanize PPT working-draft demo GIF.")
    ap.add_argument("--source", default="examples/01-ai-tool-update/source.md")
    ap.add_argument("--title", default="AI 工具更新，不只是功能清单")
    ap.add_argument("--out", default="docs/showcase/demo/humanize-ppt-demo.gif")
    ap.add_argument("--covers-dir", default=None,
                    help="Optional dir of downstream-rendered covers to overlay (<id>/cover.{html,png}).")
    ap.add_argument("--frames-per-page", type=int, default=10)
    args = ap.parse_args(argv)

    ok, message = _preflight()
    if not ok:
        sys.stderr.write(message + "\n")
        sys.stderr.write("Install the above, then re-run. (Real recording is intentionally a separate step.)\n")
        return 2

    with tempfile.TemporaryDirectory(prefix="humanize-demo-") as tmp:
        workdir = Path(tmp)
        preview_html, gallery_html = _build_artifacts(args.source, args.title, workdir)
        if args.covers_dir:
            _overlay_covers(gallery_html.parent, args.covers_dir)
        out_gif = _capture([gallery_html, preview_html], args.out, args.frames_per_page, workdir)

    print(f"wrote {out_gif} ({out_gif.stat().st_size // 1024} KB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
