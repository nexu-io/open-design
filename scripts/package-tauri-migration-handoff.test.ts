import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { access, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const scriptsRoot = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptsRoot, "..");
const packageHandoffScript = join(scriptsRoot, "package-tauri-migration-handoff.ts");
const migrationBranch = "codex/electron-to-tauri-migration";
const branchHead = "1".repeat(40);

test("package-tauri-migration-handoff creates a tarball and checksum sidecar", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "open-design-tauri-package-handoff-pass-"));
  t.after(() => void rm(root, { force: true, recursive: true }));
  const handoffDir = join(root, "handoff");
  const output = join(root, "open-design-tauri-migration-handoff.tar.gz");
  const bundleSha256 = await writeHandoffFixture(handoffDir);

  const result = await runPackageHandoffScript("--handoff-dir", handoffDir, "--output", output);

  assert.match(result.stdout, /Packaged Tauri migration handoff/);
  assert.match(result.stdout, new RegExp(`Branch: ${migrationBranch.replaceAll("/", "\\/")} @ ${branchHead}`));
  assert.match(result.stdout, new RegExp(`Bundle SHA-256: ${bundleSha256}`));
  assert.match(result.stdout, new RegExp(`Archive: ${escapeRegExp(output)}`));
  assert.match(result.stdout, /Archive SHA-256: [0-9a-f]{64}/);
  assert.match(result.stdout, new RegExp(`Command script: ${escapeRegExp(`${output}.commands.sh`)}`));
  assert.match(result.stdout, /Command script SHA-256: [0-9a-f]{64}/);
  assert.match(result.stdout, new RegExp(`Command script checksum: ${escapeRegExp(`${output}.commands.sh.sha256`)}`));
  assert.match(result.stdout, /Receiver push command:/);
  assert.match(result.stdout, /push-tauri-migration-handoff/);
  assert.match(result.stdout, new RegExp(`--archive '${escapeRegExp(output)}'`));
  assert.match(result.stdout, /Native CI trigger after push:/);
  assert.match(result.stdout, /attempts this automatically when gh is available/);
  assert.match(result.stdout, /gh workflow run ci\.yml --ref 'codex\/electron-to-tauri-migration'/);
  assert.match(result.stdout, /Fallback:/);
  assert.match(result.stdout, /template-complete PR body/);
  assert.match(result.stdout, /gh pr create --draft/);
  assert.match(result.stdout, /--body-file \.tmp\/tauri-migration-pr-body\.md/);
  assert.match(result.stdout, /download-tauri-m4-reports/);
  assert.match(result.stdout, /--branch 'codex\/electron-to-tauri-migration'/);
  assert.match(result.stdout, new RegExp(`--expected-head ${branchHead}`));
  assert.match(result.stdout, /--remote origin/);
  assert.match(result.stdout, /--wait/);
  assert.match(result.stdout, /--advance/);
  assert.match(result.stdout, /Continuation runner:/);
  assert.match(result.stdout, /continue-tauri-migration/);
  assert.match(result.stdout, /--wait-reports/);
  assert.match(result.stdout, /tauri-migration-status/);
  assert.match(result.stdout, new RegExp(`--handoff-dir '${escapeRegExp(handoffDir)}'`));
  assert.match(result.stdout, /--report-dir \/tmp\/open-design-tauri-m4-reports/);
  await access(output);
  const commandScript = await readFile(`${output}.commands.sh`, "utf8");
  assert.match(commandScript, /^#!\/usr\/bin\/env bash/);
  assert.match(commandScript, /read_checksum\(\)/);
  assert.match(commandScript, /command_checksum="\$\{script_path\}\.sha256"/);
  assert.match(commandScript, /read_checksum "\$command_checksum" "\$\(basename -- "\$script_path"\)" "command script"/);
  assert.match(commandScript, /read_checksum "\$checksum" "\$\(basename -- "\$archive"\)" "archive"/);
  assert.match(commandScript, /checksum sidecar filename mismatch/);
  assert.match(commandScript, /command script SHA-256 mismatch/);
  assert.match(commandScript, /ensure_tracked_clean\(\)/);
  assert.match(commandScript, /git status --porcelain --untracked-files=no/);
  assert.match(commandScript, /tracked worktree changes are present/);
  assert.match(commandScript, /git fetch "\$bundle" "\$branch:\$temp_ref"/);
  assert.match(commandScript, /git push "\$remote" "refs\/heads\/\$branch:refs\/heads\/\$branch"/);
  assert.match(commandScript, /command -v gh/);
  assert.match(commandScript, /gh workflow run "\$workflow" --ref "\$branch"/);
  assert.match(commandScript, /Requested native CI dispatch/);
  assert.match(commandScript, /TAURI_NATIVE_CI_TRIGGER/);
  assert.match(commandScript, /gh pr create --draft/);
  assert.match(commandScript, /TAURI_PR_BODY_PATH/);
  assert.match(commandScript, /handoff_dir=/);
  assert.match(commandScript, /schema_version=/);
  assert.match(commandScript, /unsupported handoff manifest schemaVersion/);
  assert.match(commandScript, /bundle_sha=/);
  assert.match(commandScript, /handoff manifest bundleSha256 must be a 64-character SHA-256/);
  assert.match(commandScript, /handoff manifest bundlePath must be relative and relocatable/);
  assert.match(commandScript, /actual_bundle_sha="\$\(hash_file "\$bundle"\)"/);
  assert.match(commandScript, /bundle SHA-256 mismatch/);
  assert.match(commandScript, /git bundle verify "\$bundle"/);
  assert.match(commandScript, /bundle_heads="\$\(git bundle list-heads "\$bundle"\)"/);
  assert.match(commandScript, /bundle does not contain expected branch head/);
  assert.match(commandScript, /bundle_head="\$\(git rev-parse --verify "\$temp_ref\^\{commit\}"\)"/);
  assert.match(commandScript, /bundle branch head mismatch/);
  assert.match(commandScript, /<<'PR_BODY'/);
  assert.match(commandScript, /--body-file \$pr_body_path/);
  assert.match(commandScript, /## Why/);
  assert.match(commandScript, /## Surface area/);
  assert.match(commandScript, /## Validation/);
  assert.match(commandScript, /GITHUB_RUN_ID/);
  assert.match(commandScript, /download-tauri-m4-reports/);
  assert.match(commandScript, /--run-id "\$GITHUB_RUN_ID" --branch "\$branch" --expected-head "\$expected_head" --remote "\$remote"/);
  assert.match(commandScript, /--expected-head "\$expected_head"/);
  assert.match(commandScript, /--remote "\$remote"/);
  assert.match(commandScript, /--wait/);
  assert.match(commandScript, /tauri-migration-status\.ts --handoff-dir "\$handoff_dir" --remote "\$remote" --report-dir "\$report_dir"/);
  assert.match(commandScript, /--output-dir \$report_dir --advance/);
  assert.doesNotMatch(commandScript, /--output-dir \/tmp\/open-design-tauri-m4-reports --advance/);
  await execFileAsync("bash", ["-n", `${output}.commands.sh`]);
  assert.equal((await stat(`${output}.commands.sh`)).mode & 0o111, 0o111);
  const checksum = await readFile(`${output}.sha256`, "utf8");
  assert.match(checksum, new RegExp(`^[0-9a-f]{64}  ${escapeRegExp(basename(output))}\\n$`));
  const commandScriptChecksum = await readFile(`${output}.commands.sh.sha256`, "utf8");
  assert.match(commandScriptChecksum, new RegExp(`^[0-9a-f]{64}  ${escapeRegExp(basename(`${output}.commands.sh`))}\\n$`));

  const listing = await execFileAsync("tar", ["-tzf", output], { maxBuffer: 1024 * 1024 });
  assert.match(listing.stdout, /handoff\/open-design-tauri-migration\.bundle/);
  assert.match(listing.stdout, /handoff\/open-design-tauri-migration-handoff\.json/);
  assert.match(listing.stdout, /handoff\/open-design-tauri-migration-handoff\.md/);
});

test("package-tauri-migration-handoff verifies the handoff branch head before packaging", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "open-design-tauri-package-handoff-current-"));
  t.after(() => void rm(root, { force: true, recursive: true }));
  const gitRoot = join(root, "repo");
  await initGitFixture(gitRoot);
  const head = (await git(gitRoot, "rev-parse", "HEAD")).stdout.trim();
  const handoffDir = join(root, "handoff");
  const output = join(root, "open-design-tauri-migration-handoff.tar.gz");
  await writeHandoffFixture(handoffDir, { branchHead: head });

  const result = await runPackageHandoffScriptWithCurrentHead("--root", gitRoot, "--handoff-dir", handoffDir, "--output", output);

  assert.match(result.stdout, /Packaged Tauri migration handoff/);
  assert.match(result.stdout, new RegExp(`Branch: ${migrationBranch.replaceAll("/", "\\/")} @ ${head}`));
  await access(output);
});

test("package-tauri-migration-handoff rejects stale branch heads before packaging", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "open-design-tauri-package-handoff-stale-head-"));
  t.after(() => void rm(root, { force: true, recursive: true }));
  const gitRoot = join(root, "repo");
  await initGitFixture(gitRoot);
  const head = (await git(gitRoot, "rev-parse", "HEAD")).stdout.trim();
  const handoffDir = join(root, "handoff");
  const output = join(root, "open-design-tauri-migration-handoff.tar.gz");
  await writeHandoffFixture(handoffDir, { branchHead: "0".repeat(40) });

  await assert.rejects(
    runPackageHandoffScriptWithCurrentHead("--root", gitRoot, "--handoff-dir", handoffDir, "--output", output),
    new RegExp(`handoff branchHead is stale: expected current ${escapeRegExp(migrationBranch)} ${head}, got ${"0".repeat(40)}`),
  );
  await assert.rejects(access(output), /ENOENT/);
});

test("package-tauri-migration-handoff rejects tracked changes before packaging", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "open-design-tauri-package-handoff-dirty-source-"));
  t.after(() => void rm(root, { force: true, recursive: true }));
  const gitRoot = join(root, "repo");
  await initGitFixture(gitRoot);
  const head = (await git(gitRoot, "rev-parse", "HEAD")).stdout.trim();
  const handoffDir = join(root, "handoff");
  const output = join(root, "open-design-tauri-migration-handoff.tar.gz");
  await writeHandoffFixture(handoffDir, { branchHead: head });
  await writeFile(join(gitRoot, "tracked.txt"), "dirty\n", "utf8");

  await assert.rejects(
    runPackageHandoffScriptWithCurrentHead("--root", gitRoot, "--handoff-dir", handoffDir, "--output", output),
    /tracked worktree changes are present; commit or stash them before packaging the migration handoff/,
  );
  await assert.rejects(access(output), /ENOENT/);
});

test("package-tauri-migration-handoff command sidecar verifies its checksum sidecar", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "open-design-tauri-package-handoff-command-checksum-"));
  t.after(() => void rm(root, { force: true, recursive: true }));
  const handoffDir = join(root, "handoff");
  const output = join(root, "open-design-tauri-migration-handoff.tar.gz");
  await writeHandoffFixture(handoffDir);
  await runPackageHandoffScript("--handoff-dir", handoffDir, "--output", output);
  await rm(`${output}.commands.sh.sha256`);

  await assert.rejects(
    execFileAsync("bash", [`${output}.commands.sh`, output]),
    (error) => {
      const detail = error as Error & { stderr?: string };
      assert.match(detail.stderr ?? "", /command script checksum sidecar not found/);
      return true;
    },
  );
});

test("package-tauri-migration-handoff command sidecar rejects command checksum filename mismatches", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "open-design-tauri-package-handoff-command-filename-"));
  t.after(() => void rm(root, { force: true, recursive: true }));
  const handoffDir = join(root, "handoff");
  const output = join(root, "open-design-tauri-migration-handoff.tar.gz");
  await writeHandoffFixture(handoffDir);
  await runPackageHandoffScript("--handoff-dir", handoffDir, "--output", output);
  const commandScriptSha256 = createHash("sha256").update(await readFile(`${output}.commands.sh`)).digest("hex");
  await writeFile(`${output}.commands.sh.sha256`, `${commandScriptSha256}  stale.commands.sh\n`, "utf8");

  await assert.rejects(
    execFileAsync("bash", [`${output}.commands.sh`, output]),
    (error) => {
      const detail = error as Error & { stderr?: string };
      assert.match(detail.stderr ?? "", /command script checksum sidecar filename mismatch/);
      return true;
    },
  );
});

test("package-tauri-migration-handoff command sidecar rejects archive checksum filename mismatches", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "open-design-tauri-package-handoff-archive-filename-"));
  t.after(() => void rm(root, { force: true, recursive: true }));
  const handoffDir = join(root, "handoff");
  const output = join(root, "open-design-tauri-migration-handoff.tar.gz");
  await writeHandoffFixture(handoffDir);
  await runPackageHandoffScript("--handoff-dir", handoffDir, "--output", output);
  const archiveSha256 = createHash("sha256").update(await readFile(output)).digest("hex");
  await writeFile(`${output}.sha256`, `${archiveSha256}  stale-handoff.tar.gz\n`, "utf8");

  await assert.rejects(
    execFileAsync("bash", [`${output}.commands.sh`, output]),
    (error) => {
      const detail = error as Error & { stderr?: string };
      assert.match(detail.stderr ?? "", /archive checksum sidecar filename mismatch/);
      return true;
    },
  );
});

test("package-tauri-migration-handoff command sidecar rejects tracked dirty worktrees", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "open-design-tauri-package-handoff-dirty-worktree-"));
  t.after(() => void rm(root, { force: true, recursive: true }));
  const handoffDir = join(root, "handoff");
  const output = join(root, "open-design-tauri-migration-handoff.tar.gz");
  await writeHandoffFixture(handoffDir);
  await runPackageHandoffScript("--handoff-dir", handoffDir, "--output", output);
  await git(root, "init", "--initial-branch=main");
  await git(root, "config", "user.email", "codex@example.test");
  await git(root, "config", "user.name", "Codex Test");
  await writeFile(join(root, "tracked.txt"), "clean\n", "utf8");
  await git(root, "add", "tracked.txt");
  await git(root, "commit", "-m", "tracked");
  await writeFile(join(root, "tracked.txt"), "dirty\n", "utf8");

  await assert.rejects(
    execFileAsync("bash", [`${output}.commands.sh`, output], { cwd: root }),
    (error) => {
      const detail = error as Error & { stderr?: string };
      assert.match(detail.stderr ?? "", /tracked worktree changes are present/);
      return true;
    },
  );
});

test("package-tauri-migration-handoff command sidecar rejects extracted bundle checksum mismatches", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "open-design-tauri-package-handoff-bundle-mismatch-"));
  t.after(() => void rm(root, { force: true, recursive: true }));
  const handoffDir = join(root, "handoff");
  const output = join(root, "open-design-tauri-migration-handoff.tar.gz");
  await writeHandoffFixture(handoffDir);
  await runPackageHandoffScript("--handoff-dir", handoffDir, "--output", output);

  const extractDir = join(root, "extract");
  await mkdir(extractDir);
  await execFileAsync("tar", ["-xzf", output, "-C", extractDir]);
  await writeFile(join(extractDir, "handoff", "open-design-tauri-migration.bundle"), "tampered\n", "utf8");
  await execFileAsync("tar", ["-czf", output, "-C", extractDir, "handoff"]);
  const archiveSha256 = createHash("sha256").update(await readFile(output)).digest("hex");
  await writeFile(`${output}.sha256`, `${archiveSha256}  ${basename(output)}\n`, "utf8");

  await assert.rejects(
    execFileAsync("bash", [`${output}.commands.sh`, output]),
    (error) => {
      const detail = error as Error & { stderr?: string };
      assert.match(detail.stderr ?? "", /bundle SHA-256 mismatch/);
      return true;
    },
  );
});

test("package-tauri-migration-handoff command sidecar rejects unsupported manifest schemas", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "open-design-tauri-package-handoff-schema-"));
  t.after(() => void rm(root, { force: true, recursive: true }));
  const handoffDir = join(root, "handoff");
  const output = join(root, "open-design-tauri-migration-handoff.tar.gz");
  await writeHandoffFixture(handoffDir);
  await runPackageHandoffScript("--handoff-dir", handoffDir, "--output", output);

  const extractDir = join(root, "extract");
  await mkdir(extractDir);
  await execFileAsync("tar", ["-xzf", output, "-C", extractDir]);
  const manifestPath = join(extractDir, "handoff", "open-design-tauri-migration-handoff.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as Record<string, unknown>;
  manifest.schemaVersion = 2;
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await execFileAsync("tar", ["-czf", output, "-C", extractDir, "handoff"]);
  const archiveSha256 = createHash("sha256").update(await readFile(output)).digest("hex");
  await writeFile(`${output}.sha256`, `${archiveSha256}  ${basename(output)}\n`, "utf8");

  await assert.rejects(
    execFileAsync("bash", [`${output}.commands.sh`, output]),
    (error) => {
      const detail = error as Error & { stderr?: string };
      assert.match(detail.stderr ?? "", /unsupported handoff manifest schemaVersion: 2/);
      return true;
    },
  );
});

test("package-tauri-migration-handoff command sidecar rejects stale branch heads before pushing", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "open-design-tauri-package-handoff-branch-head-"));
  t.after(() => void rm(root, { force: true, recursive: true }));
  const sourceRepo = join(root, "source");
  const remotePath = join(root, "remote.git");
  const targetRepo = join(root, "target");
  const handoffDir = join(root, "handoff");
  const bundlePath = join(handoffDir, "open-design-tauri-migration.bundle");
  const output = join(root, "open-design-tauri-migration-handoff.tar.gz");

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
  await git(root, "init", "--bare", remotePath);
  await git(sourceRepo, "push", remotePath, "main:refs/heads/main");
  await git(root, "clone", "--branch", "main", remotePath, targetRepo);
  await mkdir(handoffDir, { recursive: true });
  await git(sourceRepo, "bundle", "create", bundlePath, migrationBranch, "^main");
  const bundleSha256 = createHash("sha256").update(await readFile(bundlePath)).digest("hex");
  await writeFile(
    join(handoffDir, "open-design-tauri-migration-handoff.json"),
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
  await writeFile(join(handoffDir, "open-design-tauri-migration-handoff.md"), "# Tauri Migration Handoff\n", "utf8");
  await runPackageHandoffScript("--handoff-dir", handoffDir, "--output", output);

  await assert.rejects(
    execFileAsync("bash", [`${output}.commands.sh`, output], {
      cwd: targetRepo,
      env: { ...process.env, REMOTE: remotePath, TAURI_NATIVE_CI_TRIGGER: "0" },
      maxBuffer: 1024 * 1024,
    }),
    (error) => {
      const detail = error as Error & { stderr?: string };
      assert.match(
        detail.stderr ?? "",
        new RegExp(`bundle does not contain expected branch head: refs/heads/${escapeRegExp(migrationBranch)} @ ${"0".repeat(40)}`),
      );
      return true;
    },
  );
  const remoteHead = (await git(targetRepo, "ls-remote", "--heads", remotePath, `refs/heads/${migrationBranch}`)).stdout;
  assert.equal(remoteHead.trim(), "");
});

test("package-tauri-migration-handoff command sidecar verifies bundle prerequisites before import", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "open-design-tauri-package-handoff-bundle-verify-"));
  t.after(() => void rm(root, { force: true, recursive: true }));
  const sourceRepo = join(root, "source");
  const remotePath = join(root, "remote.git");
  const targetRepo = join(root, "target");
  const handoffDir = join(root, "handoff");
  const bundlePath = join(handoffDir, "open-design-tauri-migration.bundle");
  const output = join(root, "open-design-tauri-migration-handoff.tar.gz");

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
  await git(root, "init", "--initial-branch=main", targetRepo);
  await mkdir(handoffDir, { recursive: true });
  await git(sourceRepo, "bundle", "create", bundlePath, migrationBranch, "^main");
  const bundleSha256 = createHash("sha256").update(await readFile(bundlePath)).digest("hex");
  await writeFile(
    join(handoffDir, "open-design-tauri-migration-handoff.json"),
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
  await runPackageHandoffScript("--handoff-dir", handoffDir, "--output", output);

  await assert.rejects(
    execFileAsync("bash", [`${output}.commands.sh`, output], {
      cwd: targetRepo,
      env: { ...process.env, REMOTE: remotePath, TAURI_NATIVE_CI_TRIGGER: "0" },
      maxBuffer: 1024 * 1024,
    }),
    (error) => {
      const detail = error as Error & { stderr?: string };
      assert.match(detail.stderr ?? "", /prerequisite/i);
      return true;
    },
  );
  await assert.rejects(git(targetRepo, "rev-parse", migrationBranch));
});

test("package-tauri-migration-handoff rejects mismatched bundle checksums", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "open-design-tauri-package-handoff-mismatch-"));
  t.after(() => void rm(root, { force: true, recursive: true }));
  const handoffDir = join(root, "handoff");
  await writeHandoffFixture(handoffDir, { bundleSha256: "0".repeat(64) });

  await assert.rejects(
    runPackageHandoffScript("--handoff-dir", handoffDir, "--output", join(root, "handoff.tar.gz")),
    /bundle SHA-256 mismatch/,
  );
});

test("package-tauri-migration-handoff rejects non-relocatable bundle paths", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "open-design-tauri-package-handoff-absolute-"));
  t.after(() => void rm(root, { force: true, recursive: true }));
  const handoffDir = join(root, "handoff");
  const bundlePath = join(handoffDir, "open-design-tauri-migration.bundle");
  await writeHandoffFixture(handoffDir, { bundlePath });

  await assert.rejects(
    runPackageHandoffScript("--handoff-dir", handoffDir, "--output", join(root, "handoff.tar.gz")),
    /bundlePath must be relative and relocatable/,
  );
});

test("package-tauri-migration-handoff rejects archives inside the handoff directory", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "open-design-tauri-package-handoff-output-"));
  t.after(() => void rm(root, { force: true, recursive: true }));
  const handoffDir = join(root, "handoff");
  await writeHandoffFixture(handoffDir);

  await assert.rejects(
    runPackageHandoffScript("--handoff-dir", handoffDir, "--output", join(handoffDir, "handoff.tar.gz")),
    /--output must be outside the handoff directory/,
  );
});

async function writeHandoffFixture(
  handoffDir: string,
  options: { branchHead?: string; bundlePath?: string; bundleSha256?: string } = {},
): Promise<string> {
  const bundlePath = join(handoffDir, "open-design-tauri-migration.bundle");
  const bundle = Buffer.from("bundle\n", "utf8");
  const bundleSha256 = createHash("sha256").update(bundle).digest("hex");
  await mkdir(handoffDir, { recursive: true });
  await writeFile(bundlePath, bundle);
  await writeFile(
    join(handoffDir, "open-design-tauri-migration-handoff.json"),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        branch: migrationBranch,
        branchHead: options.branchHead ?? branchHead,
        bundlePath: options.bundlePath ?? "open-design-tauri-migration.bundle",
        bundleSha256: options.bundleSha256 ?? bundleSha256,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  await writeFile(join(handoffDir, "open-design-tauri-migration-handoff.md"), "# Tauri Migration Handoff\n", "utf8");
  return bundleSha256;
}

async function runPackageHandoffScript(...args: string[]): Promise<{ stderr: string; stdout: string }> {
  return execFileAsync(process.execPath, ["--import", "tsx", packageHandoffScript, "--skip-current-head-check", ...args], {
    cwd: repoRoot,
    maxBuffer: 1024 * 1024,
  });
}

async function runPackageHandoffScriptWithCurrentHead(...args: string[]): Promise<{ stderr: string; stdout: string }> {
  return execFileAsync(process.execPath, ["--import", "tsx", packageHandoffScript, ...args], {
    cwd: repoRoot,
    maxBuffer: 1024 * 1024,
  });
}

async function initGitFixture(root: string): Promise<void> {
  await mkdir(root, { recursive: true });
  await git(root, "init", "--initial-branch=main");
  await git(root, "config", "user.email", "codex@example.test");
  await git(root, "config", "user.name", "Codex Test");
  await writeFile(join(root, "tracked.txt"), "clean\n", "utf8");
  await git(root, "add", "tracked.txt");
  await git(root, "commit", "-m", "fixture");
  await git(root, "checkout", "-b", migrationBranch);
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
