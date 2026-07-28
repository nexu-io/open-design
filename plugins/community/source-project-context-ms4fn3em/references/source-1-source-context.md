# Source Project Context

This note is **source evidence** for the Website Clone → The Compression Company design-system extraction. It ships inside the plugin under `references/`. After install, do not expect the original Open Design workspace file tree to be present.

## Source project

- Source project id: `528b2514-393c-4868-bead-278ab096b20f`
- Source project name: Website Clone
- Design-system project id: `e73c9538-299e-47aa-a0cd-6dd5cd96345f`
- Design-system id: `user:website-clone-design-system`
- Source skill id: (none)
- Source design system id: (none)

## Source metadata

```json
{
  "kind": "prototype",
  "intent": "web-clone",
  "nameSource": "prompt",
  "skipDiscoveryBrief": true
}
```

## What was observed in the source workspace (not shipped here)

The original project contained homepage HTML clones, brand assets, and self-hosted fonts. Those binary/HTML artifacts are **not** part of this plugin bundle. Their design language is captured in the sibling reference files.

| Observed (source workspace) | Captured in plugin as |
|-----------------------------|------------------------|
| `context/source-context.md` | This file |
| `DESIGN.md` | `source-2-DESIGN.md` |
| `README.md` | `source-3-README.md` |
| `SKILL.md` (TCC skill) | `source-4-SKILL.md` |
| `ui_kits/app/README.md` | `source-5-README.md` |
| HTML clones, fonts, icons, previews | Not shipped — regenerate in consumer if needed |

## Generation contract (plugin-safe)

- Read this file and `source-2-DESIGN.md` before editing design-system outputs.
- Use **only** plugin-shipped `references/*` plus the plugin root `SKILL.md` / `open-design.json`.
- Do not require `index.html`, `assets/`, `fonts/`, `preview/`, `examples/`, or `colors_and_type.css` to exist inside the plugin.
- When building a reusable package in a consumer project, generate `DESIGN.md`, `README.md`, `SKILL.md`, tokens CSS, preview cards, and `ui_kits/app/` from these references.
- Prefer the audit gate in the consumer workspace when available:  
  `"$OD_NODE_BIN" "$OD_BIN" tools connectors design-system-package-audit --path . --fail-on-warnings`

## Provenance

See `provenance.json` in this folder.
