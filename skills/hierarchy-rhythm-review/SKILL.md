---
name: "Hierarchy Rhythm Review"
description: "Claude design system prompt skill for Hierarchy Rhythm Review"
triggers:
  - "claude hierarchy rhythm review"
od:
  category: prompt-library
  upstream: "https://github.com/Trystan-SA/claude-design-system-prompt"
---
# Hierarchy and Rhythm Review

Review the current design for visual hierarchy and rhythm — the two qualities that most distinguish "intentional" from "AI-generated" — and fix issues found. **Hierarchy guides the eye** (what gets looked at first, second, third); **rhythm makes the design feel intentional** (repetition with strategic variation). When they're right, the design feels effortless to scan.

## Phase 1: Identify the surface

Review the HTML/CSS file the user just edited or asked about; otherwise the most recently modified design file; if unclear, ask. Read the file and its referenced styles, and note the medium (slide / page / mobile / dashboard) — the rules vary by context.

## Phase 2: Launch two review agents in parallel

Use the your autonomous sub-agent capabilities tool to launch both agents concurrently in a single message.

Instruct both agents explicitly: report every issue found, including uncertain and low-severity ones, with a confidence and severity estimate. Coverage is the agent's job; filtering happens at aggregation (Phase 3).

### Agent 1: Hierarchy review

For every screen, slide, or major section:

1. **Primary / secondary / tertiary.** What should be looked at first, second, third? If you can't tell, the hierarchy is broken.
2. **Size.** Headings visibly larger than body; primary CTA larger than secondary actions. Flag similar content at very different sizes (inconsistent) and different-importance content at similar sizes (flat).
3. **Color.** Primary actions in saturated brand color, secondary in neutral, de-emphasized in light gray. Flag everything-same-color (no signal) and unimportant-elements-brightest (wrong signal).
4. **Weight.** Headlines bold, body regular, captions light. Flag everything-bold and everything-regular.
5. **Position.** Eyes start top-left (in LTR); the most important content belongs in prime real estate. Flag primary elements buried bottom-right.
6. **Density.** Loose spacing signals "pay attention," tight signals "supporting." Flag important content crammed while filler breathes — that's reversed.
7. **The 5-second test.** A first-time user should know what to look at and what to do within 5 seconds.

### Agent 2: Rhythm review

For the document as a whole:

1. **Spacing scale.** All padding/margin/gap values snap to a consistent scale (multiples of 4px or 8px). List the implicitly-used scale and flag outliers (`padding: 7px`, `gap: 13px`).
2. **Type scale.** Flag arbitrary sizes (`17px`, `23px` in a 16/20/24 design).
3. **Repetition.** Cards in a grid, list items, feature blocks share padding, gap, sizes, structure. Flag near-duplicates that are subtly different — identical or deliberately different, nothing in between.
4. **Strategic variation.** A long page or deck breaks its pattern occasionally (background shift, wider section, centered CTA). Flag total uniformity (monotonous) and every-section-different (chaotic).
5. **Palette discipline.** 3–5 colors plus tints/shades. Flag 8+ distinct colors, or slightly different blues/grays in different places.
6. **Section structure.** Sections visually distinguishable (background change, divider, padding shift) but consistently so. Flag no separation and too many separation styles.
7. **Alignment.** Flag elements off-grid by a few pixels — inconsistent margins rather than intentional offset.

## Phase 3: Aggregate and fix

Wait for both agents, aggregate findings, then fix directly:

- Random spacing / font sizes → snap to the file's scale (define one — 4px or 8px multiples — if missing)
- Flat hierarchy → introduce contrast (bigger headlines, more prominent primary CTA, consistently neutral body)
- Reversed hierarchy → swap the signals (mute the loud unimportant element, reposition the buried primary)
- Monotony → introduce one strategic break; chaos → consolidate to the strongest pattern

For ambiguous cases, lean toward the more aggressive hierarchy — too-strong is easier to dial back than too-weak to dial up.

Summarize: issues found and fixed per category, judgment calls the user should review, open recommendations.
