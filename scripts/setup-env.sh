#!/usr/bin/env bash
# setup-env.sh — lock pnpm to the version pinned in package.json#packageManager.
# Run this after cloning and before any pnpm install / pnpm tools-dev command.
#
# This repo requires pnpm >=10.33.2 <11.
# On Windows, bare `pnpm` may drift to 11.x via npm global updates.
# This script ensures the correct version is activated via Corepack.
# All commands in this repo should be prefixed with `corepack pnpm`, not bare `pnpm`.

set -euo pipefail

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
REPO_ROOT="$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)"
REQUIRED_PNPM="$(node -p "require(process.argv[1]).packageManager.split('@')[1]" "$REPO_ROOT/package.json")"

echo "Activating pnpm@${REQUIRED_PNPM} via corepack..."
corepack prepare "pnpm@${REQUIRED_PNPM}" --activate

echo "Verifying with corepack pnpm..."
CURRENT="$(corepack pnpm --version 2>/dev/null || echo 'failed')"

if [ "$CURRENT" != "$REQUIRED_PNPM" ]; then
  echo "ERROR: expected pnpm ${REQUIRED_PNPM}, got ${CURRENT}" >&2
  exit 1
fi

echo "corepack pnpm ${CURRENT} is active — use 'corepack pnpm' for all commands in this repo"
