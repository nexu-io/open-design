# Design System Inspired by Bugatti

> Category: Automotive
> Hypercar brand. Cinema-black canvas, monochrome austerity, monumental display type.

## 1. Visual Theme & Atmosphere

Bugatti.com does not behave like a website — it behaves like a feature-length car film that a visitor happens to be standing inside. The canvas is pure `#000000`, the only color that appears at rest is white, and the entire page is carried by full-bleed hero video and photography with a single typographic moment laid over the top. There are no cards, no grids, no promotional modules, no newsletter signups, no three-column editorial layouts. It is one continuous cinema-black channel, interrupted only by the cars themselves and a few pill-shaped calls to action that quietly say things like "EXPLORE OUR OPPORTUNITIES" in ALL CAPS monospace.

The single most distinctive move in the entire system is **scale**: the `Bugatti Display` typeface runs at **288px** at hero moments. Two hundred and eighty-eight pixels. That is not a typo — the dembrandt sweep extracted a heading style rendered at an 18rem size, ALL CAPS, line-height 1.0, meant to be read the way you read a brand mark on the front of a Chiron: from across a showroom floor. At 288px the headline is no longer text, it is architecture. The secondary display scale of 60px feels almost miniature next to it, and the 36px mid-display feels like fine print. This typographic hierarchy is the most extreme of any production brand website in this catalog, and it is what gives Bugatti.com its sculptural, couture-showroom presence.

The other signature is **monochromatic austerity**. The entire homepage uses exactly three colors at rest: `#000000`, `#ffffff`, and `#999999` (mid gray for disabled/tertiary states). There is no accent, no brand blue, no hazard color, no commerce orange, no gradient wash. The designers have made a conscious decision that Bugatti's color system should be the car paint itself — the page is a black velvet display stand, and the only color that exists is whatever blue-on-black lacquer the hero vehicle happens to be wearing today. This discipline is the exact opposite of PlayStation's PlayStation Blue or The Verge's Jelly Mint: Bugatti refuses to compete with its own product.

**Key Characteristics:**
- Cinema-black `#000000` canvas for the entire page — no gradients, no tints, no accents
- 288px `Bugatti Display` ALL-CAPS headline — the most extreme display scale in the catalog
- Three-font custom family: `Bugatti Display` (sculptural), `Bugatti Monospace` (UI labels), `Bugatti Text Regular` (body)
- Monochrome-only palette: black, white, and a single `#999999` mid gray for tertiary/disabled
- Pill buttons at `9999px` radius — transparent with a 1px white border, padding `12px 24px`
- Video- and photography-first page — the chrome is almost silent so the product can speak
- Mono UPPERCASE labels with 1.2–1.4px letter-spacing on every CTA, navigation link, and caption

## 2. Color Palette & Roles

### Primary
- **Velvet Black** (`#000000`): The entire canvas. Not near-black, not warm black — the pure HTML `#000`. Bugatti treats this as a display-stand surface, the way a jewelry brand treats a black velvet cloth.
- **Showroom White** (`#ffffff`): All text, all borders, all CTAs. White is the only color that appears at rest on the chrome. It has the weight of typeset print on a matte museum label.

### Secondary & Accent
- **Silver Mist** (`#999999`): The single gray in the system. Used for secondary button borders, disabled states, and the thinnest hairline dividers. Treat this as the "75%-volume" version of white — never a color, just a quieter version of the same voice.

### Surface & Background
- **Velvet Black** (`#000000`): The only surface. There is no secondary surface, no elevated card, no modal backdrop. If something needs to feel "separate", it sits on the same black and is marked with a thin `#999999` border — no color change.

### Neutrals & Text
- **Primary Text** (`#ffffff`): All headlines, body copy, button labels, and navigation items.
- **Tertiary Text** (`#999999`): Disclaimer text, placeholder labels, and the faintest supporting metadata. Used sparingly — Bugatti prefers to hide secondary content rather than dim it.

### Semantic & Accent
- **Tailwind Ring Leak** (`rgba(59, 130, 246, 0.5)`): A Tailwind default `--tw-ring-color` leaks into the extracted tokens from the build system — this is **not** part of the Bugatti brand palette. Ignore it. If a real focus state is needed, use a 1px `#ffffff` ring instead.

### Gradient System
None. There are zero decorative gradients on Bugatti.com. The only "gradient" on the page is whatever natural light gradient exists inside the hero video of the car itself. The brand refuses to apply any chrome gradient that could compete with the atmospheric lighting of the product photography.

## 3. Typography Rules

### Font Family
- **Bugatti Display** — fallback: `ui-sans-serif`, `system-ui`. A proprietary custom display typeface used only at very large sizes for hero and mid-display headlines. Designed to be read at architectural scale — at 288px, its geometry doubles as a visual element, not just text. The face carries a faint hint of early-20th-century Grand Prix typography (the period when Ettore Bugatti was racing) without ever becoming nostalgic.
- **Bugatti Monospace** — fallback: `ui-sans-serif`, `system-ui`. A custom monospaced face reserved for every UI label on the site. It handles all navigation links, all button labels, all captions, and all UPPERCASE metadata. The strict mono tracking (1.2–1.4px letter-spacing on all usages) gives the UI the appearance of a technical dossier or dashboard telemetry printout — appropriate for a company that builds 1600-horsepower hypercars.
- **Bugatti Text Regular** — fallback: `ui-sans-serif`, `system-ui`. The body copy workhorse, used for the rare paragraph and inline reading text. Weights and styles are restrained — this font exists to be invisible when the display type is shouting and the monospace is whispering.

### Hierarchy

| Role | Font | Size | Weight | Line Height | Letter Spacing | Notes |
|---|---|---|---|---|---|---|
| Hero Display (Monumental) | Bugatti Display | 288px / 18.00rem | 400 | 1.00 | — | ALL CAPS — the largest display scale in this catalog, architectural in presence |
| Mid Display (Feature) | Bugatti Display | 60px / 3.75rem | 400 | 1.00 | 1.4px | Feature-panel headlines, ALL CAPS optional |
| Mid Display (Subfeature) | Bugatti Display | 60px / 3.75rem | 400 | 1.00 | — | Secondary feature headlines |
| Section Heading | Bugatti Display | 36px / 2.25rem | 400 | 1.11 | — | Section-level title |
| Monumental Mono Headline | Bugatti Monospace | 60px / 3.75rem | 400 | 1.00 | — | UPPERCASE — reserved for technical/section labels at hero scale |
| Body Small (Display) | Bugatti Display | 16px / 1.00rem | 400 | 1.50 | — | Display face used sparingly at body size for marketing copy |
| Lead Body | Bugatti Text Regular | 20px / 1.25rem | 400 | 1.40 | — | Paragraph lead |
| Body Regular | Bugatti Text Regular | 16px / 1.00rem | 400 | 1.50 | — | Standard reading body |
| Body Compact | Bugatti Text Regular | 14px / 0.88rem | 400 | 1.43 | — | Dense body |
| UI Link (Caps) | Bugatti Monospace | 14px / 0.88rem | 400 | 1.43 | 1.4px | UPPERCASE — primary navigation and primary link style |
| UI Link (Mono Plain) | Bugatti Monospace | 14px / 0.88rem | 400 | 1.43 | — | Plain-case mono link — rare, used for disclaimer links |
| Button Label (CAPS) | Bugatti Monospace | 14px / 0.88rem | 400 | 1.43 | 1.4px | UPPERCASE — primary pill-button label |
| Button Label (Compact) | Bugatti Monospace | 12px / 0.75rem | 400 | 1.33 | 1.2px | UPPERCASE — small pill-button label |
| Button Label (Unstyled) | Bugatti Monospace | 12px / 0.75rem | 400 | 1.33 | — | Plain-case mono — footer microbutton |
| Caption CAPS Wide | Bugatti Monospace | 14px / 0.88rem | 400 | 1.43 | 1.4px | UPPERCASE — section eyebrows and tech-spec labels |
| Caption Plain Wide | Bugatti Monospace | 14px / 0.88rem | 400 | 1.43 | 1.4px | Plain-case with 1.4px tracking — the "mid-formal" register |
| Caption Plain | Bugatti Monospace | 14px / 0.88rem | 400 | 1.43 | — | Plain mono caption |
| Caption Micro (Text) | Bugatti Text Regular | 14px / 0.88rem | 400 | 1.43 | — | Body-face caption |
| Caption Micro (CAPS) | Bugatti Monospace | 12px / 0.75rem | 400 | 1.33 | 1.2px | UPPERCASE — smallest tagging label |
| Caption Micro (Plain) | Bugatti Monospace | 12px / 0.75rem | 400 | 1.33 | — | Smallest plain-case mono |

### Principles
- **Bugatti Display is a sculpture, not a font.** If you find yourself typesetting body copy or a button in Bugatti Display, you're using the wrong tool. Reserve this face for headlines at **36px minimum**, ideally 60px+, and at least once per page use it at 200px+ to create the monumental effect the brand is built around.
- **Bugatti Monospace owns the UI.** Every navigation link, every button, every caption, every eyebrow runs in Bugatti Monospace — usually UPPERCASE with 1.2–1.4px tracking. This mono-caps discipline is what makes the UI read like a Grand Prix telemetry panel rather than a luxury shopping cart.
- **Bugatti Text Regular is invisible.** It appears only in short paragraphs and inline reading copy, usually at 14–20px. It is never used for labels, buttons, or display.
- **There is no bold.** Every weight in the extracted tokens is regular (400). Bugatti does not use weight for hierarchy — it uses scale. When you need emphasis, make the type bigger, not heavier.
- **Tracking has two registers.** Mono caps always carry 1.2–1.4px letter-spacing. Display type at 60px+ sometimes carries 1.4px tracking at the hero scale. Body type has no tracking.
- **Line-height is brutally tight at display.** Every Bugatti Display usage runs at line-height 1.00 or 1.11. Headlines touch each other when they wrap — that's the design. Do not relax the leading.

### Note on Font Substitutes
The 1.00 line-height and 288px display scale both assume the **proprietary Bugatti Display face**, which is drawn with compact vertical metrics purpose-built for architectural scale. If you substitute with open-source extended geometric displays like **Unbounded**, **Big Shoulders Display**, or **Archivo Black**, make two adjustments: (1) **loosen line-height to ~1.05–1.10** to prevent ascender collisions, and (2) **cap the maximum display size at ~104–128px** on most viewports — these substitutes have wider horizontal metrics than Bugatti Display, so a 288px monumental headline will wrap across 4+ lines and overwhelm the layout. Reserve the 200px+ scale only for single-word monumental moments (e.g., "BUGATTI" alone). Bugatti Monospace substitutes (Space Mono, JetBrains Mono) and Bugatti Text Regular substitutes (Inter, DM Sans) work at the token values without adjustment.

## 4. Component Stylings

### Buttons

**Primary — White Outlined Pill**
- Background: transparent
- Text: `#ffffff`, Bugatti Monospace 14px / 400 / 1.4px tracking, UPPERCASE
- Border: `1px solid #ffffff`
- Border radius: `9999px` — full pill
- Padding: `12px 24px`
- Outline: `rgb(255, 255, 255) none 0px` at rest
- Hover: likely background fill to `#ffffff` with black text, or a subtle opacity dim (the extracted token set did not capture a bespoke hover — treat this as a safe assumption since the default Bugatti interaction is restraint)
- Active: opacity drop to ~0.7
- Focus: use a 1px `#ffffff` outer ring via `box-shadow: 0 0 0 1px #ffffff, 0 0 0 2px #000000` for contrast
- Transition: 200–300ms ease on background/color — quiet, never bouncy

**Secondary — Gray Rounded Button**
- Background: transparent
- Text: `#ffffff`, Bugatti Monospace 12px / 400 / 1.2px tracking, UPPERCASE
- Border: `1px solid #999999` (Silver Mist)
- Border radius: `6px` — subtle corner, the only non-pill non-zero radius in the system
- Padding: `6px 12px`
- Hover: border transitions to `#ffffff`, text stays white
- Active: opacity 0.7
- Used for compact utility buttons (menu toggles, closed-dialog buttons)

**Ghost — Unbordered Link Button**
- Background: transparent
- Text: `#ffffff`, Bugatti Monospace 12px / 400 — plain or UPPERCASE
- No border, no padding beyond inline
- Used in the footer and tertiary nav

### Cards & Containers
- **There are no cards.** Bugatti.com has no card component. The entire page is a sequence of full-bleed media blocks with a headline and optional CTA overlaid — more akin to a film chapter than a card grid.
- The closest thing to a "container" is the rare bordered section that uses a `1px solid #999999` frame, a `6px` border radius, and `#000000` interior. These are reserved for cookie-consent notices and modal-style dialogues, not editorial content.
- Hover state on media blocks: none. The video plays, the CTA becomes clickable, and that is the entire interaction vocabulary.

### Inputs & Forms
- The extracted tokens captured **zero input styles** (`⚠ Inputs: 0 styles`). This is because Bugatti.com has essentially no forms on the homepage — no newsletter signup, no search bar, no contact form, no email capture. When forms do appear (on deeper pages), apply these defaults consistent with the rest of the system:
  - **Default**: `#000000` background, `1px solid #999999` border, `6px` radius, `#ffffff` text in Bugatti Text Regular 16px, placeholder `#999999`.
  - **Focus**: border transitions to `#ffffff`, no glow — the border change IS the focus signal.
  - **Error**: border stays white; add a `#999999` inline message below. Bugatti does not use red error colors — it stays in the monochrome palette.
  - **Transition**: ~250ms ease on border-color.

### Navigation

- **Top nav**: black (`#000000`) thin strip with the Bugatti "EB" monogram or full "BUGATTI" wordmark centered, a hamburger "MENU" link left, and a "STORE" link right. Both nav links are Bugatti Monospace 14px UPPERCASE with 1.4px tracking.
- **Logo**: 128×29px at desktop scale — smaller than nearly every other brand in this catalog. Bugatti does not need to shout its name.
- **Hover on nav links**: color stays `#ffffff` — the hover signal is a subtle text-decoration underline or an opacity shift to ~0.75. No color change.
- **Mobile**: the full nav collapses to just three elements — "MENU", the wordmark, and "STORE" — which is basically the desktop layout minus the separator spacing.
- **Sticky behavior**: the nav is pinned at the top on scroll and stays black-on-black. When it overlaps a dark video, it becomes nearly invisible, which is by design.

### Image & Video Treatment
- **Aspect ratios**: 16:9 and 21:9 for hero video, 4:3 for mid-feature photography, 1:1 for rare portrait shots.
- **Corners**: rare — most media is full-bleed with zero border radius. When radius appears, it's `6px`.
- **Full-bleed**: yes, always. The hero video fills the viewport. Secondary feature video fills 100% of the section width.
- **Captions**: Bugatti Monospace 12px UPPERCASE in `#ffffff` at ~1.2px tracking, placed below the media or in the lower-left corner.
- **Hover**: no zoom, no scale, no scrim. The video plays, that is the hover state.
- **Lazy loading**: `loading="lazy"` on every image below the fold; hero video is preloaded.

### Atmospheric Overlay
- When type sits over photography or video that might threaten legibility, Bugatti uses a subtle `rgba(0, 0, 0, 0.4)` linear gradient from bottom (40% black) to top (transparent) — the only "shadow-like" effect in the system. It's a vignette, not a drop shadow.

## 5. Layout Principles

### Spacing System
- **Base unit**: 8px.
- **Scale** (from tokens): 4, 6, 12, 36, 48, 64px. Six values. **Six.** This is one of the smallest spacing scales of any major brand site — Bugatti uses a handful of discrete gaps and refuses to invent in-between values.
- **Section padding**: typically 48–64px vertical. Hero panels are full-viewport-height, which bypasses the scale entirely.
- **Button padding**: 6px 12px (compact) or 12px 24px (primary). Nothing else.
- **Inline spacing**: 4–12px between stacked labels; the big jump to 36/48/64 happens between content blocks.

### Grid & Container
- **Max width**: 1720px (dembrandt detected breakpoints up to 1720). The site scales to ultra-wide for luxury showroom displays and wide cinema monitors.
- **Column patterns**: there is essentially no multi-column grid on the homepage — it is a stack of single full-width blocks. When deeper pages need columns (configurator, atelier, technical specs), they use a 12-column Tailwind-based grid.
- **Outer padding**: minimal. Most sections bleed to the viewport edge, with padding only applied to the overlaid text and CTA block (typically 48–64px from the bottom-center).

### Whitespace Philosophy
Bugatti's whitespace philosophy is **cinematic negative space** — the page is 90% empty even when content is present, because the content is usually a video or photograph of a single car. The rhythm is: full-bleed media → monumental headline → single pill CTA → scroll → next full-bleed media. There is no "information density" anywhere. The page breathes the way a museum breathes, with each exhibit getting its own silent room.

### Border Radius Scale
- **0** — default for all media and the hero canvas
- **6px** — secondary rounded buttons, bordered frames, small utility containers
- **9999px** — primary pill buttons

Three values. No `12px`, no `24px`, no `20px`. Bugatti's radius system is the most restrained of any site in this catalog — the brand has made an active decision that "slightly rounded rectangle" is a vulgar shape, and committed to either true rectangle or true pill.

## 6. Depth & Elevation

| Level | Treatment | Use |
|---|---|---|
| 0 | No shadow, no border | Default text and media on `#000000` |
| 1 | `1px solid #999999` | Secondary containers, cookie-style dialogs |
| 2 | `1px solid #ffffff` | Primary button outline, active state indicators |
| 3 | Bottom-to-top `rgba(0, 0, 0, 0.4) → transparent` vignette | Text-legibility gradient when type sits over video |

**That is the entire depth system.** There are 1 shadows in the extracted token set (zero meaningful `box-shadow` values — just a placeholder). Bugatti does not use drop shadows. It does not use elevation rings. It does not use glowing focus states. Depth is implied by the 1px hairline of a border or the presence of a vignette gradient — nothing more.

### Decorative Depth
None. Zero gradients (except the subtle text-legibility vignette), zero blurs, zero glows, zero atmospheric effects. The decorative depth of Bugatti's site comes entirely from the lighting baked into the product photography. The chrome does not compete.

## 7. Do's and Don'ts

### Do
- **Do** keep the entire canvas `#000000`. No off-black, no near-black, no warm black. Bugatti is pure black.
- **Do** use Bugatti Display at architectural scale — minimum 36px, ideally 60px+, and once per page land a monumental 200px+ headline.
- **Do** use Bugatti Monospace UPPERCASE with 1.2–1.4px tracking for every button, link, nav item, and caption.
- **Do** use only white text at rest. `#999999` is only for disabled, tertiary, and thin borders.
- **Do** use 9999px border radius for primary buttons — full pill, thin 1px white outline, transparent fill.
- **Do** use full-bleed video and photography for every hero section. The product is the UI.
- **Do** maintain line-height 1.00–1.11 on display headlines. Tight leading is the architecture.
- **Do** treat whitespace like cinematic negative space — give every block its own silent room.

### Don't
- **Don't** introduce accent colors. No blue, no red, no commerce orange, no hover cyan, no warning red. The palette is black, white, and one gray.
- **Don't** use bold weights for hierarchy. Scale is the only hierarchy device — make it bigger, not heavier.
- **Don't** use drop shadows on any element. Bugatti has no `box-shadow` in its chrome.
- **Don't** use cards or elevated surfaces. Bugatti has no card component.
- **Don't** use rounded rectangles between 6px and 9999px. The radius system is rectangle, slightly-rounded utility, or full pill — nothing in between.
- **Don't** use Bugatti Display for body, buttons, or UI labels. Reserve it for headlines at 36px+.
- **Don't** use Bugatti Monospace in lowercase for primary UI. Buttons and nav links are always ALL CAPS.
- **Don't** add gradients, glows, blurs, or glassmorphism anywhere. The chrome is silent.
- **Don't** put text over photography without a `rgba(0, 0, 0, 0.4)` bottom-up vignette if legibility is at risk.

## 8. Responsive Behavior

### Breakpoints

| Name | Width | Key Changes |
|---|---|---|
| Mobile | <640px | Single column, hamburger "MENU", hero video locked to 9:16 or 16:9, hero headline scales to ~48–72px |
| Small Tablet | 640–767px | Still single column, padding opens slightly, typography scales up |
| Tablet | 768–1023px | Still single column for content, nav expands to include wordmark, headline scales to ~120px |
| Small Desktop | 1024–1279px | Full desktop nav, headline scales to ~200px |
| Desktop | 1280–1535px | Full layout, headline at 240–260px |
| Large Desktop | 1536–1719px | Max headline scale (288px), ultra-wide hero video |
| Ultra-Wide | ≥1720px | Container caps, hero video locks at 21:9 or wider, everything else stays proportional |

The dembrandt sweep detected 6 breakpoints (1720 → 1536 → 1280 → 1024 → 768 → 640). This is a narrower responsive set than PlayStation's 30 — Bugatti tunes for six clean thresholds rather than micro-adjusting every device boundary. The brand's assumption is that its visitors are either on a high-end laptop, a desktop monitor, or a phone, and the site doesn't need to fuss over everything in between.

### Touch Targets
- Primary pill buttons are `12px 24px` padded with 14px text — approximately 38–42px tall. **This falls slightly below WCAG AAA 44px recommendations**. For derivative work, bump vertical padding to 14–16px to hit 44px+.
- Secondary buttons at `6px 12px` padding are about 28–32px tall — definitely below touch-target minimums. Use these only on desktop pointer contexts.
- Navigation links have no explicit padding — the tap area is the text box, which at 14px is too small. Add `12–14px` vertical padding on mobile to make them touchable.

### Collapsing Strategy
- **Nav**: desktop shows `MENU / BUGATTI wordmark / STORE`. Mobile keeps the same layout — there is no drawer, because there are only three items.
- **Grid**: no grid to collapse. The page is already single-column at every breakpoint.
- **Spacing**: section padding tightens from 64 → 48 → 36 → 12px as viewport narrows.
- **Type**: Bugatti Display scales from 288px → 200px → 120px → 60px → 48px as viewport narrows. The scale curve is aggressive — losing 240px between the max and mobile hero.
- **Video**: art-direction swap between 21:9 desktop and 16:9 or 9:16 mobile hero cuts.

### Image & Video Behavior
- Hero video uses adaptive bitrate streaming and `poster=` fallback.
- Below-the-fold media uses `loading="lazy"` with `srcset` art direction.
- Bugatti serves high-density imagery through `imgix` — you'll see `bugatti.imgix.net` URLs with transformation parameters.

## 9. Agent Prompt Guide

### Quick Color Reference
- **Primary Canvas**: "Velvet Black (`#000000`)"
- **Primary Text**: "Showroom White (`#ffffff`)"
- **Secondary Text / Disabled / Hairline Border**: "Silver Mist (`#999999`)"
- **Accent**: None. Do not add one.
- **Hover Signal**: Opacity shift or border-color shift — no color change

### Example Component Prompts
1. *"Create a monumental hero headline using Bugatti Display at 288px, ALL CAPS, `#ffffff` text on a pure `#000000` canvas, line-height 1.0, no letter-spacing. Place a full-bleed 21:9 hero video behind it with a `rgba(0, 0, 0, 0.4) → transparent` bottom-up vignette for legibility."*
2. *"Design a primary pill CTA button: transparent background, 1px solid `#ffffff` border, `9999px` border radius, 12px × 24px padding, Bugatti Monospace 14px / 400 / 1.4px letter-spacing UPPERCASE label in `#ffffff`. Hover state fills the background white with black text, 250ms ease."*
3. *"Build a navigation bar: pure `#000000` background, `MENU` link left, centered `BUGATTI` wordmark (128×29px), `STORE` link right. All links in Bugatti Monospace 14px UPPERCASE with 1.4px letter-spacing in `#ffffff`. No dividers, no hover color — just a slight opacity dim on hover."*
4. *"Create a mid-feature section heading: Bugatti Display 60px ALL CAPS in `#ffffff`, line-height 1.0, centered over a full-bleed photograph. Place a single primary pill CTA 48–64px below the headline."*
5. *"Design a secondary utility button for a cookie dialog: transparent background, 1px solid `#999999` border, 6px border radius, 6px × 12px padding, Bugatti Monospace 12px / 400 / 1.2px tracking UPPERCASE label in `#ffffff`."*

### Iteration Guide
When refining existing screens generated with this design system:
1. **Audit the canvas.** If the background isn't pure `#000000`, change it. Bugatti does not tolerate off-black.
2. **Audit the palette.** Any color that isn't `#000000`, `#ffffff`, or `#999999` is drift. Remove it — that includes ALL accent colors, including common defaults like `#0070cc` Tailwind blue.
3. **Audit display scale.** If the largest headline on a page is smaller than 60px, it's under-scaled. Bugatti's minimum "monumental moment" is 60px; the maximum is 288px. Aim for the upper half.
4. **Audit mono-caps discipline.** Every button, every nav link, every caption, every CTA should be Bugatti Monospace UPPERCASE with 1.2–1.4px letter-spacing. If you see sentence case or mixed case on a button, that's drift.
5. **Audit shadows and gradients.** Strip every `box-shadow`. Strip every gradient except the one legibility vignette over video. Bugatti's chrome is silent.
6. **Audit radius.** Every container should land on `0`, `6px`, or `9999px`. If you see `12px`, `16px`, `20px`, `24px`, correct to the nearest Bugatti value (almost always `6px` or `9999px`).
7. **Audit type weight.** All weights should be 400. If you see `bold` or `700` anywhere, change it. Scale, not weight, is the hierarchy.
8. **Audit whitespace.** If a section feels cramped, add 48–64px. If it feels airy, leave it — Bugatti's negative space is a feature.
9. **Audit product presence.** Every hero section should have a vehicle — video or photograph — as the primary visual. The chrome should feel like it's framing the car, not competing with it.
