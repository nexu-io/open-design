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
  example_prompt: "Generate today's Open Orbit Gmail briefing. Gmail is my only connected connector — pull yesterday's mail and render it as a Daily Digest email pinned at the top of a Gmail three-pane inbox."
---

# Orbit · Gmail Briefing

Single-connector Orbit template scoped to Gmail. The briefing arrives
*as an email* in the user's inbox; opening it shows a structured digest
broken into "needs reply / mentions you / auto-categorized".

## ⚠️ Source-of-truth protocol (read this first)

**Step 1.** Open and read the shipped `example.html` in this folder
before writing any output. That file is the canonical design — your
job is to **reproduce it**, not reinterpret it.

**Step 2.** Mirror the example's structure 1:1:
- Same DOM hierarchy and class names
- Same left-rail items in the same order. **Do not add `已暂停 /
  Snoozed`, extra system labels, or extra colored labels** that are
  not in the example.
- Same Categories tab strip (Primary / Social / Promotions only).
- Same inbox-list rows in the same order — including the **single
  yellow important star** on the top Orbit row only. Do **not** put
  yellow important markers on additional rows.
- Same digest-body sections, same priority strip, same reply bar.
- Same `<script>` block at the end (link / reply injection).

**Step 3.** You may refresh mock copy (sender names, subjects, summary
text, times) so it reads as "today", but you must **not** invent
extra UI: no extra labels, no extra inbox rows, no extra section
markers, no extra chrome ornaments. If a detail is not already in
`example.html`, it does not belong in your output.

The sections below are a **reference for tokens and visual language** —
not a license to extend the page.

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

## Page sections

1. **Top app bar** — full width, 64px tall, white.
   Left: hamburger (24px ☰) + Gmail wordmark (`Gmail` in `text-secondary`,
   first `G` in red `#EA4335`).
   Center: search bar — pill (`#eaf1fb` background, 28px radius), search
   icon left, `搜索邮件` placeholder, settings ◐ icon on right.
   Right: ❓ help, ⚙ settings, ▦ Google apps grid, round avatar.

2. **Three-pane main**:
   - **Left rail** (256px): vertical list with these sections in order:
     - **Compose** — large rounded button at top, 56px tall, white text
       on `#c2e7ff` background, with rounded rectangle pencil icon left.
     - System labels: `📥 收件箱 1,234`, `⭐ 已加星标`, `⏰ 已暂停`,
       `📤 已发送`, `📝 草稿`, `📁 全部邮件`, `🗑 垃圾箱`. Active item
       has red-tinted bg + red text.
     - Labels (with colored dots): `● 工作`, `● 个人`, `● 旅行`, etc.
   - **Inbox list** (flex 1): rows of emails. Top row is the pinned
     **Orbit Daily Digest**, unread (bold), important star yellow ★,
     yellow "important" tag, "Open Orbit" sender, single-line subject,
     preview snippet, time on right. Other rows below at lower contrast.
   - **Reading pane** (640px right): the opened Orbit digest body.

3. **Categories tab strip** — sits above the inbox list when on Inbox:
   3 tabs: `📥 主要 / 👥 社交 / 🏷️ 推广`. Active = blue underline.

4. **Reading pane (digest body)** — this is the heart of the briefing.
   - Header: subject line large (Google Sans 22px), sender row with
     round avatar + `Open Orbit <orbit@opendesign.local>` + send time.
     Action toolbar: ← back, 🗄 archive, ⚠ report, 🗑 delete, ✉ mark
     unread, ⏰ snooze, ↗ move, 🏷 label, ⋮ more.
   - Body sections (Cormorant or Google Sans display):
     - **📨 等你回复 (N)** — each item: round avatar, sender + thread
       subject, one-line preview, "提了 N 个问题" / "需要你 sign-off"
       red caption.
     - **📌 @ 或 cc 你 (N)** — items: avatar + sender, subject, mention
       reason ("@你 + Bob" / "cc 你"), thread length.
     - **🎯 自动归类 (N)** — collapsed groups: "GitHub 通知摘要 (折叠
       12 封) · 1 条值得看", "公司全员 town hall 提醒".
   - Footer micro-tag (12px muted, italic):
     `已使用 Open Orbit 自动整理 · 不影响原邮件状态`.

5. **Reply box** — beneath the digest, collapsed bar with
   "回复 / 转发 / 私信发件人 / 设为重要" chips. Blue primary `回复`.

## Pill / icon rules

- Important star: filled `#f4b400` triangle/star.
- Avatars: 32px circles with letter + soft palette pastel bg.
- Labels: small rounded pills with colored dots, no fills, just dot + text.
- Search bar uses Material 1 elevation only when focused (we render
  static — keep flat with `#eaf1fb`).

## Forbidden

- Anything that doesn't look unmistakably Gmail
- Custom typography (must be Google Sans / Roboto)
- Drop shadows on chrome (only the very subtle Material elevation)
- Square avatars
- Lorem ipsum
- Mixing dark mode
- Putting Orbit branding on the chrome (it lives only inside the digest)
