import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { test } from "node:test";
import assert from "node:assert/strict";

const repoRoot = path.resolve(import.meta.dirname, "../..");
const scriptPath = path.join(repoRoot, "deploy/scripts/prepare-colima-build-swap.sh");

type FakeHost = {
  os: string;
  arch: string;
};

async function runWithFakeHost(args: string[], host: FakeHost) {
  const tempDir = await mkdtemp(path.join(tmpdir(), "prepare-colima-build-swap-"));
  const binDir = path.join(tempDir, "bin");
  await writeFile(path.join(tempDir, "mkdir-placeholder"), "");
  await import("node:fs/promises").then(({ mkdir }) => mkdir(binDir));

  await writeFile(
    path.join(binDir, "uname"),
    `#!/usr/bin/env bash\ncase "$1" in\n  -s) printf '%s\\n' '${host.os}' ;;\n  -m) printf '%s\\n' '${host.arch}' ;;\n  *) exit 2 ;;\nesac\n`,
    { mode: 0o755 },
  );
  await writeFile(
    path.join(binDir, "colima"),
    `#!/usr/bin/env bash\nprintf '%s\\n' "$*" >> '${path.join(tempDir, "colima.log")}'\ncase "$1" in\n  status) exit 0 ;;\n  ssh) printf 'MemTotal:       8388608 kB\\nSwapTotal:             0 kB\\n' ;;\n  *) exit 2 ;;\nesac\n`,
    { mode: 0o755 },
  );

  const processResult = await new Promise<{ code: number | null; stderr: string }>((resolve, reject) => {
    const child = spawn("bash", [scriptPath, ...args], {
      env: {
        ...process.env,
        COLIMA_BIN: path.join(binDir, "colima"),
        PATH: `${binDir}${path.delimiter}${process.env.PATH ?? ""}`,
      },
      stdio: ["ignore", "ignore", "pipe"],
    });

    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ code, stderr });
    });
  });

  let colimaLog = "";
  try {
    colimaLog = await readFile(path.join(tempDir, "colima.log"), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  return { ...processResult, colimaLog };
}

test("prepare-colima-build-swap refuses Linux hosts before checking Colima", async () => {
  const result = await runWithFakeHost(["status"], { os: "Linux", arch: "x86_64" });

  assert.equal(result.code, 1);
  assert.match(result.stderr, /requires Apple Silicon macOS/);
  assert.equal(result.colimaLog, "");
});

test("prepare-colima-build-swap refuses Intel macOS hosts before checking Colima", async () => {
  const result = await runWithFakeHost(["status"], { os: "Darwin", arch: "x86_64" });

  assert.equal(result.code, 1);
  assert.match(result.stderr, /requires Apple Silicon macOS/);
  assert.equal(result.colimaLog, "");
});

test("prepare-colima-build-swap allows Apple Silicon macOS hosts to check Colima", async () => {
  const result = await runWithFakeHost(["status"], { os: "Darwin", arch: "arm64" });

  assert.equal(result.code, 0);
  assert.match(result.colimaLog, /^status\nssh -- sh -lc/m);
});
