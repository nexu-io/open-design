import assert from "node:assert/strict";
import test from "node:test";

import { collectImportBoundaryViolations, resolveWebImport } from "./check-web-slice-boundaries.ts";

const ORCHESTRATOR = "apps/web/src/components/MemorySection.tsx";
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

test("bare package specifiers never touch the slice boundary", () => {
  assert.deepEqual(
    collectImportBoundaryViolations(ORCHESTRATOR, "import { useCallback } from 'react';"),
    [],
  );
});
