# Genre — editorial (default)

The canonical Hallmark voice. Pages built for content-led briefs: portfolios, manifestos, type specimens, agency sites, magazine pieces, indie podcasts, bakery / brand stories, considered B2C marketing.

This is what Hallmark looks like when no other genre signal fires. It is the silent default.

## When to pick it

Default. Pick editorial when the brief does not name a specialised aesthetic — when the user said "a landing page for X" without telling you whether X is enterprise, atmospheric, or playful. Most briefs land here.

## Themes that belong

`Specimen`, `Newsprint`, `Atelier`, `Garden`, `Salon`, `Linen`, `Almanac`, `Studio`, `Riso`, `Sport`, `Brutal`, `Manifesto`. Twelve themes — plenty of variety inside the genre.

## Voice

- **Display** — italic serif, condensed sans, or display-heavy. Not Inter. Not Geist. The weight commits to an extreme (300 or 700+).
- **Body** — workhorse serif (Newsreader, Cormorant) or a plain non-default sans (The Future, Söhne). Readable at 45–75 ch.
- **Accent** — single warm or cool hue, used at < 5 % of any viewport.
- **Layout** — asymmetric. Hairlines, not card borders. Generous whitespace.
- **Motion** — quiet. One orchestrated entrance. No bounces.
- **Copy tone** — specific, hand-set, slightly literary. Verbs over adjectives.

## What this genre allows

- Hairline rules, fleurons, drop caps, double rules.
- Italic body in long-form content.
- Asymmetric column counts (2:5, 3:7) on prose pages.
- Hand-built SVG illustrations, pure-CSS art (Tier A enrichment).
- Numbered display labels, edge-aligned headlines.
- Single-accent-colour highlighting (`<mark>` band at x-height).

## What this genre disallows

The universal slop-test gates apply, plus these editorial-specific bans:

- **Pill-rounded buttons** with gradient fill — pill is fine, gradient on a pill is not.
- **Centred-everything heroes** (gate 7 universal). Editorial heroes are left-biased or asymmetric.
- **Card-in-card** layouts (gate 4 universal).
- **Three-column equal-icon-tile feature grid** (gate 3 universal).
- **Glassmorphism** — never; the medium is paper, not glass.
- **Pure black or pure white** as paper or ink (gate 8). Tint everything toward the anchor.

## Voice fixtures

Each macrostructure under editorial picks from these opening-line patterns. Imitate the *shape*, not the wording.

- *"Type, set with care."*
- *"Print discipline, on screen."*
- *"A small skill that argues against the average."*
- *"We compose the page like a broadsheet — hairlines, columns, restraint."*
- *"Restraint, repeated, becomes a signature."*

## Nav and footer voice

- **Default nav:** N6 Newspaper masthead — full-width, large centred wordmark, thin issue/date row in serif small caps, double-rule below. Reads as broadsheet.
- **Acceptable also:** N1 Wordmark + 2 links (when destinations are minimal); N9 Edge-aligned minimal (when the page is letter-shaped or atelier-quiet).
- **Default footer:** Ft1 Mast-headed (wordmark anchors a single horizontal band, tagline + small links beside).
- **Acceptable also:** Ft2 Inline single line; Ft4 Dense colophon (newsprint / almanac voices); Ft6 Letter close (atelier / garden / personal); Ft7 Newsletter-first (when the brand legitimately publishes).
- **Banned for editorial:** N5 Floating pill (modern-minimal vocabulary), N7 Brutal slab (fights the restraint), Ft8 Marquee scroll (kinetic; wrong genre).

See [`component-cookbook.md`](../component-cookbook.md) § Navigation and § Footers for the full archetypes + code.

## Stamp signature

Output's CSS comment header reads:

```css
/* Hallmark · genre: editorial · macrostructure: <name> · theme: <name> · enrichment: <tier> · nav: <N#> · footer: <Ft#> */
```
