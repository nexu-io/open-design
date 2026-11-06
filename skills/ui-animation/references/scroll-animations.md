# Scroll Animations

Scroll-triggered reveals and scroll-driven (scrubbed) motion. Scroll is the most abused trigger in web motion, so this reference is half restraint, half implementation, in that order. The scrollbar belongs to the user: motion may respond to scrolling, but must never take it over or make content wait.

## Contents
- [Gate: should this scroll animation exist?](#gate-should-this-scroll-animation-exist)
- [Two kinds: triggered vs scrubbed](#two-kinds-triggered-vs-scrubbed)
- [Triggered reveals](#triggered-reveals)
- [Scrubbed animation](#scrubbed-animation)
- [Parallax](#parallax)
- [Sticky and scrollytelling sections](#sticky-and-scrollytelling-sections)
- [Never hijack scroll](#never-hijack-scroll)
- [Performance](#performance)

## Gate: should this scroll animation exist?

Walk this before writing any code:

```
Is this inside a product (dashboard, app, tool)?
├── Yes → No scroll animation. Users scroll product UI dozens of times a
│         session; content appearing late reads as lag, not delight.
└── No, it's a marketing surface (landing page, blog, docs)
    ├── Is the element in the initial viewport (above the fold)?
    │   └── Yes → Don't scroll-reveal it. Use a one-time intro animation
    │             or nothing. The hero must never wait for a scroll event.
    ├── Are you about to reveal EVERY section?
    │   └── Yes → Cut it to 2-4 moments. If everything animates, nothing
    │             stands out; each reveal devalues the next.
    └── Does it explain, pace, or emphasize something specific?
        ├── Yes → Build it (rules below).
        └── No ("it looks cool") → The best animation is no animation.
```

Marketing pages are the packaging of the product: they have earned slower, more expressive motion because they are seen rarely. That freedom is the reason to be selective, not a license to animate everything.

## Two kinds: triggered vs scrubbed

Every scroll animation is one of these; the wrong choice is unfixable by tuning:

- **Triggered reveal.** Crossing a threshold *starts* a normal animation that then runs on its own clock (easing plus duration). For "fade in as it enters the viewport".
- **Scrubbed.** Scroll position *is* the clock; progress maps directly to animation progress and reverses when the user scrolls back. For progress bars, parallax, sticky sequences.

A scrubbed animation has **no duration and no easing**: the user's hand is both. Adding a duration to scrubbed motion makes it lag behind the scrollbar, the same disconnected feeling as a spring during a drag.

## Triggered reveals

- **Reveal once. Never re-animate on scroll-up.** Intro animations run one time; replaying on every pass turns delight into a tic and makes content flicker during normal reading. Unobserve after firing (or `once: true` in Motion's `useInView`).
- **The recipe:** `opacity: 0` plus `translateY(10-16px)` settling to rest, with a strong ease-out (entering elements always ease out; the fast start reads as responsive). 400-600ms is right for marketing; product-speed 200ms reveals look nervous on a landing page.
- **Trigger early.** Start the animation when the element is roughly 10-20% into the viewport (`rootMargin: "0px 0px -10% 0px"`), so it plays *as* the user arrives, not after they have stopped and stared at a blank slot.
- **Stagger like a wave, not a metronome.** Sibling reveals offset by roughly 80-120ms, with delay and distance varied by importance: the heading leads, supporting text follows, the least important item can just fade with no movement. Uniform stagger kills hierarchy.
- **Content survives without JS.** The un-animated state is *visible*; JS adds the hidden initial state right before animating. A page of `opacity: 0` sections behind a broken script is the worst failure mode a marketing page has.
- **One entrance per container.** Don't reveal a section *and* stagger its children; pick one.

Implementation: `IntersectionObserver` (or Motion's `useInView`) toggling a class. Never a scroll listener; it fires per frame on the main thread for work a threshold check does once.

## Scrubbed animation

Preference order, and why:

1. **CSS scroll-driven animations:** `animation-timeline: view()` (the element's own viewport progress) or `scroll()` (container progress). They run off the main thread, stay hooked to the scrollbar even while the page is busy loading images, and cost no JS. Progressive-enhance: wrap in `@supports (animation-timeline: view())` with the no-animation state as fallback.
2. **Motion's `useScroll` plus `useTransform`:** when progress must feed React logic or compose with springs and gestures. This runs on the main thread via `requestAnimationFrame`: fine normally, drops frames under load.
3. **A raw scroll listener writing React state: never.** A re-render per scrolled pixel.

```css
@supports (animation-timeline: view()) {
  .figure {
    animation: reveal linear both;
    animation-timeline: view();
    animation-range: entry 0% cover 40%;
  }
}
```

`linear` is correct here and only here: the scrubbed timeline's pacing comes from the user's hand, and any curve would distort the 1:1 mapping.

The `@supports` wrapper is not optional: `animation-timeline` is still not Baseline, so without it the element sits at its keyframe start forever in browsers that ignore the property. The unwrapped rule must leave the element in its final, readable state.

## Parallax

Parallax is depth seasoning, and heavy-handed parallax is the fastest way to make a page feel dated:

- **Keep the differential at or under roughly 15%** of scroll distance between layers. Enough to read as depth; more reads as content swimming.
- **Transform only**, scrubbed (no duration), decorative elements only: never body text, never anything the user needs to read while it moves.
- Skip it on mobile: short viewports and momentum scrolling turn subtle parallax into jitter.

## Sticky and scrollytelling sections

A section that pins while scroll drives a sequence is an **explanation** device; it earns its scroll length only if each increment reveals a step of a story. Rules: progress maps monotonically to the sequence (scrolling back rewinds it); keep the pinned length at or under roughly 2-3 viewport heights, because trapped-feeling sticky sections are where users close tabs; and the section must be skippable by simply continuing to scroll. Never block or slow the scrollbar to force the story.

## Never hijack scroll

No scroll-jacking, no rewriting wheel deltas, no "one wheel tick = one full-screen slide". Smooth-scroll libraries that re-implement scrolling on the main thread trade native responsiveness for a float many users read as lag. If you add `scroll-behavior: smooth` for anchor links, keep it to that:

```css
html { scroll-behavior: smooth; }
```

## Performance

The golden rule holds: **animate only `transform` and `opacity`**. A scrolling page is the worst place for layout-triggering properties, since Layout and Paint work stacks on top of the scroll itself. Add `will-change: transform` on scrubbed elements only (they animate for the whole scroll, so the dedicated layer pays for itself; on one-shot reveals it's wasted memory). Keep any animated `blur()` at or under 20px.
