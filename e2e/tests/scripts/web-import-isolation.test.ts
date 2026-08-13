import assert from "node:assert/strict";
import { test } from "vitest";

import {
  collectWebImportIsolationViolationsFromSource,
  isWebImportIsolationSourcePath,
} from "../../../scripts/guard.ts";

test("web import isolation rejects daemon private source imports", () => {
  const violations = collectWebImportIsolationViolationsFromSource(
    "apps/web/src/providers/example.ts",
    [
      "import { startServer } from '../../../daemon/src/server';",
      "import { bypass } from '@/../daemon/src/server';",
    ].join("\n"),
  );

  assert.deepEqual(
    violations.map((violation) => [violation.lineNumber, violation.specifier]),
    [
      [1, "../../../daemon/src/server"],
      [2, "@/../daemon/src/server"],
    ],
  );
});

test("web import isolation rejects Shell, sidecar, and platform package imports", () => {
  const violations = collectWebImportIsolationViolationsFromSource(
    "apps/web/app/page.tsx",
    [
      "import { parseStamp } from '@open-design/platform';",
      "import { resolveLauncherPaths } from '@open-design/shell/update';",
      "type SidecarRuntime = import('@open-design/sidecar').Runtime;",
      "const proto = await import('@open-design/sidecar/protocol');",
      "const sidecar = await import('@/../../packages/sidecar/src/index');",
      "const shell = await import('@/../../packages/shell/src/update/index');",
    ].join("\n"),
  );

  assert.deepEqual(
    violations.map((violation) => violation.specifier),
    [
      "@open-design/platform",
      "@open-design/shell/update",
      "@open-design/sidecar",
      "@open-design/sidecar/protocol",
      "@/../../packages/sidecar/src/index",
      "@/../../packages/shell/src/update/index",
    ],
  );
});

test("web import isolation allows contracts and app-local imports", () => {
  assert.deepEqual(
    collectWebImportIsolationViolationsFromSource(
      "apps/web/src/providers/example.ts",
      [
        "import type { ChatRunStatusResponse } from '@open-design/contracts';",
        "import { requestJson } from './daemon';",
        "import { latestTodoWriteInputFromMessages } from '@/src/runtime/todos';",
      ].join("\n"),
    ),
    [],
  );
});

test("web import isolation ignores tests and comments", () => {
  assert.equal(isWebImportIsolationSourcePath("apps/web/src/providers/example.ts"), true);
  assert.equal(isWebImportIsolationSourcePath("apps/web/tests/providers/example.test.ts"), false);
  assert.deepEqual(
    collectWebImportIsolationViolationsFromSource(
      "apps/web/src/providers/example.ts",
      "// import { startServer } from '../../daemon/src/server';\n",
    ),
    [],
  );
});
