# Footer-Rail + Cursor-Flow Layout Discipline

The full rule set referenced from `SKILL.md` Step 4. Read this when the deck has slide types beyond simple title-+-body or when you're building the re-export script from scratch.

> **How to use this file.** Skim §1-3 once to internalize the rules
> (constants, `Cursor`, hero budget centering). Then jump to the slide-type
> snippet that matches what you're building — pipeline, two-column,
> observation grid, etc. — and adapt. The file is meant to be navigated,
> not read end-to-end.

## 1. Constants — define once at the top of the export script

```python
from pptx.util import Inches, Pt, Emu
from pptx.dml.color import RGBColor

# Canvas (16:9). Override only if the deck explicitly targets 4:3 or 1:1.
CANVAS_W       = Inches(13.333)
CANVAS_H       = Inches(7.5)

# Margins
MARGIN_X       = Inches(0.6)            # left / right symmetric
MARGIN_TOP     = Inches(0.5)            # below the chrome row
CONTENT_LEFT   = MARGIN_X
CONTENT_RIGHT  = CANVAS_W - MARGIN_X
CONTENT_W      = CONTENT_RIGHT - CONTENT_LEFT

# Vertical rails — the load-bearing pair
CHROME_TOP     = Inches(0.32)           # top metadata row
CHROME_H       = Inches(0.20)
CONTENT_TOP    = MARGIN_TOP             # cursor starts here on content slides
CONTENT_MAX_Y  = Inches(6.70)           # NOTHING in content area may cross
FOOTER_TOP     = Inches(6.85)           # foot row pinned here
FOOTER_H       = Inches(0.22)

# Theme colors — derive from the HTML :root block, do not invent
COLOR_INK      = RGBColor(0x0a, 0x1f, 0x3d)   # dark theme background / light text color
COLOR_PAPER    = RGBColor(0xf1, 0xf3, 0xf5)   # light theme background / dark text color
COLOR_INK_60   = RGBColor(0x68, 0x77, 0x8e)   # 60 % opacity ink (precomputed)
COLOR_PAPER_60 = RGBColor(0x9b, 0xa0, 0xa6)   # 60 % opacity paper

# Typography stacks. EN italic uses serif-en; CJK never italicizes.
FONT_SERIF_EN  = "Playfair Display"
FONT_SERIF_FB  = "Source Serif 4"
FONT_SERIF_ZH  = "Noto Serif TC"
FONT_SANS_ZH   = "Noto Sans TC"
FONT_MONO      = "IBM Plex Mono"
```

## 2. The Cursor primitive

Used on all non-hero slides. The cursor advances down the slide and refuses to cross `CONTENT_MAX_Y`.

```python
class Cursor:
    def __init__(self, y_start=CONTENT_TOP, cap=CONTENT_MAX_Y):
        self.y = y_start
        self.cap = cap
        self.history = []   # list of (top, height, label) for debugging

    def take(self, h, gap=Inches(0.12), label=""):
        top = self.y
        self.y = top + h + gap
        self.history.append((top, h, label))
        if self.y > self.cap:
            raise OverflowError(
                f"Cursor exceeded rail at '{label}': "
                f"y={self.y} cap={self.cap}; "
                f"history={self.history}"
            )
        return top

    def remaining(self):
        return self.cap - self.y
```

Usage:

```python
c = Cursor()
add_kicker(slide, top=c.take(Inches(0.18), label="kicker"))
add_h_xl(slide,   top=c.take(Inches(1.0),  label="h-xl"))
add_lead(slide,   top=c.take(Inches(0.8),  label="lead"))
add_pipeline(slide, top=c.take(Inches(2.6), label="pipeline"))
```

> **Per-script `gap` tuning.** The default `Inches(0.12)` matches 14pt
> Latin body copy. Decks that include CJK, Devanagari, Thai, or
> Khmer need more breathing room — line clusters and stacked tone
> marks bump the rendered line height. Pass an explicit `gap=` per
> block, or override the `Cursor` default at the top of your export.
> The full per-script table is in
> [`font-discipline.md` § Line height per script](font-discipline.md).
>
> **Detecting the highest-demand script in a mixed deck.** A deck
> can mix `en` slides with `th` slides — locale alone isn't the
> signal. Scan each slide's text against the Unicode ranges in
> `font-discipline.md` Layer 5's `NO_ITALIC_RANGES` (extend with the
> Vietnamese Extended block U+1E00–U+1EFF for ếẫỗ), record the
> per-slide max-gap, and instantiate the slide's `Cursor` with that
> value. For a uniform deck-wide setting, take the max across all
> slides.

If a slide raises `OverflowError`, fix one of three things:

1. **Reduce block height** — the box was generously sized; tighten to actual text height.
2. **Reduce gap** — the inter-block gap is excessive; trim from `0.18"` to `0.10"`.
3. **Split the slide** — the content genuinely doesn't fit; this is a design problem, not a layout problem.

Don't "solve" it by raising `CONTENT_MAX_Y`. The rail exists for a reason — content that crosses it will overlap the footer at full-screen presentation.

## 3. Hero slides — budget centering, not cursor flow

Hero slides (cover, chapter intros, big-quote pages) are vertically centered. The cursor model would put them at the top with empty space below — visually wrong.

```python
def hero_layout(blocks):
    """
    blocks: list of (height, gap_after) tuples in top-to-bottom reading order.
    Returns a Cursor whose y_start is computed so the stack is centered.
    """
    total_h = sum(h + g for h, g in blocks)
    y_start = (CANVAS_H - total_h) / 2
    # Pin cap to bottom of available area so we still catch overflow.
    return Cursor(y_start=y_start, cap=CANVAS_H - FOOTER_H - Inches(0.2))
```

Hero usage:

```python
# Plan the stack first.
HERO_BLOCKS = [
    (Inches(0.18), Inches(0.30)),   # kicker
    (Inches(1.50), Inches(0.20)),   # h-hero
    (Inches(0.45), Inches(0.40)),   # h-sub
    (Inches(0.70), Inches(0.30)),   # lead
    (Inches(0.20), Inches(0.00)),   # meta-row
]
c = hero_layout(HERO_BLOCKS)
for (h, g), block_fn in zip(HERO_BLOCKS, [k_kicker, k_hero, k_sub, k_lead, k_meta]):
    block_fn(slide, top=c.take(h, gap=g))
```

The pattern reads as: "list each block's actual height, then center the entire stack". One source of truth, no manual `MARGIN_TOP`.

## 4. Footer is always pinned, never advanced

Don't route the footer through the cursor — it has its own rail.

```python
def add_footer(slide, left_text, right_text, theme="dark"):
    color = COLOR_PAPER_60 if theme == "dark" else COLOR_INK_60
    add_text(slide,
        left=CONTENT_LEFT, top=FOOTER_TOP,
        width=CONTENT_W / 2, height=FOOTER_H,
        text=left_text, font=FONT_MONO, size_pt=9,
        color=color, align="left", letter_spacing=2.0)
    add_text(slide,
        left=CANVAS_W / 2, top=FOOTER_TOP,
        width=CONTENT_W / 2, height=FOOTER_H,
        text=right_text, font=FONT_MONO, size_pt=9,
        color=color, align="right", letter_spacing=2.0)
```

`add_chrome` is the same idea pinned at `CHROME_TOP`. Both rails sit *outside* the content area, so they never collide with the cursor.

## 5. Box height ≠ text height — but tight is better than loose

PowerPoint draws shape bounds visibly when:

- Two shapes overlap (selection halos in editor, faint anti-alias seam in presentation mode).
- A shape with a fill or border crosses the rail.
- Z-order conflicts cause one shape to clip another.

So even when the *text* fits within the content area, an oversized *box* can intrude. Tighten box height to:

```
box_h = (n_lines * line_height_pt + 2 * pad_pt) / 72
```

where `pad_pt` is 2–4 pt (≈ 0.03–0.05"). For multi-line text frames, set `text_frame.word_wrap = True` and don't pad vertically — let the text frame's intrinsic metrics size itself.

For headline blocks with a known line count, you can also set:

```python
tf = shape.text_frame
tf.auto_size = MSO_AUTO_SIZE.SHAPE_TO_FIT_TEXT
```

Then read `shape.height` *after* adding text to find the actual height for the cursor.

## 6. Italic preservation — only EN serif, never CJK

The single most common silent regression. HTML `<em>`, `<i>`, and inline `font-style: italic` should all map to `run.font.italic = True`. But:

- **EN/Latin display copy** (Playfair Display, Source Serif) has a real italic. Use it.
- **CJK display copy** (Noto Serif TC, Source Han Serif) has no italic. Synthesizing produces a slanted bitmap that looks broken. Skip italic for CJK runs even if the HTML had `<em>` around the CJK text.
- **EN body copy** can use sans italic if the body family supports it; if not, swap to serif italic for the duration of the run.

```python
def add_run(p, text, *, font, size_pt, italic=False, bold=False, color=None):
    r = p.add_run()
    r.text = text
    # If italic is requested, force an EN serif that supports it.
    if italic:
        r.font.name = FONT_SERIF_EN if not _is_cjk(text) else font
        r.font.italic = not _is_cjk(text)
    else:
        r.font.name = font
        r.font.italic = False
    r.font.size = Pt(size_pt)
    r.font.bold = bool(bold)
    if color is not None:
        r.font.color.rgb = color
    return r

def _is_cjk(s):
    return any('\u4e00' <= c <= '\u9fff' or '\u3040' <= c <= '\u30ff' for c in s)
```

When walking HTML, detect italic spans:

```python
from html.parser import HTMLParser

class ItalicSpans(HTMLParser):
    def __init__(self):
        super().__init__()
        self.italic_depth = 0
        self.runs = []   # list of (text, italic_bool)
        self._buf = []
        self._italic = False

    def handle_starttag(self, tag, attrs):
        if tag in ("em", "i"):
            self._flush()
            self.italic_depth += 1
            self._italic = True
        elif tag == "span":
            style = dict(attrs).get("style", "")
            if "italic" in style:
                self._flush()
                self.italic_depth += 1
                self._italic = True

    def handle_endtag(self, tag):
        if tag in ("em", "i", "span") and self.italic_depth > 0:
            self._flush()
            self.italic_depth -= 1
            self._italic = self.italic_depth > 0

    def handle_data(self, data):
        self._buf.append(data)

    def _flush(self):
        if self._buf:
            self.runs.append(("".join(self._buf), self._italic))
            self._buf = []
```

## 7. Slide-type recipes

### 7.1 Cover / hero with vertical center

```python
def slide_cover(prs, *, title, subtitle, lead, meta, chrome_l, chrome_r):
    slide = prs.slides.add_slide(blank_layout)
    paint_bg(slide, COLOR_INK)
    add_chrome(slide, chrome_l, chrome_r, theme="dark")

    blocks = [
        (Inches(0.18), Inches(0.32)),   # kicker
        (Inches(1.50), Inches(0.18)),   # h-hero
        (Inches(0.45), Inches(0.36)),   # h-sub
        (Inches(0.70), Inches(0.30)),   # lead
        (Inches(0.20), Inches(0.00)),   # meta
    ]
    c = hero_layout(blocks)
    add_kicker(slide, top=c.take(*blocks[0]), text="SOP · Coach Edition")
    add_h_hero(slide, top=c.take(*blocks[1]), text=title)
    add_h_sub(slide,  top=c.take(*blocks[2]), text=subtitle)
    add_lead(slide,   top=c.take(*blocks[3]), text=lead)
    add_meta_row(slide, top=c.take(*blocks[4]), items=meta)

    add_footer(slide, "主責教練 SOP", "— 2026 —", theme="dark")
```

### 7.2 Content with pipeline (4–5 step horizontal flow)

```python
def slide_pipeline(prs, *, kicker, headline, intro, label, steps):
    slide = prs.slides.add_slide(blank_layout)
    paint_bg(slide, COLOR_PAPER)
    add_chrome(slide, "On-Day · Coach Actions", "08 / 14", theme="light")

    c = Cursor()
    add_kicker(slide, top=c.take(Inches(0.18), label="kicker"), text=kicker)
    add_h_xl(slide,   top=c.take(Inches(0.95), label="h-xl"), text=headline)
    add_lead(slide,   top=c.take(Inches(0.65), label="lead"), text=intro)
    add_pipeline(slide,
        top=c.take(Inches(2.30), label="pipeline"),
        section_label=label,
        steps=steps,
        n_cols=len(steps))

    add_footer(slide, "Page 08 · 教練當天行動", "Witness, don't intervene", theme="light")
```

`add_pipeline` internally lays out N step cards across `CONTENT_W` with `step_h` derived from the longest step's text height. Don't fix `step_h` to a constant — let it grow to fit, and let the cursor's overflow guard catch problems.

### 7.3 Two-column comparison / concern cards

```python
def slide_two_col(prs, *, kicker, headline, intro, left, right):
    slide = prs.slides.add_slide(blank_layout)
    paint_bg(slide, COLOR_INK)
    add_chrome(slide, "First-Time Caveats · 首辦提醒", "05 / 14", theme="dark")

    c = Cursor()
    add_kicker(slide,  top=c.take(Inches(0.18)), text=kicker)
    add_h_xl(slide,    top=c.take(Inches(0.95)), text=headline)
    add_lead(slide,    top=c.take(Inches(0.55)), text=intro)
    pair_top = c.take(Inches(3.00), label="pair")
    col_w = (CONTENT_W - Inches(0.4)) / 2
    add_concern_card(slide, left=CONTENT_LEFT,            top=pair_top, w=col_w, h=Inches(2.9), data=left)
    add_concern_card(slide, left=CONTENT_LEFT + col_w + Inches(0.4), top=pair_top, w=col_w, h=Inches(2.9), data=right)

    add_footer(slide, "Page 05 · 首次辦理特別提醒", "典禮 ≠ 領導日", theme="dark")
```

Notice the pattern: `c.take(Inches(3.00), label="pair")` reserves 3.0" of vertical space for *the whole pair row*; then the two columns are placed side-by-side at that `top`. The cursor doesn't know about columns, only about row heights.

### 7.4 Observation grid (3 × 2 cards)

```python
def slide_obs_grid(prs, *, kicker, headline, intro, cards):
    assert len(cards) == 6
    slide = prs.slides.add_slide(blank_layout)
    paint_bg(slide, COLOR_PAPER)
    add_chrome(slide, "Observation · 觀察筆記", "09 / 14", theme="light")

    c = Cursor()
    add_kicker(slide, top=c.take(Inches(0.18)), text=kicker)
    add_h_xl(slide,   top=c.take(Inches(0.95)), text=headline)
    add_lead(slide,   top=c.take(Inches(0.55)), text=intro)
    grid_top = c.take(Inches(2.40), label="3x2 grid")

    col_w = (CONTENT_W - Inches(0.6)) / 3
    row_h = Inches(1.10)
    for i, card in enumerate(cards):
        col = i % 3
        row = i // 3
        x = CONTENT_LEFT + col * (col_w + Inches(0.3))
        y = grid_top + row * (row_h + Inches(0.20))
        add_obs_card(slide, left=x, top=y, w=col_w, h=row_h, data=card)

    add_footer(slide, "Page 09 · 觀察筆記六項指標", "記錄用 · 不當場評分", theme="light")
```

## 8. Common pitfalls and how the discipline catches them

| Pitfall | How the discipline catches it |
|---|---|
| Hero slide stuck to top | `hero_layout(blocks)` budgets total height and centers automatically |
| Last content block crosses footer | `Cursor.take()` raises `OverflowError` before render |
| Box bounds intrude on rail | tighten `box_h` to text height + 0.05" pad; verifier flags violations |
| Italic gone flat | `add_run(..., italic=True)` swaps to EN serif; CJK skipped |
| Footer text overlaps content | footer pinned at `FOOTER_TOP`, never routed through cursor |
| Chrome row drifts down on long titles | chrome pinned at `CHROME_TOP`, never advanced |
| Off-canvas content | `verify_layout.py` asserts `top + height ≤ CANVAS_H` |
| Mixed font fallback | always pass `font=FONT_*` constant; never let python-pptx pick |
