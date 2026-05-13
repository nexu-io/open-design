---
name: social-media-matrix-tracker-template
description: |
  社媒矩阵数据追踪面板模板（Social Media Matrix Tracker）。
  Use when users ask for a cinematic, data-dense social media analytics dashboard
  with multi-platform metrics, interactive charts, hover insights, range compare,
  and dark/light theme switching in a single HTML artifact.
triggers:
  - "social media matrix tracker"
  - "social media dashboard template"
  - "creator analytics template"
  - "live social dashboard"
  - "social analytics"
  - "content performance"
  - "TikTok analytics dashboard"
  - "Instagram analytics dashboard"
  - "YouTube analytics dashboard"
  - "multi-platform creator dashboard"
  - "社媒矩阵数据追踪面板"
  - "社媒矩阵看板模板"
  - "社交媒体数据追踪模板"
  - "新媒体数据看板"
  - "新媒体矩阵分析"
  - "内容运营数据看板"
  - "抖音数据看板"
  - "小红书数据看板"
od:
  mode: template
  platform: desktop
  scenario: live-artifacts
  featured: 1
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
  example_prompt: "Create a social media matrix tracker dashboard template using my DESIGN.md. Keep the cinematic glassmorphism style, multi-chart analytics sections, hover tooltips, pin/drag range analysis, and light/dark switching."
  capabilities_required:
    - file_write
---

# Social Media Matrix Tracker Template

Ship a premium, cinematic social-media analytics template with high data density and production-grade micro-interactions.

## Resource map

```text
social-media-matrix-tracker-template/
├── SKILL.md
├── assets/
│   └── template.html
├── references/
│   └── checklist.md
└── example.html
```

## Workflow

1. Read active `DESIGN.md` first, map tokens to CSS variables, then adapt `assets/template.html`.
2. Keep the structural information architecture intact: hero + platform matrix + KPI strip + multi-chart deep sections.
3. Preserve interaction fidelity:
   - dark/light theme toggle
   - hover tooltip on charts (auto-clamps inside viewport)
   - click-to-pin chart point
   - drag interval analysis
   - Shift+drag multi-range compare
   - insights panel live updates on every chart (line / stack / donut / geo)
   - touch + keyboard arrow-key support for line charts (a11y)
4. Ensure template remains self-contained (single HTML with inline CSS/JS, no framework dependency).
5. Keep default sample data realistic and internally consistent across cards/charts.
6. Validate with `references/checklist.md` before emitting the artifact.

### Adapting the sample data safely

`assets/template.html` ships with hand-tuned sample arrays. When swapping in real data, follow this contract so charts and insights stay coherent:

- Replace **whole arrays at once**, not individual indices — line charts assume `values[]` and `xLabels[]` are the same length and aligned by index.
- Match the existing **unit + decimals**: `hourChart` (engagements / `decimals: 0`), `slaChart` (minutes / `decimals: 0`), `roiChart` (multiplier x / `decimals: 1`), `cohortChart` (% / `decimals: 0`). Mismatched units break tooltip + A/B insight copy.
- Keep all four line series the **same length** (default 7 points). Different lengths leak into the A/B compare which expects shared indices.
- For `mixChart`, every `bars[i].stack` must remain a 3-element array (`[Video, Thread, Carousel]`). For `sentimentChart`, `arcs[]` percentages should sum to 100.
- Update KPI strip + platform card metrics in lock-step — the artifact's "Live overview" insight derives from the same numbers.
- Single-data-point datasets are guarded (drawn as a labelled dot) but degrade UX; prefer ≥ 3 points per chart when adapting.

## Output contract

Emit one short sentence before the artifact (e.g. *"Cinematic social media matrix tracker — dark theme by default, all interactions live."*) and then a single self-contained HTML artifact.

- The artifact **must** use the `<artifact>` wrapper exactly as shown below — the daemon parser keys on the wrapper element.
- `identifier="social-media-matrix-tracker"` is the canonical id (don't suffix with project name).
- `type="text/html"` and `title` are required.
- Inline CSS + JS only. No external framework / CDN. No external font imports beyond what `template.html` already declares.
- The final document is the **adapted** `template.html` (with DESIGN.md tokens applied), not a verbatim copy and not a separate `index.html`. Do not emit both.

```xml
<artifact identifier="social-media-matrix-tracker" type="text/html" title="Social Media Matrix Tracker">
<!doctype html>
<html>...</html>
</artifact>
```
