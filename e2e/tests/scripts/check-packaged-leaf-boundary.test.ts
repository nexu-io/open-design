import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "vitest";

import { workflowContainsGuardedCommandBlock } from "../../../scripts/check-packaged-leaf-boundary.ts";

const repoRoot = path.resolve(import.meta.dirname, "../../..");
const workflowPath = path.join(repoRoot, ".github/workflows/ci.yml");

function readWorkflow(): string {
  return readFileSync(workflowPath, "utf8");
}

function toLf(text: string): string {
  return text.replace(/\r\n/g, "\n");
}

function toCrlf(text: string): string {
  return toLf(text).replace(/\n/g, "\r\n");
}

test("the real ci.yml contains the guarded command block", () => {
  assert.equal(workflowContainsGuardedCommandBlock(toLf(readWorkflow())), true);
});

test("a CRLF working tree still matches the guarded command block (#6192)", () => {
  // The expected block is a multi-line template literal in TS source, so it
  // carries LF. On Windows with core.autocrlf=true the workflow file is checked
  // out as CRLF, and a multi-line `includes()` can then never match — turning a
  // clean tree red on a violation that does not exist. Same root cause as #5175,
  // which #5176 fixed for the design-system manifest compares.
  assert.equal(workflowContainsGuardedCommandBlock(toCrlf(readWorkflow())), true);
});

test("a workflow missing the guarded block is still rejected, CRLF or not", () => {
  // Negative control: EOL-normalizing must not blind the check to real drift.
  // Without this, "make it EOL-agnostic" could be satisfied by a predicate that
  // always returns true.
  const gutted = toLf(readWorkflow()).replace(
    "pnpm --filter @open-design/tools-dev test",
    "pnpm --filter @open-design/tools-dev test --silent",
  );
  assert.equal(workflowContainsGuardedCommandBlock(gutted), false);
  assert.equal(workflowContainsGuardedCommandBlock(toCrlf(gutted)), false);
});
