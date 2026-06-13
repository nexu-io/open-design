# Component cookbook

Thirty-six component archetypes you can compose into any macrostructure. Every entry: a *shape*, a one-line "use when", a one-line "don't confuse with", and a short structural sketch (DOM + minimal CSS). Pick from this file when you're building a section and don't know which shape to reach for.

The same macrostructure (e.g., Bento Grid) can be built from many different combinations of these archetypes. The macrostructure picks the *page shape*; this file picks the *components inside it*.

**Diversification rule:** within a single page, no two sections should use the same archetype. A Bento Grid might pair *Bento feature block* with *Inline form CTA* with *Logo wall (hairline)*. The next page Hallmark builds should pick different archetypes from the same categories.

---


---

## Archetype index — load ONLY the picks you need

**Pick your archetype names here, then read ONLY those individual files** from `references/components/`. Do not load the whole cookbook. A typical build needs 5–7 files: 1 hero + 1 section head + 1–2 features + 1 CTA + 1 footer + 1 nav.

### Heroes

- **H1 · Marquee** — A single statement fills the fold. No subhead, no CTA in view. [`components/h1-marquee.md`](components/h1-marquee.md)
- **H2 · Split diptych** — Headline + lede on one side, image or product capture on the other. 6/6 or 7/5 columns. [`components/h2-split-diptych.md`](components/h2-split-diptych.md)
- **H3 · Quote led** — A pull-quote with attribution is the hero. Your headline is borrowed credibility. [`components/h3-quote-led.md`](components/h3-quote-led.md)
- **H4 · Stat led** — A giant number or metric is the hero. A small qualifier line below. [`components/h4-stat-led.md`](components/h4-stat-led.md)
- **H5 · Letter hero** — First-person opening — "Dear reader,". No buttons in fold. Reads as personal correspondence. [`components/h5-letter-hero.md`](components/h5-letter-hero.md)
- **H6 · Photographic fold** — Single full-bleed image fills the viewport. Caption sits in a corner. [`components/h6-photographic-fold.md`](components/h6-photographic-fold.md)
- **H7 · Demo video clipped by viewport edge** — Display headline left, demo video right, the rightmost ~10–20 % extending past the viewport so it's intentionally cut off. The clip *is* the design — implies "there's more product  [`components/h7-demo-video-clipped-by-viewport-edge.md`](components/h7-demo-video-clipped-by-viewport-edge.md)
- **H8 · Mockup split browser framed** — Headline left, browser-frame mockup right, the mockup tilted 1–3° for life. Frame can be browser chrome, macOS toolbar, minimal hairline, or floating no-frame. [`components/h8-mockup-split-browser-framed.md`](components/h8-mockup-split-browser-framed.md)
- **H9 · Custom illustration centerpiece** — A single hand-built SVG (Tier B in the enrichment hierarchy — or pure CSS at Tier A for simpler shapes) sitting on the hero as one illustrative element. The bakery loaf, the studio [`components/h9-custom-illustration-centerpiece.md`](components/h9-custom-illustration-centerpiece.md)

### Section heads

- **S1 · Left margin numbered** — A narrow left column holds `01 — LABEL.`; the wide right column holds the heading and content. [`components/s1-left-margin-numbered.md`](components/s1-left-margin-numbered.md)
- **S2 · Hanging** — Heading floats above the section in negative space; no border, no rule. [`components/s2-hanging.md`](components/s2-hanging.md)
- **S3 · Sticky pinned** — Heading remains in viewport while content scrolls beneath. Orientation aid. [`components/s3-sticky-pinned.md`](components/s3-sticky-pinned.md)
- **S4 · Inline no break** — The heading is a small caps phrase that emerges *inside* the body flow; no spatial break. [`components/s4-inline-no-break.md`](components/s4-inline-no-break.md)
- **S5 · Bottom anchored** — The label or heading sits *below* the section's content. Inverts hierarchy. [`components/s5-bottom-anchored.md`](components/s5-bottom-anchored.md)

### Feature blocks

- **F1 · Bento grid** — Asymmetric grid of 8–15 tiles in mixed spans (1×1, 2×1, 1×2, 2×2). Visual rhythm via size. [`components/f1-bento-grid.md`](components/f1-bento-grid.md)
- **F2 · Sticky scroll stack** — Sticky left pane, scrolling right pane that cycles through related screenshots. [`components/f2-sticky-scroll-stack.md`](components/f2-sticky-scroll-stack.md)
- **F3 · Tabular spec sheet** — Each row is a feature; columns hold name, value, footnote. Hairline rules between rows. Tabular numerics. [`components/f3-tabular-spec-sheet.md`](components/f3-tabular-spec-sheet.md)
- **F4 · Step sequence** — Numbered stages (`1.0 → 2.0 → 3.0`) flow vertically. Each stage has a heading, a paragraph, sometimes a small visual. [`components/f4-step-sequence.md`](components/f4-step-sequence.md)
- **F5 · Annotated screenshot** — A product capture sits centre-stage with arrows or short labels pointing to UI details. [`components/f5-annotated-screenshot.md`](components/f5-annotated-screenshot.md)
- **F6 · Product card grid** — Each card is a product, not a feature. Image · name · price · one micro-action. Reads like a shop floor, not a marketing site. [`components/f6-product-card-grid.md`](components/f6-product-card-grid.md)

### CTAs / signups

- **C1 · Outlined chip** — A bordered, transparent button with a typographic verb ("Save changes"). [`components/c1-outlined-chip.md`](components/c1-outlined-chip.md)
- **C2 · Inline form as cta** — The CTA *is* the form — a single email input with a "Submit →" beside it. No separate landing for sign-up. [`components/c2-inline-form-as-cta.md`](components/c2-inline-form-as-cta.md)
- **C3 · Typographic link** — Just a word, an arrow, and a 1-px underline. No box, no fill. [`components/c3-typographic-link.md`](components/c3-typographic-link.md)
- **C4 · Sticky bottom bar** — A horizontal bar pinned to the viewport bottom, holding a CTA + a brief reassurance line. [`components/c4-sticky-bottom-bar.md`](components/c4-sticky-bottom-bar.md)

### Testimonials / proof

- **T1 · Pull quote with marginalia** — A quote sits in the wide column; the attribution and source link float in the narrow margin column. [`components/t1-pull-quote-with-marginalia.md`](components/t1-pull-quote-with-marginalia.md)
- **T2 · Logo wall hairline** — A row of customer logos, monochromatic, separated by hairline rules. No card boxes, no shadows. [`components/t2-logo-wall-hairline.md`](components/t2-logo-wall-hairline.md)
- **T3 · Single huge quote** — One quote, set big, centered, taking a whole section. No supporting text, no attribution boxes — attribution is a small caps line beneath. [`components/t3-single-huge-quote.md`](components/t3-single-huge-quote.md)
- **T4 · Numbered stat strip** — A horizontal strip of 3–5 stats (count + qualifier) running across one row. Tabular nums. [`components/t4-numbered-stat-strip.md`](components/t4-numbered-stat-strip.md)

### Footers

- **Ft1 · Mast headed** — A wordmark and tagline anchor a single horizontal band. Two or three small links beside, address or licence below. [`components/ft1-mast-headed.md`](components/ft1-mast-headed.md)
- **Ft2 · Inline rule single line** — A single horizontal line of credits, address, copyright. Hairline rule above. No columns. [`components/ft2-inline-rule-single-line.md`](components/ft2-inline-rule-single-line.md)
- **Ft3 · Index style category list** — Three or four short columns, each headed by a category in small caps, holding 4–6 links each. [`components/ft3-index-style-category-list.md`](components/ft3-index-style-category-list.md)
- **Ft4 · Dense typographic** — One large block of text — credits, references, licence, address — in a small monospace font, fully justified or ragged-right. Editorial colophon energy. [`components/ft4-dense-typographic.md`](components/ft4-dense-typographic.md)
- **Ft5 · Statement** — One large display sentence dominates the footer — a closing line, not a sitemap. Wordmark, minimal links, copyright sit beneath in muted small type. Stripe (older), Mailchimp pre-r [`components/ft5-statement.md`](components/ft5-statement.md)
- **Ft6 · Letter close** — Closes the page like a letter — `Yours, the team. 2026.` Optional postscript line beneath. Sets the page as a piece of writing rather than a product. [`components/ft6-letter-close.md`](components/ft6-letter-close.md)
- **Ft7 · Newsletter first** — The form (label + input + submit) is the *primary* element of the footer; everything else (wordmark, links, copyright) is set in 12 px muted type beneath. Stratechery, Substack-sha [`components/ft7-newsletter-first.md`](components/ft7-newsletter-first.md)
- **Ft8 · Marquee scroll** — A horizontal infinite-scroll line of repeating tagline + dot separator: `STUDIO · 2026 · STUDIO · 2026 · STUDIO · 2026 ·`. Sport-genre sites, fashion lookbooks, brand-forward agenc [`components/ft8-marquee-scroll.md`](components/ft8-marquee-scroll.md)

### Navigation

- **N1 · Wordmark 2 links** — Top-of-page bar: wordmark on the left, two text links on the right ("Pricing" / "Sign in"). No logo image, no menu icon. [`components/n1-wordmark-2-links.md`](components/n1-wordmark-2-links.md)
- **N2 · Floating chip** — A small fixed chip in a corner — wordmark + a single action ("Try it"). Doesn't sit in document flow. [`components/n2-floating-chip.md`](components/n2-floating-chip.md)
- **N3 · Side rail** — A thin vertical strip on the left edge — wordmark rotated, plus 2–3 dot-indicators for sections. Editorial / portfolio energy. [`components/n3-side-rail.md`](components/n3-side-rail.md)
- **N4 · Hidden behind k** — No visible nav. The user opens a command palette via `⌘K` to get anywhere. Designed for keyboard-first audiences. [`components/n4-hidden-behind-k.md`](components/n4-hidden-behind-k.md)
- **N5 · Floating pill** — A rounded full-pill nav, *visibly detached* from the page edges, sitting ~`var(--space-md)` from the top, soft blur backdrop, soft shadow. Reads as contemporary modern-minimal — Ve [`components/n5-floating-pill.md`](components/n5-floating-pill.md)
- **N6 · Newspaper masthead** — Full-width header, large centred wordmark on the top row, thin issue/date line above or below in serif small caps, optional inline link row beneath, double-rule below the whole thi [`components/n6-newspaper-masthead.md`](components/n6-newspaper-masthead.md)
- **N7 · Brutal slab** — A heavy, full-width nav with a 2 px solid border-bottom, all-caps wordmark and tracked uppercase link row, dense rhythm, no shadow, no rounded corners. Reads as Pentagram project p [`components/n7-brutal-slab.md`](components/n7-brutal-slab.md)
- **N8 · Terminal command** — A nav formatted as a CLI prompt: `> studio --catalog --voice --get▮`. The "links" are command flags. The blinking cursor (`▮`) is allowed *only here* (it has purpose — signals "you [`components/n8-terminal-command.md`](components/n8-terminal-command.md)
- **N9 · Edge aligned minimal** — Wordmark hard-left, single CTA hard-right, vast empty space between, no link row at all. The *absence* is the design — Apple product pages, Carl Hauser, luxury sites. [`components/n9-edge-aligned-minimal.md`](components/n9-edge-aligned-minimal.md)
- **N10 · Floating on scroll morph** — A sticky bar at the top that **morphs into a floating pill** as the user scrolls past a threshold. Two visual modes share one DOM — `.nav` (outer) owns the bar look, `.nav__inner`  [`components/n10-floating-on-scroll-morph.md`](components/n10-floating-on-scroll-morph.md)

---

## Within-archetype variation knobs

Picking an archetype is the first axis of variety. The second is *how you build it*. Two pages built with the same archetype should not be identical — each archetype below has 2–3 *variation knobs*. Pick one value per knob per output. This prevents "every Bento I build looks like the same Bento."

When you pick an archetype, **state the knob values you chose** in the macrostructure stamp comment, e.g.:

```css
/* Hallmark · macrostructure: Bento Grid · F1 Bento knobs: tiles=6, spans=irregular, accent=corner-only · ... */
```

| Archetype | Knob A | Knob B | Knob C |
| --- | --- | --- | --- |
| **H1 Marquee** | Display size: `xxl` (clamp 4–12rem) · `xl` (clamp 3–8rem) | Alignment: left-bias · centred · right-bias | Underlay: none · single rule above · single rule below |
| **H2 Split Diptych** | Ratio: 7/5 · 6/6 · 5/7 | Right side: photo · proof column · pull-quote | Divider: hairline · negative space · vertical rule |
| **H3 Quote-Led** | Quote weight: italic display · roman display · roman body large | Attribution position: under quote · margin-aligned · right-flush | Length: ≤80 chars · 80–160 chars |
| **H4 Stat-Led** | Number style: tabular display · italic display · monospace | Qualifier position: below · inline-right · stacked-above | Secondary stats: none · two below · row of four |
| **H5 Letter** | Salutation: greeting · "Dear X," · time-stamp | Body length: 1 paragraph · 2 paragraphs · 3 paragraphs | Signoff: typed name · drawn signature SVG · initials |
| **H6 Photographic** | Image area: full-bleed · 16/7 · 4/3 · 1/1 square | Caption position: lower-left · upper-right · margin | Text below or overlaid |
| **H7 Demo Video Clipped-Edge** | Clip side: right · left · both | Aspect ratio: 16/10 · 16/9 · 4/3 | Frame: hairline · browser chrome · none |
| **H8 Mockup Split** | Frame style: browser chrome · macOS toolbar · minimal hairline · floating no-frame | Tilt: 0° · 1.5° · 3° | Screenshot count: 1 · stack-of-3 · orbit-of-3 |
| **H9 Custom Illustration** | Build method: Tier-A pure-CSS · Tier-B hand-SVG · Tier-C generated · Tier-D library | Animation: none · loop · scroll-linked | Scale: small accent · dominant |
| **F1 Bento (feature)** | Tiles: 4 · 6 · 7 · 9 | Spans: regular · irregular · mosaic | Border: hairline all · accent corners · none |
| **F2 Sticky-scroll stack** | Pinned side: left · right | Right pane content: code · screenshot · diagram | Pin steps: 3 · 4 · 5 |
| **F3 Tabular spec sheet** | Columns: 2 (key/val) · 3 (key/val/unit) · 4 (with footnote) | Rule density: every row · groups of 3 · headers only | Numbers: tabular · proportional |
| **F4 Step sequence** | Numbering: I/II/III · 01/02/03 · 1.0/2.0/3.0 | Layout: vertical stack · horizontal flow · diagonal | Connector: line · arrow · none |
| **F5 Annotated screenshot** | Callouts: numbered pins · margin labels · inline arrows | Frame: device · plain · floating | Anchor: image-led or text-led |
| **F6 Product card grid** | Card ratio: 3/4 portrait · 1/1 square · 4/3 landscape | Density: 3-up · 4-up · 5-up | Micro-action: Add · Save · View → · none |
| **C1 Outlined chip** | Shape: rectangular · pill (only allowed for tactile/playful tones) · slab | Density: spacious · compact | Adornment: arrow · plus · none |
| **C2 Inline form-as-CTA** | Field count: 1 · 2 · 3 | Submit position: end-of-row · separate line · embedded button | Helper: above · below · none |
| **C3 Typographic link CTA** | Underline: solid · dashed · double · none | Hover behaviour: thicken · slide · colour shift | Arrow: → · ↗ · none |
| **C4 Sticky bottom bar** | Reveal: always · scroll-up · after fold | Anchored: viewport bottom · viewport top · inline at bottom | Shadow: hairline · none · subtle |
| **T1 Pull quote w/ marginalia** | Quote treatment: italic display · roman large · serif italic | Attribution: signed · stamped · timestamped | Marginalia: none · timeline · 1 footnote |
| **T2 Logo wall (hairline)** | Layout: single row · 2 rows · grid 3×N | Logo treatment: monochrome ink · brand colour · ghosted | Divider: hairline cells · none |
| **T3 Single huge quote** | Quote face: serif italic · roman display · italic mono | Width: full-bleed · 60ch · 40ch | Attribution position: same line · separate band |
| **T4 Numbered stat strip** | Layout: 3-up · 4-up · 5-up · 6-up | Number weight: display · body large | Qualifier position: under · inline · above |
| **Ft1 Mast-headed** | Wordmark size: display 3xl · display 2xl · xl | Tagline: italic serif · roman body · none | Links row: inline · 2-line stack |
| **Ft2 Inline single line** | Order: wordmark/links/credit · credit/wordmark/links | Separator: middot · pipe · em-dash · vertical rule | Density: dense · spaced |
| **Ft3 Index columns** | Columns: 3 · 4 · 5 | Heading style: small caps · italic · monospace | Bullet: hairline · none |
| **Ft4 Dense colophon** | Family: monospace · serif · sans | Layout: single block · paragraphs · log-style | Includes: build hash · date · attribution |
| **N1 Wordmark + 2 links** | Position: left/right split · centred · right-flush | Links: text · text+icon · pill | Sticky: yes · no |
| **N2 Floating chip** | Anchor: top · bottom · top-right · bottom-left | Content: theme picker · search · navigation | Backdrop: blur · solid · none |
| **N3 Side-rail** | Side: left · right | Width: 12ch · 16ch · 20ch | Indicator: filled bar · text-only · numbered |
| **N4 Hidden behind ⌘K** | Trigger: button · keyboard only · both | Surface: modal · sheet · spotlight | Recents: shown · hidden |
| **N5 Floating pill** | Width: content-sized · max ~720 px · max ~560 px | Backdrop: blur+saturate · solid · subtle gradient | Anchor: top-centred · top-right · top-left |
| **N6 Newspaper masthead** | Issue line: above wordmark · below wordmark · none | Wordmark size: 3xl · 2xl · xl | Rule: double · single · none |
| **N7 Brutal slab** | Border weight: 2 px · 3 px · 4 px | Letter-spacing: tracked uppercase · normal | CTA: filled slab · outline block · text-only |
| **N8 Terminal command** | Prompt: `>` · `$` · `~/$` | Cursor: in-line at end · after final flag · none | Width: full bleed · content · ~80 ch |
| **N9 Edge-aligned minimal** | CTA shape: outlined · filled pill · text+arrow | Wordmark: serif italic · sans · monospace | Padding-block: tight · default · spacious |
| **Ft5 Statement** | Sentence width: 28 ch · 38 ch · 50 ch | Wordmark position: under sentence · top-right · none | Rule above meta: hairline · double · none |
| **Ft6 Letter close** | Signoff: italic · roman · monogram | Postscript: yes · no | Width: 40 ch · 60 ch · 80 ch |
| **Ft7 Newsletter-first** | Layout: stacked · inline · split (form left · meta right) | Submit style: filled · outline · arrow link | Privacy line: yes · no |
| **Ft8 Marquee scroll** | Speed: 24 s · 32 s · 48 s | Direction: left · right · alternate (rare) | Glyph: middot · em-dash · slash |

**Anti-pattern:** picking the same knob values across two different outputs is the same kind of templating as picking the same archetype. If your last Bento was `tiles=6, spans=irregular, accent=corner-only`, the next one must change at least one knob.

---


## Routing — which footer fits which genre

| Genre | Default | Also OK |
| --- | --- | --- |
| editorial | **Ft1 Mast-headed** | Ft2, Ft4, Ft6, Ft7 |
| modern-minimal | **Ft2 Inline single line** | Ft1, Ft5 |
| atmospheric | **Ft5 Statement** | Ft1, Ft2 |
| playful | **Ft8 Marquee scroll** | Ft5, Ft3 |
| terminal | **Ft4 Dense colophon** | Ft2 |
| docs / reference | **Ft3 Index columns** | Ft1 |

**Diversification.** Same rule as nav — across consecutive Hallmark runs in the same session, no two outputs should share the same footer archetype.

**Default away from Ft3.** The 4-column index footer is the AI fingerprint when used reflexively (Product · Company · Resources · Legal + social row + tiny copyright). Reach for Ft3 only when the page is a hub or docs-root with a genuine sitemap; default to Ft1, Ft2, Ft4, Ft5, Ft6, Ft7, or Ft8 otherwise.

---


## Routing — which nav fits which genre / theme

| Genre / cluster | Default nav | Acceptable also |
| --- | --- | --- |
| editorial (Newsprint · Salon · Garden · Linen · Atelier) | **N6 Masthead** | N1, N9 |
| modern-minimal (Specimen · Quiet · Coral · Violet · Plume) | **N5 Floating pill** | N1, N9 |
| atmospheric (Bloom · Aurora · Halo · Midnight) | **N5 Floating pill** (blur backdrop sells the mood) | N9, N4 |
| playful (Brutal · Manifesto · Sport · Riso · Studio) | **N7 Brutal slab** | N1, N3 |
| terminal / CLI (Terminal) | **N8 Terminal command** | N4 ⌘K-only |
| docs / reference (Almanac) | **N3 Side-rail** | N1, N4 |

**Diversification.** Across consecutive Hallmark runs in the same project session, no two outputs should share the same nav archetype — even when they share a genre. If the previous run used N5 on a modern-minimal page, the next modern-minimal page picks N1 or N9 from the routing table's "also" column.

**Default away from N1.** The most-recognised AI fingerprint is N1 (wordmark + inline link row + button-right) used reflexively. Reach for N5–N9 first; reach for N1 only when the page genuinely has only 2 destinations *and* the genre's routing table allows it.

---


## Picking from this file

When building a section:

1. Identify the section's role (hero / section-head / feature / CTA / testimonial / footer / navigation).
2. Glance at the archetypes in that category.
3. Pick the one whose "Use when" fits the brief.
4. Make sure no two sections in the same page use the same archetype.
5. If the macrostructure suggests a default (e.g., Bento Grid → F1 Bento), use it; if it doesn't suggest, vary deliberately.

The goal is composed variety — within a page, sections feel different from each other; across pages Hallmark builds, sections feel different from the last.

---


## Mobile collapse — per archetype

Every archetype has a defined collapse behaviour at narrow viewports. The two breakpoints to know:

- **60 rem (~960 px)** — the *layout* breakpoint. Multi-column grids collapse to single column. Tilts and clip effects drop. Sticky panes unstick.
- **40 rem (~640 px)** — the *typography* breakpoint. Display sizes shrink one step. Side-margin labels move inline. Annotations consolidate.

Below 60 rem the archetype must still feel like itself — same hierarchy, same tone, same rhythm — but in a stacked single-column form. Below 40 rem the page is a phone; treat space like a luxury.

| Archetype | Below 60 rem | Below 40 rem |
| --- | --- | --- |
| **H1 Marquee** | unchanged (typography-only; centres / left-biases naturally) | display size step down (`xl` → `lg`); reduce side padding |
| **H2 Split Diptych** | grid `1fr` (text top, proof column below); divider becomes hairline-rule between | proof column collapses to a 2-column compact grid for items |
| **H3 Quote-Led** | quote stays full width; attribution wraps to its own line | quote size step down; attribution font-size step down |
| **H4 Stat-Led** | number stays full width, text stacks below; secondary stats become 2-up grid | number size step down (`clamp` floor lifts); qualifier text wraps |
| **H5 Letter** | unchanged single column; aside (if present) moves below body, divider becomes top border | salutation size step down; signoff tightens |
| **H6 Photographic** | image stays full-bleed; caption moves from absolute corner to inline below image | caption font-size step down; corner caption never overlaps text on phones |
| **H7 Demo Video Clipped-Edge** | **drops the clip**; goes `1fr` stacked, full-width media; tilt removed (clipping at 375 px reads as broken) | media reduces to 16/9; poster image used (auto-playing on cellular is hostile) |
| **H8 Mockup Split** | drops the tilt; grid `1fr`; mockup goes full-width below text | annotation pins consolidate; numbered legend moves below mockup |
| **H9 Custom Illustration** | grid `1fr`; illustration moves below text (or above — pick by tone) | illustration scales to ≤ 40 % viewport width; never dominates |
| **F1 Bento** | grid drops from 6/4-col to 2-col; large tiles span 2; small tiles span 1 | drops to 1-col; tile order respects information priority |
| **F2 Sticky-scroll stack** | sticky pane unsticks; content becomes linear sequence of paired text+visual blocks | the visuals shrink to 16/9 inline; no sticky behaviour at all |
| **F3 Tabular spec sheet** | columns reduce: 4-col → 2 (key + value), drop unit + footnote | spec list goes vertical; each row is `dt` above `dd` |
| **F4 Step sequence** | numbering moves from left margin to inline-with-step | step containers tighten; connector lines drop |
| **F5 Annotated screenshot** | screenshot full-width; annotations restack as a numbered list below | screenshot 16/9; annotations consolidate into a legend |
| **F6 Product card grid** | grid 3-up → 2-up | grid 2-up → 1-up; card height becomes flexible |
| **C1 Outlined chip** | unchanged (chips wrap onto multiple lines if needed) | full-width single chip ; min-height 44 px hit target |
| **C2 Inline form-as-CTA** | input + button stack vertically; full-width | label moves above input; button is full-width below |
| **C3 Typographic link** | unchanged (links wrap naturally) | unchanged |
| **C4 Sticky bottom bar** | unchanged (already designed for narrow); ensure 44 px min-height | label truncates if needed; CTA stays right-aligned |
| **T1 Pull quote w/ marginalia** | marginalia move below quote; divider becomes hairline | marginalia consolidate into a single line |
| **T2 Logo wall** | grid 6-up → 3-up | grid 3-up → 2-up; logo height step down (32 px → 24 px) |
| **T3 Single huge quote** | quote remains full width; attribution wraps below | quote size step down by 1.4× |
| **T4 Numbered stat strip** | strip 4-up → 2-up | strip becomes vertical; 1 stat per row |
| **Ft1 Mast-headed** | links wrap to two lines; tagline below wordmark | wordmark size step down; tagline italicises in if not already |
| **Ft2 Inline single line** | links wrap to multiple lines; separator becomes a soft return | becomes a vertical list |
| **Ft3 Index columns** | grid 4-col → 2-col | grid 2-col → 1-col; column heads remain |
| **Ft4 Dense colophon** | unchanged (mono/wraps naturally); reduce padding | font-size step down |
| **Ft5 Statement** | sentence stays full width; meta row stacks | sentence size step down (clamp floor lifts); meta wraps |
| **Ft6 Letter close** | unchanged single column; postscript wraps | signoff size step down; postscript italicises if not already |
| **Ft7 Newsletter-first** | input + button stack vertically; full-width | label moves above input; button is full-width below |
| **Ft8 Marquee scroll** | unchanged (already designed for narrow); slow speed by ~25 % | speed slows further; track height step down |
| **N1 Wordmark + 2 links** | unchanged | links wrap to second line if long; wordmark stays |
| **N2 Floating chip** | chip remains floating; reduce padding | chip widens to support 44 px hit target; never below 280 px |
| **N3 Side-rail** | rail unsticks and becomes a hamburger trigger above | hamburger becomes the only nav |
| **N4 ⌘K-only** | hamburger appears for users who don't know ⌘K | unchanged (⌘K equivalent is on-screen tap) |
| **N5 Floating pill** | pill drops link list, keeps wordmark + CTA; stays detached | becomes a top-anchored corner chip — wordmark left, hamburger right |
| **N6 Newspaper masthead** | issue line stacks above wordmark; nav links wrap to a second row | wordmark size step down; nav row collapses behind a "menu" disclosure |
| **N7 Brutal slab** | links wrap to second line; CTA stays right-aligned | links collapse to hamburger; wordmark + hamburger only |
| **N8 Terminal command** | flags wrap to a second `>` line if needed; cursor stays at the end | becomes a single hamburger labelled `> menu`; cursor visible at line end |
| **N9 Edge-aligned minimal** | unchanged (already designed for breathing room) | wordmark + CTA stay edge-aligned; CTA pads to 44 px hit target |

**Cross-cutting rules:**

- All hit targets ≥ 44 × 44 px below 40 rem (WCAG AA). Never below.
- Padding-inline ≥ `clamp(1rem, 4vw, 1.5rem)` on the page container so content doesn't kiss the screen edge.
- Disable any scroll-linked animation below 40 rem (mobile scroll has its own physics; layered animations fight it).
- Image `loading="lazy"` always below the fold; **never on the LCP element regardless of viewport.**
- Auto-play video respects `data-saver` (`navigator.connection.saveData`) — replaces with poster when set.
