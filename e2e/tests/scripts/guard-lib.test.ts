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

  test("root scripts cannot bypass the public guard entrypoint", () => {
    const sources = new Map([
      ["scripts/check.ts", 'import "./lib/guard/core.ts";'],
      ["scripts/lib/guard/core.ts", ""],
      ["scripts/guard.ts", 'import "./lib/guard/core.ts";'],
    ]);
    expect(scriptsArchitectureErrors(sources)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("must consume guard policy through scripts/guard.ts"),
      ]),
    );
  });

  test("guard internals cannot reverse-depend on the CLI or form cycles", () => {
    const sources = new Map([
      ["scripts/guard.ts", 'import "./lib/guard/core.ts";'],
      ["scripts/lib/guard/core.ts", 'import "./architecture.ts";'],
      ["scripts/lib/guard/architecture.ts", 'import "./core.ts";\nimport "../../guard.ts";\nprocess.exitCode = 1;'],
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

  test.each([
    'import type { T } from "./lib/guard/core.ts";',
    'type T = import("./lib/guard/core.ts").T;',
    'void import("./lib/guard/core.ts");',
    'const guard = require("./lib/guard/core.ts");',
    'import guard = require("./lib/guard/core.ts");',
  ])("detects native AST import edges: %s", (source) => {
    const errors = scriptsArchitectureErrors(new Map([
      ["scripts/check.ts", source],
      ["scripts/lib/guard/core.ts", "export interface T {}"],
    ]));
    expect(errors).toContain("scripts/check.ts must consume guard policy through scripts/guard.ts, not scripts/lib/guard/core.ts");
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
  });
});
