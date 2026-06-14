import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  type AppDirectoryRegistry,
  collectCrossAppImportViolationsFromSource,
  isCrossAppImportSourceFile,
  loadAppDirectoryRegistry,
} from "./check-cross-app-imports.ts";

const registry: AppDirectoryRegistry = {
  packageNameByDirectory: new Map([
    ["daemon", "@open-design/daemon"],
    ["web", "@open-design/web"],
  ]),
};

test("cross-app import check rejects web importing daemon src via relative path", () => {
  const violations = collectCrossAppImportViolationsFromSource(
    "apps/web/src/providers/daemon.ts",
    "import { spawnAgent } from '../../../daemon/src/server.ts';",
    registry,
  );

  assert.equal(violations.length, 1);
  assert.equal(violations[0]?.targetApp, "daemon");
  assert.equal(violations[0]?.lineNumber, 1);
});

test("cross-app import check rejects another app's package name", () => {
  const violations = collectCrossAppImportViolationsFromSource(
    "apps/web/src/runtime/todos.ts",
    [
      "import type { RunRecord } from '@open-design/daemon/src/server.ts';",
      "const mod = await import('@open-design/daemon');",
      "const legacy = require('@open-design/daemon/dist/cli.js');",
    ].join("\n"),
    registry,
  );

  assert.deepEqual(
    violations.map((violation) => violation.lineNumber),
    [1, 2, 3],
  );
  assert.ok(violations.every((violation) => violation.targetApp === "daemon"));
});

test("cross-app import check rejects another app's package name in require.resolve", () => {
  const violations = collectCrossAppImportViolationsFromSource(
    "apps/web/src/setup-runtime.ts",
    "const daemonManifest = require.resolve('@open-design/daemon/package.json');",
    registry,
  );

  assert.equal(violations.length, 1);
  assert.equal(violations[0]?.specifier, "@open-design/daemon/package.json");
  assert.equal(violations[0]?.targetApp, "daemon");
  assert.equal(violations[0]?.lineNumber, 1);
});

test("cross-app import check rejects createRequire-based cross-app resolution", () => {
  const violations = collectCrossAppImportViolationsFromSource(
    "apps/web/src/setup-runtime.ts",
    [
      "import { createRequire, createRequire as makeRequire } from 'node:module';",
      "import * as nodeModule from 'node:module';",
      "const directDaemonManifest = createRequire(import.meta.url).resolve('@open-design/daemon/package.json');",
      "const aliasDaemonManifest = makeRequire(import.meta.url).resolve('@open-design/daemon/package.json');",
      "const nodeRequire = nodeModule.createRequire(import.meta.url);",
      "const daemonCli = nodeRequire('@open-design/daemon/dist/cli.js');",
      "const daemonPackageJson = nodeRequire.resolve('@open-design/daemon/package.json');",
    ].join("\n"),
    registry,
  );

  assert.deepEqual(
    violations.map((violation) => violation.specifier),
    [
      "@open-design/daemon/package.json",
      "@open-design/daemon/package.json",
      "@open-design/daemon/dist/cli.js",
      "@open-design/daemon/package.json",
    ],
  );
  assert.deepEqual(
    violations.map((violation) => violation.lineNumber),
    [3, 4, 6, 7],
  );
  assert.ok(violations.every((violation) => violation.targetApp === "daemon"));
});

test("cross-app import check rejects CommonJS node:module namespace createRequire resolution", () => {
  const violations = collectCrossAppImportViolationsFromSource(
    "apps/web/src/setup-runtime.cjs",
    [
      'const moduleApi = require("node:module");',
      "const nodeRequire = moduleApi.createRequire(__filename);",
      'nodeRequire.resolve("@open-design/daemon/package.json");',
    ].join("\n"),
    registry,
  );

  assert.equal(violations.length, 1);
  assert.equal(violations[0]?.specifier, "@open-design/daemon/package.json");
  assert.equal(violations[0]?.targetApp, "daemon");
  assert.equal(violations[0]?.lineNumber, 3);
});

test("cross-app import check rejects cross-app imports from app-owned mjs entrypoints", () => {
  assert.equal(isCrossAppImportSourceFile("entry.js"), true);
  assert.equal(isCrossAppImportSourceFile("entry.cjs"), true);
  assert.equal(isCrossAppImportSourceFile("postcss.config.mjs"), true);
  assert.equal(isCrossAppImportSourceFile("types.d.ts"), true);
  assert.equal(isCrossAppImportSourceFile("package.json"), false);

  const violations = collectCrossAppImportViolationsFromSource(
    "apps/web/postcss.config.mjs",
    "import { startDaemon } from '@open-design/daemon/src/server.ts';",
    registry,
  );

  assert.equal(violations.length, 1);
  assert.equal(violations[0]?.targetApp, "daemon");
  assert.equal(violations[0]?.lineNumber, 1);
});

test("cross-app import check rejects export-from and apps/ rooted specifiers", () => {
  const violations = collectCrossAppImportViolationsFromSource(
    "apps/daemon/src/index.ts",
    ["export { FileViewer } from 'apps/web/src/components/FileViewer.tsx';", "import 'apps/web/src/index.css';"].join(
      "\n",
    ),
    registry,
  );

  assert.deepEqual(
    violations.map((violation) => violation.targetApp),
    ["web", "web"],
  );
});

test("cross-app import check allows packages, same-app relatives, and externals", () => {
  const violations = collectCrossAppImportViolationsFromSource(
    "apps/web/src/components/ChatPane.tsx",
    [
      "import { Button } from '@open-design/components';",
      "import type { ChatRunEvent } from '@open-design/contracts';",
      "import { latestTodoWriteInputFromMessages } from '../runtime/todos.ts';",
      "import path from 'node:path';",
      "import React from 'react';",
    ].join("\n"),
    registry,
  );

  assert.deepEqual(violations, []);
});

test("cross-app import check ignores quoted snippets and comments", () => {
  const violations = collectCrossAppImportViolationsFromSource(
    "apps/web/tests/import-boundary-fixture.test.ts",
    [
      "const snippet = \"import { x } from '@open-design/daemon/src/server.ts';\";",
      "// import { y } from '@open-design/daemon/src/server.ts';",
      "/*",
      "require('@open-design/daemon/dist/cli.js');",
      "*/",
    ].join("\n"),
    registry,
  );

  assert.deepEqual(violations, []);
});

test("cross-app import check ignores relatives that escape apps/ without hitting a registered app", () => {
  const violations = collectCrossAppImportViolationsFromSource(
    "apps/daemon/tests/mcp-extract-refs.test.ts",
    "const refs = extractRelativeRefs('@import \"../../shared.css\";', 'a/b/c/file.css', 'text/css');",
    registry,
  );

  assert.deepEqual(violations, []);
});

test("cross-app import check allows allowlisted packaged -> desktop main export", () => {
  const violations = collectCrossAppImportViolationsFromSource(
    "apps/packaged/src/index.ts",
    "import { applyOsLocaleSwitch, createSplashWindow } from '@open-design/desktop/main';",
    { packageNameByDirectory: new Map([["packaged", "@open-design/packaged"], ["desktop", "@open-design/desktop"]]) },
  );

  assert.deepEqual(violations, []);
});

test("cross-app import check ignores files outside apps/", () => {
  const violations = collectCrossAppImportViolationsFromSource(
    "e2e/tests/dialog/stop-reconciles-message.test.ts",
    "import { something } from '../../../apps/daemon/src/server.ts';",
    registry,
  );

  assert.deepEqual(violations, []);
});

test("app registry loading fails loudly when an app manifest is malformed", async () => {
  const appsRoot = await mkdtemp(path.join(os.tmpdir(), "open-design-apps-"));
  const appRoot = path.join(appsRoot, "web");
  const manifestPath = path.join(appRoot, "package.json");

  await mkdir(appRoot);
  await writeFile(manifestPath, "{ invalid json", "utf8");

  await assert.rejects(
    loadAppDirectoryRegistry(appsRoot),
    (error) =>
      error instanceof Error &&
      error.message.includes(`Failed to load app package manifest at ${manifestPath}:`) &&
      error.message.includes("JSON"),
  );

  await rm(appsRoot, { force: true, recursive: true });
});

test("app registry loading rejects parseable app manifests without a package name", async () => {
  const appsRoot = await mkdtemp(path.join(os.tmpdir(), "open-design-apps-"));
  const appRoot = path.join(appsRoot, "web");
  const manifestPath = path.join(appRoot, "package.json");

  await mkdir(appRoot);
  await writeFile(manifestPath, "{}", "utf8");

  await assert.rejects(
    loadAppDirectoryRegistry(appsRoot),
    (error) =>
      error instanceof Error &&
      error.message === `Failed to load app package manifest at ${manifestPath}: package name must be a non-empty string`,
  );

  await rm(appsRoot, { force: true, recursive: true });
});
