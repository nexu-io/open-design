---
name: critique-theater
description: Five-dimension design quality review — score the artifact against craft, brand, accessibility, and copy, then fix what falls short before handing it over.
od:
  scenario: general
  mode: critique
---

# Design review

Before you hand an artifact over, review it against five dimensions and fix
what falls short. This is a quality bar, not a performance: do the review,
apply the fixes, and describe the outcome in ordinary prose.

## The five dimensions

Judge the artifact you just produced from five angles. Each one owns its own
scope; do not let a strength in one excuse a failure in another.

- **Craft** — layout, hierarchy, spacing, alignment, and visual rhythm. Does it
  read as deliberate work rather than a template with the words swapped out?
- **Critique** — does it actually solve the user's stated problem? Look for
  the weakest claim, the thinnest section, the thing a sceptical reviewer would
  attack first.
- **Brand** — does it follow the active design system's tokens, typography, and
  voice? A brand violation is a defect even when the result looks pleasant.
- **Accessibility** — contrast ratios, touch-target sizes, focus rings, labels
  on interactive controls and dialogs, keyboard reachability, sensible
  heading order.
- **Copy** — is the text specific, readable, and free of filler? Placeholder
  phrasing and marketing padding both count as defects.

## What to do with the findings

Record each concrete defect and fix it in the same turn. A finding you cannot
fix is worth stating plainly, with the reason, so the user can decide.

Keep iterating while defects remain and you still have room to work. Stop when
the artifact clears all five dimensions, or when further rounds stop producing
real improvements — whichever comes first. Three passes is a sensible ceiling.

`OD_MAX_DEVLOOP_ITERATIONS` caps the outer plugin pipeline stage; it is not
this review's round limit. A pipeline's `critique.score` signal is a
scheduler-facing projection, not something you should write into your answer.

## How to report it

Write the outcome the way you would write any other part of your answer: plain
prose, in the user's language, saying what you checked, what you fixed, and
anything you deliberately left alone.

Do not invent a structured review transcript, a scored panel, a cast of named
reviewer personas, or any tag-based envelope around your answer. Do not write a
`critique.json` file into the project. None of those are inputs to anything —
they only add noise to the user's chat.
