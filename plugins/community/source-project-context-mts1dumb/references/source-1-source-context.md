# Source Project Context

This design-system workspace was created from an existing OpenDesign project. Treat the copied project files as the primary source evidence for the generated design system.

## Source project

- Source project id: bb760814-bca2-4004-a0cd-40f826270efa
- Source project name: Your Core Visual System Should Be
- New design-system project id: 79208616-2e51-4e2f-8a2f-e75f4448722e
- New design-system id: user:your-core-visual-system-should-be-design-system
- Source skill id: (none)
- Source design system id: professional

## Source metadata

```json
{
  "kind": "prototype",
  "nameSource": "prompt",
  "localCatalogScopes": {
    "designSystem": {
      "workspaceId": "sqin0z6pa1gqmzzguxe6fikj",
      "workspaceMemberId": "t6x0oi04oo7bogetnus0nzc4"
    }
  },
  "strategyBinding": {
    "schemaVersion": 1,
    "provenance": "automatic_default",
    "taskProfile": "prototype",
    "boundAt": 1788041295016
  },
  "exampleBinding": {
    "schemaVersion": 1,
    "provenance": "example_card",
    "pluginId": "example-social-carousel",
    "pluginSource": "/private/var/folders/y_/47p1qycd5jb64fkw04h6n9200000gn/T/AppTranslocation/2F480632-8D4B-429E-8F56-C621EB42C9BA/d/Open Design.app/Contents/Resources/open-design/plugins/_official/examples/social-carousel",
    "manifestSourceDigest": "sha256:cb0c3ac321cbd850a53da00a6ad1b901d40dc89e447c61ed697b456628776f28",
    "boundAt": 1788041295016
  },
  "scenarioBinding": {
    "schemaVersion": 1,
    "provenance": "automatic_default",
    "pluginId": "example-web-prototype",
    "snapshotId": "2aa978b6-49a1-4eb7-86ef-4e997da222b0",
    "taskProfile": "prototype",
    "boundAt": 1788042067062
  }
}
```

## Copied files

- preview.png
- south-florida-elevated-carousel.html
- brand-spec.md

## Skipped files

- (none)

## Generation contract

- Read this file before editing design-system outputs.
- Read the copied files directly from the project workspace; they are source evidence, not generated design-system output.
- Preserve high-signal assets, source examples, UI surfaces, copy, tokens, typography, and interaction patterns from the copied project.
- Generate a reusable OpenDesign design-system package in this same project: DESIGN.md, README.md, SKILL.md, colors_and_type.css, context/provenance, focused preview cards, preserved assets/build/fonts when available, and ui_kits/app/.
- Before final response, run `"$OD_NODE_BIN" "$OD_BIN" tools connectors design-system-package-audit --path . --fail-on-warnings` and fix every actionable issue.
