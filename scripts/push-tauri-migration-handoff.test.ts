import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const scriptsRoot = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptsRoot, "..");
const createBundleScript = join(scriptsRoot, "create-tauri-migration-bundle.ts");
const packageHandoffScript = join(scriptsRoot, "package-tauri-migration-handoff.ts");
const pushHandoffScript = join(scriptsRoot, "push-tauri-migration-handoff.ts");
const migrationBranch = "codex/electron-to-tauri-migration";

test("push-tauri-migration-handoff imports, pushes, and verifies a handoff manifest", async (t) => {
  const { manifestPath, remotePath, sourceHead, targetRepo } = await createHandoffFixture(
    t,
    "open-design-tauri-push-handoff-pass-",
  );

  const result = await runPushHandoffScript(targetRepo, "--manifest", manifestPath, "--remote", remotePath);

  assert.match(result.stdout, /Pushed Tauri migration handoff/);
  assert.match(result.stdout, /Import:/);
  assert.match(result.stdout, /Push:/);
  assert.match(result.stdout, /Verify:/);
  assert.match(result.stdout, new RegExp(`Branch: ${migrationBranch.replaceAll("/", "\\/")} @ ${sourceHead}`));
  assert.match(result.stdout, /Next:/);
  assert.match(result.stdout, /gh workflow run ci\.yml --ref codex\/electron-to-tauri-migration/);
  assert.match(result.stdout, /gh pr create --draft/);
  assert.match(result.stdout, /--body-file/);
  assert.match(result.stdout, /download-tauri-m4-reports/);
  assert.match(result.stdout, new RegExp(`--expected-head ${sourceHead}`));
  assert.match(result.stdout, /--remote /);
  assert.match(result.stdout, /--advance/);
  const prBodyPath = join(targetRepo, ".tmp", "tauri-migration-pr-body.md");
  assert.match(result.stdout, new RegExp(`PR body: ${escapeRegExp(prBodyPath)}`));
  const prBody = await readFile(prBodyPath, "utf8");
  assert.match(prBody, /## Why/);
  assert.match(prBody, /## Surface area/);
  assert.match(prBody, /## Bug fix verification/);
  assert.match(prBody, /Not a bug fix/);
  assert.match(prBody, /scripts\/download-tauri-m4-reports\.test\.ts scripts\/package-tauri-migration-handoff\.test\.ts scripts\/tauri-migration-status\.test\.ts/);
  assert.match(prBody, /Pending native M4 evidence: Windows NSIS, Linux AppImage, and Linux headless platform smoke/);
  const remoteHead = (await git(targetRepo, "ls-remote", "--heads", remotePath, `refs/heads/${migrationBranch}`)).stdout
    .trim()
    .split(/\s+/, 1)[0];
  assert.equal(remoteHead, sourceHead);
});

test("push-tauri-migration-handoff can verify and push a packaged handoff archive", async (t) => {
  const { handoffDir, remotePath, sourceHead, sourceRepo, targetRepo } = await createHandoffFixture(
    t,
    "open-design-tauri-push-handoff-archive-",
  );
  const archivePath = join(dirname(handoffDir), "open-design-tauri-migration-handoff.tar.gz");
  await runPackageHandoffScript("--root", sourceRepo, "--handoff-dir", handoffDir, "--output", archivePath);
  await rm(handoffDir, { force: true, recursive: true });

  const result = await runPushHandoffScript(targetRepo, "--archive", archivePath, "--remote", remotePath);

  assert.match(result.stdout, /Pushed Tauri migration handoff/);
  assert.match(result.stdout, new RegExp(`Archive: ${escapeRegExp(archivePath)}`));
  assert.match(result.stdout, /Archive verify:/);
  assert.match(result.stdout, new RegExp(`Command script: ${escapeRegExp(`${archivePath}.commands.sh`)}`));
  assert.match(result.stdout, /Command script SHA-256: [0-9a-f]{64}/);
  assert.match(result.stdout, new RegExp(`Command script checksum: ${escapeRegExp(`${archivePath}.commands.sh.sha256`)}`));
  assert.match(result.stdout, /Extracted manifest:/);
  assert.match(result.stdout, new RegExp(`--expected-head ${sourceHead}`));
  const remoteHead = (await git(targetRepo, "ls-remote", "--heads", remotePath, `refs/heads/${migrationBranch}`)).stdout
    .trim()
    .split(/\s+/, 1)[0];
  assert.equal(remoteHead, sourceHead);
});

test("push-tauri-migration-handoff prints handoff identity before remote push", async (t) => {
  const { handoffDir, sourceHead, sourceRepo, targetRepo } = await createHandoffFixture(
    t,
    "open-design-tauri-push-handoff-pre-push-identity-",
  );
  const archivePath = join(dirname(handoffDir), "open-design-tauri-migration-handoff.tar.gz");
  await runPackageHandoffScript("--root", sourceRepo, "--handoff-dir", handoffDir, "--output", archivePath);
  const archiveSha256 = createHash("sha256").update(await readFile(archivePath)).digest("hex");
  const commandScriptSha256 = createHash("sha256").update(await readFile(`${archivePath}.commands.sh`)).digest("hex");
  const missingRemote = join(dirname(handoffDir), "missing.git");

  await assert.rejects(
    runPushHandoffScript(targetRepo, "--archive", archivePath, "--remote", missingRemote),
    (error) => {
      const detail = error as Error & { stdout?: string };
      const stdout = detail.stdout ?? "";
      assert.match(stdout, /Prepared Tauri migration handoff push/);
      assert.match(stdout, new RegExp(`Branch: ${migrationBranch.replaceAll("/", "\\/")} @ ${sourceHead}`));
      assert.match(stdout, new RegExp(`Archive SHA-256: ${archiveSha256}`));
      assert.match(stdout, new RegExp(`Command script SHA-256: ${commandScriptSha256}`));
      return true;
    },
  );
});

test("push-tauri-migration-handoff honors receiver workflow, report, and PR body paths", async (t) => {
  const { manifestPath, remotePath, sourceHead, targetRepo } = await createHandoffFixture(
    t,
    "open-design-tauri-push-handoff-custom-paths-",
  );
  const reportDir = join(targetRepo, "custom reports");
  const prBodyPath = join(targetRepo, "custom pr", "tauri-pr.md");
  const ghBin = join(targetRepo, "custom gh", "gh");

  const result = await runPushHandoffScript(
    targetRepo,
    "--manifest",
    manifestPath,
    "--remote",
    remotePath,
    "--gh",
    ghBin,
    "--workflow",
    "release beta.yml",
    "--report-dir",
    reportDir,
    "--pr-body-path",
    prBodyPath,
  );

  assert.match(
    result.stdout,
    new RegExp(`${escapeRegExp(`'${ghBin}'`)} workflow run 'release beta\\.yml' --ref codex/electron-to-tauri-migration`),
  );
  assert.match(result.stdout, new RegExp(`${escapeRegExp(`'${ghBin}'`)} pr create --draft`));
  assert.match(result.stdout, new RegExp(`--body-file '${escapeRegExp(prBodyPath)}'`));
  assert.match(result.stdout, new RegExp(`--output-dir '${escapeRegExp(reportDir)}'`));
  assert.match(result.stdout, new RegExp(`--expected-head ${sourceHead}`));
  const prBody = await readFile(prBodyPath, "utf8");
  assert.match(prBody, /## Validation/);
  assert.match(prBody, /scripts\/download-tauri-m4-reports\.test\.ts scripts\/package-tauri-migration-handoff\.test\.ts scripts\/tauri-migration-status\.test\.ts/);
});

test("push-tauri-migration-handoff resolves relative PR body paths from receiver cwd", async (t) => {
  const { manifestPath, remotePath, targetRepo } = await createHandoffFixture(
    t,
    "open-design-tauri-push-handoff-relative-pr-body-",
  );
  const relativePrBodyPath = join("custom pr", "tauri-pr.md");
  const expectedPrBodyPath = join(targetRepo, relativePrBodyPath);

  const result = await runPushHandoffScript(
    targetRepo,
    "--manifest",
    manifestPath,
    "--remote",
    remotePath,
    "--pr-body-path",
    relativePrBodyPath,
  );

  assert.match(result.stdout, new RegExp(`PR body: ${escapeRegExp(expectedPrBodyPath)}`));
  assert.match(result.stdout, new RegExp(`--body-file '${escapeRegExp(expectedPrBodyPath)}'`));
  assert.match(await readFile(expectedPrBodyPath, "utf8"), /## Validation/);
});

test("push-tauri-migration-handoff honors REMOTE env default", async (t) => {
  const { manifestPath, remotePath, sourceHead, targetRepo } = await createHandoffFixture(
    t,
    "open-design-tauri-push-handoff-remote-env-",
  );

  const result = await execFileAsync(
    process.execPath,
    ["--import", "tsx", pushHandoffScript, "--cwd", targetRepo, "--manifest", manifestPath],
    {
      cwd: repoRoot,
      env: { ...process.env, REMOTE: remotePath },
      maxBuffer: 1024 * 1024 * 4,
    },
  );

  assert.match(result.stdout, new RegExp(`Remote: ${escapeRegExp(remotePath)}`));
  const remoteHead = (await git(targetRepo, "ls-remote", "--heads", remotePath, `refs/heads/${migrationBranch}`)).stdout
    .trim()
    .split(/\s+/, 1)[0];
  assert.equal(remoteHead, sourceHead);
});

test("push-tauri-migration-handoff can override a relocated bundle path", async (t) => {
  const { bundlePath, manifestPath, remotePath, sourceHead, targetRepo } = await createHandoffFixture(
    t,
    "open-design-tauri-push-handoff-bundle-",
  );
  const relocatedBundlePath = join(dirname(dirname(bundlePath)), "copied", "open-design-tauri-migration.bundle");
  await mkdir(dirname(relocatedBundlePath), { recursive: true });
  await rename(bundlePath, relocatedBundlePath);

  const result = await runPushHandoffScript(
    targetRepo,
    "--manifest",
    manifestPath,
    "--bundle",
    relocatedBundlePath,
    "--remote",
    remotePath,
  );

  assert.match(result.stdout, new RegExp(`Bundle override: ${escapeRegExp(relocatedBundlePath)}`));
  const remoteHead = (await git(targetRepo, "ls-remote", "--heads", remotePath, `refs/heads/${migrationBranch}`)).stdout
    .trim()
    .split(/\s+/, 1)[0];
  assert.equal(remoteHead, sourceHead);
});

test("push-tauri-migration-handoff requires a manifest", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "open-design-tauri-push-handoff-missing-"));
  t.after(() => void rm(root, { force: true, recursive: true }));

  await assert.rejects(runPushHandoffScript(root), /--manifest or --archive is required/);
});

test("push-tauri-migration-handoff rejects archive checksum mismatches", async (t) => {
  const { handoffDir, sourceRepo, targetRepo } = await createHandoffFixture(
    t,
    "open-design-tauri-push-handoff-bad-archive-",
  );
  const archivePath = join(dirname(handoffDir), "open-design-tauri-migration-handoff.tar.gz");
  await runPackageHandoffScript("--root", sourceRepo, "--handoff-dir", handoffDir, "--output", archivePath);
  await writeFile(`${archivePath}.sha256`, `${"0".repeat(64)}  ${archivePath.split(/[\\/]/).at(-1)}\n`, "utf8");

  await assert.rejects(runPushHandoffScript(targetRepo, "--archive", archivePath), /archive SHA-256 mismatch/);
});

test("push-tauri-migration-handoff rejects packaged archives without command scripts", async (t) => {
  const { handoffDir, sourceRepo, targetRepo } = await createHandoffFixture(
    t,
    "open-design-tauri-push-handoff-missing-command-",
  );
  const archivePath = join(dirname(handoffDir), "open-design-tauri-migration-handoff.tar.gz");
  await runPackageHandoffScript("--root", sourceRepo, "--handoff-dir", handoffDir, "--output", archivePath);
  await rm(`${archivePath}.commands.sh`);

  await assert.rejects(runPushHandoffScript(targetRepo, "--archive", archivePath), /command script not found/);
});

test("push-tauri-migration-handoff rejects stale command script checksums", async (t) => {
  const { handoffDir, sourceRepo, targetRepo } = await createHandoffFixture(
    t,
    "open-design-tauri-push-handoff-bad-command-checksum-",
  );
  const archivePath = join(dirname(handoffDir), "open-design-tauri-migration-handoff.tar.gz");
  const commandScriptPath = `${archivePath}.commands.sh`;
  await runPackageHandoffScript("--root", sourceRepo, "--handoff-dir", handoffDir, "--output", archivePath);
  await writeFile(`${commandScriptPath}.sha256`, `${"0".repeat(64)}  ${commandScriptPath.split(/[\\/]/).at(-1)}\n`, "utf8");

  await assert.rejects(runPushHandoffScript(targetRepo, "--archive", archivePath), /command script SHA-256 mismatch/);
});

test("push-tauri-migration-handoff rejects non-executable command scripts", async (t) => {
  const { handoffDir, sourceRepo, targetRepo } = await createHandoffFixture(
    t,
    "open-design-tauri-push-handoff-non-executable-command-",
  );
  const archivePath = join(dirname(handoffDir), "open-design-tauri-migration-handoff.tar.gz");
  await runPackageHandoffScript("--root", sourceRepo, "--handoff-dir", handoffDir, "--output", archivePath);
  await chmod(`${archivePath}.commands.sh`, 0o644);

  await assert.rejects(runPushHandoffScript(targetRepo, "--archive", archivePath), /command script is not executable/);
});

test("push-tauri-migration-handoff rejects stale command script content", async (t) => {
  const { handoffDir, sourceRepo, targetRepo } = await createHandoffFixture(
    t,
    "open-design-tauri-push-handoff-stale-command-content-",
  );
  const archivePath = join(dirname(handoffDir), "open-design-tauri-migration-handoff.tar.gz");
  const commandScriptPath = `${archivePath}.commands.sh`;
  const staleCommandScript = "#!/usr/bin/env bash\nread_checksum()\n";
  const staleCommandScriptSha256 = createHash("sha256").update(staleCommandScript).digest("hex");
  await runPackageHandoffScript("--root", sourceRepo, "--handoff-dir", handoffDir, "--output", archivePath);
  await writeFile(commandScriptPath, staleCommandScript, "utf8");
  await chmod(commandScriptPath, 0o755);
  await writeFile(`${commandScriptPath}.sha256`, `${staleCommandScriptSha256}  ${commandScriptPath.split(/[\\/]/).at(-1)}\n`, "utf8");

  await assert.rejects(runPushHandoffScript(targetRepo, "--archive", archivePath), /command script is missing/);
});

test("push-tauri-migration-handoff rejects command scripts without the generated marker", async (t) => {
  const { handoffDir, sourceRepo, targetRepo } = await createHandoffFixture(
    t,
    "open-design-tauri-push-handoff-missing-command-marker-",
  );
  const archivePath = join(dirname(handoffDir), "open-design-tauri-migration-handoff.tar.gz");
  const commandScriptPath = `${archivePath}.commands.sh`;
  await runPackageHandoffScript("--root", sourceRepo, "--handoff-dir", handoffDir, "--output", archivePath);
  const commandScript = (await readFile(commandScriptPath, "utf8")).replace(
    "# generated by scripts/package-tauri-migration-handoff.ts\n",
    "",
  );
  const commandScriptSha256 = createHash("sha256").update(commandScript).digest("hex");
  await writeFile(commandScriptPath, commandScript, "utf8");
  await chmod(commandScriptPath, 0o755);
  await writeFile(`${commandScriptPath}.sha256`, `${commandScriptSha256}  ${commandScriptPath.split(/[\\/]/).at(-1)}\n`, "utf8");

  await assert.rejects(runPushHandoffScript(targetRepo, "--archive", archivePath), /generated command sidecar marker/);
});

test("push-tauri-migration-handoff rejects command scripts with invalid bash syntax", async (t) => {
  const { handoffDir, sourceRepo, targetRepo } = await createHandoffFixture(
    t,
    "open-design-tauri-push-handoff-bad-command-syntax-",
  );
  const archivePath = join(dirname(handoffDir), "open-design-tauri-migration-handoff.tar.gz");
  const commandScriptPath = `${archivePath}.commands.sh`;
  await runPackageHandoffScript("--root", sourceRepo, "--handoff-dir", handoffDir, "--output", archivePath);
  const commandScript = `${await readFile(commandScriptPath, "utf8")}\nif\n`;
  const commandScriptSha256 = createHash("sha256").update(commandScript).digest("hex");
  await writeFile(commandScriptPath, commandScript, "utf8");
  await chmod(commandScriptPath, 0o755);
  await writeFile(`${commandScriptPath}.sha256`, `${commandScriptSha256}  ${commandScriptPath.split(/[\\/]/).at(-1)}\n`, "utf8");

  await assert.rejects(runPushHandoffScript(targetRepo, "--archive", archivePath), /command script syntax invalid/);
});

test("push-tauri-migration-handoff refuses stale manifest heads before pushing", async (t) => {
  const { bundlePath, manifestPath, remotePath, targetRepo } = await createHandoffFixture(
    t,
    "open-design-tauri-push-handoff-stale-head-",
  );
  const bundleSha256 = createHash("sha256").update(await readFile(bundlePath)).digest("hex");
  await writeFile(
    manifestPath,
    `${JSON.stringify(
      {
        schemaVersion: 1,
        branch: migrationBranch,
        branchHead: "0".repeat(40),
        bundlePath: "open-design-tauri-migration.bundle",
        bundleSha256,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  await assert.rejects(
    runPushHandoffScript(targetRepo, "--manifest", manifestPath, "--remote", remotePath),
    /bundle branch head mismatch/,
  );
  const remoteHead = (await git(targetRepo, "ls-remote", "--heads", remotePath, `refs/heads/${migrationBranch}`)).stdout;
  assert.equal(remoteHead.trim(), "");
});

async function createHandoffFixture(
  t: test.TestContext,
  prefix: string,
): Promise<{
  bundlePath: string;
  handoffDir: string;
  manifestPath: string;
  remotePath: string;
  sourceHead: string;
  sourceRepo: string;
  targetRepo: string;
}> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  t.after(() => void rm(root, { force: true, recursive: true }));
  const sourceRepo = join(root, "source");
  const remotePath = join(root, "remote.git");
  const targetRepo = join(root, "target");
  const handoffDir = join(root, "handoff");
  const bundlePath = join(handoffDir, "open-design-tauri-migration.bundle");
  const manifestPath = join(handoffDir, "open-design-tauri-migration-handoff.json");

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
  const sourceHead = (await git(sourceRepo, "rev-parse", migrationBranch)).stdout.trim();

  await git(root, "init", "--bare", remotePath);
  await git(sourceRepo, "push", remotePath, "main:refs/heads/main");
  await git(root, "clone", "--branch", "main", remotePath, targetRepo);
  await runCreateBundleScript(sourceRepo, "--branch", migrationBranch, "--base", "main", "--output", bundlePath);
  const bundleSha256 = createHash("sha256").update(await readFile(bundlePath)).digest("hex");
  await mkdir(handoffDir, { recursive: true });
  await writeFile(
    manifestPath,
    `${JSON.stringify(
      {
        schemaVersion: 1,
        branch: migrationBranch,
        branchHead: sourceHead,
        bundlePath: "open-design-tauri-migration.bundle",
        bundleSha256,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  await writeFile(join(handoffDir, "open-design-tauri-migration-handoff.md"), "# Tauri Migration Handoff\n", "utf8");

  return { bundlePath, handoffDir, manifestPath, remotePath, sourceHead, sourceRepo, targetRepo };
}

async function runCreateBundleScript(cwd: string, ...args: string[]): Promise<{ stderr: string; stdout: string }> {
  return execFileAsync(process.execPath, ["--import", "tsx", createBundleScript, "--cwd", cwd, ...args], {
    cwd: repoRoot,
    maxBuffer: 1024 * 1024,
  });
}

async function runPackageHandoffScript(...args: string[]): Promise<{ stderr: string; stdout: string }> {
  return execFileAsync(process.execPath, ["--import", "tsx", packageHandoffScript, ...args], {
    cwd: repoRoot,
    maxBuffer: 1024 * 1024,
  });
}

async function runPushHandoffScript(cwd: string, ...args: string[]): Promise<{ stderr: string; stdout: string }> {
  return execFileAsync(process.execPath, ["--import", "tsx", pushHandoffScript, "--cwd", cwd, ...args], {
    cwd: repoRoot,
    maxBuffer: 1024 * 1024 * 4,
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
