---
name: orbit-linear
description: |
  Open Orbit briefing skill — selected by the Orbit pipeline when
  Linear is the user's only connected connector, or when the user
  explicitly scopes their daily digest to Linear. Pulls the past 24
  hours of issue movement, status changes, assignments, and cycle
  progress from the user's authenticated Linear connection and renders
  the digest in Linear's native Inbox + cycle-progress dark visual
  language. This skill should not be triggered manually — it is invoked
  by Orbit's daily-digest scheduler against live Linear data.
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
  example_prompt: "Orbit 触发本 skill：用户只连了 Linear（或显式把简报范围限定在 Linear），从用户已认证的 Linear 连接拉过去 24h 的 issue / cycle / 状态变更 / 分配，渲染成 Linear 深色界面风格的简报——顶部窄 toolbar + 三栏布局（左 nav: Inbox / My issues / Active / Backlog；中: issue 列表按状态分组；右: 选中 issue 预览面板）。Inter 字体，深色 #0E0E10 背景，状态彩色圆点（Backlog 灰 / Todo 黄 / In Progress 蓝 / In Review 紫 / Done 绿），顶部右侧带 Cycle 进度条。"
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
