# Claude.com Design System

> Category: Marketing / Editorial
> Surface: web
> Status: Live — claude.ai

## 1. Visual Theme & Atmosphere

Claude.com is the warmest, most editorial interface in the AI-product category. The base atmosphere is a **tinted cream canvas** (`--color-canvas` — #faf9f5) — distinctly warm, deliberately not the cool gray-white that every other AI brand uses. Headlines run a **slab-serif display** (Copernicus / Tiempos Headline) at weight 400 with negative letter-spacing, paired with **StyreneB / Inter** body sans. The combination feels like a literary publication, not a SaaS marketing page.

Brand voltage comes from the **cream + coral pairing** — coral (`--color-primary` — #cc785c) is the signature Anthropic accent, used on every primary CTA, on the brand wordmark, and on full-bleed callout cards. The coral is warm, slightly muted, never cyan/blue — a deliberate counter-positioning against OpenAI's cool slate, Google's saturated blue, and Microsoft's corporate cyan.

The system has three surface modes that alternate page-by-page:

1. **Cream canvas** (`--color-canvas`) — default body floor
2. **Light cream cards** (`--color-surface-card`) — feature card backgrounds
3. **Dark navy product surfaces** (`--color-surface-dark`) — code editor mockups, model showcase cards, pre-footer CTAs, footer itself

The dark surfaces show Claude's product chrome — code blocks, terminal output, model comparison tables, agentic-flow diagrams. The cream-to-dark contrast is the page's pacing rhythm.

### Key Characteristics

- Warm cream canvas (#faf9f5) with dark warm-ink text (#141413). The brand's defining color choice.
- Coral primary CTA (#cc785c). Used scarcely on individual buttons, generously on full-bleed coral callout cards.
- Slab-serif display headlines via Copernicus / Tiempos Headline at weight 400 with negative letter-spacing.
- Dark navy product mockup cards (#181715) carrying code blocks, terminal panels, model comparison data.
- Light cream feature cards (#efe9de) — slightly darker than canvas, used for content-driven feature explanations.
- Anthropic radial-spike mark — a small black asterisk-like glyph (4-spoke radial) appearing as brand wordmark prefix.
- Border radius hierarchy: 8px buttons/inputs, 12px cards, 16px hero containers, pill badges.
- Section rhythm 96px between major bands. Card internal padding 32px.

## 2. Color

### Brand & Accent

| Token | Hex | Usage |
|---|---|---|
| `--color-primary` | #cc785c | Coral primary — CTA backgrounds, callout cards, wordmark accent |
| `--color-primary-active` | #a9583e | Press/hover-darker variant of primary |
| `--color-primary-disabled` | #e6dfd8 | Desaturated cream-tinted disabled state |
| `--color-accent-teal` | #5db8a6 | Secondary product surfaces (terminal status, active connection) |
| `--color-accent-amber` | #e8a55a | Category badges, inline highlights |

### Surface

| Token | Hex | Usage |
|---|---|---|
| `--color-canvas` | #faf9f5 | Default page floor. Tinted cream — warm, deliberately not pure white |
| `--color-surface-soft` | #f5f0e8 | Section dividers, very-soft band backgrounds |
| `--color-surface-card` | #efe9de | Feature cards, content cards. One step darker than canvas |
| `--color-surface-cream-strong` | #e8e0d2 | Selected category tabs, emphasized section bands |
| `--color-surface-dark` | #181715 | Code editor mockups, model showcase cards, footer |
| `--color-surface-dark-elevated` | #252320 | Elevated cards inside dark bands |
| `--color-surface-dark-soft` | #1f1e1b | Code block backgrounds inside larger dark cards |
| `--color-hairline` | #e6dfd8 | 1px border tone on cream surfaces |
| `--color-hairline-soft` | #ebe6df | Barely-visible divider inside same band |

### Text

| Token | Hex | Usage |
|---|---|---|
| `--color-ink` | #141413 | All headlines and primary text. Warm dark |
| `--color-body-strong` | #252523 | Emphasized paragraphs, lead text |
| `--color-body` | #3d3d3a | Default running-text color |
| `--color-muted` | #6c6a64 | Sub-headings, breadcrumbs, footer-adjacent text |
| `--color-muted-soft` | #8e8b82 | Captions, fine-print, copyright lines |
| `--color-on-primary` | #ffffff | Text on coral buttons |
| `--color-on-dark` | #faf9f5 | Cream-tinted white on dark surfaces |
| `--color-on-dark-soft` | #a09d96 | Footer body text, secondary labels in dark mockups |

### Semantic

| Token | Hex | Usage |
|---|---|---|
| `--color-success` | #5db872 | Green status dots, "available" indicators |
| `--color-warning` | #d4a017 | Warning callouts |
| `--color-error` | #c64545 | Validation errors |

## 3. Typography

### Font Family

The system runs **Copernicus** (or **Tiempos Headline** as substitute) as the slab-serif display face for headlines, and **StyreneB** (or **Inter** as substitute) as the humanist sans for body, navigation, and UI labels. **JetBrains Mono** handles code blocks.

Fallback stacks:
- Display: `"Tiempos Headline", "Cormorant Garamond", Garamond, "Times New Roman", serif`
- Body: `Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`
- Code: `"JetBrains Mono", "Fira Code", "SF Mono", Menlo, monospace`

Roles:
- Copernicus serif (weight 400, negative tracking) → h1, h2, h3, hero display
- StyreneB sans (weight 400-500) → body, navigation, buttons, captions, labels
- JetBrains Mono → all code blocks and terminal text

### Hierarchy

| Token | Size | Weight | Line Ht | Letter Spacing | Usage |
|---|---|---|---|---|---|
| `--text-display-xl` | 64px | 400 | 1.05 | -1.5px | Homepage h1 — Copernicus serif |
| `--text-display-lg` | 48px | 400 | 1.1 | -1px | Section heads — Copernicus |
| `--text-display-md` | 36px | 400 | 1.15 | -0.5px | Sub-section heads, model names — Copernicus |
| `--text-display-sm` | 28px | 400 | 1.2 | -0.3px | Pricing tier names, callout headlines — Copernicus |
| `--text-title-lg` | 22px | 500 | 1.3 | 0 | Pricing plan size labels — StyreneB |
| `--text-title-md` | 18px | 500 | 1.4 | 0 | Feature card titles, intro paragraphs |
| `--text-title-sm` | 16px | 500 | 1.4 | 0 | Connector tile titles, list labels |
| `--text-body-md` | 16px | 400 | 1.55 | 0 | Default running-text — StyreneB |
| `--text-body-sm` | 14px | 400 | 1.55 | 0 | Footer body, fine-print |
| `--text-caption` | 13px | 500 | 1.4 | 0 | Badge labels, captions |
| `--text-caption-uppercase` | 12px | 500 | 1.4 | 1.5px | Category tags, "NEW" badges |
| `--text-code` | 14px | 400 | 1.6 | 0 | Code blocks — JetBrains Mono |
| `--text-button` | 14px | 500 | 1.0 | 0 | Standard button labels |
| `--text-nav-link` | 14px | 500 | 1.4 | 0 | Top-nav menu items |

### Principles

- Display sizes use weight 400 (regular), never bold.
- Negative letter-spacing (-0.3 to -1.5px) is non-negotiable for Copernicus.
- Body type stays at weight 400 for paragraphs, weight 500 for labels and emphasized phrases.
- The sans body is humanist (StyreneB) — never geometric.

### Open-Source Substitutes

- If Copernicus / Tiempos Headline is unavailable: **Cormorant Garamond** at weight 500 with -0.02em letter-spacing.
- Further fallback: **EB Garamond**.
- For StyreneB: **Inter** is the closest match — both are humanist sans designed for screen reading.
- **Söhne** is another close alternative if licensed.

## 4. Spacing

### Spacing Scale

Base unit: 4px.

| Token | Value |
|---|---|
| `--space-xxs` | 4px |
| `--space-xs` | 8px |
| `--space-sm` | 12px |
| `--space-md` | 16px |
| `--space-lg` | 24px |
| `--space-xl` | 32px |
| `--space-xxl` | 48px |
| `--space-section` | 96px |

### Usage

- Section padding: `--space-section` (96px) — modern-SaaS rhythm.
- Card internal padding: `--space-xl` (32px) for feature cards, pricing tier cards, model comparison cards.
- Code-window cards and connector tiles: `--space-lg` (24px).
- Callout / CTA bands: `--space-xxl` (48px) inside coral callout cards; 64px inside the larger dark CTA band.

### Border Radius

| Token | Value | Usage |
|---|---|---|
| `--radius-xs` | 4px | Badge accents, tiny dropdowns |
| `--radius-sm` | 6px | Small inline buttons, dropdown items |
| `--radius-md` | 8px | Standard CTA buttons, text inputs, category tabs |
| `--radius-lg` | 12px | Content cards (feature, pricing, code-window, model-comparison) |
| `--radius-xl` | 16px | Hero illustration container, marquee components |
| `--radius-pill` | 9999px | Badge pills, "NEW" tags |
| `--radius-full` | 9999px / 50% | Avatar substitutes, icon buttons |

### Elevation & Depth

| Level | Treatment | Usage |
|---|---|---|
| Flat | No shadow, no border | Body sections, top nav, hero bands |
| Soft hairline | 1px `--color-hairline` border | Inputs, sub-nav, occasionally on cards |
| Cream card | `--color-surface-card` bg — no shadow | Feature cards, content cards |
| Dark surface card | `--color-surface-dark` bg — no shadow | Code editor mockups, model showcase cards |
| Subtle drop shadow | `0 1px 3px rgba(20,20,19,0.08)` | Rare hover-elevated states |

The elevation philosophy is **color-block first, shadow rare**. Most depth comes from cream-vs-dark surface contrast. Shadows are minimal.

### Decorative Depth

- The Anthropic spike-mark glyph (4-spoke radial asterisk) appears as a small black mark in the brand wordmark and inline as a content marker.
- Code editor mockups carry their own internal depth: syntax-highlighted text in muted blues / oranges / grays, line numbers in `--color-muted-soft`, status bars in `--color-surface-dark-elevated`.
- Hero illustrations use simple line-art with coral and dark-navy strokes on cream.

## 5. Layout & Composition

### Grid & Container

- Max content width: ~1200px centered.
- Editorial body: Single 12-column grid; hero often uses 6/6 split (h1 left, illustration right).
- Feature card grids: 3-up at desktop, 2-up at tablet, 1-up at mobile.
- Connector tile grids: 4-up or 6-up at desktop, 2-up at tablet, 1-up at mobile.
- Pricing grid: 3-up at desktop, 1-up at mobile.

### Whitespace Philosophy

Cream canvas + serif display + generous internal padding create an editorial pacing — Claude reads like a long-form magazine column rather than a marketing template. Whitespace between bands stays uniform at 96px; whitespace inside cards is generous (32px).

### Breakpoints

| Name | Width | Key Changes |
|---|---|---|
| Mobile | < 768px | Hamburger nav; hero h1 64→32px; hero card stacks below content; feature grids 1-up; connector tiles 2-up; pricing 1-up; footer 4 cols → 1 |
| Tablet | 768–1024px | Top nav stays horizontal but tightens; feature cards 2-up; connector tiles 3-up; pricing 2-up |
| Desktop | 1024–1440px | Full nav; 3-up feature cards; 4-up or 6-up connector tiles; 3-up pricing |
| Wide | > 1440px | Same as desktop with more outer breathing room; max content width 1200px |

### Touch Targets

- Buttons: minimum 40px height.
- Icon circular buttons: exactly 36px × 36px.
- Text inputs: 40px height.
- Connector tile entire card area is tappable (effective tap area >> 44px).

### Collapsing Strategy

- Top nav collapses to hamburger at < 768px; menu opens as full-screen cream sheet.
- Hero band's 6-6 grid collapses to single-column on mobile.
- Feature grids reduce columns rather than scaling cards down.
- Pricing tier cards collapse 4 → 2 → 1; featured dark surface stays distinct.
- Code-window cards retain code legibility via horizontal scroll on mobile.

## 6. Components

### Top Navigation

**`top-nav`** — Cream nav bar pinned to the top of every page. 64px tall, `--color-canvas` background. Anthropic spike-mark + "Claude" wordmark at left, primary horizontal menu (Product, Solutions, Use Cases, Pricing, Research, Company) center-left, right-side cluster with "Sign in" text-link, "Try Claude" primary button (coral). Menu items in `--text-nav-link` (14px / 500).

### Buttons

**`button-primary`** — Signature coral CTA. Background `--color-primary` (#cc785c), text `--color-on-primary` (white), type `--text-button` (14px / 500), padding 12px × 20px, height 40px, radius `--radius-md` (8px). Active state darkens to `--color-primary-active` (#a9583e).

**`button-secondary`** — Cream button with hairline outline. Background `--color-canvas`, text `--color-ink`, 1px hairline border, same padding + height + radius as primary.

**`button-secondary-on-dark`** — Over `--color-surface-dark` cards. Background `--color-surface-dark-elevated` (#252320), text `--color-on-dark`. Never inverts to light.

**`button-text-link`** — Inline text button, no background. "Sign in", inline CTA links.

**`button-icon-circular`** — 36px circular icon button. Background `--color-canvas`, hairline border, ink-color icon. Used for carousel arrows, share, "view more".

**`text-link`** — Inline body links in `--color-primary` (coral). Underlined on press.

### Cards & Containers

**`hero-band`** — Cream-canvas hero with 6-6 grid: h1 + sub-headline + button row on left, illustration or mockup on right. Vertical padding `--space-section` (96px).

**`hero-illustration-card`** — Larger card holding the hero's right-side artifact. Background `--color-canvas` or `--color-surface-dark`, radius `--radius-xl` (16px).

**`feature-card`** — 3-up feature grids. Background `--color-surface-card` (#efe9de), radius `--radius-lg` (12px), padding `--space-xl` (32px). Icon at top, `--text-title-md` headline, `--text-body-md` description.

**`product-mockup-card-dark`** — Dark navy card showing Claude product chrome (chat interface, code editor, agent controls). Background `--color-surface-dark`, radius `--radius-lg`, padding `--space-xl` (32px). Text in `--color-on-dark`.

**`code-window-card`** — Dark card showing a code editor with line numbers, syntax-highlighted code in JetBrains Mono. Background `--color-surface-dark` with `--color-surface-dark-soft` inner code block, radius `--radius-lg`, padding `--space-lg` (24px). Signature visual element of Claude Code product pages.

**`model-comparison-card`** — Compares Opus / Sonnet / Haiku. Background `--color-canvas` with hairline border, radius `--radius-lg`, padding `--space-xl` (32px). Model name, capability blurb, and `text-link`.

**`pricing-tier-card`** — Standard tier. Background `--color-canvas` with hairline border, radius `--radius-lg`, padding `--space-xl` (32px). Plan name in `--text-title-lg`, price in `--text-display-sm`, feature list in `--text-body-md`, primary button at bottom.

**`pricing-tier-card-featured`** — Featured tier. Background flips to `--color-surface-dark`, text inverts to `--color-on-dark`. The dark surface IS the featured signal.

**`callout-card-coral`** — Full-bleed coral CTA card. Background `--color-primary` (#cc785c), text `--color-on-primary` (white), radius `--radius-lg`, padding `--space-xxl` (48px). Inverted button style (cream button on coral).

**`connector-tile`** — Integration grid tiles. Background `--color-canvas` with hairline border, radius `--radius-lg`, padding 20px. Logo, `--text-title-sm` name, short description.

### Inputs & Forms

**`text-input`** — Standard input. Background `--color-canvas`, text `--color-ink`, type `--text-body-md`, radius `--radius-md` (8px), padding 10px × 14px, height 40px. 1px hairline border in `--color-hairline`.

**`text-input-focused`** — Focus state. Border shifts to `--color-primary` (coral). 3px coral-at-15%-alpha outer ring.

**`cookie-consent-card`** — Bottom-right floating dark banner. Background `--color-surface-dark`, text `--color-on-dark`, radius `--radius-lg`, padding `--space-lg` (24px).

### Tags / Badges

**`badge-pill`** — Small pill label. Background `--color-surface-card`, text `--color-ink`, type `--text-caption` (13px / 500), radius `--radius-pill`, padding 4px × 12px.

**`badge-coral`** — Coral-fill badge for "NEW", "BETA". Background `--color-primary`, text `--color-on-primary`, type `--text-caption-uppercase` (12px / 500 / 1.5px tracking), radius `--radius-pill`, padding 4px × 12px.

### Tab / Filter

**`category-tab`** / **`category-tab-active`** — Inactive: transparent, `--color-muted` text. Active: `--color-surface-card` background, `--color-ink` text. Padding 8px × 14px, radius `--radius-md`.

### CTA / Footer

**`cta-band-coral`** — Pre-footer "Try Claude" CTA. Coral fill, white type, radius `--radius-lg`, padding 64px. h2 in `--text-display-sm` (serif!), sub-line, cream-button CTA.

**`cta-band-dark`** — Alternative developer-focused pre-footer. Background `--color-surface-dark`, text `--color-on-dark`, radius `--radius-lg`, padding 64px. Often pairs with code-window card.

**`footer`** — Dark navy footer closing every page. Background `--color-surface-dark` (#181715), text `--color-on-dark-soft`. 4-column link list covering Product / Company / Resources / Legal. Vertical padding 64px. Spike-mark + "Anthropic" wordmark at top in `--color-on-dark`.

## 7. Motion & Interaction

### Interaction States

- **Buttons**: Primary darkens on hover/press (`--color-primary-active`). No scale or lift animation.
- **Text inputs**: Focus draws coral border + 3px coral-15%-alpha ring. No transition animation.
- **Links**: Coral underline on press. No hover color shift.
- **The system encodes default and active/pressed states only.** Hover as an intermediate state is intentionally minimal.

### Intentional Stillness

The Claude.com design system uses minimal motion on marketing surfaces. The editorial feel comes from composition and type, not animation. Key exceptions (not currently tokenized):
- Chat message reveal animation on claude.ai product surface
- Code block typewriter effect on homepage
- Agentic-flow diagram animations on product pages

### Reduced Motion

Respect `prefers-reduced-motion: reduce` by disabling all non-essential animation.

### Load States

- Buttons show no loading spinner (the system prefers instant feedback or disabled state).
- Cards render instantly — no skeleton screens on marketing content.
- Code editor mockups render with content already in place (no typing simulation on static pages).

## 8. Voice & Brand

### Copy Style

- Editorial, warm, considered — like a literary magazine, not a SaaS brochure.
- Direct address ("Meet your thinking partner", "Which problem are you up against?").
- Technical but not cold — developer copy (code, models, agents) presented with the same editorial care as marketing copy.
- Questions as section heads are a brand pattern ("What can Claude do?", "Which model is right for you?").

### Terminology

- **Claude**: always capitalized. Never "claude" or "CLAUDE".
- **Opus / Sonnet / Haiku**: model names capitalized, presented as tier labels.
- **Claude Code**: product name for developer tooling.
- **"Thinking partner"**: brand tagline.
- Conversational, first-person ("I can help you...") for product copy; third-person for marketing copy.

### Capitalization

- Title case for navigation items (Product, Solutions, Use Cases).
- Sentence case for headlines, buttons, and calls-to-action.
- UPPERCASE for badge labels only ("NEW", "BETA").

### Brand Elements

- **Anthropic spike-mark**: 4-spoke radial asterisk glyph. Black on cream, never inverted within the wordmark. Used as brand wordmark prefix and as inline content marker.
- **Coral wordmark accent**: The anthropic wordmark uses coral (`--color-primary`) as the distinguishing color element.
- **"Try Claude"**: The primary CTA copy across the site. Consistent imperative.

## 9. Anti-patterns

### Visual Anti-patterns

- ❌ Pure white or cool gray page backgrounds. Cream is the brand.
- ❌ Bold weight (700) on serif display. Copernicus must stay at 400.
- ❌ Cyan or cool blue as a brand accent. Coral is the brand voltage.
- ❌ Saturated neon gradients. The system uses muted cream-to-dark contrast.
- ❌ Inter or any sans-serif for display headlines. Serif character is the brand voice.
- ❌ Three consecutive same-surface bands. Pacing must alternate cream ↔ cream-card ↔ dark-mockup.
- ❌ Geometric sans for body. Only humanist (StyreneB, Inter).
- ❌ Emoji as feature icons (✨ 🚀 🎯). Use minimal line-art or no icon.
- ❌ Rounded cards with left colored border accent. The system uses flat cards with surface color only.
- ❌ Hand-drawn SVG humans / faces / scenery. Use code editor mockups instead of illustrations.
- ❌ Purple or violet in any palette. Not part of the brand.
- ❌ Photorealism or stock photography. Use code mockups or line-art.
- ❌ Drop shadows on cards. Depth comes from surface color contrast.
- ❌ Gradient backgrounds. The system is flat.
- ❌ Ornamental flourishes. One decisive flourish per page (a coral callout, a code window).

### Interaction Anti-patterns

- ❌ Hover scale or lift on buttons. The system darkens on press only.
- ❌ Skeleton screens or spinners on marketing content.
- ❌ Auto-playing animations or video.
- ❌ Carousel auto-rotation.
- ❌ Floating demo controls, theme toggles, or viewport switchers in product artifacts.

### Content Anti-patterns

- ❌ Lorem ipsum or placeholder copy in shipped work.
- ❌ Generic feature names ("Feature One", "Feature Two").
- ❌ Invented metrics ("10× faster", "99.9% uptime") without a real source.
- ❌ Filler stat-slop to fill card space.
- ❌ Technical jargon where editorial copy is clearer.
- ❌ Cold, corporate marketing voice. Keep the warm editorial tone.

## Known Gaps

- Copernicus and StyreneB are licensed Anthropic typefaces not available as public web fonts. Substitutes are documented in section 3.
- The Anthropic radial-spike-mark is a brand glyph rendered as inline SVG; not formalized as a system component.
- Animation timings (chat reveal, code typewriter, agent flow diagrams) are not tokenized.
- Product surface components (chat bubbles, message tools, file upload chips, conversation sidebar) are out of scope for this marketing-surface document.
- The "agent" / "computer use" demo cards include animation chrome not captured statically.

---

## Source Context

- **Product**: Claude.com — Anthropic's AI assistant marketing site
- **Surface**: Responsive web (marketing)
- **Source method**: Manual extraction from public marketing pages at claude.ai
- **Evidence file**: `context/source-context.md`
- **Typefaces**: Copernicus (licensed), StyreneB (licensed), JetBrains Mono (open-source)
- **Status**: Live — active production system
- **Known gaps**: See section above. Fonts are licensed and not publicly loadable; substitutes documented in §3.

---

*Maintained as part of the Claude.com Design System package. Source: claude.ai public marketing site.*
