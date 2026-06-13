# Web prototype checklist

Run this before emitting `<artifact>`. P0 = must pass; P1 = should pass; P2 = nice to have.

## P0 — must pass

- [ ] **No raw hex outside `:root` token block.** Every color is `var(--bg)` / `var(--fg)` / `var(--muted)` / `var(--border)` / `var(--accent)` / `var(--surface)` (or a `color-mix()` of those). Grep `#[0-9a-fA-F]{3,8}` outside `:root{}` should return nothing.
- [ ] **All headings use `var(--font-display)`.** No sans-serif `<h1>` / `<h2>`. Inter / Roboto / system-sans never serve as a display face.
- [ ] **Accent appears at most twice per screen.** Count: eyebrow color, primary CTA fill, anything else? If three or more, demote one to `var(--fg)` or `var(--muted)`.
- [ ] **No purple/violet gradient backgrounds.** No `linear-gradient(... #a855f7 / #8b5cf6 / purple ...)`. The seed template has no gradients on backgrounds — keep it that way.
- [ ] **No emoji used as feature icons.** Use the inline SVG monoline marks shipped in Layout 3, or a tasteful single-character glyph in `--font-mono`. ✨ 🚀 🎯 are out.
- [ ] **No invented metrics.** Every number on the page came from the user, the brief, or is clearly labelled as a placeholder (e.g. `[REPLACE] · 38×`). "10× faster", "99.9% uptime" without source = remove.
- [ ] **No filler copy.** Zero "Feature One / Feature Two", lorem ipsum, "Lorem ipsum dolor". If a section feels empty, delete it; do not pad.
- [ ] **`data-od-id` on every top-level `<section>`.** Used by comment mode to target sections.
- [ ] **Mobile reflow works.** All `grid-2`, `grid-3`, `grid-4`, `grid-2-1`, `grid-1-2` collapse to one column at ≤920px (the default media query in `template.html` does this). Verify by mentally narrowing — no horizontal scroll.
- [ ] **No `scrollIntoView()` calls.** Breaks the OD preview iframe. Use `scrollTo({...})` if you need scroll behaviour.

## P1 — should pass

- [ ] **One decisive flourish.** A pull quote, a striking stat, a real-feeling photograph, one micro-animation on the hero. *One.* Not three.
- [ ] **Section rhythm alternates.** No two stat rows in a row. No two feature triplets in a row. No two quote blocks in a row.
- [ ] **Headlines under 14 words.** If longer, the writing is doing the design's job.
- [ ] **Lead text under 56 ch / two sentences.** `max-width: 60ch` on `.lead` enforces this; don't override.
- [ ] **CTA buttons say what happens.** "Start free" beats "Get Started". "Read the story" beats "Learn More".
- [ ] **Hover states present** for all `<a>` and `.btn`. Seed template covers this.
- [ ] **Numerics use `.num` (mono, tabular).** Prices, stats, version numbers, dates.
- [ ] **One image style per page.** Don't mix square portrait headshots with widescreen product hero with vertical phone mock — pick a lane.

## P2 — nice to have

- [ ] **`text-wrap: pretty` / `balance`** on long paragraphs / headings (already on `<p>` and `h*` in seed).
- [ ] **`color-mix()` for derived tones.** No additional `--accent-50` / `--accent-300` Bootstrap-style tokens — derive on the spot.
- [ ] **Sticky topnav has frosted glass** (already in seed via `backdrop-filter: blur()`).
- [ ] **Loaded fonts are system-first.** Iowan Old Style / Charter for serif, system stack for sans. Only pull a Google Font if DESIGN.md specifies one.

## Anti-slop spot-check

Look at the page for two seconds. If your gut says any of:

- "looks like every Cursor / Linear / Vercel ripoff I've seen this month"
- "this could be any AI startup's homepage"
- "the feature row has an icon, a heading, and three lines of vague benefit copy"

…go back, replace one feature cell with something more specific to *this* product (a screenshot, a concrete example, a sample of the actual output), and remove one accent.
