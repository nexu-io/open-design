---
name: critique
description: |
  Run a 5-dimension expert design review on any HTML artifact in the
  project — Philosophy / Visual hierarchy / Detail / Functionality /
  Innovation, each scored 0–10. Outputs a single self-contained HTML
  report with a radar chart, evidence-backed scores, and three lists:
  Keep / Fix / Quick-wins. Use when the brief asks for a "design
  review", "design critique", "5 维度评审", "design audit", or "what's
  wrong with my design".
triggers:
  - "critique"
  - "design review"
  - "design audit"
  - "5 维度评审"
  - "5-dim review"
  - "audit my design"
  - "review my deck"
  - "review my landing page"
  - "评审"
  - "复盘"
od:
  mode: prototype
  platform: desktop
  scenario: design
  upstream: "https://github.com/alchaincyf/huashu-design"
  preview:
    type: html
    entry: index.html
  design_system:
    requires: false
  example_prompt: "Run a 5-dimension critique on the magazine-web-ppt deck I just generated — score philosophy / hierarchy / detail / function / innovation, give me Keep / Fix / Quick-wins."
---

# Critique Skill · 5 维度专家评审

Produce a single-file HTML "design review report" that scores any
artifact across 5 dimensions and proposes actionable fixes. Inspired by
the *huashu-design* expert-critique flow.

## When to use

- After the agent (or user) generates an artifact (deck / prototype /
  landing page) and the user asks "what's wrong with this?" or
  "review this"
- As a self-check loop the agent can run on its own output **before**
  emitting it
- For comparing two variants of the same design

## What you produce

A single self-contained `<artifact type="text/html">` review report
including:

1. **Header** — what artifact was reviewed, date, reviewer ("OD ·
   Critique skill"), 1-line verdict
2. **Radar chart** (inline SVG, no library) showing the 5 scores
3. **Five dimension cards**, each with:
   - Score 0–10 (with band: 0–4 *Broken* · 5–6 *Functional* · 7–8 *Strong*
     · 9–10 *Exceptional*)
   - 1-paragraph evidence (cite specific elements / files / lines)
   - One Keep / Fix / Quick-win bullet
4. **Combined action lists** at the bottom:
   - **Keep** — what's working, don't touch
   - **Fix** — P0 / P1 issues that are visually expensive
   - **Quick wins** — 5–15 minute tweaks with disproportionate impact

## The 5 dimensions

> Each dimension is independent — a deck can be 9/10 on Innovation but
> 4/10 on Hierarchy and the report should say so plainly. Don't average
> away interesting failures.

### 1. Philosophy consistency · 哲学一致性

> Does the artifact pick a clear *direction* and stick to it through
> every micro-decision (chrome / kicker / spacing / accent)?

**Evidence to look for:**
- Is there one declared design direction (e.g. Monocle / WIRED /
  Kinfolk) or is it three styles in a trench coat?
- Does the chrome / kicker vocabulary stay in one register, or does
  page 3 say "Vol.04 · Spring" and page 7 say "BUT WAIT 🔥"?
- Are accent / serif / mono used by the same rule throughout?

**0–4** Three styles fighting each other. **5–6** One direction but
half the elements drift. **7–8** Coherent, occasional drift on edge
pages. **9–10** Every element argues for the same thesis.

### 2. Visual hierarchy · 视觉层级

> Can a stranger figure out what to read first, second, third — without
> being told?

**Evidence to look for:**
- Is the largest type clearly the most important thing on each page?
- Do mono / serif / sans roles match the information's *role* (meta /
  body / display)?
- Lots of "loud" elements competing? Or a clear primary + secondary +
  tertiary tier?

**0–4** Everything shouts. **5–6** Hierarchy works on hero pages but
breaks on body. **7–8** Clear tiers, occasional collision. **9–10** Eye
moves with zero friction.

### 3. Detail execution · 细节执行

> The 90/10 stuff — alignment, leading, kerning at large sizes, image
> framing, foot/chrome polish, edge-case spacing.

**Evidence to look for:**
- Big-stat pages: does the number sit on a baseline, or float?
- Left/right column tops aligned in `grid-2-7-5`?
- `frame-img` + caption proportions consistent across pages?
- Mono labels: same letter-spacing? same uppercase rule?
- Any orphaned `<br>` causing 1-character lines?

**0–4** Visible tape and string. **5–6** Most pages clean, 1–2
ragged. **7–8** Polished, expert eye finds 2–3 misses. **9–10**
Magazine-grade — the kind of detail that makes printed-by-hand
typographers nod.

### 4. Functionality · 功能性

> Does the artifact *work* for its intended use? Click targets, nav,
> readability at presentation distance, copy-paste-ability for code
> blocks, mobile fallback if relevant.

**Evidence to look for:**
- Deck: keyboard / wheel / touch nav all working? Iframe scroll
  fallback?
- Landing: CTA above the fold? Phone number tappable on mobile?
- Runbook: code blocks copyable, mono font, no smart quotes?
- Critical info readable from 4m away (large screen presentation)?

**0–4** Visually fine but doesn't accomplish its job. **5–6** Core
flow works, edge cases broken. **7–8** Robust through normal use.
**9–10** Defensively engineered — handles iframe / fullscreen / paste
/ print without flinching.

### 5. Innovation · 创新性

> Does this push past the median? Is there one element that makes
> people lean in?

**Evidence to look for:**
- One *unexpected* layout / motion / typographic move that wasn't
  required?
- Or 100% safe — could be any deck/landing from any agency?
- Is the innovation *earned* (matches direction) or grafted on
  (random WebGL on a Kinfolk slow-living deck)?

**0–4** Generic AI-slop median. **5–6** Competent and unmemorable.
**7–8** One memorable moment, the rest solid. **9–10** Multiple
moves you'd steal — but each one obviously serves the thesis.

## Scoring discipline (read before you score)

- **Always cite evidence** — "scored 4 because hero page mixes
  Playfair display with Inter sans on the same line" beats "feels
  inconsistent". Numbers without evidence get rejected.
- **Don't average up** — if Hierarchy is 5 because page 3 is broken,
  don't bump to 7 because pages 1 and 2 are fine. The score is the
  *worst sustained band*.
- **Don't grade-inflate** — a 7 means *strong*, not *acceptable*. If
  every score is 7+, you're not reviewing critically.
- **Innovation is allowed to be low** — 5/10 is fine for production
  deliverables. Don't punish *appropriate* conservatism.

## Workflow

### Step 1 — Acquire the artifact

Three modes:

1. **Project file** — user said "review the index.html I just made":
   open it from the project folder.
2. **Pasted HTML** — user pasted code in the chat: read it from the
   message.
3. **Generated by you in this turn** — you just emitted an artifact
   above and want to self-critique: re-read your own `<artifact>`.

If multiple HTML files exist, ask which one (don't review all).

### Step 2 — Read enough to score

Skim the entire `<style>`, then read 6–8 representative content
blocks. **Do not score from frontmatter alone.** The score depends on
*executed* design, not declared intent.

### Step 3 — Score with evidence

For each of the 5 dimensions, write the score and a 30–80 word
evidence paragraph that names specific elements. Use line numbers,
class names, page numbers.

Example:
```
Dimension: Detail execution
Score: 6 / 10
Evidence: Stat-cards on page 3 align cleanly (grid-6, 3×2), but on
page 8 the right column foot sits 2vh higher than the left because
.callout has 3vh top margin while the figure doesn't. Image captions
use mono on page 5 but sans on page 7 — pick one.
```

### Step 4 — Build the action lists

Aggregate the 5 evidence paragraphs into:

- **Keep** (3–5 bullets) — concrete things working that the user must
  not break in the next iteration. Cite by class / page / element.
- **Fix** (3–6 bullets) — must-do, ordered by *visual cost saved per
  minute spent*. Each bullet ≤ 1 sentence.
- **Quick wins** (3–5 bullets) — 5–15 minutes each, high
  signal-to-noise (e.g. "swap `display:flex` for `grid` on page 4 to
  fix the column drift").

### Step 5 — Emit the report HTML

Build a single file:

- Header: artifact name + reviewer credit + date
- Big radar chart (SVG)
- 5 dimension cards in a 1-column or 2-column grid
- Three action lists at the bottom with checkbox affordance

Use the active DESIGN.md tokens if one exists; otherwise default to a
neutral light theme (off-white background, near-black text, one accent
for radar fill).

## Output contract

```
<artifact identifier="critique-<artifact-slug>" type="text/html" title="Critique · <Artifact Title>">
<!doctype html>
<html>...</html>
</artifact>
```

One sentence before the artifact ("Reviewed X across 5 dimensions, see
report below.") and **stop after `</artifact>`** — do not paraphrase
the report in chat; the user will read the artifact.

## Hard rules

- **5 scores, every time** — partial reports (e.g. only 3 dimensions)
  are not allowed.
- **Evidence per score** — no "feels off" / "needs work". If you
  can't cite an element, the score is not justified.
- **Don't grade-inflate** — overall mean above 8 is suspicious; check
  yourself.
- **Don't review your own artifact in the same turn** — the user
  needs to see it first. Self-critique only on explicit request
  ("now critique what you just made").
- **Single-file HTML only** — no external CSS/JS. Inline everything.
- **Radar chart is mandatory** — gives the report a recognizable
  silhouette and lets the user spot weak axes at a glance.
