---
name: code-scaffold
description: Multi-stage code generation and scaffolding workflow — accepts a brief, files, or URL references, plans file structure, generates code, and self-reviews before delivery.
od:
  scenario: code-scaffold
  mode: scenario
---

# code-scaffold (scenario)

Use this scenario when the user wants to generate code files from a natural-language brief, reference files, or a URL. The workflow discovers requirements, plans the output tree, generates every file, and reviews the result before delivering.

## Required outcome

Produce a working set of code files in the project workspace matching the user's brief. The output may be a single file or an entire project tree depending on scope.

## Inputs

The user provides one or more of:

- **A natural-language brief** — what to build, the language/framework, constraints.
- **Reference files** — existing code, images, docs, or configs that inform the scaffold.
- **A URL** — documentation, API reference, or example repo to pull context from.

The agent receives these through the plugin's declared inputs:

| Input | Type | Required | Purpose |
|-------|------|----------|---------|
| `brief` | string | yes | What to scaffold — the core requirement |
| `language` | string | no | Target language or framework (inferred if omitted) |
| `referenceUrl` | string | no | URL for documentation, API spec, or example repo |
| `outputDir` | string | no | Subdirectory for generated files (defaults to project root) |

## Pipeline

### Stage 1 — Discovery

Ask focused questions to lock scope before generating anything:

1. **What are we building?** — component, module, full project, config, script, API endpoint, CLI tool, etc.
2. **Target stack** — language, framework version, package manager, runtime.
3. **Scale** — how many files, rough structure, entry points.
4. **Constraints** — naming conventions, existing patterns to match, things to avoid.

If the brief already answers these, skip the question and confirm the inferred values. Emit a `<question-form>` only for genuinely ambiguous fields.

### Stage 2 — Plan

Before writing any code:

1. State the planned file tree aloud — every file path and its one-line purpose.
2. Identify shared patterns (imports, config shape, naming) that must be consistent across files.
3. Note any dependencies or setup the user will need after scaffolding.
4. Write the plan as a todo list (one item per file or logical group).

### Stage 3 — Build

Generate the code files in dependency order:

- **Shared first** — types, configs, utilities that other files import.
- **Core modules** — the main logic, components, or endpoints.
- **Entry points** — index files, main scripts, route registrations.
- **Supporting** — tests, configs, READMEs, CI files.

Rules during generation:

- Use the declared language/framework conventions (naming, file extensions, import style).
- No placeholder code — every function body must be real or have a clear `// TODO:` with a specific description.
- No invented dependencies — only import packages the user's stack actually uses.
- Match the user's existing code style if reference files were provided.
- Keep files focused — one concern per file, under 300 lines each.

### Stage 4 — Review

After all files are written, self-review across five dimensions:

1. **Correctness** — does the code compile/parse? Are imports valid? Are types consistent?
2. **Completeness** — does every file from the plan exist? Are all entry points wired up?
3. **Consistency** — same naming, same patterns, same style across all files?
4. **Specificity** — is the code specific to the brief, not generic boilerplate?
5. **Usability** — can the user run/use the output immediately? Are setup steps documented?

Score each 1–5. Any dimension under 3 → fix before delivering. Emit the review as a `critique.json` in the project root.

## Anti-patterns

- Generating a single monolithic file when the brief calls for a project structure.
- Inventing npm packages or APIs that don't exist.
- Using outdated framework patterns (class components in React, CommonJS in ESM projects).
- Adding boilerplate the user didn't ask for (license files, CI configs, contributing guides) unless the brief says "full project setup".
- Placeholder functions with empty bodies and no TODO comment.

## Convergence

The review stage repeats until `critique.score >= 4` or `iterations >= 3`. The critique score is the minimum across all five dimensions.

## Signals emitted

- `discovery.complete: boolean` — all required scope questions answered.
- `plan.ready: boolean` — file tree confirmed, todo list written.
- `build.complete: boolean` — all planned files generated.
- `critique.score: number` — min score across review dimensions (0–5).
