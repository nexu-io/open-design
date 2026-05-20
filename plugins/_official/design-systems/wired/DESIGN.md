# Design System Inspired by WIRED

> Category: Media & Consumer
> Tech magazine. Paper-white broadsheet density, custom serif display, mono kickers, ink-blue links.

## 1. Visual Theme & Atmosphere

WIRED's homepage feels like a printed broadsheet that someone has plugged into a wall socket. The grid is dense, the rules are thin, the type is loud, and almost every surface is paper-white or pure black with no rounded corners and no decoration that doesn't earn its place. Image rectangles butt directly against headlines, hairline dividers separate stories the way pica rules separate columns in a real magazine, and the only colors that aren't grayscale come from the photography itself. There is no "card with shadow" anywhere — the entire layout is held together by typographic weight and the discipline of rules and whitespace, the same way a Condé Nast print page would be assembled in a paste-up room.

The signature move is the **typographic stack**: a brutally large custom serif (WiredDisplay) for the main headline, a humanist serif (BreveText) for body and decks, a geometric sans (Apercu) for UI affordances, and a hard mono uppercase (WiredMono) for the kickers, eyebrows, and timestamps that mark every story. That mono kicker — usually black caps with letter-spacing wide enough to read as a Geiger-counter tick — is what makes a WIRED page instantly recognizable from across the room.

There is exactly one accent color that matters: a saturated link blue (`#057dbc`) that lights up underlined hover states like a CRT scanline. Everything else is black, paper white, and two grays — the design's confidence comes from refusing to invent more.

**Key Characteristics:**
- Newsstand-density editorial grid: rules and whitespace, never cards or shadows
- Custom serif display + technical mono kickers — the Condé-Nast-meets-engineering-lab voice
- Strictly square corners on every image, container, and ribbon (only icon buttons are circular)
- 2px hard black borders on buttons and links — printerly, not webby
- Mono ALL-CAPS eyebrows on every story with wide tracking (0.9–1.2px)
- Single ink-blue accent for links; everything else lives in pure grayscale
- Dark theme = the *footer*, not the page; the page itself is committed paper-white

## 2. Color Palette & Roles

### Primary (Editorial Ink)
- **WIRED Black** (`#000000`): Pure ink for ribbons, section dividers, button borders, headline rules — the strongest hand on the page.
- **Page Ink** (`#1a1a1a`): Near-black used for headlines and body type. Slightly softened so long-form reading doesn't feel like staring at a power button.
- **Paper White** (`#ffffff`): Default canvas for the entire site. Treat it like newsprint stock — uninterrupted, never tinted.

### Secondary (Editorial Voice)
- **Link Blue** (`#057dbc`): The single brand accent. Used for inline link hovers, breadcrumbs, and the rare button — never for backgrounds, never decorated. Think of it as the only color allowed in a black-and-white film.

### Surface & Background
- **Newsprint** (`#ffffff`): Editorial pages, story grids, hero zones.
- **Footer Ink** (`#1a1a1a`): The only inverted region on the homepage. Paper white type sits on top.
- **Hairline Tint** (`#e2e8f0`): Reserved for `<hr>` elements between sections — barely visible, like a margin rule.

### Neutrals & Text
- **Headline Black** (`#1a1a1a`): All H1/H2 display type.
- **Body Gray** (`#1a1a1a`): Long-form body text — same ink as headlines for unity.
- **Caption Gray** (`#757575`): Secondary metadata: bylines, timestamps, photo credits.
- **Disabled Gray** (`#999999`): Inactive links, low-priority labels.
- **Hairline Border** (`#e2e8f0`): Subtle separators only.

### Semantic & Accent
- **Brand Hover Blue** (`#057dbc`): Link rollover state — also serves as the only "interactive" cue.
- *(WIRED's homepage intentionally omits semantic success/error/warning palettes — this is editorial, not a SaaS dashboard.)*

### Gradient System
None. WIRED uses zero gradients. The closest thing to a gradient on the page is the tonal range inside a photograph — gradients live *in the imagery*, not in the chrome.

## 3. Typography Rules

### Font Family
- **WiredDisplay** (custom serif, fallback `helvetica`) — Display headlines and feature titles.
- **BreveText** (humanist serif, fallback `helvetica`) — Article body, decks, longer captions.
- **Apercu** (geometric sans, fallback `helvetica`) — UI labels, buttons, navigation, mid-weight headings.
- **WiredMono** (custom monospace, fallback `helvetica`) — Eyebrows, kickers, timestamps, section labels, ALL CAPS.
- **Inter** (sans, system fallback) — Utility UI in newer modules.
- **ProximaNova** (sans, fallback `helvetica`) — Legacy UI surfaces.
- **WIRED Mono** (custom mono, fallback `Monaco, Courier New, Courier`) — Article-page eyebrows.

### Hierarchy

| Role | Font | Size | Weight | Line Height | Letter Spacing | Notes |
|---|---|---|---|---|---|---|
| Display Headline (Hero) | WiredDisplay | 64px / 4.00rem | regular | 0.93 | -0.5px | Tight, almost touching descenders — newsstand presence |
| Display Headline (Mobile / Mid) | WiredDisplay | 26px / 1.63rem | regular | 1.08 | — | Same face, scaled down for grid blocks |
| Section Heading | Apercu | 20px / 1.25rem | 700 | 1.20 | -0.28px | Bold sans for module titles ("Most Popular", "Featured") |
| Subheading | Apercu | 17px / 1.06rem | 700 | 1.29 | -0.144px | Story decks within feature blocks |
| Article Deck (Serif) | BreveText | 19px / 1.19rem | regular | 1.47 | 0.108px | Long-form lead paragraphs |
| Article Body (Serif) | BreveText | 16px / 1.00rem | regular | 1.50 | 0.09px | Standard paragraph text |
| UI Heading | Apercu | 16px / 1.00rem | 700 | 1.25 | 0.3px | Inline UI labels, button captions |
| Button Label | Apercu | 16px / 1.00rem | 700 | 1.25 | 0.3px | All caps optional, depending on placement |
| Link (Inline UI) | Apercu | 14px / 0.88rem | regular | 1.29 | 0.4px | Footer links, secondary nav |
| Eyebrow / Kicker | WiredMono | 13px / 0.81rem | regular | 1.23 | 0.92px | UPPERCASE — story category above headline |
| Eyebrow Bold | WiredMono | 13px / 0.81rem | 700 | 1.23 | — | UPPERCASE — featured story marker |
| Section Ribbon | WiredMono | 12px / 0.75rem | 700 | 1.00 | 1.2px | UPPERCASE — black-bar section labels |
| Photo Caption | BreveText | 12.73px / 0.80rem | 700 | 2.20 (relaxed) | 0.108px | Generous leading — print-photo treatment |
| Timestamp / Meta | WiredMono | 12px / 0.75rem | regular | 1.33 | 1.1px | UPPERCASE, used for "X HOURS AGO" markers |
| Tertiary Footer Link | ProximaNova | 11px / 0.69rem | regular | 1.45 | — | Newsletter footer, legal links |
| Inter UI Heading | Inter | 16px / 1.00rem | 600 | 1.23 | 0.108px | Newer module headers |
| Inter UI Caption | Inter | 14px / 0.88rem | 600 | 1.40 | — | Compact UI metadata |

### Principles
- **Four faces, four jobs.** WiredDisplay is for shouting, BreveText is for reading, Apercu is for clicking, WiredMono is for labeling. They never trade roles. This separation is what keeps the page from feeling like a typography sample.
- **Tight headlines, generous body.** Display type runs as low as 0.93 line-height (nearly touching), while body BreveText opens out to 1.47–1.50. The contrast is the editorial fingerprint.
- **Mono is always uppercase.** Every WiredMono usage carries `text-transform: uppercase` and 0.9–1.2px letter-spacing. Treat lowercase mono as broken — it should not appear on a WIRED page.
- **Bold is rare.** Apercu uses weight 700 only for UI emphasis; the editorial layer (Display + BreveText) leans entirely on size and ink color, never on bolding.
- **Letter-spacing has two registers**: positive (0.9–1.2px) for ALL-CAPS mono, negative (-0.144 to -0.5px) for large display serif. Never neutral on the largest type.

### Note on Font Substitutes
The line-height values in the hierarchy table (especially the 0.93 on the 64px hero) assume the **proprietary WiredDisplay and BreveText faces**, which have tight metrics with short ascenders/descenders. If you substitute these with wide-metric open-source fonts like **Playfair Display** or **Libre Caslon**, loosen display line-heights by approximately **+0.10 to +0.12** to prevent ascender/descender collisions on wrapping lines (e.g., 0.93 → 1.05, 1.08 → 1.18). Apercu substitutes (Inter, Work Sans, Manrope) work at the token values without adjustment. BreveText body substitutes (Lora, Source Serif 4) also work without adjustment because body leading is already generous.

## 4. Component Stylings

### Buttons

**Primary CTA — Black Outline ("Subscribe")**
- Background: `#ffffff` (Paper White)
- Text: `#000000` (WIRED Black), Apercu 16px / 700 / 0.3px tracking
- Border: `2px solid #000000` — the printerly hard rule, not a 1px UI border
- Border radius: `0` (square corners)
- Padding: vertical ≈ 12–14px, horizontal ≈ 24px
- Hover: background flips to `#000000`, text flips to `#ffffff` — pure inversion, no easing on the rule
- Transition: ~150ms color/background only

**Secondary — Inverted ("Sign In", in dark zones)**
- Background: `#000000`
- Text: `#ffffff`
- Border: `2px solid #ffffff`
- Same square corners, same inversion-on-hover behavior

**Tertiary — Underlined Inline Link**
- Treated as a button when wrapped in nav: text `#1a1a1a`, underline always present, hover swaps color to `#057dbc` while keeping the underline
- No padding, no border, no background — this is editorial linking, not UI

**Pill / Round Icon Button**
- Border radius: `50%` (the only circular shape on the site)
- Used exclusively for icon controls (search, account, social) in the header
- Border: 1px solid `#757575` or no border depending on placement
- Size: ~32–40px square footprint

**Tag / Span Pill**
- Border radius: `1920px` (effectively a full pill — only used inside text spans like "BREAKING")
- Background: solid black or red accent depending on context
- Text: white, mono 11–12px caps

### Cards & Containers
- **Cards do not exist.** WIRED's homepage has no rounded boxes, no shadows, no surface elevation.
- A "story tile" is just an image rectangle stacked above a kicker + headline + deck, separated from neighbors by **1px hairline rules** (`#000000` or `#4a5568`) or by raw whitespace.
- The closest thing to a "container" is the black ribbon section header (e.g., "MOST POPULAR") — a full-bleed black bar with white WiredMono caps, no padding refinement, no rounded ends.
- Hover behavior on a story tile: the headline link text shifts from `#1a1a1a` to `#057dbc` and the underline appears. The image itself does not zoom, lift, or shadow.

### Inputs & Forms
- **Newsletter input**: rectangular, `2px solid #000000` border, `0` radius, white background, Apercu 16px placeholder.
- **Focus**: border stays 2px black, no glow ring, no color change — focus is signaled by the blinking caret only. (Add a 2px outset for accessibility if you ship this — WIRED's own implementation under-serves keyboard users here.)
- **Error**: text label below in `#e53e3e` (Fides cookie overlay borrows this red — use sparingly).
- **Disabled**: text drops to `#a0aec0`, border softens to `#757575`.

### Navigation
- **Top utility bar**: black (`#000000`) full-bleed strip, ~32–40px tall, mono caps links separated by hairline dividers, `#ffffff` text, hover → `#057dbc`.
- **Main nav**: paper-white (`#ffffff`) row beneath the bug logo, Apercu 14–16px / regular, hover → `#057dbc` underline.
- **Logo**: WIRED bug, ~209×42px, centered or left-aligned, never recolored, always pure black on white.
- **Mobile**: nav collapses to a hamburger left of the bug logo. Section nav becomes a slide-down drawer of mono caps links.
- **Transition**: hover color swaps are instant or ~120ms; no bouncy easing — editorial restraint.

### Image Treatment
- **Aspect ratios**: predominantly 16:9 for hero images, 4:3 for grid story tiles, 1:1 for smaller "Most Popular" thumbnails.
- **Corners**: ALWAYS 0 radius. Square. The only rounded image is a circular author avatar (50%).
- **Full-bleed**: hero photographs run edge-to-edge of the column they occupy; no inset, no border.
- **Captions**: BreveText 12.73px / 700 with relaxed 2.20 line-height — placed directly under the image, italicized in some templates.
- **Hover**: no zoom, no opacity dip — only the headline below the image responds.
- **Lazy loading**: standard `loading="lazy"` on all below-the-fold imagery.

### Editorial Ribbons & Section Markers
- Black bar (`#000000`) full-bleed with white WiredMono uppercase label inside (e.g., "MOST POPULAR", "BACKCHANNEL", "GEAR").
- Height ~32–40px, no padding refinement, no rounded ends.
- Sometimes a thin 2px black rule sits directly above or below to double-frame the bar.

### Numbered Lists ("Most Popular")
- A vertical list of stories prefixed with WiredDisplay numerals (01, 02, 03…) at ~40–48px, sitting tight against the headline they label.
- Hairline rule between each item, no other decoration.

## 5. Layout Principles

### Spacing System
- **Base unit**: 8px.
- **Scale**: 1px (hairline), 4px, 8px, 12px, 14.11px, 15px, 16px, 24px, 25.46px, 29.66px, 32px, 40px, 48px, 64px.
- **Section padding**: typically 32–48px vertical between major editorial blocks.
- **Card padding**: there are no cards; the gutter between story tiles is 24–32px horizontally and 16–24px vertically.
- **Inline spacing**: kickers sit ~4–8px above headlines; decks sit ~8–12px below headlines; bylines/timestamps another 8–12px below the deck.

### Grid & Container
- **Max width**: ~1280–1600px on desktop (the dembrandt sweep detected breakpoints up to 1600px), centered with generous outer margins.
- **Column patterns**: 12-column grid that resolves into 2/3/4 column story arrangements depending on module — feature blocks often run a "1 large + 2 small" pattern with hairline rules between each.
- **Column gutters**: ~24–32px, separated by hairline `#000000` or `#4a5568` 1px rules where the editorial logic demands a "page-fold" feel.

### Whitespace Philosophy
WIRED treats whitespace the way a magazine art director treats margin: it's the silence around the type, not a styling choice. The page never breathes excessively (this is not Stripe or Apple); it breathes *editorially* — enough room to keep adjacent stories from arguing, never enough to suggest there's nothing on the page. If an empty area looks like it could fit another headline, that empty area is doing its job.

### Border Radius Scale
- `0` — every container, every image, every button, every input. The default.
- `1920px` — only inside text spans that need to look like a full pill ("BREAKING", "LIVE").
- `50%` — only on round icon buttons and circular author avatars.

There are exactly three radii on the entire site, and two of them are reserved for non-rectangular shapes. This is the **strictest** corner discipline of any major editorial property.

## 6. Depth & Elevation

| Level | Treatment | Use |
|---|---|---|
| 0 | No shadow, no border | Default editorial surface — text on paper |
| 1 | 1px solid `#e2e8f0` hairline `<hr>` | Quiet section divider, almost invisible |
| 2 | 1px solid `#000000` hairline rule | Editorial column divider — printerly, structural |
| 3 | 2px solid `#000000` border | Buttons, inputs, ribbons — interactive emphasis |
| 4 | Black ribbon bar (`#000000` fill) | Section labels — the most "elevated" surface on the page |
| 5 | Inverted footer block | Dark `#1a1a1a` zone with white type — the only inversion |

WIRED's depth philosophy is **flat by religion**. There is exactly one shadow token in the entire site (a default `0 0 0 transparent` placeholder) and no `box-shadow` is applied to story tiles, headers, modals, or cards. Depth is communicated by **rule weight** (1px hairline → 2px hard rule → solid black ribbon), not by simulated lighting.

### Decorative Depth
None. No gradients, no glow, no halos, no scrim overlays beyond the standard photo caption gradient. WIRED earns its visual interest from photography and typographic contrast, not from chrome.

## 7. Do's and Don'ts

### Do
- **Do** use 2px hard black borders on every primary button — no 1px softness, no rounded edges.
- **Do** put a WiredMono ALL-CAPS kicker above every story headline (4–8px above, 0.9–1.2px tracking).
- **Do** use BreveText for any paragraph longer than two lines — Apercu is for UI, not reading.
- **Do** keep images square-cornered, edge-to-edge, with the caption hugging the bottom edge.
- **Do** separate story tiles with hairline rules or whitespace, never with cards or shadows.
- **Do** invert (black background, white type) only for footers, ribbons, and the utility nav strip.
- **Do** use `#057dbc` link blue exclusively for hover states — never as a background or button fill.
- **Do** scale headlines aggressively: 64px on hero, 26px on grid blocks, never 32px "safe middle ground".

### Don't
- **Don't** add `box-shadow` to anything. Ever. WIRED doesn't ship shadows.
- **Don't** round corners on rectangular containers — `border-radius: 0` is law.
- **Don't** mix typefaces inside one role: WiredDisplay never sets body, BreveText never sets buttons.
- **Don't** use color outside grayscale + `#057dbc`. No orange CTAs, no green success pills.
- **Don't** use Apercu in lowercase for kickers — that's WiredMono's job, and it must be UPPERCASE.
- **Don't** use gradients, blurs, glassmorphism, or atmospheric effects — they break the printerly contract.
- **Don't** rely on hover lift effects. WIRED's hover is a color swap on text, nothing more.
- **Don't** invent new pill shapes. Round = icons only. Pill = inline text spans only. Everything else is square.

## 8. Responsive Behavior

### Breakpoints

| Name | Width | Key Changes |
|---|---|---|
| Small Mobile | <375px | Single column, hamburger nav, all hero modules collapse to stacked image-headline-deck |
| Mobile | 375–767px | Single column, story grid becomes vertical scroll, "Most Popular" numbers shrink to 32px |
| Tablet | 768–1023px | 2-column story grid, sidebar collapses below main feed, nav becomes condensed |
| Desktop | 1024–1599px | Full editorial 3–4 column grid, sidebar restored, max headline scale active |
| Large Desktop | ≥1600px | Page caps at ~1600px container, whitespace expands at the margins, no further scaling |

The dembrandt sweep detected an unusual range of intermediate breakpoints (1280, 1025, 1024, 1023, 768, 767, 667, 599, 570, 569, 480, 425, 375, 320, 319) — Wired's grid micro-tunes at almost every common viewport, especially around the iPad portrait/landscape boundary.

### Touch Targets
- Primary button: ~44x44px minimum (16px text + 12–14px vertical padding satisfies WCAG AAA).
- Mono caps links in the utility bar are smaller (~32px tall) — WIRED's own implementation undershoots WCAG here. **For derivative work, pad mono nav links to 44px.**
- Round icon buttons in the header are ~40px circles, comfortably touch-friendly.

### Collapsing Strategy
- **Nav**: utility bar drops below 768px; main nav collapses into hamburger drawer. Bug logo recenters on mobile.
- **Grid**: 4-col → 3-col → 2-col → 1-col as viewport tightens. Hairline rules persist between every column count, so the printerly feel survives the collapse.
- **Spacing**: vertical rhythm tightens from 48px → 32px → 24px between modules on mobile. Horizontal page padding shrinks from 64px → 24px → 16px.
- **Type**: WiredDisplay hero scales from 64px to ~36–42px on mobile, headlines from 26px to ~22px, kickers stay locked at 12–13px (mono caps don't scale down further or they become unreadable).

### Image Behavior
- All images are responsive raster (`srcset`-driven), aspect ratios preserved: 16:9 hero, 4:3 mid, 1:1 thumbnails.
- No art-direction swaps — the same crop scales across breakpoints.
- `loading="lazy"` on all below-the-fold imagery, `eager` on the hero only.

## 9. Agent Prompt Guide

### Quick Color Reference
- **Primary Ink (text + ribbons)**: "WIRED Black (`#000000`)"
- **Page Canvas**: "Paper White (`#ffffff`)"
- **Headline / Body Text**: "Page Ink (`#1a1a1a`)"
- **Caption / Metadata**: "Caption Gray (`#757575`)"
- **Hairline / Quiet Border**: "Hairline Tint (`#e2e8f0`)"
- **Link Hover Accent (the only color)**: "Link Blue (`#057dbc`)"

### Example Component Prompts
1. *"Create an editorial story tile with a 16:9 image (square corners), an UPPERCASE WiredMono kicker in `#1a1a1a` above a 26px WiredDisplay headline. Separate the tile from its neighbor with a 1px black hairline rule. No card, no shadow, no border-radius."*
2. *"Design a primary subscribe button with a 2px solid `#000000` border, square corners, `#ffffff` background, Apercu 16px / 700 / 0.3px tracking text in `#000000`. Hover state inverts to black background with white text in 150ms."*
3. *"Build a 'Most Popular' module: full-bleed black ribbon header with WiredMono uppercase label in white, followed by a numbered list (01–05) using 40px WiredDisplay numerals and 17px Apercu 700 headlines, separated by hairline rules."*
4. *"Create a newsletter signup form with a 2px solid black input border, no radius, Apercu 16px placeholder in `#757575`, and an inverted black submit button beside it."*
5. *"Design a footer in `#1a1a1a` with paper-white tertiary navigation in ProximaNova 11px, hover color `#057dbc`, and a centered WIRED bug logo at the top of the block."*

### Iteration Guide
When refining existing screens generated with this design system:
1. **Audit corners first.** If you see any `border-radius` other than `0`, `50%` (icons/avatars), or `1920px` (text pills), flatten it. Round corners are the single most common mistake.
2. **Audit shadows.** Strip every `box-shadow`. If a tile needs to feel "lifted", use a 2px black border or a hairline rule instead.
3. **Audit typeface roles.** Make sure WiredDisplay only sets headlines, BreveText only sets reading body, Apercu only sets UI, WiredMono only sets ALL-CAPS labels. Swapping roles breaks the voice instantly.
4. **Audit color sprawl.** If a color outside `#000`, `#1a1a1a`, `#757575`, `#e2e8f0`, `#ffffff`, `#057dbc` appears in chrome (not photography), remove it. WIRED's restraint is non-negotiable.
5. **Audit kickers.** Every story should have an UPPERCASE mono kicker. Without it, the page reads as a generic blog, not WIRED.
6. **Audit rules.** Add hairline `1px solid #000` dividers wherever two stories or modules meet without a clear visual break. Rules are the connective tissue.
