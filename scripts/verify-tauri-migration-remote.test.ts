import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const scriptsRoot = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptsRoot, "..");
const remoteVerifierScript = join(scriptsRoot, "verify-tauri-migration-remote.ts");
const migrationBranch = "codex/electron-to-tauri-migration";

test("verify-tauri-migration-remote accepts a remote branch matching the handoff manifest", async (t) => {
  const { branchHead, manifestPath, remotePath } = await createRemoteFixture(t, "open-design-tauri-remote-pass-");

  const result = await runRemoteVerifier("--manifest", manifestPath, "--remote", remotePath);

  assert.match(result.stdout, /Verified Tauri migration remote branch/);
  assert.match(result.stdout, new RegExp(`Remote: ${escapeRegExp(remotePath)}`));
  assert.match(result.stdout, new RegExp(`Branch: ${migrationBranch.replaceAll("/", "\\/")} @ ${branchHead}`));
});

test("verify-tauri-migration-remote rejects branch head mismatches", async (t) => {
  const { manifestPath, remotePath } = await createRemoteFixture(t, "open-design-tauri-remote-mismatch-");
  await writeFile(
    manifestPath,
    `${JSON.stringify(
      {
        schemaVersion: 1,
        branch: migrationBranch,
        branchHead: "0".repeat(40),
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  await assert.rejects(
    runRemoteVerifier("--manifest", manifestPath, "--remote", remotePath),
    /remote branch head mismatch/,
  );
});

test("verify-tauri-migration-remote rejects missing remote branches", async (t) => {
  const { manifestPath, remotePath } = await createRemoteFixture(t, "open-design-tauri-remote-missing-");

  await assert.rejects(
    runRemoteVerifier("--manifest", manifestPath, "--remote", remotePath, "--branch", "missing/branch"),
    /remote branch not found/,
  );
});

async function createRemoteFixture(
  t: test.TestContext,
  prefix: string,
): Promise<{ branchHead: string; manifestPath: string; remotePath: string }> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  t.after(() => void rm(root, { force: true, recursive: true }));
  const sourceRepo = join(root, "source");
  const remotePath = join(root, "origin.git");
  const manifestPath = join(root, "handoff.json");

  await git(root, "init", "--initial-branch=main", sourceRepo);
  await git(sourceRepo, "config", "user.email", "codex@example.test");
  await git(sourceRepo, "config", "user.name", "Codex Test");
  await writeFile(join(sourceRepo, "base.txt"), "base\n", "utf8");
  await git(sourceRepo, "add", "base.txt");
  await git(sourceRepo, "commit", "-m", "base");
  await git(sourceRepo, "checkout", "-b", migrationBranch);
  await writeFile(join(sourceRepo, "feature.txt"), "feature\n", "utf8");
  await git(sourceRepo, "add", "feature.txt");
  await git(sourceRepo, "commit", "-m", "feature");
  const branchHead = (await git(sourceRepo, "rev-parse", migrationBranch)).stdout.trim();

  await git(root, "init", "--bare", remotePath);
  await git(sourceRepo, "push", remotePath, `${migrationBranch}:refs/heads/${migrationBranch}`);
  await writeFile(
    manifestPath,
    `${JSON.stringify(
      {
        schemaVersion: 1,
        branch: migrationBranch,
        branchHead,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  return { branchHead, manifestPath, remotePath };
}

async function runRemoteVerifier(...args: string[]): Promise<{ stderr: string; stdout: string }> {
  return execFileAsync(process.execPath, ["--import", "tsx", remoteVerifierScript, ...args], {
    cwd: repoRoot,
    maxBuffer: 1024 * 1024,
  });
}

async function git(cwd: string, ...args: string[]): Promise<{ stderr: string; stdout: string }> {
  return execFileAsync("git", args, {
    cwd,
    maxBuffer: 1024 * 1024,
  });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
