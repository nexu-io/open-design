# patches/

pnpm patches applied to installed dependencies. Each patch is version-pinned: when a patched package is upgraded, `pnpm install` will fail until the patch is recreated against the new version.

## @anthropic-ai/sdk

No patch is applied. The Turbopack browser-bundle fix uses a `turbopack.resolveAlias` entry
in `apps/web/next.config.ts` instead (see `resolveAlias` key for
`@anthropic-ai/sdk/tools/agent-toolset/node`). The browser stub lives at
`apps/web/src/stubs/agent-toolset-node.ts`. This approach survives SDK version bumps
without touching any patch files.

**Why a stub is needed:** SDK >=0.88 added `beta.environments.EnvironmentWorker`, which
statically references `tools/agent-toolset/node.mjs`. That module imports `node:fs`,
`node:child_process`, etc. Turbopack traces dynamic imports statically and fails the browser
bundle with `does not support external modules (request: node:fs/promises)`. The alias
redirects those imports to a project-owned stub for the web app only; the daemon imports the
real Node.js implementation at runtime.
