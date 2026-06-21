# Layout and space

Layout is where "AI-generated" gets caught. Equal columns, everything centred, every card identical — these are the tells.

## Principles

- A layout has a **primary axis**. Left-biased, right-biased, top-heavy, or bottom-weighted. Centre-biased is a default, not a choice.
- **Asymmetry reads as intentional.** Symmetry reads as generated. When in doubt, shift.
- **Spacing is a scale, not a value.** Pick one scale. Use it everywhere. Don't type raw px.
- **Varied spacing.** If every gap is 24px, the page is a template. Mix small, medium, and large gaps within the same layout.
- **Break the grid on purpose.** A page with one element crossing the grid is stronger than a page that never does.

## The spacing scale

4pt base. Nine steps. Named by role, not size.

```css
:root {
  --space-3xs: 0.125rem;  /*  2px */
  --space-2xs: 0.25rem;   /*  4px */
  --space-xs:  0.5rem;    /*  8px */
  --space-sm:  0.75rem;   /* 12px */
  --space-md:  1rem;      /* 16px */
  --space-lg:  1.5rem;    /* 24px */
  --space-xl:  2.5rem;    /* 40px */
  --space-2xl: 4rem;      /* 64px */
  --space-3xl: 6rem;      /* 96px */
  --space-4xl: 9rem;      /* 144px */
}
```

- Use `gap` for sibling spacing. It's cleaner than stacked margins, it participates in flex/grid, and it collapses predictably.
- Use `margin` only for optical adjustments or breaking out of the flow. Never `margin` for a list of siblings.

## Grids

- **Prefer CSS Grid** for page layout, **Flexbox** for component internals.
- `grid-template-columns: repeat(auto-fit, minmax(280px, 1fr))` for fluid responsive grids without media queries.
- **Don't default to 3 columns of equal cards with icon-above-heading-above-copy.** This is *the* AI feature-grid. Break it: vary column widths with `grid-template-columns: 1.2fr 1fr 0.8fr`, or use a 12-column underlying grid and give each item a different span, or use 4-up with a 2-span hero, etc.
- Use **named grid areas** for complex layouts and rename them at breakpoints.

## Asymmetry techniques

- **Wide left margin.** Treat the left as a permanent negative space — narrow column of labels, wide column of content. **Labels must NOT be section eyebrows / numbers paired with the heading** — that's gate-66-banned. Reserve this technique for body-level micro-labels (caption, footnote, date) alongside body copy.
- **Hanging headers.** ⚠️ **Opt-in only.** Section labels sit in the left margin; content flows to the right. Permitted only when the user explicitly asks for an editorial / hanging-header layout AND no eyebrow / number / chapter tag sits in the left margin. The eyebrow-left / heading-right pattern is banned by slop-test gate 66 — it's the most reliable templated-editorial AI tell. Default to a stacked single-column section head.
- **Offset grids.** Odd columns wider than even. Or the other way.
- **Grid-breaks.** One element that deliberately extends past a column boundary: a pull-quote, a photograph, a rule, a number.
- **Generous top, tight bottom** (or vice-versa). Sections don't need to be evenly padded.

## Depth

- Depth is **weight and scale**, not shadow. A heavier weight, a larger size, a warmer hue — these create hierarchy better than drop shadows.
- If you use shadow, use one:
  - **Whisper** — `0 1px 2px oklch(20% 0.01 <hue> / 0.05)` for hovering cards.
  - **Hairline** — `0 0 0 1px oklch(30% 0.01 <hue> / 0.06)` as an alternative to a 1px border.
- Never stack multiple shadows. Never use a coloured glow on a light background.
- Z-index has **six levels, named.** Don't freestyle numbers.

```css
:root {
  --z-base:     1;
  --z-raised:   10;
  --z-dropdown: 100;
  --z-sticky:   200;
  --z-modal:    400;
  --z-toast:    500;
  --z-tooltip:  600;
}
```

## Bans

- **Centre-aligned everything.** Headings + body + CTA all centred is the landing-page template every LLM emits.
- **`min-height: 100vh` hero with one centred sentence.** Stop.
- **Card-in-card.** A bordered container inside a bordered container. Pick one.
- **Identical feature grid.** Three columns, three icons, three two-line headings, three three-line bodies. Change *something*.
- **Equal padding on everything.** If the card padding equals the section padding equals the page padding, the rhythm is flat.
- **`z-index: 9999`** and other ad-hoc z values. Use the scale.
- **Shadow-on-dark accidental glow.** A drop shadow on a dark card creates a glow; that's wrong.

## Page-edge clipping

The clipped-edge enrichment archetype (E1) — and any other deliberately overflowing element (full-bleed marquee, oversized headline that exceeds the viewport on small screens, a tilted figure that pushes past a column) — needs a parent that *visually* shows the overflow without letting the document scroll horizontally.

The default is unsafe: a `width: calc(100% + 12vw)` figure inside a section with `overflow: visible` makes the document scroll horizontally on every viewport. The page feels broken on touch devices. Slop-test gate 36 fails on this.

**Always pair clipped-edge with a global clip.** At the top of the stylesheet:

```css
html { overflow-x: clip; }
body { overflow-x: clip; }   /* fallback for older Safari */
```

Use `overflow-x: clip` rather than `overflow-x: hidden`:

- `clip` preserves `position: sticky` and `position: fixed` on descendants.
- `hidden` creates a new scroll container, which breaks sticky and can trap focus on overflowing inputs.

The clipped-edge mockup keeps its visual extension; the page no longer scrolls horizontally. Same pattern works for full-bleed marquees, oversized headlines, and any deliberately-decorative overflow.

The hero or section that *contains* the overflowing element keeps `overflow: visible` (so the figure renders past the parent edge); the global clip on `html` and `body` is the only safety net needed.

## When in doubt

If the layout looks fine but flat, do one of these before shipping:

1. Add one break-out element.
2. Unbalance a column width.
3. Move the primary CTA out of the centre.
4. Remove a card and replace it with negative space.
5. Change one section's padding so the rhythm is uneven.
