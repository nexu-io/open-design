---
name: orbit-github
description: |
  Open Orbit briefing skill — selected by the Orbit pipeline when
  GitHub is the user's only connected connector, or when the user
  explicitly scopes their daily digest to GitHub. Pulls the past 24
  hours of PRs, review requests, issues, CI runs, and merges from the
  user's authenticated GitHub connection and renders them in a layout
  that mirrors GitHub's native Notifications + PR-diff visual language.
  This skill should not be triggered manually — it is invoked by
  Orbit's daily-digest scheduler against live GitHub data.
triggers:
  - "github briefing"
  - "github digest"
  - "pr digest"
  - "github 简报"
  - "代码活动汇总"
od:
  mode: prototype
  platform: desktop
  scenario: orbit
  featured: 2
  preview:
    type: html
    entry: index.html
  design_system:
    requires: false
  example_prompt: "Orbit 触发本 skill：用户只连了 GitHub（或显式把简报范围限定在 GitHub），从用户已认证的 GitHub 连接拉过去 24h 的 PR / review / issue / CI / merge，渲染成 GitHub Notifications + PR diff 风格的简报：顶部黑色 nav bar + 左侧 All / Unread / Mentions / Review requests + 右侧按类别分组的事件流（Review requests / CI / Issues / Activity），状态用 GitHub pill badge（open 绿 / merged 紫 / closed 红 / CI fail 红卡）。"
---

# Orbit · GitHub Briefing

Single-connector Orbit template scoped to GitHub. Renders the day's
review requests, CI failures, assigned issues, and merged PRs in a
layout that mirrors the GitHub Notifications + PR-diff visual language.

## Layout

- Top: GitHub black nav bar (octocat logo + search + notifications bell with count)
- Left rail: All / Unread / Participating / Mentions / Review requests
- Right pane: event stream grouped by type
  - **Review requests waiting on you** — yellow-highlighted block
  - **CI / Checks** — red border for failed runs
  - **Issues assigned to you**
  - **Activity** (merges, closes)

## Style

- Light theme: `#FFFFFF` bg / `#F6F8FA` panels
- Type stack: `-apple-system, "Segoe UI", sans-serif`
- PR state pills: open `#1A7F37`, merged `#8250DF`, closed `#CF222E`
- CI fail: red `✗` icon + `#FFEBE9` cell background
- Avatars: round, with reviewer status dots (✓ green / ⏳ yellow / ○ gray)
- Labels: GitHub rounded pills with their own colors
- Footer: `Open Orbit · auto-generated 06:42`
