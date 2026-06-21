# Slop test — 60 gates + pre-emit self-critique

Run this list before handing back any output. Every answer must be **no**. Update the Step 5 preview block's `Slop test` row to reflect the actual outcome of this run.

Some gates are **universal** (apply to every genre); some are **genre-scoped** (apply only when the active genre is editorial, atmospheric, modern-minimal, or playful). Genre overrides are noted inline. Where a gate has *no* genre note, treat it as universal.

---

## Pre-emit self-critique (six axes)

Run this **before** the gate list, not after. Score the planned output 1–5 on each axis. Anything **< 3 on any axis triggers a revision pass** before the gate sweep — don't bring known weakness into a sixty-gate review.

Two passes is normal. Three is a sign the brief is wrong, not the design — re-read the brief.

| # | Axis | What you're scoring |
|---|---|---|
| **A** | **Philosophy** | Is there a clear *why* — a position the page is taking? Or is it just a layout? |
| **B** | **Hierarchy** | Can a reader tell, in 2 seconds, what's primary, secondary, tertiary? Or is everything the same weight? |
| **C** | **Execution** | Are the details (rule weight, accent footprint, text-wrap, focus rings, contrast) all in spec, or is there sloppiness even if the bones are right? |
| **D** | **Specificity** | Does this look like *this brief* — or does it look like a generic "page that could be anyone"? |
| **E** | **Restraint** | Have you removed everything that isn't earning its place? Decoration, redundancy, padding-for-padding's-sake? |
| **F** | **Variety** | Does this output share a structural fingerprint with a previous Hallmark output in the project? Score by structural distance, not visual distance — colour-swaps don't count as variety. |

Record the six scores in a one-line stamp comment at the top of the file: `/* Hallmark · pre-emit critique: P5 H4 E5 S4 R5 V5 */`. Future runs should be able to find this and avoid repeating the same weakness.

---

## Visual

1. Is the display font Inter, Roboto, Open Sans, Poppins, Lato, or a system default?
2. Is there a purple-to-blue (or cyan-to-magenta) gradient anywhere? *Genre note: atmospheric allows radial gradients on background only — never on text or pill buttons.*
3. Is there a 3-equal-column card grid with icon-above-heading tiles?
4. Is any card nested inside another card?
5. Is there a `background-clip: text` gradient headline? (Universal — no genre allows gradient text.)
6. Is any card using a thick coloured left/right side-stripe border?
7. Is the hero `min-height: 100vh` with everything centred? *Genre note: atmospheric and playful allow centred heroes when the canvas itself is the design (Suno-style).*
8. Is pure `#000` or pure `#fff` used as a base colour anywhere? *Genre note: modern-minimal allows pure `#fff` paper (the Stripe / ElevenLabs school).*

## Structural

9. Does the page use the *same* structural fingerprint as the last page you built? (Hero → 3 features → CTA → footer is the AI structural template; reject it.)
10. Are sections separated only by equal whitespace, with no rule, no ornament, no colour shift — every section identical in rhythm?

## Microinteractions

11. Is `transition-all` (or `transition: all`) used anywhere? (Specify the properties.)
12. Is `hover:scale-105` (or any uniform hover-scale) applied across multiple unrelated elements?
13. Are bouncy / overshoot easings (`cubic-bezier(0.34, 1.56, ...)`, etc.) used on UI state changes — buttons, modals, tooltips? (Reserve overshoots for physical interactions only.)
14. Does any element have *more than one* hover effect at the same time (translate + scale + shadow + colour + rotate)?
15. Are you animating `width`, `height`, `top`, `left`, `margin`, or `padding` anywhere?
16. Does the focus ring transition into existence (fade in)? (Focus rings must appear instantly — keyboard users need an immediate indicator.)
17. Is there a celebratory success toast for an action whose effect the user can already see? (Silent success is taste; toasts are for failures and invisible effects.)
18. Are tooltip hover-delay and focus-delay equal? (Hover should delay 800–1000 ms; focus should be 0 ms.)
19. Is auto-rotating content (carousel, banner, stats) lacking pause-on-hover-and-focus? (WCAG 2.2.2.)
20. Is there a placeholder name "Jane Doe / John Smith" or a startup cliché (Acme, Nexus, Seamless, Unleash)?

## Variety

21. Is the `/* Hallmark · macrostructure: <name> · ... */` stamp missing from the top of the CSS? (It must be present.)
22. Is the macrostructure I picked the same as a previous Hallmark output's stamp in this project? (Read the file system; if a stamp exists, mine must differ.)
23. Did I default to the **Specimen** macrostructure (numbered left-margin labels + huge serif + asymmetric spans + typographic-only CTA) when the brief did not explicitly call for editorial / foundry / specimen energy? (Specimen fall-through is banned.) *Genre note: atmospheric, modern-minimal, and playful never default to Specimen — only editorial does, and only when the brief signals it.*

## Implementation gates

24. Does any neutral / surface colour have `oklch(... 0 ...)` (zero chroma)? Pure greys read as flat. Tint every neutral toward the anchor hue — minimum 0.005 chroma. *Genre note: modern-minimal allows zero-chroma neutrals (the monochrome Stripe / ElevenLabs school).*
25. Does the accent colour cover more than ~5 % of any single viewport (count by area: solid fills, large headings in accent, full-bleed accent backgrounds)? If yes, retreat — accent is for emphasis, not for filling. *Genre note: atmospheric allows accent-tinted radial blooms covering up to ~20 % of the canvas, since the bloom is the design.*
26. Is any padding / gap / margin a value that isn't on the named spacing scale (`--space-3xs` … `--space-5xl`, multiples of 4 px)? Arbitrary `padding: 17px` is a tell.
27. Is any prose container's `max-width` outside the 45–75 ch range? Measure must read; under 45 ch is choppy, over 75 ch loses the eye.
28. Does any interactive element lack `:focus-visible`, `:active`, OR `:disabled` styling? (Eight states is the rule. Default + hover is two; you need at least default + hover + focus-visible + active + disabled present in code.)
29. Is there any `transform` / `animation` keyframe that is NOT covered by a `@media (prefers-reduced-motion: reduce)` fallback? Every motion gets a reduced-motion alternative.

## Hero enrichment gates

(When the page carries enrichment — see [`hero-enrichment.md`](hero-enrichment.md).)

30. If the page has a demo video, does it autoplay with sound, lack a `poster`, lack `fetchpriority="high"`, or use `loading="lazy"` on the LCP element? (LCP-killers fail this gate.)
31. If the page has an abstract background, is it more than one accent colour, more than ~5 % footprint, or animating mesh-gradient on the whole page? (Aurora blobs and mesh-on-everything fail this gate.) *Genre note: atmospheric allows up to two warm-toned radial blooms covering ~20–30 % of the canvas, fixed-attached, no animation.*
32. Does the page mix two or more icon libraries? (Material + Heroicons + Lucide on the same page = the icon-set tell.)
33. If the page has illustration, did I default to a Lottie library when a hand-built SVG or pure-CSS shape would have worked? (Lottie is last resort, not the default.)

## Diversification gates

(Cross-reference `.hallmark/log.json` when present.)

34. If I used the same archetype as a previous Hallmark output (per `.hallmark/log.json` or the latest macrostructure stamp), did I pick at least one different *variation knob*? Two Bento Grids with `tiles=6, spans=irregular, accent=corner-only` are the same Bento — the within-archetype knobs in [`component-cookbook.md`](component-cookbook.md) exist precisely to prevent that. State the knob deltas in the stamp.
35. Does any visual-only `<svg>`, custom-art `<div>`, `<canvas>`, or decorative figure lack `aria-label` or `aria-hidden="true"`? Hand-built CSS art and SVG illustrations need an accessible name *or* an explicit hide. Skipping this is the new accessibility tell.

## Layout-safety gates

(The page must survive every viewport.)

36. Does the page horizontally scroll on any viewport between 320 px and 1920 px? Open the rendered page; drag the dev-tools width slider across that range. If a horizontal scrollbar appears at any width, fail. The fix is `html { overflow-x: clip; }` plus `body { overflow-x: clip; }` as a safety net for any clipped-edge enrichment that pushes past the viewport. Use `overflow-x: clip` (not `hidden`) — `clip` preserves `position: sticky` and `position: fixed` on descendants. (Cross-reference: [`layout-and-space.md` § Page-edge clipping](layout-and-space.md).)
37. For every decorative effect on text — highlighter `<mark>` / `<em>` band / accent stroke / underline — did I visually confirm the position and size? A highlighter band must sit behind the x-height (`linear-gradient(180deg, transparent ~38%, accent ~38%, accent ~92%, transparent ~92%)`), **not** at the baseline (which reads as a fat underline). Underlines must be 1–2 px and offset 1–2 px from the baseline, never 5+ px. Decorative strokes must not exceed 5 % of the viewport (gate 25). The check is *visual*: imagine the rendered output and confirm the band lands in the right vertical zone.
38. Are interactive bars (nav, toolbar, command bar, hero CTA row, footer link strip) explicitly vertically centered? Default flex layouts inherit `align-items: stretch`, which makes a button taller than its sibling text and breaks the visual baseline. Every flex row mixing height-different elements (button + text, icon + text, mark + body) must declare `align-items: center` and `line-height: 1` on the items with intrinsic height. Inheriting `line-height: 1.55` from `html` fights the row's vertical rhythm.

## Typography discipline gates

(Three faces is the ceiling. See [`typography.md` § The 2+1 rule](typography.md).)

39. Does the page use **more than three** distinct `font-family` families? Count: `--font-display`, `--font-body`, and at most one outlier (`--font-outlier` for wordmark / hero stat / pull quote). A fourth family on the page — e.g. body + display + mono in code blocks + a separate display for the hero — is slop. Same family at different weights counts as one family. Mono counts as a family if used in any non-code context (captions, labels, numerals). If you find four, drop one back to the body or display face.
40. Is the **outlier face used in more than two slots** on the page? The outlier is a register, not a third surface — wordmark + hero stat is the canonical pair, or wordmark + masthead, or hero stat + pull quote. Three slots = the outlier is now a third body font; collapse it back to the body face.

## Input-state gates

(Inputs are where almost-right UIs lose. See [`interaction-and-states.md` § Input field states](interaction-and-states.md).)

41. Does any input, textarea, or select field change `border-width` between states (default → hover → focus → error)? Default is 1 px; hover, focus, and error must keep `border-width: 1px`. Border-width changes cause layout shift. State changes go to `background-color`, `outline`, `box-shadow`, or `border-color` — never `border-width`.
42. Does the input focus ring use `border` instead of `outline`? The focus ring must be `outline: 2px solid var(--color-focus)` with `outline-offset: 1px`. Reserving `outline: 2px solid transparent` in the default state prevents geometry shift on activate. A focus ring built from a `border` change is a tell.
43. Is the input height different from the height of an adjacent button on the same form? Form inputs and the form's submit button share a single base height (44 px floor). 38 px input + 44 px button is the most common form-tuning slop and reads as un-designed.
44. Is the helper-text container collapsed when no helper or error is shown? The helper slot must reserve `min-height: 1lh` even when empty so that an error appearing doesn't push the page down. Vertical jump on validation is a tell.
45. Is the disabled input state signalled by *only* `opacity: 0.5`? Disabled needs three independent signals: `opacity: 0.55` AND `cursor: not-allowed` AND `aria-disabled="true"` (or the native `disabled` attribute). One channel is missable; three are not.

## Contrast & readability

Universal — apply to every genre. These gates catch the real-world failures the user flagged: black-text-on-black-button, dark sections with unreadable text, ink-on-ink slop where the LLM forgot to flip the text colour after flipping the surface.

Contrast computation: for every `(color, background-color)` pair on the page, run **APCA Lc** OR **WCAG 2.1 ratio**. OKLCH lightness is a fast pre-check — if `|L_text − L_bg| < 50 %`, the pair likely fails 4.5:1 — confirm with a full calculation.

Thresholds:
- Body text (under 24 px regular OR under 18 px bold): **WCAG 4.5:1 / APCA Lc ≥ 60**.
- Large text / icons / focus rings: **WCAG 3:1 / APCA Lc ≥ 45**.

46. Does any **body text** have a contrast ratio below **4.5:1** against its computed background? Pair every `color` declaration with its effective `background-color` and verify. The most-missed cases are: text inside cards that inherit `color` but the card switched to `background: var(--color-paper-2)` and the text is now too close in lightness; muted text (`color: var(--color-muted)`) on `background: var(--color-paper-3)` — both are mid-lightness and fail.

47. Does any **large text** (≥ 24 px regular OR ≥ 18 px bold) or **icon** or **`:focus-visible` ring** have a contrast ratio below **3:1** against its background? Same calculation, looser threshold. Specifically check focus rings — `outline: 2px solid var(--color-focus)` only passes if `--color-focus` has ≥ 3:1 contrast against *both* the element and the page surface.

48. Does any **button** have `color` ≈ `background-color` on its fill? The canary check: if the computed text colour and the computed background colour are within **5 % lightness AND 0.05 chroma** in OKLCH, fail the gate. This catches the common bug where `color: var(--color-ink)` sits on `background: var(--color-ink)` (black-on-black slop) — the LLM forgot to use `--color-accent-ink` (or `--color-paper`) for text-on-fill.

49. When `--color-accent` is used as a fill anywhere on the page (button, badge, surface), is `--color-accent-ink` **also defined** (in `:root` or theme tokens) AND used as the `color` for text on that fill? If `--color-accent-ink` is missing, Hallmark output is one careless `color: white` away from a low-contrast accident. The token must exist, must verify ≥ APCA Lc 60 / WCAG 4.5:1 against `--color-accent`, and must be applied wherever accent fills a surface that carries text.

50. Does any **dark section** (a section or panel whose `background-color` has OKLCH lightness < 50 %) carry text that uses the page-default `color: var(--color-ink)` — i.e. ink-on-ink in a section that flipped its surface? Sections that swap to a dark surface MUST also swap their text colour (typically to `--color-paper`) and ensure nested children inherit. The fix is explicit: any class that sets `background: <dark>` must also set `color: <light>` in the same rule, OR be wrapped in a parent that does. The most common failure: a `.vs__col:first-child` painted with the accent or ink colour but the inner panels still using default ink-coloured text.

The CSS stamp at Step 6 should record the result: `· contrast: pass (46–50)` if all five gates pass, or `· contrast: FAIL gates <list>` if any are open. Fix before shipping.

## Nav · footer · hero structural slop

Universal — apply to every genre. These gates catch the most-recognised AI fingerprints in nav, footer, and hero shape. They sit alongside the structural-fingerprint gate (gate 9): gate 9 catches the *page* fingerprint; 51–55 catch the *chrome* fingerprints that sit on top of it.

51. **Nav fingerprint.** Is the page's `<nav>` (or top-of-page `<header>` with role="banner") the AI default — wordmark-left + 4–5 inline text links centred-or-right + button-right at full viewport width + 1 px hairline border-bottom + white background? If yes, fail unless the brief explicitly justifies N1 (the page has only 2 destinations *and* the routing table for the genre allows N1). Hallmark output should rotate among N1, N3, N4, N5, N6, N7, N8, N9 from [`component-cookbook.md`](component-cookbook.md) § Navigation.

52. **Footer fingerprint.** Is the `<footer>` the AI default — 4 columns of links (Product / Company / Resources / Legal) + social-icon row + tiny copyright at the very bottom + 1 px hairline top-border + neutral grey background? If yes, fail unless the page is a genuine docs root or hub. Default to Ft1, Ft2, Ft4, Ft5, Ft6, Ft7, or Ft8 from [`component-cookbook.md`](component-cookbook.md) § Footers.

53. **Hero centred-everything.** Are eyebrow, title, lede, AND CTA all stacked centred on the same vertical axis? Auto-fail. Pick at most two centred elements; break alignment for the others. Centred-narrow heroes are admissible *only* on editorial / salon / atelier voice, and even then the eyebrow or CTA should sit off-axis (margin-aligned, right-flush, or numeral-anchored).

54. **Hero padding asymmetry.** Is `padding-block-end` ≥ 1.3× `padding-block-start` on the hero container? If hero pads symmetrically (or pads *more* on top), it floats off the page. Hero must sit *into* the page — heavier bottom padding pulls it down into the next section's rhythm. Compute on the rendered output's hero element.

55. **Decorative-without-purpose.** Does the hero contain a decorative element (cursor, scanline, gradient blob, abstract shape, ornament, badge, sticker) that has no semantic anchor in the content? Fail. Decoration must be motivated: a cursor inside a typed command (signals "you'd type next"), a numeral that names an issue / year / version / chapter, a gradient that responds to interaction (HP3 cursor-spotlight), a stamp that names an authorship or date. Random ornaments — a "42" in the corner with no edition meaning, a cursor floating beside a hero, a Pantone chip with no colour rationale — are slop.

The CSS stamp at Step 6 should record the result alongside contrast: `· nav: N# · footer: Ft# · slop: pass (51–55)`. If any of 51–55 fail, fix before shipping.

## Honest copy · no fabricated content

Universal — apply to every genre. The page must not invent facts about the user's product, team, or market.

56. **Invented metric.** Does the page contain any quantitative claim — "10× faster", "saves 5 hours per week", "trusted by 50,000+ teams", "99.9 % uptime", "+47 % conversion" — that the user did not supply, that has no source, and that the model fabricated to fill a stat-led layout, comparison row, or proof bar? If yes, fail. The fix is one of: replace the number with `—` and a labelled grey block, replace it with a question to the user ("metric to confirm"), or rebuild the section without the proof slot. Stat-led macrostructures are slop the moment their stats become decorative. *(See [anti-patterns.md § Invented metrics](anti-patterns.md).)*

## Re-drawn UI chrome

Universal. Hallmark must reuse the user's existing chrome (browser, OS, IDE) instead of redrawing it.

57. **Re-drawn chrome.** Did Hallmark hand-build a fake browser bar (URL pill + traffic-light dots), a fake phone frame (rounded rectangle + notch + speaker slit), a fake code-block frame (mock window-chrome around a `<pre>`), a fake terminal frame, or a fake IDE chrome (file tabs + activity bar + sidebar) using HTML/CSS or SVG? If yes, fail. Re-drawn chrome is one of the strongest "looks AI-generated" tells — the model invented a UI that already exists in the user's environment. The fix: use a `<picture>` or `<figure>` containing a real screenshot, or omit the chrome and let the content stand on its own. *(See [anti-patterns.md § Re-drawn UI chrome](anti-patterns.md).)*

## Token discipline

Universal. The theme picks the palette and font stack at the top of the run; the rest of the run consumes tokens, never invents them.

58. **Mid-render token improvisation.** Did Hallmark introduce any colour value (`#hex`, `oklch(...)`, `rgb(...)`, `hsl(...)`) or `font-family` declaration *outside* the design tokens defined in `:root` / `[data-theme="..."]`? If yes, fail. Every colour and every font in the artifact must reference a named token (`var(--color-accent)`, `font-family: var(--font-display)`). Inline OKLCH or one-off hexes are mid-render improvisation — the model picked the theme, then forgot it and freestyled. The fix: lift the value into the token block as a new named variable, or replace it with an existing token. *(See [SKILL.md § Locked tokens](../SKILL.md) and [anti-patterns.md § Mid-render token improvisation](anti-patterns.md).)*

## Responsive — clickable affordances

Universal. Buttons, links, and nav items must remain readable as single-line affordances when the viewport shrinks.

59. **Two-line clickable text.** Does any button label, primary nav link, footer link, tab label, breadcrumb, or CTA text wrap to two or more lines at any viewport between 320 px and 1920 px? If yes, fail. Clickable text reading on two lines looks broken — visitors read it as a styling error, not as intentional. The fix is one of: shorten the label (the best fix; "Get started free" → "Start free"), set `white-space: nowrap` on the affordance and let the parent reflow, drop a non-essential nav item at narrow widths via `hidden=until-found`, or collapse the nav into a sheet/menu. Never let a CTA or nav link wrap. *(See [responsive.md § Clickable text — never wraps](responsive.md).)*

60. **Emoji-as-feature-icon.** Does any feature card, value prop, step number, or pricing tier carry an emoji glyph (✨ 🚀 ⚡ 🔥 🎯 ✅) as its primary icon? If yes, fail. Emoji-as-icon is one of the strongest "AI-default" tells — the model reached for a Unicode glyph instead of choosing an icon library, building a custom mark, or omitting the icon entirely. The fix: pick a single icon library (Lucide / Phosphor / Heroicons — see [assets.md](assets.md)), build a custom SVG, or drop the icon and lead with typography.

The CSS stamp at Step 6 should record results: `· honest: pass (56) · chrome: pass (57) · tokens: pass (58) · responsive: pass (59) · icons: pass (60)`. Any failure must be fixed before shipping.

## Mobile-responsiveness — the non-negotiables

Universal. Every emitted page must render flawlessly at 320 px, 375 px, 414 px, and 768 px CSS-pixel widths. Gates 36 (no horizontal scroll) and 59 (no two-line clickable text) already cover the headline cases; 61–65 below codify the patterns the marketing-site responsiveness pass uncovered. Eyeball each viewport before marking the output complete.

61. **Image-bearing grid track without `minmax(0, 1fr)`.** Does any `grid-template-columns` (or `grid-template-rows`) containing a `1fr` track render an `<img>` / `<picture>` / image-bearing element inside one of those tracks? If yes, the track must be `minmax(0, 1fr)` instead. Plain `1fr` resolves to `minmax(auto, 1fr)`, where `auto` minimum is the largest content's intrinsic width — for a 1024 + px native image, that's 1024 + px minimum, which pushes the layout past viewport on phones. The fix is one character per track: `1fr` → `minmax(0, 1fr)`.

62. **Root missing `overflow-x: clip`.** Does the artifact lack `overflow-x: clip` on both `html` and `body`? If yes, fail. `clip` (not `hidden`) prevents horizontal scroll without creating a scroll context, so `position: sticky` descendants keep working. Hard requirement on every emitted page. Add to the base reset: `html, body { overflow-x: clip; }`.

63. **Display headers without long-word wrap.** Does any element rendering display-size text (`h1`, `.hero__display`, `.section__title`, `.skill-row__title`, hero-equivalent classes) lack `overflow-wrap: anywhere; min-width: 0`? If yes, fail. Long hyphenated words ("AI-generated", uppercase compound brand names) overflow viewport because the only break opportunity is at the hyphen — `overflow-wrap: anywhere` lets the engine break inside the word as a last resort.

64. **Per-theme section-head override without mobile collapse.** When a theme or variant overrides `.section__head { grid-template-columns: ... }` to anything other than `1fr`, does it also include the mobile-collapse rule, OR does a global `[data-theme] .section__head { grid-template-columns: 1fr }` exist at `@media (max-width: 48rem)` with matching specificity? If neither, fail. Theme-specific 2-column heads keep their template on mobile, the title wraps onto the section label, and the page reads broken (most visible on Sport: italic Anton title overlapping "02 / EXAMPLES").

65. **CSS-only radio tab pattern that scroll-jumps.** When implementing tab toggles via `<input type="radio">` siblings + `:checked` selectors, does the artifact either (a) keep the radios in normal document flow with zero size + opacity 0 (no `position: absolute; top: 0`), OR (b) ship a JS handler that intercepts label clicks, calls `e.preventDefault()`, manually sets `radio.checked = true`, dispatches `change`, and focuses with `{ preventScroll: true }`? If the radios are at `position: absolute; top: 0` with no JS guard, fail. Default-position radios cause the page to jump to the section's top on every tab click — visible on every viewport but most disruptive on mobile.

66. **Section eyebrow / tag beside the heading (tag-left, header-right).** Does any section render an eyebrow / number / mono-cap label (`01 · THE TOUR`, `02 / FEATURES`, `Chapter Three`) in a column to the left of, or to the right of, the section heading on the same horizontal row? Auto-fail. The pattern reads as a templated editorial-SaaS tell within seconds. When an eyebrow is used at all (see [`anti-patterns.md § Eyebrow on every section`](anti-patterns.md) — default OFF), the heading goes **directly underneath it in the same column**, vertical stack only. Concretely: **any `<header>`, `<div>`, or `<section>` wrapper — regardless of class name (`.section__head`, `.workbench__head`, `.pricing__head`, `.catches__head`, `.foo__intro`, anything macrostructure- or section-specific)** — that contains both an eyebrow / label / number / kicker element AND a heading element MUST resolve to single-column layout: `display: block`, `display: flex; flex-direction: column`, or `display: grid; grid-template-columns: 1fr` (or `minmax(0, 1fr)`). Any multi-column grid on such a wrapper (`grid-template-columns: 1fr 2fr`, `minmax(0, 0.4fr) minmax(0, 1fr)`, `auto 1fr`, etc.) is banned. **The rule binds on the *content shape* — eyebrow + heading in the same wrapper — not on a specific class-name allowlist.** It supersedes the "Left-margin" axis in [`structure.md`](structure.md) and the "Hanging headers" pattern in [`layout-and-space.md`](layout-and-space.md) for any head that carries an eyebrow. **NOT bypassable by "preserve structural parity" / "mirror this reference" / "match the prior build" instructions** — if a reference build ships the banned pattern (most pre-rule-66 builds do), silently flatten it in the new build. The rules win over parity. Reference builds may pre-date this gate; the gate is authoritative.

67. **All-caps display heads with line-height < 1.0 → cap-collision on wrap.** Does any display-size element (`.hero__display`, `.section__title`, `h1`, `h2`, or anything `≥ --text-2xl`) declare both `text-transform: uppercase` AND a `line-height` (or `--lh-tight`) below `1.0`? If yes, fail. Uppercase glyphs have no descenders and their cap-tops sit at the very top of the line box — at `line-height: 0.94` (the old Manifesto / Sport / Brutal default) the cap-tops of line N+1 visibly collide with the baseline or commas of line N when the title wraps. The condensed display faces (Anton, Inter Tight 900, Bebas Neue) make this worse. **Floor for all-caps display heads is `line-height: 1.0`; recommended `1.02–1.08`.** Either bump `--lh-tight` ≥ 1.0 for the theme, or drop `text-transform: uppercase` on the display element. Most visible when a two-line `.section__title` wraps with a trailing comma on line one ("SAME PROMPT, TWO / DIFFERENT OUTPUTS.") — the comma + cap-D fuse into a single glyph blob.

68. **Sticky element at `top: 0` below a sticky page-level nav → bleed.** Does the artifact declare `position: sticky; top: 0;` on any element OTHER than the page's top-level nav / banner / header, when a sticky `<header>` / `<nav>` / `.banner` also exists at `top: 0` (i.e. there are two sticky-at-top-0 elements on the page)? Auto-fail. Both stick to the viewport top during scroll and overlap; the deeper-in-DOM element paints over the nav (visible as a "section header bleeding into the nav bar" glitch). Fix: define a `--banner-height` token (~44–64 px depending on nav design) and offset every secondary sticky to `top: var(--banner-height)`, so it docks **beneath** the nav. Also give the nav a higher z-index than in-page sticky elements — split `--z-sticky` (in-page, e.g. 200) from `--z-sticky-nav` (top nav, e.g. 300) so the nav always out-paints when sticky boxes momentarily overlap. This gate fires only when the page actually has sticky elements (S3 sticky-pinned section heads, F2 sticky-scroll feature stacks, sticky tables-of-contents); pages without sticky behaviour pass trivially.

69. **Studied DNA discarded for a catalog theme.** Did a `study` diagnosis emit earlier in the conversation, AND does the build's CSS stamp's `theme:` field name a catalog theme (Specimen, Atelier, Brutal, Salon, Newsprint, Linen, Studio, Manifesto, Terminal, Midnight, Almanac, Garden, Quiet, Riso, Sport, Bloom, Coral, Violet, Aurora, Halo, Plume, Editorial) rather than `studied-DNA (source: ...)` — without the user having explicitly pivoted ("use Linen instead", "ignore the DNA", "rotate to a different theme")? Auto-fail. The studied DNA was meant to be the system (SKILL.md § 2.6 Condition 0); defaulting back to catalog is the attractor pull. Fix: re-emit using the studied DNA's tokens directly (paper OKLCH, accent OKLCH, named candidate fonts, macrostructure, archetypes) and update the stamp to `theme: studied-DNA (source: <URL or image>)` with the inline values. This gate is trivially passed when no recent study exists in conversation scope.

The CSS stamp at Step 6 records mobile pass alongside contrast: `· mobile: pass (36, 59, 61–69)`.

---

If any answer is **yes**, fix it. Do not ship slop.
