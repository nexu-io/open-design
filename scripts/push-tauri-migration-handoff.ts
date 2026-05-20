import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { promisify } from "node:util";

import { commandSidecarProblems, commandSidecarSyntaxProblem } from "./tauri-migration-command-sidecar.ts";
import { tauriMigrationPrBody } from "./tauri-migration-pr-body.ts";

const execFileAsync = promisify(execFile);
const scriptsRoot = import.meta.dirname;
const defaultRemote = "origin";
const defaultReportDir = "/tmp/open-design-tauri-m4-reports";
const defaultWorkflow = "ci.yml";
const manifestName = "open-design-tauri-migration-handoff.json";
const noteName = "open-design-tauri-migration-handoff.md";

type Args = {
  archive?: string;
  bundle?: string;
  cwd: string;
  ghBin: string;
  manifest?: string;
  prBodyPath?: string;
  remote: string;
  reportDir: string;
  workflow: string;
};

type ResolvedArgs = {
  archive?: string;
  branch: string;
  branchHead: string;
  bundle?: string;
  cwd: string;
  ghBin: string;
  manifest: string;
  prBodyPath?: string;
  remote: string;
  reportDir: string;
  workflow: string;
};

type HandoffManifest = {
  branch: string;
  branchHead: string;
  schemaVersion: 1;
};

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv.slice(2));
  const extracted = parsed.archive == null ? undefined : await extractArchive(parsed.archive);
  try {
    const args = await resolveArgs(parsed, extracted?.manifest);
    process.stdout.write(`${handoffPushIdentity(args, extracted)}\n`);
    const importArgs = [
      "--cwd",
      args.cwd,
      "--manifest",
      args.manifest,
      ...(args.bundle == null ? [] : ["--bundle", args.bundle]),
    ];
    const importOutput = await runScript("import-tauri-migration-bundle.ts", importArgs);
    const pushOutput = await git(args.cwd, ["push", args.remote, `refs/heads/${args.branch}:refs/heads/${args.branch}`]);
    const verifyOutput = await runScript("verify-tauri-migration-remote.ts", [
      "--cwd",
      args.cwd,
      "--manifest",
      args.manifest,
      "--remote",
      args.remote,
    ]);
    const prBodyPath = args.prBodyPath ?? join(args.cwd, ".tmp/tauri-migration-pr-body.md");
    await mkdir(dirname(prBodyPath), { recursive: true });
    await writeFile(prBodyPath, tauriMigrationPrBody(), "utf8");

    process.stdout.write(
      [
        "Pushed Tauri migration handoff.",
        `Git cwd: ${args.cwd}`,
        ...(args.archive == null ? [] : [`Archive: ${args.archive}`]),
        `Manifest: ${args.manifest}`,
        ...(args.bundle == null ? [] : [`Bundle override: ${args.bundle}`]),
        `Remote: ${args.remote}`,
        `Branch: ${args.branch} @ ${args.branchHead}`,
        ...(extracted == null
          ? []
          : [
              "Archive verify:",
              indent(
                [
                  `SHA-256: ${extracted.archiveSha256}`,
                  `Checksum: ${extracted.checksum}`,
                  `Command script: ${extracted.commandScript}`,
                  `Command script SHA-256: ${extracted.commandScriptSha256}`,
                  `Command script checksum: ${extracted.commandScriptChecksum}`,
                  `Extracted manifest: ${extracted.manifest}`,
                ].join("\n"),
              ),
            ]),
        "Import:",
        indent(importOutput.stdout.trim()),
        "Push:",
        indent((pushOutput.stdout + pushOutput.stderr).trim()),
        "Verify:",
        indent(verifyOutput.stdout.trim()),
        `PR body: ${prBodyPath}`,
        "Next:",
        indent(
          [
            `Trigger native CI with: ${shellQuote(args.ghBin)} workflow run ${shellQuote(args.workflow)} --ref ${shellQuote(args.branch)}`,
            "If workflow dispatch is unavailable, open a draft PR with:",
            [
              `${shellQuote(args.ghBin)} pr create --draft \\`,
              "  --base main \\",
              `  --head ${shellQuote(args.branch)} \\`,
              "  --title 'Migrate desktop runtime to Tauri' \\",
              `  --body-file ${shellQuote(prBodyPath)}`,
            ].join("\n"),
            "Then download, verify, record M4 evidence, and apply the guarded M5 default flip with:",
            [
              "pnpm exec tsx scripts/download-tauri-m4-reports.ts \\",
              `  --branch ${shellQuote(args.branch)} \\`,
              `  --expected-head ${args.branchHead} \\`,
              `  --remote ${shellQuote(args.remote)} \\`,
              "  --wait \\",
              `  --output-dir ${shellQuote(args.reportDir)} \\`,
              "  --advance",
            ].join("\n"),
          ].join("\n"),
        ),
        "",
      ].join("\n"),
    );
  } finally {
    if (extracted != null) {
      await rm(extracted.tempRoot, { force: true, recursive: true });
    }
  }
}

function handoffPushIdentity(
  args: ResolvedArgs,
  extracted?: {
    archiveSha256: string;
    commandScriptSha256: string;
  },
): string {
  return [
    "Prepared Tauri migration handoff push.",
    `Remote: ${args.remote}`,
    `Branch: ${args.branch} @ ${args.branchHead}`,
    ...(extracted == null
      ? []
      : [`Archive SHA-256: ${extracted.archiveSha256}`, `Command script SHA-256: ${extracted.commandScriptSha256}`]),
  ].join("\n");
}

function parseArgs(argv: string[]): Args {
  const parsed: Args = {
    cwd: process.cwd(),
    ghBin: process.env.GH_BIN ?? "gh",
    ...(process.env.TAURI_PR_BODY_PATH == null ? {} : { prBodyPath: process.env.TAURI_PR_BODY_PATH }),
    reportDir: resolve(process.env.TAURI_M4_REPORT_DIR ?? defaultReportDir),
    remote: process.env.REMOTE ?? defaultRemote,
    workflow: defaultWorkflowFromEnv(process.env.GITHUB_WORKFLOW),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];
    if (
      (arg === "--archive" ||
        arg === "--bundle" ||
        arg === "--cwd" ||
        arg === "--gh" ||
        arg === "--manifest" ||
        arg === "--pr-body-path" ||
        arg === "--remote" ||
        arg === "--report-dir" ||
        arg === "--workflow") &&
      value == null
    ) {
      throw new Error(`${arg} requires a value`);
    }
    if (arg === "--archive") {
      parsed.archive = resolve(value!);
      index += 1;
      continue;
    }
    if (arg === "--bundle") {
      parsed.bundle = resolve(value!);
      index += 1;
      continue;
    }
    if (arg === "--cwd") {
      parsed.cwd = resolve(value!);
      index += 1;
      continue;
    }
    if (arg === "--gh") {
      parsed.ghBin = value!;
      index += 1;
      continue;
    }
    if (arg === "--manifest") {
      parsed.manifest = resolve(value!);
      index += 1;
      continue;
    }
    if (arg === "--pr-body-path") {
      parsed.prBodyPath = value!;
      index += 1;
      continue;
    }
    if (arg === "--remote") {
      parsed.remote = value!;
      index += 1;
      continue;
    }
    if (arg === "--report-dir") {
      parsed.reportDir = resolve(value!);
      index += 1;
      continue;
    }
    if (arg === "--workflow") {
      parsed.workflow = value!;
      index += 1;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      process.stdout.write(
        [
          "usage: tsx scripts/push-tauri-migration-handoff.ts --archive <handoff.tar.gz> [--remote <remote>] [--cwd <repo>] [--gh <path-to-gh>] [--workflow <file>] [--report-dir <dir>] [--pr-body-path <path>]",
          "       tsx scripts/push-tauri-migration-handoff.ts --manifest <path> [--remote <remote>] [--cwd <repo>] [--gh <path-to-gh>] [--workflow <file>] [--report-dir <dir>] [--pr-body-path <path>]",
          "       tsx scripts/push-tauri-migration-handoff.ts --manifest <path> --bundle <path> [--remote <remote>] [--cwd <repo>] [--gh <path-to-gh>] [--workflow <file>] [--report-dir <dir>] [--pr-body-path <path>]",
          "",
          `defaults: --cwd ${process.cwd()} --remote ${defaultRemote} --workflow ${defaultWorkflow} --report-dir ${defaultReportDir}`,
          "env defaults: REMOTE, GH_BIN, GITHUB_WORKFLOW, TAURI_M4_REPORT_DIR, TAURI_PR_BODY_PATH",
          "",
        ].join("\n"),
      );
      process.exit(0);
    }
    throw new Error(`unsupported argument: ${arg}`);
  }

  return parsed;
}

function defaultWorkflowFromEnv(value: string | undefined): string {
  if (value == null || value.length === 0) return defaultWorkflow;
  return /\.ya?ml$/i.test(value) ? value : defaultWorkflow;
}

async function resolveArgs(parsed: Args, extractedManifest?: string): Promise<ResolvedArgs> {
  if (parsed.archive != null && parsed.manifest != null) {
    throw new Error("--archive and --manifest are mutually exclusive");
  }
  if (parsed.archive != null && parsed.bundle != null) {
    throw new Error("--bundle can only be used with --manifest");
  }
  const manifestPath = extractedManifest ?? parsed.manifest;
  if (manifestPath == null) {
    throw new Error("--manifest or --archive is required");
  }
  const manifest = await readManifest(manifestPath);
  return {
    ...(parsed.archive == null ? {} : { archive: parsed.archive }),
    branch: manifest.branch,
    branchHead: manifest.branchHead,
    ...(parsed.bundle == null ? {} : { bundle: parsed.bundle }),
    cwd: parsed.cwd,
    ghBin: parsed.ghBin,
    manifest: manifestPath,
    ...(parsed.prBodyPath == null ? {} : { prBodyPath: resolvePathFromCwd(parsed.cwd, parsed.prBodyPath) }),
    remote: parsed.remote,
    reportDir: parsed.reportDir,
    workflow: parsed.workflow,
  };
}

function resolvePathFromCwd(cwd: string, value: string): string {
  return isAbsolute(value) ? value : resolve(cwd, value);
}

async function readManifest(path: string): Promise<HandoffManifest> {
  const value = JSON.parse(await readFile(path, "utf8")) as Partial<HandoffManifest>;
  if (value.schemaVersion !== 1) {
    throw new Error(`unsupported handoff manifest schemaVersion: ${String(value.schemaVersion)}`);
  }
  if (typeof value.branch !== "string" || value.branch.length === 0) {
    throw new Error("handoff manifest missing branch");
  }
  if (typeof value.branchHead !== "string" || !/^[0-9a-f]{40}$/.test(value.branchHead)) {
    throw new Error("handoff manifest missing branchHead");
  }
  return {
    branch: value.branch,
    branchHead: value.branchHead,
    schemaVersion: value.schemaVersion,
  };
}

async function extractArchive(archive: string): Promise<{
  archiveSha256: string;
  checksum: string;
  commandScript: string;
  commandScriptChecksum: string;
  commandScriptSha256: string;
  manifest: string;
  tempRoot: string;
}> {
  const checksumPath = `${archive}.sha256`;
  const commandScriptPath = `${archive}.commands.sh`;
  const commandScriptChecksumPath = `${commandScriptPath}.sha256`;
  const archiveSha256 = await verifyChecksumSidecar(checksumPath, archive, "archive");
  const commandScriptSha256 = await verifyChecksumSidecar(commandScriptChecksumPath, commandScriptPath, "command script");
  await verifyCommandScriptCurrent(commandScriptPath);
  const entries = await listTarEntries(archive);
  validateArchiveEntries(entries);
  const manifestEntries = entries.filter((entry) => entry.endsWith(`/${manifestName}`) || entry === manifestName);
  if (manifestEntries.length !== 1) {
    throw new Error(`handoff archive must contain exactly one ${manifestName}; found ${manifestEntries.length}`);
  }
  const noteEntries = entries.filter((entry) => entry.endsWith(`/${noteName}`) || entry === noteName);
  if (noteEntries.length !== 1) {
    throw new Error(`handoff archive must contain exactly one ${noteName}; found ${noteEntries.length}`);
  }
  const tempRoot = await mkdtemp(join(tmpdir(), "open-design-tauri-push-handoff-"));
  try {
    await execFileAsync("tar", ["-xzf", archive, "-C", tempRoot], { maxBuffer: 1024 * 1024 });
    return {
      archiveSha256,
      checksum: checksumPath,
      commandScript: commandScriptPath,
      commandScriptChecksum: commandScriptChecksumPath,
      commandScriptSha256,
      manifest: join(tempRoot, manifestEntries[0]!),
      tempRoot,
    };
  } catch (error) {
    await rm(tempRoot, { force: true, recursive: true });
    throw error;
  }
}

async function verifyChecksumSidecar(checksumPath: string, targetPath: string, label: string): Promise<string> {
  let actualSha256: string;
  try {
    actualSha256 = await sha256File(targetPath);
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`${label} not found: ${targetPath}`);
    }
    throw error;
  }
  const checksum = await readFile(checksumPath, "utf8");
  const match = checksum.match(/^([0-9a-f]{64})\s+(\S+)\s*$/);
  if (match?.[1] == null || match[2] == null) {
    throw new Error(`${label} checksum sidecar has invalid format: ${checksumPath}`);
  }
  if (match[1] !== actualSha256) {
    throw new Error(`${label} SHA-256 mismatch: expected ${match[1]}, got ${actualSha256}`);
  }
  if (match[2] !== basename(targetPath)) {
    throw new Error(`${label} checksum sidecar filename mismatch: expected ${basename(targetPath)}, got ${match[2]}`);
  }
  return actualSha256;
}

async function verifyCommandScriptCurrent(commandScriptPath: string): Promise<void> {
  const [source, value] = await Promise.all([readFile(commandScriptPath, "utf8"), stat(commandScriptPath)]);
  if ((value.mode & 0o111) === 0) {
    throw new Error(`command script is not executable: ${commandScriptPath}`);
  }
  const problems = commandSidecarProblems(source);
  if (problems.length > 0) {
    throw new Error(`${problems[0]}: ${commandScriptPath}`);
  }
  const syntaxProblem = await commandSidecarSyntaxProblem(commandScriptPath, source);
  if (syntaxProblem != null) {
    throw new Error(syntaxProblem);
  }
}

async function listTarEntries(archive: string): Promise<string[]> {
  const result = await execFileAsync("tar", ["-tzf", archive], { maxBuffer: 1024 * 1024 });
  return result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function validateArchiveEntries(entries: string[]): void {
  if (entries.length === 0) {
    throw new Error("handoff archive is empty");
  }
  for (const entry of entries) {
    if (entry.startsWith("/") || entry.split("/").some((part) => part === "..")) {
      throw new Error(`handoff archive contains unsafe path: ${entry}`);
    }
  }
}

async function runScript(scriptName: string, args: string[]): Promise<{ stderr: string; stdout: string }> {
  return execFileAsync(process.execPath, ["--import", "tsx", resolve(scriptsRoot, scriptName), ...args], {
    cwd: scriptsRoot,
    maxBuffer: 1024 * 1024 * 4,
  });
}

async function git(cwd: string, args: string[]): Promise<{ stderr: string; stdout: string }> {
  return execFileAsync("git", args, {
    cwd,
    maxBuffer: 1024 * 1024,
  });
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
    .filter((line, index, lines) => line.length > 0 || index < lines.length - 1)
    .map((line) => `  ${line}`)
    .join("\n");
}

function shellQuote(value: string): string {
  return /^[A-Za-z0-9_./:=@-]+$/.test(value) ? value : `'${value.replaceAll("'", "'\\''")}'`;
}

try {
  await main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
