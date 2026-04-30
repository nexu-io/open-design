---
name: critique
description: |
  Run a 5-dimension expert design review on any HTML artifact in the
  project: philosophy consistency, visual hierarchy, detail execution,
  functionality, and innovation. Outputs a single self-contained HTML
  report with a radar chart, evidence-backed scores, and three lists:
  Keep, Fix, and Quick wins. Use when the brief asks for a design review,
  design critique, design audit, or asks what is wrong with a design.
triggers:
  - "critique"
  - "design review"
  - "design audit"
  - "5-dimension review"
  - "audit my design"
  - "review my deck"
  - "review my landing page"
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
  example_prompt: "Run a 5-dimension critique on the magazine-web-ppt deck I just generated. Score philosophy, hierarchy, detail, function, and innovation, then give me Keep, Fix, and Quick wins."
---

# Critique Skill

Produce a single-file HTML design review report that scores any artifact
across five dimensions and proposes actionable fixes.

## When To Use

- After the agent or user generates a deck, prototype, landing page, or HTML artifact.
- When the user asks what is wrong, what to improve, or how professional the result is.
- As a self-check loop before delivering a high-stakes design artifact.
- For comparing two variants of the same design.

## Required Output

Create one self-contained HTML report with:

1. Header: reviewed artifact, date, reviewer, and a one-line verdict.
2. Radar chart: inline SVG, no external chart library.
3. Five dimension cards:
   - Score from 0 to 10.
   - Evidence paragraph that cites concrete elements, files, or visible details.
   - One Keep, Fix, or Quick win recommendation.
4. Combined action lists:
   - Keep: what is working and should remain stable.
   - Fix: highest-impact issues.
   - Quick wins: small changes with strong visible upside.

## Review Dimensions

### 1. Philosophy Consistency

Does the artifact pick a clear direction and stick to it through every
micro-decision: chrome, labels, spacing, type roles, accent color, and motion?

### 2. Visual Hierarchy

Can a stranger understand what to read first, second, and third without being
told?

### 3. Detail Execution

Evaluate alignment, rhythm, image framing, edge-case spacing, line length,
caption treatment, and final polish.

### 4. Functionality

Does the artifact work for its intended use? Check click targets, navigation,
readability, responsive behavior, export behavior, and copy-paste safety for
code-heavy artifacts.

### 5. Innovation

Does the design push past the median with an earned, memorable move? Reward
originality only when it supports the stated direction.

## Scoring Discipline

- Always cite evidence. Numbers without evidence are not useful.
- Do not average away sustained failures.
- Do not inflate scores. A 7 means strong, not merely acceptable.
- Innovation may be low for conservative production work without making the
  artifact bad.

## Workflow

1. Acquire the artifact from a project file, pasted HTML, or the current turn's
   generated output.
2. Inspect the design as a viewer first, then inspect the implementation.
3. Score each dimension independently.
4. Write the HTML report with embedded CSS and inline SVG only.
5. End with the three action lists.

## Output Contract

Emit a complete HTML artifact:

```html
<artifact identifier="design-critique" type="text/html" title="Design Critique">
<!doctype html>
<html>...</html>
</artifact>
```
