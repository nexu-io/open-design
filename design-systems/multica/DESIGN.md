# Multica Design System

> Category: Internal dashboard / multi-agent operator console
> Imported from `~/Projects/multica/packages/ui/styles/tokens.css` (2026-05-19).
> Also used by EOS-Command (forked from multica, same tokens).

## Visual identity

Multica is the design vocabulary for the EOS-Command stack — a multi-agent operator console where the user oversees and coordinates dozens of running CLIs at once. The brand reads as **calm, dense, indigo-tinted**. Surfaces alternate near-white (`#FFFFFF`) with cool sunken (`#F7F8FA`); the accent is a single saturated indigo (`oklch(0.55 0.16 255)` ≈ `#4F60D2`) reserved for active states, the run-status ring, and the priority chip on the highest-tier alert.

The interface is **information-dense** by design. Cards run wide (≥1240px container max), padding is generous but type is compact (14px body, 12px monospace metadata), and the chart palette spans five distinct OKLCH hues (indigo, green, amber, magenta, red-orange) so a single dashboard can carry five simultaneous time series without color-collision.

## Key characteristics

- Indigo accent (`oklch(0.55 0.16 255)`) — used for active nav, primary buttons, run-status rings
- Sidebar uses `#F1F5F9` (soft slate); the active nav row lifts to the accent's 12% tint
- Priority chips: low=green, medium=amber, high=red (semantic, not brand)
- 5-stop chart palette (`--multica-chart-1` through `--multica-chart-5`) at fixed OKLCH spacing for accessibility
- Radii: small=6px, medium=10px, large=14px. Tight enough to feel professional, soft enough to feel modern.
- Mono-font for IDs, timestamps, run counts (`ui-monospace`)
- Border-and-shadow elevation: 1px slate border + 1/4px split shadow stack on raised cards
- Motion: 200ms ease-out (`cubic-bezier(0.4, 0, 0.2, 1)`) — snappy but not jarring

## Anti-patterns

- No gradient backgrounds — flat surfaces only
- No glass / blur — too much chrome for a dense console
- No rounded-pill primary buttons — capsule pills are reserved for status, not actions
- No red anywhere except the priority-high chip and the danger CTA

## When to pick

Multi-agent ops dashboards, batch-run observability, multi-CLI orchestration UIs, anything where the user is monitoring 4+ concurrent jobs. If your screen has fewer than 3 live counters, pick a quieter brand.
