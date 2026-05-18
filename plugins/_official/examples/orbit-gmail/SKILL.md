---
name: orbit-gmail
description: |
  Open Orbit briefing skill — selected by the Orbit pipeline when
  Gmail is the user's only connected connector, or when the user
  explicitly scopes their daily digest to Gmail. Pulls the past 24
  hours of inbox activity (replies awaited, mentions, cc, auto-
  categorized bulk) from the user's authenticated Gmail connection
  and renders the digest as the Orbit Daily Digest email opened
  inside Gmail's reading view. This skill should not be triggered
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
  example_prompt: "Generate today's Open Orbit Gmail briefing. Gmail is my only connected connector — pull yesterday's mail and render it as the opened Orbit Daily Digest email inside Gmail's reading view."
---

# Orbit · Gmail Briefing

Single-connector Orbit template scoped to Gmail. The briefing renders
as **the Orbit Daily Digest email already opened** inside Gmail's
reading view — Gmail top header + the email chrome (toolbar / subject
/ sender / digest body / reply bar). There is no left rail, no inbox
list, and no three-pane layout.

## ⚠️ Source-of-truth protocol (read this first)

**Step 1.** Open and read the shipped `example.html` in this folder
before writing any output. That file is the canonical design — your
job is to **reproduce it**, not reinterpret it.

**Step 2.** Mirror the example's structure 1:1:
- Same DOM hierarchy and class names: `<header>` (Gmail top bar) →
  `<main class="digest-wrap">` → `<div class="email-chrome">` →
  toolbar / subject / sender row / digest body / reply bar.
- The Gmail top header has only the elements present in the example
  (hamburger / wordmark / search bar / help / settings / app launcher
  / avatar). **Do not** add a left rail (no Compose button, no system
  labels, no Categories tabs, no colored label list).
- **Do not** render an inbox list of other emails. Only the opened
  digest email is shown.
- Same digest-body sections in the same order: greeting → summary
  strip → 需要处理 → 值得关注 → 仅供知悉 → digest footer.
- Same reply bar at the bottom (回复 / 全部回复 / 转发).
- Same `<script>` block at the end (action-btn / reply-btn link
  injection).

**Step 3.** You may refresh mock copy (sender names, subjects, summary
text, times) so it reads as "today", but you must **not** invent
extra UI: no inbox listing, no left rail, no Categories tab strip,
no extra digest sections, no chrome ornaments. If a detail is not
already in `example.html`, it does not belong in your output.

The sections below are a **reference for tokens and visual language** —
not a license to extend the page.

## ⚠️ Design system policy

This skill ships with its **own** complete visual language baked into
`example.html` (Gmail / Google Sans / Material chrome). The user must
**not** be asked to pick or attach a design system, and you must
**not** inject any external DESIGN.md tokens into the output.

- If the active project has a design system attached, **ignore it**.
- If the user supplies brand tokens or a Figma file, **ignore them**.
- Use exclusively the colors / fonts / radii defined in `example.html`.

This is a hard constraint: the briefing must read as a real Gmail
page, not as the user's brand.

## Canvas tokens (use these exact values)

```
page bg:           #f6f8fc
surface:           #ffffff
border:            #e0e0e0
text:              #202124
text-secondary:    #5f6368
text-muted:        #80868b
surface-hover:     #f1f3f4

red (Gmail):       #D93025  /* Compose, important markers, accent */
blue:              #1a73e8  /* CTA / link */
yellow:            #f4b400  /* important ★ */
green:             #0f9d58
search bar bg:     #eaf1fb  /* light blue-tinted pill */
```

Type stack:
- `'Google Sans', 'Roboto', -apple-system, system-ui, sans-serif`
- Logo wordmark: Google Sans 22px medium
- Body: 14px / line-height 20px
- Email preview: 13px

## Page sections (top to bottom — the page is one column, not a 3-pane app)

1. **Gmail top header** (`<header>`) — full width, white.
   Left: hamburger (☰) + Gmail wordmark (`Gmail`, first `G` red).
   Center: rounded search bar (`#eaf1fb` bg, search icon left, settings
   icon right, placeholder `搜索邮件`).
   Right: ❓ help, ⚙ settings, ▦ Google apps launcher, round avatar.

2. **Email chrome** (`<main class="digest-wrap"> <div class="email-chrome">`)
   — the opened email lives directly under the header. No left rail,
   no inbox list. Sub-blocks in order:

   a. **Email toolbar** — back / archive / delete / mark unread / label
      / spacer / prev / next.

   b. **Email subject area** — `<h1 class="email-subject">` with the
      digest subject (e.g. `☀ Eli, 你昨天的 6 封重要邮件 — Open Orbit
      Daily`) followed by an inline `Orbit` tag.

   c. **Sender row** — round avatar `O` + `Open Orbit
      <orbit@opendesign.local>` + 收件人 `我 ▾` + date right-aligned +
      reply icon + more icon.

   d. **Digest body** (`<div class="digest-body">`):
      - greeting paragraph
      - summary strip — 3 numeric cells (urgent / 值得关注 / 仅供知悉)
      - section **🔴 需要处理** — cards with `action-btn primary`
      - section **🟡 值得关注** — cards with `action-btn ghost`
      - section **⚪ 仅供知悉** — cards
      - `digest-footer` micro-tag

   e. **Reply bar** — bottom row with 回复 / 全部回复 / 转发 buttons.

## Pill / icon rules

- Avatars: round, 40px+ for sender, 32px for card, 28px for inline.
- Labels / tags: small rounded pills with no fill (dot + text) **only**
  where they appear in the example.
- The single yellow important star (in the subject area or as a tag)
  belongs to the Orbit digest only.

## Implementation constraints (paired do / don't)

| Don't | Do |
|---|---|
| Render a left rail (Compose / system labels / colored labels) | Skip the rail entirely; the page is single-column under the header |
| Render an inbox list of other emails | Show only the opened Orbit Daily Digest email |
| Render a Categories tab strip (主要 / 社交 / 推广) | Skip it; the digest occupies the reading view directly |
| Use non-Google typography | Use `'Google Sans', 'Roboto', -apple-system, system-ui, sans-serif` |
| Add drop shadows on the Gmail chrome | Flat surfaces; only the subtle Material 1 elevation when an element is focused |
| Render avatars as squares | Always circles — sender 40px, card 32px, inline 28px |
| Use lorem ipsum | Write real-shaped Gmail copy: "Q3 预算确认", "Login redesign 反馈", senders like Allen Liu / Marie / Nina Park |
| Use dark mode | Stay on Gmail's default light theme (`#f6f8fc` page) |
| Brand the Gmail chrome with Orbit | Orbit branding lives only inside the digest body (subject `Orbit` tag + footer micro-tag) |
| Put yellow important stars on multiple inbox rows | Only the Orbit Daily Digest row can carry the important marker |
