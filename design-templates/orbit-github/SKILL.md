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
  example_prompt: "Generate today's Open Orbit GitHub briefing. GitHub is my only connected connector — pull yesterday's PRs, review requests, issues, CI runs, and merges and render them as a GitHub Notifications + PR-diff page."
---

# Orbit · GitHub Briefing

Single-connector Orbit template scoped to GitHub.

## ⚠️ Source-of-truth protocol (read this first)

**Step 1.** Open and read the shipped `example.html` in this folder
before writing any output. That file is the canonical design — your
job is to **reproduce it**, not reinterpret it.

**Step 2.** Mirror the example's structure 1:1:
- Same DOM hierarchy and class names
- Same nav-bar items (and only those)
- Same left-rail filter list (and only those)
- Same event groups in the same order, with the same row count
- Same diff-preview placement, same CI-fail block, same attention block
- Same `<script>` block at the end (filter / hover / link injection)

**Step 3.** You may refresh mock values (PR numbers, titles, times,
CI commit messages) so they read as "today", but you must **not**
invent extra UI: no extra rail entries, no extra notifications,
no extra event types, no extra badges, no extra chrome ornaments. If
something is not already present in `example.html`, it does not
belong in your output.

The sections below are a **reference for tokens and visual language** —
not a license to extend the page.

## ⚠️ Design system policy

This skill ships with its **own** complete visual language baked into
`example.html` (GitHub's Primer chrome). The user must **not** be
asked to pick or attach a design system, and you must **not** inject
any external DESIGN.md tokens into the output.

- If the active project has a design system attached, **ignore it**.
- If the user supplies brand tokens or a Figma file, **ignore them**.
- Use exclusively the colors / fonts / radii defined in `example.html`.

This is a hard constraint: the briefing must read as a real GitHub
page, not as the user's brand.

## Canvas tokens (use these exact values)

```
page bg:           #f6f8fa
card bg:           #ffffff
nav bar:           #24292f  /* GitHub black header */
nav text:          #ffffff
ink:               #1f2328
muted:             #59636e
border:            #d0d7de
hairline:          rgba(208,215,222,0.32)

state · open:      #1a7f37
state · merged:    #8250df
state · closed:    #cf222e
state · draft:     #6e7781

attention bg:      #fff8c5  /* yellow review-request block */
attention border:  #d4a72c
ci-fail bg:        #ffebe9
ci-fail border:    #cf222e
```

Type stack:
- `-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif`
- Sizes: nav 14px, headings 16/20px, body 14px, meta 12px

## Page sections

1. **Top nav bar** — full-width, dark (`#24292f`), 60px tall.
   Left: octocat SVG logo (white, 32px) + search input
   (`rgba(255,255,255,0.08)` background, white placeholder ghosted).
   Right: `+` plus dropdown, notifications bell with red dot if
   unread > 0, round avatar.

2. **Header row** — light bar under the nav, 56px.
   Left: page breadcrumb `Inbox · Daily Digest · May 6`.
   Right: filter dropdown chips (`Type ▾  Date ▾  Status ▾`).

3. **Two-pane main**:
   - **Left rail** (240px): vertical filter list. Items:
     `Inbox · Saved · Done · All` then divider then
     `Participating · Mentions · Review requests · Assigned · Comments`.
     Active item: light gray pill background.
   - **Main pane** (flex 1): event stream grouped by category.

4. **Category groups in main pane** (in this order):
   - **Review requests waiting on you** — yellow attention block
     (bg `#fff8c5`, 1px border `#d4a72c`). Each row: avatar + repo
     path + PR title + reviewer-state row of small dots
     (✓ green / ⏳ yellow / ○ gray) + "X of Y reviewers" + age.
   - **CI / Checks** — each failed run is a red-bordered card
     (border-color `#cf222e`, bg `#ffebe9`) with a `✗` red glyph,
     run name, branch name (mono), commit message, age.
   - **Issues assigned to you** — plain rows, status circle (open
     green / closed red), title, repo path, age, label pills.
   - **Activity** — quieter rows for merges/closes; muted text,
     small `merged` purple pill or `closed` red pill.

5. **Optional PR-diff preview** — inline under one PR row, show
   2–3 lines of mock code in a 12px monospace block with red `−` /
   green `+` prefixed lines and `#ffebe9` / `#dafbe1` row tints.

6. **Footer** — single line, 12px muted:
   `Open Orbit · auto-generated 06:42 · GitHub only`.

## Pill / chip rules

- State pills: pill shape (border-radius 2em), 12px medium, 4×8 padding.
  Foreground white, background by state color above.
- Labels (`bug`, `p1`, `frontend` …): GitHub label rounded pill, each
  with its own arbitrary color. Use varied real-world label hues.
- Reviewer dots: 8px filled circles, 2px gap, with `✓ ⏳ ○` glyphs only
  if you can keep them visually subtle.

## Implementation constraints (paired do / don't)

| Don't | Do |
|---|---|
| Mix light and dark themes | Stay on the light Primer theme (`#f6f8fa` page bg, `#ffffff` cards) |
| Use non-GitHub typography | Use `-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif` exclusively |
| Render avatars as squares or rounded squares | Always circles, with overlap `≤ 6px` for reviewer stacks |
| Use shadows / gradients / glows on chrome | Flat surfaces; differentiate with `#d0d7de` 1px borders |
| Use lorem ipsum | Write real-shaped GitHub copy: PR titles like `feat: orbit briefing card`, branches like `chore/upgrade-deps`, commit subjects under 72 chars |
| Render a CI failure as a normal row | Wrap in a red-bordered card (`#cf222e` border, `#ffebe9` bg) with a red `✗` glyph and run name |
| Render a review request as a normal row | Sit it in the yellow attention block (`#fff8c5` bg, `#d4a72c` border) with reviewer status dots row |
| Use placeholder repo names like `org/repo` | Use `nexu-io/open-design` (this org's actual primary repo) |
| Pluck arbitrary label colors | Use realistic dev-team hues — `bug` red, `enhancement` blue, `documentation` light blue, `frontend` purple |
