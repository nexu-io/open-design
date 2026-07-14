# Design System Proposal — Wellfull Collective: Aesthetic Triad Series

> **Status:** Reviewable proposal. No durable memory, skill, automation, or
> design-system record has been changed. Approve (or edit) before apply.
>
> **Method:** "extract-design-system" automation template.
> **Sources sampled:** `ebook.html` (canonical), `ebook-1.html`, `blog1.html`,
> `blog2.html`, `blog3.html`, `index.html`, `deck.html`.
> **Guides cross-referenced:** `DESIGN-SYSTEM.md`, `DESIGN-HANDOFF.md`.
> **Review policy:** always · **Token compression:** balanced.

---

## Scope — where this design system lives

> **This design system governs the content-marketing surface, not the product website.**

It applies to: **social media campaigns, marketing materials, and blog/editorial
content** — the artifacts in this project (`ebook.html`, the 15 blog briefs,
`instagram-posts.html`, `deck.html`, `index.html` hub). It is **distinct from**
the Wellfull Collective website's own design system (the `DESIGN-SYSTEM.md`
that ships in the web app repo with Tailwind config, `globals.css`, and React
components).

**Practical implications:**
- This system is **HTML-artifact-native**: single-file pages with inline `<style>`
  and `:root` tokens, Tailwind via CDN, Google Fonts via `<link>`. It does not
  assume a build pipeline, CSS modules, or component framework.
- The website design system (`DESIGN-SYSTEM.md` in the app repo) is
  **build-pipeline-native**: Tailwind config aliases, `globals.css` CSS
  variables, React component classes. That system may use different tokens
  (the Deep Umber + Sage palette it currently describes, or a future revision).
- When content-marketing artifacts are embedded into or linked from the website,
  treat this system as the visual source of truth for those artifacts. Do not
  retroactively re-skin blog posts or social posts to match the website's
  tokens — the two systems are intentionally separate.
- **Where to store this system:** alongside the content-marketing artifacts it
  governs — in this project (or the `content/` folder of the marketing repo),
  not in the website app's `src/design-tokens/`. A shared `brand-tokens.css`
  or `content-design-system.md` in the marketing project root is the
  recommended home.

**On approval, the recommendation is:**
1. Register this as a **named, scoped design-system entry** — e.g.
   `wellfull-content-marketing` — separate from the website's design system.
2. Keep the existing `DESIGN-SYSTEM.md` (in the website repo) as-is for the
   product UI; do not overwrite it with this proposal.
3. In this project, replace the stale `DESIGN-SYSTEM.md` (which describes the
   Deep Umber + Sage web-app palette) with this proposal, renamed to
   `CONTENT-DESIGN-SYSTEM.md` to make the scope unambiguous.

---

## 0. Why a new extraction

The existing `DESIGN-SYSTEM.md` (in this project) describes a **Deep Umber + Sage** palette
(`#ead5c8` / `#dae8df` / `#5a3e2e` …) with Cormorant Garamond + Atkinson
Hyperlegible — that is the **website app's** system, carried over from the
product repo. The shipped **content-marketing** artifacts in this project use a
**different, consistent** system: warm beige `#f7f5f0` + deep teal `#2f6f5e` +
terracotta `#c97b3f`, with DM Serif Display + Outfit + JetBrains Mono. Every
one of the 7 sampled HTML files declares the same `:root` block token-for-token.
The artifacts are the source of truth for the content-marketing surface; the
doc has drifted because it describes the wrong surface. This proposal captures
**what the content-marketing artifacts actually do**, using `ebook.html` as the
narrowest statement of the static principles, so future social, marketing, and
blog work matches the shipped series instead of the website app's tokens.

---

## 1. Color tokens

All values verified identical across `ebook.html:13-29`, `ebook-1.html:13-29`,
`blog1.html:13-29`, `blog2.html:13-29`, `blog3.html:13-29`, `index.html:13`,
and `deck.html:30-43` (deck aliases `--bg`/`--fg`/`--surface` but the hex is
the same).

| Token | Hex | Role | Provenance |
|---|---|---|---|
| `--bg` | `#f7f5f0` | Page background — warm beige (NOT cream/peach) | `ebook.html:14` |
| `--card` | `#ffffff` | Card / surface fill | `ebook.html:15` |
| `--line` | `#e9e3d6` | Hairline border (1px) | `ebook.html:16` |
| `--line-soft` | `#efeadd` | Soft divider | `ebook.html:17` |
| `--ink` | `#14171e` | Primary text — near-black with cool cast | `ebook.html:18` |
| `--ink-2` | `#3a4256` | Body copy / secondary text | `ebook.html:19` |
| `--ink-3` | `#7c7a72` | Metadata / muted captions | `ebook.html:20` |
| `--primary` | `#2f6f5e` | Deep teal — neural/structural accent | `ebook.html:21` |
| `--primary-soft` | `#d8e6e1` | Teal tint — pass verdicts, soft fills | `ebook.html:22` |
| `--accent` | `#c97b3f` | Terracotta — heat/P2, used sparingly | `ebook.html:23` |
| `--accent-soft` | `#f4dfca` | Terracotta tint | `ebook.html:24` |
| `--danger` | `#b06367` | Fail verdicts only | `ebook.html:25` |

**Derived (gradients used in featured/CTA cards):**
- `linear-gradient(135deg, #1f3a35 0%, #2f6f5e 100%)` — featured card + end CTA
  (`index.html:37,46`, `ebook.html:306`)
- `linear-gradient(90deg, var(--primary), var(--accent))` — reading progress bar
  (`ebook.html:283`)

**Accent budget:** one structural accent (`--primary`) + one heat accent
(`--accent`). Terracotta is used at most twice per viewport (section number,
pull-quote mark, featured-card radial). Never both as large washes.

---

## 2. Typography

**Font stacks** (identical in all 7 files):

| Role | Stack | Provenance |
|---|---|---|
| Display / serif | `'DM Serif Display', ui-serif, Georgia, serif` | `ebook.html:26` |
| Body / sans | `'Outfit', system-ui, -apple-system, sans-serif` | `ebook.html:27` |
| Mono / labels | `'JetBrains Mono', ui-monospace, Menlo, monospace` | `ebook.html:28` |

**Loading:** Google Fonts single request, weights 400;500;600;700 (Outfit),
400;500 (JetBrains Mono), 0;1 italics (DM Serif Display). `preconnect` to
`fonts.googleapis.com` + `fonts.gstatic.com crossorigin`.
Provenance: `ebook.html:8-10` (identical `<link>` in all 7 files).

**Type scale (static px values observed in ebook.html):**

| Class / role | Family | Size | Line-height | Tracking | Provenance |
|---|---|---|---|---|---|
| Cover title | serif | `clamp(48px, 9vw, 120px)` | 0.98 | `-0.02em` | `ebook.html:363-364` |
| Cover subtitle | serif italic | `clamp(20px, 3vw, 32px)` | — | — | `ebook.html:369` |
| Display (`h-display`) | serif 400 | (contextual) | 1.04 | `-0.012em` | `ebook.html:54-58` |
| Prose H2 | serif | 30px / `@768`: 36px | 1.15 | `-0.005em` | `ebook.html:84-90` |
| Pull-quote | serif italic | 30px / `@768`: 38px / `@≤640`: 24px | 1.25 | `-0.005em` | `ebook.html:113-118,321` |
| Lede | sans 400 | 21px | 1.5 | — | `ebook.html:71-72` |
| Body prose | sans | 16px | 1.65 | — | `ebook.html:34-35` |
| Card title (`check-q`) | serif | 20px | 1.25 | — | `ebook.html:146` |
| Timeline name | serif | 22px | 1.15 | — | `ebook.html:270` |
| Hero pass head | serif | 36px | 1.08 | `-0.012em` | `ebook.html:183-185` |
| Eyebrow / section-num | mono | 11-12px | — | `0.18em`–`0.22em` uppercase | `ebook.html:62-66,93-99,357-359` |

**Narrow static rules (from ebook.html):**
- Body base is fixed 16px / 1.65 — generous line-height for scanning readers.
- Display headlines use `letter-spacing: -0.012em` (tighter than body's
  `-0.005em`). Cover goes tightest at `-0.02em`.
- Eyebrows and section numbers are **always mono, 11-12px, uppercase,
  letter-spacing 0.18em–0.22em**. This is the signature label grammar.
- Italic emphasis switches to serif: `.body-prose em { font-family: var(--serif); }`
  (`ebook.html:80`).
- `text-wrap: pretty` on body paragraphs, `text-wrap: balance` on headings
  (`deck.html:61-62` — adopt across series).

---

## 3. Spacing & layout rhythm

**Grid:** Tailwind utility classes (`max-w-5xl`, `px-6 md:px-8`, `py-12`) on
top of the static CSS. No custom spacing token scale is declared in `:root`;
spacing is expressed directly in component padding.

**Observed rhythm (ebook.html):**

| Context | Padding | Provenance |
|---|---|---|
| Cover | `80px 24px 60px` | `ebook.html:353` |
| Hero pass | `56px 40px 60px` (mobile: `40px 24px 44px`) | `ebook.html:173,322` |
| Card surface | border + `border-radius:18px` + `box-shadow:0 2px 8px rgba(0,0,0,.035)` | `ebook.html:102-107` |
| Check card | `22px 22px 22px 24px`, radius 16px | `ebook.html:134-135` |
| Timeline window | `24px 26px`, radius 16px | `ebook.html:260-261` |
| End CTA | `44px 36px` (mobile: `32px 22px`), radius 22px | `ebook.html:308-309,326` |
| TOC item | `20px 22px`, radius 14px, grid `56px 1fr auto` | `ebook.html:417-423` |
| Chapter header | `padding-top:90px`, border-bottom | `ebook.html:464-467` |

**Max-widths:** cover desc `560px`, hero sub `360px`, rule `80px`, prose
implicit `75ch` (per DESIGN-SYSTEM.md, carried forward).

**Breakpoints:** two-band — `768px` (type step-ups) and `640px` (mobile
compaction). `deck.html` adds `clamp()` padding
`clamp(48px, 7vw, 96px) clamp(48px, 8vw, 112px)`.

---

## 4. Border radius

The series uses a **narrow, non-uniform radius set** — not the 8px grid in
the old DESIGN-SYSTEM.md, and not one universal radius.

| Radius | Used for | Provenance |
|---|---|---|
| `4px` | Noise pills (anti-pattern demo only) | `ebook.html:210` |
| `6px` | Mock URL bar | `ebook.html:167` |
| `8px` | Hero CTA button, mock dots n/a | `ebook.html:196` |
| `10px` | Begin button, verdict pill n/a | `ebook.html:394` |
| `14px` | TOC items, mock-wrap, brief-cards | `ebook.html:151,423`, `index.html:29` |
| `16px` | Check cards, timeline windows | `ebook.html:134,260` |
| `18px` | Surface cards (default) | `ebook.html:105`, `index.html:23` |
| `22px` | End CTA, ebook CTA (featured) | `ebook.html:308`, `index.html:46` |
| `999px` | Verdict pills, status pills | `ebook.html:250` |

**Rule:** radius scales with container prominence — 14px for list items,
16-18px for content cards, 22px for hero/CTA panels, 999px for pills.

---

## 5. Shadows

Two-tier, low-opacity, cool slate.

| Token | Value | Used for | Provenance |
|---|---|---|---|
| `soft` | `0 2px 8px rgba(0,0,0,0.035)` | Default card surface | `ebook.html:106` |
| `lifted` | `0 6px 20px -4px rgba(0,0,0,0.08)` (hover: `0 4px 16px -2px rgba(0,0,0,0.06)`) | Hover lift, hovered TOC item | `ebook.html:138,302,429` |
| primary-glow | `0 8px 24px -6px rgba(47,111,94,0.4)` | Primary CTA hover only | `ebook.html:400` |

**Rule:** shadows are whispers, not walls. Default is nearly invisible; lift on
hover is +2px translate with a slightly darker whisper.

---

## 6. Motion

| Token | Duration | Easing | Used for | Provenance |
|---|---|---|---|---|
| `instant` | 80ms | `linear` | Reading progress bar width | `ebook.html:284` |
| `gentle` | 180-200ms | `ease` | Card hover lift, TOC hover, link color | `ebook.html:136,301,425,487` |
| `slow` | — | — | (not used in ebook; declared in old doc only) | — |

**Hover lift grammar (consistent across all artifacts):**
```
transition: transform .2s ease, box-shadow .2s ease [,(border-color .2s ease)];
:hover { transform: translateY(-2px); box-shadow: 0 6px 20px -4px rgba(0,0,0,.08); }
```
Provenance: `ebook.html:136-138,301-302,425-429`, `index.html:30`.

**`prefers-reduced-motion`:** not explicitly handled in the HTML artifacts
(the old DESIGN-SYSTEM.md claims it is). **Proposal: add the globals.css
reduced-motion override as a rule to adopt**, since the artifacts currently
omit it. See §9 "Gaps to close."

---

## 7. Signature patterns (the static principles that make this series recognizable)

These are the **narrow static design principles** the brief asked me to extract
from `ebook.html`. They are the non-negotiable visual grammar.

1. **Warm-beige canvas + cool ink.** Background is `#f7f5f0`; text is
   `#14171e` (cool near-black), never warm brown. The warmth is in the surface,
   not the type. (`ebook.html:14,18,31`)
2. **Two-accent discipline.** `--primary` (teal) carries structure; `--accent`
   (terracotta) carries heat. Terracotta appears as section numbers, pull-quote
   marks, and the radial glow inside featured cards — never as a button fill
   and never as a page wash. (`ebook.html:96,122,315`; `index.html:38,47`)
3. **Mono-label grammar.** Every eyebrow, section number, tag, and metadata
   row is JetBrains Mono, 10-12px, uppercase, 0.16-0.22em tracking. This is the
   single most repeated pattern in the series. (`ebook.html:62-66,93-99,264-266,382-384,438-439`)
4. **Serif italic for emphasis, not bold.** `.body-prose em` switches family to
   serif italic (`ebook.html:80`). Pull-quotes are serif italic
   (`ebook.html:110-117`). Bold is reserved for `<strong>` at weight 600.
5. **Corner warmth halos.** `body::before`/`::after` place two 520px blurred
   circles (primary top-left, accent bottom-right) at 6% opacity. Present in
   `ebook.html`, `ebook-1.html`, `blog1-3.html`, `index.html`. The deck
   omits it (slide context). (`ebook.html:41-47`)
6. **Featured-card gradient + radial.** `linear-gradient(135deg,#1f3a35,#2f6f5e)`
   with a terracotta `radial-gradient` pseudo-element in the bottom-right
   corner. Used for the flagship brief card and every end-of-article CTA.
   (`ebook.html:305-317`; `index.html:37-38,46-47`)
7. **Hairline borders, no heavy rules.** Every border is `1px solid var(--line)`
   (`#e9e3d6`). The only "divider" is `.rule` — a 1px line capped at 80px wide,
   centered. (`ebook.html:295-298`)
8. **Translate-Y hover lift.** The single motion grammar: `translateY(-2px)` +
   shadow whisper. No scale, no rotate, no parallax. (`ebook.html:138,302,429`)
9. **Sticky frosted nav.** `background: rgba(247,245,240,0.85); backdrop-filter:
   blur(8px)` with a `--line` bottom border. (`ebook.html:288-292`,
   `index.html:22`)
10. **Reading progress bar.** Fixed 3px track at top, gradient fill
    `linear-gradient(90deg, var(--primary), var(--accent))`, 80ms linear width
    transition. (`ebook.html:277-285`)

---

## 8. Cross-artifact consistency matrix

| Feature | ebook.html | ebook-1.html | blog1 | blog2 | blog3 | index | deck |
|---|---|---|---|---|---|---|---|
| `:root` tokens identical | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ (aliased) |
| DM Serif + Outfit + JetBrains Mono | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Corner warmth halos | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — (slide) |
| Mono-label grammar | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Hover lift translateY(-2px) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — (slide) |
| Featured gradient card | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ (dark slide) |
| Hairline borders | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `prefers-reduced-motion` | — | — | — | — | — | — | — |

**Conclusion:** the series is token-identical and grammar-identical across 7
files. The single gap is reduced-motion support.

---

## 9. Gaps to close (proposed rules to adopt)

These are not yet in the shipped artifacts but are declared in the old
`DESIGN-SYSTEM.md` and are good practice. Proposed for adoption on approval:

1. **Add `prefers-reduced-motion` override** — collapse all transitions to
   `0ms` under `@media (prefers-reduced-motion: reduce)`. Currently absent from
   every artifact.
2. **Add `text-wrap: pretty` to body paragraphs and `text-wrap: balance` to
   headings** series-wide. Currently only `deck.html` has it.
3. **Standardize token names** — deck uses `--fg`/`--surface`/`--font-display`;
   the other six use `--ink`/`--card`/`--serif`. Pick one alias set (recommend
   the ebook set since it is the majority) and update the deck on next edit.

---

## 10. Reconciliation with existing DESIGN-SYSTEM.md

The existing doc describes a **different palette and type system** (Deep Umber
+ Sage, Cormorant Garamond + Atkinson Hyperlegible, 4px grid, 0.75-2rem radii).
None of those values appear in any shipped HTML artifact. On approval, the
recommendation is:

- **Replace** `DESIGN-SYSTEM.md` with this proposal's extracted system
  (the artifacts are the source of truth, per DESIGN-HANDOFF.md §"visual
  contract").
- **Keep** the old doc's structural sections (spacing grid, motion easing,
  component pattern inventory) as organizational templates, but repopulate
  them with the values observed here.
- **Carry forward** the handoff's responsive viewport matrix (360→1920) and
  its "match exported pixels first" rule — they already align with the
  artifacts' `768px` / `640px` breakpoints.

---

## 11. Provenance index

| Rule / token | Primary source | Cross-source |
|---|---|---|
| Color tokens | `ebook.html:13-29` | all 6 others |
| Font stacks | `ebook.html:26-28` | all 6 others |
| Cover type scale | `ebook.html:361-374` | — |
| Prose type scale | `ebook.html:54-99` | `blog1-3.html`, `index.html:18-20` |
| Card surface | `ebook.html:102-107` | `index.html:23` |
| Pull-quote | `ebook.html:110-128` | `blog1-3.html` |
| Check card | `ebook.html:131-147` | `blog1-3.html` |
| Hero pass/fail | `ebook.html:171-244` | `blog1.html` |
| Verdict pill | `ebook.html:246-254` | `blog1-3.html` |
| Timeline window | `ebook.html:257-274` | `blog2.html` |
| Reading progress | `ebook.html:277-285` | `blog1-3.html`, `ebook-1.html` |
| Topnav | `ebook.html:288-292` | `index.html:22`, `blog1-3.html` |
| Hover lift | `ebook.html:301-302` | `index.html:30`, all blogs |
| End CTA | `ebook.html:305-317` | `index.html:46-48`, all blogs |
| Featured card | `index.html:37-44` | `ebook.html:305-317` |
| TOC | `ebook.html:403-461` | — |
| Corner halos | `ebook.html:41-47` | `ebook-1`, `blog1-3`, `index` |
| Deck surfaces | `deck.html:30-80` | — (deck-only aliasing) |

---

## 12. Next step

On **approval**, apply:
1. **Rename** this project's `DESIGN-SYSTEM.md` → `CONTENT-DESIGN-SYSTEM.md`
   and replace its contents with this extracted system, making the
   content-marketing scope unambiguous in the filename itself.
2. **Do not touch** the website app repo's `DESIGN-SYSTEM.md` — that system
   governs the product UI and is a separate concern.
3. Add the three "gaps to close" rules (§9) to a shared `content-tokens.css`
   in the marketing project root, and back-port to the 7 artifacts on next
   edit.
4. Record the system as a **scoped** durable design-system entry — name it
   `wellfull-content-marketing` (distinct from the website's
   `wellfull-website` system) — with this proposal as provenance.

No changes have been made yet. Edit this file or reply "approve" to proceed.

## Provenance

Formalized by Open Design from candidate 97091354-c2a3-44f6-8ef7-64025f08d171.
