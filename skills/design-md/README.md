# Stitch Design System Documentation Skill

## Install

```bash
npx skills add google-labs-code/stitch-skills --skill design-md --global
```

## Example Prompt

```text
Analyze my Furniture Collection project's Home screen and generate a comprehensive DESIGN.md file documenting the design system.
```

## Skill Structure

This repository follows the **Agent Skills** open standard. Each skill is self-contained with its own logic, workflow, and reference materials.

```text
design-md/
├── SKILL.md           — Core instructions & workflow
├── examples/          — Sample DESIGN.md outputs
└── README.md          — This file
```

## How it Works

When activated, the agent follows a structured design analysis pipeline:

1. **Retrieval**: Uses the Stitch MCP Server to fetch project screens, HTML code, and design metadata.
2. **Extraction**: Identifies design tokens including colors, typography, spacing, and component patterns.
3. **Translation**: Converts technical CSS/Tailwind values into descriptive, natural design language.
4. **Synthesis**: Generates a comprehensive DESIGN.md following the semantic design system format.
5. **Alignment**: Ensures output follows Stitch Effective Prompting Guide principles for optimal screen generation.
