import { execFile as execFileCallback } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFileCallback);
const require = createRequire(import.meta.url);
const testDir = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(testDir, "..", "..", "..");
const tsxCliPath = require.resolve("tsx/cli");

type WriteReportRun = {
  report: Record<string, unknown>;
  stdout: string;
  summary: string;
};

async function runWriteReport(
  env: Record<string, string>,
  suiteStatus: string,
): Promise<WriteReportRun> {
  const root = await mkdtemp(join(tmpdir(), "od-write-report-"));
  const reportRoot = join(root, "release-report");
  try {
    await mkdir(reportRoot, { recursive: true });
    await writeFile(
      join(reportRoot, "suite-result.json"),
      `${JSON.stringify({ durationMs: 1234, exitCode: suiteStatus === "failed" ? 1 : 0, status: suiteStatus })}\n`,
      "utf8",
    );
    const result = await execFileAsync(
      process.execPath,
      [tsxCliPath, "tools/release/src/index.ts", "write-report"],
      {
        cwd: workspaceRoot,
        env: {
          ...process.env,
          RELEASE_REPORT_DIR: reportRoot,
          RELEASE_REPORT_JSON_PATH: join(reportRoot, "report.json"),
          RELEASE_REPORT_SUMMARY_PATH: join(reportRoot, "summary.md"),
          RELEASE_TARGET: "mac_arm64",
          RELEASE_VERSION: "0.21.6-beta.7",
          REPORT_TITLE: "mac_arm64 beta build",
          ...env,
        },
      },
    );
    return {
      report: JSON.parse(await readFile(join(reportRoot, "report.json"), "utf8")) as Record<string, unknown>,
      stdout: result.stdout,
      summary: await readFile(join(reportRoot, "summary.md"), "utf8"),
    };
  } finally {
    await rm(root, { force: true, recursive: true });
  }
}

describe("release report smoke signal", () => {
  it("leads the step summary with the failure and annotates the run", async () => {
    // This is the whole point of the change: the summary is published to
    // $GITHUB_STEP_SUMMARY by the very next workflow step, and the annotation
    // lands on the run page — so a continue-on-error smoke failure can no longer
    // be reduced to one `status` line inside a report nobody scrolls to.
    const run = await runWriteReport(
      { RELEASE_SMOKE_EXEMPT: "true", RELEASE_SMOKE_OUTCOME: "failure" },
      "failed",
    );

    expect(run.summary.startsWith("> [!CAUTION]")).toBe(true);
    expect(run.summary).toContain("packaged smoke FAILED");
    expect(run.summary).toContain("0.21.6-beta.7");
    expect(run.summary).toContain("### mac_arm64 beta build");
    expect(run.stdout).toContain("::error title=mac_arm64 packaged smoke failed::");
    expect(run.report.smoke).toEqual({ exempt: true, failed: true, outcome: "failure" });
  }, 60_000);

  it("keeps a passing smoke summary unchanged", async () => {
    const run = await runWriteReport(
      { RELEASE_SMOKE_EXEMPT: "true", RELEASE_SMOKE_OUTCOME: "success" },
      "success",
    );

    expect(run.summary.startsWith("### mac_arm64 beta build")).toBe(true);
    expect(run.summary).not.toContain("[!CAUTION]");
    expect(run.stdout).not.toContain("::error");
    expect(run.report.smoke).toEqual({ exempt: true, failed: false, outcome: "success" });
  }, 60_000);

  it("still announces a failure for callers that only wire the suite result", async () => {
    const run = await runWriteReport({}, "failed");

    expect(run.summary.startsWith("> [!CAUTION]")).toBe(true);
    expect(run.stdout).toContain("::error");
    expect(run.report.smoke).toEqual({ exempt: false, failed: true, outcome: "" });
  }, 60_000);
});
