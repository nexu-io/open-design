# Blog traffic digest

Daily Search Console snapshot for posts on https://open-design.ai/blog/.
Refreshed by [`.github/workflows/blog-3day-report.yml`](../.github/workflows/blog-3day-report.yml)
once per day at 10:00 Asia/Shanghai.

How to read this file:

- **T-3 spotlight** lists posts published exactly three days ago. At
  T-3 the question we care about is "did Google pick it up at all" —
  so the table also shows the current URL Inspection coverage state.
- **Rolling 30-day cohort** lists every post 1–30 days old with its
  latest 3-day Search Analytics window. Sort order is impressions
  descending. This is where you spot the long-tail winners.
- GSC Search Analytics lags by ~2 days; the script clamps each
  window to end at `today − 2` so figures are stable across runs.

The file keeps the most recent 30 dated sections; older
entries are pruned automatically. Use `git log` on this file for
deeper history.

---

## 2026-05-21 — Daily blog traffic digest

### T-3 spotlight

> Posts published exactly three days ago (2026-05-18). 3-day GSC window: `2026-05-17 → 2026-05-19`.

| Post | Category | Impressions | Clicks | CTR | Position | Indexed |
|---|---|---:|---:|---:|---:|---|
| [The layout layer the canvas used to hide](https://open-design.ai/blog/layout-layer-canvas-used-to-hide/) | Community | 0 | 0 | 0.0% | — | ✓ indexed |
| [How to port a Figma workflow into an Open Design plugin](https://open-design.ai/blog/port-figma-workflow-open-design-plugin/) | Use cases | 0 | 0 | 0.0% | — | ✓ indexed |

### Rolling 30-day cohort

> Every post 1–30 days old, with its latest 3-day Search Analytics window. Totals: 92 impressions · 4 clicks · 4.3% CTR.

| Post | Age | Category | Impressions | Clicks | CTR | Position |
|---|---:|---|---:|---:|---:|---:|
| [The open-source alternative to Claude Design](https://open-design.ai/blog/open-source-alternative-to-claude-design/) | 7d | Guides | 92 | 4 | 4.3% | 8.2 |
| [The layout layer the canvas used to hide](https://open-design.ai/blog/layout-layer-canvas-used-to-hide/) | 3d | Community | 0 | 0 | 0.0% | — |
| [How to port a Figma workflow into an Open Design plugin](https://open-design.ai/blog/port-figma-workflow-open-design-plugin/) | 3d | Use cases | 0 | 0 | 0.0% | — |
| [BYOK reality check: 5 things that break in Open Design today](https://open-design.ai/blog/byok-reality-check-5-things-that-break/) | 7d | Guides | 0 | 0 | 0.0% | — |
| [31 skills, 72 systems: how the Open Design library works](https://open-design.ai/blog/31-skills-72-systems-how-the-library-works/) | 8d | Guides | 0 | 0 | 0.0% | — |
| [BYOK design workflow: run Claude, Codex, or Qwen on your own key](https://open-design.ai/blog/byok-design-workflow-claude-codex-qwen/) | 8d | Guides | 0 | 0 | 0.0% | — |
| [Why we built Open Design as a skill layer, not a product](https://open-design.ai/blog/why-we-built-open-design-as-a-skill-layer/) | 8d | Product | 0 | 0 | 0.0% | — |
