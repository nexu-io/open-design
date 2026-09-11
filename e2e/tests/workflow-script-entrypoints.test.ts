import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const workflowsDir = path.join(repoRoot, ".github/workflows");

/**
 * `node --import tsx <script>`, `pnpm exec tsx <script>`, and
 * `pnpm -C <dir> exec tsx <script>` each name a repository file that must
 * exist at the commit the workflow checks out. Nothing in the toolchain ties
 * the caller to the callee, so renaming a script without updating the
 * workflow stays invisible until a scheduled or release run goes red.
 */
const TSX_INVOCATION = /(?:node\s+--import\s+tsx|(?:pnpm(?:\s+-C\s+(\S+))?\s+exec\s+)?tsx)\s+(\S+\.ts)\b/g;

interface ScriptReference {
  workflow: string;
  line: number;
  cwd: string;
  script: string;
}

function collectReferences(workflow: string, content: string): ScriptReference[] {
  const references: ScriptReference[] = [];
  // A step resolves a relative script against its `working-directory:`, and an
  // explicit `pnpm -C <dir>` on the invocation itself wins over that.
  let workingDirectory = ".";
  content.split("\n").forEach((line, index) => {
    const declared = /working-directory:\s*(\S+)/.exec(line);
    if (declared?.[1]) workingDirectory = declared[1];
    for (const [, pnpmDir, script] of line.matchAll(TSX_INVOCATION)) {
      if (!script) continue;
      // Templated and globbed targets are resolved by the runner, not here.
      if (script.includes("${{") || script.includes("*")) continue;
      references.push({ workflow, line: index + 1, cwd: pnpmDir ?? workingDirectory, script });
    }
  });
  return references;
}

function resolvesOnDisk(reference: ScriptReference): boolean {
  return (
    existsSync(path.join(repoRoot, reference.cwd, reference.script))
    || existsSync(path.join(repoRoot, reference.script))
  );
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
      .filter((reference) => !resolvesOnDisk(reference))
      .map((reference) => `${reference.workflow}:${reference.line} -> ${reference.script}`);
    expect(missing).toEqual([]);
  });
});
