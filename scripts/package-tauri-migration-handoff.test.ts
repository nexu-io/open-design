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
  assert.match(result.stdout, /Receiver push command:/);
  assert.match(result.stdout, /push-tauri-migration-handoff/);
  assert.match(result.stdout, new RegExp(`--archive '${escapeRegExp(output)}'`));
  assert.match(result.stdout, /Native CI trigger after push:/);
  assert.match(result.stdout, /attempts this automatically when gh is available/);
  assert.match(result.stdout, /gh workflow run ci\.yml --ref 'codex\/electron-to-tauri-migration'/);
  assert.match(result.stdout, /Fallback:/);
  assert.match(result.stdout, /gh pr create --draft/);
  assert.match(result.stdout, /download-tauri-m4-reports/);
  assert.match(result.stdout, /--advance/);
  assert.match(result.stdout, /tauri-migration-status/);
  assert.match(result.stdout, new RegExp(`--handoff-dir '${escapeRegExp(handoffDir)}'`));
  await access(output);
  const commandScript = await readFile(`${output}.commands.sh`, "utf8");
  assert.match(commandScript, /^#!\/usr\/bin\/env bash/);
  assert.match(commandScript, /git fetch "\$bundle" "\$branch:\$temp_ref"/);
  assert.match(commandScript, /git push "\$remote" "refs\/heads\/\$branch:refs\/heads\/\$branch"/);
  assert.match(commandScript, /command -v gh/);
  assert.match(commandScript, /gh workflow run "\$workflow" --ref "\$branch"/);
  assert.match(commandScript, /Requested native CI dispatch/);
  assert.match(commandScript, /TAURI_NATIVE_CI_TRIGGER/);
  assert.match(commandScript, /gh pr create --draft/);
  assert.match(commandScript, /GITHUB_RUN_ID/);
  assert.match(commandScript, /download-tauri-m4-reports/);
  await execFileAsync("bash", ["-n", `${output}.commands.sh`]);
  assert.equal((await stat(`${output}.commands.sh`)).mode & 0o111, 0o111);
  const checksum = await readFile(`${output}.sha256`, "utf8");
  assert.match(checksum, new RegExp(`^[0-9a-f]{64}  ${escapeRegExp(basename(output))}\\n$`));

  const listing = await execFileAsync("tar", ["-tzf", output], { maxBuffer: 1024 * 1024 });
  assert.match(listing.stdout, /handoff\/open-design-tauri-migration\.bundle/);
  assert.match(listing.stdout, /handoff\/open-design-tauri-migration-handoff\.json/);
  assert.match(listing.stdout, /handoff\/open-design-tauri-migration-handoff\.md/);
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
  options: { bundleSha256?: string } = {},
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
        branchHead,
        bundlePath: "open-design-tauri-migration.bundle",
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
  return execFileAsync(process.execPath, ["--import", "tsx", packageHandoffScript, ...args], {
    cwd: repoRoot,
    maxBuffer: 1024 * 1024,
  });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
