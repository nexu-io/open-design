# Components

Copy these markup shapes verbatim. Re-skin via the active `DESIGN.md`
(color, typography, spacing tokens). Do not invent new component
shapes — that's where AI-slop sneaks in.

All snippets assume the CSS custom properties defined in
`assets/template.html` (`--ink`, `--ink-2`, `--bg-soft`, `--accent`,
`--line`, `--pill-*-bg/ink`, …).

---

## live-pill (top-right of the topbar)

```html
<div class="pill-live" id="livePill">
  <span class="dot"></span>
  <span id="liveText">Live · synced</span>
</div>
```

Three states:

| State    | Class on `.pill-live` | Dot color | Text                          |
|---       |---                    |---        |---                            |
| Idle     | (none)                | green     | `Live · synced`               |
| Syncing  | `.syncing`            | accent    | `Syncing…`                    |
| Stale    | `.stale`              | amber     | `Stale · 2 min ago`           |

The green dot animates a 1.8s `pulse` keyframe. Disable on
`prefers-reduced-motion`.

---

## kpi card (one cell of the KPI grid)

```html
<div class="kpi">
  <div class="label">Total tasks</div>
  <div class="value" id="kTotal">142</div>
  <div class="delta up"><span class="arr">↑</span> 6 vs last week</div>
</div>
```

Rules:
- `.value` is `font-size: 32px; font-weight: 600; letter-spacing: -0.01em;
  font-variant-numeric: tabular-nums`
- `.label` is `12px uppercase letter-spacing .03em` color `--ink-2`
- `.delta.up` → green; `.delta.down` → red; neutral `.delta` is grey
- On refresh, tween `value` between old and new with a 600ms cubic
  ease-out, and add `.flash` for 700ms (turns the number `--accent-ink`
  briefly).
- **Never** put a colored progress bar under the number.
- **Never** put a sparkline inside a KPI card — sparklines belong in
  the two-column block.

---

## sparkline (SVG, hand-rolled)

```html
<svg class="spark" viewBox="0 0 600 140" preserveAspectRatio="none">
  <g class="spark-grid">
    <line x1="0" y1="35"  x2="600" y2="35"/>
    <line x1="0" y1="70"  x2="600" y2="70"/>
    <line x1="0" y1="105" x2="600" y2="105"/>
  </g>
  <path class="spark-fill" d=""></path>
  <path class="spark-line" d=""></path>
  <g id="sparkDots"></g>
  <g id="sparkLabels" class="spark-axis"></g>
</svg>
```

CSS:
- `.spark-fill` is `fill: rgba(<accent-rgb>, 0.10)`
- `.spark-line` is `fill: none; stroke: var(--accent); stroke-width: 2`
- `.spark-grid line` is `stroke: var(--line); stroke-dasharray: 2 3`
- `.spark-dot` (circles, r=3) is `fill: var(--accent)`

Compute paths from a length-7 series with padding 24/16/10/24 (L/R/T/B)
inside the 600×140 viewBox. Today's bucket is at the right.

Do not use Chart.js / Recharts / D3 — single artifact, no external deps.

---

## activity-feed row

```html
<div class="feed-row">
  <span class="av" style="background:#f1c40f">SC</span>
  <div class="body">
    <span class="who">Sarah Chen</span>
    <span class="what"> moved</span>
    <span class="target"> 🚀 Q3 Roadmap planning</span>
    <span class="what"> to In progress</span>
  </div>
  <div class="time">3 min ago</div>
</div>
```

- Avatar: 26px round, two-letter initials, color stable per person.
- `.target` gets a 1px dotted underline and `cursor: pointer`.
- A "just inserted" row gets the `.new` class for 2s — applies a soft
  `rgba(<accent>, .06)` background and a `•` bullet before the name.
- Re-render relative timestamps every 15s.

---

## status pills (Notion canonical five-color set)

```html
<span class="pill done">Done</span>
<span class="pill progress">In progress</span>
<span class="pill blocked">Blocked</span>
<span class="pill review">In review</span>
<span class="pill todo">To do</span>
```

| Class      | Background      | Foreground      | Notion label   |
|---         |---              |---              |---             |
| `done`     | `#dbeddb`       | `#2b593f`       | Done           |
| `progress` | `#fdecc8`       | `#976d23`       | In progress    |
| `blocked`  | `#ffe2dd`       | `#b13b2c`       | Blocked        |
| `review`   | `#d3e5ef`       | `#1f5b78`       | In review      |
| `todo`     | `#e9e5e3`       | `#5a534f`       | To do          |

Do not introduce extra states. Map any project-specific state into one
of these five.

---

## linked-database row

```html
<div class="db-row">
  <div class="db-cell">📐</div>
  <div class="db-cell title"><span class="t">Design tokens v2 spec</span></div>
  <div class="db-cell"><span class="pill review">In review</span></div>
  <div class="db-cell"><span class="person">…avatar…<span>Lisa Zhao</span></span></div>
  <div class="db-cell due">May 14</div>
  <div class="db-cell priority">Med</div>
</div>
```

- 6-column grid: `32px 2.4fr 1fr 1fr 0.9fr 0.9fr`
- `.db-row.changed` triggers a 1.4s row-flash via the `rowflash`
  keyframe.
- Hover: `background: var(--bg-soft)`. No transform / shadow.

---

## refresh button (page header, primary)

```html
<button class="btn primary" id="refreshBtn">
  <span class="ico" id="refreshIco">↻</span>
  <span>Refresh from Notion</span>
</button>
```

- Default: `background: var(--accent); color: #fff;`
- Hover: `background: var(--accent-ink)`
- During poll: add `.spin` to `.ico`, disable button taps via the
  `busy` flag in JS (do **not** rely on `[disabled]` so visuals stay
  identical).
- Label adapts to connector: "Refresh from Notion" / "Refresh from
  Linear" / "Refresh from Stripe" — never just "Refresh" alone.

---

## auto-toggle (page header, ghost)

```html
<button class="btn ghost" id="autoBtn" title="Auto refresh every 30s">
  <span>⏱</span><span id="autoLbl">Auto · on</span>
</button>
```

Toggles `setInterval(refresh, refresh_seconds * 1000)`. Persists to
`localStorage.live_dashboard_auto` so a reload restores the state.

---

## toast (bottom-center, transient)

```html
<div class="toast" id="toast">Synced — 3 changes from Notion</div>
```

`position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);`
1800ms auto-dismiss. Dark `#1f1f1f` background, white text. One toast
at a time; subsequent calls reset the timer.

---

## callout (Notion idiom)

```html
<div class="callout">
  <div class="emj">💡</div>
  <div>
    <div><strong>This page is a Live Artifact.</strong> Numbers below are pulled from
    your <strong>Acme Studio</strong> Notion workspace via the Composio connector.</div>
    <small>Refreshes on demand or when the page opens. Last 7 days only.</small>
  </div>
</div>
```

One short, declarative sentence + a smaller meta line. No marketing
copy, no "Powered by", no exclamation marks.
