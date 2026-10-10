#!/usr/bin/env python3
"""Fit easing curves to a per-frame metrics timeline.

Run:
    python3 scripts/fit_curves.py <metrics.json> [--fps N] [--property NAME]

For each animated property (position, scale, opacity, ...) this fits two models
to its normalized 0->1 progress over time:

    spring   damped harmonic oscillator -> { stiffness, damping, mass }
    bezier   cubic-bezier easing        -> { x1, y1, x2, y2 }

Both report a normalized RMS fit error. Lower is better; a spring that clearly
overshoots will beat a bezier (and vice versa). Read references/curve-fitting.md
to interpret the numbers and pick the model. A high error on BOTH usually means
the motion is multi-phase: split it and fit each phase separately.

Requires: numpy, scipy  (pip install numpy scipy)
"""

import argparse
import json
import sys

try:
    import numpy as np
    from scipy.optimize import curve_fit
except ImportError:
    sys.exit("missing deps. Install with:  pip install numpy scipy")

DEFAULT_FPS = 30  # must match the fps used in extract_frames.py

# Properties to attempt, mapped to the timeline field(s) that express them.
# Position uses centroid distance from the first tracked frame. Width and height
# are fit as SEPARATE axes: a "fluid" morph over-stretches one axis (usually
# vertical) ahead of the other, and the edges settle independently; fitting a
# single uniform scale would erase that signature effect.
PROPERTIES = {
    "translate": ("cx", "cy"),
    "scaleX": ("width",),
    "scaleY": ("height",),
    "opacity": ("opacity",),
    "blur": ("blur",),
    "radius": ("radius",),
}


def progress(series):
    """Normalize a raw measurement series to 0->1 progress along its own range.

    Returns None if the property barely changes (range below a hair of its scale),
    so we don't fit curves to noise.
    """
    a = np.asarray(series, float)
    lo, hi = a.min(), a.max()
    span = hi - lo
    ref = max(abs(hi), abs(lo), 1.0)
    if span < 0.01 * ref:  # <1% movement: property is effectively static
        return None
    return (a - a[0]) / (a[-1] - a[0]) if a[-1] != a[0] else (a - lo) / span


def spring_model(t, zeta, omega):
    """Unit-step response of a 2nd-order system, normalized to settle at 1.

    Underdamped (zeta<1) overshoots and rings; critically/over-damped eases in.
    We fit (zeta, omega) then convert to stiffness/damping/mass at the end.
    """
    t = np.asarray(t, float)
    if zeta < 1.0:
        wd = omega * np.sqrt(max(1 - zeta * zeta, 1e-9))
        phi = np.arctan2(zeta, np.sqrt(max(1 - zeta * zeta, 1e-9)))
        return 1 - np.exp(-zeta * omega * t) * np.cos(wd * t - phi) / np.cos(phi)
    return 1 - (1 + omega * t) * np.exp(-omega * t)  # critically-damped form


def bezier_progress(t, x1, y1, x2, y2):
    """Sample a cubic-bezier easing y for each x=t in [0,1] (CSS timing-function)."""
    t = np.clip(np.asarray(t, float), 0, 1)
    # Solve bezier-x(s)=t for parameter s by bisection, then return bezier-y(s).
    s = np.full_like(t, 0.5)
    lo, hi = np.zeros_like(t), np.ones_like(t)
    for _ in range(40):  # 40 bisections -> ~1e-12 precision, ample for easing
        bx = 3 * (1 - s) ** 2 * s * x1 + 3 * (1 - s) * s ** 2 * x2 + s ** 3
        lo = np.where(bx < t, s, lo)
        hi = np.where(bx >= t, s, hi)
        s = (lo + hi) / 2
    return 3 * (1 - s) ** 2 * s * y1 + 3 * (1 - s) * s ** 2 * y2 + s ** 3


def rms(a, b):
    return float(np.sqrt(np.mean((np.asarray(a) - np.asarray(b)) ** 2)))


def fit_property(prog, t):
    out = {}

    # Spring fit. Bounded so the optimizer stays in physically sane territory:
    # zeta in (0,2] spans bouncy->overdamped; omega in (0,50] covers fast UI.
    # p0 starts mid-range, zeta 0.6 (mildly bouncy) at omega 8 rad/s (~0.8s
    # settle), so the optimizer can converge toward either extreme.
    try:
        (zeta, omega), _ = curve_fit(spring_model, t, prog, p0=[0.6, 8.0],
                                     bounds=([0.01, 0.1], [2.0, 50.0]), maxfev=10000)
        pred = spring_model(t, zeta, omega)
        # Convert to the (stiffness, damping, mass) triple APIs expect, fixing mass=1.
        mass = 1.0
        stiffness = omega * omega * mass
        damping = 2 * zeta * omega * mass
        out["spring"] = {
            "stiffness": round(float(stiffness), 1),
            "damping": round(float(damping), 2),
            "mass": mass,
            "zeta": round(float(zeta), 3),
            "overshoot": bool(zeta < 1.0),
            "error": round(rms(pred, prog), 4),
        }
    except (RuntimeError, ValueError):
        out["spring"] = {"error": None, "note": "spring fit failed to converge"}

    # Bezier fit. Control-point x in [0,1] (monotonic time), y bounded a bit
    # past [0,1] (here ±0.5) so it can express overshoot like
    # cubic-bezier(.2,1.4,.3,1). p0 = [0.25, 0.1, 0.25, 1.0] ≈ the CSS `ease`
    # default, a neutral curve every UI easing is a small step away from.
    try:
        (x1, y1, x2, y2), _ = curve_fit(bezier_progress, t / t[-1], prog, p0=[0.25, 0.1, 0.25, 1.0],
                                        bounds=([0, -0.5, 0, 0.5], [1, 1.5, 1, 1.5]), maxfev=10000)
        pred = bezier_progress(t / t[-1], x1, y1, x2, y2)
        out["bezier"] = {
            "cubic_bezier": [round(float(x1), 3), round(float(y1), 3), round(float(x2), 3), round(float(y2), 3)],
            "css": f"cubic-bezier({round(float(x1),3)}, {round(float(y1),3)}, {round(float(x2),3)}, {round(float(y2),3)})",
            "error": round(rms(pred, prog), 4),
        }
    except (RuntimeError, ValueError):
        out["bezier"] = {"error": None, "note": "bezier fit failed to converge"}

    best = min((m for m in (out["spring"].get("error"), out["bezier"].get("error")) if m is not None), default=None)
    if best is not None:
        out["recommended"] = "spring" if out["spring"].get("error") == best else "bezier"
    return out


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("metrics", help="metrics.json from track_motion.py")
    p.add_argument("--fps", type=int, default=DEFAULT_FPS, help=f"fps used during extraction (default {DEFAULT_FPS})")
    p.add_argument("--property", default=None, help="fit only this property (translate|scaleX|scaleY|opacity|blur|radius)")
    args = p.parse_args()

    with open(args.metrics) as f:
        data = json.load(f)
    tl = [r for r in data["timeline"] if r.get("present") is not False]
    if len(tl) < 4:
        sys.exit("need at least 4 tracked frames to fit a curve")

    frames = np.array([r["frame"] for r in tl], float)
    t = (frames - frames[0]) / args.fps  # seconds from first tracked frame
    duration_ms = round(float(t[-1] * 1000))

    if args.property and args.property not in PROPERTIES:
        sys.exit(f"unknown property '{args.property}'. Choose from: {', '.join(PROPERTIES)}")
    wanted = {args.property: PROPERTIES[args.property]} if args.property else PROPERTIES

    result = {"duration_ms": duration_ms, "tracked_frames": len(tl), "properties": {}}
    for name, fields in wanted.items():
        if name == "translate":
            cx = np.array([r["cx"] for r in tl]); cy = np.array([r["cy"] for r in tl])
            raw = np.hypot(cx - cx[0], cy - cy[0])  # distance travelled from start
        else:
            raw = np.array([r[fields[0]] for r in tl], float)
        prog = progress(raw)
        if prog is None:
            continue  # property didn't move enough to be worth fitting
        result["properties"][name] = fit_property(prog, t)

    if not result["properties"]:
        sys.exit("no property changed enough to fit. Check that you tracked the right element.")

    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
