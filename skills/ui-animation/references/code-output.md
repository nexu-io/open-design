# Code Output

Templates that turn fitted parameters into runnable code per target. Substitute numbers from `fit_curves.py`; keep movement on `transform`/`opacity` (never layout props).

## Contents

- CSS
- Motion / Framer Motion
- SwiftUI
- React Native (Reanimated)
- UIKit
- Handoff spec
- Notes

Throughout: `D` = `duration_ms`, `BEZIER` = fitted `cubic-bezier(...)`, `{k, c, m}` = fitted `stiffness, damping, mass`.

## CSS

Monotonic: use the fitted bezier:

```css
.element {
  transition: transform Dms BEZIER, opacity Dms ease-out;
}
```

Overshoot/spring: a bezier can't ring, so sample the spring into `linear()`:

```css
/* generated from the spring response; more points = smoother overshoot */
.element {
  transition: transform Dms linear(0, 0.42 12%, 1.08 46%, 0.98 68%, 1);
}
```

Multi-phase: each phase is a keyframe stop with its own easing:

```css
@keyframes morph {
  0%   { transform: translateY(-12px) scaleY(0.9); filter: blur(6px); opacity: 0; }
  35%  { filter: blur(0); opacity: 1; }            /* blur/opacity lead the move */
  70%  { transform: translateY(0) scaleY(1.06); }  /* over-stretch */
  100% { transform: translateY(0) scaleY(1); }     /* settle */
}
```

## Motion / Framer Motion

Spring (preferred when the fit shows overshoot):

```tsx
<motion.div
  initial={{ y: -12, opacity: 0, filter: "blur(6px)" }}
  animate={{ y: 0, opacity: 1, filter: "blur(0px)" }}
  transition={{ type: "spring", stiffness: k, damping: c, mass: m }}
/>
```

Tween (monotonic):

```tsx
transition={{ duration: D / 1000, ease: [x1, y1, x2, y2] }} // fitted bezier control points
```

## SwiftUI

```swift
withAnimation(.spring(response: RESPONSE, dampingFraction: ZETA)) {
    isOpen = true   // drive layout/offset/scale off this state
}
// RESPONSE = 2 * .pi * sqrt(m / k);  ZETA = fitted `zeta`
```

Monotonic alternative:

```swift
withAnimation(.timingCurve(x1, y1, x2, y2, duration: D / 1000.0)) { isOpen = true }
```

## React Native (Reanimated)

```ts
// spring
offset.value = withSpring(target, { stiffness: k, damping: c, mass: m });

// monotonic
offset.value = withTiming(target, {
  duration: D,
  easing: Easing.bezier(x1, y1, x2, y2),
});
```

## UIKit

Spring: `CASpringAnimation` carries fitted params directly:

```swift
let a = CASpringAnimation(keyPath: "transform.translation.y")
a.stiffness = k; a.damping = c; a.mass = m
a.fromValue = -12; a.toValue = 0
a.duration = a.settlingDuration   // let the physics decide
layer.add(a, forKey: "morph")
```

Monotonic: `UIViewPropertyAnimator` with fitted bezier control points:

```swift
let curve = UICubicTimingParameters(controlPoint1: CGPoint(x: x1, y: y1),
                                     controlPoint2: CGPoint(x: x2, y: y2))
let animator = UIViewPropertyAnimator(duration: D / 1000.0, timingParameters: curve)
animator.addAnimations { view.transform = .identity; view.alpha = 1 }
animator.startAnimation()
```

## Handoff spec

A self-contained artifact someone can implement without the video. Emit one per direction (open and close), filled from `fit_curves.py` + the choreography table:

```markdown
## Motion spec: <element> (open)

Duration: <duration_ms> ms · Trigger: <what starts it>

| Property | Model | Params | Easing / config | Fit err |
|----------|-------|--------|-----------------|---------|
| translate | bezier | n/a | cubic-bezier(0.32,0,0,1) | 0.012 |
| scaleY | spring | k=180 c=14 m=1 | overshoot, zeta 0.53 | 0.024 |
| opacity | bezier | n/a | ease-out, 0-220ms | 0.02 |
| blur | n/a | 8px→0 | leads move by ~100ms | n/a |

Choreography: blur+opacity lead; translate lags ~100ms; scaleY over-stretches to 1.06
then settles. Bottom/side edges settle independently.

Reference implementation (<target>):
<chosen snippet from above>
```

Pair with the original `contact_sheet.png` so the reviewer can eyeball result against source.

## Notes

- Map fitted numbers onto each API's own parameters; don't hardcode a different look than measured.
- Web targets follow the repo's motion rules (animate `transform`/`opacity` only, interruptible). Hand the spec to the `ui-animation` skill to productionize.
- Emit **two** transitions when open and close differ (see `references/curve-fitting.md` and `references/choreography.md`); a shared transition flattens the asymmetry.
