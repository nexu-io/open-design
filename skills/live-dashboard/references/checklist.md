# Pre-emit checklist (P0 must pass; do not write index.html until green)

Quote each P0 row in your reply with `[x]` or `[ ]`. Do not emit while
any P0 is unchecked.

## Visual integrity

- [ ] **P0 — Display face**. Page title uses a system / Notion-leaning
      sans (SF Pro / system-ui) or an editorial serif from the active
      DESIGN.md. **Never Inter Display, never SF Pro Display at body
      size, never Helvetica condensed.**
- [ ] **P0 — Accent restraint**. The `--accent` token appears at most
      twice in the body markup (one Refresh button + one sparkline
      stroke is canonical). No accent on KPI numbers.
- [ ] **P0 — No purple/pink gradient header**. The Notion idiom is
      flat. Backgrounds are `#fff` or `var(--bg-soft)`.
- [ ] **P0 — Body contrast**. Body text vs. background ≥ 4.5:1.
      Secondary text ≥ 4.0:1.
- [ ] **P0 — No emoji icon strip across the top**. Page-emoji is one,
      semantically meaningful (`📊` for ops, `📓` for docs, `🚀` for
      launch — never an emoji decoration row).

## Honesty (the most-violated rule)

- [ ] **P0 — No invented metric**. Every number is either provided by
      the user, by the connector, or labeled as `—` / `Sample`.
      Forbidden: "10× faster", "join 50,000 founders", "99.99% uptime"
      unless the user supplied the literal number.
- [ ] **P0 — Sample-data badge**. When `inputs.connector === mock`,
      the page must display "Sample data" in the live-pill or callout
      so a screenshot of this artifact is never mistaken for real ops.
- [ ] **P0 — Plausible KPI ranges**. `Total tasks` < 500 for a small
      team. `Active members` ≤ team size. `Done this week` ≤ Total.

## Connector wiring (only when connector !== mock)

- [ ] **P0 — `connectors.json` exists** at the project root. See
      `connectors.md` for the schema.
- [ ] **P0 — Endpoints documented**. Every `fetch()` call inside
      `index.html` corresponds to one entry in `connectors.json`.
- [ ] **P0 — No hardcoded secrets**. No API tokens, integration secrets,
      OAuth client IDs, or workspace IDs in the markup. The OD daemon
      resolves these via `media-config.json`.
- [ ] **P0 — Stale fallback**. On `fetch` error or > 90s without a
      successful poll, the pill swaps to amber and the previous values
      remain on screen. The artifact never goes blank.

## Structural

- [ ] **P0 — Single file**. `index.html` self-contained. No external
      CSS/JS imports beyond the system font stack and one OD custom
      element. No CDN URLs.
- [ ] **P0 — Sidebar collapses on `< 980px`**. The dashboard is
      mobile-readable; sidebar hides, KPI grid stacks 2-up, table
      drops `due` and `priority` columns.
- [ ] **P0 — `prefers-reduced-motion`**. All tweens and pulses are
      disabled when `(prefers-reduced-motion: reduce)`.
- [ ] **P0 — `tabular-nums` on KPI values**. Numeric values shouldn't
      jitter horizontally during tween or auto-refresh.

## Polish (P1)

- [ ] P1 — Refresh button shows a spinning ↻ for the duration of the
      poll, then settles back. No layout shift.
- [ ] P1 — Activity feed: newly-inserted row gets a left-edge accent
      bullet (•) and a soft accent background for 2s, then fades.
- [ ] P1 — Database row that just changed flashes the row background
      with a 1.4s ease-out.
- [ ] P1 — Live-pill states: green pulse (idle), blue solid
      (syncing), amber solid (stale).
- [ ] P1 — Sparkline grid lines are dashed, line-color from `--line`,
      stroke-dasharray `2 3`. Dots are filled `--accent` r=3.
- [ ] P1 — Toast bottom-center, dark `#1f1f1f`, 1800ms auto-dismiss.

## Content

- [ ] P1 — Person chips: 18px round avatar, two-letter initials,
      stable per-name color. No initials > 2 chars.
- [ ] P1 — Status pill copy uses Notion canonical labels:
      "Done", "In progress", "Blocked", "In review", "To do".
      Case matters: "In progress" not "In-Progress".
- [ ] P1 — Footer attribution names the source platform and the
      connector slug exactly: `composio.notion`, `composio.linear`, etc.
