# Stitch to React Native Components Skill

## Install

```bash
npx skills add google-labs-code/stitch-skills --skill react-native --global
```

## Example Prompt

```text
Convert my Login screen in my Stitch Project to React Native components.
```

## Skill Structure

This skill follows the **Agent Skills** open standard. Each skill is self-contained with its own logic, validation scripts, and design tokens.

```text
skills/react-native/
├── SKILL.md           — Core instructions & workflow
├── package.json       — Validator dependencies
├── scripts/           — Networking & AST validation
├── resources/         — Architecture checklist & component templates
└── examples/          — Gold-standard code samples
```

## How it Works

When activated, the agent follows a design-to-native pipeline:

1. **Retrieval**: Uses a system-level `curl` script to download Stitch HTML and screenshots from Google Cloud Storage.
2. **Mapping**: Translates HTML elements to React Native primitives (`View`, `Text`, `Pressable`, `Image`, etc.) and converts CSS/Tailwind to `StyleSheet.create()` calls.
3. **Generation**: Scaffolds components using Atomic Design (atoms, molecules, organisms).
4. **Validation**: Runs an automated AST check to catch missing Props interfaces or hardcoded style values.
5. **Audit**: Performs a final self-correction check against the architecture checklist.
