import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const inactivityWorkflow = new URL("../../.github/workflows/pr-author-inactivity.yml", import.meta.url);

/**
 * The exemption set is the only way a PR is skipped by the inactivity pass, so
 * the states it names are policy rather than implementation detail. Locking the
 * membership here makes a change to that policy a deliberate edit with a
 * reviewer, instead of a line quietly added to a workflow script.
 *
 * Every entry must also exist in the repository's label registry. That half
 * cannot be asserted offline, so the workflow checks it against the live
 * registry at run time; this test only guards the shape and the ordering of
 * that check.
 */
const EXPECTED_EXEMPTION_LABELS = [
  "exempt-from-stale",
  "looper:worker-ready",
  "needs-design-review",
  "needs-maintainer-check",
  "needs-product-direction",
  "needs-validation",
  "stale-pr/blocked",
  "stale-pr/maintainer-assisted",
];

function readExemptionLabels(workflow: string): string[] {
  const start = workflow.indexOf("const NON_AUTHOR_BLOCKER_LABELS = new Set([");
  expect(start).toBeGreaterThanOrEqual(0);
  const end = workflow.indexOf("]);", start);
  expect(end).toBeGreaterThan(start);

  return [...workflow.slice(start, end).matchAll(/'([^']+)'/g)].map((match) => match[1]!);
}

describe("PR author inactivity exemptions", () => {
  it("[P1] names exactly the agreed non-author blocker labels", async () => {
    const workflow = await readFile(inactivityWorkflow, "utf8");

    expect(readExemptionLabels(workflow)).toEqual(EXPECTED_EXEMPTION_LABELS);
  });

  it("[P1] carries no duplicate exemption entries", async () => {
    const workflow = await readFile(inactivityWorkflow, "utf8");
    const labels = readExemptionLabels(workflow);

    expect(labels).toEqual([...new Set(labels)]);
  });

  it("[P1] verifies the exemption set against the live label registry", async () => {
    const workflow = await readFile(inactivityWorkflow, "utf8");

    expect(workflow).toContain("github.rest.issues.listLabelsForRepo");
    expect(workflow).toContain("unregisteredExemptionLabels");
    expect(workflow).toContain("core.setFailed");
  });

  it("[P1] runs that verification before it examines any PR", async () => {
    const workflow = await readFile(inactivityWorkflow, "utf8");

    // An unregistered entry can never match, so a pass that reached a PR
    // before noticing would treat an exempt PR as author-owned and could close
    // it. The assertion has to come first, and has to stop the run.
    const assertion = workflow.indexOf("unregisteredExemptionLabels");
    const prLoop = workflow.indexOf("for (const pr of pulls)");

    expect(assertion).toBeGreaterThanOrEqual(0);
    expect(prLoop).toBeGreaterThan(assertion);
  });
});
