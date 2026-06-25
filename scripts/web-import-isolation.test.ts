import assert from "node:assert/strict";
import test from "node:test";

import {
  collectWebImportIsolationViolationsFromSource,
  isWebImportIsolationSourcePath,
} from "./guard.ts";

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

test("web import isolation rejects sidecar and platform package imports", () => {
  const violations = collectWebImportIsolationViolationsFromSource(
    "apps/web/app/page.tsx",
    [
      "import { parseStamp } from '@marketing-ax/platform';",
      "type SidecarRuntime = import('@marketing-ax/sidecar').Runtime;",
      "const proto = await import('@marketing-ax/sidecar-proto');",
      "const sidecar = await import('@/../../packages/sidecar/src/index');",
    ].join("\n"),
  );

  assert.deepEqual(
    violations.map((violation) => violation.specifier),
    [
      "@marketing-ax/platform",
      "@marketing-ax/sidecar",
      "@marketing-ax/sidecar-proto",
      "@/../../packages/sidecar/src/index",
    ],
  );
});

test("web import isolation allows contracts and app-local imports", () => {
  assert.deepEqual(
    collectWebImportIsolationViolationsFromSource(
      "apps/web/src/providers/example.ts",
      [
        "import type { ChatRunStatusResponse } from '@marketing-ax/contracts';",
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
