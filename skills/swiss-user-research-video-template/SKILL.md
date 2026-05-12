---
name: swiss-user-research-video-template
description: |
  Swiss-style user-research narrative template in warm-paper editorial aesthetics.
  Use when users ask for a premium research deck or story-first live artifact with
  minimalist typography, high-clarity layout, subtle motion, donut breakdowns,
  and keyboard/click navigation across slides in a single HTML file.
triggers:
  - "swiss user research template"
  - "editorial research deck template"
  - "minimal user research slides"
  - "warm paper swiss style"
  - "research synthesis template"
  - "瑞士风用户研究模板"
  - "高级调性研究汇报"
od:
  mode: template
  surface: video
  type: hyperframes
  platform: desktop
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
  example_prompt: "Create a Swiss-style user research synthesis deck with premium minimalist typography, warm paper tone, a participant donut breakdown, and subtle editorial interactions."
  capabilities_required:
    - file_write
---

# Swiss User Research Video Template

A premium Swiss-editorial user research template for narrative-heavy live artifacts.
The visual language is warm paper, strict spacing rhythm, thin rules, and restrained
micro-interactions that keep attention on the story.

## Resource map

```text
swiss-user-research-video-template/
├── SKILL.md
├── assets/
│   └── template.html
├── references/
│   └── checklist.md
└── example.html
```

## Workflow

1. Read `DESIGN.md`, then map tokens to the template CSS variables (`--paper`, `--ink`, `--muted`, rule colors, segment colors) without changing layout semantics.
2. Start from `assets/template.html`; keep the three-slide structure:
   - title / framing
   - participant breakdown donut
   - behavioral pattern + evidence panel
3. Preserve interactions:
   - click/keyboard slide navigation (`ArrowLeft`/`ArrowRight`)
   - bottom pagination dots with active state
   - donut legend hover highlight
   - subtle line-draw and panel-lift transitions
4. Keep all data realistic and internally consistent between copy, donut labels, and percentages.
5. Keep HTML self-contained (inline CSS/JS), with no external framework dependencies.
6. Validate using `references/checklist.md` before output.

## Output contract

Emit one concise orientation sentence and then a single HTML artifact:

```xml
<artifact identifier="swiss-user-research-deck" type="text/html" title="Swiss User Research Synthesis">
<!doctype html>
<html>...</html>
</artifact>
```
