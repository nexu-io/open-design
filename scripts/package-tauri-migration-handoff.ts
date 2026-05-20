import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { chmod, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { promisify } from "node:util";

import { generatedCommandSidecarHeader } from "./tauri-migration-command-sidecar.ts";
import { tauriMigrationPrBodyLines } from "./tauri-migration-pr-body.ts";

const execFileAsync = promisify(execFile);
const defaultRoot = resolve(import.meta.dirname, "..");
const defaultHandoffDir = "/tmp/open-design-tauri-migration-handoff";
const receiverPrBodyPathArg = '"${TAURI_PR_BODY_PATH:-.tmp/tauri-migration-pr-body.md}"';
const receiverReportDirArg = '"${TAURI_M4_REPORT_DIR:-/tmp/open-design-tauri-m4-reports}"';
const receiverWorkflowArg = '"${GITHUB_WORKFLOW:-ci.yml}"';
const manifestName = "open-design-tauri-migration-handoff.json";
const noteName = "open-design-tauri-migration-handoff.md";

type Args = {
  handoffDir: string;
  output?: string;
  root: string;
  verifyCurrentHead: boolean;
};

type HandoffManifest = {
  branch: string;
  branchHead: string;
  bundlePath: string;
  bundleSha256: string;
  schemaVersion: 1;
};

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const archivePath = resolve(args.output ?? `${args.handoffDir}.tar.gz`);
  ensureOutputOutsideHandoff(args.handoffDir, archivePath);

  const handoff = await validateHandoff(args.handoffDir);
  if (args.verifyCurrentHead) {
    await assertHandoffMatchesCurrentGitState(args.root, handoff.manifest);
  }
  await mkdir(dirname(archivePath), { recursive: true });
  await execFileAsync("tar", ["-czf", archivePath, "-C", dirname(args.handoffDir), basename(args.handoffDir)], {
    maxBuffer: 1024 * 1024,
  });

  const archiveSha256 = await sha256File(archivePath);
  const checksumPath = `${archivePath}.sha256`;
  const commandScriptPath = `${archivePath}.commands.sh`;
  const commandScriptChecksumPath = `${commandScriptPath}.sha256`;
  await writeFile(checksumPath, `${archiveSha256}  ${basename(archivePath)}\n`, "utf8");
  await writeFile(commandScriptPath, commandScript(archivePath), "utf8");
  await chmod(commandScriptPath, 0o755);
  const commandScriptSha256 = await sha256File(commandScriptPath);
  await writeFile(commandScriptChecksumPath, `${commandScriptSha256}  ${basename(commandScriptPath)}\n`, "utf8");

  process.stdout.write(
    [
      "Packaged Tauri migration handoff.",
      `Handoff: ${args.handoffDir}`,
      `Manifest: ${handoff.manifestPath}`,
      `Note: ${handoff.notePath}`,
      `Branch: ${handoff.manifest.branch} @ ${handoff.manifest.branchHead}`,
      `Bundle: ${handoff.bundlePath}`,
      `Bundle SHA-256: ${handoff.manifest.bundleSha256}`,
      `Archive: ${archivePath}`,
      `Archive SHA-256: ${archiveSha256}`,
      `Checksum: ${checksumPath}`,
      `Command script: ${commandScriptPath}`,
      `Command script SHA-256: ${commandScriptSha256}`,
      `Command script checksum: ${commandScriptChecksumPath}`,
      "Receiver command sidecar:",
      indent(`${shellQuote(commandScriptPath)} ${shellQuote(archivePath)}`),
      "Receiver push command:",
      indent(
        [
          "pnpm exec tsx scripts/push-tauri-migration-handoff.ts \\",
          `  --archive ${shellQuote(archivePath)} \\`,
          '  --remote "${REMOTE:-origin}" \\',
          `  --workflow ${receiverWorkflowArg} \\`,
          `  --report-dir ${receiverReportDirArg} \\`,
          `  --pr-body-path ${receiverPrBodyPathArg}`,
        ].join("\n"),
      ),
      "Receiver environment overrides:",
      indent(
        [
          "REMOTE=<remote>",
          "GITHUB_WORKFLOW=<workflow-file>",
          "GH_BIN=<path-to-gh>",
          "TAURI_M4_REPORT_DIR=<report-dir>",
          "TAURI_PR_BODY_PATH=<pr-body-path>",
          "TAURI_NATIVE_CI_TRIGGER=0",
          "TAURI_NATIVE_CI_WAIT=1",
          "GITHUB_RUN_ID=<github-run-id>",
        ].join("\n"),
      ),
      "Native CI trigger after push:",
      indent(
        [
          "The command script attempts this automatically when GH_BIN/gh is available:",
          `\${GH_BIN:-gh} workflow run ci.yml --ref ${shellQuote(handoff.manifest.branch)}`,
          "Fallback:",
          "The command script writes a template-complete PR body to .tmp/tauri-migration-pr-body.md before printing this command:",
          [
            "${GH_BIN:-gh} pr create --draft \\",
            "  --base main \\",
            `  --head ${shellQuote(handoff.manifest.branch)} \\`,
            "  --title 'Migrate desktop runtime to Tauri' \\",
            "  --body-file .tmp/tauri-migration-pr-body.md",
          ].join("\n"),
        ].join("\n"),
      ),
      "After native CI reports are available:",
      indent(
        [
          "pnpm exec tsx scripts/download-tauri-m4-reports.ts \\",
          `  --branch ${shellQuote(handoff.manifest.branch)} \\`,
          `  --expected-head ${handoff.manifest.branchHead} \\`,
          '  --remote "${REMOTE:-origin}" \\',
          "  --wait \\",
          `  --output-dir ${receiverReportDirArg} \\`,
          "  --advance",
        ].join("\n"),
      ),
      "Continuation runner:",
      indent(
        [
          "pnpm exec tsx scripts/continue-tauri-migration.ts \\",
          `  --handoff-dir ${shellQuote(args.handoffDir)} \\`,
          `  --handoff-archive ${shellQuote(archivePath)} \\`,
          '  --remote "${REMOTE:-origin}" \\',
          `  --report-dir ${receiverReportDirArg} \\`,
          "  --wait-reports \\",
          "  --advance",
        ].join("\n"),
      ),
      "Status check:",
      indent(
        [
          "pnpm exec tsx scripts/tauri-migration-status.ts \\",
          `  --handoff-dir ${shellQuote(args.handoffDir)} \\`,
          `  --handoff-archive ${shellQuote(archivePath)} \\`,
          '  --remote "${REMOTE:-origin}" \\',
          `  --report-dir ${receiverReportDirArg}`,
        ].join("\n"),
      ),
      "",
    ].join("\n"),
  );
}

function parseArgs(argv: string[]): Args {
  const parsed: Args = { handoffDir: defaultHandoffDir, root: defaultRoot, verifyCurrentHead: true };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];
    if ((arg === "--handoff-dir" || arg === "--output" || arg === "--root") && value == null) {
      throw new Error(`${arg} requires a value`);
    }
    if (arg === "--handoff-dir") {
      parsed.handoffDir = resolve(value!);
      index += 1;
      continue;
    }
    if (arg === "--output") {
      parsed.output = resolve(value!);
      index += 1;
      continue;
    }
    if (arg === "--root") {
      parsed.root = resolve(value!);
      index += 1;
      continue;
    }
    if (arg === "--skip-current-head-check") {
      parsed.verifyCurrentHead = false;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      process.stdout.write(
        [
          "usage: tsx scripts/package-tauri-migration-handoff.ts [--handoff-dir <dir>] [--output <tar.gz>] [--root <repo>] [--skip-current-head-check]",
          "",
          "Packages a verified Tauri migration handoff directory for a write-capable receiver.",
          "By default, refuses to package when the handoff branch head is stale or tracked worktree changes are present.",
          `defaults: --root ${defaultRoot} --handoff-dir ${defaultHandoffDir} --output <handoff-dir>.tar.gz`,
          "",
        ].join("\n"),
      );
      process.exit(0);
    }
    throw new Error(`unsupported argument: ${arg}`);
  }
  return parsed;
}

async function assertHandoffMatchesCurrentGitState(root: string, manifest: HandoffManifest): Promise<void> {
  const trackedStatus = await git(root, ["status", "--porcelain", "--untracked-files=no"]);
  if (trackedStatus.stdout.trim().length > 0) {
    throw new Error("tracked worktree changes are present; commit or stash them before packaging the migration handoff");
  }
  const localHead = await git(root, ["rev-parse", "--verify", `refs/heads/${manifest.branch}^{commit}`]);
  const head = localHead.stdout.trim();
  if (head !== manifest.branchHead) {
    throw new Error(`handoff branchHead is stale: expected current ${manifest.branch} ${head}, got ${manifest.branchHead}`);
  }
}

async function git(root: string, args: string[]): Promise<{ stderr: string; stdout: string }> {
  try {
    return await execFileAsync("git", args, {
      cwd: root,
      maxBuffer: 1024 * 1024,
    });
  } catch (error) {
    if (error instanceof Error && "stderr" in error) {
      const detail = error as Error & { stderr?: string };
      throw new Error(`git ${args.join(" ")} failed under ${root}: ${detail.stderr?.trim() ?? error.message}`);
    }
    throw error;
  }
}

async function validateHandoff(handoffDir: string): Promise<{
  bundlePath: string;
  manifest: HandoffManifest;
  manifestPath: string;
  notePath: string;
}> {
  await assertDirectory(handoffDir);
  const manifestPath = join(handoffDir, manifestName);
  const notePath = join(handoffDir, noteName);
  const manifest = readManifest(JSON.parse(await readFile(manifestPath, "utf8")) as Partial<HandoffManifest>);
  if (!isRelocatableManifestBundlePath(manifest.bundlePath)) {
    throw new Error(`handoff manifest bundlePath must be relative and relocatable before packaging: ${manifest.bundlePath}`);
  }
  const bundlePath = resolve(dirname(manifestPath), manifest.bundlePath);
  ensureInsideHandoff(handoffDir, bundlePath, "handoff manifest bundlePath");
  await assertFile(notePath, "handoff note");
  await assertFile(bundlePath, "handoff bundle");

  const bundleSha256 = await sha256File(bundlePath);
  if (bundleSha256 !== manifest.bundleSha256) {
    throw new Error(`bundle SHA-256 mismatch: expected ${manifest.bundleSha256}, got ${bundleSha256}`);
  }

  return {
    bundlePath,
    manifest,
    manifestPath,
    notePath,
  };
}

async function assertDirectory(path: string): Promise<void> {
  const value = await stat(path);
  if (!value.isDirectory()) {
    throw new Error(`handoff path is not a directory: ${path}`);
  }
}

async function assertFile(path: string, label: string): Promise<void> {
  const value = await stat(path);
  if (!value.isFile()) {
    throw new Error(`${label} is not a file: ${path}`);
  }
}

function readManifest(value: Partial<HandoffManifest>): HandoffManifest {
  if (value.schemaVersion !== 1) {
    throw new Error(`unsupported handoff manifest schemaVersion: ${String(value.schemaVersion)}`);
  }
  if (typeof value.branch !== "string" || value.branch.length === 0) {
    throw new Error("handoff manifest missing branch");
  }
  if (typeof value.branchHead !== "string" || !/^[0-9a-f]{40}$/.test(value.branchHead)) {
    throw new Error("handoff manifest missing branchHead");
  }
  if (typeof value.bundlePath !== "string" || value.bundlePath.length === 0) {
    throw new Error("handoff manifest missing bundlePath");
  }
  if (typeof value.bundleSha256 !== "string" || !/^[0-9a-f]{64}$/.test(value.bundleSha256)) {
    throw new Error("handoff manifest missing bundleSha256");
  }
  return {
    branch: value.branch,
    branchHead: value.branchHead,
    bundlePath: value.bundlePath,
    bundleSha256: value.bundleSha256,
    schemaVersion: value.schemaVersion,
  };
}

function ensureInsideHandoff(handoffDir: string, targetPath: string, label: string): void {
  const relativeTarget = relative(handoffDir, targetPath);
  if (relativeTarget === "" || relativeTarget.startsWith("..") || isAbsolute(relativeTarget)) {
    throw new Error(`${label} must resolve inside the handoff directory: ${targetPath}`);
  }
}

function ensureOutputOutsideHandoff(handoffDir: string, outputPath: string): void {
  const relativeOutput = relative(handoffDir, outputPath);
  if (relativeOutput.startsWith("..") || isAbsolute(relativeOutput)) {
    return;
  }
  throw new Error(`--output must be outside the handoff directory so it is not archived into itself: ${outputPath}`);
}

function isRelocatableManifestBundlePath(value: string): boolean {
  return value.length > 0 && !isAbsolute(value) && value.split(/[\\/]/)[0] !== "..";
}

async function sha256File(path: string): Promise<string> {
  const hash = createHash("sha256");
  const stream = createReadStream(path);
  for await (const chunk of stream) {
    hash.update(chunk);
  }
  return hash.digest("hex");
}

function indent(value: string): string {
  return value
    .split(/\r?\n/)
    .map((line) => `  ${line}`)
    .join("\n");
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function commandScript(archivePath: string): string {
  return [
    "#!/usr/bin/env bash",
    generatedCommandSidecarHeader(),
    "set -euo pipefail",
    "",
    'script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"',
    'script_path="$script_dir/$(basename -- "${BASH_SOURCE[0]}")"',
    `archive="\${1:-$script_dir/${basename(archivePath)}}"`,
    'checksum="${archive}.sha256"',
    'command_checksum="${script_path}.sha256"',
    'remote="${REMOTE:-origin}"',
    'workflow="${GITHUB_WORKFLOW:-ci.yml}"',
    'if [[ ! "$workflow" =~ \\.ya?ml$ ]]; then',
    '  workflow="ci.yml"',
    "fi",
    'gh_bin="${GH_BIN:-gh}"',
    'report_dir="${TAURI_M4_REPORT_DIR:-/tmp/open-design-tauri-m4-reports}"',
    'tmp_root="$(mktemp -d)"',
    'restore_branch=""',
    'cleanup() {',
    '  if [[ -n "$restore_branch" ]]; then',
    '    git checkout "$restore_branch" >/dev/null 2>&1 || true',
    "  fi",
    '  rm -rf "$tmp_root"',
    "}",
    "trap cleanup EXIT",
    "",
    "read_checksum() {",
    '  local checksum_path="$1"',
    '  local expected_name="$2"',
    '  local label="$3"',
    "  local checksum_name",
    "  local checksum_sha",
    "  checksum_sha=\"$(awk '{print $1}' \"$checksum_path\")\"",
    "  checksum_name=\"$(awk '{$1=\"\"; sub(/^[[:space:]]+/, \"\"); print}' \"$checksum_path\")\"",
    '  if [[ ! "$checksum_sha" =~ ^[0-9a-f]{64}$ || -z "$checksum_name" ]]; then',
    '    echo "$label checksum sidecar has invalid format: $checksum_path" >&2',
    "    exit 1",
    "  fi",
    '  if [[ "$checksum_name" != "$expected_name" ]]; then',
    '    echo "$label checksum sidecar filename mismatch: expected $expected_name, got $checksum_name" >&2',
    "    exit 1",
    "  fi",
    '  printf \'%s\\n\' "$checksum_sha"',
    "}",
    "",
    "hash_file() {",
    "  if command -v shasum >/dev/null 2>&1; then",
    "    shasum -a 256 \"$1\" | awk '{print $1}'",
    "  elif command -v sha256sum >/dev/null 2>&1; then",
    "    sha256sum \"$1\" | awk '{print $1}'",
    "  else",
    '    echo "shasum or sha256sum is required to verify the handoff package" >&2',
    "    exit 1",
    "  fi",
    "}",
    "",
    "ensure_tracked_clean() {",
    '  local tracked_status=""',
    '  tracked_status="$(git status --porcelain --untracked-files=no)"',
    '  if [[ -n "$tracked_status" ]]; then',
    '    echo "tracked worktree changes are present; commit or stash them before importing the migration handoff" >&2',
    "    exit 1",
    "  fi",
    "}",
    "",
    "print_shell_command() {",
    "  local first=1",
    "  local word",
    "  printf '  '",
    '  for word in "$@"; do',
    '    if [[ "$first" == "1" ]]; then',
    "      first=0",
    "    else",
    "      printf ' '",
    "    fi",
    '    printf \'%q\' "$word"',
    "  done",
    "  printf '\\n'",
    "}",
    "",
    'if [[ ! -f "$command_checksum" ]]; then',
    '  echo "command script checksum sidecar not found: $command_checksum" >&2',
    "  exit 1",
    "fi",
    'actual_command_sha="$(hash_file "$script_path")"',
    'expected_command_sha="$(read_checksum "$command_checksum" "$(basename -- "$script_path")" "command script")"',
    'if [[ "$actual_command_sha" != "$expected_command_sha" ]]; then',
    '  echo "command script SHA-256 mismatch: expected $expected_command_sha, got $actual_command_sha" >&2',
    "  exit 1",
    "fi",
    "",
    'if [[ ! -f "$archive" ]]; then',
    '  echo "handoff archive not found: $archive" >&2',
    "  exit 1",
    "fi",
    'if [[ ! -f "$checksum" ]]; then',
    '  echo "handoff checksum sidecar not found: $checksum" >&2',
    "  exit 1",
    "fi",
    "",
    'actual_sha="$(hash_file "$archive")"',
    'expected_sha="$(read_checksum "$checksum" "$(basename -- "$archive")" "archive")"',
    'if [[ "$actual_sha" != "$expected_sha" ]]; then',
    '  echo "archive SHA-256 mismatch: expected $expected_sha, got $actual_sha" >&2',
    "  exit 1",
    "fi",
    "",
    "while IFS= read -r entry; do",
    '  [[ -n "$entry" ]] || continue',
    '  if [[ "$entry" == /* || "$entry" == ".." || "$entry" == "../"* || "$entry" == *"/../"* || "$entry" == *"/.." ]]; then',
    '    echo "handoff archive contains unsafe path: $entry" >&2',
    "    exit 1",
    "  fi",
    'done < <(tar -tzf "$archive")',
    "",
    'tar -xzf "$archive" -C "$tmp_root"',
    'manifest_count="$(find "$tmp_root" -name open-design-tauri-migration-handoff.json -type f | wc -l | tr -d " ")"',
    'if [[ "$manifest_count" != "1" ]]; then',
    '  echo "handoff archive must contain exactly one manifest; found $manifest_count" >&2',
    "  exit 1",
    "fi",
    'manifest="$(find "$tmp_root" -name open-design-tauri-migration-handoff.json -type f | head -n 1)"',
    'handoff_dir="$(cd -- "$(dirname -- "$manifest")" && pwd)"',
    'schema_version="$(node -e "const fs=require(\'fs\'); const m=JSON.parse(fs.readFileSync(process.argv[1],\'utf8\')); process.stdout.write(String(m.schemaVersion))" "$manifest")"',
    'branch="$(node -e "const fs=require(\'fs\'); const m=JSON.parse(fs.readFileSync(process.argv[1],\'utf8\')); process.stdout.write(m.branch)" "$manifest")"',
    'expected_head="$(node -e "const fs=require(\'fs\'); const m=JSON.parse(fs.readFileSync(process.argv[1],\'utf8\')); process.stdout.write(m.branchHead)" "$manifest")"',
    'bundle_rel="$(node -e "const fs=require(\'fs\'); const m=JSON.parse(fs.readFileSync(process.argv[1],\'utf8\')); process.stdout.write(m.bundlePath)" "$manifest")"',
    'bundle_sha="$(node -e "const fs=require(\'fs\'); const m=JSON.parse(fs.readFileSync(process.argv[1],\'utf8\')); process.stdout.write(m.bundleSha256)" "$manifest")"',
    'if [[ "$schema_version" != "1" ]]; then',
    '  echo "unsupported handoff manifest schemaVersion: $schema_version" >&2',
    "  exit 1",
    "fi",
    'if [[ -z "$branch" ]]; then',
    '  echo "handoff manifest missing branch" >&2',
    "  exit 1",
    "fi",
    'if [[ ! "$expected_head" =~ ^[0-9a-f]{40}$ ]]; then',
    '  echo "handoff manifest branchHead must be a 40-character SHA-1: $expected_head" >&2',
    "  exit 1",
    "fi",
    'if [[ ! "$bundle_sha" =~ ^[0-9a-f]{64}$ ]]; then',
    '  echo "handoff manifest bundleSha256 must be a 64-character SHA-256: $bundle_sha" >&2',
    "  exit 1",
    "fi",
    'if [[ -z "$bundle_rel" || "$bundle_rel" == /* || "$bundle_rel" == ".." || "$bundle_rel" == "../"* || "$bundle_rel" == *"/../"* || "$bundle_rel" == *"/.." ]]; then',
    '  echo "handoff manifest bundlePath must be relative and relocatable: $bundle_rel" >&2',
    "  exit 1",
    "fi",
    'bundle="$(cd -- "$(dirname -- "$manifest")" && pwd)/$bundle_rel"',
    'pr_body_path="${TAURI_PR_BODY_PATH:-$PWD/.tmp/tauri-migration-pr-body.md}"',
    'if [[ ! -f "$bundle" ]]; then',
    '  echo "handoff bundle not found: $bundle" >&2',
    "  exit 1",
    "fi",
    'actual_bundle_sha="$(hash_file "$bundle")"',
    'if [[ "$actual_bundle_sha" != "$bundle_sha" ]]; then',
    '  echo "bundle SHA-256 mismatch: expected $bundle_sha, got $actual_bundle_sha" >&2',
    "  exit 1",
    "fi",
    'printf \'%s\\n\' "Verified handoff package identity:"',
    'printf \'%s\\n\' "  Expected remote head: $branch @ $expected_head"',
    'printf \'%s\\n\' "  Archive SHA-256: $actual_sha"',
    'printf \'%s\\n\' "  Command script SHA-256: $actual_command_sha"',
    'printf \'%s\\n\' "  Bundle SHA-256: $actual_bundle_sha"',
    "ensure_tracked_clean",
    'git bundle verify "$bundle" >/dev/null',
    'bundle_heads="$(git bundle list-heads "$bundle")"',
    'if ! printf \'%s\\n\' "$bundle_heads" | awk -v expected="$expected_head" -v ref="refs/heads/$branch" \'$1 == expected && $2 == ref { found = 1 } END { exit found ? 0 : 1 }\'; then',
    '  echo "bundle does not contain expected branch head: refs/heads/$branch @ $expected_head" >&2',
    "  exit 1",
    "fi",
    'mkdir -p "$(dirname -- "$pr_body_path")"',
    "cat > \"$pr_body_path\" <<'PR_BODY'",
    ...tauriMigrationPrBodyLines,
    "PR_BODY",
    "",
    'temp_ref="refs/heads/__open_design_tauri_import_$$"',
    'git update-ref -d "$temp_ref" >/dev/null 2>&1 || true',
    'current_branch="$(git symbolic-ref --short -q HEAD || true)"',
    'git fetch "$bundle" "$branch:$temp_ref"',
    'bundle_head="$(git rev-parse --verify "$temp_ref^{commit}")"',
    'if [[ "$bundle_head" != "$expected_head" ]]; then',
    '  git update-ref -d "$temp_ref" >/dev/null 2>&1 || true',
    '  echo "bundle branch head mismatch: expected $expected_head, got $bundle_head" >&2',
    "  exit 1",
    "fi",
    'if [[ "$current_branch" == "$branch" ]]; then',
    '  restore_branch="$branch"',
    "  git checkout --detach >/dev/null",
    "fi",
    'git branch -f "$branch" "$temp_ref" >/dev/null',
    'git update-ref -d "$temp_ref" >/dev/null 2>&1 || true',
    'git push "$remote" "refs/heads/$branch:refs/heads/$branch"',
    'remote_head="$(git ls-remote --heads "$remote" "refs/heads/$branch" | awk \'{print $1}\')"',
    'if [[ "$remote_head" != "$expected_head" ]]; then',
    '  echo "remote branch head mismatch: expected $expected_head, got $remote_head" >&2',
    "  exit 1",
    "fi",
    'git checkout "$branch" >/dev/null',
    'restore_branch=""',
    'echo "Verified remote $remote $branch at $remote_head."',
    'pnpm exec tsx scripts/tauri-migration-status.ts --handoff-dir "$handoff_dir" --handoff-archive "$archive" --remote "$remote" --report-dir "$report_dir"',
    "",
    'if [[ -n "${GITHUB_RUN_ID:-}" ]]; then',
    '  pnpm exec tsx scripts/download-tauri-m4-reports.ts --run-id "$GITHUB_RUN_ID" --branch "$branch" --expected-head "$expected_head" --remote "$remote" --output-dir "$report_dir" --advance',
    "else",
    '  workflow_dispatched=false',
    '  if [[ "${TAURI_NATIVE_CI_TRIGGER:-1}" != "0" ]] && command -v "$gh_bin" >/dev/null 2>&1; then',
    '    if "$gh_bin" workflow run "$workflow" --ref "$branch"; then',
    '      workflow_dispatched=true',
    '      printf \'%s\\n\' "Requested native CI dispatch: $workflow @ $branch"',
    "    else",
    '      printf \'%s\\n\' "gh workflow dispatch failed; trigger native CI manually." >&2',
    "    fi",
    "  fi",
    '  if [[ "$workflow_dispatched" != "true" ]]; then',
    `    printf '%s\\n' "Remote push is complete. Trigger native CI with one of:"`,
    '    print_shell_command "$gh_bin" workflow run "$workflow" --ref "$branch"',
    `    printf '%s\\n' "or"`,
    '    print_shell_command "$gh_bin" pr create --draft --base main --head "$branch" --title "Migrate desktop runtime to Tauri" --body-file "$pr_body_path"',
    "  fi",
    '  if [[ "$workflow_dispatched" == "true" && "${TAURI_NATIVE_CI_WAIT:-0}" == "1" ]]; then',
    '    pnpm exec tsx scripts/download-tauri-m4-reports.ts --branch "$branch" --expected-head "$expected_head" --remote "$remote" --wait --output-dir "$report_dir" --advance',
    "  else",
    `    printf '%s\\n' ""`,
    `    printf '%s\\n' "After the native run completes, rerun with:"`,
    '    print_shell_command "GITHUB_RUN_ID=<github-run-id>" "$script_path" "$archive"',
    `    printf '%s\\n' ""`,
    `    printf '%s\\n' "or wait for the matching branch-head run and advance automatically:"`,
    '    print_shell_command pnpm exec tsx scripts/download-tauri-m4-reports.ts --branch "$branch" --expected-head "$expected_head" --remote "$remote" --wait --output-dir "$report_dir" --advance',
    `    if [[ "$workflow_dispatched" == "true" ]]; then`,
    `      printf '%s\\n' ""`,
    `      printf '%s\\n' "To let this command script wait and advance next time, rerun with TAURI_NATIVE_CI_WAIT=1."`,
    "    fi",
    "  fi",
    "fi",
    "",
  ].join("\n");
}

try {
  await main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
