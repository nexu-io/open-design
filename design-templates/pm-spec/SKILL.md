---
name: pm-spec
description: |
  Product spec / PRD as a single page — problem, success metrics, scope,
  user stories, design notes, rollout plan, open questions. Use when the
  brief mentions "PRD", "spec", "product spec", "feature brief", or "需求文档".
triggers:
  - "prd"
  - "spec"
  - "product spec"
  - "feature brief"
  - "feature doc"
  - "需求文档"
od:
  mode: prototype
  platform: desktop
  scenario: product
  preview:
    type: html
    entry: index.html
  design_system:
    requires: true
    sections: [color, typography, layout, components]
  example_prompt: "Write me a PRD for adding two-factor auth to our SaaS app — problem, scope, milestones, open questions."
---

# Product Spec Skill

Produce a one-page product spec / PRD.

## Workflow

1. Read the active DESIGN.md.
2. Identify the feature + audience from the brief.
3. Layout:
   - Header strip: title, status pill (Draft / Review / Approved), date, owner.
   - Three-line summary at the top — what, who, why now.
   - "Problem" panel with one paragraph and a quote from a customer or
     internal partner.
   - "Goals & non-goals" two-column block.
   - "Success metrics" table with metric / target / measurement.
   - "User stories" list with as-a / I-want / so-that format.
   - "Scope" milestone tracker (3–4 phases).
   - "Open questions" with assignee chips.
4. One inline `<style>`, semantic HTML, accent used twice max.

## Output contract

```
<artifact identifier="spec-name" type="text/html" title="Spec Title">
<!doctype html>...</artifact>
```
