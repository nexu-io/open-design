# Ezoic Product UI

> Category: Productivity & SaaS
> Publisher and operator product screens. Decisions made once, not a palette to re-pick.

This package is a **decision record**. Load it for greenfield publisher-dashboard and operator-tool mockups. Do not re-ask which green, which pill, or which button to use. The answers are below. Bindings live in `tokens.css`.

## Scope

Use this system for **in-product UI**: publisher dashboard, product siders, operator tools, settings, tables, and forms.

Do not use it for marketing, case studies, decks, landing pages, or social. Those surfaces have a separate brand guide (Ezoic Green `#70A92A`, Inter, cloud/ink). Mixing the two is how mockups keep asking "which green?"

The dark top bar and sider are **local chrome**, not a dark theme. The page stays light. Do not add a global `.dark` or `[data-theme="dark"]`.

## Which green

Two greens exist. This package uses only one.

| Token | Hex | Use in this package |
|---|---|---|
| `$green` | `#5fa624` | Product primary, success, in-flight sider pills. CSS `--green` / `--accent`. |
| `$green-darken` | `#376611` | Hover and pressed on `$green`, and the pill on a selected sider row. |
| Brand "Ezoic Green" | `#70A92A` | **Banned here.** Marketing accent. Do not substitute it for `$green`. |

Do not rename `$green` to a semantic name such as `--in-flight` or `--primary-success`. `$green` is the product name for that role. Schema `--accent` and `--success` both alias to it.

Ant Design's default primary (`#1890ff`) is also banned. An unthemed Ant widget looks blue; set `$green` explicitly.

## Role to token

Use the named token. Do not invent a nearby hex.

| Role | Token | CSS |
|---|---|---|
| Primary action, success, active, in-flight count | `$green` | `--green` / `--accent` / `--success` |
| Hover / pressed on a `$green` fill; selected-row sider pill | `$green-darken` | `--green-darken` / `--accent-hover` / `--accent-active` |
| Text on `$green` | white | `--accent-on` |
| Link, informational | `$blue` `#4c91f7` | `--blue` |
| Caution, waiting | `$orange` `#ff9d00` | `--orange` / `--warn` |
| Destructive, error, unread-alert queue | `$red` `#da3335` | `--red` / `--danger` |
| Heading and primary text | `$text` `#03080b` | `--fg` |
| Body copy | `rgba(0,0,0,0.65)` | `--fg-2` |
| Caption, helper | `$text-lighten-less` `#908e9b` | `--muted` |
| Metadata | `rgba(0,0,0,0.45)` | `--meta` |
| Card / input / modal surface | `#ffffff` | `--surface` |
| Page behind cards | `#f0f2f5` | `--bg` |
| Card edge, input, divider | `#d9d9d9` | `--border` |
| App top bar | `#03080b` | `--header-bg` |
| Inset segments in the top bar | `#1d2427` | `--header-secondary` |
| Product sider | `#001529` | `--sider-bg` |

`$green` is one token with three jobs (primary, success, in-flight). That is intentional. Do not split it.

## Components

Pick the component from this list. Do not invent a fourth treatment for the same job.

**Primary button.** Solid `$green`, white label, `4px` radius (`--radius-md`), `32px` height (`--control-height`). Hover and pressed use `$green-darken`. One primary per view. Do not use `$blue` for the primary CTA.

**Secondary button.** White / transparent surface, `$text`, `#d9d9d9` border, same height and radius. Not a ghost on the dark sider.

**Destructive button.** `$red` fill, white label, same geometry as primary. Confirm in an in-app modal, not a browser `confirm()`.

**Text link.** `$blue`. Hover may stay `$blue` or darken; do not turn links `$green`. `$green` is the filled action, not the inline link.

**Product-sider count pill.** Numeric pill on a dark sider (`#001529`). Default row: `$green` fill, white digits. Selected row (the row is already `$green`): `$green-darken` fill so the pill does not vanish into the highlight. The number is **unique in-flight work** (running, needs-review, equivalent action queue). Catalog CTAs such as Recommended stay off the pill, including as an idle fallback.

**Unread-alert badge.** `$red` only when the number is an unread queue (bell, pending invite). Do not default a sider count to `$red` because the queue includes a review state.

**Status waiting.** `$orange` text or pill. Not `$green`, not `$red`.

**Card.** White `--surface`, `4px` radius, `#d9d9d9` border, `--elev-raised`. No left-edge accent stripe.

**Input.** White field, `#d9d9d9` border, `4px` radius, `32px` height. Focus uses `--focus-ring` (accent ring), never the browser default blue outline.

**App header.** `64px` tall, `--header-bg`. Wordmark and nav live here. This is chrome, not page content.

**Icon nav under the header.** White row, `1px` bottom border, tiles `58px` wide, `44px` rounded square at `8px` radius (`--radius-lg`) over an `11px` label.

**Content column.** Centered, max `1120px`, `24px` side gutter on desktop.

## Banned

- Brand Ezoic Green `#70A92A` in product UI.
- Ant default primary `#1890ff` as the product CTA.
- Renaming `$green` to a semantic alias and dropping the product name.
- Translucent white / ghost pills for sider counts.
- `$red` (or Ant badge red) for in-flight counts.
- Folding catalog Recommended (or similar idle CTAs) into a running/review count.
- A global dark theme. Ink/header/sider are local bands.
- Gradients as brand decoration.
- A second chromatic primary. `$blue` is links; `$orange` and `$red` are state.
- Small `$green` text on white or cloud: product `$green` is for filled controls and pills, not body copy.
- Left-border accent cards.
- Full-width primary bars on desktop; primary is auto-width under the field it acts on.

## Typography

Product UI is **Open Sans**, not Inter. Inter is the marketing face.

Stack: `"Open Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`.

Base size is **14px** (Ant), not 16px. Match it or the dashboard will look inflated.

| Role | Size | Weight |
|---|---|---|
| App header wordmark | 23px | 700 |
| Page title (h1) | 38px | 600 |
| Section title (h2) | 30px | 600 |
| Subsection (h3) | 24px | 600 |
| Card heading (h4) | 20px | 600 |
| Body | 14px | 400 |
| Control label / button | 14px | 500 |
| Icon-nav label | 11px | 400 |
| Caption / helper | 12px | 400 |

Line-height for body: `1.5715`. Headings use `--leading-tight`. Do not set UI copy in all caps to fake hierarchy.

Mono is for exact values, IDs, and code. Not headings, not corner tags.

## Layout and chrome

- Spacing unit: **8px**. Steps: `4 / 8 / 12 / 16 / 20 / 24 / 32 / 48`.
- Radius: `2px` small, `4px` default (controls and cards), `8px` icon tiles, pill only for count chips.
- Shadow: `0 2px 8px rgba(0,0,0,0.15)`.
- Control height: default `32px`, large `40px`, small `24px`.
- Breakpoints: xs 480, sm 576, md 768, lg 992, xl 1200, xxl 1600.
- Header `64px` + icon nav, then the content column. Do not put page titles in the dark header.

## Motion and accessibility

- Hover and micro-state: `--motion-fast` `150ms`.
- State change: `--motion-base` `200ms`.
- Easing: `--ease-standard` `cubic-bezier(0.2, 0, 0, 1)`. No `ease-in` on UI.
- Do not animate from `scale(0)`. If scale is used, start at `0.9` or higher with opacity.
- Every control gets `:focus-visible` via `--focus-ring`.
- Normal text `4.5:1` against its actual background. `$green` is a fill, not small text on white.
- Honor `prefers-reduced-motion`: drop transform and opacity transitions.
