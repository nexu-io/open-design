---
name: orbit-linear
description: |
  A Linear-flavored morning briefing for Open Orbit — when the user has
  only connected Linear, render the day's issue / cycle / project
  changes in a layout that feels like Linear's native Inbox or My
  Issues view. Use when the brief asks for a "Linear briefing", "issue
  digest", "cycle summary", or any daily summary scoped to a single
  Linear source.
triggers:
  - "linear briefing"
  - "linear digest"
  - "issue digest"
  - "linear 简报"
  - "issue 汇总"
od:
  mode: prototype
  platform: desktop
  scenario: orbit
  featured: 4
  preview:
    type: html
    entry: index.html
  design_system:
    requires: false
  example_prompt: "Linear 风格的 Orbit 早安简报：还原 Linear 深色界面——顶部窄 toolbar + 三栏布局（左 nav: Inbox / My issues / Active / Backlog；中: issue 列表按状态分组；右: 选中 issue 的预览面板）。Inter 字体，深色 #0E0E10 背景，状态用彩色圆点（Backlog 灰 / Todo 黄 / In Progress 蓝 / In Review 紫 / Done 绿）。顶部右侧带 Cycle 进度条。"
---

# Orbit · Linear Briefing

Single-connector Orbit template scoped to Linear. Renders the day's
issue movement, cycle progress, and assignments in Linear's native
ultra-compact dark-first visual language.

## Layout

- Narrow top toolbar: breadcrumb `Orbit / Daily Digest / May 6` + view switcher
- Cycle progress strip: `Cycle 12 · 60% complete · 3 days left`
- Three columns:
  - **Left nav** — Inbox / My issues / Active / Backlog / All
  - **Main** — issue list grouped by status:
    - "Needs your attention" (assigned, stale, high-priority)
    - "Updated yesterday" (status changes, completions)
  - **Right preview** — selected issue with description / activity / labels / cycle

## Style

- Inter, dark-first canvas `#0E0E10`
- Tight rows, ~32px line height, almost no whitespace
- Status dots: Backlog gray / Todo yellow / In Progress blue / In Review purple / Done green
- Priority: 4-bar Linear icon
- Hover state visible on at least one row
- Bottom-right hint: `Open Orbit · auto-generated 06:42`
