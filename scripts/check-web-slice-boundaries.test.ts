import assert from "node:assert/strict";
import { mkdir, rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import test, { mock } from "node:test";

import ts from "typescript";

import {
  checkWebSliceBoundaries,
  collectImportBoundaryViolations,
  fetchedRoutesOf,
  resolveViaTypeScript,
  resolveWebImport,
} from "./check-web-slice-boundaries.ts";

const ORCHESTRATOR = "apps/web/src/components/MemorySection.tsx";
const APP_ROUTE = "apps/web/app/[[...slug]]/page.tsx";
const SIBLING_SLICE_FILE = "apps/web/src/features/mcp/components/Panel.tsx";

test("resolveWebImport maps the @/* alias onto the apps/web root", () => {
  assert.equal(
    resolveWebImport(ORCHESTRATOR, "@/src/features/memory/hooks/useMemoryConfig.hooks"),
    "apps/web/src/features/memory/hooks/useMemoryConfig.hooks",
  );
  assert.equal(
    resolveWebImport(ORCHESTRATOR, "../features/memory"),
    "apps/web/src/features/memory",
  );
  assert.equal(resolveWebImport(ORCHESTRATOR, "react"), null);
});

test("resolveWebImport falls back to the hand-mapped @/* join only when real resolution fails", () => {
  // No real file at this path — ts.resolveModuleName fails, so the fallback
  // string join must still fire rather than silently returning null.
  assert.equal(
    resolveWebImport(ORCHESTRATOR, "@/does/not/exist/anywhere"),
    "apps/web/does/not/exist/anywhere",
  );
});

test("outside-in: a relative deep import into a slice is rejected", () => {
  const violations = collectImportBoundaryViolations(
    ORCHESTRATOR,
    "import { useMemoryConfig } from '../features/memory/hooks/useMemoryConfig.hooks';",
  );
  assert.equal(violations.length, 1);
  assert.match(violations[0]?.message ?? "", /deep import into slice `memory` from outside features\//);
});

test("outside-in: an @/-aliased deep import into a slice is rejected too", () => {
  const violations = collectImportBoundaryViolations(
    ORCHESTRATOR,
    "import { useMemoryConfig } from '@/src/features/memory/hooks/useMemoryConfig.hooks';",
  );
  assert.equal(violations.length, 1);
  assert.match(violations[0]?.message ?? "", /deep import into slice `memory` from outside features\//);
});

test("outside-in: a differently cased alias path cannot evade the slice boundary", () => {
  const violations = collectImportBoundaryViolations(
    ORCHESTRATOR,
    "import { useMemoryConfig } from '@/src/FEATURES/memory/hooks/useMemoryConfig.hooks';",
  );
  assert.equal(violations.length, 1);
  assert.match(violations[0]?.message ?? "", /deep import into slice `memory` from outside features\//);
});

test("outside-in: an app-route deep import into a slice is rejected", () => {
  const violations = collectImportBoundaryViolations(
    APP_ROUTE,
    "import { useMemoryConfig } from '@/src/features/memory/hooks/useMemoryConfig.hooks';",
  );
  assert.equal(violations.length, 1);
  assert.match(violations[0]?.message ?? "", /deep import into slice `memory` from outside features\//);
});

test("outside-in: the slice's public barrel is allowed, relative or aliased", () => {
  assert.deepEqual(
    collectImportBoundaryViolations(ORCHESTRATOR, "import { MemorySection } from '../features/memory';"),
    [],
  );
  assert.deepEqual(
    collectImportBoundaryViolations(ORCHESTRATOR, "import { MemorySection } from '@/src/features/memory';"),
    [],
  );
});

test("cross-slice: relative and aliased deep imports between slices are rejected", () => {
  const relative = collectImportBoundaryViolations(
    SIBLING_SLICE_FILE,
    "import { useMemoryConfig } from '../../memory/hooks/useMemoryConfig.hooks';",
  );
  assert.equal(relative.length, 1);
  assert.match(relative[0]?.message ?? "", /deep import into slice `memory`/);

  const aliased = collectImportBoundaryViolations(
    SIBLING_SLICE_FILE,
    "import { useMemoryConfig } from '@/src/features/memory/hooks/useMemoryConfig.hooks';",
  );
  assert.equal(aliased.length, 1);
  assert.match(aliased[0]?.message ?? "", /deep import into slice `memory`/);
});

test("outside-in: a trailing-slash barrel import is still treated as the barrel", () => {
  assert.deepEqual(
    collectImportBoundaryViolations(ORCHESTRATOR, "import { MemorySection } from '../features/memory/';"),
    [],
  );
});

test("outside-in: a loose top-level features/ file deep-importing a slice is rejected", () => {
  // `sliceOfRel` is null for a file directly under features/, but that file is
  // still an outside-slice consumer — it must not be a slice-less spot from
  // which slice internals are reachable.
  const violations = collectImportBoundaryViolations(
    "apps/web/src/features/libraryUi.ts",
    "import { useMemoryConfig } from './memory/hooks/useMemoryConfig.hooks';",
  );
  assert.equal(violations.length, 1);
  assert.match(violations[0]?.message ?? "", /deep import into slice `memory` from outside features\//);
});

test("outside-in: a loose top-level features/ file may still import a slice's public barrel", () => {
  assert.deepEqual(
    collectImportBoundaryViolations(
      "apps/web/src/features/libraryUi.ts",
      "import { MemorySection } from './memory';",
    ),
    [],
  );
});

test("cross-slice: importing a sibling slice's barrel is allowed", () => {
  assert.deepEqual(
    collectImportBoundaryViolations(SIBLING_SLICE_FILE, "import { MemorySection } from '../../memory';"),
    [],
  );
});

test("provider binding: only dependencies.ts may import providers/ (alias included)", () => {
  const featureFile = "apps/web/src/features/memory/hooks/useMemoryConfig.hooks.ts";
  assert.match(
    collectImportBoundaryViolations(featureFile, "import { memoryConfigPort } from '@/src/providers/memory/config';")[0]
      ?.message ?? "",
    /only dependencies\.ts may bind a provider/,
  );
  assert.deepEqual(
    collectImportBoundaryViolations(
      "apps/web/src/features/memory/dependencies.ts",
      "import { memoryConfigPort } from '@/src/providers/memory/config';",
    ),
    [],
  );
});

test("provider binding: the exception is limited to the slice-root dependencies.ts", () => {
  for (const featureFile of [
    "apps/web/src/features/memory/components/dependencies.ts",
    "apps/web/src/features/dependencies.ts",
  ]) {
    const violations = collectImportBoundaryViolations(
      featureFile,
      "import { memoryConfigPort } from '@/src/providers/memory/config';",
    );
    assert.equal(violations.length, 1);
    assert.match(violations[0]?.message ?? "", /only dependencies\.ts may bind a provider/);
  }
});

test("bare package specifiers never touch the slice boundary", () => {
  assert.deepEqual(
    collectImportBoundaryViolations(ORCHESTRATOR, "import { useCallback } from 'react';"),
    [],
  );
});

test("resolveViaTypeScript closes the config-drift gap: a hypothetical NEW tsconfig alias still resolves into the repo", () => {
  // A specifier form the hand-matched `resolveWebImport` branches don't know
  // about (neither relative nor `@/`) must not be silently treated as a
  // harmless bare package if it actually resolves into this repo under a
  // DIFFERENT tsconfig `paths` entry — the exact drift a future config
  // change (a new alias, `baseUrl`, or package.json `imports` subpath) would
  // introduce. Proven with a virtual host/config so this doesn't require
  // mutating the real apps/web/tsconfig.json.
  const repoRootAbs = path.resolve(import.meta.dirname, "..");
  const webRootAbs = path.join(repoRootAbs, "apps", "web");
  const resolvedAbs = path.join(
    webRootAbs,
    "src/features/memory/hooks/useMemoryConfig.hooks.ts",
  );
  const host: ts.ModuleResolutionHost = {
    fileExists: (p) => p === resolvedAbs,
    readFile: (p) => (p === resolvedAbs ? "" : undefined),
    directoryExists: () => true,
    getCurrentDirectory: () => webRootAbs,
    getDirectories: () => [],
  };
  const compilerOptions: ts.CompilerOptions = {
    baseUrl: webRootAbs,
    paths: { "~/*": ["./*"] },
    moduleResolution: ts.ModuleResolutionKind.Bundler,
  };

  const resolved = resolveViaTypeScript(
    ORCHESTRATOR,
    "~/src/features/memory/hooks/useMemoryConfig.hooks",
    host,
    compilerOptions,
  );
  assert.equal(resolved, "apps/web/src/features/memory/hooks/useMemoryConfig.hooks");

  // The SAME mechanism must apply when `@/*` ITSELF is remapped, not just for
  // an unrelated new alias — resolveWebImport's `@/`-prefix fallback join
  // hardcodes `@/* -> apps/web/*`, and must not keep using that hardcoded
  // assumption once tsconfig repoints `@/*` somewhere else (e.g. to `src/*`).
  const remappedResolved = resolveViaTypeScript(
    ORCHESTRATOR,
    "@/features/memory/hooks/useMemoryConfig.hooks",
    host,
    { baseUrl: webRootAbs, paths: { "@/*": ["./src/*"] }, moduleResolution: ts.ModuleResolutionKind.Bundler },
  );
  assert.equal(remappedResolved, "apps/web/src/features/memory/hooks/useMemoryConfig.hooks");

  // The same mechanism must still return null for a genuine external
  // package resolving into node_modules, not flag it as a boundary escape.
  const packageAbs = path.join(repoRootAbs, "node_modules", "left-pad", "index.js");
  const packageHost: ts.ModuleResolutionHost = {
    fileExists: (p) => p === packageAbs || p.endsWith("package.json"),
    readFile: (p) =>
      p.endsWith("package.json") ? JSON.stringify({ name: "left-pad", main: "index.js" }) : "",
    directoryExists: () => true,
    getCurrentDirectory: () => webRootAbs,
    getDirectories: () => [],
  };
  assert.equal(
    resolveViaTypeScript(ORCHESTRATOR, "left-pad", packageHost, { moduleResolution: ts.ModuleResolutionKind.Bundler }),
    null,
  );
});

test("transport-free: self.fetch and self['fetch'] are flagged the same as globalThis.fetch", () => {
  const featureFile = "apps/web/src/features/memory/hooks/useMemoryConfig.hooks.ts";
  const dotForm = collectImportBoundaryViolations(featureFile, "async function f() { await self.fetch('/api/memory'); }");
  assert.equal(dotForm.length, 1);
  assert.match(dotForm[0]?.message ?? "", /uses `fetch`/);

  const bracketForm = collectImportBoundaryViolations(
    featureFile,
    "async function f() { await self['fetch']('/api/memory'); }",
  );
  assert.equal(bracketForm.length, 1);
  assert.match(bracketForm[0]?.message ?? "", /uses `fetch`/);
});

test("transport-free: destructuring fetch out of globalThis or self is flagged, renamed or not", () => {
  const featureFile = "apps/web/src/features/memory/hooks/useMemoryConfig.hooks.ts";
  // Shorthand `{ fetch }` flags twice: the destructure site itself (already
  // caught pre-rewrite, regardless of source object) AND the subsequent bare
  // `fetch(...)` call — the local binding is still literally named `fetch`.
  const shorthand = collectImportBoundaryViolations(
    featureFile,
    "const { fetch } = globalThis; fetch('/api/memory');",
  );
  assert.equal(shorthand.length, 2);
  assert.ok(shorthand.every((v) => /uses `fetch`/.test(v.message)));

  // The renamed form is the gap this rewrite closes: the local binding
  // (`doFetch`) is never itself a forbidden name, so ONLY the destructure
  // site — extracting `fetch` from globalThis/self — can catch it.
  for (const sourceText of [
    "const { fetch: doFetch } = globalThis; doFetch('/api/memory');",
    "const { fetch: doFetch } = self; doFetch('/api/memory');",
  ]) {
    const violations = collectImportBoundaryViolations(featureFile, sourceText);
    assert.equal(violations.length, 1, `expected one violation for: ${sourceText}`);
    assert.match(violations[0]?.message ?? "", /uses `fetch`/);
  }
});

test("transport-free: a renamed destructure from an UNRELATED object is not mistaken for the global", () => {
  // Proves the destructuring check is scoped to globalThis/self specifically
  // — renaming an unrelated object's property must not become a new false
  // positive just because the local or source property happens to be named
  // like a forbidden global.
  const featureFile = "apps/web/src/features/memory/hooks/useMemoryConfig.hooks.ts";
  assert.deepEqual(
    collectImportBoundaryViolations(
      featureFile,
      "const { fetch: cachedFetch } = someApiClient; cachedFetch('/local');",
    ),
    [],
  );
});

test("transport-free: a computed/string-literal destructure key from globalThis or self is flagged", () => {
  // `{ fetch: doFetch }`'s propertyName is an Identifier and already covered
  // above — these two forms never surface as an Identifier node at all, so
  // they need the dedicated BindingElement check, not the generic scan.
  const featureFile = "apps/web/src/features/memory/hooks/useMemoryConfig.hooks.ts";
  for (const sourceText of [
    'const { "fetch": doFetch } = globalThis; doFetch("/api/memory");',
    'const { ["fetch"]: doFetch } = self; doFetch("/api/memory");',
  ]) {
    const violations = collectImportBoundaryViolations(featureFile, sourceText);
    assert.equal(violations.length, 1, `expected one violation for: ${sourceText}`);
    assert.match(violations[0]?.message ?? "", /uses `fetch`/);
  }
});

test("transport-free: destructuring fetch from a globalThis/self PARAMETER DEFAULT is flagged", () => {
  const featureFile = "apps/web/src/features/memory/hooks/useMemoryConfig.hooks.ts";
  const violations = collectImportBoundaryViolations(
    featureFile,
    'function f({ fetch: doFetch } = self) { return doFetch("/api/memory"); }',
  );
  assert.equal(violations.length, 1);
  assert.match(violations[0]?.message ?? "", /uses `fetch`/);
});

test("transport-free: a parenthesized or type-narrowed global source/key still can't hide a destructure", () => {
  const featureFile = "apps/web/src/features/memory/hooks/useMemoryConfig.hooks.ts";
  for (const sourceText of [
    'const { fetch: doFetch } = (globalThis); doFetch("/api/memory");',
    'const { fetch: doFetch } = globalThis as typeof globalThis; doFetch("/api/memory");',
    'function f({ fetch: doFetch } = (self)) { return doFetch("/api/memory"); }',
    'const { [("fetch")]: doFetch } = self; doFetch("/api/memory");',
  ]) {
    const violations = collectImportBoundaryViolations(featureFile, sourceText);
    assert.equal(violations.length, 1, `expected one violation for: ${sourceText}`);
    assert.match(violations[0]?.message ?? "", /uses `fetch`/);
  }
});

test("transport-free: a parenthesized globalThis/self property access still can't hide the read", () => {
  const featureFile = "apps/web/src/features/memory/hooks/useMemoryConfig.hooks.ts";
  for (const sourceText of [
    'async function f() { await (globalThis).fetch("/api/memory"); }',
    'async function f() { await self[("fetch")]("/api/memory"); }',
  ]) {
    const violations = collectImportBoundaryViolations(featureFile, sourceText);
    assert.equal(violations.length, 1, `expected one violation for: ${sourceText}`);
    assert.match(violations[0]?.message ?? "", /uses `fetch`/);
  }
});

test("transport-free: ASSIGNMENT-expression destructuring from globalThis/self is flagged too", () => {
  // `({ fetch: request } = globalThis)` is a different AST shape from a
  // binding pattern (`const { ... } = ...`) — an ObjectLiteralExpression
  // reused as an assignment target, not a BindingElement — but extracts the
  // forbidden global exactly as effectively.
  const featureFile = "apps/web/src/features/memory/hooks/useMemoryConfig.hooks.ts";
  for (const sourceText of [
    'let request; ({ fetch: request } = globalThis); request("/api/memory");',
    'let request; ({ fetch: request } = (self)); request("/api/memory");',
    'let request; ({ ["fetch"]: request } = globalThis); request("/api/memory");',
  ]) {
    const violations = collectImportBoundaryViolations(featureFile, sourceText);
    assert.equal(violations.length, 1, `expected one violation for: ${sourceText}`);
    assert.match(violations[0]?.message ?? "", /uses `fetch`/);
  }
});

test("transport-free: an assignment-destructure from an UNRELATED object is not mistaken for the global", () => {
  const featureFile = "apps/web/src/features/memory/hooks/useMemoryConfig.hooks.ts";
  assert.deepEqual(
    collectImportBoundaryViolations(
      featureFile,
      "let cached; ({ fetch: cached } = someApiClient); cached('/local');",
    ),
    [],
  );
});

test("outside-in: a dynamic import() deep-importing a slice is rejected, same as a static import", () => {
  const violations = collectImportBoundaryViolations(
    ORCHESTRATOR,
    "async function load() { await import('@/src/features/memory/hooks/useMemoryConfig.hooks'); }",
  );
  assert.equal(violations.length, 1);
  assert.match(violations[0]?.message ?? "", /deep import into slice `memory` from outside features\//);
});

test("outside-in: CommonJS and TypeScript require forms cannot deep-import a slice", () => {
  for (const sourceText of [
    "const memory = require('@/src/features/memory/hooks/useMemoryConfig.hooks');",
    "import memory = require('@/src/features/memory/hooks/useMemoryConfig.hooks');",
  ]) {
    const violations = collectImportBoundaryViolations(ORCHESTRATOR, sourceText);
    assert.equal(violations.length, 1);
    assert.match(violations[0]?.message ?? "", /deep import into slice `memory` from outside features\//);
  }
});

test("outside-in: deep re-exports are blocked while import-looking text is ignored", () => {
  const reExport = collectImportBoundaryViolations(
    ORCHESTRATOR,
    "export { useMemoryConfig } from '@/src/features/memory/hooks/useMemoryConfig.hooks';",
  );
  assert.equal(reExport.length, 1);
  assert.match(reExport[0]?.message ?? "", /deep import into slice `memory` from outside features\//);

  assert.deepEqual(
    collectImportBoundaryViolations(
      ORCHESTRATOR,
      "const example = \\\"import x from '@/src/features/memory/hooks/useMemoryConfig.hooks'\\\"; // require('@/src/features/memory/hooks/useMemoryConfig.hooks')",
    ),
    [],
  );
});

test("outside-in: a dynamic import() of the slice's public barrel is allowed", () => {
  assert.deepEqual(
    collectImportBoundaryViolations(
      ORCHESTRATOR,
      "async function load() { await import('../features/memory'); }",
    ),
    [],
  );
});

test("outside-in: an import(\"...\").Type type-only deep reference into a slice is rejected", () => {
  const violations = collectImportBoundaryViolations(
    ORCHESTRATOR,
    "type Cfg = import('@/src/features/memory/hooks/useMemoryConfig.hooks').MemoryConfigController;",
  );
  assert.equal(violations.length, 1);
  assert.match(violations[0]?.message ?? "", /deep import into slice `memory` from outside features\//);
});

test("transport-free: globalThis.fetch inside a slice file is flagged the same as bare fetch", () => {
  const featureFile = "apps/web/src/features/memory/hooks/useMemoryConfig.hooks.ts";
  const bare = collectImportBoundaryViolations(featureFile, "async function f() { await fetch('/api/memory'); }");
  assert.equal(bare.length, 1);
  assert.match(bare[0]?.message ?? "", /uses `fetch`/);

  const qualified = collectImportBoundaryViolations(
    featureFile,
    "async function f() { await globalThis.fetch('/api/memory'); }",
  );
  assert.equal(qualified.length, 1);
  assert.match(qualified[0]?.message ?? "", /uses `fetch`/);
});

test("transport-free: bracketed globalThis access is flagged too", () => {
  const violations = collectImportBoundaryViolations(
    "apps/web/src/features/memory/hooks/useMemoryConfig.hooks.ts",
    "async function f() { await globalThis['fetch']('/api/memory'); }",
  );
  assert.equal(violations.length, 1);
  assert.match(violations[0]?.message ?? "", /uses `fetch`/);
});

test("transport-free: a plain object's own `.window` property is not mistaken for the global", () => {
  const featureFile = "apps/web/src/features/memory/hooks/useMemoryConfig.hooks.ts";
  assert.deepEqual(
    collectImportBoundaryViolations(featureFile, "const cfg = { window: 'unrelated' }; cfg.window;"),
    [],
  );
});

test("fetchedRoutesOf: a no-substitution template literal is a plain route", () => {
  assert.deepEqual(fetchedRoutesOf("fetch(`/api/memory/tree`);"), ["/api/memory/tree"]);
});

test("fetchedRoutesOf: an interpolated template route normalizes to its route family", () => {
  assert.deepEqual(fetchedRoutesOf("fetch(`/api/memory/${encodeURIComponent(id)}`);"), ["/api/memory/*"]);
});

test("fetchedRoutesOf: two differently-shaped interpolations collapse to the SAME family", () => {
  const a = fetchedRoutesOf("fetch(`/api/memory/${encodeURIComponent(id)}`);");
  const b = fetchedRoutesOf("fetch(`/api/memory/${otherId}`, { method: 'DELETE' });");
  assert.deepEqual(a, b);
  assert.deepEqual(a, ["/api/memory/*"]);
});

test("fetchedRoutesOf: TypeScript assertions do not hide a literal route", () => {
  assert.deepEqual(fetchedRoutesOf("fetch(('/api/memory/tree' as string));"), ["/api/memory/tree"]);
});

test("real guard scans JavaScript, symlinked feature files, and qualified provider fetches", async (t) => {
  if (process.platform === "win32") {
    t.skip("creating test symlinks needs elevated privileges on some Windows hosts");
    return;
  }

  const repoRoot = path.resolve(import.meta.dirname, "..");
  const featureDir = path.join(repoRoot, "apps/web/src/features");
  const srcDir = path.join(repoRoot, "apps/web/src");
  const providersDir = path.join(srcDir, "providers");
  const paths = {
    javascriptFeature: path.join(featureDir, "__slice-boundary-fixture__.js"),
    moduleJavascriptFeature: path.join(featureDir, "__slice-boundary-fixture__.mjs"),
    jsxFeature: path.join(featureDir, "__slice-boundary-fixture__.jsx"),
    symlinkedFeature: path.join(featureDir, "__slice-boundary-fixture-link__.ts"),
    symlinkTarget: path.join(srcDir, "__slice-boundary-fixture-target__.ts"),
    qualifiedProvider: path.join(providersDir, "__slice-boundary-fixture-qualified.ts"),
    bareProvider: path.join(providersDir, "__slice-boundary-fixture-bare.ts"),
  };

  try {
    await writeFile(paths.javascriptFeature, "fetch('/api/__slice-boundary-js-fixture');\n");
    await writeFile(paths.moduleJavascriptFeature, "fetch('/api/__slice-boundary-mjs-fixture');\n");
    await writeFile(paths.jsxFeature, "export const Fixture = <button onClick={() => fetch('/api/__slice-boundary-jsx-fixture')} />;\n");
    await writeFile(paths.symlinkTarget, "globalThis['fetch']('/api/__slice-boundary-symlink-fixture');\n");
    await symlink(paths.symlinkTarget, paths.symlinkedFeature);
    await writeFile(paths.qualifiedProvider, "globalThis['fetch']('/api/__slice-boundary-provider-fixture');\n");
    await writeFile(paths.bareProvider, "fetch('/api/__slice-boundary-provider-fixture');\n");

    assert.equal(await checkWebSliceBoundaries(), false);
  } finally {
    await Promise.all(Object.values(paths).map((fixturePath) => rm(fixturePath, { force: true })));
  }
});

test("real guard: a JS-backed provider folder (index.js) is recognized as a resource home for rule 4", async (t) => {
  if (process.platform === "win32") {
    t.skip("creating test symlinks needs elevated privileges on some Windows hosts");
    return;
  }

  const repoRoot = path.resolve(import.meta.dirname, "..");
  const providersDir = path.join(repoRoot, "apps/web/src/providers");
  const jsFolder = path.join(providersDir, "__slice-boundary-fixture-jsfolder");
  const paths = {
    jsFolderIndex: path.join(jsFolder, "index.js"),
    duplicateFlatProvider: path.join(providersDir, "__slice-boundary-fixture-jsfolder-dup.ts"),
  };
  const route = "/api/__slice-boundary-jsfolder-route";

  const errors: string[] = [];
  const errorSpy = mock.method(console, "error", (...args: unknown[]) => {
    errors.push(args.join(" "));
  });

  try {
    await mkdir(jsFolder, { recursive: true });
    // A provider folder rooted at index.js (not index.ts) must still register
    // as a declared resource home — otherwise a second home for the SAME
    // route silently escapes rule 4's "one transport home per route" check.
    await writeFile(paths.jsFolderIndex, `fetch(${JSON.stringify(route)});\n`);
    await writeFile(paths.duplicateFlatProvider, `fetch(${JSON.stringify(route)});\n`);

    assert.equal(await checkWebSliceBoundaries(), false);
    const routeViolation = errors.find((line) => line.includes(route) && line.includes("provider homes"));
    assert.ok(
      routeViolation,
      `expected a 'one transport home per route' violation for ${route}, got: ${errors.join("\n")}`,
    );
    assert.ok(
      routeViolation!.includes("__slice-boundary-fixture-jsfolder"),
      `expected the JS-backed provider folder to be named as one of the route's homes, got: ${routeViolation}`,
    );
  } finally {
    errorSpy.mock.restore();
    await rm(jsFolder, { recursive: true, force: true });
    await rm(paths.duplicateFlatProvider, { force: true });
  }
});

test("real guard: a deep import from apps/web/sidecar/ (config-listed, not hardcoded) is rejected", async (t) => {
  if (process.platform === "win32") {
    t.skip("creating test symlinks needs elevated privileges on some Windows hosts");
    return;
  }

  // sidecar/ and tests/ are in apps/web/tsconfig.json's `include` but were
  // NOT part of the old hardcoded [webSrcDir, webAppDir] scan-root pair —
  // this proves rule 3's outside-in check now derives its roots from the
  // real parsed tsconfig instead of a fixed list that silently exempts any
  // sibling root tsconfig grows.
  const repoRoot = path.resolve(import.meta.dirname, "..");
  const sidecarFixture = path.join(repoRoot, "apps/web/sidecar/__slice-boundary-fixture__.ts");

  const errors: string[] = [];
  const errorSpy = mock.method(console, "error", (...args: unknown[]) => {
    errors.push(args.join(" "));
  });

  try {
    await writeFile(
      sidecarFixture,
      "import { useMemoryConfig } from '../src/features/memory/hooks/useMemoryConfig.hooks';\n",
    );
    assert.equal(await checkWebSliceBoundaries(), false);
    const violation = errors.find(
      (line) => line.includes("sidecar/__slice-boundary-fixture__.ts") && line.includes("deep import into slice"),
    );
    assert.ok(violation, `expected a sidecar/ deep-import violation, got: ${errors.join("\n")}`);
  } finally {
    errorSpy.mock.restore();
    await rm(sidecarFixture, { force: true });
  }
});
