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
  example_prompt: "Orbit pipeline invokes this skill: Notion is the user's only connected connector (or the briefing is explicitly scoped to Notion). Pull the past 24h of document edits / comments / @ mentions / database row changes from the user's authenticated Notion connection and render the briefing as a native Notion page: top breadcrumb (Open Orbit / Daily Briefing / May 6), emoji cover, Heading 2 sections (Document edits / Comments & mentions / Database changes). Include at least one callout block + one toggle block + one database table view (Notion rounded cells + colored status tags). Inter, Notion ink #37352F + grayscale."
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
