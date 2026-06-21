# Genre — atmospheric

For the AI-creative product page. Dark canvas with warm radial blooms, confident sans display, expressive but plain-English copy, single warm accent. The aesthetic of a tool you'd actually want to use after dark — generative music, video, image, voice.

## When to pick it

Brief mentions any of: *AI tool, generative, music, video, image, voice, late-night, atmospheric, dark mode, expressive, creative tool, model playground, vibe-coded, dreamlike, nocturnal*. Also pick when the user names a *mood* that requires darkness (e.g. "moody", "cinematic", "after hours").

## Themes that belong

`Bloom` (canonical), `Midnight`, `Terminal`. Three dark-paper themes; the rotation walks them when atmospheric is active.

## Voice

- **Display** — Geist Sans 600 or similar weighty sans, plain English, no ornament. Letter-spacing tight (`-0.03em` or tighter).
- **Body** — same family, 400. Light grey on dark (`oklch(86% 0.008 40)`).
- **Accent** — single warm hue (orange / amber / red / pink). Used in radial-gradient blooms on the canvas, on focus rings, on small tags. Never on display text (that's gate 5 universal — gradient text stays banned).
- **Layout** — centred or near-centred heroes. The canvas itself is the design; the type sits on top of an atmospheric ground.
- **Motion** — fade-in only. No slide, no bounce. The atmosphere does the work.
- **Copy tone** — direct, slightly poetic, specific. *"Make a house song about quitting your job."* is the calibration.

## What this genre allows

- **Radial-gradient bloom** on the body background — up to two blooms, each ~20–30 % footprint, fixed-attached, no animation. Gate 31 universal is loosened here.
- **Centred heroes** — gate 7 universal is loosened. The canvas frames the type.
- **Pill-rounded CTAs** with accent fill — confident, not pastel.
- **Glow shadows** on hover (cards lift toward the user with a soft warm shadow).
- **Larger expressive type** — display can hit 6 rem (`clamp(3rem, 6vw + 1rem, 6rem)`).

## What this genre disallows

- **Light-paper aesthetics** — the canvas is dark. Don't sneak white sections in.
- **Italic serif body** — atmospheric stays sans top-to-bottom.
- **Hairlines** — atmospheric uses elevated cards (`paper-2`, `paper-3`) instead of hairline-on-paper.
- **Multiple accent hues** — one warm bloom + one secondary (pink/red) is the maximum. No teal-and-amber juggling.
- **Glassmorphism** — banned. Atmospheric is *atmospheric*, not glass.
- **Gradient text** — gate 5 universal. Stays banned.

## Voice fixtures

- *"Built for the dark."*
- *"The page should feel like a place you could sit in."*
- *"A canvas, then a tool."*
- *"Generate, refine, ship — between Tuesday and Wednesday."*
- *"The instrument is dark. The output is yours."*

## Nav and footer voice

- **Default nav:** N5 Floating pill — the blur backdrop sells the atmospheric mood. The pill sits over the dark canvas and the bloom shows through the blur.
- **Acceptable also:** N9 Edge-aligned minimal (when the canvas is loud enough that nav should disappear into it); N4 ⌘K-only (when the audience is technical).
- **Default footer:** Ft5 Statement — closes the page with a sentence. Atmospheric pages argue something; the footer states it.
- **Acceptable also:** Ft1 Mast-headed; Ft2 Inline single line.
- **Banned for atmospheric:** N6 Newspaper masthead (editorial vocabulary); N7 Brutal slab (fights the calm); Ft8 Marquee scroll (kinetic, breaks the dark canvas); Ft3 Index columns (AI-footer fingerprint).

See [`component-cookbook.md`](../component-cookbook.md) § Navigation and § Footers for the full archetypes + code.

## Stamp signature

```css
/* Hallmark · genre: atmospheric · macrostructure: <name> · theme: <name> · enrichment: <tier> · nav: <N#> · footer: <Ft#> */
```

## Reference register

The aesthetic to match: dark canvas with two warm blooms behind the content, plain-English heroic display, single warm accent on small surfaces. Hand-built, not stock-AI.
