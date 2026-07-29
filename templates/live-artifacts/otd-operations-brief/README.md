# `otd-operations-brief` · live-artifact template

> Category: **Live Artifacts**  
> Family: operations / supply-chain / on-time-delivery / vendor performance  
> Style: **Mono Crimson Operations Brief** (warm-white canvas · charcoal bars · single-accent crimson tick · tabular figures)

A drop-in `html_template_v1` live-artifact template for an editorial On-Time Delivery brief. It ships:

- a tokenized HTML template (`template.html`) wired entirely with Open Design's scalar-only `{{data.X}}` bindings;
- a default sample `data.json` covering a 14-account month-over-month OTD slice plus a "lowest 8" deep-dive;
- the canonical `artifact.json` and `provenance.json` shapes the Open Design daemon expects;
- a pre-rendered `index.html` and `preview.png` so reviewers can see the artifact without spinning up a daemon.

## Files

```
templates/live-artifacts/otd-operations-brief/
├── README.md           ← this file
├── DESIGN.md           ← the Mono Crimson Operations Brief design spec (9-section schema)
├── template.html       ← html_template_v1 template (scalar {{data.X}} bindings only)
├── data.json           ← default sample data the template binds against
├── artifact.json       ← live-artifact stored snapshot (mirrors the spec fixture format)
├── provenance.json     ← provenance fixture noting that the figures are illustrative
├── index.html          ← pre-rendered preview = template.html × data.json (default display sample)
└── preview.png         ← 4:3 thumbnail of index.html for picker / gallery surfaces
```

`index.html` is daemon-derived in production (see `apps/daemon/src/live-artifacts/render.ts`) — it is checked in here only to give reviewers a static preview. Do not edit it by hand; regenerate it from `template.html` + `data.json` if either changes.

## How it binds

Open Design's `html_template_v1` renderer is intentionally narrow:

- only `{{data.path.to.value}}` interpolation, paths must start with `data`;
- bindings must resolve to scalars (no array or object values);
- there is no repeat / loop / conditional directive — the template is **fully unrolled** for KPI 0..3, bar 0..13, and lowest-row 0..7;
- the renderer rejects `<script>`, `<iframe>`, `srcdoc=`, event-handler attributes, `javascript:` URLs, and `data-od-html|raw|bind-html` directives.

Refresh callers writing into `data.json` should preserve the same shape and cardinality (`kpis[4]`, `byKeyAccount.rows[14]`, `lowestAccounts.rows[8]`) so the unrolled template keeps rendering cleanly. Pre-compute every value the template binds — bar widths, prior-year ticks, formatted strings, and CSS class names — because the renderer cannot evaluate expressions.

## When to use this template

Use this template when an agent is asked to produce a refreshable artifact in any of these shapes:

- monthly / weekly OTD or fill-rate brief;
- supplier-performance or carrier-performance scorecard;
- finance / procurement variance brief with prior-year comparison;
- audit-style operations summary where the readability bar is "looks like a printed report".

The Mono Crimson Operations Brief style enforces a single chromatic accent (crimson) reserved for negatives, prior-year ticks, and "lowest" call-outs. See `DESIGN.md` for the full token grammar.

## When **not** to use this template

- consumer marketing dashboards or product analytics surfaces — too austere, no headroom for hero imagery or branded gradients;
- multi-tenant home pages — designed for a single subject (one month, one currency, one division);
- mobile-first layouts — the template is sized for a 1200 px desktop reading surface and does not collapse below ~960 px.

## Bringing this template into a project

```
od/
└── .live-artifacts/<artifact-id>/
    ├── template.html      ← copy from this folder
    ├── data.json          ← copy then refresh from your real source
    ├── artifact.json      ← copy then strip daemon-owned fields before sending to /tools live-artifacts create
    └── provenance.json    ← rewrite with real source descriptors before publishing
```

The `live-artifact` skill (see `skills/live-artifact/SKILL.md`) is the recommended on-ramp — point it at this folder and ask the agent to wire in your data source.

## Source attribution

Original visual reference: a 1200 × 960 OTD operations dashboard image extracted into `DESIGN.md` via the open-design 9-section spec. Sample account names, month, currency, and percentages are fictional and intentionally illustrative; do not treat them as ground truth.
