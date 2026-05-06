---
name: orbit-notion
description: |
  A Notion-flavored morning briefing for Open Orbit — when the user has
  only connected Notion, render the day's document edits, comments,
  mentions, and database changes in a layout that feels like a Notion
  page Notion itself wrote. Use when the brief asks for a "Notion
  briefing", "doc digest", "knowledge base summary", or any daily
  summary scoped to a single Notion source.
triggers:
  - "notion briefing"
  - "notion digest"
  - "doc digest"
  - "notion 简报"
  - "文档摘要"
od:
  mode: prototype
  platform: desktop
  scenario: orbit
  featured: 5
  preview:
    type: html
    entry: index.html
  design_system:
    requires: false
  example_prompt: "Notion 风格的 Orbit 早安简报：100% 还原 Notion 页面——顶部面包屑「Open Orbit / 早安简报 / 5 月 6 日」、emoji cover、标题 + 副标题、Heading 2 分区（文档变更 / 评论与 @ 提及 / 数据库变更）。包含至少一个 callout block（灰底 + 左侧 emoji）+ 一个 toggle 块 + 一个数据库表格 view（带 Notion 风圆角 cell + colored tag 状态）。Inter，Notion 黑 #37352F + 灰阶。"
---

# Orbit · Notion Briefing

Single-connector Orbit template scoped to Notion. The briefing renders
*as a Notion page* — same chrome, same block primitives, same typography.

## Layout

- Top breadcrumb: `Open Orbit / 早安简报 / 5 月 6 日`
- Emoji cover area (gray)
- H1 title + dim subtitle (auto-generation timestamp)
- Body in Notion's standard blocks:
  - **Heading 2 · 文档变更** — bullet list of edited / created docs
  - **Heading 2 · 评论 / @ 提及** — bullet list of comment events
  - **Heading 2 · 数据库变更** — a small Notion-style table view
    (Name / Status / Updated by / Time) with colored status tags
- Closing callout block as a CTA back to Open Design

## Required Notion primitives

- At least one callout block (gray bg, left emoji)
- At least one toggle block (can stay collapsed)
- A database table with rounded-cell borders and colored status tags
  (`In Progress` blue, `Done` green)

## Style

- Inter typography
- Notion ink `#37352F` + grayscale
- Liberal emoji as visual anchors
- A faint left rail to imply Notion's sidebar
