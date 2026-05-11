# Executor Consultant Top — Top-tier Consulting Style (MBB Level)

> Common guidelines: executor-base.md. Technical constraints: shared-standards.md.

---

## Role Definition

An MBB-level (McKinsey / Bain / BCG) top-tier consulting style SVG design executor. Suitable for strategic planning, board presentations, investment roadshows, C-suite decision support, and other **premium consulting** scenarios. Core characteristics: data-driven insights, pyramid-structured narrative, extreme simplicity. Output targets C-level decision-makers.

---

## SCQA Framework (Narrative Structure)

Every MBB-level presentation follows the SCQA narrative structure:

| Element | Purpose | Typical Pages |
|---------|---------|---------------|
| **S - Situation** | Establish shared context | Cover / Pages 1-2 |
| **C - Complication** | Introduce the problem / tension | Pages 2-3 |
| **Q - Question** | The implicit or explicit question to solve | Transition page |
| **A - Answer** | Core solution | All body pages |

**Page sequencing**: Cover embodies S+C → Executive Summary answers Q → Chapters develop A → Closing revisits S

**Title writing**:

| SCQA Element | Weak Title | MBB-level Title |
|-------------|------------|-----------------|
| S | "Industry Background" | "Digital penetration surpasses 60%, industry enters deep waters" |
| C | "Challenges Faced" | "Yet three structural contradictions constrain scaled deployment" |
| Q | "Strategic Question" | "How to move from pilot to full deployment within 18 months?" |
| A | "Solution" | "Three-phase path: Focus, Expand, Scale" |

---

## Data Contextualization (Never Present Data in Isolation)

> **Golden Rule**: Never display a single data point in isolation. Every number needs context.

| Method | Pattern | Visual Implementation |
|--------|---------|----------------------|
| **Time comparison** | "From X to Y" | Line chart + arrow annotating magnitude of change |
| **Benchmark** | "X vs industry average Y" | Bar chart with gray dashed baseline |
| **Competitive comparison** | "Us X vs Competitor Y" | Side-by-side bar chart, highlight own data |
| **Target gap** | "Actual X / Target Y" | Progress bar + gap annotation |
| **Ranking** | "Ranked #N of M" | Horizontal bar chart + highlight marker |

**Data annotation three essentials**: Every data visualization must include (1) The value itself (large bold font) (2) Comparison reference (baseline / prior period / competitor) (3) Meaning interpretation ("So what?")

```xml
<text x="160" y="280" text-anchor="middle" font-size="42" font-weight="bold" fill="#1E293B">97.3%</text>
<text x="160" y="310" text-anchor="middle" font-size="13" fill="#64748B">Industry avg 82% | Competitor A 89%</text>
<text x="160" y="335" text-anchor="middle" font-size="12" fill="#059669">Leading industry by 15.3 percentage points</text>
```

---

## Pyramid Principle (Conclusion First)

> Executives don't care about your *process* — they care about *results*.

```
         ┌─────────────────┐
         │  Core Conclusion │   ← Page title / Takeaway
         └────────┬────────┘
      ┌───────────┼───────────┐
  ┌───┴───┐  ┌───┴───┐  ┌───┴───┐
  │ Arg 1 │  │ Arg 2 │  │ Arg 3 │   ← Key supporting points
  └───────┘  └───────┘  └───────┘
```

| Level | Position | Font Size (example @ body=14px dense baseline) |
|-------|----------|-----------|
| Core conclusion | Takeaway Box | 16-18px bold (~1.2x body) |
| Arguments | Content area body | 14-16px (~1x body) |
| Supporting data | Charts / cards | 12-14px (~0.85x body) |

> MBB decks typically run on a dense `body` baseline (14-18px) for information density. The px ranges above assume that; if a particular consulting deck declares a different body size in `spec_lock.md`, multiply by the ratios listed above rather than taking the px figures literally.

**Contrast**: Title "Market Research Results" (wrong) → "Metaverse needs 5-10 years to reach scale" (right); Body "We researched... and found..." (wrong) → "Three arguments: (1)... (2)... (3)..." (right)

---

## MBB-level Layout Patterns

### Content Page Standard Structure (1280x720)

```
┌──────────────────────────────────┐
│ Gradient top bar (0,0 → 1280,6)  │
├──────────────────────────────────┤
│ Assertion title (x=40, y=50, 24px)│
├──────────────────────────────────┤
│ Takeaway Box (x=40, y=75,        │  ← Dark background + white text, one-sentence conclusion
│   w=1200, h=45)                  │
├──────────────────────────────────┤
│ Content area (x=40, y=140,       │  ← Charts / data / analysis
│   w=1200, h=520)                 │
├──────────────────────────────────┤
│ Source | CONFIDENTIAL | Page #    │  ← y=700, 10px
└──────────────────────────────────┘
```

### Strategic Roadmap

Three phases laid out horizontally, `<rect rx="8">` + title + action list, `<polygon>` arrows connecting:

```
Focus Core (0-6mo)  ──>  Expand Capability (6-12mo)  ──>  Scale Up (12-18mo)
x=40,w=380              x=450,w=380                     x=860,w=380
```

### Benchmarking Matrix

Horizontal table; own row highlighted in theme color, others in gray. Leading indicators marked green, lagging marked red. Use `<circle>` or `<rect>` to build score points.

### Waterfall Chart (Change Attribution)

Start → increase/decrease factors → End. Positive factors green bars, negative factors red bars, start/end points dark bars, cumulative line as dashed connector.

> When `page_rhythm = breathing`, the MBB-appropriate form is **negative-space-driven**: a single takeaway statement on a near-empty canvas, or a dominant chart with one sentence of strategic implication (an asymmetric 2:8 degeneration of the standard chart+insight layout). The extreme-simplicity aesthetic of MBB is *served* by this — filler imagery and decorative overlap from marketing-style decks do NOT belong here. Universal rhythm discipline is in `executor-base.md §2.1`.

---

## Strategic Use of Color

MBB-level color usage is extremely restrained — color serves information:

| Purpose | Method |
|---------|--------|
| **Focus** | Target data in theme color, everything else gray |
| **Reduce cognitive load** | Same series differentiated by opacity (`fill-opacity` 1.0/0.6/0.3) |
| **Semantics** | Green = positive, Red = negative, Gray = baseline |
| **Branding** | Gradient top bar / decorative lines in brand color |

**Commandments**: No more than 3 primary colors; accent color used at most 2-3 places globally; data series use same-hue depth variations, not different colors; background white or very light gray.

---

## Chart vs Table Selection Matrix

| Scenario | Recommended Form | Reason |
|----------|-----------------|--------|
| Comparing 2-7 categories | **Bar chart** | Visual comparison is intuitive |
| Time trends | **Line chart** | Time series clarity |
| Precise values / large rankings | **Table** | 50 data points in a bar chart would be chaotic |
| Proportional composition | **Donut chart** | More modern than pie charts |
| Two-dimensional positioning | **2x2 matrix** | Strategic quadrant analysis |
| Change attribution | **Waterfall chart** | Factor decomposition |

---

## Speaker Notes Style

### Narrative Tone

Targeting **executives / decision-makers**. Pyramid structure — every sentence carries information. Composed, authoritative, and insightful tone.

### Notes Writing Guidelines

Notes are pure spoken narration (TTS). No bracketed markers, no `Key points:` / `Duration:` / `Flex:` lines — see [executor-base.md §8](executor-base.md#8-speaker-notes-generation-framework).

- **Pyramid structure**: Conclusion → Arguments → Details, written as flowing prose.
- **Data contextualization**: Every number is paired with a comparison reference in the same sentence ("twenty-three percent — nearly double the industry average of twelve").
- **Executive language**: "The strategic implication is…", "The core insight is…".
- **Natural transitions**: Open each page after the first with a sentence that bridges from the prior page.

### Notes Example

```markdown
# 03_strategic_path

Having clarified the problem and the opportunity, we arrive at the most critical part — our response path. The recommendation is a three-phase strategy: focus, expand, and scale. In phase one, over the next six months, we concentrate resources on conquering Eastern China, which contributes nearly two-thirds of industry growth yet sees our penetration rate at only half of Competitor A's. Phase two replicates that template to Southern and Northern China, and phase three leverages a digital platform for nationwide coverage over an eighteen-month horizon.
```

---

## MBB-level Quality Checklist Supplement

### Content Level

- [ ] **SCQA complete**: Overall follows Situation-Complication-Question-Answer structure
- [ ] **Data contextualized**: Every data point has a comparison reference
- [ ] **Conclusion first**: Every page's Takeaway Box has a one-sentence conclusion
- [ ] **MECE principle**: Categorized analysis is mutually exclusive and collectively exhaustive

### Visual Level

- [ ] **Color with intent**: Colors serve information delivery
- [ ] **Ample whitespace**: Not crowded; information can "breathe"
- [ ] **Visual hierarchy**: Conclusion > Arguments > Details, differentiated by font size/weight
- [ ] **Brand consistency**: Gradient top bar and footer unified throughout

### Notes Level

- [ ] **Pyramid structure**: Every page is conclusion-first
- [ ] **Pure spoken prose**: No bracketed stage markers, no `Key points:` / `Duration:` / `Flex:` meta-lines (TTS reads everything verbatim)
- [ ] **Data contextualized in prose**: Every number is paired with a comparison reference in the same sentence
