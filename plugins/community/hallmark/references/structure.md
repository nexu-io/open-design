# Structure

Most AI-generated UIs are visually distinct but structurally identical: hero → three features → CTA → footer. Same heading positions, same column counts, same component vocabulary. **Structural sameness is the AI fingerprint, not visual sameness.** Hallmark's job is to break it.

This file catalogues the **primitive axes** of structural variety. For most builds you should NOT compose a fingerprint axis-by-axis from this file — instead pick a named whole-page shape from [`macrostructures.md`](macrostructures.md), which is faster and prevents default-attractor sameness. Use this file when you need to deviate from a macrostructure's defaults on one or two axes, or when you're auditing an existing page and need vocabulary for what you see.

The axes below are still the building blocks. Pick one option from each to form a *structural fingerprint*. Two pages should never share the same fingerprint.

## The six axes

### 1. Section-heading placement

Where does a section's title live in space? Pick one per page.

| Pattern | Description | Real-world reference |
| --- | --- | --- |
| **Left-margin** | ⚠️ **Opt-in only — never default.** Eyebrow / number / label in a narrow left column with heading + body to the right. Reads as a templated-editorial AI tell when applied to SaaS / dev-tool / consumer pages. Permitted ONLY when the user explicitly asks for an editorial / specimen layout AND no eyebrow is paired with the heading (label may sit beside body copy; heading must stay in its own row above). The eyebrow-left / heading-right variant is banned outright by slop-test gate 66. | The New York Times Magazine; our Specimen theme — when the user explicitly requests that voice. |
| **Hanging** | Heading floats in negative space *above* the section, with generous breathing room. | David Airey's portfolio; minimal modernist. |
| **Centered display** | Heading dominates centre stage, symmetrical. Formal, welcoming, can feel static if used everywhere. | Apple product pages; Atelier-style runway invitations. |
| **Bottom-aligned** | Heading anchors the *base* of a section, content flows above. Inverts hierarchy. | Swiss editorial; Newsprint masthead-below pattern. |
| **Overlapping image** | Heading layered atop photography or colour block. Demands strong contrast. | Pentagram project pages; Manifesto posters. |
| **Sticky / pinned** | Heading remains visible while content scrolls beneath. Orientation aid. | GSAP ScrollTrigger docs; Almanac-style references. |
| **Numbered display** | ⚠️ **Opt-in only — never default.** "01." with a rule line and the heading right beside it. Procedural, sequenced. Banned for default SaaS / consumer / dev-tool pages by slop-test gate 66 (the tag-beside-heading pattern is a templated tell). Permitted only when the user explicitly asks for ordinal / chaptered numbering AND the macrostructure is Long Document, Manifesto, or Catalogue numbered. Even then, prefer the stacked variant: number on its own line above the heading. | Rauno Freiberg's portfolio — when the user explicitly invokes that voice. |
| **Inline with body** | No section break — the heading emerges from the paragraph flow. Conversational. | Medium articles; long-form essays. |

### 2. Body composition

How does long-form content lay out beyond "single column at 65ch"?

| Pattern | When | Reference |
| --- | --- | --- |
| **Single column** | Narrative-first, reading-led. The default for editorial. | Most blogs. |
| **Two-column asymmetric** | Wide body + narrow margin column for metadata, captions, marginalia. | Semplice; Linen-style. |
| **Multi-column justified** | Newspaper rhythm; 2–3 narrow columns, hyphenated, justified. | The Guardian; FT.com; Newsprint. |
| **Marginalia** | Sidenotes in a generous outer margin run alongside core text. | Tufte CSS; scholarly publications. |
| **Three-column equal** | Encyclopedia / reference / data-density. Chunked, scannable. | Wikipedia; Whole Earth Catalog; Almanac. |
| **Full-bleed with margin reset** | Body at 65ch, but pull-quotes or images bleed full-viewport. Emphasis via scale change. | Medium pull-quotes; Manifesto sections. |
| **Asymmetric spans** | Columns vary widthwise; intentional 2-1-3 ratios via CSS Grid. | Locomotive; portfolio sites. |

### 3. Divider language

How do sections separate?

- **Hairline rule.** 0.5–1px line, inset or full-bleed. Hallmark's default; modernist.
- **Ornament.** Fleuron (`❦`), centered dot, geometric mark. Salon, editorial classic.
- **Negative space.** No rule at all — the gap *is* the divider. Apple, Linen, modern minimalism.
- **Bleed-color block.** Section background colour shifts; the colour edge is the divider. Manifesto, Brutal.
- **Double rule / typographic mark.** Top + bottom line tight together; signals masthead in Newsprint.

### 4. Button voice

How do CTAs happen?

- **Outlined.** Border, no fill. Secondary or quiet primary. Hallmark default.
- **Unstyled link.** Underlined word, no box. Trust the typography. Editorial / craft sites.
- **Oversized solid.** Big block of accent colour, full padding. Manifesto, Sport, statement-CTA.
- **Typographic-only.** A word in a specific weight/size/colour, no rule, no box. Looks like a headline that happens to be clickable. Atelier, Salon.
- **Form-as-CTA.** The button is part of an inline form; the action *is* fill-this-field. Newsletter signups.

### 5. Image treatment

How does imagery enter the page?

- **Full-bleed.** Edge-to-edge, viewport width, image as architecture. Manifesto, Sport.
- **Tightly cropped.** Small, deliberate, sized to grid. Almanac, Atelier still-life.
- **Inline with text.** Image flows within the paragraph rhythm, sized to measure. Editorial, Newsprint.
- **Margin-aligned.** Image sits in the wide outer margin; body unbroken. Linen, Tufte.
- **None.** No imagery; typography carries everything. Specimen, Manifesto-as-text-poster, Terminal.

### 6. Reveal pattern

What happens on page-load and on scroll?

- **Fade-up stagger.** Default. Subtle, broadly safe; orchestrated once with exponential ease-out.
- **Horizontal sweep.** Element slides in from one edge; clip-path or transform. Directional momentum.
- **Type-unmask.** clip-path animates open over text. Graceful when the type is the hero.
- **Number-tick.** Counter from 0 to final value; for stats, prices, dates. Almanac, dashboards.
- **Typewriter.** Character-by-character; honest about the medium. Terminal only. **Decorative-graphics constraint:** Terminal output must NOT include standalone scanlines, detached blinking cursors, or random ASCII art. The terminal cursor (`▮`) is allowed only when it sits *inside* a typed command (install code block, N8 Terminal command nav) and signals an honest "you'd type next" affordance. A floating cursor in a hero corner is set decoration; remove it. See [`microinteractions.md`](microinteractions.md) Caret blink row.
- **None.** Everything is just there at load. Some sites should not move. Pentagram, brutalist sites.

## Picking a fingerprint

A fingerprint = one choice per axis. There are 8 × 7 × 5 × 5 × 5 × 6 = **42 000** fingerprints. You will never run out.

Two rules govern choices:

1. **Coherence.** A Newsprint page with multi-column justified body should have a typographic CTA, not an oversized solid button — those don't share a voice. Pick choices that belong to the same *world*.
2. **Anti-repetition.** Across consecutive pages built in the same session, no two should share more than three of the six axes. If the previous page used left-margin headings + single column + hairline divider + outlined button, this page should differ on at least three of those.

## Theme-suggested fingerprints

Each Hallmark theme has a default structural fingerprint. Use them as starting points only when the brief specifies a theme. **For most builds, pick a macrostructure from [`macrostructures.md`](macrostructures.md) instead** — themes describe *visual surface*, macrostructures describe *page shape*; the latter drives variety more.

The table below is alphabetical by theme to neutralise any "first row = default" attractor. No theme is the default. The **Nav** and **Footer** columns name the default archetype from [`component-cookbook.md`](component-cookbook.md); the routing tables in that file list the acceptable alternates.

| Theme | Heading | Body | Divider | Button | Image | Reveal | Nav | Footer |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Almanac | Sticky | Three-column equal | Hairline | Outlined | Inline | Number-tick | N3 Side-rail | Ft3 Index columns |
| Atelier | Centered | Single column | Negative space | Typographic-only | Tightly cropped | Type-unmask | N9 Edge-min | Ft6 Letter close |
| Aurora | Hanging | Single column | Negative space | Typographic-only | None | Fade-up | N5 Floating pill | Ft5 Statement |
| Bloom | Centered | Single column | Negative space | Typographic-only | None | Fade-up | N5 Floating pill | Ft5 Statement |
| Brutal | Overlapping image | Full-bleed reset | Bleed-colour | Oversized solid | Full-bleed | Horizontal sweep | N7 Brutal slab | Ft8 Marquee scroll |
| Coral | Centered | Single column | Negative space | Outlined | Margin-aligned | Fade-up | N5 Floating pill | Ft1 Mast-headed |
| Garden | Hanging | Marginalia | Negative space | Unstyled link | Margin-aligned | None | N9 Edge-min | Ft6 Letter close |
| Halo | Centered | Single column | Negative space | Outlined | None | Fade-up | N5 Floating pill | Ft5 Statement |
| Linen | Hanging | Two-column asymmetric | Negative space | Unstyled link | Margin-aligned | Fade-up | N6 Masthead | Ft1 Mast-headed |
| Manifesto | Overlapping image | Full-bleed reset | Bleed-colour | Oversized solid | Full-bleed | Horizontal sweep | N7 Brutal slab | Ft5 Statement |
| Midnight | Numbered display | Single column | Hairline | Typographic-only | None | Typewriter | N5 Floating pill | Ft2 Inline single line |
| Newsprint | Bottom-aligned | Multi-column justified | Double rule | Outlined | Inline | None | N6 Masthead | Ft4 Dense colophon |
| Plume | Hanging | Single column | Bleed-colour band | Outlined | Margin-aligned | Fade-up | N9 Edge-min | Ft1 Mast-headed |
| Editorial | Hanging | 2-col asym hero / single below | Hairline | Outlined | Tightly cropped or generated (Tier C) | Fade-up | N6 Masthead | Ft1 Mast-headed |
| Quiet | Centered | Single column narrow | Negative space | Outlined pill | None | None | N9 Edge-min | Ft2 Inline single line |
| Riso | Centered | Single column | Negative space | Outlined | Inline | None | N7 Brutal slab | Ft8 Marquee scroll |
| Salon | Centered | Single column narrow | Ornament (fleuron) | Outlined | Tightly cropped | None | N6 Masthead | Ft1 Mast-headed |
| Specimen | Left-margin | Asymmetric spans | Hairline | Outlined | None | Fade-up | N5 Floating pill | Ft2 Inline single line |
| Sport | Numbered display | Asymmetric spans | Bleed-colour | Oversized solid | Full-bleed | Horizontal sweep | N7 Brutal slab | Ft8 Marquee scroll |
| Studio | Centered | Asymmetric spans | Negative space | Typographic-only | Tightly cropped | Fade-up | N7 Brutal slab | Ft3 Index columns |
| Terminal | Inline (with `>` prompt) | Single column | Negative space | Typographic-only `[ go ]` | None | Typewriter | N8 Terminal command | Ft4 Dense colophon |
| Violet | Hanging | Single column | Negative space | Outlined | None | Fade-up | N5 Floating pill | Ft2 Inline single line |

## Anti-patterns of structural sameness

Reject these structural fingerprints. They are the AI-template fingerprint.

- **The SaaS hero.** Centered display heading, centered subhead, centered pill CTA, full-viewport hero, fade-up. The single most-recognised AI structural fingerprint.
- **The 3-feature row.** Three equal columns of icon-above-heading-above-two-line-body, gapped at 24px, identical card padding.
- **The benefits-then-CTA.** A list of feature bullets followed by a "Sign up" button block. Predictable rhythm.
- **The everything-fades-in.** Every section gets the same scroll-triggered fade-up animation. Makes the page feel like a presentation.
- **The carbon-copy footer.** Logo, four columns of links, social row, copyright. The same on every site you've ever seen.

## When you don't know

If the brief doesn't suggest a fingerprint and the user hasn't picked a theme, **do not default**. Read the brief for a domain word (audio, commerce, docs, agency, restaurant, fashion, fintech, personal, …) and offer the user **three macrostructures from categorically different groups *that fit that domain***. Then let them pick.

The point of three is contrast: a grid-led shape, a document-led shape, a poster-led shape. Picking from categorically different groups is what produces variety; offering three near-twins is the AI tell this whole skill exists to defeat.

### Domain → trio (offer these three; never default)

If you can't infer the domain, ask one question — "what does this thing do?" — and then map it.

| Domain words in the brief | Trio to offer |
| --- | --- |
| **podcast, audio, music, playlist, listening** | **Photographic** · **Quote-Led** · **Letter** |
| **shop, store, product, merch, commerce, ecom** | **Catalogue** · **Photographic** · **Bento Grid** |
| **docs, CLI, SDK, API, library, open source, developer reference** | **Workbench** · **Long Document** · **Component Playground** |
| **platform, infra, observability, dashboard SaaS, B2B tool, try-or-talk-to-sales** | **Bento Grid** · **Workbench** · **Stat-Led** |
| **agency, studio (work-led), case studies, multi-project portfolio, freelance creative** | **Portfolio Grid** · **Split Studio** · **Index-First** |
| **personal one-pager, individual, about-me, resume (no case studies)** | **Long Document** · **Letter** · **Index-First** |
| **restaurant, café, bar, food, kitchen, menu** | **Photographic** · **Long Document** · **Catalogue** |
| **fashion, apparel, beauty, lookbook** | **Photographic** · **Catalogue** · **Marquee Hero** |
| **fintech, banking, payments, invest, trading** | **Stat-Led** · **Workbench** · **Long Document** |
| **manifesto, campaign, cause, advocacy, political** | **Manifesto** · **Quote-Led** · **Stat-Led** |
| **editorial, foundry, magazine, type, specimen** | **Specimen** · **Long Document** · **Type Specimen** |
| **product launch, SaaS marketing, B2B** | **Bento Grid** · **Workbench** · **Stat-Led** |
| **conference, event, speaker, keynote** | **Marquee Hero** · **Manifesto** · **Photographic** |
| **fallback (genuinely no signal)** | **Bento Grid** · **Long Document** · **Manifesto** |

**Note on splits.** Some domains split on intent. *Developer-tool docs* and *developer-tool marketing* both have "developer" in them, but the docs page wants a Workbench walkthrough; the marketing page wants Bento Grid + Stat-Led so the SRE can read the value prop in 30 seconds. Same for *personal*: a one-pager about-me and a multi-project portfolio of case studies are *different briefs* — the one-pager wants prose (Long Doc / Letter); the portfolio wants Portfolio Grid / Split Studio. If the brief is ambiguous, **ask one question** to disambiguate ("docs walkthrough or marketing landing?", "one-pager or case studies?") before picking the trio.

If the user shrugs and says "you pick", read the project's CSS for a `/* Hallmark · macrostructure: ... */` stamp; whichever of the trio is most categorically distant from the stamped family is the right pick. Two consecutive outputs should never be from the same family — never two editorial macrostructures, never two grid-led macrostructures.

If the user answers a vague tone word ("modern", "clean", "professional"), that is not a feeling. Re-ask with the domain trio.

The fallback row at the bottom of the table is the *last* resort — only if no domain words appear and the user genuinely cannot pick. In practice, almost every brief contains a domain word; using the fallback usually means you didn't read carefully enough.
