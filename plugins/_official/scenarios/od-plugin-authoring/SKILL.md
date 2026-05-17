---
name: od-plugin-authoring
description: Guided scenario for creating an Open Design plugin folder that can be installed into My plugins.
od:
  scenario: plugin-authoring
  mode: scenario
---

# od-plugin-authoring (scenario)

Use this scenario when the user wants to create their own Open Design plugin.

## Required outcome

Produce a folder named `generated-plugin/` in the active project workspace.
At minimum, the folder must contain:

- `SKILL.md` with frontmatter and clear agent instructions.
- `open-design.json` with valid plugin metadata, `od.kind`, mode, task kind, capabilities, and inputs when needed.

Add `examples/`, `assets/`, or other supporting files only when they help the plugin be used or reviewed.

## Authoring rules

- Follow `docs/plugins-spec.md` and the schema at `docs/schemas/open-design.plugin.v1.json`.
- Treat `SKILL.md` as the canonical behavior description. `open-design.json` should describe how Open Design installs, applies, and presents that behavior.
- Keep the generated plugin local-user friendly: it should not require marketplace publishing, enterprise trust setup, or private team catalog configuration.
- Choose a stable plugin id from the user's requested workflow. Use lowercase letters, numbers, dashes, underscores, or dots.
- Include a short readiness summary when finished:
  - Files created.
  - Whether the folder is ready to add to My plugins.
  - Any validation or follow-up needed before install.
  - A direct next-action prompt that offers: Add to My plugins, Publish repo, or Open Design PR.

## Suggested folder shape

```text
generated-plugin/
  SKILL.md
  open-design.json
  examples/
  assets/
```

The `examples/` and `assets/` directories are optional. Do not create empty directories just to match the sketch.
