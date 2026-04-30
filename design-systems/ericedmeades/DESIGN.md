# Eric Edmeades — Speaker Brand

> Category: Speaker & Personal Brand
> Monochrome editorial / executive keynote-speaker brand. B&W spine with warm bronze accent. Authoritative, third-person, zero softness. NO WildFit green.

## 1. Visual Theme & Atmosphere

Eric Edmeades' personal brand reads as **monochrome editorial / executive keynote-speaker** — geometric black wordmark on white, all-caps heavy-sans headlines, uppercase CTAs, zero color outside black/white/bronze. The aesthetic sits closer to a publishing imprint or law firm than a wellness coach. It reinforces his "Transformation Architect" positioning: precise, architectural, deliberate.

The dominant visual language is **high-contrast B&W**: keynote-stage photography shot from the side with strong key light against a dark background (duotone or full B&W), dense typography blocks at large scale, and a single warm bronze accent (`#B08D57`) reserved for credibility markers, award badges, and premium callouts.

Hero preference: **dark editorial mode** — near-black or pure-black section with white display type, or typography-only hero if stage photography rights are not confirmed. Never use the light/airy/wellness aesthetic from the WildFit sub-brand here.

**Key characteristics:**
- Pure black / pure white as the structural spine — the only "colors" in the system
- Inter Black 900 at large scale, all-caps, tight letter-spacing — architectural letterform blocks
- Single warm bronze accent (`#B08D57`) for credibility pills, award badges, separator diamonds
- B&W stage photography or typography-only dark hero — no lifestyle imagery, no flat icons
- Third-person voice about Eric; second-person "you" in CTAs and offer copy; zero "we" / "join us"
- `◆` diamond glyph as the credibility-ribbon separator (all-caps, dark background)

**WildFit is a SEPARATE brand.** Do NOT mix WildFit green (`#7FC242`→`#4CAF50` gradient) with this system. If the request is for a WildFit page, use a different design system entry.

## 2. Color Palette & Roles

- **Primary:** `#000000` — logo, headlines, dark sections, primary buttons, icon fills
- **Background:** `#FFFFFF` — hero background (light mode), cards, page canvas
- **Subtle Background:** `#F5F4F1` — section dividers, off-white card surfaces, bone tint
- **Accent (Bronze):** `#B08D57` — credibility-marker pills, award badges, ◆ separators, premium highlight strokes; ONE accent element per screen maximum
- **Body Text:** `#1A1A1A` — long-form copy, bios, paragraph text (near-black, not harsh)
- **Inverse Text:** `#FFFFFF` — text on dark/black sections and buttons
- **Muted:** `#6B6B6B` — timestamps, fine print, secondary metadata

**DO NOT use any of the following:**
- WildFit green (`#7FC242`, `#4CAF50`, or any green gradient)
- Saturated or warm-hued brand colors (orange, yellow, red, blue)
- Pure gray mid-tones as primary content color

## 3. Typography Rules

### Font Families
- **Display / Headlines:** `'Inter'` at weight **900** (Black), or fallback `'Archivo Black', 'Space Grotesk', system-ui, sans-serif`
- **Body / UI:** `'Inter'` at weight **400** (Regular), or fallback `system-ui, -apple-system, sans-serif`
- **Subheadings / Labels:** `'Inter'` at weight **700** (Bold)
- Load Inter from Google Fonts: `@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&display=swap');`

### Type Scale & Treatment

| Role | Family | Weight | Size | Transform | Tracking | Line-height |
|------|--------|--------|------|-----------|----------|-------------|
| Display Hero | Inter | 900 | 64–96px | ALL-CAPS | -0.04em | 1.0 |
| Display Large | Inter | 900 | 48–64px | ALL-CAPS | -0.03em | 1.0 |
| Section Heading | Inter | 900 | 32–40px | ALL-CAPS | -0.02em | 1.05 |
| Subheading | Inter | 700 | 20–24px | uppercase | -0.01em | 1.2 |
| Body Large | Inter | 400 | 18–20px | none | 0 | 1.6 |
| Body | Inter | 400 | 16px | none | 0 | 1.7 |
| Caption / Meta | Inter | 400 | 12–14px | none | 0.01em | 1.5 |
| CTA / Button | Inter | 900 | 14–16px | ALL-CAPS | 0.06em | 1.0 |
| Credibility Ribbon | Inter | 700 | 12–14px | ALL-CAPS | 0.12em | 1.0 |

**Typography principles:**
- ALL-CAPS is the primary headline treatment — no sentence case above `<h3>`
- Tight negative tracking at display sizes; expand tracking on CTA/ribbon labels for legibility at small sizes
- Body copy is sentence case, generous line-height for long-form readability
- Never mix serif into the hero; this is a geometric sans system throughout

## 4. Logo & Brand Asset

- **Logo URL:** `https://ericedmeades.com/images/ee-logo-full.png`
- **Type:** Combined mark — geometric "EE" monogram (six stacked black bars forming two block "E" glyphs, 2×3 grid) above the wordmark "ERIC EDMEADES" in heavy uppercase sans
- **Color:** Pure black on white — single-color execution, no gradient, no texture
- **Usage:** White background or dark-section inverse (white logo on black). Never on colored backgrounds.
- **Risk note (T017):** Asset is a Next.js-optimized PNG, NOT a vector. For crisp hero display at large breakpoints, rebuild as SVG: the EE monogram is six rectangles + a text wordmark — approximately 10 minutes of vector work. Default to PNG until SVG is available; set `width` explicitly to avoid softness.

## 5. Hero Style Guidance

### Preferred: Dark Editorial Mode
- Full-width black or near-black (`#000000` or `#0A0A0A`) background
- White display headline at 64px–96px, Inter 900, ALL-CAPS, tracking -0.04em
- Bronze `#B08D57` as a single accent (credibility ribbon background, or thin horizontal rule beneath headline)
- B&W high-contrast keynote-stage photography: Eric lit from the side, dark background, strong key light. Image as `object-fit: cover` half-panel or full bleed with dark overlay (black at 55–70% opacity)

### Fallback: Typography-Only Hero (use when photo rights not confirmed)
- Black background, white display type only — no imagery
- Headline: "BUILT FOR THE STAGE" or "TRANSFORMATION ARCHITECT" at maximum scale
- Credibility ribbon below headline (see Voice Tokens section)
- Single bronze `#B08D57` horizontal rule (2–4px) above the CTA

### Light Mode Hero (secondary use)
- White `#FFFFFF` background with black headline — only for sections below the fold
- Subtle background `#F5F4F1` for card/section dividers
- Reserve dark editorial hero for the above-the-fold moment

## 6. Voice Tokens & Copy Patterns

### Brand Positioning
- "Transformation Architect" — primary positioning tag; appears in nav, hero sub, bio lede
- "Not a traditional motivational speaker" — differentiator
- "Behavioral change is a design problem, not a motivation problem"
- "Turning big ideas into real-world change"
- "Built for the stage"
- "Unforgettable impact"

### Credibility Ribbon (exact format)
```
#1 RATED KEYNOTE SPEAKER ◆ TRANSFORMATION ARCHITECT ◆ 65+ COUNTRIES ◆ 1,000,000+ LIVES TRANSFORMED
```
- All-caps, Inter 700, tight tracking (0.10–0.15em), small size (11–14px)
- Separated by `◆` (U+25C6 BLACK DIAMOND) with en-space padding on each side
- Bronze `#B08D57` diamonds OR white text on black ribbon band — never colored ribbon background

### CTAs (verbatim, ALL-CAPS)
- `BOOK ERIC TO SPEAK` — primary booking CTA
- `WATCH DEMO REEL` — video proof
- `DOWNLOAD ONE SHEET` — booker resource
- `BRING STOP IT TO YOUR EVENT` — current launch campaign CTA
- `CONTACT US` — secondary / form

### Example Headline Copy (verbatim from live site)
- `BUILT FOR THE STAGE`
- `UNFORGETTABLE IMPACT`
- `EXPERIENCE_UPGRADE_` (intentional terminal-cursor typographic treatment — underscores are part of the mark)

### Voice Rules
- **Third person** about Eric: "Eric is...", "His talks blend...", "He has spoken in 65+ countries"
- **Second person "you"** for CTAs and offer descriptions: "You'll walk away with...", "What you get"
- **NO "we"** — Eric is a singular brand, not a team
- **NO "join us"** — this is B2B executive speaker copy, not a community
- **NO emoji** in headlines, subheads, or CTAs
- **NO soft language**: avoid "heartfelt," "journey," "community," "vulnerable," "authenticity" (WildFit register — wrong surface)
- **Imperative + declarative** CTAs only: "BOOK ERIC", "BRING STOP IT", "WATCH"

### Signature Content Blocks (for generated pages)
1. **Hero:** Dark editorial, headline "BUILT FOR THE STAGE" or campaign-specific headline, sub-positioning "Transformation Architect · #1 Rated Keynote Speaker", primary CTA "BOOK ERIC TO SPEAK"
2. **Credibility ribbon:** Horizontal band, all-caps, ◆ separators, social proof numbers
3. **STOP IT keynote feature:** Section on current campaign — behavioral pattern interruption for corporate audiences; CTA "BRING STOP IT TO YOUR EVENT"
4. **Social proof logos:** Grid of conference/corporate client logos on white or subtle-bg
5. **Bio block:** Third-person paragraph, ends with "65+ countries · Canadian Senate 150 Medal · 1,000,000+ lives"
6. **Booking form:** Minimal, black/white only, labels in Inter 700, inputs borderline with 0px radius

## 7. Component Stylings

### Buttons

**Primary (Dark)**
- Background: `#000000`
- Text: `#FFFFFF`, Inter 900, ALL-CAPS, tracking 0.08em, 14px
- Padding: 14px 28px
- Radius: 0px (zero — square corners are on-brand)
- Hover: `#1A1A1A` background (subtle lift)

**Primary (Light — on dark sections)**
- Background: `#FFFFFF`
- Text: `#000000`, Inter 900, ALL-CAPS, tracking 0.08em, 14px
- Padding: 14px 28px
- Radius: 0px
- Hover: `#F5F4F1` background

**Bronze Accent Button**
- Background: `#B08D57`
- Text: `#FFFFFF`, Inter 900, ALL-CAPS, 14px
- Padding: 14px 28px
- Radius: 0px
- Use: Sparingly — one per page maximum, for the highest-priority CTA in a premium context

**Ghost / Outlined**
- Background: transparent
- Text: `#000000`
- Border: `2px solid #000000`
- Padding: 12px 26px
- Radius: 0px
- Hover: `#000000` background, `#FFFFFF` text (invert on hover)

### Cards & Containers
- Background: `#FFFFFF` or `#F5F4F1`
- Border: `1px solid #000000` (hard, editorial) or `1px solid #E5E5E5` (subtle)
- Radius: 0px (square) — this system does not use rounded corners
- No box-shadow on cards — elevation is structural (borders) not decorative

### Inputs & Forms
- Border: `1px solid #000000` (bottom-only underline acceptable, or full box)
- Radius: 0px
- Focus: `2px solid #000000`
- Label: Inter 700, `#000000`, 12px, ALL-CAPS, tracking 0.10em
- Text: `#1A1A1A`, 16px Inter 400
- Placeholder: `#6B6B6B`

### Credibility Badge / Pill
- Background: `#000000`
- Text: `#FFFFFF` or `#B08D57`, 11px Inter 700, ALL-CAPS, tracking 0.12em
- Padding: 4px 10px
- Radius: 0px
- OR: Bronze pill — `#B08D57` background, `#FFFFFF` text — for award/rating callout

## 8. Layout Principles

- **Max content width:** 1200px centered
- **Grid:** 12-column, 24px gutters
- **Vertical rhythm:** 120px section padding desktop; 72px tablet; 48px mobile
- **Hero:** Full-viewport height (100vh) or at minimum 85vh; headline top-biased (content at 20–35% from top)
- **One bronze element per screen** — treat `#B08D57` as a scarcity signal

### Spacing Scale
- Base unit: 8px
- Scale: 8 · 16 · 24 · 32 · 48 · 64 · 96 · 120 · 160px

## 9. Depth & Elevation

This system uses structural depth (borders, contrast) over decorative depth (shadows):
- **Flat (default):** No shadow on any element
- **Raised (interactive):** `0 2px 0 0 #000000` — a hard 2px bottom-offset shadow in pure black (editorial "lift")
- **Dark section contrast:** Full-bleed `#000000` background sections create visual hierarchy without needing shadows or cards

No neumorphism, no glassmorphism, no blurs, no gradients anywhere in this system.

## 10. Do's and Don'ts

### Do
- Use ALL-CAPS for every `<h1>`, `<h2>`, and CTA
- Use `#000000` / `#FFFFFF` as the system spine — every other color decision flows from this
- Use the `◆` diamond separator in credibility ribbons (exact Unicode: U+25C6)
- Write about Eric in third person
- Address the buyer (event organizer) as "you" in offer copy
- Keep bronze `#B08D57` to ONE element per screen
- Use square corners (0px radius) on all interactive elements
- Use Inter 900 Black for all display type — Inter Regular 400 for body only
- Default to dark editorial hero when photo rights are not confirmed

### Don't
- Use WildFit green (`#7FC242`, `#4CAF50`) or any green hue — SEPARATE brand
- Use "we," "join us," "journey," "community," or emoji in any copy
- Use rounded corners (`border-radius` above 0px on buttons, cards, inputs)
- Use soft shadows (drop-shadow, box-shadow with blur) — use hard borders instead
- Use more than one bronze element on a single screen/section
- Write Eric in first person ("I built...") — reserved for podcast/essay contexts only
- Use sentence case for headlines — ALL-CAPS is mandatory
- Mix WildFit sub-brand assets or copy with the speaker brand on a single page

## 11. Responsive Behavior

| Breakpoint | Width | Key changes |
|---|---|---|
| Mobile | <640px | Single-column; hero 100vh; display type 40–56px; section padding 48px |
| Tablet | 640–1024px | 2-column grid; hero 85vh; display type 48–72px; section padding 72px |
| Desktop | 1024–1280px | 12-col grid; full layout; display type up to 96px; 120px section padding |
| Wide | >1280px | Max 1200px content, centered; margins expand |

Hero photography collapses to portrait crop on mobile with a higher black overlay (70%) for text legibility.

## 12. Agent Prompt Guide

### Quick Color Reference
- Page background: `#FFFFFF`
- Subtle background: `#F5F4F1`
- Primary / dark sections: `#000000`
- Body text: `#1A1A1A`
- Inverse text: `#FFFFFF`
- Bronze accent: `#B08D57` (one per screen)
- Muted metadata: `#6B6B6B`

### Generation Instructions for AI
1. Default to dark editorial hero: `background:#000000`, `color:#FFFFFF`, Inter 900 ALL-CAPS headline
2. Include credibility ribbon immediately below hero CTA: `#1 RATED KEYNOTE SPEAKER ◆ TRANSFORMATION ARCHITECT ◆ 65+ COUNTRIES ◆ 1,000,000+ LIVES TRANSFORMED`
3. Primary CTA is always `BOOK ERIC TO SPEAK` or `BRING STOP IT TO YOUR EVENT` for the current campaign
4. Use Inter Black 900 for every headline. Load from Google Fonts if self-hosting isn't confirmed.
5. Zero border-radius on all interactive elements — square is the brand
6. If the request mentions STOP IT keynote: feature a full section with CTA "BRING STOP IT TO YOUR EVENT", brief behavioral-change framing, and a corporate-client logo grid
7. Photography: reference `https://ericedmeades.com` for visual context. For demo purposes, use the live PNG logo: `https://ericedmeades.com/images/ee-logo-full.png`. If no photo available, use a typography-only dark hero
8. Color tokens are non-negotiable. Do NOT introduce greens, blues, or warm palettes — this is a black/white/bronze system only

### Example Prompt Seeds (from brand kit)
- **Prompt 1 — Speaker booking page:** "Build a landing page for booking Eric Edmeades — #1 rated keynote speaker and Transformation Architect — to speak at an executive leadership event. Hero is dark/editorial, headline 'BUILT FOR THE STAGE', primary CTA 'BOOK ERIC TO SPEAK'. Include credibility ribbon, STOP IT keynote section, corporate booking form. Black/white/bronze palette only."
- **Prompt 2 — STOP IT keynote launch microsite:** "Build a one-page launch microsite for Eric Edmeades' keynote 'STOP IT'. Editorial dark mode, all-caps display sans, CTA 'BRING STOP IT TO YOUR EVENT'. Include: 10-second STOP IT elevator framing, 3 pattern-interrupt outcomes, past-client logo grid, booking form. No emoji, no soft language, executive-grade."
