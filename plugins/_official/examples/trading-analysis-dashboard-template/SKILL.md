---
name: trading-analysis-dashboard-template
description: |
  Professional trading analysis dashboard template (single-file HTML) with
  light/dark theme switch, dense market panels, chart interactions, demo/live
  playback, and command palette behavior.
  Use when users ask for a Wall-Street-style analytics terminal, trading cockpit,
  or high-tech financial dashboard template with realistic data layout.
triggers:
  - "trading analysis dashboard template"
  - "wall street dashboard template"
  - "financial terminal template"
  - "trading cockpit template"
  - "交易分析面板模板"
  - "华尔街风格看板"
  - "高科技金融 dashboard 模板"
od:
  mode: template
  platform: desktop
  scenario: live-artifacts
  preview:
    type: html
    entry: index.html
    reload: debounce-100
  design_system:
    requires: true
    sections: [color, typography, layout, components]
  outputs:
    primary: index.html
    secondary:
      - template.html
      - example.html
  example_prompt: "Create a Wall-Street-grade trading analysis dashboard template with a left rail, risk cockpit, market charts, live/demo mode, and realistic dense data. Keep it single-file HTML."
  capabilities_required:
    - file_write
---

# Trading Analysis Dashboard Template

Produce a premium, data-dense, Wall-Street style trading dashboard as a self-contained HTML artifact.

## Resource map

```text
trading-analysis-dashboard-template/
├── SKILL.md
├── assets/
│   └── template.html
├── references/
│   └── checklist.md
└── example.html
```

## Workflow

1. Read active `DESIGN.md`, then map typography/color/layout into CSS variables.
2. Copy `assets/template.html` to `index.html`.
3. Personalize headings, instrument names, and numeric labels to the user brief.
4. Preserve interaction fidelity:
   - Light/Dark mode switch
   - Live/Demo mode
   - Chart hover crosshair and tooltip
   - Click-to-focus chart (floating modal style)
   - Keyboard command palette (`/`)
5. Keep output single-file HTML (inline CSS + inline JS, no framework dependency).
6. Keep placeholders honest (`—` or neutral labels) where real numbers are unknown.
7. Validate against `references/checklist.md` before emitting.

## Output contract

One sentence before artifact, then:

```xml
<artifact identifier="trading-analysis-dashboard" type="text/html" title="Trading Analysis Dashboard">
<!doctype html>
<html>...</html>
</artifact>
```
