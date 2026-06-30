# Package manager setup for this repo

## Required version

pnpm **10.33.2** (pinned in `package.json#packageManager`).

## Why `corepack pnpm`, not bare `pnpm`

On Windows, `npm install -g pnpm` may install a version that drifts over time
(e.g. to 11.x), breaking the `engines` constraint in `package.json`.
`corepack prepare pnpm@<version> --activate` writes the pinned binary into
Corepack's managed shim, which respects the `packageManager` field and stays
consistent across shells.

## One-time setup

```bash
# Git Bash
bash scripts/setup-env.sh

# PowerShell
powershell -ExecutionPolicy Bypass scripts/setup-env.ps1
```

## Daily commands

After setup, **always** use `corepack pnpm` instead of bare `pnpm`:

```bash
corepack pnpm install
corepack pnpm --filter @open-design/desktop build
corepack pnpm tools-dev run web
corepack pnpm tools-dev          # daemon + web + desktop in background
corepack pnpm tools-dev stop
```

Do **not** use bare `pnpm` in this repo.
