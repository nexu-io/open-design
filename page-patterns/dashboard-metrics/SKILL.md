---
name: dashboard-metrics
description: |
  대시보드 메트릭 페이지. KPI 카드 행, 추세 차트 영역, 최근 활동
  테이블, 우상단 프로필 링크. 디자인 시스템의 card / chart /
  typography 토큰을 따른다.
triggers:
  - "dashboard"
  - "metrics"
  - "kpi"
  - "대시보드"
  - "지표 페이지"
od:
  mode: prototype
  platform: desktop
  scenario: page-pattern
  page_type: dashboard.metrics
  page_inputs:
    - name: metrics
      kind: data
  page_outputs:
    - name: profile_link
      kind: navigation
      target_page_type: profile.user
  preview:
    type: html
    entry: index.html
  design_system:
    requires: true
    sections: [color, typography, layout, components]
  example_prompt: "대시보드 메트릭 페이지를 만들어 줘. KPI 카드 4개, 추세 차트 영역, 최근 활동 테이블, 우상단 프로필 링크 포함."
---

# Dashboard · Metrics

Produce a desktop-first metrics dashboard. Layout, in order:

1. **Page header** — page title on the left, profile-link avatar
   on the right routing to `profile.user`.
2. **KPI row** — 3–4 KPI cards in a horizontal grid. Each card
   shows a label, a large value, a delta vs. prior period, and a
   tiny inline trend hint.
3. **Chart card** — wide card titled "Trend" with a placeholder
   chart area (axis labels and a sketched line / bar shape are
   fine).
4. **Recent activity table** — compact table at the bottom listing
   the most recent events with timestamp, actor, and action.

## Output contract

Emit a single self-contained HTML document inside an `<artifact>`
tag, CSS inline, no external assets. Honor the active DESIGN.md
tokens for color / typography / card.

## Self-check

- KPI row contains 3–4 cards laid out as a horizontal grid.
- Each KPI card shows a label, value, and delta.
- Chart card has axis labels (even if the chart shape is sketched).
- Recent activity table fits under the chart and stays compact.
