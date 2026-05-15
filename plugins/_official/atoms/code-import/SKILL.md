---
name: code-import
description: Read an existing repository's structure into the project cwd as a normalised snapshot the agent can analyse without re-walking the tree on every turn.
od:
  scenario: code-migration
  mode: import
---

# Code import

Spec §10 / §21.3.2: a code-migration / tune-collab run starts from a
real repo (cloned via `od project import` or a path the user
provided). This atom turns the raw checkout into a normalised
on-disk record that subsequent atoms (`design-extract`,
`rewrite-plan`, `patch-edit`) operate against. The point is to
**stop re-walking the tree on every turn** — the agent reads
`code/index.json` once and trusts the snapshot until the next
explicit re-import.

## Inputs

| Source | Required | Notes |
| --- | --- | --- |
| `repoPath` | yes | Absolute path to the repo's root, supplied via `od project import` or an upstream `od.context.assets[]` reference |
| `targetStack` | yes | { framework, packageManager, styleSystem, componentLibrary } via the matching `form` GenUI surface |

## Output

```text
project-cwd/
└── code/
    ├── index.json         # { files: { path, size, language, imports[] }[], packageJson?, lockfileKind, framework, styleSystem }
    ├── components.json    # detected components with file path + props snapshot
    ├── routes.json        # detected routing model (next/app, react-router, vite-router, …)
    └── meta.json          # { repoPath, gitSha, walkedAt, atomDigest, walkBudgetMs }
```

`code/index.json` is the input every other Phase 7 atom reads. The
walk respects a budget (`OD_CODE_IMPORT_BUDGET_MS`, default 60s) so
large monorepos don't burn an entire run on import.

## Convergence

The atom completes when `code/index.json` exists and contains at
least one entry. Empty repos abort with a clear error event so the
user re-imports.

## Anti-patterns the prompt fragment forbids

- Walking node_modules / .git / .next / dist / build (record in
  `code/index.json.skipped[]` with reason).
- Inferring a framework from a single file; require at least
  `package.json`'s declared dep + a build-config presence
  (`next.config.*`, `vite.config.*`, etc.).
- Treating commented-out imports as live edges.

## Status

Reserved id, prompt-only fragment in v1. The walker + framework
detector land in spec §16 Phase 7.
