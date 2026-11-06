import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const script = path.join(repoRoot, ".github/scripts/template.py");

function render(args: string[]) {
  return spawnSync("python3", [script, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
  });
}

describe("GitHub workflow text templates", () => {
  test("renders named parameters without interpreting their contents", () => {
    const result = render([
      "merge-queue/ci-failure.md",
      "--params-run-id", "42",
      "--params-run-url", "https://example.test/run/42?token=$literal",
      "--params-failed-lines", "- **测试 `$name`** — failure",
      "--params-group-note", " and with {{ untouched }}",
    ]);

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("[run 42](https://example.test/run/42?token=$literal)");
    expect(result.stdout).toContain("- **测试 `$name`** — failure");
    expect(result.stdout).toContain("and with {{ untouched }}");
  });

  test("writes exactly the rendered text to an output file", () => {
    const temporaryRoot = mkdtempSync(path.join(tmpdir(), "od-template-"));
    try {
      const output = path.join(temporaryRoot, "body.md");
      const result = render([
        "merge-queue/needs-validation.md",
        "--params-run-id=73",
        "--params-run-url", "https://example.test/run/73",
        "--output", output,
      ]);

      expect(result.status).toBe(0);
      expect(result.stdout).toBe("");
      expect(readFileSync(output, "utf8")).toContain(
        "<!-- merge-queue-needs-validation -->\nEjected from the merge queue",
      );
    } finally {
      rmSync(temporaryRoot, { recursive: true, force: true });
    }
  });

  test.each([
    {
      name: "missing parameter",
      args: ["merge-queue/needs-validation.md", "--params-run-id", "73"],
      message: "missing template parameters: run_url",
    },
    {
      name: "unknown parameter",
      args: [
        "merge-queue/needs-validation.md",
        "--params-run-id", "73",
        "--params-run-url", "https://example.test/run/73",
        "--params-extra", "value",
      ],
      message: "unknown template parameters: extra",
    },
    {
      name: "duplicate parameter",
      args: [
        "merge-queue/needs-validation.md",
        "--params-run-id", "73",
        "--params-run-id", "74",
        "--params-run-url", "https://example.test/run/73",
      ],
      message: "duplicate template parameter: run_id",
    },
    {
      name: "path traversal",
      args: ["../workflows/ci.yml"],
      message: "template path must stay within .github/templates",
    },
    {
      name: "executable template",
      args: ["merge-queue/ci-failure.sh"],
      message: "template must use a .md or .txt extension",
    },
  ])("rejects $name", ({ args, message }) => {
    const result = render(args);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain(message);
  });
});
