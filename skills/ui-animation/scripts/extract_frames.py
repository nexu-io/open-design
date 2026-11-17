#!/usr/bin/env python3
"""Extract frames from a screen recording and build a contact sheet.

Run:
    python3 scripts/extract_frames.py <video> <outdir> [--fps N] [--cols C]
                                      [--start SECONDS] [--duration SECONDS]

On a multi-second recording, trim to just the transition with --start/--duration;
extracting the whole clip floods the contact sheet and dilutes tracking.

Produces:
    <outdir>/frame_0001.png ...      zero-padded, one per sampled frame
    <outdir>/contact_sheet.png       montage of every frame, left-to-right top-to-bottom

The contact sheet lets one vision read cover the whole timeline. Open it first,
then drill into individual frames only where the motion is interesting.

Only ffmpeg is required for this script. Tracking/fitting need extra packages.
"""

import argparse
import os
import shutil
import subprocess
import sys

# UI transitions of interest are usually 0.3-1.0s. 30 fps captures the
# sub-frame easing detail (over-stretch, settle, bounce) that lower rates blur
# together, while staying cheap to look at. Override with --fps for slow/long clips.
DEFAULT_FPS = 30

# Contact-sheet column count. ~8 keeps each frame large enough to read on a
# typical clip (a 0.5s clip at 30fps -> 15 frames -> 2 rows) without shrinking
# thumbnails to mush. Override with --cols for very long clips.
DEFAULT_COLS = 8


def require_ffmpeg():
    if shutil.which("ffmpeg") is None:
        sys.exit(
            "ffmpeg not found on PATH. Install it first:\n"
            "  macOS:  brew install ffmpeg\n"
            "  Debian: sudo apt-get install ffmpeg"
        )


def run(cmd):
    """Run a command, surfacing ffmpeg's own error text on failure."""
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        sys.exit(f"command failed: {' '.join(cmd)}\n{proc.stderr.strip()}")
    return proc


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("video", help="path to the screen recording (mp4, mov, gif, ...)")
    p.add_argument("outdir", help="directory for extracted frames (created if missing)")
    p.add_argument("--fps", type=int, default=DEFAULT_FPS, help=f"frames per second to sample (default {DEFAULT_FPS})")
    p.add_argument("--cols", type=int, default=DEFAULT_COLS, help=f"contact-sheet columns (default {DEFAULT_COLS})")
    p.add_argument("--start", type=float, default=None, help="window start in seconds (trim long recordings)")
    p.add_argument("--duration", type=float, default=None, help="window length in seconds from --start")
    args = p.parse_args()

    require_ffmpeg()

    if not os.path.isfile(args.video):
        sys.exit(f"video not found: {args.video}")
    os.makedirs(args.outdir, exist_ok=True)  # solve, don't punt: create it

    # Trim as OUTPUT seeking (-ss/-t AFTER -i): frame-accurate, which matters for a
    # sub-second window. Input seeking (before -i) is faster but snaps to keyframes
    # and can miss the first frames of the transition.
    window = []
    if args.start is not None:
        window += ["-ss", str(args.start)]
    if args.duration is not None:
        window += ["-t", str(args.duration)]

    frame_glob = os.path.join(args.outdir, "frame_%04d.png")
    run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
         "-i", args.video, *window, "-vf", f"fps={args.fps}", frame_glob])

    frames = sorted(f for f in os.listdir(args.outdir) if f.startswith("frame_") and f.endswith(".png"))
    if not frames:
        sys.exit("ffmpeg produced no frames. Is the video readable and non-empty?")

    rows = (len(frames) + args.cols - 1) // args.cols
    sheet = os.path.join(args.outdir, "contact_sheet.png")
    run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
         "-pattern_type", "glob", "-i", os.path.join(args.outdir, "frame_*.png"),
         "-vf", f"tile={args.cols}x{rows}:padding=4:color=white", "-frames:v", "1", sheet])

    win = ""
    if window:
        end = "" if args.duration is None else f"-{(args.start or 0) + args.duration:g}s"
        win = f" (window {args.start or 0:g}s{end})"
    print(f"extracted {len(frames)} frames at {args.fps} fps{win} -> {args.outdir}")
    print(f"contact sheet: {sheet}  ({args.cols}x{rows})")
    print("Open the contact sheet first to read the whole timeline at once.")


if __name__ == "__main__":
    main()
