import assert from "node:assert/strict";
import { mkdir, rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import test, { mock } from "node:test";

import {
  checkWebSliceBoundaries,
  collectImportBoundaryViolations,
  fetchedRoutesOf,
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
