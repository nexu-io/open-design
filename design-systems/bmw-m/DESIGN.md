# Design System Inspired by BMW M

> Category: Automotive
> Motorsport performance sub-brand. Near-black cockpit surfaces, BMW M tricolor accents, sharp engineering geometry.

## 1. Visual Theme & Atmosphere
BMW M's analyzed editorial and marketing pages lean on a near-pure black canvas (`{colors.canvas}` — #000) holding white BMW Type Next Latin headlines in **confident UPPERCASE**. The system has no decorative voltage of its own; brand energy comes from **full-bleed automotive photography** — cars cornering at speed, carbon-fiber wheel detail, driver cockpit shots, motorsport pit lanes — placed as edge-to-edge content that fills entire bands. UI chrome around the photography stays minimal: thin sans-serif copy, dividers as 1px hairlines (`{colors.hairline}`), all-caps button labels with no fill until hovered.

The **M tricolor stripe** — `{colors.m-blue-light}` (#0066b1) → `{colors.m-blue-dark}` (#1c69d4) → `{colors.m-red}` (#e22718) — appears sparingly as the brand's signature accent, used on the M wordmark, motorsport chrome, vehicle-tech callouts, and model badges. It is never a CTA color and never used as a background fill — the tricolor is exclusively a brand-identity marker.

Type voice should stay aligned with the broader BMW family system: BMW Type Next Latin Light carries the large editorial display voice, while BMW Type Next Latin regular carries body and UI text. BMW M can use heavier uppercase weights for buttons, labels, cards, and emphasis, but agents should not treat a 700/300 split as a universal BMW M rule without page-specific evidence.

**Key Characteristics:**
- Near-pure black canvas (`{colors.canvas}` — #000) with white type across the analyzed editorial and marketing pages. Configurator, account, checkout, and order-management flows are unresolved and may introduce light surfaces.
- Display headlines use UPPERCASE BMW Type Next Latin Light when following the BMW family system. Heavier uppercase settings are reserved for labels, buttons, card titles, and observed M-specific emphasis.
- M tricolor (`{colors.m-blue-light}` / `{colors.m-blue-dark}` / `{colors.m-red}`) used as 4px brand-stripe dividers, M-wordmark accents, and motorsport chrome — never as buttons or fills.
- Photography fills entire bands edge-to-edge. Cars are always the visual subject; UI chrome backs off to small white labels overlaid on photography.
- Buttons are flat with 0px corners and uppercase letterspaced labels. The "industrial precision" rectangular silhouette IS the brand.
- Border radius is mostly zero across the system. The few exceptions are circular icon buttons such as carousel arrows and any confirmed small toggle pills.
- Spacing is generous and grid-aligned: `{spacing.section}` (96px) between major bands; `{spacing.xxl}` (64px) inside hero photo bands; `{spacing.xl}` (40px) inside content cards.

## 2. Color Palette & Roles
### Brand & Accent
- **Primary** (#ffffff): `{colors.primary}`. The system's primary type and CTA color. Used for h1/h2/h3 display, body text on dark, and primary button labels (the buttons themselves are transparent or canvas-colored — the white text + outline IS the button).
- **M Blue Light** (#0066b1): `{colors.m-blue-light}`. The first stop in the M tricolor stripe. Used on M-badge accents and motorsport chrome.
- **M Blue Dark** (#1c69d4): `{colors.m-blue-dark}`. The middle stop and BMW heritage blue value, repurposed as the middle band of the M stripe.
- **M Red** (#e22718): `{colors.m-red}`. The third stop. The signature M-power red, used in the stripe and on motorsport-pace callouts.
- **Electric Blue** (#0653b6): `{colors.electric-blue}`. A separate electric-vehicle accent used on M xDrive electric model pages. Distinct from the heritage blue — feels colder, more digital.

### Surface
- **Canvas** (#000000): `{colors.canvas}`. The default page floor across the analyzed editorial and marketing surfaces. True black.
- **Surface Soft** (#0d0d0d): `{colors.surface-soft}`. A barely-different-from-black used for spec table cells and footer-adjacent strips.
- **Surface Card** (#1a1a1a): `{colors.surface-card}`. Cards, secondary buttons, icon-button backgrounds.
- **Surface Elevated** (#262626): `{colors.surface-elevated}`. One step lighter, used for nested cards inside dark bands.
- **Carbon Gray** (#2b2b2b): `{colors.carbon-gray}`. Carbon-fiber-inspired surface tone used on technical-spec cards.

### Hairlines & Borders
- **Hairline** (#3c3c3c): `{colors.hairline}`. The 1px divider tone on dark surfaces. Used between body sections, between table rows, around card outlines.
- **Hairline Strong** (#262626): `{colors.hairline-strong}`. Same hex as `{colors.surface-elevated}` — borders feel like one-step elevations rather than ink lines.

### Text
- **Ink / On Dark** (#ffffff): `{colors.on-dark}`. All headline and primary text on dark canvas.
- **Body** (#bbbbbb): `{colors.body}`. Default running-text color (slightly cooler than pure white). Used for body paragraphs and secondary metadata.
- **Body Strong** (#e6e6e6): `{colors.body-strong}`. Emphasized body / lead paragraph.
- **Muted** (#7e7e7e): `{colors.muted}`. Footer links, breadcrumbs, captions.

### Semantic
- **Warning** (#f4b400): `{colors.warning}`. Used very sparingly on technical-warning callouts.
- **Success** (#0fa336): `{colors.success}`. Order-confirmation states (rare on marketing surfaces).

## 3. Typography Rules
### Font Family
**BMW Type Next Latin** is BMW's licensed display + body typeface. Align fallback guidance with the existing BMW design system: use `BMWTypeNextLatin Light` for display when available, `BMWTypeNextLatin` for body/UI, then `Helvetica, Arial, Hiragino Kaku Gothic ProN, Hiragino Sans, Meiryo, sans-serif`.

Observed BMW M examples can push uppercase labels, buttons, and card titles heavier for a motorsport "stamped" voice, but the family baseline remains:
- Display: Light (300) for large h1/h2 editorial headlines unless a captured M page clearly uses a heavier static cut
- Body/UI: regular (400) for paragraphs, descriptive copy, and persistent navigation
- Emphasis: 700 for buttons, category labels, and card titles; 900 only where navigation emphasis is explicitly observed

The important pattern is contrast and restraint, not a hard 700/300 split. Avoid medium-weight mush: use Light for large display, regular for reading text, and heavier weights only for short UI labels or M-specific emphasis.

### Hierarchy

| Token | Size | Weight | Line Height | Letter Spacing | Use |
|---|---|---|---|---|---|
| `{typography.display-xl}` | 80px | 300 Light | 1.0 | 0 | Hero h1 ("THE ULTIMATE", "MORE BMW M.") |
| `{typography.display-lg}` | 56px | 300 Light | 1.05 | 0 | Section heads ("MORE FROM BMW M MAGAZINE.") |
| `{typography.display-md}` | 40px | 300 Light / 400 | 1.1 | 0 | Sub-section heads, model names |
| `{typography.display-sm}` | 32px | 400 | 1.15 | 0 | CTA-band heads, category page titles |
| `{typography.title-lg}` | 24px | 700 | 1.3 | 0 | Card titles in 3-up grids |
| `{typography.title-md}` | 20px | 400 | 1.4 | 0 | Card sub-titles, lead paragraphs |
| `{typography.title-sm}` | 18px | 400 | 1.4 | 0 | Spec callouts, intro paragraphs |
| `{typography.label-uppercase}` | 14px | 700 | 1.3 | 1.5px | Category tabs, "VIEW MORE" inline labels |
| `{typography.body-md}` | 16px | 400 | 1.5 | 0 | Default body — BMW Type Next Latin regular |
| `{typography.body-sm}` | 14px | 400 | 1.5 | 0 | Footer body, cookie consent, fine print |
| `{typography.caption}` | 12px | 400 | 1.4 | 0.5px | Photo captions, image-credit lines |
| `{typography.button}` | 14px | 700 | 1.0 | 1.5px | All button labels — uppercase, letterspaced |
| `{typography.nav-link}` | 14px | 400 | 1.4 | 0.5px | Top-nav menu items |

### Principles
The system contrasts light, architectural display type against crisp regular body text, then uses heavier weights only for short labels and action chrome. Letter-spacing is non-trivial: button labels and category labels carry 1.5px tracking that makes them feel "machined" rather than "typed." Display headlines stay at 0 letter-spacing — BMW Type's natural cap-height handles spacing on large sizes.

UPPERCASE display is the default voice for h1/h2 — sentence case appears on body and intro paragraphs but rarely on headlines. The all-caps treatment is a brand-voice signal, not a stylistic choice.

### Note on Font Substitutes
If BMW Type Next Latin is unavailable, **Inter** (variable) at 300/400/700 is the closest open-source substitute. Keep display tracking at 0 unless the chosen fallback looks loose at large sizes. **Saira Condensed** is an alternative for short motorsport labels if a slightly more compressed feel is desired.

## 4. Component Stylings
### Top Navigation

**`top-nav`** — Black nav bar pinned to the top of every page. 64px tall, `{colors.canvas}` background. Carries the BMW M logo at left (M tricolor + BMW roundel + "M" wordmark), primary horizontal menu (Models, Topics, Magazine, Configurator, Fastlane), right-side cluster with language selector, search icon, account icon. Menu items render in `{typography.nav-link}` with sentence-case labels.

### Buttons

**`button-primary`** — The signature primary CTA. Background `{colors.canvas}` (or transparent over photography), text `{colors.on-dark}` (white), 1px white border outline, 0px radius, padding 16px × 32px, height 48px. Type `{typography.button}` — uppercase 14px / 700 / 1.5px tracking. The rectangular silhouette and uppercase letterspaced label IS the brand button.

**`button-primary-outline`** — Same shape as primary but with transparent background and white outline only. Used over photography where a filled button would clash with the image.

**`button-on-light`** — Tentative pattern for unresolved light-surface contexts such as configurator, account, checkout, or order dialogs. Background `{colors.canvas}`, text `{colors.on-dark}` — black button with white text, inverted from the dark-canvas default. Confirm against the specific flow before treating it as canonical.

**`button-icon`** — Circular icon buttons (carousel controls, share, favorite). 48 × 48px, background `{colors.surface-card}`, white icon centered, full-circle radius. The only non-rectangular button shape in the system.

**`carousel-arrow`** — Specific 48 × 48 circular arrow used in photo carousels. Same shape as `button-icon` with chevron glyph.

**`text-link`** — Inline uppercase letterspaced links ("VIEW ALL MODELS", "READ MORE"). `{typography.label-uppercase}`, white on dark, no underline. The chevron arrow → glyph appears next to most link labels.

### Cards & Containers

**`hero-photo-band`** — Full-width black band with full-bleed automotive photography filling most of the frame. The h1 uses `{typography.display-xl}` and sits left-aligned over the photo, often with a small subtitle in `{typography.body-md}` below. Vertical padding `{spacing.xxl}` (64px). No card frame — the photo IS the band.

**`feature-photo-card`** — Used in 3-up grids for "MORE FROM BMW M MAGAZINE" and similar editorial sections. Background `{colors.surface-card}`, 0px radius, internal padding `{spacing.lg}` (24px). Top half of the card is a 16:9 photo (full-bleed within the card); below the photo, a category tag in `{typography.label-uppercase}`, a `{typography.title-lg}` title, and a short body description.

**`model-card`** — Used in the "MORE NEW M MODELS" 3-up grid. Background `{colors.canvas}` (no card surface — just photo on black), 0px radius. Top: 16:10 hero shot of the model. Below: model name in `{typography.display-md}`, short specs line in `{typography.body-sm}`, a `text-link` ("EXPLORE THIS MODEL").

**`magazine-article-card`** — A more text-forward card variant used on the magazine overview page. Background `{colors.canvas}` with hairline border, 0px radius. Carries a small thumbnail at top, a category label in `{typography.label-uppercase}`, headline in `{typography.title-lg}`, and a body excerpt.

**`spec-cell`** — Technical specification cells used on model-detail pages (engine specs, weight, top speed, 0-100 time). Background `{colors.surface-soft}` (#0d0d0d), 0px radius, padding `{spacing.lg}` (24px). Each cell holds a value in `{typography.display-sm}` at top and a label in `{typography.label-uppercase}` below.

**`motorsport-photo-card`** — Edge-to-edge photo cards used in the racing-team / motorsport sections. No card surface — just a full-bleed photograph with a small overlay caption in white text at the bottom-left. The photography IS the brand here.

**`chatbot-launcher`** — A right-side card-style entry point ("BMW M CHATBOT") on the homepage. Background `{colors.surface-card}`, 0px radius, padding `{spacing.lg}` (24px). Carries an h3 title, a short prompt, and a `button-primary` to launch.

**`category-tab`** + **`category-tab-active`** — The category selector tabs used on the magazine and topics pages (e.g., "ALL · MAGAZINE · MODELS · LIFESTYLE · MOTORSPORT"). Tabs render as text-only labels in `{typography.label-uppercase}`. Active state changes text color from `{colors.body}` to `{colors.on-dark}` and adds a 2px white underline below the label. No background fill, no rounded corners.

### Inputs & Forms

**`text-input`** — Standard text input on dark surfaces. Background `{colors.surface-card}`, text `{colors.on-dark}`, type `{typography.body-md}`, 0px radius, padding 12px × 16px, height 48px. 1px hairline border. Focus state thickens the border to white.

**`cookie-consent-card`** — A right-side cookie-banner card visible on the homepage. Background `{colors.canvas}` with 1px hairline, 0px radius, padding `{spacing.lg}` (24px). Body text in `{typography.body-sm}`. Two buttons stacked at bottom: primary outline + text-link.

### Signature Components

**`m-stripe-divider`** — The 4px horizontal stripe carrying the M tricolor (`{colors.m-blue-light}` → `{colors.m-blue-dark}` → `{colors.m-red}`). Used as a divider on motorsport chrome, between brand-identity sections, and as a hover-state indicator on category tabs. The most distinctive non-typographic element in the system.

**`cta-band-photo`** — A pre-footer "Drive an M" CTA band carrying full-bleed photography of a car cornering on a track, with a centered headline in `{typography.display-md}` and a `button-primary-outline` below. Vertical padding 80px. The CTA inherits the editorial gravity of the rest of the page through full-bleed photography rather than chrome.

### Footer

**`footer`** — Black footer observed on analyzed marketing pages. Background `{colors.canvas}`, text `{colors.body}`. 4-column link list at desktop covering BMW M Models / BMW M Lifestyle / Owners / Company. Vertical padding 64px. Bottom row carries the BMW corporate disclaimer in `{typography.caption}` and language selector. Treat black footer behavior as confirmed for editorial/marketing pages, not for unresolved account or checkout flows.

## 5. Layout Principles
### Spacing System
- **Base unit:** 4px.
- **Tokens:** `{spacing.xxs}` 4px · `{spacing.xs}` 8px · `{spacing.sm}` 12px · `{spacing.md}` 16px · `{spacing.lg}` 24px · `{spacing.xl}` 40px · `{spacing.xxl}` 64px · `{spacing.section}` 96px.
- **Section padding (vertical):** `{spacing.section}` (96px) between major editorial bands.
- **Hero photo bands:** `{spacing.xxl}` (64px) internal vertical padding around the hero h1 + sub-headline pair.
- **Card internal padding:** `{spacing.lg}` (24px) for content and model cards; `{spacing.xl}` (40px) for spec-cell tables.
- **Gutters:** `{spacing.lg}` (24px) between cards in 3-up grids; `{spacing.md}` (16px) inside footer columns.

### Grid & Container
- **Max content width:** ~1440px centered on marketing pages — wider than typical SaaS to give photography breathing room.
- **Editorial body:** Single 12-column grid; photo bands bleed full-bleed (no max-width).
- **Card grids:** 3-up at desktop, 2-up at tablet, 1-up at mobile.
- **Footer:** 4-column link list at desktop, 2-up at tablet, 1-up at mobile.

### Whitespace Philosophy
BMW M trusts photography to do the visual work. Whitespace around photography is restrained — the cars fill the frame, and copy sits below or beside them in tightly-aligned columns. Where whitespace appears (between body sections, around CTAs), it's always uniform `{spacing.section}` (96px). The system should avoid decorative atmospheric backdrops and ornamental gradients; functional contrast scrims are allowed when photo crops would make white text fail contrast.

## 6. Depth & Elevation
| Level | Treatment | Use |
|---|---|---|
| Flat | No shadow, no border | Body sections, top nav, footer, photo bands |
| Soft hairline | 1px `{colors.hairline}` border | Section dividers, card outlines, table rows |
| Card surface | `{colors.surface-card}` background over canvas — no shadow | Feature photo cards, magazine cards, chatbot launcher |
| Photographic depth | Full-bleed photography with edge-to-edge crop | Hero bands, motorsport features — depth via subject matter, not chrome |

The system uses no drop shadows and no layered chrome. Depth comes entirely from photography (subject + lens + lighting) and the contrast between black canvas and slightly-elevated `{colors.surface-card}`.

### Decorative Depth
- **M Stripe Divider** (`m-stripe-divider`): A 4px-tall horizontal divider carrying the M tricolor (`{colors.m-blue-light}` → `{colors.m-blue-dark}` → `{colors.m-red}`). Used on motorsport chrome, model-detail headers, and brand-identity moments. The stripe is the system's only true "decorative" element — used sparingly to mark significance.
- **Carbon-fiber surfaces**: The technical-spec page uses `{colors.carbon-gray}` (#2b2b2b) cells with subtle texture overlay. This is a single-page treatment, not a system-wide pattern.
- **Photographic depth**: Full-bleed cars are the depth. Lighting in the photography (track lights, sunset rim-light) does the elevation work that drop shadows would do in a SaaS system.

## 7. Do's and Don'ts
### Do
- Anchor every page with full-bleed automotive photography. The cars are the brand voltage; chrome backs off.
- Use UPPERCASE display headlines in `{typography.display-xl}` or `{typography.display-lg}`. Sentence-case display reads as off-brand.
- Keep typography disciplined: Light display, regular body text, heavier weights only for short labels, buttons, card titles, or observed M-specific emphasis.
- Reserve the M tricolor stripe for brand-identity moments — wordmark accents, motorsport chrome, model badges. Never as a button fill or surface.
- Use 0px radius by default. Reserve full-circle geometry for circular icon buttons only.
- Letter-space all-caps labels at 1.5px. The "machined" feel is non-negotiable.
- Use `{spacing.section}` (96px) between major editorial bands for grid-aligned vertical rhythm.

### Don't
- Don't introduce a brand color outside the M tricolor (`{colors.m-blue-light}` / `{colors.m-blue-dark}` / `{colors.m-red}`) and the documented electric-blue accent.
- Don't force body type into Light if readability suffers. Body should usually stay regular 400; reserve Light for large display and secondary editorial moments.
- Don't use rounded buttons. The rectangular silhouette IS the brand. Rounded corners read as consumer-tech, not motorsport.
- Don't put decorative gradient backdrops behind hero type. If a crop makes text fail contrast, add a functional black scrim, reposition the crop, or move the text into a solid black panel.
- Don't repeat the same surface mode in two consecutive bands. Rhythm: photo band → spec table → photo band → magazine grid → photo band. Two text-only bands in a row read as a corporate site.
- Don't use the M stripe as a button fill. The stripe is a divider / accent — never an action surface.
- Don't bold uppercase tracking under 1.5px on button labels — the spacing is what makes them feel "machined."

## 8. Responsive Behavior
### Breakpoints

| Name | Width | Key Changes |
|---|---|---|
| Mobile | < 768px | Hamburger nav; hero h1 scales 80→48px; demo grid 1-up; photo cards stack full-width; footer 4 cols → 1 |
| Tablet | 768–1024px | Top nav stays horizontal but tightens; 2-up card grids; spec tables 2-up |
| Desktop | 1024–1440px | Full top-nav; 3-up card grids; spec tables 4-up |
| Wide | > 1440px | Same as desktop with more breathing room; max content 1440px |

### Touch Targets
- `button-primary` renders at 48 × 48px minimum where possible; never go below a 44 × 44px pointer target.
- `button-icon` and `carousel-arrow` are exactly 48 × 48px — comfortably above the 44 × 44px minimum.
- `text-input` height is 48px.
- Category tabs render as text-only labels with at least 12px vertical padding and enough horizontal spacing to create a 44px minimum effective tap area.

### Text Over Photography & Focus
- White body text over photography must meet at least 4.5:1 contrast; large display text and icon strokes must meet at least 3:1.
- First choice is crop discipline: place text over dark track, shadow, cockpit, or black bodywork regions. Avoid placing text over sky, headlights, white paint, concrete, or reflective highlights.
- If crop discipline is not enough, use a functional black scrim (`rgba(0,0,0,0.45)` to `rgba(0,0,0,0.70)`) behind the text area. A left-to-right scrim is acceptable only as an accessibility layer, not as decoration.
- If a scrim still fails contrast, move copy into a solid `{colors.canvas}` panel with 24px minimum padding.
- Focus visibility on black or photo backgrounds must use a 2px white outline plus a 2px offset ring in `{colors.electric-blue}`. On light unresolved surfaces, invert to a 2px `{colors.electric-blue}` outline with visible offset.

### Collapsing Strategy
- Top nav collapses to a hamburger sheet at < 768px; the menu opens as a full-screen black overlay with the M tricolor stripe at the top.
- Photography stays full-bleed at every breakpoint — never collapses to a margin'd container.
- Card grids reduce columns rather than scaling cards down; photography retains its native aspect ratio.
- Spec tables collapse from 4-up to 2-up to 1-up; spec values stay at `{typography.display-sm}` regardless of column count.
- The M-stripe divider stays at 4px height across all breakpoints.

### Image Behavior
- Hero photography crops responsively — wider crops at desktop, vertical crops on mobile.
- Lifestyle and motorsport photos retain native aspect ratios; the system never letterboxes or pillarboxes.
- The M wordmark + tricolor logo scales proportionally with viewport width.

## 9. Agent Prompt Guide
1. Focus on ONE component at a time. Reference its component name (`hero-photo-band`, `spec-cell`).
2. New components default to 0px radius. Only use full-circle geometry for circular icon buttons.
3. Variants (`-active`, `-disabled`) live as separate prose entries next to the component name.
4. Use `{token.refs}` everywhere — never inline hex.
5. Never document hover states. Default and Active/Pressed only.
6. Display headlines stay UPPERCASE and light/architectural by default; body stays sentence-case regular. Use 700 only for short emphasis and UI labels.
7. The M tricolor is brand-identity-only — never extend it to system tokens for "primary action."
8. White-on-photo text needs a contrast strategy every time: crop first, scrim second, solid panel if needed.
9. When in doubt about emphasis: bigger photography before bigger type.

### Known Gaps
- The dembrandt frequency analyzer captured the white text (count 955) as the highest-frequency token. The black canvas was inferred from screenshot — dembrandt's body-background sampling didn't surface it as a top palette entry, but the page is unambiguously black-on-white-text.
- The exact M tricolor stops are documented from public BMW brand guidelines; the screenshots show the stripe as a small element but pixel-sampling at this resolution doesn't reliably distinguish #0066b1 from #1c69d4. Treat the documented stops as canonical based on BMW Design Works' published brand spec.
- BMW Type Next Latin weight evidence is incomplete. The broader BMW design system documents Light (300) display and regular (400) body/UI; BMW M-specific heavier label usage should be treated as observed emphasis, not a global replacement for BMW family typography.
- Animation and transition timings (photo carousel transitions, hover-reveal effects, configurator interactions) are not in scope.
- Form validation states beyond `text-input` defaults are not extracted — error / success input variants would need a configurator or order flow to confirm.
- The configurator surface (vehicle build pages with color / wheel / interior pickers) was not in the analyzed URL set; its swatch grid, comparison panels, and price-summary card are not documented here.
- The cookie consent overlay obscured part of the homepage hero in the captured screenshot; secondary hero treatments (different car models cycling through the hero band) may carry variations not captured.
