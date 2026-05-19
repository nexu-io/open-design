# patches/

pnpm patches applied to installed dependencies. Each patch is version-pinned: when a patched package is upgraded, `pnpm install` will fail until the patch is recreated against the new version.

## @anthropic-ai/sdk

**File:** `@anthropic-ai__sdk@0.97.1.patch`  
**Why:** SDK >=0.88 added `beta.environments.EnvironmentWorker`, which statically references `tools/agent-toolset/node.mjs`. That module imports `node:fs`, `node:child_process`, etc. Turbopack traces dynamic imports statically and fails the browser bundle with `does not support external modules (request: node:fs/promises)`. The patch replaces those two files with browser-safe stubs that export the same API surface but throw a descriptive error if called. `EnvironmentWorker` is a server-side managed-agent runner never used in this browser-only app.

**When upgrading the SDK:**

```bash
# 1. Bump the version in apps/web/package.json, then:
pnpm install  # will fail — patch no longer applies

# 2. Create a fresh editable copy of the new version:
pnpm patch @anthropic-ai/sdk@<new-version>
# pnpm prints a temp dir path, e.g. /tmp/pnpm-patch-abc123

# 3. Overwrite the two stub files in that temp dir with the content from
#    the existing patch (adapting exports to match any new SDK surface):
#      <tmp>/tools/agent-toolset/node.js   (CJS stub)
#      <tmp>/tools/agent-toolset/node.mjs  (ESM stub)

# 4. Commit the new patch:
pnpm patch-commit /tmp/pnpm-patch-abc123
# pnpm writes the new patch file and updates package.json patchedDependencies

# 5. Update the patch filename reference in this README.
```

**Alternative (eliminates re-patching on every bump):** Add a `turbopack.resolveAlias` entry in `apps/web/next.config.ts` to redirect the module to a project-owned stub file. This survives SDK version bumps without touching the patch. See Next.js Turbopack docs for `resolveAlias` syntax.
