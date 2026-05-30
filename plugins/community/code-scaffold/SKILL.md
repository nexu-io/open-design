---
name: code-scaffold
description: K-Universe code scaffolding — multi-stage generation using --ku-* design tokens, Power Grotesk type system, and monochrome-first conventions.
od:
  scenario: code-scaffold
  mode: scenario
---

# code-scaffold (scenario)

Use this scenario when the user wants to scaffold code files using K-Universe design conventions. The workflow discovers requirements, plans the file tree, generates code referencing `--ku-*` design tokens, and self-reviews before delivery.

## Required outcome

Produce a working set of code files matching the user's brief. All visual output must use K-Universe design tokens (`--ku-*`) — never hardcoded hex colors or ad-hoc values.

## K-Universe Design Conventions

These conventions MUST be followed in all generated code. Deviations require explicit brief override.

### Color — monochrome-first, color earned

| Token | Value | Use |
|-------|-------|-----|
| `--ku-bg` | `#000000` | Page background |
| `--ku-surface` | `#111111` | Cards, panels (L1) |
| `--ku-surface-raised` | `#1A1A1A` | Raised elements (L2) |
| `--ku-surface-muted` | `#2A2A2A` | Disabled / inactive |
| `--ku-text` | `#FFFFFF` | Primary text |
| `--ku-text-secondary` | `rgba(255,255,255,0.6)` | Secondary text |
| `--ku-text-muted` | `rgba(255,255,255,0.35)` | Muted text |
| `--ku-primary` | `#0066FF` | Interactive CTA / accent |
| `--ku-primary-hover` | `#0052CC` | Hovered CTA |
| `--ku-primary-subtle` | `rgba(0,102,255,0.08)` | Subtle primary bg |
| `--ku-secondary` | `#00CC88` | Success / teal |
| `--ku-hud` | `#00FF41` | Live operational state ONLY |
| `--ku-success` | `#00DD77` | Success indicator |
| `--ku-warning` | `#FFAA00` | Warning |
| `--ku-error` | `#FF3333` | Error |
| `--ku-border` | `rgba(255,255,255,0.08)` | Default border |
| `--ku-border-strong` | `rgba(255,255,255,0.14)` | Emphasized border |

**Rules**: Never use `--ku-hud` for anything other than live operational state. Never hardcode hex when a `--ku-*` token exists. Color is earned — start monochrome, add color only for interactive or stateful elements.

### Typography — Power Grotesk, compact scale

| Token | Size | Weight | Line-height | Tracking |
|-------|------|--------|-------------|---------|
| `--ku-type-display` | 36px / 2.25rem | 700 | 1.1 | -0.02em |
| `--ku-type-h1` | 28px / 1.75rem | 700 | 1.1 | -0.02em |
| `--ku-type-h2` | 20px / 1.25rem | 500 | 1.25 | 0 |
| `--ku-type-h3` | 16px / 1rem | 500 | 1.25 | 0 |
| `--ku-type-body` | 14px / 0.875rem | 400 | 1.4 | 0 |
| `--ku-type-body13` | 13px / 0.8125rem | 400 | 1.4 | 0 |
| `--ku-type-tiny` | 12px / 0.75rem | 400 | 1.333 | 0.01em |
| `--ku-type-micro` | 10px / 0.625rem | 400 | 1.333 | 0.05em |

**Font stacks**:
- Primary/Display: `"Power Grotesk", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`
- Mono: `"JetBrains Mono", "Fira Code", "Consolas", monospace`

**Rules**: Never use `border-radius` unless the brief explicitly requests it. K-Universe default is `0` (sharp corners). Mono tracking is `0` — no letter-spacing on code.

### Spacing & layout

- Page gutters: 60px (desktop), 24px (mobile)
- Component gaps: 8px / 16px / 24px / 32px scale
- Max content width: 1320px
- Section spacing: 96px vertical between major sections

### Component patterns

- **Badge**: `font-family: var(--ku-font-primary)`, `font-size: var(--ku-type-micro)`, `text-transform: uppercase`, `tracking: 0.06em`, no `border-radius`
- **Button CTA**: `bg: var(--ku-primary)`, `color: #000`, `font-weight: 600`, `text-transform: uppercase`, `font-size: var(--ku-type-tiny)`, `px: 18px / py: 8px`
- **Section label**: `font-family: var(--ku-font-mono)`, `font-size: var(--ku-type-micro)`, `color: var(--ku-text-muted)`, `text-transform: uppercase`, `tracking: 0.16em`, `border-top: 1px solid var(--ku-border)`

## Inputs

| Input | Type | Required | Purpose |
|-------|------|----------|---------|
| `brief` | string | yes | What to scaffold — the core requirement |
| `language` | string | no | Target language or framework (inferred if omitted) |
| `referenceUrl` | string | no | URL for documentation, API spec, or example repo |
| `outputDir` | string | no | Subdirectory for generated files (defaults to project root) |
| `kuStyle` | boolean | no | Apply K-Universe design tokens and conventions (default: true) |

## Pipeline

### Stage 1 — Discovery

Ask focused questions to lock scope before generating anything:

1. **What are we building?** — component, module, full project, config, script, API endpoint, CLI tool, etc.
2. **Target stack** — language, framework version, package manager, runtime.
3. **Scale** — how many files, rough structure, entry points.
4. **Constraints** — naming conventions, existing patterns to match, things to avoid.
5. **Surface type** — app (compact tokens) vs marketing (editorial/canon tokens). Default: app.

If the brief already answers these, skip the question and confirm the inferred values. Emit a `<question-form>` only for genuinely ambiguous fields.

### Stage 2 — Plan

Before writing any code:

1. State the planned file tree aloud — every file path and its one-line purpose.
2. Identify shared patterns (imports, config shape, naming) that must be consistent across files.
3. Map which `--ku-*` tokens each file will reference.
4. Note any dependencies or setup the user will need after scaffolding.
5. Write the plan as a todo list (one item per file or logical group).

### Stage 3 — Build

Generate the code files in dependency order:

- **Shared first** — types, configs, utilities that other files import.
- **Core modules** — the main logic, components, or endpoints.
- **Entry points** — index files, main scripts, route registrations.
- **Supporting** — tests, configs, READMEs, CI files.

Rules during generation:

- Use `--ku-*` CSS custom properties for all visual values. No hardcoded hex.
- Match the font stacks exactly: Power Grotesk for UI, JetBrains Mono for code.
- No `border-radius` unless the brief explicitly requests rounded corners.
- Use `var(--ku-type-*)` tokens for all typography — never inline font sizes.
- No placeholder code — every function body must be real or have a clear `// TODO:` with a specific description.
- No invented dependencies — only import packages the user's stack actually uses.
- Match the user's existing code style if reference files were provided.
- Keep files focused — one concern per file, under 300 lines each.

### Stage 4 — Review

After all files are written, self-review across five dimensions:

1. **Correctness** — does the code compile/parse? Are imports valid? Types consistent?
2. **Completeness** — does every file from the plan exist? All entry points wired up?
3. **Consistency** — same naming, same patterns, same style across all files?
4. **Specificity** — code specific to the brief, not generic boilerplate?
5. **Token compliance** — zero hardcoded hex colors, all fonts via `--ku-*` tokens, no unearned `border-radius`?

Score each 1–5. Any dimension under 3 → fix before delivering. Emit the review as a `critique.json` in the project root.

## Anti-patterns

- Hardcoding hex colors when `--ku-*` tokens exist (`#000` → `var(--ku-bg)`, `#fff` → `var(--ku-text)`).
- Using `--ku-hud` (`#00FF41`) for anything other than live operational state.
- Adding `border-radius` without the brief explicitly requesting it.
- Using letter-spacing on monospace text (`--ku-font-mono` tracking is always `0`).
- Generating a single monolithic file when the brief calls for a project structure.
- Inventing npm packages or APIs that don't exist.
- Using outdated framework patterns (class components in React, CommonJS in ESM projects).
- Placeholder functions with empty bodies and no TODO comment.

## Convergence

The review stage repeats until `critique.score >= 4` or `iterations >= 3`. The critique score is the minimum across all five dimensions.

## Signals emitted

- `discovery.complete: boolean` — all required scope questions answered.
- `plan.ready: boolean` — file tree confirmed, todo list written.
- `build.complete: boolean` — all planned files generated.
- `critique.score: number` — min score across review dimensions (0–5).
- `ku.tokens.used: string[]` — list of `--ku-*` tokens referenced in generated code.