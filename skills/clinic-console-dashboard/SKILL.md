---
name: clinic-console-dashboard
description: |
  Soft-mint healthcare operations console — front-desk dashboard with a
  two-section sidebar nav (Main Menu + Management), four KPI tiles
  (doctors / bookings / available rooms / visitors) with diagonal-stripe
  pattern footers, a paired-stripe patient-overview bar chart, a mini
  month calendar with a dark Activity Detail popover, a Top requested
  clinics donut, a doctor availability list with mint/rose/amber pills,
  and a Today's appointments list. Single self-contained HTML, system
  fonts, no external runtime. Use when the brief asks for a clinic /
  hospital / telemedicine operations console, a healthcare admin
  dashboard, or names "St. Lukes" / "诊所后台" / "医院管理".
triggers:
  - "clinic console"
  - "clinic dashboard"
  - "hospital admin dashboard"
  - "healthcare operations console"
  - "doctor schedule dashboard"
  - "appointment console"
  - "telemedicine ops"
  - "诊所后台"
  - "诊所控制台"
  - "医院管理"
  - "医生排班看板"
  - "预约系统后台"
od:
  mode: prototype
  platform: desktop
  scenario: operations
  preview:
    type: html
    entry: index.html
    reload: debounce-100
  design_system:
    requires: true
    sections: [color, typography, layout, components]
  craft:
    requires: [state-coverage, accessibility-baseline]
  example_prompt: "Build a soft-mint clinic operations console: two-section sidebar (Main Menu / Management) with active mint pill on Dashboard, greeting row with search and Add-new mint CTA, four KPI tiles (Total doctors / Total bookings / Available rooms / Total visitors) with diagonal-stripe footers, a paired blue/mint diagonal-stripe patient-overview bar chart with one highlighted month, a March mini-calendar with a dark Activity Detail popover hanging below it, a Top-requested-clinics donut (Dental/Cardiology/Surgery), a four-row doctor schedule list with Available/Unavailable/Leave pastel pills, and a Today's appointments list of five rows with avatar gradients and venue hints (room N / video call). Single self-contained HTML, mint accent restricted to five touch points, dark popover is the only dark surface."
---

# Clinic Console Dashboard Skill

Produce a single-screen, healthcare front-desk operations console in the
"soft mint" aesthetic. The output is a self-contained HTML file (no external
runtime dependencies) that an admin could open directly to skim today's
clinic state: who's on shift, where the rooms are, what's booked next, and
how the patient-volume curve compares against the previous period.

## Resource map

```
clinic-console-dashboard/
├── SKILL.md
├── assets/
│   └── template.html          # reference seed — soft-mint clinic console, default sample
├── references/
│   └── checklist.md           # P0/P1/P2 quality gates
└── example.html               # iframe wrapper that opens assets/template.html in the gallery
```

## Workflow

1. **Read the active DESIGN.md** (injected above). Map color, typography,
   spacing, and component-styling tokens to the CSS variables already
   declared in `:root{}` of `assets/template.html`. Do not invent new
   tokens; if the active design system has darker / warmer / more saturated
   palette than soft mint, redefine `--accent`, the canvas / surface /
   border tiers, and the avatar / pattern hue pairs — keep the same
   variable names.
2. Start from `assets/template.html`; never generate the shell from blank.
   Replace the default "St. Lukes" sample data (brand name, doctor names,
   KPI numbers, calendar month, donut ratios, appointment rows) with
   plausible, brief-specific values. Real-feeling names, no
   `Doctor A / Patient B` placeholders.
3. Keep the layout invariants:
   - Two-section sidebar nav: 5 items in **Main Menu** (Dashboard / Message
     / Schedule / Notification / Transaction) + 5 items in **Management**
     (Doctor / Medicine / Bedroom / Appointment / Patient). Exactly one
     nav item carries the active mint pill.
   - Four KPI tiles in a single row (collapses to 2-up at ≤1100 px, 1-up
     at ≤600 px). Tiles A/B/D have a caption + diagonal-stripe pattern
     strip; tile C has a 2-row mini-list (General room / Private room).
   - Patient-overview chart with 7 paired bars (mint back, blue front),
     one highlighted month with a 2 px mint stroke around its blue bar.
   - Mini calendar with exactly one active day (mint circle + dot below),
     with a dark Activity Detail popover hanging below it. The popover is
     the only dark surface in the artifact.
   - Bottom row: Top-clinics donut + Doctor schedule list + Today's
     appointments list.
4. Mint accent (`--accent`) stays restricted to ≤ 5 touch points: active
   sidebar nav row, primary CTA button, KPI glyph backgrounds, success
   pills (`up` / `avail`), active calendar date.
5. Status pills are **pastel-only** (mint/rose/amber). KPI trend pills
   use `up` (mint) / `down` (rose). Doctor schedule pills use `avail`
   (mint) / `unav` (rose) / `leave` (amber).
6. Tabular lining numerals on every numeric value
   (`font-feature-settings: "tnum","lnum"`). KPI big numbers, calendar
   day cells, donut center number, schedule stat row, appointment times
   all align column-wise.
7. No external CDN imports. Fonts use system fallback
   (`Plus Jakarta Sans, Inter, system-ui, sans-serif`). Icons stay inline
   SVG `<symbol>` defs; never link out to an icon CDN.
8. Run through `references/checklist.md` before final output.

## Output contract

Emit one short orientation sentence, then the artifact:

```xml
<artifact identifier="clinic-console-dashboard" type="text/html" title="Clinic Console Dashboard">
<!doctype html>
<html>...</html>
</artifact>
```

The artifact must render correctly when opened directly from disk with no
build step and no network access.

## Related work

The same `clinic-console` visual language is also shipped as a refresh-able
[`live-artifact`](../live-artifact/SKILL.md) template at
`skills/live-artifact/assets/templates/clinic-console/`
(`template.html` + `data.json`) for use cases where the operations console
is wired to a connector and needs to refresh against live data. This skill
is the **static prototype** counterpart — pick this skill when the brief
wants a single self-contained HTML file the admin can hand to a doctor
over Slack; pick the live-artifact template when the brief wants
refresh-on-source-change.
