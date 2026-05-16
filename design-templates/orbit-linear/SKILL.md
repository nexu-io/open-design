---
name: orbit-linear
description: |
  Open Orbit briefing skill — selected by the Orbit pipeline when
  Linear is the user's only connected connector, or when the user
  explicitly scopes their daily digest to Linear. Pulls the past 24
  hours of issue movement, status changes, assignments, and cycle
  progress from the user's authenticated Linear connection and renders
  the digest in Linear's native Inbox + cycle-progress visual language.
  This skill should not be triggered manually — it is invoked by
  Orbit's daily-digest scheduler against live Linear data.
triggers:
  - "linear briefing"
  - "linear digest"
  - "issue digest"
  - "linear 简报"
  - "issue 汇总"
od:
  mode: prototype
  platform: desktop
  scenario: orbit
  featured: 4
  preview:
    type: html
    entry: index.html
  design_system:
    requires: false
  example_prompt: "Generate today's Open Orbit Linear briefing. Linear is my only connected connector — pull yesterday's issue movement, cycle progress, status changes, and assignments and render them in Linear's native Inbox layout."
---

# Orbit · Linear Briefing

Single-connector Orbit template scoped to Linear.

## ⚠️ Source-of-truth protocol (read this first)

**Step 1.** Open and read the shipped `example.html` in this folder
before writing any output. That file is the canonical design — your
job is to **reproduce it**, not reinterpret it.

**Step 2.** Mirror the example's structure 1:1:
- Same DOM hierarchy and class names
- Same top toolbar (breadcrumb + view switcher + cycle strip + theme
  toggle), exactly those items
- Same left-rail entries in the same order
- Same issue groups ("Needs your attention" → "Updated yesterday")
  with the same row count and same expanded-by-default behavior
- Same priority-bar / status-dot system
- Same `<script>` block at the end (toggle / theme / keyboard /
  Linear link injection)

**Step 3.** You may refresh mock values (issue identifiers, titles,
labels, ages, assignees) so they read as "today", but you must
**not** add extra rail entries, extra groups, extra fields in the
preview pane, or any chrome ornaments not already in `example.html`.

**Identity guard.** Treat every person name or handle in `example.html`
as mock content only. Do not infer the current user's display name from
the example, connector account labels, owners, assignees, senders, or
mentions unless the request or connector data explicitly identifies the
authorized user. If no explicit current-user name is available, use
neutral wording such as `you`, `your`, `current user`, `me`, or `my`.

The sections below are a **reference for tokens and visual language** —
not a license to extend the page.

## ⚠️ Design system policy

This skill ships with its **own** complete visual language baked into
`example.html` (Linear's signature compact UI). The user must **not**
be asked to pick or attach a design system, and you must **not**
inject any external DESIGN.md tokens into the output.

- If the active project has a design system attached, **ignore it**.
- If the user supplies brand tokens or a Figma file, **ignore them**.
- Use exclusively the colors / fonts / radii defined in `example.html`.

This is a hard constraint: the briefing must read as a real Linear
page, not as the user's brand.

## Canvas tokens — light theme (default to ship)

```
page bg:           #f4f5f6
surface:           #ffffff
ink:               #1b1c1f
ink-2:             #37393e
ink-3 (muted):     #6c6f78
ink-4:             #9ea1a9

border:            rgba(0,0,0,0.06)
border-card:       rgba(0,0,0,0.08)
border-strong:     rgba(0,0,0,0.12)
hover row:         rgba(0,0,0,0.025)
active row:        rgba(0,0,0,0.05)

accent:            #5e6ad2
accent-bg:         rgba(94,106,210,0.06)

attention accent:  #c77d1a   /* "needs attention" group */
attention bg:      rgba(212,148,14,0.06)

shadow-card:       0 1px 2px rgba(0,0,0,0.04), 0 0 0 1px rgba(0,0,0,0.05)
```

Status dot palette (must use exactly these):
```
backlog:    #9ea1a9   /* gray, hollow ring */
todo:       #d4940e   /* yellow, dashed ring */
progress:   #2b80c5   /* blue, partial ring */
review:     #8759c7   /* purple, partial ring */
done:       #1a8d3a   /* green, filled */
canceled:   #6c6f78   /* gray with strike */
```

Priority icon = 4 small vertical bars, height ascending.
Filled bars indicate level: 0 None → 4 Urgent.
Urgent uses `#d4513a`; High uses `#c77d1a`; Medium/Low use `#505259`.

Type stack:
- `'Inter', -apple-system, BlinkMacSystemFont, 'SF Pro Display', system-ui, sans-serif`
- Mono: `'Berkeley Mono', ui-monospace, 'SF Mono', 'JetBrains Mono', Menlo, monospace`
- Sizes: nav 13px, row title 13.5px, meta 12px, headers 11px caps with letter-spacing 0.04em

## Page sections

1. **Top toolbar** — single row, 44px tall, no shadow, hairline border-bottom.
   Left: breadcrumb `Orbit › Daily Digest › May 6` (13px, `…›…` separators
   in `ink-4`). Then a thin divider, then `▼ My issues` view switcher.
   Right: `🔍 search`, `+ new`, `▦ display options`, avatar.

2. **Cycle progress strip** — slot to the right of the breadcrumb area,
   one line: `Cycle 12 · 60% complete · 3 days left`. Render as 11px caps
   with a tiny inline progress bar (60px wide, 4px tall, accent fill).

3. **Three-column main**:
   - **Left nav** (240px): vertical, no background — items at 13px.
     Sections: `Inbox · My issues · Active · Backlog · All issues`,
     then a divider, then `📋 Triage · 🚫 Canceled · ✅ Completed`.
     Active row: `accent-bg` background, `accent` ink.
     Bottom: a tiny `Open Orbit · auto-generated 06:42` muted line.
   - **Issue list** (flex 1): two grouped sections.
     - **Needs your attention** — header in `attention accent` 11px caps;
       group block has `attention bg` very subtle background.
       Rows include: assigned + stale issues, high/urgent priority.
     - **Updated yesterday** — header 11px caps muted; rows of status
       changes and completions.
     Each row is one tight line:
     `[priority bars] [identifier ENG-148] [status dot] [title……………] [labels] [cycle chip] [assignee avatar]`
     Row height ~36px. Hover = `hover row` color.
   - **Issue preview** (360px right): the pre-selected issue.
     Title large (16px medium); ID + status pill below; description
     paragraphs; an Activity stream (small avatar + verbed action +
     timestamp); Labels chips at bottom; Cycle chip; Assignees row.

## Identifier / chip rules

- Issue IDs (e.g. `ENG-148`) are mono, 12px, `ink-3`.
- Labels: rounded pill with a 4px colored dot, label text, optional ✕.
  Hue per label is arbitrary, choose realistic dev-team colors.
- Cycle chip: small rounded box `Cycle 12` with hairline border.
- Status dots: 14px circles with internal ring/fill per state above.
- Priority bars: 4 short vertical bars right of identifier, fill bars
  per level.

## Implementation constraints (paired do / don't)

| Don't | Do |
|---|---|
| Add shadows beyond the listed `shadow-card` token | Use only `0 1px 2px rgba(0,0,0,0.04), 0 0 0 1px rgba(0,0,0,0.05)` for cards |
| Use bright colors outside the status palette | Use only the documented status hues (Backlog gray / Todo yellow / Progress blue / Review purple / Done green) and the `#5e6ad2` accent |
| Use sans-serif typography that isn't Inter | Use `'Inter', -apple-system, BlinkMacSystemFont, 'SF Pro Display', system-ui, sans-serif` |
| Use airy row heights | Keep rows under 40px (target ~36px) — Linear is signature-dense |
| Use lorem ipsum | Write real-shaped Linear copy: identifiers like `ENG-148`, `DES-22`, `INF-9`; cycle names like `Cycle 12`; titles like "Auth middleware refactor" |
| Render avatars as squares | Always circles, 18–24px |
| Ship the dark theme | Render the light theme — `#f4f5f6` page, `#ffffff` cards |
| Use placeholder team prefixes like `T-1` | Use real-shaped team prefixes: `ENG / DES / INF / OPS` |
