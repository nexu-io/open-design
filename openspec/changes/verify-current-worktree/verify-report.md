# Verify report: current worktree readiness

## Status
Conditionally passed for repository build/test readiness after cleanup.

The initial verification was blocked by unresolved merge-conflict markers. Those markers have now been cleared from tracked files, workspace dependencies were refreshed, and the core validation commands listed below pass.

This does **not** prove the entire product will work perfectly. It proves the checked evidence passed in this environment.

## Actions taken

1. Backed up conflicted tracked files to `.tmp/sdd-conflict-backup-20260610-111331/`.
2. Restored conflicted tracked files to `HEAD` instead of guessing a risky merge between `Updated upstream` and `Stashed changes`.
3. Refreshed workspace links/dependencies with `corepack pnpm install` because `motion`, `lexical`, and `@open-design/components` were declared but not resolving before install.
4. Used a repo-local `.tmp/pnpm-shim/pnpm` wrapper for root typecheck because `corepack enable` cannot create `/usr/bin/pnpm` on this read-only filesystem.

## Evidence

### Conflict-marker search
Command:

```bash
rg -n "^(<<<<<<<|=======|>>>>>>>)" .gitignore apps/web/src/App.tsx apps/web/tests/components/App.connectors.test.tsx
```

Final result: no matches.

### Focused web typecheck
Command:

```bash
corepack pnpm --filter @open-design/web typecheck
```

Result: passed.

### Targeted web tests
Command:

```bash
corepack pnpm --filter @open-design/web test -- apps/web/tests/components/App.connectors.test.tsx
```

Result: passed.

Observed Vitest summary:

```text
Test Files  321 passed (321)
Tests       3168 passed | 1 skipped (3169)
```

Note: jsdom printed repeated `HTMLCanvasElement.getContext()` not-implemented messages, but the suite still passed.

### Repository guard
Command:

```bash
corepack pnpm guard
```

Result: passed.

### Repository typecheck
Initial command:

```bash
corepack pnpm typecheck
```

Result: failed due shell tooling only. The package script invokes `pnpm` internally, but this container did not have a `pnpm` executable on `PATH`.

Corepack shim attempt:

```bash
corepack enable
```

Result: failed with `EROFS` because `/usr/bin` is read-only.

Equivalent command with repo-local shim:

```bash
PATH="$PWD/.tmp/pnpm-shim:$PATH" pnpm typecheck
```

Result: passed.

### LSP diagnostics
Command/tool:

```text
lsp_diagnostics for apps/web/src/App.tsx and apps/web/tests/components/App.connectors.test.tsx, severity=error
```

Result: no diagnostics found.

### Lens diagnostics
`lens_diagnostics mode=all` now reports no blocking errors for the previously conflicted files. It still reports code-quality warnings in `App.tsx` and `App.connectors.test.tsx` such as high complexity and duplicate literals. These are maintainability warnings, not validation blockers for this cleanup.

## Final git status notes
No tracked product source diff remains after restoring unintended local changes. The intended commit diff is limited to the Docker workflow plus the OpenSpec verification artifacts.

Transient local artifacts were removed:

- `.atl/`
- `.gitignore.orig`
- `.pi/`
- `apps/daemon/.pi-lens/`
- `apps/web/.pi-lens/`
- `apps/web/src/App.tsx.orig`
- `apps/web/tests/components/App.connectors.test.tsx.orig`
- `sdd/`

The root `context.md` analysis was moved into this SDD change as `devtools-context.md` and the root copy was removed.

Before staging, the intentionally retained OpenSpec artifacts remain untracked by design. They are part of the SDD evidence for this commit.

## DevTools fix alignment
The current verification cleaned the conflicted worktree and validated baseline readiness. It did **not** implement or verify the DevTools console-error fixes described in `devtools-context.md`.

If that is the intended product fix, create a separate SDD change targeting the actual root-cause files listed in `devtools-context.md`, including:

- `apps/web/src/runtime/srcdoc.ts`
- `apps/web/src/components/FileViewer.tsx`
- `apps/daemon/src/server.ts`
- `apps/daemon/src/connectors/routes.ts`

## Docker image workflow verification

### Finding
The Docker image workflow comments and metadata already described `main` publishing (`edge` + `sha-*`) and pull request smoke-build behavior, but the workflow trigger only listened to version tags:

```yaml
on:
  push:
    tags: ['v*.*.*']
```

That meant a normal push to `main` would **not** create a Docker image.

### Fix
Updated `.github/workflows/docker-image.yml` so:

- `push` to `main` runs the workflow and publishes the branch-ref tag, `edge`, and `sha-*` tags.
- `push` of `v*.*.*` tags still publishes release tag, `latest`, and `sha-*` tags.
- `pull_request` runs Docker build smoke tests without pushing, scoped to Docker/build-relevant paths including Dockerfile inputs such as `scripts/**` and `e2e/**`.

### Build-path evidence
Docker is not installed in this environment (`docker: command not found`), so a real local `docker buildx`/runtime-image verification could not be executed here.

As a substitute, the critical in-Docker build commands were executed directly:

```bash
corepack pnpm --filter @open-design/daemon build
corepack pnpm --filter @open-design/web build
corepack pnpm --filter @open-design/daemon deploy --legacy --prod "$PWD/.tmp/docker-verify-daemon"
test -f .tmp/docker-verify-daemon/dist/cli.js
test -d apps/web/out
```

Result: passed (`DOCKERFILE_BUILD_STEPS_OK`).

The production Next build updated `apps/web/next-env.d.ts` from `.next/dev/types/routes.d.ts` to `.next/types/routes.d.ts` locally. That generated churn was reverted before commit because this repository has tooling that restores the development route-types reference after build/prepare flows.

## Conclusion
The previous blocker is resolved: tracked files no longer contain conflict markers, focused web validation passes, guard passes, workspace typecheck passes with a local pnpm shim, and the Docker workflow now runs for `main` pushes and PR smoke builds.

Residual limitation: Docker itself is unavailable in this container, so the final image build/push must be verified by GitHub Actions after push. The local evidence validates workflow syntax through YAML/LSP, repo checks, and the Dockerfile's key build commands, but not the actual multi-arch Buildx runtime image.

Remaining scope risk: this verification proves baseline/deploy readiness after conflict cleanup and Docker workflow correction, not the separate DevTools console-error product fix described in `devtools-context.md`.
