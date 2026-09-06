# CLB Design System

This README works as a Claude Design package guide. It includes: a Product Overview section explaining the source product, primary surfaces, and core capabilities; source/context references; a Package Contents tree; a Preview Manifest listing preview cards; a section on preserved assets, fonts, and build artifacts; ui_kits/app documentation; and a concrete reuse and review workflow.

Design system for Computing Lab (CLB) — 研发基础设施与环境管理平台. Extracted from the workbench prototype.

## Product Overview

This Product Overview section explains the source product, its primary surfaces, and core capabilities instead of only listing tokens or generated files.

**Source product**: Computing Lab (CLB) is a server digital management system for R&D laboratories — a 研发基础设施与环境管理平台 (R&D Infrastructure & Environment Management Platform). It connects resource investment, environment delivery, operations assurance, and service provisioning into a unified business system. CLB serves laboratory managers and environment-using teams, making resources go from "visible and manageable" to "predictable and provisionable."

Four core value anchors:
- **Digital ledger (数字台账)**: unified digital view of devices and resource pools as the trusted decision basis for full device lifecycle
- **Delivery chain (交付链路)**: end-to-end traceable delivery process from environment construction to decommissioning
- **Operations perspective (运营视角)**: unified operations view covering health, efficiency, alerts, and trends for proactive operations
- **Intelligent scheduling (智能调度入口)**: constraint-based automated resource matching, allocation, and reclamation

Six business domains: Resource Provisioning (资源供给), Environment Delivery (环境交付), Resource Management (资源管理), Environment Operations (环境运维), Environment Services (环境服务), Platform Foundation (平台支撑).

### Primary surfaces

The product includes these primary surfaces:

| Surface | Domain | Function |
|---------|--------|----------|
| Workspace (工作台) | Platform | Home dashboard: pending actions, work orders, environments, device health |
| Resource Center (资源中心) | Resource Management | Device management, resource pool management, cluster management |
| Environment Delivery (环境交付) | Environment Delivery | Full environment lifecycle from design to acceptance |
| Environment Services (环境服务) | Environment Services | Scheduling, installation, and reservation services |
| Operations (运行保障) | Environment Operations | Monitoring, alerting, and daily operations |
| Work Orders (工单中心) | Platform | Work order creation, approval, tracking across all domains |
| Analytics (运营看板) | Platform | Data statistics, operational analysis, and trends |

### Core capabilities

The product provides these core capabilities:

- **KPI overview**: 4-column equal-width card strip displaying pending actions, work orders, environments, and anomaly counts at a glance
- **Pending actions and work order management**: dual-column data tables with pagination, status pill classification, and row-level hover states
- **Environment management**: three-tier grouping model (personal environments, team pool member, team pool owner) with device specification chips showing GPU model and OS version
- **Health monitoring**: anomaly classification grid across four categories (device faults, network failures, credential drift, collection interruption) with color-coded health banners
- **Global navigation**: 256px fixed sidebar with two navigation groups plus a 48px topbar containing status badges and action buttons

## Source/context references

| Reference | File | Description |
|-----------|------|-------------|
| Primary prototype | `workspace.html` (45KB) | Complete workbench: sidebar, KPIs, tables, environment cards, health monitoring, responsive breakpoints |
| Design critique | `critique.json` | Panel scoring 4/5 overall — hierarchy 5/5, typography 4/5, motion 3/5 |
| Provenance | `context/provenance.md` | Design decisions, token derivation, known gaps |
| Source metadata | `context/source-context.md` | Project id, linked directories, generation contract |
| Architecture docs | `/Users/zhongqi/huawei/code/clb-new/clb-project` | CLB architecture design: DDD domain modeling, microservice boundaries, business processes, ADRs |

## Package Contents

```
.
├── DESIGN.md                    # 9-chapter design specification
├── SKILL.md                     # Agent-discoverable design system skill
├── README.md                    # Claude Design package guide (this file)
├── colors_and_type.css          # Reusable CSS token file
├── build/                       # Build artifacts directory
├── assets/                      # Brand assets directory
├── source_examples/             # Preserved source component snapshots
│   ├── buttons.html
│   ├── kpi-cards.html
│   ├── table-with-pagination.html
│   ├── pills.html
│   ├── environment-cards.html
│   ├── health-monitoring.html
│   └── navigation.html
├── preview/                     # Focused review preview cards
│   ├── colors-palette.html
│   ├── typography-specimens.html
│   ├── spacing-tokens.html
│   ├── components-library.html
│   ├── brand-assets.html
│   └── applied-surfaces.html
├── ui_kits/
│   └── app/
│       ├── index.html           # Composed UI Kit loading modular components
│       ├── README.md            # UI Kit reuse documentation
│       └── components/          # Modular component CSS files
└── workspace.html               # Original source prototype (45KB)
```

## Preserved assets, fonts, and build artifacts

- **assets/**: Source uses inline SVG symbols and a CSS-drawn logo. Place external assets here when available.
- **fonts/**: Not applicable — system font stacks (PingFang SC, Microsoft YaHei, Inter, ui-monospace). No custom font files.
- **build/**: Placeholder directory. Source is a single static HTML file with no build pipeline.
- **source_examples/**: 7 substantive component snapshots — complete, runnable HTML fragments, not stubs.

## Preview Manifest

Preview cards for review, in recommended inspection order:

| # | Card | File |
|---|------|------|
| 1 | Colors | `preview/colors-palette.html` |
| 2 | Typography | `preview/typography-specimens.html` |
| 3 | Spacing | `preview/spacing-tokens.html` |
| 4 | Components | `preview/components-library.html` |
| 5 | Brand assets | `preview/brand-assets.html` |
| 6 | Applied surfaces | `preview/applied-surfaces.html` |

## Package Reuse Guide

This section provides a concrete reuse and review workflow.

The guide covers: source/context references, package contents, preview cards, preserved assets/fonts/build artifacts, ui_kits/app, and a concrete reuse or review workflow.

### Agent workflow

1. Read `SKILL.md` for binding instructions and mandatory rules
2. Include `colors_and_type.css` or paste its `:root` block into a `<style>` tag
3. Consult `DESIGN.md` for component specs and layout patterns
4. Reference `preview/components-library.html` for visual examples
5. Copy component CSS from `ui_kits/app/components/` for modular reuse
6. Check `context/provenance.md` for design rationale and known gaps
7. Use `source_examples/` files as copy-paste starting points
8. Open `ui_kits/app/index.html` to see the composed UI Kit

### Human reviewer workflow

1. `preview/colors-palette.html` — token system
2. `preview/components-library.html` — all 12 component categories rendered
3. `preview/applied-surfaces.html` — real application context, responsive breakpoints
4. `ui_kits/app/index.html` — composed UI Kit in browser
5. `DESIGN.md` — full specification and anti-patterns
6. `workspace.html` — original 45KB source prototype
7. `source_examples/` — isolated runnable component snapshots
8. `preview/brand-assets.html` — logo, icons, copy tone, naming

## Design language summary

| Dimension | Value |
|-----------|-------|
| Style | Neutral Modern + Soft Paper |
| Accent | Blue #2f6feb — max twice per screen |
| Surfaces | canvas (#f2f2f0) → surface-muted (#fafaf9) → surface (#ffffff) |
| Typography | System stack + PingFang SC / Microsoft YaHei; tabular numbers globally |
| Type scale | 12–32px in 6 steps |
| Radius | 8px (control) / 12px (tile) / 16px (card) |
| Motion | 150ms ease-standard; staggered fade-up entrance |

## Source project

Extracted from Open Design project "Github Dashboard" (58a34454-39e4-4ee4-af30-3e179c4c9dbf). The source project references the CLB (Computing Lab) codebase at `/Users/zhongqi/huawei/code/clb-new`.
