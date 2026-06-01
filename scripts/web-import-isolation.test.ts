import assert from "node:assert/strict";
import test from "node:test";

import {
  collectWebImportIsolationViolationsFromSource,
  isWebImportIsolationSourcePath,
} from "./guard.ts";

test("web import isolation rejects daemon private source imports", () => {
  const violations = collectWebImportIsolationViolationsFromSource(
    "apps/web/src/providers/example.ts",
    "import { startServer } from '../../../daemon/src/server';\n",
  );

  assert.equal(violations.length, 1);
  assert.equal(violations[0]?.lineNumber, 1);
  assert.equal(violations[0]?.specifier, "../../../daemon/src/server");
});

test("web import isolation rejects sidecar and platform package imports", () => {
  const violations = collectWebImportIsolationViolationsFromSource(
    "apps/web/app/page.tsx",
    [
      "import { parseStamp } from '@open-design/platform';",
      "type SidecarRuntime = import('@open-design/sidecar').Runtime;",
      "const proto = await import('@open-design/sidecar-proto');",
    ].join("\n"),
  );

  assert.deepEqual(
    violations.map((violation) => violation.specifier),
    ["@open-design/platform", "@open-design/sidecar", "@open-design/sidecar-proto"],
  );
});

test("web import isolation allows contracts and app-local imports", () => {
  assert.deepEqual(
    collectWebImportIsolationViolationsFromSource(
      "apps/web/src/providers/example.ts",
      [
        "import type { ChatRunStatusResponse } from '@open-design/contracts';",
        "import { requestJson } from './daemon';",
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
