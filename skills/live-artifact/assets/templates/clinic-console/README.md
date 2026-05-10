# Clinic Console — live artifact template

A `html_template_v1` template for a friendly clinic / hospital / telemedicine
operations console. Soft-mint healthcare aesthetic: cool off-white canvas,
single mint accent, generous 18px card radii, signature diagonal-stripe
pattern fills inside KPI tiles and bar-chart bars, illustrated CSS-gradient
avatars, and one dark surface (the calendar activity popover).

## Files

```text
clinic-console/
├── template.html   # html_template_v1 source — only DOM, CSS tokens, and {{data.*}} bindings
├── data.json       # canonical default sample (renders straight out of the box)
└── README.md       # this file — data contract + customization notes
```

## How an agent uses this template

This template is intended to be copied (or referenced) when the
[`live-artifact`](../../../SKILL.md) skill is invoked with a healthcare
operations brief such as *"clinic dashboard", "doctors schedule", "hospital
admin", "appointment console", "telemedicine ops", "诊所后台", "医院管理"*.

The agent should:

1. Copy `template.html` and `data.json` into the project's live-artifact
   workspace directory as `template.html` and `data.json`.
2. Edit `data.json` to reflect the actual brand, names, schedules, and
   numbers from the brief or connector source. The shape of the JSON must
   match what `template.html` references (every `{{data.path}}` interpolation
   below).
3. Author `artifact.json` and `provenance.json` per the live-artifact
   protocol, then register the artifact through the daemon wrapper:

   ```bash
   "$OD_NODE_BIN" "$OD_BIN" tools live-artifacts create --input artifact.json
   ```

4. The daemon renders `template.html + data.json` into the preview
   `index.html` automatically. The agent does **not** author `index.html`.

When the user clicks **Refresh**, the daemon re-runs the registered source,
maps results back into `data.json`, re-renders the preview, and snapshots
the change — the layout never changes; only the numbers, names, and pill
states do.

## Default sample renders out of the box

If you create a live artifact using the default `data.json` shipped here,
you get the canonical "St. Lukes Wellness" demo screen:

- Greeting: `Hey Lukmon, glad to have you back! 🙌`
- Four KPI tiles: Total doctors / Total bookings / Available rooms / Total
  visitors, with mixed amber- and blue-stripe pattern footers and an inline
  General/Private rooms mini-list.
- Patient overview chart with paired diagonal-stripe bars across Jan–Jul,
  Mar 2025 highlighted with a mint outline.
- March 2025 mini-calendar with day 8 active (mint circle + dot) and a dark
  Activity Detail popover floating below it.
- Top requested clinics donut: Dental 120 / Cardiology 249 / Surgery 165.
- Doctor schedule with three pastel pills (Available / Unavailable / Leave).
- Today's appointments list with five illustrated avatars + venue / mode
  hints (`room 204`, `video call`, …).

## Default sample provenance.json

If you ship the default sample without re-sourcing the data, use:

```json
{
  "generatedAt": "2026-04-29T12:00:00.000Z",
  "generatedBy": "agent",
  "notes": "Default sample data shipped with the clinic-console template. Replace with real clinic data before sharing externally.",
  "sources": [
    { "label": "Template default sample", "type": "user_input" }
  ]
}
```

## Data contract

The shape below is the contract between `template.html` and `data.json`.
Every key listed is referenced by at least one `{{data.path}}` interpolation
in `template.html`. All values are scalars (string or number); the template
does not invoke any expression / helper / conditional logic — it is a
straight `html_template_v1` substitution.

### Top-level scalars

| Key | Example | Notes |
|---|---|---|
| `brand_name` | `"ST. LUKES"` | Sidebar wordmark. Keep ≤14 characters. |
| `greeting` | `"Hey Lukmon, glad to have you back! 🙌"` | Single emoji allowed at the end; no other emoji anywhere in the artifact. |
| `search_placeholder` | `"Search doctors, patients, rooms…"` | Greeting-row search input ghost text. |
| `search_shortcut` | `"⌘K"` | Right-side keycap label. |
| `secondary_action_label` | `"Export CSV"` | Greeting-row secondary button text. |
| `primary_action_label` | `"Add new"` | Greeting-row primary mint CTA text. |

### `user`

| Key | Example | Notes |
|---|---|---|
| `name` | `"Lukmon Olabode"` | Sidebar bottom row. |
| `role` | `"Admin"` | One-word role; longer roles wrap. |
| `av_class` | `"av-orange"` | One of `av-orange`, `av-pink`, `av-mint`, `av-blue`, `av-violet`, `av-amber`, `av-rose`. |
| `initial` | `"L"` | Single uppercase letter. |

### `nav_main` and `nav_management` (5 items each)

Each item shape:

| Key | Example | Notes |
|---|---|---|
| `label` | `"Dashboard"` | Nav text. |
| `active_class` | `""` or `"active"` | Set to `"active"` on exactly one nav item across both groups. |
| `count` | `""` or `"10"` | Empty string hides the count badge (CSS `:empty { display: none }`). |

> **Icons are template-locked.** Each nav slot's icon is hardcoded inside
> `template.html` (see [Icons are template-locked](#icons-are-template-locked)
> below) and is not exposed through `data.json`. The `html_template_v1`
> security validator forbids `{{data.*}}` interpolation inside URL-bearing
> attributes (`<use href>`, `<a href>`, `<img src>`, …) — and even if it
> didn't, the validator runs *before* substitution, so a malformed `data.json`
> could smuggle a `javascript:` URL past it. The reorder rule is therefore:
> if you change the meaning of a nav slot, also edit the corresponding
> `<use href="#icon-…">` literal in `template.html`.

### `pro_card`

| Key | Example | Notes |
|---|---|---|
| `tag` | `"Pro"` | Black pill in the upgrade card. Keep ≤6 characters. |
| `title` | `"Pssst!"` | Display title. |
| `body` | `"Your subscription expires in 9 days."` | One-sentence nudge. |
| `primary_label` | `"Renew"` | Mint primary action. |
| `secondary_label` | `"Cancel"` | Outlined secondary action. |

### KPI tiles `kpi_a` `kpi_b` `kpi_c` `kpi_d`

Tiles A, B, D share the **caption + pattern strip** layout. Tile C uses a
**2-row mini-list** layout instead. Every tile must have either a strip or a
mini-list — never bare.

Common keys:

| Key | Example | Notes |
|---|---|---|
| `label` | `"Total doctors"` | Tile label. |
| `value` | `"1,089"` | Big number (Plus Jakarta Sans 700). Use commas for thousands. |
| `trend_class` | `"up"` or `"down"` | Pill grammar — `up` = mint, `down` = rose. |
| `trend_label` | `"↑ 5.5%"` | Always include the arrow glyph. |

> KPI icons are also template-locked — see
> [Icons are template-locked](#icons-are-template-locked) below.

A / B / D additional keys:

| Key | Example | Notes |
|---|---|---|
| `caption` | `"An increase of 20 doctors in the last 7 days."` | One sentence answering "compared to what". |
| `strip_class` | `"stripe-amber"` | One of `stripe-amber`, `stripe-blue`, `stripe-mint`. Adjacent tiles should alternate hues. |
| `mini_stat` (B / D only) | `"1,635 today"` | Right-aligned tiny caption below the strip. |

C (`kpi_c`) additional keys:

| Key | Example |
|---|---|
| `rows` | array of 2 objects: `{ "label": "General room", "value": "100" }` |

### `chart`

| Key | Example | Notes |
|---|---|---|
| `title` | `"Patient overview"` | Card title. |
| `dropdown_label` | `"Last 6 months"` | Time-range chip text. |
| `legend_a` `legend_b` `legend_c` | `"Total patients"` etc. | Three legend captions. |
| `bars` | array of 14 objects: `{ "x": "34", "y": "148", "h": "92" }` | 7 month pairs (mint back, blue front). Bar 5 (index 5) is the highlighted month — the template adds a 2px mint stroke to bar 5 only. |
| `x_labels` | `["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul"]` | Seven month labels matching the seven bar pairs. |

### `calendar`

| Key | Example | Notes |
|---|---|---|
| `month_label` | `"March 2025"` | Header. |
| `dow` | `["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"]` | Always 7 items. |
| `days` | array of exactly **35** objects: `{ "label": "1", "modifier": "" }` | 5 weeks × 7 days. `modifier` = `""`, `"muted"` (leading/trailing month), or `"active"` (single highlighted day, mint circle). |

### `activity`

| Key | Example | Notes |
|---|---|---|
| `title` | `"Activity Detail · Mar 8"` | Popover header — should reference the active calendar day. |
| `events` | array of exactly 3 objects: `{ "av_class": "blue", "name": "Dr. Sarah · post-op review", "time": "11:00 am" }` | Three events. `av_class` ∈ `blue`, `pink`, `violet`, `mint`, `amber`. |
| `add_label` | `"＋ Add item"` | Footer link. |

### `donut`

| Key | Example | Notes |
|---|---|---|
| `title` | `"Top 3 most requested clinics"` | Card title. |
| `center_label` | `"Total patients"` | Above the center number. |
| `center_num` | `"534"` | The big tabular number in the donut hole. |
| `segment_b` | `{ "dasharray": "120 240", "dashoffset": "0" }` | SVG `stroke-dasharray` + `stroke-dashoffset` for the pink slice. Sum of arc lengths over a r=38 circle equals `2π × 38 ≈ 239`. |
| `segment_c` | `{ "dasharray": "35 240", "dashoffset": "-120" }` | Same for the mint slice. The blue background ring is the full circumference — no per-segment math needed. |
| `legend` | array of exactly 3 objects: `{ "value": "120", "label": "Dental" }` | Three entries in blue / pink / mint order. |

### `schedule`

| Key | Example | Notes |
|---|---|---|
| `title` | `"Doctors's schedule"` | Card title. |
| `stats` | array of exactly 3 objects: `{ "value": "51", "small": "Total", "label": "Available" }` | Available / Unavailable / Leave counts in a 3-column grid. |
| `list_header_label` | `"List of Doctor"` | Sortable list header label. |
| `doctors` | array of exactly 4 objects | See below. |

Each `doctors` row:

| Key | Example | Notes |
|---|---|---|
| `av_class` | `"av-blue"` | Avatar gradient. |
| `initial` | `"P"` | Single uppercase letter. |
| `name` | `"Peter Bashir"` | Real-feeling name. |
| `role` | `"Anesthesiologist"` | Specialty. |
| `status_class` | `"avail"` `"unav"` `"leave"` | Pill grammar. |
| `status_label` | `"Available"` `"Unavailable"` `"Leave"` | Pill text. |

### `appointments`

| Key | Example |
|---|---|
| `title` | `"Today's appointments"` |
| `list` | array of exactly 5 objects |

Each `list` row:

| Key | Example | Notes |
|---|---|---|
| `av_class` | `"av-pink"` | Avatar gradient. |
| `initial` | `"R"` | Single uppercase letter. |
| `name` | `"Ruth Tubonimi"` | Real-feeling name. |
| `role` | `"Gastroenterology · room 204"` | Specialty + venue / mode hint (`room N`, `video call`, `telemedicine`). |
| `date` | `"Today"` | Short date label. |
| `time` | `"09:40"` | 24h or 12h, pick one and stay consistent. |

## Icons are template-locked

`html_template_v1` forbids `{{data.*}}` interpolation inside URL-bearing
attributes such as `<use href>`, `<a href>`, `<img src>`,
`<form action>`, etc. (see
[`skills/live-artifact/references/artifact-schema.md`](../../../references/artifact-schema.md#html-template-v1-binding-rules)).
The renderer's security validator runs *before* `{{data.*}}` substitution, so
even a well-formed validator pass would not protect a future `data.json`
that put `javascript:alert(1)` (or any other URL value) into one of these
attributes.

This template therefore hardcodes every `<use href="#icon-…">` reference in
`template.html` itself. Each slot has a fixed icon id:

| Slot | Hardcoded icon id |
|---|---|
| Sidebar brand mark | `#icon-leaf` |
| Sidebar collapse toggle | `#icon-collapse` |
| `nav_main[0]` Dashboard | `#icon-dashboard` |
| `nav_main[1]` Message | `#icon-message` |
| `nav_main[2]` Schedule | `#icon-schedule` |
| `nav_main[3]` Notification | `#icon-bell` |
| `nav_main[4]` Transaction | `#icon-card` |
| `nav_management[0]` Doctor | `#icon-user` |
| `nav_management[1]` Medicine | `#icon-pill` |
| `nav_management[2]` Bedroom | `#icon-bed` |
| `nav_management[3]` Appointment | `#icon-check-square` |
| `nav_management[4]` Patient | `#icon-people` |
| Sidebar logout | `#icon-logout` |
| Greeting-row search | `#icon-search` |
| Greeting-row secondary CTA | `#icon-download` |
| Greeting-row primary CTA | `#icon-plus` |
| `kpi_a` glyph | `#icon-user` |
| `kpi_b` glyph | `#icon-schedule` |
| `kpi_c` glyph | `#icon-bed` |
| `kpi_d` glyph | `#icon-people` |
| Patient-overview card | `#icon-clock` |
| Time-range dropdown chevron | `#icon-chev-down` |
| Calendar prev / next | `#icon-chev-left`, `#icon-chev-right` |
| Top-clinics card | `#icon-stethoscope` |
| Doctor-schedule card | `#icon-schedule` |
| List header chevron | `#icon-chev-down` |
| Today's-appointments card | `#icon-check-square` |

If you re-purpose a slot (e.g. swap `nav_main[2] Schedule` for
`nav_main[2] Reports`), edit the corresponding `<use href="#icon-…">` literal
in `template.html` to match — the icon set inside the inline `<symbol>`
defs at the top of `template.html` already includes 21 icons covering the
common clinic / hospital / pharmacy / telemedicine vocabulary
(`#icon-dashboard`, `#icon-message`, `#icon-schedule`, `#icon-bell`,
`#icon-card`, `#icon-user`, `#icon-pill`, `#icon-bed`, `#icon-check-square`,
`#icon-people`, `#icon-leaf`, `#icon-clock`, `#icon-stethoscope`,
`#icon-search`, `#icon-download`, `#icon-plus`, `#icon-chev-left`,
`#icon-chev-right`, `#icon-chev-down`, `#icon-collapse`, `#icon-logout`).

If you need a runtime-configurable icon, add a new constrained,
non-URL-bearing mechanism (for example a `data.kpi_a.icon_class` that toggles
between a fixed list of CSS classes the template enumerates) — never
interpolate into `<use href>` directly.

## Style guarantees

The template enforces, in CSS only (no JavaScript):

- Cool off-white canvas (`#EEF2F6`), bright white surfaces, 18px card radii, 1px hairline borders.
- Mint accent (`#10B981`) restricted to five places: active sidebar nav row, primary CTA, KPI icon glyphs, success metric pill, active calendar date.
- Diagonal-stripe pattern fills (135°, 8px line + 8px gap) on KPI footer strips and inside bar-chart bars.
- Pastel-only status pills (mint / rose / amber).
- Tabular lining numerals on every numeric value (`font-feature-settings: "tnum","lnum"`).
- The dark calendar activity popover is the only dark surface in the artifact.
- Mobile reflow at ≤920px: sidebar stacks above main, KPI strip becomes 2 cols then 1 col, mid and bottom rows stack.
- No external CDN imports. Fonts use system fallback (`Plus Jakarta Sans, Inter, system-ui, sans-serif`).

## Customization tips

- **Telemedicine** variant: replace `kpi_c` (Available rooms) with `Live sessions`, swap the donut to `Top consultation types` (Video / Audio / Chat), and add `· video call` / `· audio call` venue hints in appointment rows.
- **Pharmacy** variant: replace the doctor schedule with stock levels — keep the same shape, just rename the columns to SKU / drug / stock pill.
- **Pediatric** variant: tilt the avatar palette toward `av-pink`, `av-amber`, `av-orange`, keep the active calendar day on a children's milestone.

For all variants, **do not** introduce new colors, fonts, or radii. Every visual lever is already a token in `:root{}`.

## Bounded JSON envelope

This default `data.json` is well within the live-artifact bounded JSON
constraints:

| Constraint | Limit | This sample |
|---|---|---|
| Object/array depth | 8 | 4 |
| Object keys | 100 / object | ≤20 |
| Array length | 500 | 35 (calendar.days) |
| String length | 16 KiB | <100 chars |
| Serialized size | 256 KiB | ~7 KiB |

If you scale up the bar count, calendar density, or list rows, stay well
under these limits. Refresh writes go through the same validation, so
oversized data will be rejected before persistence.
