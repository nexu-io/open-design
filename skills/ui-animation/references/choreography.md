# Choreography

A single fitted curve is rarely the whole story. Polish lives in *orchestration*: what
leads, lags, and settles independently. Annotate these from the contact sheet and frame
timeline, then express them per target.

## Contents

- Patterns to look for
- Reading timing offsets
- Expressing it per target

## Patterns to look for

| Pattern | What you see in the frames | Why it reads well |
|---|---|---|
| Blur-before-move | Element/backdrop blurs or dims a few frames *before* position changes | Sets context first; the move feels grounded, not abrupt |
| Over-stretch then settle | One axis scales past 1.0, then eases back | Soft and physical, not rigid |
| Per-edge / independent settling | Bottom and side edges arrive on different frames | Mimics real material; avoids a mechanical pop |
| Staggered children | List items/icons enter one after another | Builds hierarchy; the eye follows the lead |
| Tucked origin | Top edge stays clipped under a notch/island for the first third | Anchors it to where it came from |
| Asymmetric open/close | Open slow + springy, close fast + flat | Open invites attention; close gets out of the way |

## Reading timing offsets

For each property, note the **first frame it changes** and the **frame it settles** from
`metrics.json`. Convert to ms with `frame / fps * 1000`. Gaps between properties are the
choreography:

```
opacity:  starts f0   settles f6    (0 -> 200ms)
blur:     starts f0   settles f8    (0 -> 267ms)
translate:starts f3   settles f14   (100ms -> 467ms)   <- move lags blur by ~100ms
scaleY:   starts f3   peaks f11     overshoots to 1.06  <- over-stretch
```

That table *is* the spec. The delays (blur leads, move lags 100ms, scale overshoots) carry
more feel than any single easing curve.

## Expressing it per target

- **Stagger:** Motion `transition={{ staggerChildren: 0.04 }}`; CSS `animation-delay` per
  item; SwiftUI `.delay(i * 0.04)`; Reanimated `withDelay(i * 40, ...)`.
- **Lead/lag between properties:** give each its own delay/duration. CSS: comma-separate
  transitions (`transform 300ms ... 100ms, filter 200ms ... 0ms`). Motion/Reanimated:
  separate values with their own `delay`.
- **Over-stretch:** a keyframe past 1.0 (CSS `scaleY(1.06)` at 70%) or a spring with
  `overshoot: true`; don't flatten to a monotonic ease.
- **Independent edge settling:** animate `scaleX`/`scaleY` (or `transform-origin`-anchored
  edges) on separate curves, not uniform `scale`.
- **Asymmetric open/close:** two distinct transitions; enter slower/springier, exit
  faster/flatter. Never reuse the open curve reversed.
