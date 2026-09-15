import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";
import { parse } from "yaml";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const workflowsDir = path.join(repoRoot, ".github/workflows");

/**
 * `node --import tsx <script>`, `pnpm exec tsx <script>`, and
 * `pnpm -C <dir> exec tsx <script>` each name a repository file that must
 * exist at the commit the workflow checks out. Nothing in the toolchain ties
 * the caller to the callee, so renaming a script without updating the
 * workflow stays invisible until a scheduled or release run goes red.
 *
 * Resolution follows the runner, not the text: the workflow YAML is parsed
 * into jobs and steps, each step resolves relative scripts against its own
 * `working-directory:` (falling back to the job/workflow `defaults.run`
 * value, never to a previous step), and an explicit `pnpm -C <dir>` on the
 * invocation wins over all of them. There is no repository-root fallback —
 * a step whose cwd lacks the script fails even if the same relative path
 * exists at the root, exactly like `runs-on` does.
 */
const TSX_INVOCATION = /(?:node\s+--import\s+tsx|(?:pnpm(?:\s+-C\s+(\S+))?\s+exec\s+)?tsx)\s+(\S+\.ts)\b/g;

interface ScriptReference {
  workflow: string;
  step: string;
  cwd: string;
  script: string;
}

interface WorkflowStep {
  name?: string;
  "working-directory"?: string;
  run?: unknown;
}

interface WorkflowJob {
  defaults?: { run?: { "working-directory"?: string } };
  steps?: WorkflowStep[];
}

interface WorkflowDoc {
  defaults?: { run?: { "working-directory"?: string } };
  jobs?: Record<string, WorkflowJob>;
}

// Templated values are resolved by the runner at execution time, not here.
const isStatic = (value: string | undefined): value is string =>
  typeof value === "string" && !value.includes("${{") && !value.includes("*");

function collectReferences(workflow: string, content: string): ScriptReference[] {
  const doc = parse(content) as WorkflowDoc | null;
  const references: ScriptReference[] = [];
  const workflowCwd = doc?.defaults?.run?.["working-directory"];
  for (const [jobId, job] of Object.entries(doc?.jobs ?? {})) {
    const jobCwd = job?.defaults?.run?.["working-directory"] ?? workflowCwd ?? ".";
    for (const [stepIndex, step] of (job?.steps ?? []).entries()) {
      if (typeof step?.run !== "string") continue;
      // Step-level wins over job defaults, which win over workflow defaults;
      // nothing carries over from the previous step.
      const stepCwd = step["working-directory"] ?? jobCwd;
      for (const [, pnpmDir, script] of step.run.matchAll(TSX_INVOCATION)) {
        if (!isStatic(script)) continue;
        const cwd = pnpmDir ?? stepCwd;
        if (!isStatic(cwd)) continue;
        references.push({
          workflow,
          step: `${jobId}#${stepIndex + 1}${step.name ? ` (${step.name})` : ""}`,
          cwd,
          script,
        });
      }
    }
  }
  return references;
}

function resolvesOnDisk(root: string, reference: ScriptReference): boolean {
  return existsSync(path.join(root, reference.cwd, reference.script));
}

describe("GitHub Actions script entrypoints", () => {
  it("[P1] resolves every tsx script a workflow invokes", async () => {
    const workflows = (await readdir(workflowsDir))
      .filter((name) => name.endsWith(".yml") || name.endsWith(".yaml"))
      .sort();
    expect(workflows.length).toBeGreaterThan(0);

    const references: ScriptReference[] = [];
    for (const workflow of workflows) {
      const content = await readFile(path.join(workflowsDir, workflow), "utf8");
      references.push(...collectReferences(workflow, content));
    }
    // Keeps the check honest: a regex that stops matching must not read as green.
    expect(references.length).toBeGreaterThan(0);

    const missing = references
      .filter((reference) => !resolvesOnDisk(repoRoot, reference))
      .map(
        (reference) =>
          `${reference.workflow} ${reference.step} (cwd ${reference.cwd}) -> ${reference.script}`,
      );
    expect(missing).toEqual([]);
  });

  it("[P1] resolves scripts against the step's own working-directory only", async () => {
    const fixtureRoot = await mkdtemp(path.join(tmpdir(), "wf-entrypoints-"));
    try {
      // The relative script exists at the fixture root and nowhere else.
      await mkdir(path.join(fixtureRoot, "scripts"), { recursive: true });
      await writeFile(path.join(fixtureRoot, "scripts/example.ts"), "// root copy\n");

      const workflow = `
name: fixture
on: push
jobs:
  scoped:
    steps:
      - name: step with its own cwd
        working-directory: e2e
        run: pnpm exec tsx scripts/example.ts
      - name: following step inherits nothing
        run: pnpm exec tsx scripts/example.ts
  defaulted:
    defaults:
      run:
        working-directory: e2e
    steps:
      - name: job default applies
        run: pnpm exec tsx scripts/example.ts
      - name: pnpm -C overrides the job default
        run: pnpm -C . exec tsx scripts/example.ts
      - name: step cwd overrides the job default
        working-directory: apps
        run: pnpm exec tsx scripts/example.ts
`;
      const references = collectReferences("fixture.yml", workflow);
      expect(references.map((reference) => [reference.step, reference.cwd])).toEqual([
        ["scoped#1 (step with its own cwd)", "e2e"],
        ["scoped#2 (following step inherits nothing)", "."],
        ["defaulted#1 (job default applies)", "e2e"],
        ["defaulted#2 (pnpm -C overrides the job default)", "."],
        ["defaulted#3 (step cwd overrides the job default)", "apps"],
      ]);

      const byName = new Map(references.map((reference) => [reference.step, reference]));
      // Missing under the step cwd fails even though the same relative path
      // exists at the root — the runner has no root fallback, and neither do we.
      expect(resolvesOnDisk(fixtureRoot, byName.get("scoped#1 (step with its own cwd)")!)).toBe(false);
      // The previous step's cwd must not leak into the next step.
      expect(resolvesOnDisk(fixtureRoot, byName.get("scoped#2 (following step inherits nothing)")!)).toBe(true);
      // Job defaults apply to their steps...
      expect(resolvesOnDisk(fixtureRoot, byName.get("defaulted#1 (job default applies)")!)).toBe(false);
      // ...an explicit `pnpm -C` wins over them...
      expect(resolvesOnDisk(fixtureRoot, byName.get("defaulted#2 (pnpm -C overrides the job default)")!)).toBe(true);
      // ...and a step-level working-directory wins over them too.
      expect(resolvesOnDisk(fixtureRoot, byName.get("defaulted#3 (step cwd overrides the job default)")!)).toBe(false);
    } finally {
      await rm(fixtureRoot, { recursive: true, force: true });
    }
  });
});
