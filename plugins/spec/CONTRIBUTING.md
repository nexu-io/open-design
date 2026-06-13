# Contributing Plugins

Language: English | [简体中文](CONTRIBUTING.zh-CN.md)

Plugins that follow this spec can live in this repo as examples, or in their own public repositories with a PR that adds them to a marketplace index.

## Accepted Contributions

- New example plugins under `plugins/spec/examples/<plugin-id>/`.
- Improvements to templates, authoring docs, evals, or PR checklists.
- Fixes that make plugin folders more portable across Agent Skills compatible clients.
- Marketplace index updates that point to public plugin repos.
- Registry publishing notes for skills.sh, ClawHub, or another dedicated skill registry.

## Review Checklist

Reviewers should check:

- The plugin has a portable `SKILL.md`.
- `open-design.json` declares `specVersion` and a plugin `version`.
- `open-design.json` does not duplicate the skill body.
- The plugin lane is clear: import, create, export, share, deploy, refine, or extend.
- The output mode is clear for create plugins: prototype, deck, live-artifact, image, video, hyperframes, audio, or design-system.
- Capabilities are minimal.
- Externally visible actions are guarded by user confirmation.
- Visual examples include a preview or concrete output.
- Registry publishing claims link to canonical source and do not imply registry endorsement.
- JSON is valid and validation commands are listed in the PR.

## PR Template

```markdown
## Plugin

- ID:
- Spec version:
- Plugin version:
- Lane:
- Mode:
- Source:

## What it does

## Trigger examples

## Capabilities

## Validation

## Screenshots or example outputs

## Registry publishing

- Canonical source:
- Marketplace catalog version:
- skills.sh:
- ClawHub:
- Other registries:
```
