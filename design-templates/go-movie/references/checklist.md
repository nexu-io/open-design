# GO MOVIE — pre-emit checklist

Run this before handing off `index.html`. P0 must pass — quote each P0 row
back as `[x]` or `[ ]` and do not emit while any P0 is unchecked.

The bundled `example.html` is the visual source of truth: reproduce GO MOVIE's
production UI language (warm paper `#f5f0e6`, card `#fffdf8`, ink `#25211c`,
brand red `#8f2f2f`, gold `#a88652`, dark head `#25211c`, system sans-serif,
two-column masonry cards with oversized decorative quotes, ★/☆ star favorites).
Do not reinterpret it as a generic editorial film app.

## P0 — Layout

- [ ] **390px viewport, not a heavy device mockup.** No thick black bezel,
  no Dynamic Island, no oversized drop shadow. The GO MOVIE UI is the focus.
- [ ] **No horizontal overflow.** Nothing is wider than the 390px viewport;
  the scroll area is `overflow-x: hidden`. Every grid uses `minmax(0, 1fr)`
  or percentage widths that sum to ≤ 100%.
- [ ] **Content scrolls, chrome doesn't.** Only `.scroll` moves; the status
  bar and tab bar stay fixed.

## P0 — Navigation

- [ ] **Bottom navigation switches to real views.** Each tab (`data-view-target`)
  shows its corresponding `.app-view` and hides the others — not a visual-only
  active state.
- [ ] **Header Saved opens the Saved view.** The header star button calls the
  same view switch as the Saved tab.
- [ ] **No tab may be visual-only.** Every tab and quick-action shortcut
  navigates or scrolls to a real target; there are no dead controls.
- [ ] **State stays in sync.** Only the active view is shown, the matching tab
  has `.active` + `aria-current="page"`, other tabs have `aria-current`
  removed, and the scroll area resets to `scrollTop = 0` on switch — without
  a page reload or hash/router dependency.

## P0 — Information hierarchy

- [ ] **"Most useful first."** The hot feed is ordered by usefulness
  (venue alerts, avoid-tips, sold-out warnings) — not by content type and
  not alphabetically.
- [ ] **GO MOVIE type hierarchy.** System sans-serif (`PingFang SC` / `Source
  Han Sans` stack) for everything; brand red `#8f2f2f` for category labels,
  gold `#a88652` for kickers, ink `#25211c` for titles. No serif display.
- [ ] **Cross-links visible.** Merch items name their film/venue; cinema
  cards name their transport and tips; film cards name their venue + time.

## P0 — Content authenticity

- [ ] **No lorem ipsum**, no "Feature one / two / three", no placeholder
  bracketed text left unfilled.
- [ ] **No fabricated data.** Session times, durations, pickup rules, and
  capacities are specific and plausible for the festival; unknown facts are
  `—` or a labelled grey block, never invented metrics ("10× faster",
  "99.9% uptime").
- [ ] **No real-world branding the user didn't supply.** Use a neutral
  festival name (e.g. 港湾国际电影周 / Harbor International Film Week) unless
  the brief names a real one. No lifted film posters or copyrighted artwork.
- [ ] **Demo is honest.** A footer or badge marks the schedule as sample
  content when the data was not supplied by the user.

## P0 — Interaction states

- [ ] **Tap targets ≥ 44px.** Quick actions, tabs, pills, and star buttons
  all meet the floor.
- [ ] **Visible states.** Active pill/tab, saved ★ vs unsaved ☆, and button
  press feedback are all visible. No dead controls.
- [ ] **`prefers-reduced-motion` respected.** Transitions and any motion do
  not animate when the user prefers reduced motion.

## P0 — Image handling

- [ ] **No external images.** No CDN, no `unsplash`/`picsum`/`placehold`
  URLs, no remote fonts. Everything is inline SVG, CSS, or locally bundled.
- [ ] **No blank image regions.** Every image region shows a real visual —
  never an empty grey box.
- [ ] **Images are ≤ 250 KB and locally bundled** under `assets/` (WebP
  preferred) — and licensed or original.

## P0 — Visual assets

- [ ] **Festival Hero has a meaningful key visual image** (a harbour /
  cinema / abstract key visual), covered with a legibility gradient.
- [ ] **Film cards do not ship flat-color placeholders.** Every film card
  uses a wide cinematic image.
- [ ] **Merch cards show the physical item clearly** — the image is the
  primary content, never an icon or abstract color block.
- [ ] **No remote image dependencies.** All imagery is local under `assets/`.
- [ ] **Images are locally bundled and optimized** (WebP, single file
  < 250 KB, correct ratio: hero ~3:2, film wide 3:2, merch 4:3 or 1:1).

## P0 — Film fidelity

- [ ] **Film cards use wide imagery** (a horizontal still, not a vertical
  poster).
- [ ] **Information overlays from the left** with a white/card gradient.
- [ ] **Score and director metadata are visible** (影迷评分 in brand red).
- [ ] **No vertical-poster list layout.**

## P0 — Home masonry fidelity

- [ ] **Today's Hot uses two-column masonry** (`column-count: 2`).
- [ ] **Image cards and text cards are both present.**
- [ ] **No ticket perforation** in the hot feed.
- [ ] **No tear-hole circles** in the hot feed.

## P0 — Guide fidelity

- [ ] **Practical guides use the same masonry language** as Today's Hot.
- [ ] **Section title stays left aligned.**
- [ ] **Cards vary naturally in height.**
- [ ] **No generic single-column settings-card layout.**

## P0 — Quick access fidelity

- [ ] **Three quick cards remain one row at 390px.**
- [ ] **Each card uses a meaningful monoline SVG icon** (box / cinema screen /
  cup), never abstract numbering.
- [ ] **No `01` / `02` / `03` numbering remains.**
- [ ] **Icon + label are horizontally centered** within each card.
- [ ] **Icon + label group is vertically centered** within each card.

## P0 — Text card typography

- [ ] **Opening quote is visibly oversized** (≈54px, decorative).
- [ ] **Opening quote is **optically** left-aligned to the headline** (small
  negative `margin-left` to compensate for glyph side bearing), not just DOM-
  left-aligned. Verify with a screenshot — DOM `getBoundingClientRect().left`
  equality is not enough.
- [ ] **Closing quote (`.quote-close`) is right-aligned** to the content's
  right edge, with a small negative `margin-right` for glyph optical
  alignment.
- [ ] **Both quote variants are present** in the masonry feed (opening +
  closing), and the direction assignment is deterministic.
- [ ] **Quote is decorative and low contrast** (≤15% opacity).
- [ ] **Quote does not float centered above the title.**

## P0 — Merch masonry fidelity

- [ ] **Merch overview uses two-column masonry** (`column-count: 2`),
  shared with Today's Hot and Practical Guides.
- [ ] **Merch cards use the image-card form** (`.mc` + `.mc-img` +
  `.mc-body` + `.mc-title` + `.mc-cat` + `.mc-src` + ★/☆).
- [ ] **No ticket perforation or circular tear holes** in the merch
  overview.
- [ ] **No full-detail fact rows** (领取 / 数量 / 条件) in the overview —
  detailed pickup rules belong in detail surfaces.
- [ ] **Availability pill (可领取 / 余量不多) is preserved** as a compact
  status chrome.
- [ ] **Images remain locally bundled** under `assets/`.

## P0 — Saved fidelity

- [ ] **Saved uses a single 2-column masonry** (`column-count: 2`).
- [ ] **No full-width grouped Film / Merch / Guide / Cinema sections** in
  Saved (no `.saved-group` / `.saved-h` "收藏的影片" headings).
- [ ] **Saved film cards use compact image-card form**, never the wide
  cinematic film card (`card-backdrop` / `card-overlay`).
- [ ] **Saved merch cards use compact image-card form**, never the full
  ticket-card (`ticket-perforation` / 领取 / 数量 / 条件).
- [ ] **Saved guide cards reuse the same quote/text card** as Today's Hot
  and Practical Guides.
- [ ] **Saved cinema cards use compact info-card form** (name + address +
  交通/检票 + note).
- [ ] **Unsave removes the card immediately** from the Saved masonry.
- [ ] **Empty state appears** when the saved count is 0; masonry hides.
- [ ] **Saved count syncs** with the header badge and the profile summary.

## P0 — Accessibility

- [ ] **Body contrast ≥ 4.5:1**, secondary text ≥ 4.0:1 against its surface.
- [ ] **Icons have labels.** Icon-only buttons carry `aria-label`; tabs and
  pills use proper roles and `aria-current`/`aria-pressed`.
- [ ] **Headings are real headings.** `<h1>` once, then `<h2>`/`<h3>` in
  order; no heading markup used purely for size.

## P0 — No AI slop

- [ ] **Accent is the GO MOVIE brand red `#8f2f2f`**, not indigo
  (`#6366f1`, `#4f46e5`, `#8b5cf6`, …). The accent is used for active
  states, category labels, and saved stars — never as a full-page theme.
- [ ] **No two-stop purple→blue/indigo→pink gradient.** Backgrounds are flat
  or single-hue.
- [ ] **No emoji as UI icons.** Monoline SVG only (star ★/☆ favorites are
  text glyphs, not emoji).
- [ ] **System sans-serif stack** (no serif, no Inter as a display face).
- [ ] **No rounded card with a colored left border.**

## P1 — should pass

- [ ] Hero states the festival, dates, location, and a one-line status —
  plus the scope/brand eyebrow, matching GO MOVIE's dark hero.
- [ ] Scope pills read as segments of one festival, not unrelated tabs; the
  active pill is obvious (red fill) and the list below visibly follows.
- [ ] Quick entries are 2–6 items, each a monoline SVG icon + centered bold
  label, in a 3-per-row grid like GO MOVIE's non-SIFF scope.
- [ ] Hot feed mixes at least three content types (物料 / 影片 / 提醒 / 避坑 /
  影迷推荐 / 更新) as masonry cards (image + text variants) with ★ favorite counts.
- [ ] Film cards show poster, title, country · year · duration, a reason,
  tags, and a session status.
- [ ] Merch overview cards show image, title, 物料周边·type, source, and
  availability pill (可领取 / 余量不多) + ★ favorite. Detailed pickup
  rules belong in detail surfaces.
- [ ] Cinema cards show name, address, halls, transport, and at least one
  real-world tip (检票 / 座位 / 散场) plus a cinephile note.
- [ ] Save (★/☆) works for films, merch, guides, and cinemas.

## P2 — nice to have

- [ ] `data-od-id` on the frame, header, and each major section.
- [ ] Alternating density — one tight section, one breathing section.
- [ ] A single memorable detail (a venue's "arrive 25 min early" note, a
  pillar warning on specific seats) that only a product owner would know.
