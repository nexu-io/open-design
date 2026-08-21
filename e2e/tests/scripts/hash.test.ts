import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, test } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const hashScript = path.join(repoRoot, ".github/scripts/hash.py");
const temporaryRoots: string[] = [];

function createRepository() {
  const root = mkdtempSync(path.join(tmpdir(), "hash-contract-"));
  temporaryRoots.push(root);
  for (const [name, content] of [["control.txt", "control"], ["a.txt", "a"], ["b.txt", "b"]] as const) {
    writeFileSync(path.join(root, name), content);
  }
  execFileSync("git", ["init", "-q"], { cwd: root });
  execFileSync("git", ["add", "."], { cwd: root });
  const configPath = path.join(root, "hash.json");
  writeFileSync(configPath, JSON.stringify({
    schema: { version: 1 },
    suites: { "ci-control": ["control.txt"], web: ["a.txt"] },
    workflows: { ci: { a: ["suite://web"], b: ["key://ci/a", "b.txt"], all: ["*"] } },
  }));
  const scopePlanPath = path.join(root, "scope-plan.json");
  writeFileSync(scopePlanPath, JSON.stringify({ enabled: { a: true, b: true, all: true } }));
  return { root, configPath, scopePlanPath, statePath: path.join(root, "state.json") };
}

function runHash(fixture: ReturnType<typeof createRepository>) {
  const outputPath = path.join(fixture.root, "github-output.txt");
  writeFileSync(outputPath, "");
  const stdout = execFileSync("python3", [
    hashScript, "--root", fixture.root, "--config", fixture.configPath,
    "github-output", "--workflow", "ci", "--scope-plan", fixture.scopePlanPath, "--state", fixture.statePath,
  ], { cwd: fixture.root, encoding: "utf8", env: { ...process.env, GITHUB_OUTPUT: outputPath } });
  return {
    decision: JSON.parse(stdout) as { run: Record<string, boolean>; equal: Record<string, boolean> },
    state: JSON.parse(readFileSync(fixture.statePath, "utf8")) as Record<string, unknown>,
  };
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("hash input register", () => {
  test("starts cold, compares hot, and rewrites only the current map", () => {
    const fixture = createRepository();
    expect(runHash(fixture).decision.run).toEqual({ a: true, all: true, b: true });
    const hot = runHash(fixture);
    expect(hot.decision.run).toEqual({ a: false, all: false, b: false });
    expect(hot.state).toEqual({
      schemaVersion: 1,
      workflow: "ci",
      hashes: expect.objectContaining({ a: expect.any(String), all: expect.any(String), b: expect.any(String) }),
    });
  });

  test("composes suite and key dependencies while star observes the whole tree", () => {
    const fixture = createRepository();
    runHash(fixture);
    writeFileSync(path.join(fixture.root, "b.txt"), "b2");
    execFileSync("git", ["add", "b.txt"], { cwd: fixture.root });
    expect(runHash(fixture).decision.run).toEqual({ a: false, all: true, b: true });

    writeFileSync(path.join(fixture.root, "a.txt"), "a2");
    execFileSync("git", ["add", "a.txt"], { cwd: fixture.root });
    expect(runHash(fixture).decision.run).toEqual({ a: true, all: true, b: true });
  });

  test("corrupt or missing state fails cold without weakening the plan", () => {
    const fixture = createRepository();
    runHash(fixture);
    writeFileSync(fixture.statePath, "not json");
    expect(runHash(fixture).decision.run).toEqual({ a: true, all: true, b: true });
  });

  test("rejects cycles through the implicit control closure before evaluation", () => {
    const fixture = createRepository();
    writeFileSync(fixture.configPath, JSON.stringify({
      schema: { version: 1 },
      suites: { "ci-control": ["key://ci/a"] },
      workflows: { ci: { a: ["a.txt"] } },
    }));
    const failed = spawnSync("python3", [hashScript, "--root", fixture.root, "--config", fixture.configPath, "validate"], {
      cwd: fixture.root,
      encoding: "utf8",
    });
    expect(failed.status).toBe(2);
    expect(failed.stderr).toContain("hash dependency cycle");

    writeFileSync(fixture.configPath, JSON.stringify({
      schema: { version: 1 },
      suites: { "ci-control": ["control.txt"] },
      workflows: { ci: { a: ["suite://missing"] } },
    }));
    const dangling = spawnSync("python3", [hashScript, "--root", fixture.root, "--config", fixture.configPath, "validate"], {
      cwd: fixture.root,
      encoding: "utf8",
    });
    expect(dangling.status).toBe(2);
    expect(dangling.stderr).toContain("references unknown suite://missing");
  });
});
