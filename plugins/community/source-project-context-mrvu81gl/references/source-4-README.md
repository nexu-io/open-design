# UI Kit — CLB Design System

This README documents the applied kit structure, component files, usage workflow, design notes, and source basis so future agents can reuse it like a Claude Design package.

- **applied kit structure** — `## Structure` section below
- **component files** — `## Component files` table with source line numbers and exported classes
- **usage workflow** — `## Usage workflow` with quick start, full kit, and theming
- **design notes** — `## Design notes` covering CSS-only, responsive, accessible, tabular, token-bound
- **source basis** — `## Source basis` with reverse-engineering provenance from workspace.html

The interface kit is extracted from the `workspace.html` source prototype with line-number provenance.

## Structure

```
ui_kits/app/
├── index.html          # Composed UI Kit showcase — loads modular components
├── README.md           # This file — reuse documentation
└── components/         # Modular component CSS files (one per component group)
    ├── buttons.css              # Button: default, primary, disabled, icon+text
    ├── kpi-cards.css            # KPI card strip: 4-column grid, glyph, trend labels
    ├── pills.css                # Status pills: 5 variants
    ├── table.css                # Table + pagination
    ├── environment-cards.css    # Environment cards: auto-fill grid, device specs
    ├── health-monitoring.css    # Health banner + anomaly classification grid
    ├── navigation.css           # Nav items, count badges, group labels, topbar badges
    └── empty-state.css          # Empty state: icon + text + action link
```

## Component files

Each CSS file in `components/` is self-contained and copy-paste-ready. Zero JavaScript dependencies — all interactions are pure CSS.

| Component file | Source (workspace.html lines) | Classes exported |
|---------------|------------------------------|------------------|
| `buttons.css` | :113-120 | `button`, `.button`, `.primary` |
| `kpi-cards.css` | :123-132 | `.kpis`, `.kpi`, `.kpi-top`, `.kpi-label`, `.kpi-num`, `.kpi-trend`, `.glyph` |
| `pills.css` | :155-163 | `.pill`, `.pill-active`, `.pill-pending`, `.pill-feature`, `.pill-danger`, `.pill-muted` |
| `table.css` | :145-153, :211-216 | `table`, `th`, `td`, `tr:hover`, `.pagination`, `.page-btn` |
| `environment-cards.css` | :170-184 | `.env-grid`, `.env-card`, `.env-card-top`, `.env-name`, `.env-meta`, `.device-spec` |
| `health-monitoring.css` | :187-208 | `.health-banner`, `.anomaly-grid`, `.anomaly-card`, `.anomaly-count` |
| `navigation.css` | :83-101 | `.nav-item`, `.count`, `.group-label`, `.topbar-badge` |
| `empty-state.css` | :219-223 | `.empty`, `.empty-icon`, `.empty-text`, `.empty-action` |

## Usage workflow

### Quick start

```html
<link rel="stylesheet" href="../../colors_and_type.css" />
<link rel="stylesheet" href="components/pills.css" />
<span class="pill pill-active">使用中</span>
```

### Full kit

```html
<link rel="stylesheet" href="../../colors_and_type.css" />
<link rel="stylesheet" href="components/buttons.css" />
<link rel="stylesheet" href="components/kpi-cards.css" />
<!-- ... all component CSS files ... -->
```

Then use component class names directly in HTML. No JavaScript framework required.

### Theming

```css
:root { --accent: oklch(50% 0.2 300); }
```

## Design notes

- **Pure CSS**: All hover, active, focus-visible states are CSS-only. No JavaScript dependency.
- **Responsive**: Environment cards use `auto-fill, minmax(280px, 1fr)` for automatic column fitting.
- **Accessible**: Every interactive element has `:focus-visible` ring. Respects `prefers-reduced-motion`.
- **Tabular numbers**: Global `font-feature-settings: "tnum"` for vertical numeric alignment.
- **Chinese-first**: Demo copy in Simplified Chinese. CSS class names in English.
- **Token-bound**: No raw hex values — everything resolves through `var(--token)`.

## Source basis

All components reverse-engineered from `workspace.html` (45KB), the Computing Lab (CLB) 研发基础设施与环境管理平台 workbench prototype. CSS rules extracted, deduplicated, and split into modular component files. HTML structure preserved in `index.html` demo sections. Token block referenced via `../../colors_and_type.css`. Source prototype preserved at `../../workspace.html`.
