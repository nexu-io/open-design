import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "vitest";

import { workflowRunBodies } from "../../../scripts/check-certain-exempt-consumption.ts";

const repoRoot = path.resolve(import.meta.dirname, "../../..");

function readWorkflow(): string {
  return readFileSync(path.join(repoRoot, ".github/workflows/ci.yml"), "utf8");
}

function toLf(text: string): string {
  return text.replace(/\r\n/g, "\n");
}

function toCrlf(text: string): string {
  return toLf(text).replace(/\n/g, "\r\n");
}

test("the real ci.yml yields run bodies", () => {
  assert.ok(workflowRunBodies(toLf(readWorkflow())).length > 0);
});

test("a CRLF working tree yields the same run bodies as LF (#6192)", () => {
  // The line matcher is anchored with `(.*)$` and `.` excludes `\r`, so a
  // `\n`-only split does not merely leave a stray carriage return — every match
  // fails and the check silently sees an empty workflow, misclassifying which
  // lanes are gate lanes.
  const lf = workflowRunBodies(toLf(readWorkflow()));
  const crlf = workflowRunBodies(toCrlf(readWorkflow()));
  assert.deepEqual(crlf, lf);
});

test("run bodies are still parsed out of a hand-written CRLF workflow", () => {
  // Negative control on the parser itself: tolerating CRLF must not come from
  // returning everything or nothing. A block scalar and a plain command still
  // have to come back exactly as on LF.
  // Block-scalar bodies are dedented by `indentation + 2`, so the fixture puts
  // them exactly there — this case is about line endings, not about restating
  // the parser's indentation rules.
  const workflow = [
    "jobs:",
    "  build:",
    "    steps:",
    "      - run: pnpm install",
    "      - run: |",
    "        pnpm guard",
    "        pnpm typecheck",
  ].join("\r\n");

  assert.deepEqual(workflowRunBodies(workflow), [
    "pnpm install",
    "pnpm guard\npnpm typecheck",
  ]);
});
