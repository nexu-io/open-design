# 21th Design System

> Category: Design & Creative

A normalized Open Design package derived from the 21th library in a TRAE Work built-in design-library export. It is a brand-referencing implementation guide, not an official asset package.

## Visual Direction

- Working primary is `#111111`, while the brand signal is `#0040ff`: use black for core controls and reserve the electric blue for charts, highlights, and one emphasized action per row.
- Light mode runs on `#c5c9c9` page background, `#d8dada` cards, and `#111111` text; dark mode flips to `#0a0a0a` page, `#1a1a1a` panels, and `#ffffff` text for the same high-contrast dashboard read.
- Typography is deliberately code-leaning: `Geist Mono` drives both `--font-body` and `--font-mono`, while `Geist` is the serif-side support face; the interface should feel technical, compact, and editorial rather than friendly.
- Tracking defaults to `-0.05em`; keep labels tight, especially on structural copy and small uppercase markers that need a terse command-center cadence.
- Radius is `0px` (`0rem`) across the system; square corners are not a suggestion, they are the core shape language that keeps every panel and control feeling strict and analytical.
- Spacing starts at `4px`; the default button height is `36px`, small buttons are `30px`, large buttons are `42px`, standard inputs are `40px`, and large select-like fields are `44px`.
- Shadows are hard-offset, not soft: the base shadow language is `2px 2px 0px 0px #000000` with `0px` blur, so elevation should read like a printed keyline or mechanical stamp.
- Destructive color is `#d73333` in light mode and `#ef4444` in dark mode; use it sparingly for deletion, danger, or irreversible state changes only.
- The signature interaction quirk is mechanical motion: buttons hover with `translate(-1px, -1px)` and press with `translate(1px, 1px)`, so feedback should feel punched and tactile rather than soft.
- Voice stays short and operational, using real labels like “Create View”, “Export CSV”, “Search accounts”, “Overview”, “Analytics”, and “Weekly Summary”; keep copy concise, functional, and emoji-free.

## Color Roles

- **Canvas:** `oklch(0.8328 0.0044 197.0717)` → `--bg`.
- **Surface:** `oklch(0.8868 0.0022 197.1175)` → `--surface`.
- **Primary text:** `oklch(0.1776 0 0)` → `--fg`.
- **Muted text:** `oklch(0.6268 0 0)` → `--muted`.
- **Accent:** `oklch(0.1776 0 0)` → `--accent`.
- **Border:** `oklch(1.0000 0 0)` → `--border`.
- **Danger:** `oklch(0.5787 0.2005 26.1521)` → `--danger`.

Use only the semantic names in `tokens.css` in generated work. Raw color literals belong only in that token block.

## Typography

- Light mode runs on `#c5c9c9` page background, `#d8dada` cards, and `#111111` text; dark mode flips to `#0a0a0a` page, `#1a1a1a` panels, and `#ffffff` text for the same high-contrast dashboard read.
- Typography is deliberately code-leaning: `Geist Mono` drives both `--font-body` and `--font-mono`, while `Geist` is the serif-side support face; the interface should feel technical, compact, and editorial rather than friendly.

## Spacing and Layout

- Radius is `0px` (`0rem`) across the system; square corners are not a suggestion, they are the core shape language that keeps every panel and control feeling strict and analytical.
- Spacing starts at `4px`; the default button height is `36px`, small buttons are `30px`, large buttons are `42px`, standard inputs are `40px`, and large select-like fields are `44px`.

## Component Inventory

- **Button** (actions): Primary and secondary call-to-action control for dense dashboard workflows.
- **Card** (surfaces): Surface container for metrics, summaries, and compact analytical modules.
- **Input** (forms): Search and filter field for dashboard command bars and inspector panels.
- **Sidebar Navigation** (navigation): Primary navigation shell for a control-room style dashboard.
- **Data Table** (data display): Structured multi-column reporting table for operators and analysts.
- **Chart Panel** (data visualization): Primary visualization module for trend reading and categorical comparison.

The DS 3.0 runtime exposes Button, Field, Surface, and Status as the shared intent-routing primitives. Reuse their returned implementation and selectors for mapped intents.

## Interaction States

- Destructive color is `#d73333` in light mode and `#ef4444` in dark mode; use it sparingly for deletion, danger, or irreversible state changes only.
- The signature interaction quirk is mechanical motion: buttons hover with `translate(-1px, -1px)` and press with `translate(1px, 1px)`, so feedback should feel punched and tactile rather than soft.

## Motion

- The signature interaction quirk is mechanical motion: buttons hover with `translate(-1px, -1px)` and press with `translate(1px, 1px)`, so feedback should feel punched and tactile rather than soft.

## Accessibility

- Light mode runs on `#c5c9c9` page background, `#d8dada` cards, and `#111111` text; dark mode flips to `#0a0a0a` page, `#1a1a1a` panels, and `#ffffff` text for the same high-contrast dashboard read.

## Avoid

- Do not invent a near-copy when a mapped component exists.
- Do not bypass the no-match confirmation rule.
- Do not add undeclared tokens, arbitrary color literals, or unverified component states.
