---
name: react-vite-dashboard
description: |
  Convert Stitch designs into production React + Vite dashboards with TanStack Query, accessible tokens from DESIGN.md, and Web3-ready patterns (ethers/viem).
  (Vendored from the stitch-build plugin of google-labs-code/stitch-skills; original
  skill id `react-vite-dashboard`. Requires the Stitch MCP server to be configured — see
  https://github.com/google-labs-code/stitch-skills for setup.)
triggers:
  - "stitch react vite dashboard"
  - "stitch dashboard"
  - "web3 dashboard from stitch"
od:
  mode: utility
  category: web-artifacts
  upstream: "https://github.com/google-labs-code/stitch-skills"
---

# Stitch to React + Vite Dashboard

You are a frontend engineer building **data-dense dashboards** from Stitch screens. Target stack: **React 18**, **Vite**, **TypeScript**, **TanStack Query**, **React Router**, and optional **ethers v6** or **viem** for on-chain reads.

## Prerequisites

- Stitch MCP configured ([setup guide](https://stitch.withgoogle.com/docs/mcp/setup/))
- A project `DESIGN.md` (see the `design-md` skill) for token fidelity
- Vite + React + TypeScript scaffold (`npm create vite@latest`)

## Workflow

1. **Discover MCP prefix** — run `list_tools`, note the Stitch prefix (e.g. `stitch:`).
2. **Fetch screen** — `[prefix]:get_screen` with project and screen IDs.
3. **Download assets** — persist HTML/screenshot under `.stitch/designs/{screen}.html` and `.png`.
4. **Read DESIGN.md** — map `colors.*`, `typography.*`, `spacing.*` to CSS variables in `src/index.css`.
5. **Generate components** — split into `src/components/`, `src/pages/`, `src/hooks/`.
6. **Wire data** — use TanStack Query for async fetches; keep presentational components pure.

## HTML → React mapping

| Pattern | Implementation |
|---------|----------------|
| Layout grid / flex | Tailwind utilities or CSS modules aligned to DESIGN.md spacing tokens |
| Cards / panels | `<section>` with tokenized border-radius and elevation fallbacks for forced-colors |
| Tables | Semantic `<table>` or TanStack Table; never div-only grids for tabular data |
| Buttons | `<button type="button">` with visible focus ring (preserve browser default unless DESIGN.md defines focus tokens) |
| Forms | `<label htmlFor>` + `<input id>`; associate errors with `aria-describedby` |
| Loading | Skeleton components; `aria-busy` on containers during fetch |
| Wallet connect | Isolate in `WalletProvider`; never embed private keys in generated code |

## DESIGN.md integration

```css
/* src/index.css — example token bridge */
:root {
  --color-primary: /* from DESIGN.md colors.primary */;
  --font-body: /* typography.body-md.fontFamily */;
}
```

Run the design.md linter locally before shipping UI:

```bash
npx @google/design.md lint DESIGN.md
```

## Web3 dashboard conventions

- Read-only contract calls via `useReadContract` (viem/wagmi) or ethers `Contract` + TanStack Query `queryFn`.
- Format token amounts with `formatUnits`; show network name and chain ID in settings footer.
- Surface transaction errors in plain language; link to block explorer when `txHash` exists.
- Gas-sensitive flows: batch reads, avoid redundant `eth_call` in render loops.

## File structure

```
src/
├── components/     # Presentational UI from Stitch
├── pages/          # Route-level screens
├── hooks/          # useQuery wrappers, wallet hooks
├── lib/            # ABI helpers, formatters
└── styles/         # Token CSS variables
```

## Quality checklist

- [ ] WCAG 2.2 AA: contrast from DESIGN.md component pairs passes linter
- [ ] Keyboard navigable: focus order matches visual order
- [ ] Responsive: test at 375px and 1280px widths
- [ ] No secrets in repo: RPC URLs from env (`VITE_*` prefix only for public endpoints)
- [ ] TypeScript strict: no `any` on contract ABIs

## Stitch docs note

When following links on [stitch.withgoogle.com/docs](https://stitch.withgoogle.com/docs/), use the full `https://stitch.withgoogle.com/docs/...` URL if relative navigation redirects incorrectly.
