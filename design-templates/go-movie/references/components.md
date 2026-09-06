# Components — film festival / cinephile hub

Every component below lives inside the 390px viewport. The bundled
`example.html` is the visual source of truth — reproduce GO MOVIE's
production UI language: warm paper `#f5f0e6`, card `#fffdf8`, ink `#25211c`,
brand red `#8f2f2f`, gold `#a88652`, dark head `#25211c`, system sans-serif,
ticket-style merch cards, a two-column masonry feed, and ★/☆ star favorites.
The accent is the brand red, used for active states, category labels, and
saved stars — never as a full-page theme.

## Hero

- **When:** always — it anchors the festival scope at the top of the page.
- **Shows:** the brand eyebrow ("GO MOVIE｜影迷互助情报站"), a scope badge,
  the festival name (bold sans, e.g. 港湾国际电影周), a bilingual subtitle,
  a gold rule + one-line description, and the dates. No CTA button.
- **Priority:** brand → name → subtitle → dates.
- **Visual:** a festival key visual image (`assets/festival-hero.webp`,
  `object-fit: cover`) under a dark left-to-right gradient overlay, with
  warm-white text and a gold accent. The key visual is **required** — never
  a flat color block, never a magazine cover, never a stock photo, never a
  purple gradient.
- **Mobile:** full width, text padded to the screen gutter.

## Scope pills

- **When:** whenever the festival has programmes, strands, or months to
  filter by.
- **Shows:** one pill per scope (港湾国际电影周 / 法国电影展 / 加拿大电影展 …),
  3 per row; the active pill is filled red `#8f2f2f` with white text, the
  rest are outlined with a subtle red border.
- **Priority:** the default/active scope is the broadest.
- **Behavior:** selecting a pill re-filters the content below *in place* —
  the hero may update, the page does not jump or reload.

## Quick access

- **When:** always — this is the front door to the core jobs.
- **Shows:** 2–6 entries, each an **inline monoline SVG icon + centered bold
  label** (物料周边 / 影院指北 / 吃喝住娱). Follow GO MOVIE's non-SIFF scope:
  3 entries, no "films" entry (films live behind the bottom tab). No abstract
  numbering (01/02/03).
- **Priority:** the jobs a first-time visitor needs most, in that order.
- **Mobile:** a 3-per-row grid; each card ≥ 44px tall. The icon + label group
  is centered both horizontally and vertically within the card.

## Film card

- **When:** any film in the Films list (and the Saved clones).
- **Shows:** a **wide cinematic card** — a horizontal film still / backdrop
  (`assets/film-*-wide.webp`, `object-fit: cover`, shifted right) with a
  left-side information gradient (`rgba(255,253,248,1) → transparent`), plus:
  film name, tags, country · year · runtime, director, a score
  (影迷评分, brand red), and a ★/☆ favorite pinned top-right.
- **Priority:** title + score read first; director and tags are the metadata.
- **Hard rules:** wide image + left gradient information layer; score and
  director visible; favorite at top-right. **Never** a generic vertical
  poster + right-side text list, and never a flat-color placeholder.

## Cinema card

- **When:** any venue in the "影院指北" view.
- **Shows:** name, address, halls, transport, and real-world tips
  (检票 / 座位 / 散场) plus a cinephile note.
- **Priority:** name, then transport + arrival tip (the highest-value facts
  for someone running between screenings).
- **Mobile:** tips render as a label:value list; keep the note to 1–2 lines.

## Merch card (overview masonry)

- **When:** the "物料周边" overview section on the home page.
- **Shows:** a compact image-card — a 4:3 physical-item image, title, a
  `物料周边 · <type>` category (brand red), an availability pill (可领取 /
  余量不多), source/author, and a ★/☆ favorite.
- **Priority:** image + title + availability first; the pickup point and
  condition belong in detail surfaces, not the overview masonry.
- **Mobile:** 2-column `.masonry` (same language as Today's Hot and
  Practical Guides). Cards vary naturally in height.
- **Hard rules:** **no ticket perforation, no circular tear holes, no
  full-detail fact rows (领取 / 数量 / 条件) in the overview.** Detailed
  pickup rules are out of scope for the home overview.

## Guide card

- **When:** the festival has real-world logistics worth capturing.
- **Shows:** the **same masonry text-card language as Today's Hot** — a
  low-saturation tinted block with an **oversized decorative opening quote**
  (≈48px, low-contrast, sharing the headline's left edge) + headline, a
  category label (赶场 / 吃喝 / 排队 / 观影礼仪), a short actionable tip, and a
  ★/☆ favorite.
- **Priority:** the single most actionable sentence first.
- **Mobile:** cards vary naturally in height; no generic single-column
  settings-card layout.

## Hot feed card

- **When:** the "今日热门" mixed feed on the home page.
- **Shows:** a **two-column masonry feed** with two variants:
  1. **image card** — a film still / merch photo + title + category + source + ☆;
  2. **quote/text card** — a tinted block with an **oversized decorative
     quote** (≈54px, low-contrast) using one of two variants:
     - **opening variant** (`.quote-open`) — a `"` placed above the
       headline, optically left-aligned via a small negative `margin-left`
       (~-7px) to compensate for glyph side bearing;
     - **closing variant** (`.quote-close`) — a `"` placed below the
       headline, right-aligned (`text-align: right`) and offset rightward
       by a small negative `margin-right` (~-5px).
     + headline + category + summary + ☆.
- **Priority:** ordered by usefulness — alerts and avoid-tips outrank plain
  announcements. This is deliberate: the feed is not chronological.
- **Hard rules:** pure CSS `column-count: 2` masonry; image and text cards
  mixed; **no ticket perforation, no circular tear holes**. Quote direction
  is deterministic per card (not random) — pick the variant that reads best
  for the content.

## Quote text card (two variants)

- **When:** text/quote cards in Today's Hot, Practical Guides, and Saved
  guide clones.
- **Shows:** a tinted `.mc-quote` block containing one of:
  - **Opening quote** — a `"` above the headline (`.quote-open` with
    `margin: 0 0 8px -7px`);
  - **Closing quote** — a `"` below the headline (`.quote-close` with
    `margin: 12px -5px 0 0; text-align: right`).
- **Priority:** opening quotes read as anticipation; closing quotes read as
  a punchline. Pick the variant that best serves the card's content. Mix
  both variants across the home feed for natural rhythm — do not use the
  same variant on every card.
- **Hard rules:** quote marks remain decorative (low contrast, ≤15% opacity,
  not brand red, not gold). Glyph side bearing is corrected with a small
  negative margin — DOM `getBoundingClientRect().left` equality is not
  enough; verify visually with a screenshot. Opening and closing variants
  should maintain comparable optical spacing from the headline (the DOM
  line-box gap for the open variant is intentionally smaller than the close
  variant because the quote glyph sits in the top portion of its line box
  — the visible gap is roughly equal). Close-variant cards use a reduced
  bottom padding (`.mc-quote-close { padding-bottom: 8px }`) so that the
  quote mark is not followed by artificial card-bottom whitespace.

## Saved masonry

- **When:** the user opens the Saved (我的收藏) view.
- **Shows:** a single 2-column masonry of **compact** cards, one per saved
  item, mixed freely:
  - **Film** → compact image card (poster + title + 影片推荐 + 影迷评分 + meta)
    — never the wide cinematic Film card;
  - **Merch** → compact image card (item photo + title + 物料周边·类型 + source)
    — never the full ticket-card with 领取/数量/条件;
  - **Guide** → the same quote/text card as Today's Hot / Practical Guides;
  - **Cinema** → compact info card (name + address + 交通/检票 + note).
- **Priority:** identification and quick recall — the full-detail cards live
  on their respective pages.
- **Hard rules:** Saved does not reuse full-detail cards. Saved does not
  group content into separate "收藏的影片 / 收藏的物料 / 收藏的影院" sections;
  the type is shown as a small `mc-type` tag inside each card instead. An
  empty state appears when the saved count is 0.

## Filter

- **When:** a search/filter surface for topics, venues, months, and content
  types.
- **Shows:** topic, month, venue, and content-type facets.
- **Behavior:** filters refine in place; no full-page reload; a clear way to
  reset.

## Favorite / Save

- **When:** on every savable item (film, merch, guide, cinema).
- **Shows:** a ★/☆ star glyph (text, not a bookmark) with an optional count.
  Saved = ★, unsaved = ☆; the saved star uses the brand red.
- **Behavior:** persists for the session; the count feeds the "收藏" tab,
  the header star badge, and the Saved view (which live-syncs).

## Bottom navigation

- **When:** always — this is the app's persistent frame.
- **Shows:** 首页 / 影片 / 影院 / 收藏 / 我的 (adjust labels to the brief).
  The 收藏 tab uses a ☆/★ star icon.
- **Behavior:** GO MOVIE tabbar — `#fffdf8` bar, inactive `#7b746a`, active
  red `#8f2f2f` (weight 600); the active tab is marked (`aria-current`); each
  tab ≥ 44px.
