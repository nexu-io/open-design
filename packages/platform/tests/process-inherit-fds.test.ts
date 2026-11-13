import { execFile, spawn } from "node:child_process";
import { chmod, mkdtemp, readFile, readlink, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import { isProcessGroupAlive, spawnBackgroundProcess } from "../src/index.js";

const execFileAsync = promisify(execFile);
const onLinux = process.platform === "linux";
const fixturePath = fileURLToPath(new URL("./fixtures/lock-handoff.ts", import.meta.url));

const cleanups: Array<() => void | Promise<void>> = [];

afterEach(async () => {
  while (cleanups.length > 0) {
    try {
      await cleanups.pop()?.();
    } catch {
      // best-effort
    }
  }
});

async function waitForFile(path: string, timeoutMs = 5_000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      return await readFile(path, "utf8");
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }
  throw new Error(`timed out waiting for ${path}`);
}

async function waitForGroupExit(processGroupId: number, timeoutMs = 5_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isProcessGroupAlive(processGroupId)) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`process group ${processGroupId} did not exit`);
}

async function flockAcquires(path: string): Promise<boolean> {
  try {
    await execFileAsync("flock", ["-n", path, "true"]);
    return true;
  } catch {
    return false;
  }
}

describe.skipIf(!onLinux)("spawnBackgroundProcess inherited descriptors", () => {
  it("keeps a flock held by a detached child after the launcher exits", async () => {
    const root = await mkdtemp(join(tmpdir(), "od-platform-inherit-fd-"));
    const lockPath = join(root, "launch.lock");
    const pidPath = join(root, "handoff.pid");
    const scriptPath = join(root, "launcher.sh");
    let childPid: number | null = null;

    cleanups.push(async () => {
      if (childPid != null) {
        try {
          process.kill(-childPid, "SIGKILL");
        } catch {
          // already gone
        }
      }
      await rm(root, { force: true, recursive: true });
    });

    await writeFile(
      scriptPath,
      `#!/bin/bash
set -e
exec 8>"$OD_TEST_LOCK_PATH"
flock -n 8
exec "$OD_TEST_NODE" --import tsx "$OD_TEST_FIXTURE" "$OD_TEST_PID_PATH"
`,
      "utf8",
    );
    await chmod(scriptPath, 0o755);

    const launcher = spawn(scriptPath, [], {
      env: {
        ...process.env,
        OD_TEST_FIXTURE: fixturePath,
        OD_TEST_LOCK_PATH: lockPath,
        OD_TEST_NODE: process.execPath,
        OD_TEST_PID_PATH: pidPath,
      },
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    launcher.stderr?.on("data", (chunk) => {
      stderr += String(chunk);
    });
    const exit = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve, reject) => {
      launcher.once("error", reject);
      launcher.once("close", (code, signal) => resolve({ code, signal }));
    });

    expect(exit, stderr).toEqual({ code: 0, signal: null });
    const detachedPid = Number((await waitForFile(pidPath)).trim());
    expect(Number.isSafeInteger(detachedPid)).toBe(true);
    childPid = detachedPid;

    // The launcher has exited, so only the detached child can be holding the
    // flock. A fresh launcher must not be able to acquire it.
    await expect(flockAcquires(lockPath)).resolves.toBe(false);
    await expect(readlink(`/proc/${detachedPid}/fd/8`)).resolves.toBe(lockPath);

    process.kill(-detachedPid, "SIGKILL");
    await waitForGroupExit(detachedPid);
    await expect(flockAcquires(lockPath)).resolves.toBe(true);
  });

  it("rejects inherited stdio descriptors", async () => {
    await expect(spawnBackgroundProcess({ command: "true", inheritFds: [1] }))
      .rejects.toThrow(/inheritFds/);
  });
});
