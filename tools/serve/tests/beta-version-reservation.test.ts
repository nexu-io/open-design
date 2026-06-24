import { spawn } from "node:child_process";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function runReservationCheck(options: { releaseRunId?: string }): Promise<string> {
  const repoRoot = resolve(import.meta.dirname, "../../..");
  const script = `
    const { validateVersionReservation } = await import("./tools/release/src/storage/beta-version-reservation.ts");
    const reservation = {
      baseVersion: "1.2.3",
      channel: "beta",
      createdAt: "2026-06-09T07:00:00.000Z",
      kind: "version-reservation",
      lane: "release-beta-s",
      owner: {
        branch: "codex/release-stable-launcher",
        commit: "abc123",
        repository: "nexu-io/open-design",
        runAttempt: 1,
        runId: 42,
        workflow: "release-beta-s"
      },
      releaseNumber: 4,
      releaseVersion: "1.2.3-beta.4",
      state: "reserved",
      version: 1
    };
    const result = validateVersionReservation(reservation, "1.2.3-beta.4");
    process.stdout.write(result == null ? "ok" : result);
  `;
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(process.execPath, ["--experimental-strip-types", "--input-type=module", "--eval", script], {
      cwd: repoRoot,
      env: {
        ...process.env,
        RELEASE_BRANCH: "codex/release-stable-launcher",
        RELEASE_COMMIT: "abc123",
        RELEASE_REPOSITORY: "nexu-io/open-design",
        RELEASE_RUN_ATTEMPT: "2",
        RELEASE_RUN_ID: options.releaseRunId ?? "42",
        RELEASE_WORKFLOW: "release-beta-s",
      },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", rejectRun);
    child.on("close", (code) => {
      if (code === 0) resolveRun(stdout);
      else rejectRun(new Error(`reservation check exited ${String(code)}\n${stdout}\n${stderr}`));
    });
  });
}

describe("beta version reservation ownership", () => {
  it("allows a later rerun attempt from the same workflow run to reuse the lock", async () => {
    await expect(runReservationCheck({})).resolves.toBe("ok");
  });

  it("rejects a reservation owned by a different workflow run", async () => {
    await expect(runReservationCheck({ releaseRunId: "43" })).resolves.toContain("owner=");
  });
});
