# Animation discipline craft rules

Universal rules for when motion earns its place in a UI and what numbers
constrain it. The active `DESIGN.md` decides brand-specific motion
personality; this file decides whether motion should run at all and at
what duration, easing, and accessibility floor.

> Grounded in primary sources: Tversky/Morrison/Bétrancourt 2002
> (IJHCS), Heer & Robertson TVCG 2007, Harrison/Yeo/Hudson CHI 2010,
> Doherty & Thadani IBM Systems Journal 1982, Chang & Ungar UIST 1993,
> Material 3 motion tokens, IBM `@carbon/motion`, Apple SwiftUI
> Animation API, W3C View Transitions, WCAG 2.2.2 + 2.3.3, WebKit's
> 2017 `prefers-reduced-motion` rationale.

## When motion earns its place

Tversky/Morrison/Bétrancourt's 2002 meta-analysis (IJHCS 57, pp. 247-262)
found that every study claiming animation aids comprehension had a
broken control — the static version had less information, different
procedures, or hidden interactivity. When equalised, animation does
**not** beat static for teaching complex systems. The single use case
the paper endorses is real-time spatial or temporal reorientation:
page transitions, container morphs, viewpoint changes, progress
indicators (p. 257).

A follow-on hazard: Palmiter & Elkerton found animation-trained users
*declined* one week after training, while text-trained users *improved*
(Tversky 2002, p. 255). Animation's apparent short-term parity hides
worse retention.

So animate when the user is moving through space, time, or state —
navigation, container expansion, progress feedback, gesture
follow-through. Don't animate to teach, decorate, signal "premium",
or fill silence.

## Duration thresholds

The cross-design-system convergence is **150 ms** — Material 3 `short3`,
IBM Carbon `moderate-01`, Shopify Polaris `150`, Tailwind default,
SLDS `duration-fast` all land here. Use it as the default duration for
state-confirmation feedback.

| Duration | Use |
|---|---|
| 50–100 ms | Instant feedback (button press, toggle commit, hover) |
| 150 ms | Default for state-confirmation |
| 200–300 ms | Entering UI (modals, sheets, dropdowns) |
| 300–500 ms | Cross-screen transitions, container morphs |
| > 500 ms | Reserved for cross-screen, staged, or platform-native transitions (e.g. M3 `long2`-`extraLong4`, Heer & Robertson 2007's per-stage recommendation). |

Non-navigation microinteractions — hover, press, toggle, validation,
chip selection, row expansion — should stay under 500 ms. Past that the
user notices the motion as motion and waits on the UI rather than
working through it. Two qualifications: frequent animations (a hover
effect seen 50 times per session) need to stay ≤200 ms; mobile
animations should run 20–30% shorter than desktop equivalents because
travel distances are shorter.

## Curve vs spring

Use a curve for opacity, color, and any property that changes value
between two known points. Use a spring for position, scale, rotation,
and gesture-driven motion — anything that should feel physical.

Material 3 standard easing is `cubic-bezier(0.2, 0, 0, 1)` — front-loaded;
the trailing zero makes the curve hit its target instantly and settle.
M2 standard was the symmetric `cubic-bezier(0.4, 0, 0.2, 1)`, preserved
in M3 under the name `legacy`. Anyone shipping the M2 curve and calling
it "M3" is on legacy tokens. M3 `emphasized` is a **two-segment Bézier
path**, not a single cubic-bezier; single-cubic approximations silently
lose the front-loaded character. CSS `linear()` (Chrome 113+) is the
only way to replicate it on a single property.

Apple's published SwiftUI default spring is
`(response: 0.5, dampingFraction: 0.825, blendDuration: 0)`. The widely
cited `.snappy = 0.25 s, .smooth = 0.35 s` numbers are wrong — Apple's
docs assign all three presets a 0.5 s base, differing only in bounce
(0 / 0.15 / 0.3).

Spring framework defaults disagree. motion.dev's physics-mode default
is ζ ≈ 0.5 (bouncy). React Spring's `default` is ζ = 0.997 (critically
damped). Same word "default", opposite feel — React Spring's `wobbly`
is the actual feel-equivalent of motion.dev's `default`. Pick
consciously.

## Reduced motion

Every animation that translates, scales, rotates, or parallaxes must
respect `@media (prefers-reduced-motion: reduce)`. WebKit shipped this
in 2017 to address vestibular triggers; the W3C MQ5 spec lets the UA
or author **strip motion entirely or substitute static imagery** —
the spec does not mandate which.

Working rule: strip motion-on-an-axis (translate, scale, rotate,
parallax). Keep opacity/color crossfades as substitutes when a state
change still needs to be conveyed. Be explicit — the View Transitions
API does **not** apply `prefers-reduced-motion` automatically; the
author must add a query override on the pseudo-elements or skip
`startViewTransition` entirely.

WCAG calibration: 2.2.2 (Pause/Stop/Hide) is Level A — the legal floor
under ADA Title II 2024 / EN 301 549 / EAA — but it names cognitive,
attentional, and reading populations, not vestibular. Vestibular
language lives in 2.3.3, which is **AAA**. Don't conflate the two.
Building for vestibular users is a craft commitment beyond the legal
floor, not a WCAG mandate.

**Flashing limits.** WCAG 2.3.1 (Level A) permits flashing only when
there are no more than three flashes within any one-second period, or
the flashing area stays below the general and red flash thresholds.
WCAG 2.3.2 (AAA) forbids flashing more than three times within any
one-second period, regardless of area or brightness. The protected
concern is photosensitive epilepsy; the legal floor isn't negotiable. For gamified UI, onboarding celebrations, sparkles,
confetti, level-up bursts, and shimmer: avoid rapid flashing unless
tested against the thresholds, and prefer one-shot animations over
loops.

## Repeated and ambient motion

The rules above target one-shot transitions. Looping motion (skeleton
shimmer, idle backgrounds, autoplay, reward bursts) has different
constraints.

- Cap iteration count: carousels at 3-5 cycles then pause; skeleton shimmer until content lands, never indefinitely.
- WCAG 2.2.2 (Level A) requires a pause control for any motion running longer than 5 seconds — moving, blinking, or scrolling content, not only video.
- Cancel ambient motion on route change.
- Reward animations are one-shot. Confetti, sparkles, level-up bursts fire once and dismiss; no looping timer.
- Spinners must not run indefinitely. Escalate to progress/cancel states and stop animation at 60 s, matching `state-coverage.md`.

## Cross-platform handoff

Native conventions diverge.

- **iOS** uses spring physics with perceptual `(response, dampingFraction)` parameters. Apple HIG documents principles, not numerical curves; the SwiftUI Animation API JSON is the source for actual numbers. UIView curve cubic-beziers commonly cited online are reverse-engineered, not Apple-published.
- **Android** uses cubic-bezier curves through M3 motion tokens (50–1000 ms range, 16 named durations). Predictive back is a *gesture-progress primitive*, not a transition primitive — `BackEvent.progress` is sampled per-frame from the touch stream and the destination is rendered behind the current surface while still on it. Cancellation is a first-class lifecycle state.
- **Web** has the View Transitions API (default 0.25 s, no easing specified by the spec — falls through to CSS `ease`). Same-document support 90.94%; cross-document 87.82%. Cross-document is same-origin and user-initiated only.

A "one curve fits all platforms" approach loses on each. If the brief
specifies platform fidelity, follow the platform; if it specifies brand
consistency, pick one motion vocabulary and apply it everywhere.

## Common mistakes (lint these)

- "Skeleton screens feel 11% faster" — Harrison/Yeo/Hudson CHI 2010 measured *backwards-decelerating ribbed determinate progress bars* (n=16). The induced-motion mechanism doesn't transfer to skeletons.
- "Heer & Robertson recommend 300–1000 ms eased transitions" — they tested 1.25 s and 2 s only. Their recommendation is "~1 second per stage".
- "Doherty Threshold = 400 ms" — the 1982 paper does not contain "400". The lowest threshold actually measured is 300 ms.
- M2 standard easing `cubic-bezier(0.4, 0, 0.2, 1)` labelled as "Material 3". M3's standard is `cubic-bezier(0.2, 0, 0, 1)`.
- Animations that *perform* a state change rather than *confirming* one that has already happened. Optimistic UI first; motion second.
- More than 500 ms on any non-cross-screen transition.
- Animation as the only signal of state change. Reduced-motion users miss it; always pair with a static affordance (color, position, label).
- Ignoring `prefers-reduced-motion` on transform-based animations — the highest-cost vestibular triggers.
- Curve-based animation on a `transform: scale()` that should feel physical. Use a spring.
- Hero choreography in productivity tools. Motion budget belongs inside the product on functional micro-feedback, not on landing-page sequences.
- Decorative motion in the working canvas of a productivity tool.
