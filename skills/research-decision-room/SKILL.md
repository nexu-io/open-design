---
name: research-decision-room
description: |
  Turn messy user research notes, interviews, support tickets, surveys, and product
  context into an evidence-backed decision room: a single HTML artifact with an
  evidence ledger, theme map, confidence heatmap, opportunity matrix, decision
  memo, and experiment queue. Use when teams need to move from qualitative
  signals to product or design decisions without fabricating certainty.
triggers:
  - "research decision room"
  - "user research synthesis"
  - "research synthesis dashboard"
  - "evidence-backed product decision"
  - "interview synthesis"
  - "opportunity solution tree"
  - "usability findings dashboard"
  - "qualitative research board"
od:
  mode: prototype
  platform: desktop
  scenario: research
  preview:
    type: html
    entry: index.html
    reload: debounce-100
  design_system:
    requires: true
    sections: [color, typography, layout, components]
  craft:
    requires: [typography, color, accessibility-baseline, anti-ai-slop]
  inputs:
    - name: research_material
      type: string
      required: true
      description: "Interview notes, tickets, survey excerpts, analytics notes, or a product decision brief"
    - name: decision_scope
      type: string
      required: false
      description: "The product/design decision the team needs to make"
  outputs:
    primary: index.html
  example_prompt: "Synthesize 8 interview notes, 24 support tickets, and recent activation metrics into a research decision room for whether a project-management app should add an onboarding checklist or contextual inline tips."
  capabilities_required:
    - file_write
---

# Research Decision Room Skill

Create a single-page HTML decision artifact that helps a product or design team
turn messy evidence into a clear next move. The output is not a decorative
research deck. It is a working room for debate: evidence, themes, confidence,
tradeoffs, and recommended experiments stay visible together.

## Resource map

```text
research-decision-room/
├── SKILL.md
├── example.html
└── references/
    ├── checklist.md
    └── evidence-model.md
```

Read `references/evidence-model.md` before synthesis and run
`references/checklist.md` before emitting the artifact.

## When to use this skill

Use this skill when the user has any mix of:

- Interview notes, usability-test observations, support tickets, sales call notes,
  app-store reviews, NPS comments, survey open text, analytics snippets, or
  product-decision context.
- A decision that needs evidence: "Should we build X?", "Which onboarding path
  should we try?", "Why are users dropping off?", "What do customers actually
  mean by slow?"
- A need to share findings with stakeholders who will not read a long research
  report.

Do not use it for pure visual inspiration, campaign ideation, or brand moodboards.

## Workflow

### Step 1 - Establish the decision frame

Identify the decision scope from the user's prompt. If the user did not give a
decision, derive one from the evidence and label it as inferred.

Write a short frame with:

- Decision question.
- Audience or segment.
- Time horizon.
- Known constraints.
- What this artifact will not decide.

If key context is missing and the task is not blocked, proceed with labelled
assumptions instead of asking a broad question.

### Step 2 - Build the evidence ledger

Normalize every useful signal into ledger rows using the model in
`references/evidence-model.md`.

Each ledger row must include:

- `id`: short stable id, such as `I-03`, `T-14`, `M-02`.
- `source_type`: interview, usability, support, survey, analytics, sales, field
  note, or stakeholder.
- `segment`: user type or "unknown".
- `signal`: one-sentence observation.
- `quote_or_metric`: direct quote, metric, or "not provided".
- `strength`: strong, medium, or weak.
- `limitations`: why this evidence may be biased or incomplete.

Never invent quotes, participant counts, dates, revenue impact, or metrics. If
the user did not provide a number, use "not provided" and explain what evidence
would increase confidence.

### Step 3 - Synthesize themes and tensions

Cluster evidence into 4 to 6 themes. For each theme:

- Name the theme in plain human language.
- List the evidence ids that support it.
- Explain the behavior behind it, not just the UI complaint.
- Mark confidence as high, medium, or low.
- Note contradictions or segment differences.

Prefer verbs over nouns: "Teams abandon setup when the first blank state asks
for too much" is better than "Onboarding problem".

### Step 4 - Score opportunities

Create an opportunity matrix with 3 to 5 options. Score each option on a 1 to 5
scale:

- Evidence strength.
- User pain.
- Business leverage.
- Implementation risk, where 5 means low risk and 1 means high risk.

Show the total score, but do not let the score replace judgment. Add one sentence
on why the top recommendation wins.

### Step 5 - Draft the decision memo

Write a decision memo with:

1. Recommended move.
2. Why now.
3. What evidence supports it.
4. What could be wrong.
5. What to measure next.
6. Reversible next step.

Keep the memo short enough to read in under one minute.

### Step 6 - Create the HTML artifact

Produce a self-contained `index.html`. Use the active `DESIGN.md` for typography,
spacing, color roles, and component tone, but keep the information architecture
stable:

1. Header with decision question, confidence, and last-updated label.
2. Executive readout with recommendation, risk, and next experiment.
3. Evidence ledger with filter chips.
4. Theme map with evidence ids and confidence.
5. Opportunity matrix.
6. Decision memo.
7. Experiment queue with owner, metric, and success threshold.
8. Assumptions and limitations.

The artifact should be interactive but durable. Simple vanilla JavaScript is
allowed for filtering evidence, switching views, or highlighting related ids.
No framework dependency is required.

### Step 7 - Self-check and emit

Run the checklist. Then emit one concise orientation sentence and one HTML
artifact:

```xml
<artifact identifier="research-decision-room" type="text/html" title="Research Decision Room">
<!doctype html>
<html>...</html>
</artifact>
```

Nothing after the closing `</artifact>`.
