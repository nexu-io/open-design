---
name: reusable-workflow-author
description: Turn a one-line workflow brief into a local Open Design plugin folder (SKILL.md + open-design.json + example) ready to install into My plugins.
---

# reusable-workflow-author

Use this skill when the user describes a **reusable workflow** in one or two sentences and wants it shipped as an Open Design plugin they can install locally.

## Required outcome

Produce a folder named `generated-plugin/` in the active project workspace containing at minimum:

- `SKILL.md` — agent behavior, with frontmatter (`name`, `description`) and clear instructions.
- `open-design.json` — valid plugin manifest: `specVersion`, `name`, `version`, `description`, `od.kind`, `od.mode`, `od.taskKind`, `od.pipeline`, `od.inputs`, `od.capabilities`.

Add `examples/` or `assets/` only when they materially help the plugin be reviewed or run. Do not create empty directories.

## Authoring rules

- Follow `docs/plugins-spec.md` and the schema at `docs/schemas/open-design.plugin.v1.json`.
- `SKILL.md` is the canonical behavior description; `open-design.json` describes how OD installs, applies, and presents it.
- Keep the plugin local-user friendly — no marketplace publishing, enterprise trust, or private team catalog setup required to install it.
- Plugin id is lowercase letters, numbers, dashes, underscores, or dots. Derive it from the user's workflow verb (e.g. `brief-to-landing`, `sales-deck-from-csv`, `sponsor-pack-builder`).
- Keep `capabilities` minimal. Default to `["prompt:inject"]`; add `fs:read` only if the plugin stages assets into the project cwd, `fs:write` only for plugin-owned post-run writes.
- Do not invent `plugin.repo` owners. If `gh auth status` does not expose a real GitHub login, omit `plugin.repo` and report the auth problem with the recovery commands (`gh auth refresh`, `gh auth login`, or `od plugin publish-repo …`).

## Workflow

1. **Read the brief.** Extract the workflow goal in one sentence. If the brief is ambiguous, surface the smallest possible `<question-form>` to lock audience + output shape before writing files.
2. **Choose the task kind.** Pick one of `new-generation` (most common), `code-migration`, `figma-migration`, or `tune-collab`. Map the workflow to `od.mode` (e.g. `deck`, `landing`, `prototype`, `scenario`).
3. **Plan the pipeline.** Compose 2–4 stages from OD's first-party atoms:
   - `discovery` — `discovery-question-form`
   - `plan` — `direction-picker`, `todo-write`
   - `generate` — `file-write`, `live-artifact` (or `media-image` for asset-heavy workflows)
   - `critique` — `critique-theater` with `repeat: true`, `until: "critique.score>=4 || iterations>=3"`
4. **Declare inputs.** Surface the 1–3 fields the user must fill on the detail page (`name`, `type`, `required`, `placeholder`, default where obvious). Bind them to `od.useCase.query` via `{{var}}`.
5. **Write `SKILL.md`.** Frontmatter + a short prose body covering: when to fire, required outputs, the workflow steps, and any gotchas specific to this workflow.
6. **Write `open-design.json`.** Schema-valid, minimal `capabilities`, `od.pipeline.stages[]`, `od.useCase.query`, `od.inputs[]`. Set `specVersion: "1.0.0"`.
7. **Self-check.** Run `od plugin validate <folder>`; fix every error before reporting done.
8. **Finish with a readiness summary.** Name the files, state validate status, and point the user at one of three buttons in the plugin-folder card: **Add to My plugins**, **Publish repo**, or **Open Design PR**. Do not recreate those flows as freeform shell suggestions.

## Anti-patterns to avoid

- ❌ Aggressive `capabilities` (declaring `bash` / `network` / coarse `connector` when scoped `connector:<id>` would do).
- ❌ `connectors.required[]` without the matching `connector:<id>` capability.
- ❌ Pipeline stages without `atoms`, or stages that reference atoms not in the v1 surface set.
- ❌ Inventing `plugin.repo` owners such as `open-design-user`, `<vendor>`, `your-org`, or `your-username`.
- ❌ Stating `homepage` / `repo` URLs that the user has not actually published yet.
- ❌ Empty `examples/` or `assets/` directories created just to match a folder sketch.
- ❌ A pipeline longer than 4 stages — split the workflow instead.

## Validation

After writing the folder:

```bash
od plugin validate generated-plugin
od plugin pack    generated-plugin --out /tmp/reusable-workflow-author.tgz
od plugin install --source "$(pwd)/generated-plugin"
```

All three must succeed before reporting done. Validation errors must be fixed in place, not hand-waved.
