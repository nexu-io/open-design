---
name: reusable-workflow-builder
description: Convert a user's reusable workflow goal into a scoped Open Design generation workflow with discovery, planning, artifact creation, and review.
od:
  kind: scenario
  mode: scenario
  taskKind: new-generation
---

# Reusable Workflow Builder

Use this skill when the user wants to turn a concise workflow goal into a repeatable Open Design generation flow. The workflow can target HTML prototypes, decks, dashboards, marketing pages, image-led concepts, or plugin/workflow packages.

## Primary outcome

Create a usable artifact or workflow package that directly matches the user's stated goal. Keep the output local-user friendly: files should work in the active project workspace without marketplace publishing, private team setup, or external services unless the user explicitly asks for them.

## Inputs to honor

- `workflowGoal`: the core reusable workflow the user wants.
- `audience`: who the artifact or workflow is for.
- `artifactKind`: the intended output type, such as prototype, dashboard, deck, image, video, plugin, or other.
- `platform`: target surface or device family.
- `constraints`: hard requirements, references, copy, brand rules, and things to avoid.

If a required input is missing, ask the smallest possible set of questions that unblocks the work. Do not re-ask fields already supplied by plugin inputs, project metadata, attachments, or the current brief.

## Workflow

1. Inspect the current project files before editing when the request refers to existing work or asks to continue a previous run.
2. Resolve the requested workflow goal into a concrete deliverable, output surface, audience, and completion criteria.
3. If the user provides a brand guide, screenshot, or reference URL, extract visible colors, typography, spacing, and layout posture before writing files.
4. Commit to a short todo plan before authoring files, then update it as each item lands.
5. Create the minimum useful file set for the deliverable. Prefer one canonical entry file for a single surface and separate HTML files for distinct user-facing screens.
6. Use real, specific copy from the brief. If a value is unknown, use a short honest placeholder instead of invented metrics.
7. Include meaningful interactions when the requested screen has inputs, generation, filtering, copying, validation, playback, checkout, login, or other action verbs.
8. Run a self-review before handoff:
   - Clarity: the workflow goal is obvious.
   - Hierarchy: one primary action or idea leads each screen or slide.
   - Specificity: labels, states, and examples fit this user's brief.
   - Implementation readiness: CSS, JS, and file structure are readable.
   - Restraint: one visual flourish or accent role, not competing decorations.

## Output guidance by artifact type

- **Prototype or app UI:** build real product screens, not designer controls. Include domain-specific modules such as forms, status panels, charts, carts, editors, players, or workflows when appropriate.
- **Dashboard or tool UI:** prioritize density, scanning, filters, states, and table/chart behavior.
- **Landing or marketing page:** create a focused hero plus the requested sections, with concrete copy and one clear conversion action.
- **Deck:** use the fixed 1920 x 1080 deck framework when available. Keep one idea per slide and preserve slide navigation behavior.
- **Plugin or workflow package:** create a local folder with `SKILL.md`, `open-design.json`, and only useful supporting files such as `examples/` or `assets/`.

## Handoff

Finish with a concise readiness summary:

- Files created or changed.
- What is ready to use.
- Any validation that was run.
- Remaining follow-up, if any.
- Next action choices that fit the deliverable.
