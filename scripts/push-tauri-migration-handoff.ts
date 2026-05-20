import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { promisify } from "node:util";

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
    const prBodyPath = resolve(args.prBodyPath ?? join(args.cwd, ".tmp/tauri-migration-pr-body.md"));
    await mkdir(dirname(prBodyPath), { recursive: true });
    await writeFile(prBodyPath, prBody(), "utf8");

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

function parseArgs(argv: string[]): Args {
  const parsed: Args = {
    cwd: process.cwd(),
    ghBin: process.env.GH_BIN ?? "gh",
    ...(process.env.TAURI_PR_BODY_PATH == null ? {} : { prBodyPath: resolve(process.env.TAURI_PR_BODY_PATH) }),
    reportDir: resolve(process.env.TAURI_M4_REPORT_DIR ?? defaultReportDir),
    remote: defaultRemote,
    workflow: process.env.GITHUB_WORKFLOW ?? defaultWorkflow,
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
      parsed.prBodyPath = resolve(value!);
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
          "env defaults: GH_BIN, GITHUB_WORKFLOW, TAURI_M4_REPORT_DIR, TAURI_PR_BODY_PATH",
          "",
        ].join("\n"),
      );
      process.exit(0);
    }
    throw new Error(`unsupported argument: ${arg}`);
  }

  return parsed;
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
    ...(parsed.prBodyPath == null ? {} : { prBodyPath: parsed.prBodyPath }),
    remote: parsed.remote,
    reportDir: parsed.reportDir,
    workflow: parsed.workflow,
  };
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
  manifest: string;
  tempRoot: string;
}> {
  const checksumPath = `${archive}.sha256`;
  const archiveSha256 = await sha256File(archive);
  await verifyChecksumSidecar(checksumPath, archiveSha256, archive);
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
      manifest: join(tempRoot, manifestEntries[0]!),
      tempRoot,
    };
  } catch (error) {
    await rm(tempRoot, { force: true, recursive: true });
    throw error;
  }
}

async function verifyChecksumSidecar(checksumPath: string, actualSha256: string, archive: string): Promise<void> {
  const checksum = await readFile(checksumPath, "utf8");
  const match = checksum.match(/^([0-9a-f]{64})\s+(\S+)\s*$/);
  if (match?.[1] == null || match[2] == null) {
    throw new Error(`checksum sidecar has invalid format: ${checksumPath}`);
  }
  if (match[1] !== actualSha256) {
    throw new Error(`archive SHA-256 mismatch: expected ${match[1]}, got ${actualSha256}`);
  }
  if (match[2] !== basename(archive)) {
    throw new Error(`checksum sidecar filename mismatch: expected ${basename(archive)}, got ${match[2]}`);
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

function prBody(): string {
  return [
    "## Why",
    "",
    "This PR carries the Electron to Tauri migration branch so native Windows and Linux package smoke can run against the exact handoff commit.",
    "",
    "It addresses the migration blocker where local macOS parity is available but M4 cannot close until NSIS, AppImage, and Linux headless evidence is collected from native runners.",
    "",
    "## What users will see",
    "",
    "No default desktop behavior changes until M5. Electron remains the default runtime while Tauri stays behind explicit migration flags.",
    "",
    "## Surface area",
    "",
    "- [ ] **UI** — new page / dialog / panel / menu item / setting / empty state in `apps/web` or `apps/desktop` (including Electron menu bar)",
    "- [ ] **Keyboard shortcut** — new or changed",
    "- [x] **CLI / env var** — new `od` subcommand or flag, new `tools-dev` / `tools-pack` / `tools-pr` flag, or new `OD_*` env var",
    "- [ ] **API / contract** — new `/api/*` endpoint, new SSE event, or changed shape in `packages/contracts`",
    "- [ ] **Extension point** — new entry under `skills/`, `design-systems/`, `design-templates/`, or `craft/`, or change to the skills protocol",
    "- [ ] **i18n keys** — added new translation keys (see `TRANSLATIONS.md` for the locale workflow)",
    "- [ ] **New top-level dependency** — adding any new entry to the **root** `package.json` (`dependencies` or `devDependencies`); workspace-package `package.json` files are out of scope. Include a paragraph on what we get vs. what bytes we ship (see `CONTRIBUTING.md` -> Code style)",
    "- [ ] **Default behavior change** — changes what existing users experience without opting in (default model, default setting, file/SQLite schema, auto-network on startup, auto-install)",
    "- [ ] **None** — internal refactor, docs, tests, or translation update only",
    "",
    "## Screenshots",
    "",
    "Not applicable for user-facing UI. Native package smoke screenshots are collected as CI artifacts for the M4 evidence gate.",
    "",
    "## Bug fix verification",
    "",
    "Not a bug fix.",
    "",
    "## Validation",
    "",
    "- `pnpm guard`",
    "- `pnpm typecheck`",
    "- Pending native M4 evidence: Windows NSIS, Linux AppImage, and Linux headless platform smoke.",
    "",
  ].join("\n");
}

try {
  await main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
