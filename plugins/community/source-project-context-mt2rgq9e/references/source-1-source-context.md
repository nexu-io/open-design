# Source Project Context

This design-system workspace was created from an existing OpenDesign project. Treat the copied project files as the primary source evidence for the generated design system.

## Source project

- Source project id: 423b4bd1-640e-4dcd-9cb1-e11aa0c9186d
- Source project name: Web Prototype
- New design-system project id: aeadc299-6651-467a-b576-7c242466acdf
- New design-system id: user:web-prototype-design-system
- Source skill id: (none)
- Source design system id: (none)

## Source metadata

```json
{
  "kind": "prototype",
  "nameSource": "prompt",
  "linkedDirs": [
    "/Users/parasana/Downloads/Antigravity/portifolio"
  ]
}
```

## Copied files

- portfolio-os.html
- sketch-2026-08-21T07-55-24.sketch.json
- tsconfig.json
- README.md
- quality.md
- skills-lock.json
- package.json
- postcss.config.mjs
- package-lock.json
- AGENTS.md
- next.config.ts
- k8s-deployment.yaml
- next-env.d.ts
- eslint.config.mjs
- Dockerfile
- docker-compose.yml
- components.json
- CLAUDE.md

## Skipped files

- (none)

## Generation contract

- Read this file before editing design-system outputs.
- Read the copied files directly from the project workspace; they are source evidence, not generated design-system output.
- Preserve high-signal assets, source examples, UI surfaces, copy, tokens, typography, and interaction patterns from the copied project.
- Generate a reusable OpenDesign design-system package in this same project: DESIGN.md, README.md, SKILL.md, colors_and_type.css, context/provenance, focused preview cards, preserved assets/build/fonts when available, and ui_kits/app/.
- Before final response, run `"$OD_NODE_BIN" "$OD_BIN" tools connectors design-system-package-audit --path . --fail-on-warnings` and fix every actionable issue.
