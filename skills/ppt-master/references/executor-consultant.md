# Executor Consultant — Consulting Style

> Common guidelines: executor-base.md. Technical constraints: shared-standards.md.

---

## Role Definition

A data-driven, consulting-style SVG design executor. Suitable for business analysis reports, market research, operational reviews, strategic recommendations, and other **general consulting** scenarios. Emphasizes structured information presentation and data visualization; clean, clear, and professional style.

---

## Consultant-specific Data Visualization Techniques

### 1. KPI Dashboard Design

KPI cards are the most common element in consulting reports. Standard layout (1280x720):

```
4-card layout: each card 280x180, gap 30
  Card 1: x=45,  y=160
  Card 2: x=355, y=160
  Card 3: x=665, y=160
  Card 4: x=975, y=160
```

**Card internal structure** (top to bottom):

| Area | Content | Font Size (example @ body=18px) | Style |
|------|---------|-----------|-------|
| Icon row | data-icon icon | 32x32 | Theme color |
| Metric name | "Monthly Active Users" | 14px (~0.8x body) | Gray #64748B |
| Core number | "1.2M" | 36-42px (~2x body, hero number band) | Bold, dark color |
| Trend annotation | "+12.3% vs last month" | 12px (~0.65x body, annotation band) | Green=up / Red=down |

> Px values assume the typical dense consulting baseline (`body` ≈ 18px). For a deck with a different `body` in `spec_lock.md`, apply the ratios in parentheses rather than copying the px figures.

**Trend arrow conventions**:
- Up: `arrow-trend-up` icon + green text
- Down: `arrow-trend-down` icon + red text
- Flat: horizontal line icon + gray text

### 2. Chart Color Conventions

Consulting-style charts use **monochromatic depth gradients** rather than rainbow colors:

```
Primary series:   Theme color 100% opacity
Comparison series: Theme color 60% opacity
Baseline:         #94A3B8 (gray dashed line)
Highlight:        Accent color (only for key data points)
```

### 3. Data Annotation Principles

- **Direct data labels**: Place values at the top of bar charts — no legend needed
- **Annotated trend lines**: Add text notes at key inflection points ("Policy change", "Product launch")
- **Comparison baselines**: Mark industry average / target values with gray dashed lines
- **Consistent units**: Maintain the same numeric units and precision within a chart

### 4. Table Design

Consulting reports frequently use tables for precise data:

| Design Element | Specification |
|----------------|---------------|
| Header | Dark background + white text, font-weight="bold" |
| Zebra striping | Alternate rows with `fill-opacity="0.05"` light background |
| Number alignment | Numbers right-aligned, text left-aligned |
| Highlighted row | Mark key rows with accent color `fill-opacity="0.1"` |
| Borders | Use horizontal lines only to separate rows; avoid full grid lines |

---

## Consulting-specific Layout Patterns

### MECE Decomposition Tree

Main trunk on the left, branches expanding rightward — mutually exclusive, collectively exhaustive:

```
Main metric ──┬── Branch A (45%)
              ├── Branch B (30%)
              ├── Branch C (20%)
              └── Branch D (5%)
```

- Use `<line>` to connect trunk to branches
- Each branch has a `<rect>` container + percentage annotation
- Sum must = 100% (or explicitly label "Other")

### Driver Factor Tree

Top-level metric → decomposed factors → actions. Ideal for performance attribution analysis:

```
Revenue growth 15%
  ├── Average order value +8%  → Premium product line expansion
  ├── Customer count +5%       → New channel acquisition
  └── Repurchase rate +2%      → Loyalty program optimization
```

### Left-chart Right-text (Chart Interpretation)

Core consulting report layout: chart on the left, key insights on the right:

```
Chart area: x=40, y=120, w=700, h=480
Insight area: x=780, y=120, w=460, h=480
  - Core conclusion (bold, 16px)
  - 3-5 bullet points (14px)
  - Data source (12px, gray)
```

> When `page_rhythm = breathing`, this standard layout can legitimately degenerate to **chart-dominant (2:8)**: one large chart carrying the page, one sentence of takeaway — the rhythm rule is then satisfied without adding patterns foreign to consulting style. See `executor-base.md §2.1` for the universal rhythm discipline.

---

## Professional Expression Standards

### Page Titles

Consulting-style page titles should be **assertion headlines**, not descriptive titles:

| Type | Descriptive (avoid) | Assertion (recommended) |
|------|---------------------|------------------------|
| Market | "Market Overview" | "Domestic market grows 23% YoY, significantly outpacing global average" |
| Competition | "Competitive Analysis" | "Three major competitors show clear weaknesses in channel coverage" |
| Finance | "Financial Data" | "Gross margin improved for four consecutive quarters, breaking industry ceiling" |

### Data Source Attribution

Every data-containing page must include a source note at the bottom:

```xml
<text x="40" y="700" font-size="10" fill="#94A3B8">
  Source: National Bureau of Statistics 2025 Annual Report; Internal team analysis
</text>
```

### Key Takeaway Box

Consulting-style content pages should include a **Takeaway Box** below the title:

```
Position: x=40, y=80, w=1200, h=50
Background: Light theme color (fill-opacity="0.08")
Text: 14-16px, one-sentence summary of the page's core takeaway
```

---

## Speaker Notes Style

### Narrative Tone

Consultant-style speaker notes use a **conclusion-driven** approach — state the conclusion first, then present supporting evidence. Professional, concise, and persuasive tone.

### Notes Writing Guidelines

Notes are pure spoken narration (TTS). No bracketed markers, no `Key points:` / `Duration:` lines — see [executor-base.md §8](executor-base.md#8-speaker-notes-generation-framework).

- **Conclusion first**: The first sentence of each page's notes is the core takeaway.
- **Conversational data**: 30% → "roughly one-third", 85% → "more than eight out of ten", 2.5x → "two and a half times". Spell out percentages as words when the spoken form is more natural.
- **Evidence follows immediately**: After the conclusion, provide 2-3 supporting data points or facts in flowing prose.
- **Natural transitions**: Open each page after the first with a sentence that bridges from the prior page ("Building on that scan…", "Based on those findings…").
- **Professional terminology**: Use terms like "insight", "driver", "key lever".

### Notes Example

```markdown
# 03_key_findings

Based on our market scan, we have distilled three key findings, and the most important is that the growth engine is shifting from acquisition to retention. New customer acquisition cost rose nearly forty percent year-over-year, yet improved repurchase rates contributed more than sixty percent of revenue growth. On top of that, lower-tier market growth significantly outpaces tier-one and tier-two cities, and the twenty-five to thirty-five female user segment now carries an ARPU nearly twice the overall average.
```

---

## Self-check Supplement (Consultant-specific)

- [ ] Data matches source data — no fabrication
- [ ] Every data page has a source attribution at the bottom
- [ ] Page titles are assertion-based, not descriptive
- [ ] KPI cards have trend arrows and comparison annotations
- [ ] Chart colors are unified, using monochromatic scheme rather than rainbow
- [ ] Notes are conclusion-first with conversational data
- [ ] Notes contain no bracketed stage markers and no `Key points:` / `Duration:` meta-lines (TTS reads everything verbatim)
