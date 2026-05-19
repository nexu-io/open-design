# patches/

pnpm patches applied to installed dependencies. Each patch is version-pinned: when a patched package is upgraded, `pnpm install` will fail until the patch is recreated against the new version.

## @anthropic-ai/sdk

### Why a patch is needed

SDK >=0.88 added `beta.environments.EnvironmentWorker` (`resources/beta/environments/work.mjs`).
That module statically imports `lib/environments/worker.mjs`, which lazily loads
`tools/agent-toolset/node.mjs` via a dynamic import with a static string literal.
`node.mjs` imports `node:fs`, `node:child_process`, etc. Because all imports up to
the `import()` call are *static*, bundlers (webpack, Turbopack) trace all the way to
`node.mjs` even though `EnvironmentWorker` is never used in the web app.

### What the patch does

The patch adds a `"browser"` field to the SDK's `package.json` that redirects the
two agent-toolset node entries to lightweight browser stubs:

```json
"browser": {
  "./tools/agent-toolset/node.mjs": "./tools/agent-toolset/node.browser.mjs",
  "./tools/agent-toolset/node.js":  "./tools/agent-toolset/node.browser.js"
}
```

Bundlers targeting the browser (webpack, Turbopack) apply the `browser` field at the
*resolved-path level* — they redirect `tools/agent-toolset/node.mjs` to the stub
regardless of whether it was imported via a bare specifier or a relative path from
within the package. The real `node.mjs` is untouched; the daemon loads the Node.js
implementation at runtime.

The stub files (`node.browser.mjs` / `node.browser.js`) throw a clear error if
called in a browser context, matching the shape of the real exports so type-checking
still passes.

### Recreating after an SDK version bump

```bash
pnpm patch @anthropic-ai/sdk@<new-version>
# Edit the temp directory: add node.browser.mjs, node.browser.js, update package.json browser field
pnpm patch-commit <temp-dir>
# Update package.json patchedDependencies entry to the new version
# Verify with: pnpm install && pnpm --filter @open-design/web build
```
