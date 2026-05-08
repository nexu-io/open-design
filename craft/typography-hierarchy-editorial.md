# Editorial typography hierarchy craft rules

Extends `typography.md` + `typography-hierarchy.md`. Defines hierarchy
behavior for editorial surfaces: long-form articles, magazine layouts,
digital guides, editorial landing pages, and blog posts.

> Opt in via `od.craft.requires: [typography, typography-hierarchy, typography-hierarchy-editorial]`.

---

## What "editorial" means here

Editorial hierarchy means the pacing is authored the way a print art director
paces a spread: entry point, tension, rest, disruption, resolution. The reader
is moved through content rather than given a uniform reading surface. SaaS
hierarchy is additive — elements stack and each gets its turn. Editorial
hierarchy is compositional — elements are weighted against each other and
some are deliberately suppressed so others can breathe.

---

## Editorial hierarchy principles

### 1. Dramatic scale jumps

Editorial type scales are not gradual. The gap between display and body
is large — often 3–5× — because the display element is not just a heading,
it is a visual event.

| Level | Typical range | Notes |
|---|---|---|
| Display / lede | 56–96 px | (editorial override) May intentionally exceed the default `typography.md` display range |
| Deck / standfirst | 18–24 px | Large jump down — intentional |
| Body | 16–18 px | Close to deck is fine; they're in the same reading register |
| Pull quote | 28–40 px | Disrupts body rhythm; treated as a visual break, not a heading |
| Caption / label | 11–13 px | Minimal — never competes with body |

The gap between display and deck is the editorial signature. A small step
here reads as SaaS, not editorial.

### 2. Whitespace carries hierarchy

Editorial hierarchy is not announced by a heavy heading. It is created by
the space that surrounds an element. An article title in a moderate weight
surrounded by generous whitespace outranks a bold heading crammed against
its content.

Rules:
- Above-the-fold display element: minimum 2× the line-height in space above
  and below before body begins.
- Pull quotes: full column margin on both sides, or break the grid entirely.
- Section breaks: use space alone. Do not add a rule, a divider, or a
  decorative element. Space is enough.
- Caption clusters: tighter internal spacing, larger gap from the body above.

### 3. Restrained bold

Editorial systems use weight sparingly. The display element is often set in
a light or regular weight — hierarchy is carried by scale and space, not mass.

Bold in editorial context means: this word/phrase matters beyond the sentence.
It is not used for section labels, UI chrome, or navigation. One to two bold
phrases per 400 words of body copy is a working upper bound.

If everything important is bold, nothing is.

### 4. Display tracking

Negative tracking at large sizes is mandatory. At editorial display sizes
(56 px+), tracking should be `-0.02em` to `-0.05em` (editorial override;
see `typography.md` §display tracking for the default range). Light display
weights may go tighter within this range.

---

### 5. Pull quotes as rhythm disruption

A pull quote is not a blockquote. It is a visual interrupt.

| Property | Behavior |
|---|---|
| Scale | 28–40 px — above body, below display |
| Weight | Regular or light — never bold |
| Tracking | Slightly negative (`-0.01em`) or zero |
| Alignment | Break from body column — full width, or offset left/right |
| Spacing | Large above and below — equal to or greater than a section break |
| Color | May use `var(--accent)` as the only accent use on the page |

Pull quotes placed at regular intervals destroy their effect. One per
long-form article is usually correct. Two is a maximum.

### 6. Body measure and reading rhythm

Long-form body copy: 60–70 ch line length. Tighter than the `typography.md`
max because editorial reading is sustained, not scanning.

Line height: `1.6`–`1.7` for serif body. Slightly more generous than the
universal rule because editorial bodies are set at a reading size, not a UI
size.

Do not justify. Ragged right is the correct setting for editorial body copy
on screen.

### 7. Asymmetrical rhythm

Uniform section spacing reads as a template. Editorial pacing alternates
between compression and expansion:

- Dense section → spacious section → medium section.
- A tightly spaced image caption cluster immediately after a generous
  body paragraph creates productive tension.
- The final section before a pull quote should tighten; after it, release.

---

## Editorial hierarchy table

| Element | Scale | Weight | Tracking | Leading | Spacing role |
|---|---|---|---|---|---|
| Display headline | 56–96 px | Light or regular | `-0.02em` to `-0.05em` | `1.0`–`1.1` | Event — generous above/below |
| Deck / standfirst | 18–24 px | Regular | `0` | `1.4`–`1.5` | Transitional — moderate gap below |
| Byline / dateline | 12–14 px | Regular or medium | `0.02em`–`0.04em` | `1.5` | Recedes — tight gap below |
| Body | 16–18 px | Regular | `0` | `1.6`–`1.7` | Baseline — rhythm carrier |
| Pull quote | 28–40 px | Regular or light | `-0.01em` | `1.2`–`1.3` | Interrupt — large above/below |
| Image caption | 12–13 px | Regular | `0.01em` | `1.5` | Recedes — tight cluster |
| Section label | 11–12 px | Medium | `0.06em`–`0.1em` (if caps) | `1.5` | Wayfinding only |

---

## Anti-patterns

- **Bold display headline** — editorial display is usually light or regular.
  Bold display reads as billboard advertising. If the design system's display
  weight is heavy, either use the regular cut or revisit the choice.
- **Uniform section padding** — every section has the same gap. No pacing.
  The page reads as a list of content blocks.
- **Pull quote styled as a callout box** — border-left, background tint,
  or card treatment. A pull quote is typographic. It does not need a container.
- **Deck set at body size** — the gap between headline and deck must be large
  enough to read as a scale event. 18 px minimum for a deck below a 56 px+
  headline.
- **Heading for every section** — editorial long-form does not require
  a heading at every content shift. Space and pacing are allowed to do the
  work. (guidance)
- **Positive tracking on display** — wide-tracked display headlines read as
  a branding exercise. Tighten them.
- **UI chrome in the reading column** — buttons, tags, chip badges inside
  the body text column. Keep the reading surface clean. UI elements live
  outside the measure.

---

## Lint

- [ ] Display headline is light or regular weight unless the design system
      specifies otherwise.
- [ ] Display tracking is within `-0.02em` to `-0.05em` at 56 px+.
- [ ] Gap between display and deck is a visible jump. (guidance)
- [ ] Body line height is `1.6`–`1.7`.
- [ ] Body measure is 60–70 ch.
- [ ] Pull quote, if present, breaks the body column (full width or offset).
- [ ] No more than 2 pull quotes in a single article surface. (long-form only)
- [ ] Section spacing alternates — at least one gap is meaningfully larger
      than the others. (long-form only — guidance)
- [ ] Bold used ≤ 2 times per 400 words in body copy. (long-form only)
- [ ] `var(--accent)` used ≤ 2 times on the full editorial surface (see `color.md` §accent discipline).
- [ ] No divider rules or decorative elements used as section breaks.
      Space alone is sufficient.
- [ ] Pull quote has no background, border, or container treatment.
