# Curve Fitting

Read `fit_curves.py` output, choose spring vs cubic-bezier, judge fit quality, handle
asymmetric open/close curves.

## Contents

- Reading the output
- Spring vs bezier
- Judging fit error
- Asymmetric open/close
- Converting spring params across APIs

## Reading the output

`fit_curves.py` prints one block per property that moved:

```json
{
  "duration_ms": 520,
  "properties": {
    "translate": {
      "spring": { "stiffness": 210.4, "damping": 28.0, "mass": 1.0,
                  "zeta": 0.97, "overshoot": false, "error": 0.018 },
      "bezier":  { "cubic_bezier": [0.32, 0.0, 0.0, 1.0],
                   "css": "cubic-bezier(0.32, 0.0, 0.0, 1.0)", "error": 0.012 },
      "recommended": "bezier"
    },
    "scaleY": {
      "spring": { "stiffness": 180.0, "damping": 14.2, "mass": 1.0,
                  "zeta": 0.53, "overshoot": true, "error": 0.024 },
      "bezier":  { "cubic_bezier": [0.18, 1.42, 0.30, 1.0],
                   "css": "cubic-bezier(0.18, 1.42, 0.30, 1.0)", "error": 0.061 },
      "recommended": "spring"
    }
  }
}
```

Here `scaleY` overshoots (`zeta` 0.53) while `scaleX` barely moves: the vertical
over-stretch-then-settle that makes a morph feel fluid. Fitting the axes separately surfaces it.

- `recommended` is just whichever model had the lower `error`. Sanity-check against what you
  saw: a clear overshoot should pick spring or a bezier with `y1`/`y2` > 1.
- `overshoot: true` (`zeta` < 1) means the motion rings past its target and settles back, the
  elastic, springy feel. `zeta` ≈ 1 is a crisp ease with no bounce; `zeta` > 1 is slow and heavy.

## Spring vs bezier

| Pick spring when | Pick bezier when |
|---|---|
| Motion overshoots / bounces / settles | Motion is monotonic (no overshoot) |
| Target API is spring-native (Motion, SwiftUI, Reanimated) | Target is CSS `transition`/`@keyframes` |
| Duration should emerge from physics | Duration is fixed and known |
| It must stay interruptible mid-flight | One-shot, non-interruptible play |

You can ship a spring *as* a bezier (the fit gives both), but a true overshoot needs a bezier
whose `y1`/`y2` exceed 1, or CSS `linear()` with sampled points; a spring expressed as a plain
ease-out loses the bounce. The fitter caps `y1`/`y2` at 1.5, so a bigger bounce fits better as
a spring (or a sampled `linear()`), never as a bezier.

## Judging fit error

`error` is normalized RMS against 0->1 progress, so it's comparable across properties.

| error | Reading |
|---|---|
| < 0.03 | Tight fit: use the parameters directly |
| 0.03-0.08 | Decent: eyeball the recommended curve against the contact sheet |
| > 0.08 | Suspect: usually multi-phase motion (see below), wrong element, or too few frames |

**High error on BOTH models almost always means multi-phase motion** (blur-in, then move, then
over-stretch, then settle). One curve can't fit that: split the timeline at the phase boundary
(read the frame index off the contact sheet), fit each segment by slicing `metrics.json`, then
compose them as a keyframe sequence with per-segment easing.

If error is high because the property barely moved, it won't appear at all: `progress()` drops
series with under ~1% range so you don't fit curves to noise.

Two more error inflators to rule out before splitting phases:

- **Wrong `--fps`**: `fit_curves.py` defaults to 30; if extraction used another rate, every
  `duration_ms` and stiffness is rescaled. Pass the extraction fps.
- **Duplicated frames**: runs of identical rows in `metrics.json` (over-sampled or
  variable-frame-rate source) plateau the progress curve and raise error on both models.
  Re-extract at the source rate or re-record.

## Asymmetric open/close

Open and close are almost never mirror images: fit each direction as its own clip and report two curves, never one curve reused reversed. Full treatment (why, and expressing it per target) in `references/choreography.md`.

## Converting spring params across APIs

The fit fixes `mass = 1`. From `stiffness` (k), `damping` (c), `mass` (m):

- **Motion / Framer Motion**: pass `stiffness`, `damping`, `mass` into
  `transition: { type: "spring", stiffness, damping, mass }`.
- **SwiftUI**: `Spring(mass:stiffness:damping:)`, or approximate with
  `.spring(response:, dampingFraction:)` where `response = 2π·√(m/k)` and
  `dampingFraction = c / (2·√(k·m))` (that's `zeta`).
- **Reanimated**: `withSpring(to, { stiffness, damping, mass })`.
- **CSS**: no native spring. Use the fitted `bezier.css`, or generate a `linear()` easing by
  sampling the spring response (more faithful for overshoot). The per-target templates come from
  the Emit step of SKILL.md's reverse-engineer workflow.
