---
name: fashion-cardnews
description: |
  A 5–10 card, image-led fashion editorial carousel for Instagram, Threads,
  or similar social feeds. Produces saveable 1080×1350 cards with clear
  role separation: cover, index, look, detail, and outro. Use for Korean or
  English fashion cardnews, outfit archives, styling notes, and magazine-like
  social carousels. The skill uses only user-provided or explicitly safe
  assets and never bundles operational campaign images.
triggers:
  - "fashion cardnews"
  - "fashion carousel"
  - "instagram fashion carousel"
  - "threads cardnews"
  - "editorial outfit carousel"
  - "styling cardnews"
  - "패션 카드뉴스"
  - "스레드 카드뉴스"
  - "인스타그램 패션 캐러셀"
  - "패션 아카이브 카드뉴스"
od:
  mode: prototype
  platform: mobile
  scenario: marketing
  featured: 16
  preview:
    type: html
    entry: index.html
  design_system:
    requires: true
    sections: [color, typography, layout, components]
  example_prompt: "Design a 7-card 1080×1350 fashion cardnews carousel for a summer office layering topic. Use safe placeholder imagery, Korean editorial copy, and a Cover → Index → Look → Detail → Look → Checklist → Outro structure."
---

# Fashion Cardnews Skill

Produce a mobile-first, image-led fashion editorial carousel. The output is a
single HTML artifact that previews the whole carousel on a desktop stage while
each card is designed as an exportable 1080×1350 social card.

## Asset boundary

Use this skill for reusable design systems, templates, and public-safe examples.
Do **not** place live campaign assets in the skill or generated example:

- No real customer account cookies, session files, access tokens, or upload logs.
- No production social post PNGs, captions, metrics, or experiment notes.
- No brand-owned or scraped product images unless the user explicitly provides
  them for the current run and confirms they are safe to use.
- No internal product database identifiers, pricing, discount claims, or private
  performance data.

When real imagery is unavailable, use CSS photo-block placeholders, neutral
texture panels, or user-supplied images. Label placeholders honestly instead of
pretending they are finished photography.

## Carousel structure

Prefer 5–10 cards. Assign each card a distinct editorial role so the deck does
not become a sequence of similar mood boards:

1. **Cover** — strongest visual hook, one large headline, instantly readable.
2. **Index** — categories, outfit logic, or a 30-second checklist.
3. **Look** — full outfit or hero composition with one compact styling note.
4. **Detail** — material, neckline, hem, silhouette, bag/shoe, or texture crop.
5. **Look variation** — a second outfit or styling direction.
6. **Checklist / criteria** — saveable rules, not sales copy.
7. **Outro** — archive/save reminder; no purchase push.

For longer carousels, alternate `Look` and `Detail` cards rather than adding
more text-only cards.

## Visual direction

- Canvas: design each card as `1080×1350` or equivalent `4:5` ratio.
- Weight: imagery should carry at least 70–80% of the design weight.
- Typography: use the active design system first. If absent, choose a confident
  sans or rounded display face for Korean headlines and a quieter sans/mono for
  labels. Avoid treating Inter-like UI text as the main fashion display face.
- Layout: use large crops, aligned edges, negative space, and subtle numbering.
  Avoid tiny circular badges as the default; prefer integrated `01`, `02`, or
  `ITEM 01` labels.
- Backgrounds: derive neutral backgrounds from the image mood. Avoid decorative
  pastel panels unless the brief asks for them.
- Copy: short, feed-native, and specific. One strong line beats a paragraph.
  Korean copy should feel like a fashion archive magazine, not an office report.

## Workflow

1. **Read the brief and active DESIGN.md.** Identify platform, card count,
   language, topic, and whether the user supplied safe images.
2. **Define the editorial hypothesis.** Example: “thin layers that survive
   hot commutes and cold offices.” Keep it useful and saveable.
3. **Map card roles.** Write a one-line plan using the structure above before
   generating the artifact.
4. **Choose asset treatment.** Use provided safe images, or placeholder
   photo-blocks with honest labels such as `safe image slot` / `detail crop`.
5. **Write the artifact.** Emit one `index.html` with inline CSS and a carousel
   stage. Each `.card` must be 4:5, independently readable, and marked with
   `data-od-id`.
6. **Self-check against `references/checklist.md`.** Fix violations before
   emitting the final artifact.

## Copy rules

Use compact editorial copy:

- Good Korean examples: `낮엔 덥고 실내는 추운 날`, `얇은 한 장 3가지`,
  `기본템인데 안 심심한 쪽`, `가까이 봐야 보이는 것들`, `저장해두고 다시 보기`.
- Good English examples: `one light layer`, `desk-to-dinner texture`,
  `quiet detail, better shape`, `save the formula`.

Avoid:

- Purchase CTAs: `buy now`, `shop`, `link in bio`, `구매`, `할인`, `특가`.
- Unsupported claims: `best`, `guaranteed`, `verified`, `sold out`, `restocked`
  unless the user provides evidence.
- Generic process copy: `photos arranged beautifully`, `a stylish archive`, or
  internal design notes on the card face.

## Output contract

Emit exactly one HTML artifact:

```html
<artifact identifier="fashion-cardnews" type="text/html" title="Fashion Cardnews">
<!doctype html>
<html>...</html>
</artifact>
```

The artifact should include:

- A stage title and short usage note.
- 5–10 `.card` elements with `aspect-ratio: 4 / 5`.
- `data-od-id` on the stage, each card, headline, and major image slot.
- A short “asset boundary” note in the page footer when placeholders are used.

One sentence before the artifact is allowed. Nothing after the artifact.
