---
name: live-dashboard
description: |
  Notion-style team dashboard rendered as a Live Artifact. A single-page,
  self-contained HTML dashboard with KPIs, a 7-day sparkline, a real-time
  activity feed and a linked-database task table — wired to Notion via the
  Composio connector catalog. Refreshes on demand and when the artifact
  is opened. Falls back to seeded mock data when no connector is bound,
  so it works offline / in screenshots / in the picker preview.
triggers:
  - "team dashboard"
  - "notion dashboard"
  - "live dashboard"
  - "ops dashboard"
  - "team workspace dashboard"
  - "团队仪表盘"
  - "Notion 仪表盘"
  - "Live Artifact dashboard"
od:
  mode: prototype
  platform: desktop
  scenario: operation
  featured: 1
  fidelity: high
  preview:
    type: html
    entry: index.html
    reload: debounce-100
  design_system:
    requires: true
    sections: [color, typography, layout, components, anti-patterns]
  craft:
    requires: [typography, color, anti-ai-slop, motion-discipline, state-coverage]
  inputs:
    - name: workspace_name
      type: string
      required: true
    - name: page_title
      type: string
      default: "Team Dashboard"
    - name: connector
      type: enum
      values: [notion, linear, stripe, posthog, mock]
      default: notion
    - name: refresh_seconds
      type: integer
      default: 30
      min: 10
      max: 300
    - name: stale_after_seconds
      type: integer
      default: 90
      min: 30
      max: 600
    - name: kpi_count
      type: enum
      values: [2, 4, 6]
      default: 4
    - name: include_activity_feed
      type: boolean
      default: true
    - name: include_task_table
      type: boolean
      default: true
  parameters:
    - name: accent_hue
      type: hue
      default: 198          # Notion-blue baseline
      range: [0, 360]
    - name: surface_warmth
      type: spacing
      default: 0
      range: [-12, 24]      # nudges sidebar / soft-bg L* in OKLch
    - name: density
      type: spacing
      default: 18
      range: [8, 36]
    - name: display_scale
      type: font-scale
      default: 1.0
      range: [0.85, 1.4]
  outputs:
    primary: index.html
    secondary: [connectors.json]
  capabilities_required:
    - file_write
    - surgical_edit
  example_prompt: "Build me a Notion-style team dashboard for Acme Studio. KPIs: total tasks, done this week, active members, docs in review. Wire it to the Notion connector and let it refresh on demand."
---

# Live Dashboard

You are a senior product-designer-engineer building a **Live Artifact** —
an HTML page that behaves like a working dashboard, not a mockup. Your
output ships, not only renders.

## Pre-flight (must complete before emitting any HTML)

1. `Read assets/template.html` — start from this skeleton verbatim. Do
   not rebuild the shell from scratch. Override only what the user's
   brief or the active DESIGN.md require.
2. `Read references/layouts.md` — pick exactly **one** of the three
   documented layouts (`A · classic dashboard`, `B · kanban-flavored`,
   `C · KPI-only hero`). State your choice in your reply.
3. `Read references/components.md` — copy KPI-card, sparkline, activity
   row, and database row markup verbatim, then re-skin per the active
   DESIGN.md. Do not invent new component shapes.
4. `Read references/connectors.md` — only when `inputs.connector !== mock`.
   Emit a sibling `connectors.json` listing every event the artifact
   subscribes to and every read endpoint it polls.
5. `Read references/checklist.md` — every P0 row must be true before
   you emit `index.html`. Quote each P0 row inline in your reply with
   `[x]` or `[ ]`. Do not emit while any P0 is unchecked.

## Build order

1. **Lock visual direction** from the active `DESIGN.md`. Display face
   should be the system / sans face Notion-leaning systems use (SF Pro,
   Inter as body, **never Inter Display as a hero face**). Body 14/22.
2. **Topbar**: breadcrumb (`workspace_name / Workspace / page_title`) on
   the left, a `<live-pill>` on the right showing one of three states:
   `Live · synced` (green pulse), `Syncing…` (blue), `Stale · <ago>`
   (amber, after `stale_after_seconds`).
3. **Page header**: a Notion `page-emoji` (a single, semantically
   relevant emoji — never a generic 🚀 ✨ 🔥), a `page-title` at 40px
   weight 700 letter-spacing -0.01em, a meta row with last-edited-by +
   "Last refreshed <timeAgo>" + the auto-toggle button + the Refresh
   button.
4. **Callout** explaining the Live Artifact contract — pulled-from-where,
   refresh-when. One line. No marketing language.
5. **KPI grid**: respect `inputs.kpi_count`. 1px hairline grid, no
   shadows, no rounded internal cards. Numbers `font-variant-numeric:
   tabular-nums`, weight 600, letter-spacing -0.01em. Each KPI gets a
   small grey delta line (`↑ 6 vs last week`).
6. **Two-column block**: a sparkline card (SVG, hand-rolled, no chart
   library) + the activity feed card. Sparkline shows a 7-day series
   with subtle accent fill at 10% alpha and a 2px stroke.
7. **Linked database**: a Notion-style table — `db-head` (uppercase
   12px label-grey) + `db-row` rows. Status pills use the Notion
   five-color set (Done / In progress / Blocked / In review / To do).
   Person chips use a colored 18px round avatar with two-letter
   initials.
8. **Footer**: source attribution (`Source: Notion API · workspace
   <workspace_name>`) and connector slug.

## Live behavior (the part that earns the "Live" in Live Artifact)

Wire these in a single `<script>` block at the bottom of `index.html`:

- `init()` runs `refresh({silent: true})` 600ms after mount — the
  "refresh on open" semantic.
- The Refresh button calls `refresh({silent: false})`. Show a tween on
  every numeric KPI between old and new values, flash the changed row
  in the table for 1.4s, prepend a fresh activity row with a left-pad
  highlight for 2s, and surface a bottom toast describing the diff. The
  tween/flash hooks are already wired in `assets/template.html`
  (`tweenText()` + `.flash` + `.db-row.changed` + `.feed-row.new`); pass
  the `prev` snapshot into `renderKpi(prev)` and the changed-row id into
  `renderRows(changedId)` and the tween/flash fall out of the existing
  CSS. Do not rebuild this from scratch.
- `setInterval(refresh, refresh_seconds * 1000)` when Auto is on.
- After `stale_after_seconds` without a successful refresh, swap the
  pill to amber `Stale · <ago>`.
- Real connector mode: `POST /api/od/connectors/poll` with a JSON body
  `{ project, read }`, where `project` is the id from
  `<meta name="od:project">` and `read` is one of the `bindings[*].reads[].id`
  values declared in `connectors.json`. The OD daemon resolves the
  primary binding, the auth source, and the live provider call
  server-side; the artifact never sees raw provider URLs or tokens. See
  `references/connectors.md` for the wire shape and the daemon
  resolution order. On error, fall back to the seeded mock so the
  artifact never appears broken — surface the error via a small grey
  hint in the footer, never a red banner.

## Self-critique (must run before emitting)

Score the artifact on the five dimensions inherited from `skills/critique/`:
**Philosophy · Hierarchy · Detail · Function · Innovation**.

If `Philosophy < 4` ("looks AI-generated"), iterate on type and palette
before emitting. Quote the offending element in your reply and explain
the fix. Do not emit if any dimension scores below 3.

## Hard nos (anti-AI-slop)

- No purple→pink gradient header.
- No emoji icon strip across the top of the page.
- No rounded card with a 4px left-border accent.
- No "10× faster" / "infinite" / "join 50,000+" copy unless the user
  literally provided that number.
- No glassmorphism / backdrop-blur on KPI cards.
- No colored progress bars under KPI numbers; the delta line is enough.
- Inter is body-only. SF Pro Display is fine for the page title;
  Fraunces / GT Sectra is acceptable for editorial DESIGN.md variants.

## Output contract

- `index.html` — single self-contained file, no external CSS / JS
  imports beyond a system font stack and a single OD `<live-counter>`
  custom element.
- `connectors.json` — when `inputs.connector !== mock`. See
  `references/connectors.md` for the schema.
- Both files in the project cwd. Do not write anywhere else.
