# Typography craft rules

Universal typography rules that apply on top of any `DESIGN.md`. The
active design system decides *which* fonts; this file decides *how* they
behave at every size.

> Adapted from [refero_skill](https://github.com/referodesign/refero_skill)
> (MIT) — distilled and re-tuned for Open Design's token system.

## Type scale

Use a multiplicative scale (1.2 or 1.25). Cap at 6–8 sizes per artifact.

| Role | Range |
|---|---|
| Display | 48–72 px |
| H1 | 32–48 px |
| H2 | 24–32 px |
| H3 | 20–24 px |
| Body | 15–18 px |
| Small | 13–14 px |
| Caption | 11–12 px |

## Line height (leading)

| Text size | Line height |
|---|---|
| Display / H1 (≥32 px) | `1.0`–`1.2` (tight) |
| Body (15–18 px) | `1.5`–`1.6` |
| Small (≤14 px) | `1.5` |

### CJK overrides — these are not optional

The table above is Latin leading. Latin display type can go to `1.0`
because the ascender/descender slack inside the em box keeps lines
apart. **CJK glyphs fill the em box**, so the same value makes
consecutive lines touch, and multi-line Chinese headlines visibly
collide.

| Text size | Latin | CJK |
|---|---|---|
| Display / H1 (≥32 px) | `1.0`–`1.2` | **`1.3`–`1.4`** |
| Body (15–18 px) | `1.5`–`1.6` | `1.7`–`1.8` |

The CJK floor has **no upper size tier**. It applies to every heading
level, including the **cover / hero main title** — the single biggest
headline on a deck's first slide. A Chinese cover title at 72 px,
96 px, or larger, especially one split into multiple lines with
`<br>`, is still CJK display text: set `line-height: 1.3`–`1.4` on
it, never the Latin `1.0`–`1.2`. At 96 px a `1.05` leading makes the
two lines of a Chinese cover headline visibly collide. This is the
single most common violation, so check the cover main title first.

Negative tracking is Latin-only for the same reason: CJK is already
set on a fixed em grid, so `-0.02em` on a Chinese headline crowds the
glyphs instead of tightening the word. Use `0` for CJK display text.

When one artifact mixes both — an English kicker over a Chinese
headline is the common case — set the tight Latin values on the Latin
element only. Do not inherit them onto the CJK block from a shared
parent rule.

## Letter-spacing — the rule that makes or breaks craft

This is the single most-skipped rule in AI-generated design. **No
exceptions.**

| Context | Letter-spacing |
|---|---|
| Body text (14–18 px) | `0` (default) |
| Small text (11–13 px) | `0.01em` to `0.02em` (positive) |
| UI labels and button text | `0.02em` |
| **ALL CAPS** | **`0.06em` to `0.1em` (required)** |
| Headings 32 px+ | `-0.01em` to `-0.02em` |
| Display 48 px+ | `-0.02em` to `-0.03em` |

ALL CAPS without positive tracking looks cramped and amateur. Display
text without negative tracking looks loose and weak. These two failures
are the most reliable AI-slop tells.

The `0.06em` floor is not arbitrary: it is the empirical lower bound
that print and web typographers have converged on for uppercase
tracking (cf. Bringhurst's *Elements of Typographic Style* §3.2.7,
which recommends 5–10% of the em for caps; modern screen practice
rounds the lower end to 0.06em). Anything tighter and the counters
collide on screen; the upper bound `0.1em` keeps the word from
disintegrating into letters.

## Font pairing

- Maximum 2 typefaces per artifact (display + body, or one variable face
  used at multiple weights).
- Always declare a system fallback chain. If the active `DESIGN.md`
  ships a webfont URL, the fallback must still produce a coherent look.
- Never set `font-family: system-ui` alone on a heading — that is the
  textbook AI default; always pair it with an intentional first choice.

## Line length

Limit body copy to **50–75 characters** per line. In CSS:
`max-width: 65ch` is a safe default.

## Three-weight system

Most well-crafted UIs use exactly 3 weights:
- **Read** (400 / 450) — body copy
- **Emphasize** (510 / 550) — UI text, labels, navigation
- **Announce** (590 / 600) — headlines, buttons

Weight 700+ is rarely needed. If your design uses bold for "emphasis on
emphasis," it likely lacks weight discipline elsewhere.

## Common mistakes (lint these)

- ALL CAPS without `letter-spacing` ≥ `0.06em`.
- Display text (≥32 px) without negative tracking (Latin only — see the CJK overrides).
- CJK display text at Latin leading (`≤1.2`), which makes the lines overlap.
- Multi-line CJK cover / hero titles (72–96 px+, e.g. split with `<br>`) below `1.3` line-height.
- Negative tracking applied to CJK text.
- More than 3 type sizes visible above the fold.
- Mixed serif and slab on the same screen without a clear role split.
- Body copy in `text-align: justify` (creates rivers; never use on the web).
