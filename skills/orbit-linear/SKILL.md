---
name: orbit-linear
description: |
  Open Orbit briefing skill — selected by the Orbit pipeline when
  Linear is the user's only connected connector, or when the user
  explicitly scopes their daily digest to Linear. Pulls the past 24
  hours of issue movement, status changes, assignments, and cycle
  progress from the user's authenticated Linear connection and renders
  the digest in Linear's native Inbox + cycle-progress dark visual
  language. This skill should not be triggered manually — it is invoked
  by Orbit's daily-digest scheduler against live Linear data.
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
  example_prompt: "Orbit pipeline invokes this skill: Linear is the user's only connected connector (or the briefing is explicitly scoped to Linear). Pull the past 24h of issue movement / cycle progress / status changes / assignments from the user's authenticated Linear connection and render in Linear's native dark UI: narrow top toolbar + three-pane layout (left nav: Inbox / My issues / Active / Backlog; middle: issue list grouped by status; right: selected-issue preview pane). Inter typography, dark #0E0E10 canvas, colored status dots (Backlog gray / Todo yellow / In Progress blue / In Review purple / Done green). Cycle progress strip in the top-right corner."
---

# Orbit · Linear Briefing

Single-connector Orbit template scoped to Linear. Renders the day's
issue movement, cycle progress, and assignments in Linear's native
ultra-compact dark-first visual language.

## Layout

- Narrow top toolbar: breadcrumb `Orbit / Daily Digest / May 6` + view switcher
- Cycle progress strip: `Cycle 12 · 60% complete · 3 days left`
- Three columns:
  - **Left nav** — Inbox / My issues / Active / Backlog / All
  - **Main** — issue list grouped by status:
    - "Needs your attention" (assigned, stale, high-priority)
    - "Updated yesterday" (status changes, completions)
  - **Right preview** — selected issue with description / activity / labels / cycle

## Style

- Inter, dark-first canvas `#0E0E10`
- Tight rows, ~32px line height, almost no whitespace
- Status dots: Backlog gray / Todo yellow / In Progress blue / In Review purple / Done green
- Priority: 4-bar Linear icon
- Hover state visible on at least one row
- Bottom-right hint: `Open Orbit · auto-generated 06:42`
