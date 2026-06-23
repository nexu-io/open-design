# Augment Code — Logo, Navigation & Icon Family

> Companion to the daemon-generated `DESIGN.md` (colors, type, tokens). This file
> captures the brand surfaces sourced from the product repo (`clients/web/app`)
> that a token-only import cannot represent: the logo, the Cosmos navigation
> structure, and the icon family. See `brand-assets/` for the actual assets.

## Logo

- **Primary mark** — `brand-assets/augment-logo.svg` (512×512). The Augment glyph
  in white on a solid black rounded tile (`rx: 96`). Use on its own as the app
  icon / favicon / avatar tile.
- **App lockup** — In product, the mark pairs with a wordmark via
  `CosmosBrandMark` + `CosmosBrandLockup` (icon tile + label stack). The lockup
  returns only the tile and label so each parent owns surrounding flex/gap.
- **Clearspace & color** — Keep the tile on black (`#0a0a0a`) or white (`#ffffff`);
  the glyph is monochrome. On the green accent, use the white glyph tile.

## Icon Family

- **Primary set: `lucide-react`** — stroke icons, `currentColor`, sized with
  `size-4` / `size-5` utilities. This is the default for all nav and UI icons.
- **Custom brand icons** (drop-in replacements that accept standard SVG props,
  scale with `size-*`, and inherit `currentColor`):
  - `CosmosIcon` (`brand-assets/icons/CosmosIcon.tsx`) — the Cosmos brand glyph,
    a drop-in for lucide `Orbit`. Source artwork 555×475, viewBox padded to a
    square so it aligns optically with 24×24 lucide icons.
  - `McpIcon` (`brand-assets/icons/McpIcon.tsx`) — Model Context Protocol logo,
    `1em` square, `fill: currentColor`.
  - `NewSessionIcon` (`brand-assets/icons/NewSessionIcon.tsx`) — a lucide `Plus`
    inside a rounded square tinted with `--sidebar-primary` (the green accent).
- **Rules** — Inherit color via `currentColor`; never hard-code icon fills. Match
  lucide's 24×24 frame and stroke weight when adding new custom glyphs.

## Navigation (Cosmos sidebar)

Source of truth: `src/navigation/nav-config.ts`. Two modes: the **primary**
sidebar and a **Settings** view. Each item is `{ path, label, icon }`.

### Primary nav (top-level)

| Label          | Path              | Icon (lucide unless noted) |
|----------------|-------------------|----------------------------|
| New session    | `/home`           | `NewSessionIcon` (custom)  |
| Sessions       | `/sessions`       | `MessageCircle`            |
| Files          | `/vfs`            | `FolderOpen`               |
| Experts        | `/experts`        | `Box`                      |
| Environments   | `/environments`   | `Cloud`                    |
| Integrations   | `/integrations`   | `LayoutGrid`               |
| MCP Registry   | `/mcp`            | `McpIcon` (custom)         |
| Analytics      | `/analytics`      | `BarChart3`                |
| Webhooks       | `/webhooks`       | `Anchor`                   |
| Secrets        | `/secrets`        | `Lock`                     |
| Automations    | `/automations`    | `Workflow`                 |
| Spaces         | `/spaces`         | `Layers` (flag-gated)      |
| Account Settings | settings route  | `Settings`                 |

**Automations** is a collapsible group containing: Automations (`Workflow`),
Run History (`History`), Event Log (`ScrollText`), Residents (`SquareUserRound`,
flag-gated). **Debug** group (debug mode only): Session Replay (`PlayCircle`),
Feature Flags (`Flag`).

### Settings view (labeled sections)

| Section               | Section icon        | Items (icon)                                                                 |
|-----------------------|---------------------|------------------------------------------------------------------------------|
| Foundation            | `SlidersHorizontal` | Environments (`Cloud`), Experts (`Box`)                                      |
| Automations           | `Workflow`          | Automations (`Workflow`), Residents (`SquareUserRound`), Run History (`History`), Event Log (`ScrollText`) |
| Capabilities          | `Blocks`            | Integrations (`LayoutGrid`), MCP Registry (`McpIcon`), Webhooks (`Anchor`), Secrets (`Lock`) |
| Organization Settings | `Building2`         | Spaces (`Layers`)                                                            |
| Account Management    | —                   | Members (`Users`), Usage (`CircleDollarSign`) — dynamic external links       |

### Behavior notes

- New session, Sessions, and Analytics are standalone (not in a group).
- All `/vfs/*` scoped routes highlight the single **Files** item; scope switching
  lives in the Files page header, not the sidebar.
- Individual chat pages (`/session/*`) highlight their Recent Sessions row, not
  the top-level Sessions link.
- Active-item resolution strips a leading `/app` prefix and matches by exact path
  or `path + "/"` prefix (`getActivePath`).

## How to apply

1. Start from `tokens.css` (the OD token contract) for color/type/spacing.
2. Use the green accent (`--accent: #1aa049`) for primary actions and the active
   nav state (`--sidebar-primary`).
3. Render nav/UI icons from `lucide-react`; swap in the custom icons above where
   the table calls for them.
4. Use `augment-logo.svg` for the app/brand mark; pair with a wordmark for lockups.
