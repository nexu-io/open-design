---
name: source-project-context-ms4fn3em
description: >
  Source evidence for The Compression Company design system (from Open Design
  Website Clone). Use the shipped references/ files as the only evidence bundle
  after install — do not look for unshipped workspace paths.
user-invocable: true
---

# Source Project Context

Plugin evidence for the **Website Clone → The Compression Company** design-system extraction. After install, treat **only the files in this plugin folder** as available evidence. Do not expect original Open Design project paths (`index.html`, `assets/`, `preview/`, etc.) to exist on disk unless the consumer project already has them.

## Source project

- Source project id: `528b2514-393c-4868-bead-278ab096b20f`
- Source project name: Website Clone
- Design-system project id: `e73c9538-299e-47aa-a0cd-6dd5cd96345f`
- Design-system id: `user:website-clone-design-system`
- Live reference: https://www.thecompressioncompany.com

## Source metadata

```json
{
  "kind": "prototype",
  "intent": "web-clone",
  "nameSource": "prompt",
  "skipDiscoveryBrief": true
}
```

## Shipped bundle (authoritative)

| Path | Role |
|------|------|
| `SKILL.md` | This file — install entry + usage contract |
| `open-design.json` | Plugin manifest |
| `references/provenance.json` | Formalization provenance |
| `references/source-1-source-context.md` | Handoff / source-project note |
| `references/source-2-DESIGN.md` | Full design-system rules (canonical posture) |
| `references/source-3-README.md` | Package guide + review workflow (reference-only) |
| `references/source-4-SKILL.md` | Agent skill contract for the TCC system |
| `references/source-5-README.md` | Applied UI-kit structure notes |

Original workspace HTML clones, fonts, icons, logos, and preview cards were **not** copied into this plugin. Visual rules, tokens, components, and workflows are captured in the markdown references above.

## Generation / usage contract

1. Read **this file**, then **`references/source-2-DESIGN.md`** before generating or editing design-system outputs.
2. Use **only** shipped paths under this plugin (`SKILL.md`, `open-design.json`, `references/*`). Never require unshipped paths such as `colors_and_type.css`, `preview/*.html`, `fonts/`, `assets/`, `examples/`, or `ui_kits/app/` unless they already exist in the **consumer** workspace.
3. Treat `references/source-2-DESIGN.md` as the canonical rules surface (color, type, spacing, layout, components, motion, voice, anti-patterns).
4. Treat `references/source-3-README.md` and `references/source-4-SKILL.md` as the human and agent package guides for how to apply those rules.
5. Treat `references/source-5-README.md` as the applied marketing-kit composition model (shell + modular sections), described in prose — not as live HTML.
6. When the consumer asks for a full package, **generate** missing artifacts (`DESIGN.md`, `README.md`, `SKILL.md`, `colors_and_type.css`, `preview/`, `ui_kits/app/`, etc.) **into the consumer project**, deriving content from these references. Do not assume those outputs already ship with the plugin.
7. Preserve posture from the references: black canvas, chalk type, paper bento cells, mono `+` CTAs, sensor accents (coral / tan / green / blue / purple) as high-signal only.
8. If an audit command is available in the consumer environment, run  
   `"$OD_NODE_BIN" "$OD_BIN" tools connectors design-system-package-audit --path . --fail-on-warnings`  
   and fix actionable issues in the **consumer** package — not by inventing files inside this plugin.

## Provenance

Formalized by Open Design from candidate `77e84dc9-ee63-471c-8cf2-c3c1576d2233`. See `references/provenance.json`.
