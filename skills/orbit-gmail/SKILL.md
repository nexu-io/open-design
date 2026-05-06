---
name: orbit-gmail
description: |
  Open Orbit briefing skill — selected by the Orbit pipeline when
  Gmail is the user's only connected connector, or when the user
  explicitly scopes their daily digest to Gmail. Pulls the past 24
  hours of inbox activity (replies awaited, mentions, cc, auto-
  categorized bulk) from the user's authenticated Gmail connection
  and renders the digest as a Daily Digest email at the top of a
  Gmail-style three-pane inbox. This skill should not be triggered
  manually — it is invoked by Orbit's daily-digest scheduler against
  live Gmail data.
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
  example_prompt: "Orbit pipeline invokes this skill: Gmail is the user's only connected connector (or the briefing is explicitly scoped to Gmail). Pull the past 24h of mail (awaiting reply / mentions / cc / auto-categorized) from the user's authenticated Gmail connection and render the briefing as a Daily Digest email pinned to the top of a Gmail three-pane layout — left nav (Compose red round button + Primary / Social / Promotions tabs) + middle list (the Orbit Daily Digest email is pinned at the top) + right reading pane (digest body grouped by category). Roboto / Google Sans, Gmail red #D93025 accent."
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
