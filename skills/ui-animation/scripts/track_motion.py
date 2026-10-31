#!/usr/bin/env python3
"""Measure a moving element across extracted frames, frame by frame.

Run:
    python3 scripts/track_motion.py <framedir> [--out metrics.json]
                                    [--bbox X,Y,W,H] [--invert] [--threshold T]

--bbox restricts frame-diff detection to that region (use when several elements
move and you want just one; run once per element). The element is still tracked
inside the region, so position/scale/opacity stay meaningful.

Outputs a JSON timeline of per-frame measurements for the tracked element:
    x, y            top-left of its bounding box (pixels)
    cx, cy          centroid (pixels)
    width, height   bounding-box size (pixels) -> scale proxy
    opacity         mean foreground alpha proxy in [0,1]
    blur            normalized inverse sharpness in [0,1] (1 = most blurred)
    radius          corner-roundness proxy in [0,1] (1 = most rounded)

These are PROXIES from pixels, not ground truth. Read references/measurement-guide.md
for what each one means and when to trust it. Feed the JSON to fit_curves.py.

Requires: opencv-python, numpy  (pip install opencv-python numpy)
"""

import argparse
import json
import os
import sys

try:
    import cv2
    import numpy as np
except ImportError:
    sys.exit("missing deps. Install with:  pip install opencv-python numpy")

# Frames whose foreground mask covers less than this fraction of the searched
# area (full canvas, or the --bbox region when given) are treated as "element
# not present yet" (empty) rather than noise-filled. 0.2% of pixels is below any
# real UI element but above stray anti-aliasing specks.
MIN_AREA_FRAC = 0.002

# Laplacian variance saturates well before pixel max; 1000 is a generous ceiling
# for "perfectly sharp" UI text/edges, used only to normalize blur into [0,1].
SHARPNESS_CEILING = 1000.0

# Default per-pixel intensity-diff cutoff (0-255) for foreground detection.
# Above compression/AA noise, below real element edges. See foreground_mask().
DEFAULT_THRESHOLD = 25


def load_frames(framedir):
    names = sorted(f for f in os.listdir(framedir) if f.startswith("frame_") and f.endswith(".png"))
    if not names:
        sys.exit(f"no frame_*.png in {framedir}; run extract_frames.py first")
    frames = []
    for n in names:
        img = cv2.imread(os.path.join(framedir, n))
        if img is None:
            sys.exit(f"could not read {n}")
        frames.append(img)
    return names, frames


def foreground_mask(gray, ref, threshold, invert):
    """Foreground = pixels that differ from the first frame (the resting background).

    Works for an element that enters/moves over a static backdrop, which is the
    common screen-recording case. Pass --bbox to restrict detection to a region.
    """
    diff = cv2.absdiff(gray, ref)
    # Fixed intensity-difference threshold. ~25/255 sits above JPEG/video
    # compression and anti-aliasing noise (typically <15) yet well below the edge
    # contrast of any real UI element, so it isolates the moving element across a
    # static backdrop. A statistical threshold (mean+k*std) misfires here: when the
    # element covers a large, high-contrast area it pushes the cutoff past 255 and
    # detects nothing. Override with --threshold for low-contrast motion.
    t = threshold if threshold is not None else DEFAULT_THRESHOLD
    _, mask = cv2.threshold(diff, t, 255, cv2.THRESH_BINARY)
    if invert:
        mask = cv2.bitwise_not(mask)
    return mask


def measure(img, mask, min_area):
    ys, xs = np.where(mask > 0)
    area = xs.size
    if area < min_area:
        return None  # element effectively absent in this frame

    x0, x1 = int(xs.min()), int(xs.max())
    y0, y1 = int(ys.min()), int(ys.max())
    bw, bh = x1 - x0 + 1, y1 - y0 + 1

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    region = gray[y0:y1 + 1, x0:x1 + 1]

    # opacity proxy: how much of the bounding box the foreground fills. A fading-in
    # element fills less; a solid one fills its box. Normalized by box area.
    opacity = float(area) / float(bw * bh)

    # blur proxy: Laplacian variance is high for sharp edges, low for blurred.
    # Invert + normalize so 1.0 = most blurred, 0.0 = sharp.
    sharp = float(cv2.Laplacian(region, cv2.CV_64F).var())
    blur = 1.0 - min(sharp / SHARPNESS_CEILING, 1.0)

    # radius proxy: fraction of the four bounding-box corners NOT covered by the
    # mask. Rounded corners leave the box corners empty; sharp corners fill them.
    sub = mask[y0:y1 + 1, x0:x1 + 1]
    corner = max(2, min(bw, bh) // 8)  # sample an 1/8-edge corner patch, min 2px
    corners = [sub[:corner, :corner], sub[:corner, -corner:], sub[-corner:, :corner], sub[-corner:, -corner:]]
    filled = sum(c.mean() / 255.0 for c in corners) / 4.0
    radius = float(1.0 - filled)

    return {
        "x": x0, "y": y0, "width": bw, "height": bh,
        "cx": (x0 + x1) / 2.0, "cy": (y0 + y1) / 2.0,
        "opacity": round(opacity, 4), "blur": round(blur, 4), "radius": round(radius, 4),
    }


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("framedir", help="directory of frame_*.png from extract_frames.py")
    p.add_argument("--out", default=None, help="output JSON path (default: <framedir>/metrics.json)")
    p.add_argument("--bbox", default=None, help="restrict detection to region X,Y,W,H (one run per element)")
    p.add_argument("--threshold", type=int, default=None, help="fixed foreground diff threshold (0-255)")
    p.add_argument("--invert", action="store_true", help="treat the matched region as background, not foreground")
    args = p.parse_args()

    names, frames = load_frames(args.framedir)
    ref = cv2.cvtColor(frames[0], cv2.COLOR_BGR2GRAY)

    clip = None
    if args.bbox:
        try:
            X, Y, W, H = (int(v) for v in args.bbox.split(","))
        except ValueError:
            sys.exit("--bbox must be X,Y,W,H integers, e.g. --bbox 40,120,300,400")
        fh, fw = ref.shape
        if X < 0 or Y < 0 or W <= 0 or H <= 0 or X + W > fw or Y + H > fh:
            sys.exit(f"--bbox {args.bbox} falls outside the {fw}x{fh} frame")
        clip = np.zeros(ref.shape, np.uint8)
        clip[Y:Y + H, X:X + W] = 255

    # Presence cutoff scales with the searched area: the bbox when given (a small
    # element in a small region should still register), else the full canvas.
    min_area = MIN_AREA_FRAC * (W * H if clip is not None else ref.size)

    timeline = []
    for i, (name, img) in enumerate(zip(names, frames)):
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        mask = foreground_mask(gray, ref, args.threshold, args.invert)
        if clip is not None:
            # Keep only motion inside the bbox so neighboring elements don't
            # pollute the measurement; the element is still tracked within it.
            mask = cv2.bitwise_and(mask, clip)
        m = measure(img, mask, min_area)
        timeline.append({"frame": i, "file": name, **(m or {"present": False})})

    present = [t for t in timeline if t.get("present") is not False]
    if not present:
        sys.exit("no element detected in any frame. Try --bbox to name the region, "
                 "or --threshold to loosen detection, or --invert.")

    out = args.out or os.path.join(args.framedir, "metrics.json")
    with open(out, "w") as f:
        json.dump({"frame_count": len(timeline), "tracked_frames": len(present), "timeline": timeline}, f, indent=2)
    print(f"measured {len(present)}/{len(timeline)} frames -> {out}")
    if len(present) < len(timeline):
        print(f"({len(timeline) - len(present)} frames had no element; likely before entry or after exit)")


if __name__ == "__main__":
    main()
