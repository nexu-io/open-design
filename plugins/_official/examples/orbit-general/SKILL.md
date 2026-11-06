---
name: orbit-general
description: |
  Open Orbit briefing skill — selected by the Orbit pipeline when the
  user has two or more connectors connected. Pulls the past 24 hours of
  activity from every authenticated connector (GitHub, Linear, Notion,
  Slack, 飞书, Calendar, Gmail, Drive, Sentry, Vercel, …) and renders a
  single adaptive bento-grid dashboard at the top of "我的设计". Each
  connector module picks its own UI form (list, avatar stack, status
  ring, heatmap, file grid, alert card, …) based on the data shape it
  returns, so the layout scales as Orbit's connector ecosystem grows.
  This skill should not be triggered manually — it is invoked by
  Orbit's daily-digest scheduler against the user's live connector
  data.
triggers:
  - "orbit"
  - "daily digest"
  - "morning briefing"
  - "早安简报"
  - "每日简报"
  - "跨工具汇总"
od:
  mode: prototype
  platform: desktop
  scenario: orbit
  featured: 1
  preview:
    type: html
    entry: index.html
  design_system:
    requires: false
  example_prompt: "Generate today's Open Orbit morning briefing. I have ~10 connectors connected (GitHub, Linear, Notion, Calendar, 飞书, Sentry, Vercel, Slack, Gmail, Drive). Pull yesterday's activity from each and render the editorial bento dashboard."
---

# Orbit General Briefing

Cross-connector morning briefing that lives at the top of "我的设计".
Pulls the past 24 hours of activity from every authenticated connector
and lays them out as one editorial bento dashboard.

## ⚠️ Source-of-truth protocol (read this first)

**Step 1.** Open and read the shipped `example.html` in this folder
before writing any output. That file is the canonical design — your
job is to **reproduce it**, not reinterpret it.

**Step 2.** Mirror the example's structure 1:1:
- Same DOM hierarchy and class names
- Same number and order of sections
- Same number of bento modules in the same order
- Same connector list (do **not** add or drop connectors)
- Same KPI labels, same Top 3 entries, same "people waiting" set
- Same footer string
- Same `<script>` block at the end (link injection)

**Step 3.** You may freshen mock data values (counts, names, times) so
they read as "today" — but you must not invent new UI elements,
sections, modules, badges, callouts, ribbons, banners, decorations or
chrome that aren't already in `example.html`. If a detail is not in
the example, it does not belong in your output.

The body sections below are a **reference for the visual language and
tokens** — they are not a license to add features the example doesn't
already render.

## ⚠️ Design system policy

This skill ships with its **own** complete visual language baked into
`example.html`. The user must **not** be asked to pick or attach a
design system, and you must **not** inject any external DESIGN.md
tokens into the output.

- If the active project has a design system attached, **ignore it**.
- If the user supplies brand tokens or a Figma file, **ignore them**.
- Use exclusively the colors / fonts / radii / chrome defined in
  `example.html`.

This is a hard constraint: an Orbit briefing must read as Open Orbit's
own editorial bento language, not as the user's brand.

## Canvas tokens (use these exact values)

```
--bg:        #FAF7F2     /* off-white page */
--surface:   #FFFFFF     /* card */
--fg:        #1A1816     /* ink */
--muted:     #6B6660     /* secondary text */
--border:    #EAE5DD     /* 1px hairline only */
--orange:    #D86A47     /* accent (CTAs, hero highlight, meeting blocks) */
--green:     #2E7D5B     /* ok / done */
--yellow:    #C9982E     /* waiting */
--red:       #C0473A     /* alert / fail */
--radius-l:  24px        /* outer container */
--radius-m:  16px        /* bento cards */
--radius-s:  12px        /* inner blocks */
```

Type stack:
- Display serif: `'Cormorant', Georgia, serif` — KPI numerals, Hero h1,
  Top 3 serial numbers, italic comment quotes
- Body sans: `'Inter', -apple-system, system-ui, sans-serif`
- Numbers: always `font-variant-numeric: tabular-nums`

No shadows. No gradients. No emoji as primary visuals.
Connector icons must be monochrome line SVG (1.5 stroke).

## Page sections (top to bottom)

1. **Hero** — single row, ~80px tall.
   Left: `☀ 早安, Eli` (Cormorant 38px, with `,` in `--orange`).
   Right of name: `· 2026 年 5 月 6 日 · 星期三` (muted, 18px).
   Far right: round avatar (40px) + small ⚙ + ✕ icons.

2. **KPI strip** — single row, ~120px tall, 5 columns equal width.
   Each cell: serif number (Cormorant 64px, `--fg`) over a muted
   uppercase tracking label (Inter 11px, letter-spacing 0.06em).
   Optional ▲/▼ delta tag in `--green`/`--red` next to the number.
   Suggested labels: `待办 / 待 review / 会议 / @ 我 / agent 跑完`.

3. **Today's timeline** — full width, ~140px tall.
   Horizontal time axis from 09:00 → 19:00, hour ticks below.
   Meeting blocks: filled `--orange` rounded rectangles spanning their
   start/end, with the meeting name + attendee count inside.
   Deep-work suggestions: pale-green translucent bands behind the axis.
   "Now" indicator: a 1px vertical `--red` line with a pulsing dot
   (`@keyframes pulse 2s ease-in-out infinite`) and a tiny `现在` label.

4. **Top 3** — 3 equal cards, ~220px tall.
   Each card: huge serif numeral 1 / 2 / 3 (Cormorant 96px, in `--fg`)
   left-aligned; one-sentence task headline (Inter 18px medium); a
   meta row at the bottom with the connector source label + line-icon
   + `等待 Xh` waiting time. Cards have `--border` 1px outline only.

5. **Connector modules** — adaptive bento, the heart of the briefing.
   Render 10–16 modules. Sizes vary: data-rich connectors take a
   2-column or 2-row span, simple ones stay 1×1. **No two modules
   should look identical.** Pick UI per the data family below.

6. **People waiting on you** — full-width strip ~110px tall.
   Title left: `5 人在等你 · 最久 22h` (serif 24px).
   Right: 5 overlapping circular avatars (44px, ~8px overlap), each
   with the person's name + waiting reason underneath in 12px muted.

7. **Footer** — single line, ~52px.
   Left: `Open Orbit · auto-generated 06:42 · N connectors`.
   Right: `由 Nexu Labs 出品`.
   Border-top 1px, all text 12px muted.

## Connector → UI mapping (pick the matching family)

| Family        | Examples                              | UI form                                              |
|---------------|---------------------------------------|------------------------------------------------------|
| Code collab   | GitHub, GitLab, Bitbucket             | Status-dot list (open/merged/closed/CI fail) + reviewer count, optional 2–3 line diff preview |
| Task mgmt     | Linear, Jira, Asana, ClickUp          | Issue list with colored status dot + priority bars; for cycle, add a small ring or progress strip |
| Comms         | Gmail, Slack, 飞书 IM, Outlook        | Round avatar + one-line quote, accent color for "awaiting reply" |
| Knowledge     | Notion, Confluence, 飞书 Doc          | Doc title + 2-line excerpt block; comment quote in italic serif |
| Time          | Calendar                              | Already lives in the global timeline; module form: agenda list with start time gutter |
| Alerts        | Sentry, Datadog, PagerDuty            | Big red Cormorant number (e.g. `4`), 7 small squares as 7-day heatmap, plus 1 latest error line |
| Status        | Vercel, GH Actions, Netlify           | Colored status dot per recent build/deploy + branch + duration |
| Files         | Drive, Dropbox, Box                   | Filename list with tiny thumbnail squares + "edited by" attribution |
| Board         | Trello, Miro, FigJam                  | 3 compact kanban columns with rounded card chips |
| Finance       | Stripe, PayPal, banking, Brex         | Cormorant currency number + 7-day sparkline + last 3 transactions list |
| CRM / Sales   | Salesforce, HubSpot, Pipedrive        | 3-column deal pipeline (Open / Negotiation / Won) + 1–2 priority contact cards |
| Support       | Zendesk, Intercom, Help Scout         | Ticket queue list with SLA timer pill (green / yellow / red) + assignee avatar |
| Analytics     | Google Analytics, Mixpanel, Amplitude | Mini funnel chart (4 bars descending) + 1-line cohort delta (`▲ 12% W/W`) |
| Infrastructure| AWS, GCP, Kubernetes, Docker          | Resource meters (CPU / mem / disk percent bars) + last 2 deployment lines |
| Security      | 1Password, Auth0, Okta                | Event list with red shield for high-severity items + audit timestamp |
| Voice/Misc    | unknown connector                     | See **Fallback heuristics** below |

### Fallback heuristics (for unknown connectors)

When a connector doesn't match any family above, infer by the **data
shape it returns**:

- Returns numbers + a time series → treat as **Alerts** (big number + heatmap)
- Returns rows with `status` field → treat as **Task mgmt** (status-dot list)
- Returns rows with `from` / `subject` → treat as **Comms** (avatar + quote)
- Returns documents / file names → treat as **Files** (list + thumbnails)
- Returns a small set of named "states" (deploy / build / cycle) → treat as **Status**
- Returns dated events → treat as **Time** (agenda list)

If still ambiguous, fall back to a status-dot list (the safest default).

## Implementation constraints (paired do / don't)

| Don't | Do |
|---|---|
| Render every module as the same card shape | Vary by family — Alert = big red number + heatmap; Status = status-dot list; Files = thumbnail grid; Comms = avatar + quote |
| Render Sentry / PagerDuty as a plain list | Big red Cormorant number + 7-day heatmap + latest error line (`TypeError: …`) |
| Render Calendar as a plain text agenda | Visualize on the horizontal timeline at the top; module form is an agenda list with start-time gutter |
| Use placeholder names like "Service A / Project X" | Infer plausible real names from the connector type — GitHub → `nexu-io/open-design`, Sentry → `frontend-prod`, Linear → `ENG / DES` cycle 24, Stripe → `Pro plan / Acme Co.` |
| Use lorem ipsum filler | Write specific mock copy that reads as a real workday — names, numbers, errors, paths, percentages |
| Mix emoji and SVG icons in the same module set | Use monochrome line SVGs (1.5 stroke) consistently for all connector icons; emoji are reserved for hero greeting and section anchors only |
| Square or rounded-square avatars | Always circles; sizes 28 / 32 / 40 / 44 px depending on context |
| Drop shadows / gradients / glows on cards | Flat surfaces only; differentiate cards with the 1px `#EAE5DD` hairline border |
| Use brand colors from the user's design system | Use exclusively the canvas tokens above (`#FAF7F2`, `#1A1816`, `#D86A47` …) — Orbit's own editorial language |
