---
name: od-share-to-community
description: Package the user's just-finished work as an Open Design plugin without asking for fields the project files already answer, then surface the existing Add-to-My-plugins / Open-Design-PR buttons.
od:
  scenario: plugin-sharing
  mode: scenario
---

# od-share-to-community (scenario)

Triggered by the post-completion "Share to Open Design" submission action. The user just finished a piece of work in this project and wants to ship it as a plugin. They have not been asked any questions yet.

## Required outcome

Produce a folder named `generated-plugin/` in the active project workspace. At minimum:

- `SKILL.md` with frontmatter and clear agent instructions.
- `open-design.json` with valid plugin metadata: `specVersion`, `name`, `version`, `description`, mode, task kind, inputs, plus any pipeline / context references the workflow needs.
- `plugin.repo` is optional during scaffolding, but do not silently omit it: check `gh --version` and `gh auth status`, then prefer the local account login printed by auth status. Only use `gh api user --jq .login` as a fallback when auth status does not expose a login. If `gh` is missing, not logged in, rate-limited, or cannot resolve a real owner, omit `plugin.repo` instead of inventing an owner and explicitly report the auth problem with `gh auth refresh -h github.com -s repo,workflow`, `gh auth login -h github.com -s repo,workflow`, or `od plugin publish-repo generated-plugin --owner <github-login-or-org>` as recovery commands. Never write placeholder owners such as `open-design-user`, `<vendor>`, `example-user`, `your-org`, or `your-username` into the final manifest.
- Optional `examples/` and `assets/` only when they help review or reuse.

## Auto-derive from the project — do not ask the user fields the files already answer

The agent's CWD is the user's OD project root. Before generating anything, **read what's already there** and infer the plugin from it. Treat the project files as the source of truth; the user does not need to retype things you can see.

What to read, in this order, and what to take from each:

1. `*.artifact.json` (or `artifact.json`) at the project root — task kind, mode, the prompt the user actually ran, the file the agent produced. This drives `od.taskKind`, `od.mode`, the default `useCase.query`, and the example output path.
2. `brand-spec.md` / `DESIGN.md` if present — voice, brand name, audience. Folds into the plugin description and tags.
3. The list of generated artifacts in the project workspace (the `*.html`, `*.tsx`, `*.svg`, etc. the agent wrote during this session) — pick the most recent / largest one as `useCase.exampleOutputs[0].path` after copying it under `generated-plugin/examples/`.
4. The user's first prompt in this conversation, if surfaced via the runtime — the natural-language description of what they wanted. Folds into `description` and the default `useCase.query`.

Pick a stable plugin id from what you derived: lowercase letters, numbers, dashes, underscores, dots. Prefer something the brand-spec or artifact metadata suggests over inventing one.

If a field truly cannot be derived (e.g. no artifact.json exists, no brand-spec, the project is too sparse), only then ask the user — and ask in **one** consolidated `AskUserQuestion`, not field-by-field. Default the answers from whatever you did manage to derive so the user can accept by clicking through.

## Validate the plugin locally before reporting

Run `od plugin validate` on the folder, then `od plugin pack` for a tarball, then `od plugin install --source <absolute-folder-path>` to confirm the install path works.

## When the work above is done

Write a single summary turn covering: files created, `od plugin validate` status, local install / run status, and `od plugin pack` output. Then STOP.

## Do NOT chain the publish-repo / Open-Design-PR flows yourself

Do NOT suggest follow-up CLI commands such as `od plugin publish`, `od plugin publish --to open-design`, `gh repo create`, `git init` / `git remote add` / `git push`, or any other publish / repo wiring. The plugin-folder card under Design Files already exposes three buttons whose prompts drive those flows end-to-end with the right auth gates, fallbacks, and retry rules baked in:

- **Add to My plugins** — already satisfied by this turn's `od plugin install --source` step.
- **Publish repo** — creates / updates the author's `plugin.repo` GitHub repo through a gh + git sequence the agent is told exactly how to run.
- **Open Design PR** — opens a draft PR against `nexu-io/open-design` for the community catalog.

Point the user at whichever button they want next; do NOT recreate those flows as freeform shell suggestions in this summary. Recreating them drifts from the button prompts' guarantees and is the source of the bug that closed #2332.

## Do NOT assume `jq` is on PATH

Do NOT assume the standalone `jq` binary is installed (it is not part of the OD agent runtime baseline and is missing from default macOS / Windows shells). When you need to read the manifest, prefer your built-in file-reading tool, then `cat generated-plugin/open-design.json` followed by manual JSON parsing, then `node -e 'console.log(JSON.parse(require("fs").readFileSync("generated-plugin/open-design.json","utf8")))'`. The `gh ... --jq` flag is fine because gh ships its own embedded library; the brew-installed standalone `jq` is NOT.

## Language

Mirror the user's chat language in any `AskUserQuestion` labels, status updates, and error explanations. Generated artifacts (manifest fields, SKILL.md body, PR / commit messages, branch names) MUST stay English regardless of the chat language — that's the OD plugins-spec convention and matches the existing scenarios under `plugins/_official/scenarios/`.

## Suggested folder shape

```text
generated-plugin/
  SKILL.md
  open-design.json
  examples/
    <copied-from-the-project>
  assets/
    <if-needed>
```

## Spec references

- `docs/plugins-spec.md`
- `docs/schemas/open-design.plugin.v1.json`
- The sibling `plugins/_official/scenarios/od-plugin-authoring/SKILL.md` for the from-scratch authoring counterpart.
