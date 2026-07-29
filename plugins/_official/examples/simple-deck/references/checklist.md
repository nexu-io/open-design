# Simple deck checklist

Run before final handoff. P0 must pass.

## P0 — must pass

- [ ] **Every `<section class="slide">` has a theme class.** Each is exactly one of: `light`, `dark`, `hero light`, `hero dark`. No bare `class="slide"`. No bare `class="slide hero"`.
- [ ] **One dominant surface is chosen from the active brand or direction.** Consecutive same-surface slides are valid. If the user or active DESIGN.md explicitly requires another surface program, record and follow that exception instead.
- [ ] **Every inverse slide has a named narrative purpose.** Chapter break, key reveal, proof point, or closing are valid; decoration and quota-filling are not.
- [ ] **Never alternate surfaces by slide index or quota.** A single-surface deck is valid when the story does not justify an inversion.
- [ ] **Display headlines use `var(--font-display)` (serif).** `.h-hero`, `.h-xl`, `.h-md` and `.quote-text` all enforce this — don't override.
- [ ] **No raw hex outside `:root`.** Every color is `var(--bg)` / `--fg` / `--muted` / `--border` / `--accent` / `--surface`. Grep `#[0-9a-fA-F]{3,8}` outside `:root{}` should return nothing.
- [ ] **Accent appears at most twice on any single slide.** On stat slides, the number itself is the only accent. Don't also color the eyebrow + a button + a border.
- [ ] **The 5-rule nav script is intact.** Don't replace `scroller()` with `document.body`. Don't drop one of the dual capture-phase listeners. Don't use `scrollIntoView()`. (The seed has the working version — leave it.)
- [ ] **No `scrollIntoView()` calls.** Breaks iframe boundaries.
- [ ] **`data-screen-label` on every slide** (e.g. `"01 Cover"`, `"05 Big stat"`). Used by chat for "edit slide 5".
- [ ] **No invented metrics.** Numbers come from the brief or a real source. "10× faster" / "99.9% uptime" without source = remove.
- [ ] **No emoji icons / no purple gradients / no rounded boxes with left-border accent.** Anti-slop trio.

## P1 — should pass

- [ ] **Cover is `hero light center` or `hero dark center` on the dominant surface.** Invert it only when the cover has an explicit narrative or brand reason.
- [ ] **Cover h1 ≤ 8 words.** A long cover headline is the writing's job, not the design's.
- [ ] **Body lead text under 56ch.** `max-width: 56ch` enforces this — don't override.
- [ ] **Big-stat slides have one number, not three.** If you have 3 numbers, give them 3 slides.
- [ ] **One quote per deck.** Two pull-quote slides feel like a brochure; one feels like a punctuation mark.
- [ ] **Closing slide is decisive.** A clear ask, a takeaway sentence, a date — not a "thank you".
- [ ] **Numerics in mono.** Stats, prices, version numbers, dates use `font-family: var(--font-mono)` (the `.stat-num` already does; `.meta` does).
- [ ] **At 1280×800 and 1440×900, no overflow.** Test by setting the browser to those sizes; nothing clips.

## P2 — nice to have

- [ ] **Position persists across refresh** (the seed's `localStorage` save/restore handles this).
- [ ] **Standalone progress and counter update as you advance** (already in seed). Keep both inside the seed's `data-deck-nav` container so Open Design can hide them when host navigation is present.

## Surface hierarchy spot-check

After you finish, run:

```
grep 'class="slide' index.html
```

Read the class list beside the slide labels. Healthy patterns include:

- `hero light` `light` `light` `hero dark` `dark` `light` — the inverse pair marks one narrative act
- `hero dark` `dark` `dark` `dark` — a valid single-surface deck with layout and scale creating rhythm

Bad patterns:

- `light dark light dark light dark` — strict alternation with no narrative purpose
- `light light dark light light` — an isolated inversion with no named role
- `hero hero hero hero` — no rest

If the deck feels flat, vary layout, scale, density, imagery, or typography first. Change the background only when the switch communicates a narrative role.
