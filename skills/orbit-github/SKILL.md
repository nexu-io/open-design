---
name: orbit-github
description: |
  A GitHub-flavored morning briefing for Open Orbit — when the user has
  only connected GitHub, render the day's PRs, reviews, issues, CI
  status, and commits in a layout that feels like a native GitHub
  Notifications + PR-diff hybrid page. Use when the brief asks for a
  "GitHub briefing", "PR digest", "code activity dashboard", or a daily
  summary scoped to a single GitHub source.
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
  example_prompt: "GitHub 风格的 Orbit 早安简报：模拟 GitHub Notifications 页 + PR diff 预览。顶部黑色 nav bar + 左侧 All / Unread / Mentions / Review requests + 右侧按类别分组的事件流（Review requests / CI / Issues / Activity）。PR 状态用 GitHub pill badge（open 绿 / merged 紫 / closed 红 / CI fail 红卡）。"
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
