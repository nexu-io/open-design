---
name: pptx-html-fidelity-audit
description: Audit a python-pptx export against its source HTML deck, identify layout/content drift (footer overflow, cropped content, missing italic/em, lost styling, off-rhythm spacing), and re-export with strict footer-rail + cursor-flow layout discipline. Use this skill whenever the user has a .pptx that was generated from an HTML slide deck and asks to compare/audit/verify/fix the export — including phrases like "compare ppt with html", "fidelity audit", "fix the pptx", "ppt is cut off", "footer overlap", "italic missing in pptx", "re-export the deck", "pptx-html-fidelity-audit", or any case where a python-pptx → HTML round-trip needs verification or repair. Also trigger when the user shows you a deck.html and a deck.pptx side by side and is debugging visual differences.
triggers:
  - "pptx fidelity"
  - "pptx audit"
  - "ppt 跑掉"
  - "字型不對"
  - "footer overlap"
  - "verify pptx"
  - "html to pptx"
od:
  mode: utility
  scenario: engineering
---

# PPTX ↔ HTML Fidelity Audit

A repeatable workflow for catching the ways a `python-pptx` export silently drifts from its HTML source — and fixing them with a layout discipline that prevents the same regressions on the next pass.

## When this skill applies

The user has:

- A source HTML slide deck (typically a single-file deck with `<section class="slide">` blocks):

  ```html
  <section class="slide light">
    <div class="chrome">2026 · Q2 review</div>
    <span class="kicker">Pillar 03</span>
    <h2 class="h-xl">Shipping <em>velocity</em> doubled</h2>
    <p class="lead">…</p>
    <div class="foot">page 5 / 14</div>
  </section>
  ```

- A PPTX file generated from that deck via python-pptx (or similar).
- A suspicion (or visible evidence) that the PPTX doesn't match the HTML — text bleeding into the footer, italic words gone flat, hero slides not centered, sections cropped, tag styling lost.

If the user only has *one* of those two artifacts, this skill doesn't apply yet — first generate the missing one, or ask the user to provide it.

## Why this is hard (and why a skill helps)

PPTX is a fixed-canvas, absolute-positioned medium. HTML is a fluid, flow-based medium. A naive python-pptx export pins each block at hand-picked `(top, left)` coordinates, which works for the *first slide it was tested on* and silently fails for every other slide whose content has different intrinsic height. The result is the most common drift modes:

1. **Footer overflow** — content's `top + height` crosses into the footer row.
2. **Off-canvas content** — bottom of last block exceeds `7.5"` (16:9 canvas).
3. **Italic loss** — `<em>` in HTML never gets `run.font.italic = True`.
4. **Hero slides not centered** — vertical-stack slides use `MARGIN_TOP` instead of computing center.
5. **Box bounds intruding** — the text fits, but the *shape's bounding box* is oversized and visually crosses the rail.
6. **Tag/styling loss** — colored chrome rows, kicker uppercase tracking, mono-vs-serif assignments quietly fall back to defaults.

Every one of these is a *layout discipline* problem, not a content problem. Once you adopt the discipline, they stop happening.

---

## Workflow

The audit is five steps. Don't skip any of them — the discipline only works if the audit produces a real list of issues to drive the re-export. A fix-without-audit pass tends to leave half the issues alive.

### Step 1 — Extract ground truth from the PPTX

Run `scripts/extract_pptx.py <path-to.pptx> > pptx_dump.json`. The script walks every shape on every slide and dumps text, position (`top` / `left`), size (`width` / `height`), and per-run typography (font name, size pt, bold, italic, color). This is the *actual* state of the export — don't trust the export script's intent, trust the dump.

For 14-slide decks, the dump is ~30–60 KB and human-readable.

### Step 2 — Walk the HTML structure

Read the source HTML and enumerate `<section class="slide">` blocks. For each, note:

- The slide's theme (`light` / `dark` / `hero light` / `hero dark`).
- The `chrome` row text (top metadata).
- The `kicker` (small uppercase eyebrow above the headline).
- The headline (h-hero / h-xl / etc.) and any sub-head.
- The body copy and any structured blocks (pipeline steps, cards, pillars, observation cards).
- The `foot` row (bottom metadata).
- Any `<em>` or italic-styled spans — italic is the silent regression.

Map each HTML slide to a PPTX slide index. For decks following the convention "slide 1 = cover, slide N = closing", the mapping is positional.

### Step 3 — Build the audit table

For each slide, walk shapes from the dump and check against expected layout rules. Use this exact table format — the severity column is what drives the fix priority:

```
| Slide | Issue | Severity |
|---|---|---|
| 1 cover | meta-row 底端 6.95" 蓋過 footer (6.7") | 🔴 |
| 5 checklist | row B 步驟描述底端 7.2" 切到 footer | 🔴 |
| 8 3E | 收束段落直接坐在 footer 起點 | 🔴 |
| 9 on-day | step 描述底端剛好碰 footer，無安全距 | 🟠 |
| 多處 | em (Playfair italic) 未保留 | 🟡 |
```

Severity rubric:

- 🔴 **critical** — content cropped, text invisible, footer overlap, off-canvas. Must fix.
- 🟠 **high** — content visible but visual hierarchy broken, no breathing room, hero not centered. Should fix.
- 🟡 **medium** — italic/em missing, font fallback wrong, color drift. Fix in this pass.
- 🟢 **low** — minor spacing/alignment, sub-pixel offsets. Note but don't block.

After the table, write a short root-cause section: 90 % of the issues usually come from 2–3 systemic causes (e.g. "no footer rail enforced", "hero stacks pinned to MARGIN_TOP instead of centered", "italic never propagated"). Naming the systemic causes makes the re-export script much smaller and more correct.

### Step 4 — Re-export with footer-rail + cursor-flow layout discipline

This is the load-bearing technique. See `references/layout-discipline.md` for the full rules; the summary:

**Define the rails up front, once, for the whole deck:**

```python
from pptx.util import Inches

CANVAS_W       = Inches(13.333)   # 16:9
CANVAS_H       = Inches(7.5)
MARGIN_X       = Inches(0.6)
MARGIN_TOP     = Inches(0.5)
CONTENT_MAX_Y  = Inches(6.70)     # NOTHING in content area may cross this
FOOTER_TOP     = Inches(6.85)     # footer row pinned here, edge-to-edge
```

> **Customizing the rails.** The defaults above suit a 16:9 canvas with a slim footer. If your design system uses a wider footer or a 4:3 canvas, override these constants in your export script and pass the same values to `verify_layout.py` via `--content-max-y` / `--canvas-h` / `--canvas-w`. See `references/layout-discipline.md` §1 for the full constant table.


**Use a cursor for content blocks instead of pinning each block at an absolute y:**

```python
class Cursor:
    """Advances down the slide; refuses to cross the footer rail."""
    def __init__(self, y_start, cap=CONTENT_MAX_Y):
        self.y = y_start
        self.cap = cap
    def take(self, h, gap=Inches(0.12)):  # ~1 line of whitespace at 14pt; tighten/loosen per design system
        top = self.y
        self.y = top + h + gap
        if self.y > self.cap:
            raise OverflowError(
                f"cursor at {self.y} exceeds footer rail {self.cap}; "
                f"reduce block height or split slide"
            )
        return top
```

For each slide, instantiate `Cursor(MARGIN_TOP)` and `take(height)` each block in reading order. The slide refuses to render if any block would cross the rail, so overflows become loud build errors instead of silent visual bugs.

**Hero (vertically-centered) slides use a budget instead of a cursor:**

```python
def hero_layout(blocks):
    """blocks = list of (height, gap_after) tuples in reading order."""
    total = sum(h + g for h, g in blocks)
    y_start = (CANVAS_H - total) / 2
    return Cursor(y_start)
```

That single change kills "hero slide content sticks to top" — the most common hero defect.

**Tighten box height to fit text + minimal padding.** PowerPoint reveals shape bounds when they overlap (selection halos, Z-order conflicts), and an oversized box can visually cross the footer rail even when the text inside doesn't. Compute box height from text metrics + ~0.05" pad, not from generous wrappers.

**Preserve italic / em explicitly:**

```python
def add_run(p, text, font, size_pt, italic=False, bold=False, color=None):
    r = p.add_run()
    r.text = text
    r.font.name = font
    r.font.size = Pt(size_pt)
    r.font.italic = italic
    r.font.bold = bold
    if color:
        r.font.color.rgb = color
    return r
```

When walking HTML, detect `<em>` / `<i>` / inline style `font-style: italic` and pass `italic=True`. Use the EN serif face (Playfair Display, Source Serif, or fallback Georgia) for italic display copy — the CJK serif typically has no italic and looks broken if you try to italicize it.

For deeper font issues that the layout rails can't catch — variable-font traps where PowerPoint silently swaps to Calibri / Microsoft JhengHei, missing `<a:ea>` slot causing CJK runs to fall back, fake-italic on Han characters — read `references/font-discipline.md`. The five layers there cover everything `verify_layout.py` can't see.

### Step 5 — Verify post-export

After writing the new `.pptx`, run `scripts/verify_layout.py <path-to.pptx>`. The script:

- Walks every shape on every slide.
- Asserts `top + height ≤ CONTENT_MAX_Y` for content shapes (footer/page-number shapes are allowed below the rail).
- Asserts `top + height ≤ CANVAS_H` for all shapes (no off-canvas).
- Asserts `left + width ≤ CANVAS_W` and `left ≥ 0`.
- Reports violations as a single block: slide index, shape name, observed bottom, rail.

Zero violations is the gate for "this re-export is shippable". Don't claim the audit is fixed without running the verifier — the human eye misses 1–2 mm overflow at zoom-out, the script doesn't.

---

## Output to the user

After Step 5 passes, report:

1. **Audit table** — the table from Step 3.
2. **Root causes** — 1-paragraph systemic explanation.
3. **Fix list** — terse list of what was changed and why (e.g. "hero slides switched to budget centering", "all content blocks routed through Cursor", "em runs explicitly italic").
4. **Verification** — "0 rail violations across N slides, file size X KB".
5. **Path** — absolute path to the re-exported `.pptx`.

The user is reading for two reasons: confirming the visible bugs are fixed, and trusting the systemic fix is right. Cover both.

---

## Bundled resources

- `scripts/extract_pptx.py` — dump every shape on every slide as JSON. Run before the audit. **Important:** also run on the *original* export to compare, and on the *re-exported* one to confirm.
- `scripts/verify_layout.py` — post-export rail checker. Returns nonzero exit code on violations so it slots into a CI pipeline if needed.
- `references/layout-discipline.md` — the full footer-rail + cursor-flow rule set with code snippets for each common slide type (hero, content, pipeline, two-column, observation grid).
- `references/font-discipline.md` — five-layer font audit: mapping, presence, variable-vs-static traps, the three XML language slots (`latin` / `ea` / `cs`), CJK + Latin italic interaction.
- `references/audit-table-template.md` — copy-pasteable table template with severity legend.

Read the references when:

- The deck has slide types beyond what the SKILL.md covers (multi-column dashboards, embedded images, charts) → `layout-discipline.md`.
- The audit shows 🟡 typography issues — italic missing, CJK falling back, unexpected `Calibri` / `Microsoft JhengHei` in the XML → `font-discipline.md`.
- You want to drop the audit table directly into a report or markdown deliverable → `audit-table-template.md`.

---

## Anti-patterns to avoid

- **Patching individual slides without naming the systemic cause.** If you fix slide 5 by lowering its block by 0.2", you'll be back fixing slide 9, 11, and 14 next. Find the rule that produced all four problems.
- **Trusting the original export script's intent.** Always run the extractor against the actual file. Drift between intent and reality is the bug.
- **Skipping verification because "it looked fine in PowerPoint preview".** Preview anti-aliasing hides 1–2 mm overflows. The script doesn't.
- **Italicizing scripts that have no italic tradition.** CJK, Arabic, Hebrew, Devanagari, Thai, and Khmer all produce a synthesized slant when forced into `italic=True`, and the result looks mechanically deformed. Italicize *only* runs whose primary script supports italic — Latin, Cyrillic, Greek. See `references/font-discipline.md` Layer 5 for the implementation pattern.
- **Using `MARGIN_TOP` for hero slides.** Hero slides need *budget centering*, not top-anchored. This is the most common hero defect and the cheapest to fix.

---

## Why geometry-based verification, not visual diff

An earlier iteration of this skill leaned on visual diffing — render the
.pptx through Keynote → PDF → PNG, screenshot the HTML through Chrome
headless, stitch them side-by-side with `magick`. It worked, but with
three sharp drawbacks:

- **Platform lock-in.** Keynote AppleScript is macOS-only; `magick` and
  font-discovery commands vary across OSes; CI pipelines on Linux can't
  reproduce the chain.
- **Imprecision.** A 1-2 mm overflow gets anti-aliased away in a PNG
  preview. The human eye misses it; the script catches it as a hard
  numeric violation.
- **Setup cost.** Every contributor needs the full graphics toolchain
  installed before they can audit. Geometry checks need only
  `python-pptx`.

Geometry-based verification gives up one thing the visual diff is good
at: catching cases where shape positions are correct but the rendered
glyph looks wrong (font fallback, kerning bugs, missing weight). When
that case appears, fall back to a manual screenshot review — the
five-layer audit in `references/font-discipline.md` covers most of the
underlying causes.
