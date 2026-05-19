import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";

import {
  m4PlatformGateLabels,
  m5ElectronFallbackLabel,
  m5PrimaryDocsLabel,
  m5ReleaseBetaDefaultLabel,
  m5ToolsDevDefaultLabel,
  m5ToolsPackDefaultLabel,
  m6ElectronDepsLabel,
  m6ElectronGuidanceLabel,
  m6ElectronResourcesLabel,
  m6ElectronRuntimeLabel,
  m6ElectronTestsLabel,
} from "./tauri-migration-policy.ts";

const execFileAsync = promisify(execFile);
const defaultRoot = resolve(import.meta.dirname, "..");
const defaultReportDir = "/tmp/open-design-tauri-m4-reports";
const handoffManifestName = "open-design-tauri-migration-handoff.json";
const linuxReportName = "open-design-ci-linux-tauri-e2e-report";
const noteName = "open-design-tauri-migration-handoff.md";
const winReportName = "open-design-ci-win-tauri-e2e-report";

type DesktopRuntime = "electron" | "tauri";

type ParsedArgs = {
  handoffArchive?: string;
  handoffDir?: string;
  json: boolean;
  linuxReport?: string;
  reportDir?: string;
  remote?: string;
  root: string;
  winReport?: string;
};

type ChecklistItemStatus = {
  checked: boolean;
  label: string;
};

type ChecklistGroupStatus = {
  checked: number;
  items: ChecklistItemStatus[];
  name: "M4" | "M5" | "M6";
  total: number;
};

type GitStatus = {
  base?: string;
  branch?: string;
  head?: string;
  trackedClean?: boolean;
  unavailable?: string;
};

type MigrationStatus = {
  defaults: {
    releaseBeta: DesktopRuntime;
    toolsDev: DesktopRuntime;
    toolsPack: DesktopRuntime;
  };
  git: GitStatus;
  groups: ChecklistGroupStatus[];
  handoffArchive?: HandoffArchiveStatus;
  handoff?: HandoffStatus;
  nextActions: string[];
  platformReports?: PlatformReportsStatus;
  phase: "M4" | "M5" | "M6" | "complete";
  remote?: RemoteStatus;
  root: string;
};

type HandoffStatus = {
  branch?: string;
  branchHead?: string;
  bundle?: string;
  bundleSha256?: string;
  bundleSha256Actual?: string;
  current?: boolean;
  dir: string;
  manifest: string;
  present: boolean;
  problems: string[];
};

type HandoffManifest = {
  branch: string;
  branchHead: string;
  bundlePath: string;
  bundleSha256: string;
  schemaVersion: 1;
};

type HandoffArchiveStatus = {
  archive: string;
  checksum: string;
  commandScript: string;
  current?: boolean;
  expectedSha256?: string;
  present: boolean;
  problems: string[];
  sha256?: string;
};

type RemoteStatus = {
  branch?: string;
  current?: boolean;
  expectedHead?: string;
  head?: string;
  present: boolean;
  problems: string[];
  remote: string;
};

type PlatformReportsStatus = {
  current: boolean;
  linuxReport?: string;
  problems: string[];
  verifierOutput?: string;
  winReport?: string;
};

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const status = await readMigrationStatus(
    args.root,
    args.handoffDir,
    args.handoffArchive,
    args.remote,
    args.winReport,
    args.linuxReport,
    args.reportDir,
  );
  if (args.json) {
    process.stdout.write(`${JSON.stringify(status, null, 2)}\n`);
    return;
  }
  process.stdout.write(formatMigrationStatus(status));
}

function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = { json: false, root: defaultRoot };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];
    if (arg === "--json") {
      parsed.json = true;
      continue;
    }
    if (arg === "--handoff-dir") {
      if (value == null) throw new Error("--handoff-dir requires a path");
      parsed.handoffDir = resolve(value);
      index += 1;
      continue;
    }
    if (arg === "--handoff-archive") {
      if (value == null) throw new Error("--handoff-archive requires a path");
      parsed.handoffArchive = resolve(value);
      index += 1;
      continue;
    }
    if (arg === "--root") {
      if (value == null) throw new Error("--root requires a path");
      parsed.root = resolve(value);
      index += 1;
      continue;
    }
    if (arg === "--remote") {
      if (value == null) throw new Error("--remote requires a value");
      parsed.remote = value;
      index += 1;
      continue;
    }
    if (arg === "--report-dir") {
      if (value == null) throw new Error("--report-dir requires a path");
      parsed.reportDir = resolve(value);
      index += 1;
      continue;
    }
    if (arg === "--linux-report") {
      if (value == null) throw new Error("--linux-report requires a path");
      parsed.linuxReport = resolve(value);
      index += 1;
      continue;
    }
    if (arg === "--win-report") {
      if (value == null) throw new Error("--win-report requires a path");
      parsed.winReport = resolve(value);
      index += 1;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      process.stdout.write(
        "usage: tsx scripts/tauri-migration-status.ts [--root <repo>] [--handoff-dir <dir>] [--handoff-archive <tar.gz>] [--remote <remote>] [--report-dir <dir>] [--win-report <dir>] [--linux-report <dir>] [--json]\n",
      );
      process.exit(0);
    }
    throw new Error(`unsupported argument: ${arg}`);
  }
  return parsed;
}

async function readMigrationStatus(
  root: string,
  handoffDir?: string,
  handoffArchiveArg?: string,
  remote?: string,
  winReport?: string,
  linuxReport?: string,
  reportDir?: string,
): Promise<MigrationStatus> {
  const [migrationDoc, toolsDevConfig, toolsPackConfig, releaseBetaWorkflow, gitStatus] = await Promise.all([
    readFile(join(root, "docs", "electron-to-tauri-migration.md"), "utf8"),
    readFile(join(root, "tools", "dev", "src", "config.ts"), "utf8"),
    readFile(join(root, "tools", "pack", "src", "config.ts"), "utf8"),
    readFile(join(root, ".github", "workflows", "release-beta.yml"), "utf8"),
    readGitStatus(root),
  ]);
  const groups: ChecklistGroupStatus[] = [
    checklistGroup("M4", migrationDoc, m4PlatformGateLabels),
    checklistGroup("M5", migrationDoc, [
      m5ToolsDevDefaultLabel,
      m5ToolsPackDefaultLabel,
      m5ReleaseBetaDefaultLabel,
      m5ElectronFallbackLabel,
      m5PrimaryDocsLabel,
    ]),
    checklistGroup("M6", migrationDoc, [
      m6ElectronDepsLabel,
      m6ElectronRuntimeLabel,
      m6ElectronResourcesLabel,
      m6ElectronTestsLabel,
      m6ElectronGuidanceLabel,
    ]),
  ];
  const phase = currentPhase(groups);
  const handoff = handoffDir == null ? undefined : await readHandoffStatus(handoffDir, gitStatus);
  const handoffArchive =
    handoffDir == null
      ? undefined
      : await readHandoffArchiveStatus(handoffArchiveArg ?? handoffArchivePath(handoffDir), handoff);
  const remoteStatus = remote == null ? undefined : await readRemoteStatus(root, remote, gitStatus, handoff);
  const platformReports = await resolvePlatformReportsStatus(winReport, linuxReport, reportDir);
  const status: MigrationStatus = {
    defaults: {
      releaseBeta: readReleaseBetaDefault(releaseBetaWorkflow),
      toolsDev: readDefaultDesktopRuntime(toolsDevConfig, "tools-dev"),
      toolsPack: readDefaultDesktopRuntime(toolsPackConfig, "tools-pack"),
    },
    git: gitStatus,
    groups,
    ...(handoff == null ? {} : { handoff }),
    ...(handoffArchive == null ? {} : { handoffArchive }),
    nextActions: nextActionsForPhase(phase, handoff, handoffArchive, remoteStatus, platformReports),
    ...(platformReports == null ? {} : { platformReports }),
    phase,
    ...(remoteStatus == null ? {} : { remote: remoteStatus }),
    root,
  };
  return status;
}

async function resolvePlatformReportsStatus(
  winReport?: string,
  linuxReport?: string,
  reportDir?: string,
): Promise<PlatformReportsStatus | undefined> {
  if (winReport != null || linuxReport != null) {
    return readPlatformReportsStatus(winReport, linuxReport);
  }
  const inferredReportDir = reportDir ?? defaultReportDir;
  const inferredWinReport = join(inferredReportDir, winReportName);
  const inferredLinuxReport = join(inferredReportDir, linuxReportName);
  if (reportDir == null) {
    const [winExists, linuxExists] = await Promise.all([pathExists(inferredWinReport), pathExists(inferredLinuxReport)]);
    if (!winExists && !linuxExists) return undefined;
  }
  return readPlatformReportsStatus(inferredWinReport, inferredLinuxReport);
}

function checklistGroup(name: ChecklistGroupStatus["name"], source: string, labels: readonly string[]): ChecklistGroupStatus {
  const items = labels.map((label) => ({ checked: isChecklistLineChecked(source, label), label }));
  return {
    checked: items.filter((item) => item.checked).length,
    items,
    name,
    total: items.length,
  };
}

function currentPhase(groups: ChecklistGroupStatus[]): MigrationStatus["phase"] {
  for (const group of groups) {
    if (group.checked < group.total) return group.name;
  }
  return "complete";
}

function nextActionsForPhase(
  phase: MigrationStatus["phase"],
  handoff?: HandoffStatus,
  handoffArchive?: HandoffArchiveStatus,
  remote?: RemoteStatus,
  platformReports?: PlatformReportsStatus,
): string[] {
  if (phase === "M4") {
    const handoffReady = handoff?.current === true;
    const archiveReady = handoffArchive?.current === true;
    return [
      archiveReady
        ? `Copy the current packaged handoff archive ${handoffArchive.archive}, checksum ${handoffArchive.checksum}, and command script ${handoffArchive.commandScript} to a write-capable machine.`
        : handoffReady
          ? `Package the current verified handoff directory with scripts/package-tauri-migration-handoff.ts --handoff-dir ${handoff.dir}.`
          : "Regenerate the verified handoff set with scripts/verify-tauri-migration-handoff.ts --output-dir /tmp/open-design-tauri-migration-handoff.",
      remote?.current === true
        ? `Remote ${remote.remote} already matches ${remote.branch ?? "the migration branch"} at ${remote.head ?? "the expected head"}.`
        : archiveReady
          ? `On the receiving machine, run ${handoffArchive.commandScript} from the repository root to verify checksum, extract, push, verify the remote branch, and attempt native CI dispatch when gh is available; or run scripts/push-tauri-migration-handoff.ts --archive ${handoffArchive.archive} --remote origin for push-only handoff.`
          : "Copy the packaged handoff archive, .sha256 sidecar, and .commands.sh sidecar to a write-capable machine, then run the command script or scripts/push-tauri-migration-handoff.ts --archive /path/to/open-design-tauri-migration-handoff.tar.gz --remote origin.",
      platformReports?.current === true
        ? "Advance M4 evidence and M5 defaults with scripts/advance-tauri-migration-m4-m5.ts using the verified report paths shown above."
        : remote?.current === true
          ? `Trigger native CI with gh workflow run ci.yml --ref ${remote.branch ?? "codex/electron-to-tauri-migration"} or open a draft PR, then download and verify artifacts with scripts/download-tauri-m4-reports.ts --run-id <github-run-id> --output-dir /tmp/open-design-tauri-m4-reports; add --advance to apply M4 evidence and M5 defaults immediately after verification.`
          : "Run the Windows and Linux Tauri package smoke jobs.",
      ...(platformReports?.current === true
        ? []
        : ["Advance M4 evidence and M5 defaults with scripts/advance-tauri-migration-m4-m5.ts --win-report <dir> --linux-report <dir>."]),
    ];
  }
  if (phase === "M5") {
    return [
      "Run scripts/apply-tauri-migration-m5.ts if M4 evidence is already recorded but M5 is still open.",
      "Keep electron in DESKTOP_RUNTIME_KINDS for the fallback window.",
      "Run pnpm guard, pnpm typecheck, and the tools-dev/tools-pack tests after the M5 applicator diff.",
    ];
  }
  if (phase === "M6") {
    return [
      "Run scripts/tauri-migration-inventory.ts --json to get the current Electron cleanup inventory.",
      "Remove Electron dependencies, runtime files, pack hooks, tests, and guidance together.",
      "Run pnpm install so pnpm-lock.yaml importer entries match the removed dependencies.",
      "Remove electron from DESKTOP_RUNTIME_KINDS only when the M6 cleanup checkboxes move together.",
    ];
  }
  return ["Run the full QA plan and archive the migration document as completed evidence."];
}

function isChecklistLineChecked(content: string, label: string): boolean {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (new RegExp(`^- \\[x\\] ${escaped}$`, "m").test(content)) return true;
  if (new RegExp(`^- \\[ \\] ${escaped}$`, "m").test(content)) return false;
  throw new Error(`missing migration checklist line: ${label}`);
}

function readDefaultDesktopRuntime(source: string, label: string): DesktopRuntime {
  const match = source.match(/export\s+const\s+DEFAULT_DESKTOP_RUNTIME\s*=\s*["']([^"']+)["']/);
  const runtime = match?.[1];
  if (runtime === "electron" || runtime === "tauri") return runtime;
  throw new Error(`${label} must export DEFAULT_DESKTOP_RUNTIME as "electron" or "tauri"`);
}

function readReleaseBetaDefault(source: string): DesktopRuntime {
  const lines = source.split(/\r?\n/);
  const inputIndex = lines.findIndex((line) => /^\s+desktop_runtime:\s*$/.test(line));
  if (inputIndex < 0) throw new Error('release-beta workflow must define a "desktop_runtime" input');
  const inputIndent = leadingWhitespaceLength(lines[inputIndex] ?? "");
  for (const line of lines.slice(inputIndex + 1)) {
    if (line.trim() === "" || line.trimStart().startsWith("#")) continue;
    const indent = leadingWhitespaceLength(line);
    if (indent <= inputIndent) break;
    const match = line.match(/^\s+default:\s*["']?(electron|tauri)["']?\s*$/);
    if (match?.[1] === "electron" || match?.[1] === "tauri") return match[1];
  }
  throw new Error('release-beta desktop_runtime input must default to "electron" or "tauri"');
}

function leadingWhitespaceLength(line: string): number {
  return line.match(/^(\s*)/)?.[1]?.length ?? 0;
}

async function readGitStatus(root: string): Promise<GitStatus> {
  try {
    const [branch, head, base, trackedStatus] = await Promise.all([
      git(root, ["rev-parse", "--abbrev-ref", "HEAD"]),
      git(root, ["rev-parse", "HEAD"]),
      git(root, ["rev-parse", "origin/main"]),
      git(root, ["status", "--porcelain", "--untracked-files=no"]),
    ]);
    return {
      base: base.stdout.trim(),
      branch: branch.stdout.trim(),
      head: head.stdout.trim(),
      trackedClean: trackedStatus.stdout.trim().length === 0,
    };
  } catch (error) {
    return { unavailable: error instanceof Error ? error.message : String(error) };
  }
}

async function git(cwd: string, args: string[]): Promise<{ stderr: string; stdout: string }> {
  return execFileAsync("git", args, { cwd, maxBuffer: 1024 * 1024 });
}

async function readHandoffStatus(handoffDir: string, gitStatus: GitStatus): Promise<HandoffStatus> {
  const manifestPath = join(handoffDir, handoffManifestName);
  const problems: string[] = [];
  try {
    const manifest = readHandoffManifest(JSON.parse(await readFile(manifestPath, "utf8")) as Partial<HandoffManifest>);
    const bundlePath = resolve(dirname(manifestPath), manifest.bundlePath);
    let bundleSha256Actual: string | undefined;
    try {
      bundleSha256Actual = createHash("sha256").update(await readFile(bundlePath)).digest("hex");
      if (bundleSha256Actual !== manifest.bundleSha256) {
        problems.push(`bundle SHA-256 mismatch: expected ${manifest.bundleSha256}, got ${bundleSha256Actual}`);
      }
    } catch (error) {
      problems.push(`bundle unavailable: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (gitStatus.head != null && manifest.branchHead !== gitStatus.head) {
      problems.push(`manifest branchHead is stale: expected ${gitStatus.head}, got ${manifest.branchHead}`);
    }
    return {
      branch: manifest.branch,
      branchHead: manifest.branchHead,
      bundle: bundlePath,
      bundleSha256: manifest.bundleSha256,
      ...(bundleSha256Actual == null ? {} : { bundleSha256Actual }),
      current: problems.length === 0 && gitStatus.head != null,
      dir: handoffDir,
      manifest: manifestPath,
      present: true,
      problems,
    };
  } catch (error) {
    return {
      dir: handoffDir,
      manifest: manifestPath,
      present: false,
      problems: [error instanceof Error ? error.message : String(error)],
    };
  }
}

async function readHandoffArchiveStatus(archivePath: string, handoff?: HandoffStatus): Promise<HandoffArchiveStatus> {
  const checksumPath = `${archivePath}.sha256`;
  const commandScriptPath = `${archivePath}.commands.sh`;
  const problems: string[] = [];
  let archiveSha256: string | undefined;
  let expectedSha256: string | undefined;
  try {
    archiveSha256 = createHash("sha256").update(await readFile(archivePath)).digest("hex");
  } catch (error) {
    return {
      archive: archivePath,
      checksum: checksumPath,
      commandScript: commandScriptPath,
      present: false,
      problems: [`archive unavailable: ${error instanceof Error ? error.message : String(error)}`],
    };
  }

  try {
    const checksum = await readFile(checksumPath, "utf8");
    const match = checksum.match(/^([0-9a-f]{64})\s+\S+\s*$/);
    if (match?.[1] == null) {
      problems.push(`checksum sidecar has invalid format: ${checksumPath}`);
    } else {
      expectedSha256 = match[1];
      if (expectedSha256 !== archiveSha256) {
        problems.push(`archive SHA-256 mismatch: expected ${expectedSha256}, got ${archiveSha256}`);
      }
    }
  } catch (error) {
    problems.push(`checksum sidecar unavailable: ${error instanceof Error ? error.message : String(error)}`);
  }

  try {
    const [commandScriptSource, commandScriptStat] = await Promise.all([readFile(commandScriptPath, "utf8"), stat(commandScriptPath)]);
    if ((commandScriptStat.mode & 0o111) === 0) {
      problems.push(`command script is not executable: ${commandScriptPath}`);
    }
    if (!commandScriptSource.includes('git fetch "$bundle" "$branch:$temp_ref"')) {
      problems.push(`command script is missing self-contained bundle import: ${commandScriptPath}`);
    }
    if (!commandScriptSource.includes("download-tauri-m4-reports.ts") || !commandScriptSource.includes("GITHUB_RUN_ID")) {
      problems.push(`command script is missing post-CI report advance guidance: ${commandScriptPath}`);
    }
    if (!commandScriptSource.includes("gh workflow run") && !commandScriptSource.includes("gh pr create")) {
      problems.push(`command script is missing native CI trigger guidance: ${commandScriptPath}`);
    }
  } catch (error) {
    problems.push(`command script unavailable: ${error instanceof Error ? error.message : String(error)}`);
  }

  const extractRoot = await mkdtemp(join(tmpdir(), "open-design-tauri-status-archive-"));
  try {
    await execFileAsync("tar", ["-xzf", archivePath, "-C", extractRoot], { maxBuffer: 1024 * 1024 });
    const extractedHandoffDir = join(extractRoot, handoff == null ? basenameWithoutTarGz(archivePath) : basenameFromDir(handoff.dir));
    const manifestPath = join(extractedHandoffDir, handoffManifestName);
    const notePath = join(extractedHandoffDir, noteName);
    const manifest = readHandoffManifest(JSON.parse(await readFile(manifestPath, "utf8")) as Partial<HandoffManifest>);
    await readFile(notePath);
    const bundlePath = resolve(dirname(manifestPath), manifest.bundlePath);
    const bundleSha256 = createHash("sha256").update(await readFile(bundlePath)).digest("hex");
    if (bundleSha256 !== manifest.bundleSha256) {
      problems.push(`archived bundle SHA-256 mismatch: expected ${manifest.bundleSha256}, got ${bundleSha256}`);
    }
    if (handoff?.branchHead != null && manifest.branchHead !== handoff.branchHead) {
      problems.push(`archived manifest branchHead is stale: expected ${handoff.branchHead}, got ${manifest.branchHead}`);
    }
    if (handoff?.bundleSha256 != null && manifest.bundleSha256 !== handoff.bundleSha256) {
      problems.push(`archived manifest bundleSha256 is stale: expected ${handoff.bundleSha256}, got ${manifest.bundleSha256}`);
    }
  } catch (error) {
    problems.push(`archive contents invalid: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    await rm(extractRoot, { force: true, recursive: true });
  }

  return {
    archive: archivePath,
    checksum: checksumPath,
    commandScript: commandScriptPath,
    current: problems.length === 0 && handoff?.current === true,
    ...(expectedSha256 == null ? {} : { expectedSha256 }),
    present: true,
    problems,
    sha256: archiveSha256,
  };
}

async function readRemoteStatus(
  root: string,
  remote: string,
  gitStatus: GitStatus,
  handoff?: HandoffStatus,
): Promise<RemoteStatus> {
  const branch = handoff?.branch ?? gitStatus.branch;
  const expectedHead = handoff?.branchHead ?? gitStatus.head;
  const problems: string[] = [];
  if (branch == null || branch.length === 0 || branch === "HEAD") {
    problems.push("remote check requires a named branch");
  }
  if (expectedHead == null) {
    problems.push("remote check requires an expected branch head");
  }
  if (problems.length > 0) {
    return {
      ...(branch == null ? {} : { branch }),
      ...(expectedHead == null ? {} : { expectedHead }),
      current: false,
      present: false,
      problems,
      remote,
    };
  }
  const checkedBranch = branch!;
  const checkedExpectedHead = expectedHead!;
  try {
    const head = await readRemoteBranchHead(root, remote, checkedBranch);
    if (head !== checkedExpectedHead) {
      problems.push(`remote branch head mismatch: expected ${checkedExpectedHead}, got ${head}`);
    }
    return {
      branch: checkedBranch,
      current: problems.length === 0,
      expectedHead: checkedExpectedHead,
      head,
      present: true,
      problems,
      remote,
    };
  } catch (error) {
    return {
      branch: checkedBranch,
      current: false,
      expectedHead: checkedExpectedHead,
      present: false,
      problems: [error instanceof Error ? error.message : String(error)],
      remote,
    };
  }
}

async function readRemoteBranchHead(cwd: string, remote: string, branch: string): Promise<string> {
  const result = await execFileAsync("git", ["ls-remote", "--heads", remote, `refs/heads/${branch}`], {
    cwd,
    maxBuffer: 1024 * 1024,
  });
  const lines = result.stdout.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) {
    throw new Error(`remote branch not found: ${remote} ${branch}`);
  }
  if (lines.length !== 1) {
    throw new Error(`remote branch resolved ambiguously: ${remote} ${branch}`);
  }
  const [head, ref] = lines[0]!.split(/\s+/, 2);
  if (head == null || ref !== `refs/heads/${branch}`) {
    throw new Error(`unexpected ls-remote output: ${lines[0]}`);
  }
  return head;
}

async function readPlatformReportsStatus(winReport?: string, linuxReport?: string): Promise<PlatformReportsStatus> {
  const problems: string[] = [];
  if (winReport == null) problems.push("Windows report not provided");
  if (linuxReport == null) problems.push("Linux report not provided");
  if (problems.length > 0) {
    return {
      current: false,
      ...(linuxReport == null ? {} : { linuxReport }),
      problems,
      ...(winReport == null ? {} : { winReport }),
    };
  }
  const checkedWinReport = winReport!;
  const checkedLinuxReport = linuxReport!;
  try {
    const result = await execFileAsync(
      process.execPath,
      [
        "--import",
        "tsx",
        join(import.meta.dirname, "verify-tauri-platform-gates.ts"),
        "--win-report",
        checkedWinReport,
        "--linux-report",
        checkedLinuxReport,
      ],
      {
        cwd: defaultRoot,
        maxBuffer: 1024 * 1024 * 4,
      },
    );
    return {
      current: true,
      linuxReport: checkedLinuxReport,
      problems: [],
      verifierOutput: result.stdout.trim(),
      winReport: checkedWinReport,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      current: false,
      linuxReport: checkedLinuxReport,
      problems: [message],
      winReport: checkedWinReport,
    };
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

function readHandoffManifest(value: Partial<HandoffManifest>): HandoffManifest {
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

function handoffArchivePath(handoffDir: string): string {
  return `${handoffDir}.tar.gz`;
}

function basenameFromDir(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).at(-1) ?? path;
}

function basenameWithoutTarGz(path: string): string {
  const fileName = basenameFromDir(path);
  return fileName.endsWith(".tar.gz") ? fileName.slice(0, -".tar.gz".length) : fileName;
}

function formatMigrationStatus(status: MigrationStatus): string {
  const lines = [
    "Tauri migration status",
    `Root: ${status.root}`,
    `Phase: ${status.phase}`,
    `Defaults: tools-dev=${status.defaults.toolsDev}, tools-pack=${status.defaults.toolsPack}, release-beta=${status.defaults.releaseBeta}`,
  ];
  if (status.git.unavailable != null) {
    lines.push(`Git: unavailable (${status.git.unavailable})`);
  } else {
    lines.push(
      `Git: ${status.git.branch ?? "unknown"} @ ${status.git.head ?? "unknown"} (base ${status.git.base ?? "unknown"}, trackedClean=${String(status.git.trackedClean)})`,
    );
  }
  for (const group of status.groups) {
    lines.push(`${group.name}: ${group.checked}/${group.total}`);
    for (const item of group.items.filter((candidate) => !candidate.checked)) {
      lines.push(`  - [ ] ${item.label}`);
    }
  }
  if (status.handoff != null) {
    lines.push(
      `Handoff: ${status.handoff.present ? (status.handoff.current ? "current" : "needs attention") : "missing"} (${status.handoff.dir})`,
    );
    if (status.handoff.branch != null && status.handoff.branchHead != null) {
      lines.push(`  Branch: ${status.handoff.branch} @ ${status.handoff.branchHead}`);
    }
    if (status.handoff.bundle != null) {
      lines.push(`  Bundle: ${status.handoff.bundle}`);
    }
    for (const problem of status.handoff.problems) {
      lines.push(`  - ${problem}`);
    }
  }
  if (status.handoffArchive != null) {
    lines.push(
      `Handoff archive: ${status.handoffArchive.present ? (status.handoffArchive.current ? "current" : "needs attention") : "missing"} (${status.handoffArchive.archive})`,
    );
    if (status.handoffArchive.sha256 != null) {
      lines.push(`  SHA-256: ${status.handoffArchive.sha256}`);
    }
    lines.push(`  Checksum: ${status.handoffArchive.checksum}`);
    lines.push(`  Command script: ${status.handoffArchive.commandScript}`);
    for (const problem of status.handoffArchive.problems) {
      lines.push(`  - ${problem}`);
    }
  }
  if (status.remote != null) {
    lines.push(
      `Remote: ${status.remote.present ? (status.remote.current ? "current" : "needs attention") : "missing"} (${status.remote.remote})`,
    );
    if (status.remote.branch != null) {
      lines.push(`  Branch: ${status.remote.branch}`);
    }
    if (status.remote.head != null) {
      lines.push(`  Head: ${status.remote.head}`);
    }
    if (status.remote.expectedHead != null) {
      lines.push(`  Expected: ${status.remote.expectedHead}`);
    }
    for (const problem of status.remote.problems) {
      lines.push(`  - ${problem}`);
    }
  }
  if (status.platformReports != null) {
    lines.push(`Platform reports: ${status.platformReports.current ? "verified" : "needs attention"}`);
    if (status.platformReports.winReport != null) {
      lines.push(`  Windows: ${status.platformReports.winReport}`);
    }
    if (status.platformReports.linuxReport != null) {
      lines.push(`  Linux: ${status.platformReports.linuxReport}`);
    }
    for (const problem of status.platformReports.problems) {
      lines.push(`  - ${problem}`);
    }
  }
  lines.push("Next actions:");
  for (const action of status.nextActions) {
    lines.push(`  - ${action}`);
  }
  return `${lines.join("\n")}\n`;
}

try {
  await main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
