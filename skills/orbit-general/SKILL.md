---
name: orbit-general
description: |
  Open Orbit briefing skill — selected by the Orbit pipeline when the
  user has two or more connectors connected. Pulls the past 24 hours of
  activity from every authenticated connector (GitHub, Figma, Linear,
  Notion, Slack, 飞书, Calendar, Gmail, Drive, Sentry, Vercel, …) and
  renders a single adaptive bento-grid dashboard at the top of "我的
  设计". Each connector module picks its own UI form (list, avatar
  stack, status ring, heatmap, file grid, alert card, …) based on the
  data shape it returns, so the layout scales as Orbit's connector
  ecosystem grows. This skill should not be triggered manually — it is
  invoked by Orbit's daily-digest scheduler against the user's live
  connector data.
triggers:
  - "orbit"
  - "daily digest"
  - "morning briefing"
  - "早安简报"
  - "每日简报"
  - "跨工具汇总"
od:
  mode: prototype
  platform: desktop
  scenario: orbit
  featured: 1
  preview:
    type: html
    entry: index.html
  design_system:
    requires: false
  example_prompt: "Orbit 触发本 skill：用户已连多个 connector，从所有已连源（GitHub / Figma / Linear / Notion / 飞书 / Calendar / …）拉过去 24h 的与我相关的变更，渲染成一份 editorial bento dashboard。Hero 早安 + 5 KPI + 今日时间轴 + Top 3 + 12–16 个 connector 模块（每个按数据特性自由选 UI 形式：列表 / 头像栈 / 状态环 / 热力图 / 文件网格 / 警报卡 …）+ People waiting + Footer。米白底 + 衬线 KPI + 强调橙。"
---

# Orbit General Briefing

Cross-connector morning briefing for Open Orbit. Sits at the top of
"我的设计" once a day; aggregates the past 24h of activity from every
connected connector into one bento surface.

## Connector → UI mapping

| Family        | Examples                       | UI                                    |
|---------------|--------------------------------|---------------------------------------|
| Code collab   | GitHub, GitLab                 | List + status pills + diff preview    |
| Design collab | Figma, Sketch                  | Thumbnail + comment quote card        |
| Task mgmt     | Linear, Jira, Asana            | Status dot list + cycle ring          |
| Comms         | Gmail, Slack, 飞书 IM          | Avatar + quote summary                |
| Knowledge     | Notion, Confluence, 飞书 Doc   | Doc card + paragraph snippet          |
| Time          | Calendar                       | Horizontal timeline                   |
| Alerts        | Sentry, Datadog                | Big red number + 7-day heatmap        |
| Status        | Vercel, GitHub Actions         | Status indicator + recent builds      |
| Files         | Drive, Dropbox                 | Filename list + thumbnails            |
| Board         | Trello, Miro                   | Compact kanban + card chips           |

Unknown connectors fall into the closest family by data shape.

## Required scaffolding

1. Hero — `☀ 早安, {name} · YYYY 年 M 月 D 日 · 星期X`
2. KPI strip — five big serif numbers
3. Today's timeline — 09:00→19:00 with meeting blocks + deep-work hints
4. Top 3 priorities — three equal tiles with 96px serial numerals
5. Connector modules — adaptive Bento, varies in size and form
6. People waiting on you — overlapping circular avatars
7. Footer — `Open Orbit · auto-generated 06:42 · N connectors`

## Style

- 1440px wide, off-white `#FAF7F2` canvas, white cards
- 1px `#EAE5DD` borders, no shadows, no gradients
- Cormorant Garamond (KPI / numerals / hero) + Inter (body)
- `#1A1816` ink, `#6B6660` muted, `#D86A47` accent
- `#2E7D5B` ok / `#C9982E` waiting / `#C0473A` alert
- Connector icons: monochrome line SVG. Never emoji.

## Forbidden

- Modules all looking identical
- Lorem ipsum
- Alert connectors rendered as plain lists
- Time connectors rendered as plain text
