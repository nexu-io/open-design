# kami-article checklist

Run this before emitting `<artifact>`. P0 = must pass; P1 = should
pass; P2 = nice to have. Same shape as
[`skills/web-prototype/references/checklist.md`](../../web-prototype/references/checklist.md);
content is tuned for the kami visual contract and the article-
transcript-and-interpretation use case.

## P0 — must pass

- [ ] **Page background is parchment** — `var(--parchment)` /
  `#f5f4ed`. Never `#ffffff`, never `#fafafa`, never `var(--ivory)`
  on the body.
- [ ] **Single ink-blue accent** — every accent color resolves to
  `var(--brand)` / `#1B365D` (or `var(--brand-light)` on hover).
  No second accent. Grep `#[0-9a-fA-F]{3,6}` outside `:root{}` and
  the `.tag.brush` gradient — every match must be ink-blue or a
  pre-blended kami token (`#EEF2F7`, `#E4ECF5`, `#D0DCE9`,
  `#D6E1EE`).
- [ ] **Ink-blue ≤ 5% of visible surface.** Count chapter numbers,
  manifesto rule, metric values, headline accent word, quote rules,
  footer kicker accent, in-text `code` background. Total must read
  as a hint, not a wash.
- [ ] **Serif weight stays at 500.** No `font-weight: 700` / `900`.
  Body weight is 400; everything bolded (titles, `<strong>`,
  `.label`, `.signature`, `.metric .value`) is 500.
- [ ] **No `font-style: italic` anywhere** — including inside
  `<em>`, `<cite>`, `<i>`, blockquote, or any kami component.
  Emphasis swaps to `var(--brand)` color or a `.tag` instead.
- [ ] **All numeric stacks carry `font-variant-numeric: tabular-nums`** —
  `.metric .value`, `.eyebrow-row .left/.right`, `.hero-tokens .row`,
  `.legal`. Pagination digits, dates, and read-time strings
  included.
- [ ] **All tag fills are solid hex** (`#EEF2F7`, `#E4ECF5`, etc.).
  No `rgba()` on `.tag.standard` / `.tag` backgrounds. (`.tag.brush`
  is the only sanctioned gradient — one per page.)
- [ ] **Shadows are restrained.** At most a 1px ring or a single
  whisper (`0 4px 24px rgba(0,0,0,0.05)`) on hover. No hard drop
  shadows, no neumorphism, no `backdrop-filter`.
- [ ] **No external JavaScript.** The page is paper, not an app.
  Google Fonts `<link>` is the only sanctioned external resource.
- [ ] **Headline ≤ 6 EN words / ≤ 8 CJK chars at display size,**
  with exactly one `.ink` accent span. Mixed-script
  ("HTML 的不合理有效性") counts the CJK chars only.
- [ ] **`data-od-id="<slug>"` on every top-level region** —
  `body`, `.eyebrow-row`, `.hero`, `.manifesto`, `.metrics`,
  `.chapters`, every `.chapter`, `.footer`. Used by host comment
  mode.
- [ ] **Every `.quote` block has a `.src` attribution line.**
  Format: `<span class="src">— Author · venue</span>`. No
  unattributed pull quotes — even if it's "your own thought,"
  signal it as `— Interpreter` so the reader can tell apart what
  came from where.
- [ ] **Every metric value has a real-source provenance.** Either
  it appears in the source piece, or the `.sub` line labels it as
  commentary. Honest `—` beats an invented "10× faster".
- [ ] **At most two `.quote` blocks per source piece**, each
  ≤ 2 sentences. Anything longer is reproduction, not commentary.
- [ ] **Mobile reflow works** — at 1080px, hero / manifesto /
  metrics / chapters all collapse to one column without horizontal
  scroll; at 640px, metrics stack vertically and `.legal` wraps.

## P1 — should pass

- [ ] **Body line-height stays in 1.7–1.8** for `.chapter .body p`.
  This skill is meant to be *read*, not scanned — the looser rhythm
  is intentional and distinguishes it from `kami-landing`.
- [ ] **Each chapter has a clear lede line** in `.chapter .lede`,
  ≤ 22 CJK chars / ≤ 14 EN words. The lede is the chapter's
  one-line summary; if you can't write it, the chapter probably
  isn't well-formed.
- [ ] **`.chapter-aside` blocks earn their visual weight.** Use
  `.a-grid` (2 × N) for catalog-style summaries, `.table` for
  comparison-style answers. Don't drop in an aside just because
  the page feels long — every aside should be the densest
  representation of one specific idea.
- [ ] **Footer Source column links back to the canonical URL** of
  the source piece. If the source has multiple URLs (X post +
  author site), surface both.
- [ ] **Hero tagline ≤ 42ch wide,** colon-aware. The tagline is
  the second-most-read string on the page — keep it scannable.
- [ ] **No more than one `.tag.brush` per page.** It's the only
  sanctioned gradient and reads as a typographic flourish, not
  a button. Reserve it for one editorial accent.

## P2 — nice to have

- [ ] **`text-wrap: pretty` / `balance`** on long paragraphs and
  headings (the browser default is already good for `<p>` and
  `h*` if your stylesheet doesn't override).
- [ ] **`color-mix()` for any derived tone.** No additional
  `--brand-50` / `--brand-300` Bootstrap-style tokens — derive on
  the spot from `var(--brand)` and `var(--parchment)`.
- [ ] **Eyebrow row ages well** — `Vol. NN · Issue Nº NN`,
  `MMXXVI` (Roman year), `NN min read`. Don't put a literal
  publication date here unless the page is genuinely time-bound.
- [ ] **Mono font appears only in `.hero-tokens` / `.legal` /
  `code`** — three places maximum. Anywhere else it dilutes the
  serif voice.

## Anti-slop spot-check

Look at the page for two seconds. If your gut says any of:

- "this looks like every other AI-generated 'reading mode' page I've
  seen this year"
- "the manifesto reads like the model's opinion masquerading as the
  author's"
- "I can't tell where the source ends and the interpreter begins"
- "the metrics are round numbers that don't feel like they came
  from anywhere"

…go back, swap one chapter title for something that names the
specific argument (not "Why this matters", not "Key insights"),
re-attribute the manifesto to the interpreter (not the source
author), and replace one fabricated metric with `—` plus a `.sub`
line that says what the source actually claimed.

## When you should NOT use kami-article

- You are writing about your own brand, product, or studio. Pick
  [`kami-landing`](../../kami-landing/) instead — its manifesto +
  metrics + chapters structure is tuned for marketing copy, not
  reading-and-respond.
- You want a slide-by-slide horizontal walkthrough. Pick
  [`kami-deck`](../../kami-deck/) instead.
- The source piece is paywalled, copyrighted in a restrictive
  jurisdiction, or the author has explicitly objected to
  third-party transcript pages. Stop, surface the constraint to
  the user, and link to the original instead of mirroring it.
- You need to reproduce more than two short attributed quotes.
  Anything heavier than that should be a separate transcript
  artifact — this skill is for *response*, not *reproduction*.
