---
name: weekly-update
en_name: "Run a Metrics Standup like a Data-Driven Ops Lead"
zh_name: "像数据驱动的运营负责人一样开指标站会"
description: |
  Open Design's weekly metrics standup: this week's numbers, the one anomaly, and the single decision it forces. Built as a decision-grade data & finance deck for ops & growth team.
en_description: |
  Open Design's weekly metrics standup: this week's numbers, the one anomaly, and the single decision it forces. Built as a decision-grade data & finance deck for ops & growth team.
zh_description: |
  像数据驱动的运营负责人一样开指标站会——一份可商业交付的数据财务 Deck，围绕真实主题、证据链与决策目标组织。
tags:
  - "data-finance"
  - "product-analytics-deck"
  - "finance"
  - "kpi"
  - "metrics"
  - "decision-deck"
  - "commercial-slide-agent"
  - "weekly-update"
triggers:
  - "product-analytics-deck"
  - "data-finance"
  - "Run a Metrics Standup like a Data-Driven Ops Lead"
  - "像数据驱动的运营负责人一样开指标站会"
  - "kpi"
  - "finance"
  - "metrics"
  - "html deck"
  - "html slides"
od:
  mode: deck
  preview:
    type: html
    entry: index.html
  design_system:
    requires: true
    sections: [color, typography, layout, components]
  category: "data-finance"
  scenario: "finance"
  example_prompt: "Create \"Run a Metrics Standup like a Data-Driven Ops Lead\" as a decision-grade Data, KPI & finance deck in this template's own visual system. Subject: Open Design's weekly metrics standup: this week's numbers, the one anomaly, and the single decision it forces. Audience: ops & growth team. First ask only for missing essentials: audience, decision target, source-of-truth materials, deadline, and must-keep numbers. Then produce the slide plan, written slides, visual direction, speaker-ready structure, and a critic pass against this rubric: does every chart have a decision above it."
---

# Weekly Update Deck Skill

Produce a single-file horizontal-swipe HTML deck for a weekly team update.

## Workflow

1. Read DESIGN.md.
2. Identify squad name, week range, and audience (squad-internal vs cross-functional).
3. Slides:
   1. Cover (squad + week + author + date)
   2. Headline (one sentence + one number that matters this week)
   3. What shipped (3–5 items, link-style affordance)
   4. In flight (3–5 items, owner avatars)
   5. Blocked (1–3 items + clear ask)
   6. Metrics that matter (1–2 inline charts)
   7. Asks for next week (named owners)
   8. Closing + thanks
4. Arrow keys or click navigation. Each slide is 100vw wide.

## Output contract

```
<artifact identifier="weekly-update-w42" type="text/html" title="Weekly Update — Growth · W42">
<!doctype html>...</artifact>
```
