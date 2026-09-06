---
name: go-movie
en_name: "GO MOVIE — Film Festival & Cinephile Hub"
zh_name: "GO MOVIE · 影迷互助情报站"
description: |
  A mobile-first information hub for film festivals and cinephile
  communities, based on GO MOVIE's production mobile information
  architecture and UI patterns. Renders a single-file mobile prototype
  with five navigable views — Home, Films, Cinemas, Saved, Profile —
  switched in place with no router and no reload. Home holds a dark hero
  for the active festival, scope pills, quick-entry cards, and a mixed
  "today's hot" two-column masonry feed; Films and Cinemas are browsable
  with filters; Saved live-syncs with the star-favorite buttons; reusable
  cards cover films, cinemas, limited merchandise, and practical
  attendance guides. Content-first and cinema-focused — the information
  is the interface, never a SaaS dashboard. Use when the brief asks for a
  film festival app, a cinephile information hub, a movie-festival guide,
  a film-week or exhibition companion, or any event-and-community
  discovery product where scattered information needs a single structured
  home.
zh_description: |
  面向电影节与影迷社群的移动端信息助手，以 GO MOVIE 生产版移动端信息架构与
  UI 模式为基础。首页深色 Hero、影展专题切换、快速查阅、今日热门双列瀑布流，
  以及影片 / 影院 / 周边物料 / 实用攻略四类卡片，支持搜索、筛选与 ★ 收藏。
  内容优先、电影文化导向，而非后台仪表盘。
triggers:
  - "film festival app"
  - "cinephile information hub"
  - "movie festival guide"
  - "film week companion"
  - "film exhibition app"
  - "电影节信息助手"
  - "影迷攻略"
  - "影展信息平台"
  - "电影节"
od:
  mode: prototype
  surface: web
  platform: mobile
  scenario: entertainment
  preview:
    type: html
    entry: index.html
  design_system:
    requires: true
    sections: [color, typography, layout, components]
  craft:
    requires: [typography, typography-hierarchy, color, anti-ai-slop, accessibility-baseline, state-coverage, laws-of-ux]
  example_prompt: "Design a mobile-first information hub for an independent international film festival, based on GO MOVIE's information architecture. Help cinephiles discover films, understand cinemas, find limited festival merchandise, read practical attendance tips, filter content by festival topic and venue, and save useful items. The experience should feel cinema-focused and content-first rather than like a SaaS dashboard."
  example_prompt_i18n:
    zh-CN: "设计一个服务电影节观众的移动端信息助手，包含影片推荐、影院攻略、周边物料、影展专题、今日热门、搜索、筛选和收藏。"
---

# GO MOVIE — Film Festival & Cinephile Information Hub

Produce a single self-contained mobile web page (390px viewport) that reads
like a real film-festival product, not a dashboard. It is a single-file SPA
with five navigable views — Home, Films, Cinemas, Saved, Profile — switched
in place by toggling `.app-view.active` (no router, no hash, no reload).
Home anchors the festival scope; Films and Cinemas hold browsable lists with
filters; Saved mirrors the star-favorite buttons; Profile is a lightweight
settings surface. Four reusable content cards (Film, Cinema, Merch, Guide)
are shared across Home, list views, and Saved.

The product serves **cinephiles who need to know what to watch, how a venue
actually works, where to collect a limited poster, and how to survive the
gaps between screenings** — real-world logistics and community knowledge,
structured.

## Resource map

```
go-movie/
├── SKILL.md                              ← you're reading this
├── example.html                          ← baked reference (READ FIRST)
└── references/
    ├── checklist.md                      ← P0 gates, run before handoff
    ├── information-architecture.md       ← festival → topic → type → item model
    └── components.md                     ← card + section specs
```

## Visual source of truth

**The bundled `example.html` is the visual source of truth.** It reproduces
GO MOVIE's production UI language: warm paper background `#f5f0e6`, card
`#fffdf8`, ink text `#25211c`, brand red `#8f2f2f`, gold kicker `#a88652`,
dark page head `#25211c`, a system sans-serif stack (no serif), ticket-style
merch cards, a two-column masonry feed, and star (★/☆) favorites — never
bookmarks.

Preserve GO MOVIE's information hierarchy, spacing, card density, navigation
patterns, content-first presentation, and mobile UI language. You may swap
the festival, city, films, venues, merch, and copy, and adjust the brand
accent only when explicitly requested. **Do not reinterpret GO MOVIE as a
generic editorial film app, and do not redesign the interface language.**
Start from the bundled GO MOVIE UI patterns and generalize the content.

Specific layout contracts:

- **Today's Hot** is a two-column masonry feed inspired by the production
  GO MOVIE home page, mixing image cards and quote/text cards (no ticket
  perforation, no tear holes).
- **Film cards** use a wide cinematic image with a left-side information
  gradient rather than a conventional vertical-poster list layout.
- **Practical guides** reuse the masonry text-card language instead of
  forming a separate generic list UI.

## Workflow

1. **Read `example.html`** end-to-end. It is the canonical reference for the
   GO MOVIE layout, density, spacing, and component language. Copy its
   skeleton and restyle; do not re-derive the structure from scratch.
2. **Read the active DESIGN.md** (injected above). Map its tokens onto the
   `:root` variables (`--gm-bg`, `--gm-card`, `--gm-text`, `--gm-primary`,
   `--gm-gold`, `--gm-border`, `--gm-dark`). Keep the accent budget: the
   brand red `--gm-primary` is used for active states, category labels, and
   saved stars — never as a full-page theme.
3. **Read `references/information-architecture.md`** and model the brief as
   Festival → Topic → Content type → Item. Remember that one item can belong
   to several dimensions at once — a tote belongs to a festival, a venue, and
   a film — and surface those cross-links instead of flattening everything.
4. **Read `references/components.md`** and select the sections and cards the
   brief actually needs. Minimum: hero, scope pills, quick entries, hot feed,
   and at least Film + Cinema cards. Merch and Guide cards are the template's
   signature — keep them whenever the festival has physical goods or
   real-world attendance logistics.
5. **Write `index.html`** as one self-contained file: inline CSS and JS, no
   CDN, no external images, no backend. Use the system sans-serif stack for
   all text, monoline SVG icons (`currentColor`), and locally bundled WebP
   images from `assets/` for the festival hero, film posters, and
   merchandise (see the "Real imagery" rule). Favorites are ★/☆ stars, not
   bookmarks. Build the five views as `.app-view` sections and switch them by
   toggling `.active` — each tab carries `data-view-target`, and switching
   resets `scrollTop`, updates `aria-current`, and never reloads. Keep the
   Saved view in sync with the star buttons: one shared key per item toggles
   the star, the header badge, and the Saved entry together.
6. **Self-check against `references/checklist.md`.** Every P0 must pass before
   handoff. Pay special attention to no horizontal overflow at 390px, tap
   targets ≥ 44px, and "most useful first" ordering in the hot feed.

## Hard rules

- **Mobile-first.** The viewport is 390px wide; the content scrolls inside
  the screen while the chrome (status bar, tab bar) stays fixed. No desktop
  dashboard, no side rails, no heavy device bezel.
- **GO MOVIE is the visual source of truth.** Do not reinterpret it as a
  generic editorial film app. Generalize the content (festival, city, films,
  venues, merch, copy), not the core interface language.
- **Real navigation, not visual-only tabs.** Every bottom tab and the
  header Saved button switch to a real view; no tab may be a dead control.
  View state, `aria-current`, and scroll position must stay in sync.
- **Information over decoration.** Every element serves discovery: a film's
  session time, a cinema's arrival tip, a merch item's pickup rule. No
  meaningless statistics, no gradient showcases, no marketing numbers.
- **One content item, many dimensions.** Cross-link film ↔ venue ↔ merch ↔
  guide rather than flattening everything into an undifferentiated list. This
  multi-dimensionality is what separates this template from a generic movie
  database app.
- **Real imagery, not flat placeholders.** Use meaningful visual assets:
  a festival key visual for the hero, poster imagery for film cards, and
  physical-item imagery for merch cards. Never ship flat-color placeholders
  when the artifact expects real imagery — and never use copyrighted film
  posters or real film stills.
- **Real copy only.** Specific film titles, directors, durations, session
  times, pickup rules. Write `—` or a labelled grey block when a fact is
  genuinely unknown — never fabricate one.
- **Quick Access uses icon + label, centered.** Three compact cards per row,
  each with a meaningful monoline SVG icon and a centered bold label — never
  abstract numbering (01/02/03). The icon + label group is centered both
  horizontally and vertically within each card.
- **Text masonry cards use an oversized decorative quote with optical
  alignment and alternating direction.** The opening `"` is visibly large
  (≈54px) and low-contrast, optically left-aligned to the headline via a
  small negative `margin-left` (~-7px) to compensate for glyph side bearing.
  Some cards instead use a closing `"` aligned to the content's lower-right
  edge (negative `margin-right`). Quote direction is deterministic per card
  (not random) — pick the variant that reads best for the content. The same
  component is reused by Today's Hot text cards, Practical Guide cards, and
  the Saved view's guide clones.
- **Merchandise in overview surfaces uses the same compact image-card
  masonry language as the home hot feed.** No ticket perforation, no tear
  holes, no full-detail fact rows in the overview — just image + title +
  物料周边 · type + source + favorite. The compact pill 可领取 / 余量不多
  is the only status chrome. Detailed pickup rules belong in detail
  surfaces, not the overview masonry.
- **Saved uses the same 2-column masonry as the home hot feed.** Saved
  films and merchandise use compact image cards; saved guides reuse the
  text/quote card component; saved cinemas use compact info cards. Do not
  group Saved content into separate full-width Film / Merch / Guide /
  Cinema sections.
