import assert from "node:assert/strict";
import test from "node:test";

import {
  collectProductNeutralityViolationsFromSource,
  isProductNeutralityCheckedPath,
} from "./guard.ts";

test("product-neutrality check rejects named orchestrator examples on public surfaces", () => {
  const violations = collectProductNeutralityViolationsFromSource(
    "packages/contracts/src/api/chat.ts",
    "Run-scoped tool bundle supplied by an orchestrator such as Acme.",
    [],
  );

  assert.equal(violations.length, 1);
  assert.equal(violations[0]?.lineNumber, 1);
});

test("product-neutrality check covers web App Router public copy", () => {
  assert.equal(isProductNeutralityCheckedPath("apps/web/app/page.tsx"), true);

  const violations = collectProductNeutralityViolationsFromSource(
    "apps/web/app/page.tsx",
    "This page mentions an orchestrator such as Acme.",
    [],
  );

  assert.equal(violations.length, 1);
});

test("product-neutrality check supports local forbidden terms without committing them", () => {
  const violations = collectProductNeutralityViolationsFromSource(
    "docs/example.md",
    "This private deployment name should not ship.",
    ["private deployment"],
  );

  assert.equal(violations.length, 1);
});

test("product-neutrality check ignores out-of-scope paths", () => {
  assert.equal(isProductNeutralityCheckedPath("tmp/scratch.md"), false);
  assert.deepEqual(
    collectProductNeutralityViolationsFromSource(
      "tmp/scratch.md",
      "A scratch note can mention an orchestrator such as Acme.",
      [],
    ),
    [],
  );
});
