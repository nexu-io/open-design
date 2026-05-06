---
name: orbit-notion
description: |
  Open Orbit briefing skill — selected by the Orbit pipeline when
  Notion is the user's only connected connector, or when the user
  explicitly scopes their daily digest to Notion. Pulls the past 24
  hours of document edits, comments, mentions, and database row changes
  from the user's authenticated Notion connection and renders the
  digest as a native Notion page (callout / toggle / database table
  primitives). This skill should not be triggered manually — it is
  invoked by Orbit's daily-digest scheduler against live Notion data.
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
  example_prompt: "Orbit 触发本 skill：用户只连了 Notion（或显式把简报范围限定在 Notion），从用户已认证的 Notion 连接拉过去 24h 的文档编辑 / 评论 / @ 提及 / 数据库行变更，把简报渲染成一个原生 Notion 页面——顶部面包屑「Open Orbit / 早安简报 / 5 月 6 日」、emoji cover、Heading 2 分区（文档变更 / 评论与 @ 提及 / 数据库变更），至少包含一个 callout block + 一个 toggle 块 + 一个数据库表格 view（带 Notion 风圆角 cell + colored tag 状态）。Inter，Notion 黑 #37352F + 灰阶。"
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
