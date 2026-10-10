# Contextual Animations

Patterns for icon swaps, word-level stagger entrances, and subtle exits.

## Contents
- [Contextual icon swaps](#contextual-icon-swaps)
- [Word-level stagger entrances](#word-level-stagger-entrances)
- [Peripheral de-emphasis](#peripheral-de-emphasis)
- [Subtle exit animations](#subtle-exit-animations)

---

## Contextual icon swaps

For contextual state swaps (copy → check, play → pause, send → sent), animate `opacity`, `scale`, and `blur` together: the swap feels responsive, not instant, and blur hides the crossfade seam between outgoing and incoming icons.

**Motion (preferred, supports springs):**

```tsx
import { AnimatePresence, motion } from "motion/react"

<button onClick={handleCopy}>
  <AnimatePresence mode="wait" initial={false}>
    {isCopied ? (
      <motion.span
        key="check"
        initial={{ opacity: 0, scale: 0.8, filter: "blur(4px)" }}
        animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
        exit={{ opacity: 0, scale: 0.8, filter: "blur(4px)" }}
        transition={{ type: "spring", duration: 0.2, bounce: 0 }}
      >
        <CheckIcon />
      </motion.span>
    ) : (
      <motion.span
        key="copy"
        initial={{ opacity: 0, scale: 0.8, filter: "blur(4px)" }}
        animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
        exit={{ opacity: 0, scale: 0.8, filter: "blur(4px)" }}
        transition={{ type: "spring", duration: 0.2, bounce: 0 }}
      >
        <CopyIcon />
      </motion.span>
    )}
  </AnimatePresence>
</button>
```

**CSS only:** the Icon swap recipe in `transition-recipes.md` (both icons grid-stacked in one slot, the same three properties).

`mode="wait"` makes the exit finish before the enter starts, so both icons are never visible at once.

---

## Word-level stagger entrances

For hero text or page-header entrances, split content into sections (or words) and stagger each. Combine `opacity + translateY + blur`; any property alone looks flat, mechanical, or cheap.

**Two levels of stagger:**

| Level | Delay | Use for |
|-------|-------|---------|
| Section-level | 100ms per section | Title block, description block, button group |
| Word-level | 80ms per word | Hero headline only |

**CSS pattern:**

```css
@keyframes enter {
  from {
    transform: translateY(8px);
    filter: blur(5px);
    opacity: 0;
  }
}

.animate-enter {
  animation: enter 800ms cubic-bezier(0.25, 0.46, 0.45, 0.94) both;
  animation-delay: calc(var(--delay, 0ms) * var(--stagger, 0));
}

/* Section level: 100ms gaps */
.animate-enter-section {
  --delay: 100ms;
}

/* Word level: 80ms gaps */
.animate-enter-word {
  --delay: 80ms;
}
```

**Section-level JSX:**

```tsx
<div className="animate-enter animate-enter-section" style={{ "--stagger": 1 }}>
  <Title />
</div>
<div className="animate-enter animate-enter-section" style={{ "--stagger": 2 }}>
  <Description />
</div>
<div className="animate-enter animate-enter-section" style={{ "--stagger": 3 }}>
  <Buttons />
</div>
```

**Word-level JSX:**

```tsx
{"Track expenses, build habits".split(" ").map((word, i) => (
  <span
    key={word}
    className="animate-enter animate-enter-word inline-block"
    style={{ "--stagger": i + 1 }}
  >
    {word}&nbsp;
  </span>
))}
```

These differ from the general-purpose 30-50ms item stagger in `component-patterns.md`: use 30-50ms for lists, 80-100ms for page-level entrances where each chunk carries narrative weight.

---

## Peripheral de-emphasis

To focus attention on one item in a set, animate the *siblings*, not the item. Blurring and fading the neighbours pushes them behind the focal plane, which reads as depth. A scrim over the whole page reads as a mode change, which is a much heavier claim than "this one is active".

Use it for hover previews in a dense grid of chips or thumbnails, and for a picker whose options stay visible behind it. Do not use it as a substitute for a modal backdrop: a dialog that traps focus needs the scrim, because the dim is communicating that the rest of the page is inert, not merely secondary.

```css
.chip {
  transition: opacity 200ms ease, filter 200ms ease, scale 150ms cubic-bezier(0.22, 1, 0.36, 1);
}

/* Blur the siblings of whatever is hovered, not the hovered chip. */
@media (hover: hover) and (pointer: fine) {
  .chip-grid:has(.chip:hover) .chip:not(:hover) {
    opacity: 0.5;
    filter: blur(2px);
  }
  .chip:hover { scale: 1.04; }
}
```

Keep the blur at 2-3px. Past about 4px the neighbours stop reading as content and the grid looks broken rather than defocused. Fade to roughly 0.5 opacity, never to invisible: the point is that the set is still there.

---

## Subtle exit animations

Exits should be directional (signal where content goes) but quieter than enters. Use a small fixed offset, not the computed element height.

**Full exit (too much movement for overlays):**

```tsx
<motion.div
  exit={{
    opacity: 0,
    y: "calc(-100% - 4px)", // the full height, plus gap
    filter: "blur(4px)",
  }}
  transition={{ type: "spring", duration: 0.45, bounce: 0 }}
/>
```

**Subtle exit (recommended):**

```tsx
<motion.div
  initial={{ opacity: 0, y: "calc(-100% - 4px)", filter: "blur(4px)" }}
  animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
  exit={{
    opacity: 0,
    y: "-12px", // fixed value, regardless of element height
    filter: "blur(4px)",
  }}
  transition={{ type: "spring", duration: 0.45, bounce: 0 }}
/>
```

Keep `-12px` fixed, never computed from dimensions: the exit conveys direction, not the full path. Enter uses full distance to build presence; exit uses a short fixed distance to release attention quietly.

Spring: `{ type: "spring", duration: 0.45, bounce: 0 }`; zero bounce for a clean exit.
