import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test, vi } from "vitest";

import {
  loadScriptsArchitectureSources,
  scriptsArchitectureErrors,
} from "../../../scripts/lib/guard/architecture.ts";
import { runGuardChecks } from "../../../scripts/lib/guard/core.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

describe("scripts guard library", () => {
  test("the live repository satisfies its layered dependency contract", async () => {
    const sources = await loadScriptsArchitectureSources(repoRoot);
    expect(scriptsArchitectureErrors(sources)).toEqual([]);
  });

  test("scope startup cannot reach guard internals or package dependencies", () => {
    const sources = new Map([
      ["scripts/scopes.ts", 'import "./lib/guard/core.ts";\nimport "typescript";'],
      ["scripts/lib/guard/core.ts", ""],
      ["scripts/guard.ts", 'import "./lib/guard/core.ts";'],
      ["e2e/lib/playwright/suites.ts", ""],
    ]);
    expect(scriptsArchitectureErrors(sources)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("install-independent scope closure"),
        expect.stringContaining("must consume guard policy through scripts/guard.ts"),
      ]),
    );
  });

  test("guard internals cannot reverse-depend on the CLI or form cycles", () => {
    const sources = new Map([
      ["scripts/scopes.ts", 'import "../e2e/lib/playwright/suites.ts";'],
      ["scripts/guard.ts", 'import "./lib/guard/core.ts";'],
      ["scripts/lib/guard/core.ts", 'import "./architecture.ts";'],
      ["scripts/lib/guard/architecture.ts", 'import "./core.ts";\nimport "../../guard.ts";\nprocess.exitCode = 1;'],
      ["e2e/lib/playwright/suites.ts", ""],
    ]);
    const errors = scriptsArchitectureErrors(sources);
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining("must not depend on the guard CLI entrypoint"),
        expect.stringContaining("contains CLI process control"),
        expect.stringContaining("module cycle"),
      ]),
    );
  });

  test("the core runs every check and fails closed on exceptions", async () => {
    const afterFailure = vi.fn(async () => true);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      runGuardChecks(
        [
          {
            name: "broken",
            run: async () => {
              throw new Error("boom");
            },
          },
          { name: "after", run: afterFailure },
        ],
        { repoRoot },
      ),
    ).resolves.toBe(false);
    expect(afterFailure).toHaveBeenCalledOnce();
    consoleError.mockRestore();
  });

  test("the architecture check is registered in the public guard entrypoint", () => {
    const names = execFileSync("pnpm", ["--silent", "guard", "--list-checks"], {
      cwd: repoRoot,
      encoding: "utf8",
    }).trim().split("\n");
    expect(names).toContain("scripts library architecture");
    expect(names).toContain("daemon core boundary");
  });
});
