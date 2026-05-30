# Example brief

> Scaffold a K-Universe dashboard panel showing active agents, system status, and recent activity.
> Use React 19, TypeScript, and the `--ku-*` token system.
> Compact layout for desktop, 13px body text, no border-radius.

## Expected output

```
src/
  components/
    AgentStatusCard.tsx   — per-agent card with HUD dot, name, status badge
    SystemHealthRow.tsx   — health bar with --ku-primary fill
    ActivityFeed.tsx       — recent events list with --ku-text-muted timestamps
    PanelShell.tsx         — chrome wrapper (--ku-surface bg, --ku-border top)
  hooks/
    useAgentStatus.ts      — SWR hook for /api/agents endpoint
    useSystemHealth.ts     — SWR hook for /api/health endpoint
  panels/
    DashboardPanel.tsx     — orchestrates all components in compact grid
  tokens.ts                — re-exports from @k-universe/design-tokens
package.json
tsconfig.json
```

## K-Universe style notes

- All colors via `var(--ku-*)` — zero hardcoded hex
- Font: `var(--ku-font-primary)` for UI, `var(--ku-font-mono)` for timestamps
- Type scale: `var(--ku-type-body13)` for dense panels, `var(--ku-type-tiny)` for badges
- `--ku-hud` ONLY on live agent dots — never on badges or labels
- No `border-radius` anywhere — K-Universe uses sharp corners
- Section labels: `font-family: var(--ku-font-mono)`, `font-size: var(--ku-type-micro)`, `text-transform: uppercase`, `letter-spacing: 0.16em`, `border-top: 1px solid var(--ku-border)`

## Plugin inputs for this example

```json
{
  "brief": "K-Universe dashboard panel with agent status, system health, activity feed. React 19 + TypeScript. Compact desktop layout, --ku-* tokens, no border-radius.",
  "language": "TypeScript",
  "outputDir": "src",
  "kuStyle": true
}
```