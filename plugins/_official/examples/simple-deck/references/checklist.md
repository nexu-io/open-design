# Simple deck checklist

Run before emitting `<artifact>`. P0 must pass.

## P0 — must pass

- [ ] **Every `<section class="slide">` has a theme class.** Each is exactly one of: `light`, `dark`, `hero light`, `hero dark`. No bare `class="slide"`. No bare `class="slide hero"`.
- [ ] **No 3+ same-theme slides in a row.** Mentally list the classes from slide 1 to N — if you see `light light light` anywhere, change the middle one.
- [ ] **For 8+ slides: at least one `hero dark` AND at least one `hero light`.** A long all-light deck is sleepy; a long all-dark deck is heavy.
- [ ] **Display headlines use `var(--font-display)` (serif).** `.h-hero`, `.h-xl`, `.h-md` and `.quote-text` all enforce this — don't override.
- [ ] **No raw hex outside `:root`.** Every color is `var(--bg)` / `--fg` / `--muted` / `--border` / `--accent` / `--surface`. Grep `#[0-9a-fA-F]{3,8}` outside `:root{}` should return nothing.
- [ ] **Accent appears at most twice on any single slide.** On stat slides, the number itself is the only accent. Don't also color the eyebrow + a button + a border.
- [ ] **The 5-rule nav script is intact.** Don't replace `scroller()` with `document.body`. Don't drop one of the dual capture-phase listeners. Don't use `scrollIntoView()`. (The seed has the working version — leave it.)
- [ ] **No `scrollIntoView()` calls.** Breaks iframe boundaries.
- [ ] **`data-screen-label` on every slide** (e.g. `"01 Cover"`, `"05 Big stat"`). Used by chat for "edit slide 5".
- [ ] **No invented metrics.** Numbers come from the brief or a real source. "10× faster" / "99.9% uptime" without source = remove.
- [ ] **No emoji icons / no purple gradients / no rounded boxes with left-border accent.** Anti-slop trio.

## P1 — should pass

- [ ] **Cover is `hero light center`.** Inverting cover-to-dark works only when the entire deck is dark.
- [ ] **Cover h1 ≤ 8 words.** A long cover headline is the writing's job, not the design's.
- [ ] **Body lead text under 56ch.** `max-width: 56ch` enforces this — don't override.
- [ ] **Big-stat slides have one number, not three.** If you have 3 numbers, give them 3 slides.
- [ ] **One quote per deck.** Two pull-quote slides feel like a brochure; one feels like a punctuation mark.
- [ ] **Closing slide is decisive.** A clear ask, a takeaway sentence, a date — not a "thank you".
- [ ] **Numerics in mono.** Stats, prices, version numbers, dates use `font-family: var(--font-mono)` (the `.stat-num` already does; `.meta` does).
- [ ] **At 1280×800 and 1440×900, no overflow.** Test by setting the browser to those sizes; nothing clips.

## P2 — nice to have

- [ ] **Position persists across refresh** (the seed's `localStorage` save/restore handles this).
- [ ] **Top progress bar fills as you advance** (already in seed).
- [ ] **Counter pill is visible at all times** (already in seed).

## Theme rhythm spot-check

After you finish, run:

```
grep 'class="slide' index.html
```

Read the class list as a single sequence. The healthy patterns look like:

- `hero light` `light` `hero dark` `light` `dark` `hero light` `light` `hero dark`
- `hero light` `light` `light` `dark` `hero light` `dark` `hero dark`

Bad patterns:

- `light light light light light light` — flat
- `dark dark dark dark dark dark` — heavy
- `hero hero hero hero` — no rest

If your sequence is bad, swap a few middle slides to rebalance.
