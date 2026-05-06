---
name: orbit-gmail
description: |
  A Gmail-flavored morning briefing for Open Orbit — when the user has
  only connected Gmail, render the day's mail in a layout that mimics
  Gmail's three-pane desktop UI, with the briefing itself appearing as
  a "Daily Digest" message at the top of the inbox. Use when the brief
  asks for a "Gmail briefing", "inbox digest", "email summary", or any
  daily summary scoped to a single Gmail source.
triggers:
  - "gmail briefing"
  - "inbox digest"
  - "email summary"
  - "gmail 简报"
  - "邮件摘要"
od:
  mode: prototype
  platform: desktop
  scenario: orbit
  featured: 3
  preview:
    type: html
    entry: index.html
  design_system:
    requires: false
  example_prompt: "Gmail 风格的 Orbit 早安简报：还原 Gmail 桌面三栏布局——左侧 nav（含 Compose 红圆按钮 + 主要/社交/推广 tab）+ 中栏邮件列表（顶部那封是 Orbit Daily Digest）+ 右栏邮件正文（按类别分组：等你回复 / @ 或 cc / 自动归类）。Roboto / Google Sans，Gmail 红 #D93025 强调色。"
---

# Orbit · Gmail Briefing

Single-connector Orbit template scoped to Gmail. The briefing arrives
*as an email* in the user's inbox; opening it shows a structured digest
broken into "needs reply / mentions you / auto-categorized".

## Layout

- Three-pane desktop Gmail mock (left rail / list / reading pane)
- Left rail: Compose red round button, label list with colored dots,
  Categories tabs (Primary / Social / Promotions)
- Inbox list: the Orbit digest is the top unread message, with an
  important-yellow tag
- Reading pane: the digest body, sectioned as
  - **📨 等你回复 (N)** — mails waiting on a reply, with sender + one-line preview
  - **📌 @ 或 cc 你 (N)** — mails that mention or cc you
  - **🎯 自动归类 (N)** — auto-classified bulk (GitHub notification roll-ups, all-hands)

## Style

- Roboto / Google Sans
- Gmail red `#D93025` for primary CTAs and unread accents
- Standard Gmail grays for chrome
- Round avatars; colored dot labels
- Footer micro-tag inside the digest: "已使用 Open Orbit 自动整理"
