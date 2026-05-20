import { execFile } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const scriptsRoot = import.meta.dirname;
const workspaceRoot = resolve(scriptsRoot, "..");
const defaultBranch = "codex/electron-to-tauri-migration";
const defaultOutputDir = "/tmp/open-design-tauri-m4-reports";
const defaultRepo = "nexu-io/open-design";
const defaultRemote = "origin";
const defaultWorkflow = "ci.yml";
const linuxArtifactName = "open-design-ci-linux-tauri-e2e-report";
const requiredTauriJobNames = ["Packaged windows Tauri smoke", "Packaged linux Tauri smoke"] as const;
const winArtifactName = "open-design-ci-win-tauri-e2e-report";

type Args = {
  advance: boolean;
  branch: string;
  expectedHead?: string;
  ghBin: string;
  gitRemote: string;
  outputDir: string;
  pollMs: number;
  repo: string;
  root: string;
  runId?: string;
  timeoutMs: number;
  wait: boolean;
  workflow: string;
};

type GithubRun = {
  conclusion?: string;
  createdAt?: string;
  databaseId?: number;
  headBranch?: string;
  headSha?: string;
  jobs?: GithubJob[];
  status?: string;
};

type GithubJob = {
  conclusion?: string;
  name?: string;
  status?: string;
};

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.advance) {
    await assertTrackedWorktreeClean(args.root, "downloading M4 reports with --advance");
    await runScript("verify-tauri-migration-remote.ts", [
      "--cwd",
      args.root,
      "--remote",
      args.gitRemote,
      "--branch",
      args.branch,
      "--expected-head",
      args.expectedHead!,
    ]);
  }
  const runId = args.runId ?? (args.wait ? await waitForCompletedRun(args) : await findLatestCompletedRun(args));
  const viewedRun = args.expectedHead == null ? undefined : await assertRunMatchesExpectedHead(args, runId);
  await assertRunHasSuccessfulTauriJobs(args, runId, viewedRun);
  const winReport = join(args.outputDir, winArtifactName);
  const linuxReport = join(args.outputDir, linuxArtifactName);

  await mkdir(args.outputDir, { recursive: true });
  await Promise.all([
    downloadArtifact(args, runId, winArtifactName, winReport),
    downloadArtifact(args, runId, linuxArtifactName, linuxReport),
  ]);
  const verifyOutput = await runScript("verify-tauri-platform-gates.ts", [
    "--win-report",
    winReport,
    "--linux-report",
    linuxReport,
  ]);
  const advanceOutput = args.advance
    ? await runScript("advance-tauri-migration-m4-m5.ts", [
        "--root",
        args.root,
        "--remote",
        args.gitRemote,
        "--branch",
        args.branch,
        "--expected-head",
        args.expectedHead!,
        "--win-report",
        winReport,
        "--linux-report",
        linuxReport,
      ])
    : undefined;

  process.stdout.write(
    [
      "Downloaded and verified Tauri M4 platform reports.",
      `Repository: ${args.repo}`,
      `Workflow: ${args.workflow}`,
      `Branch: ${args.branch}`,
      ...(args.expectedHead == null ? [] : [`Expected head: ${args.expectedHead}`]),
      `Run: ${runId}`,
      `Output: ${args.outputDir}`,
      `Windows report: ${winReport}`,
      `Linux report: ${linuxReport}`,
      "Verification:",
      indent(verifyOutput.stdout.trim()),
      ...(advanceOutput == null
        ? [
            "Next:",
            indent(
              [
                "pnpm exec tsx scripts/advance-tauri-migration-m4-m5.ts \\",
                ...(args.root === workspaceRoot ? [] : [`  --root ${shellQuote(args.root)} \\`]),
                `  --remote ${shellQuote(args.gitRemote)} \\`,
                `  --branch ${shellQuote(args.branch)} \\`,
                `  --expected-head ${args.expectedHead!} \\`,
                `  --win-report ${shellQuote(winReport)} \\`,
                `  --linux-report ${shellQuote(linuxReport)}`,
              ].join("\n"),
            ),
          ]
        : ["M4/M5 advancement:", indent(advanceOutput.stdout.trim())]),
      "",
    ].join("\n"),
  );
}

async function assertTrackedWorktreeClean(root: string, action: string): Promise<void> {
  if (!(await isGitWorktree(root))) return;
  const status = await execFileAsync("git", ["status", "--porcelain", "--untracked-files=no"], {
    cwd: root,
    maxBuffer: 1024 * 1024,
  });
  if (status.stdout.trim().length > 0) {
    throw new Error(`tracked worktree changes are present; commit or stash them before ${action}`);
  }
}

async function isGitWorktree(root: string): Promise<boolean> {
  try {
    const result = await execFileAsync("git", ["rev-parse", "--is-inside-work-tree"], {
      cwd: root,
      maxBuffer: 1024 * 1024,
    });
    return result.stdout.trim() === "true";
  } catch {
    return false;
  }
}

function parseArgs(argv: string[]): Args {
  const parsed: Args = {
    advance: false,
    branch: defaultBranch,
    ghBin: process.env.GH_BIN ?? "gh",
    gitRemote: process.env.REMOTE ?? defaultRemote,
    outputDir: resolve(process.env.TAURI_M4_REPORT_DIR ?? defaultOutputDir),
    pollMs: 30_000,
    repo: defaultRepo,
    root: workspaceRoot,
    timeoutMs: 30 * 60_000,
    wait: false,
    workflow: defaultWorkflow,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];
    if (arg === "--advance") {
      parsed.advance = true;
      continue;
    }
    if (arg === "--wait") {
      parsed.wait = true;
      continue;
    }
    if (
      (arg === "--branch" ||
        arg === "--expected-head" ||
        arg === "--gh" ||
        arg === "--remote" ||
        arg === "--output-dir" ||
        arg === "--poll-ms" ||
        arg === "--repo" ||
        arg === "--root" ||
        arg === "--run-id" ||
        arg === "--timeout-ms" ||
        arg === "--workflow") &&
      value == null
    ) {
      throw new Error(`${arg} requires a value`);
    }
    if (arg === "--branch") {
      parsed.branch = value!;
      index += 1;
      continue;
    }
    if (arg === "--expected-head") {
      if (!/^[0-9a-f]{40}$/.test(value!)) throw new Error(`invalid --expected-head: ${value}`);
      parsed.expectedHead = value!;
      index += 1;
      continue;
    }
    if (arg === "--gh") {
      parsed.ghBin = value!;
      index += 1;
      continue;
    }
    if (arg === "--remote") {
      parsed.gitRemote = value!;
      index += 1;
      continue;
    }
    if (arg === "--output-dir") {
      parsed.outputDir = resolve(value!);
      index += 1;
      continue;
    }
    if (arg === "--poll-ms") {
      parsed.pollMs = parsePositiveInt(arg, value!);
      index += 1;
      continue;
    }
    if (arg === "--repo") {
      parsed.repo = value!;
      index += 1;
      continue;
    }
    if (arg === "--root") {
      parsed.root = resolve(value!);
      index += 1;
      continue;
    }
    if (arg === "--run-id") {
      parsed.runId = value!;
      index += 1;
      continue;
    }
    if (arg === "--timeout-ms") {
      parsed.timeoutMs = parsePositiveInt(arg, value!);
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
          "usage: tsx scripts/download-tauri-m4-reports.ts --expected-head <sha> [--run-id <id>] [--repo <owner/repo>] [--branch <ref>] [--remote <git-remote>] [--output-dir <dir>] [--advance] [--root <repo>]",
          "",
          "Downloads the Windows/Linux Tauri CI report artifacts with gh, verifies them with scripts/verify-tauri-platform-gates.ts, and optionally applies the guarded M4→M5 advance.",
          "Requires --expected-head <sha> to avoid stale branch runs; --wait polls until a matching completed run exists.",
          "",
          `defaults: --repo ${defaultRepo} --branch ${defaultBranch} --workflow ${defaultWorkflow} --output-dir ${defaultOutputDir}`,
          "env defaults: REMOTE, GH_BIN, TAURI_M4_REPORT_DIR",
          "",
        ].join("\n"),
      );
      process.exit(0);
    }
    throw new Error(`unsupported argument: ${arg}`);
  }

  if (parsed.expectedHead == null) {
    throw new Error("--expected-head is required so M4 report downloads are tied to the migration branch head");
  }

  return parsed;
}

async function findLatestCompletedRun(args: Args): Promise<string> {
  const runs = await listRuns(args);
  const run = selectCompletedRun(args, runs);
  if (run?.databaseId == null) {
    const headLabel = args.expectedHead == null ? "" : ` at ${args.expectedHead}`;
    throw new Error(`no completed GitHub Actions run found for ${args.repo} ${args.branch}${headLabel} ${args.workflow}`);
  }
  return String(run.databaseId);
}

async function waitForCompletedRun(args: Args): Promise<string> {
  const startedAt = Date.now();
  let lastRunSummary = "no runs returned";
  for (;;) {
    const runs = await listRuns(args);
    const run = selectCompletedRun(args, runs);
    if (run?.databaseId != null) return String(run.databaseId);
    lastRunSummary = summarizeRuns(runs);
    if (Date.now() - startedAt >= args.timeoutMs) {
      const headLabel = args.expectedHead == null ? "" : ` at ${args.expectedHead}`;
      throw new Error(
        `timed out waiting for completed GitHub Actions run for ${args.repo} ${args.branch}${headLabel} ${args.workflow}; latest runs: ${lastRunSummary}`,
      );
    }
    await sleep(args.pollMs);
  }
}

async function listRuns(args: Args): Promise<GithubRun[]> {
  const result = await gh(args, [
    "run",
    "list",
    "--repo",
    args.repo,
    "--branch",
    args.branch,
    "--workflow",
    args.workflow,
    "--json",
    "databaseId,status,conclusion,headBranch,headSha,createdAt",
    "--limit",
    "20",
  ]);
  return JSON.parse(result.stdout) as GithubRun[];
}

async function viewRun(args: Args, runId: string): Promise<GithubRun> {
  const result = await gh(args, [
    "run",
    "view",
    runId,
    "--repo",
    args.repo,
    "--json",
    "databaseId,status,conclusion,headBranch,headSha,createdAt,jobs",
  ]);
  return JSON.parse(result.stdout) as GithubRun;
}

async function assertRunMatchesExpectedHead(args: Args, runId: string): Promise<GithubRun> {
  const run = await viewRun(args, runId);
  if (run.headSha !== args.expectedHead) {
    throw new Error(
      `GitHub Actions run ${runId} head mismatch: expected ${args.expectedHead}, got ${run.headSha ?? "unknown"}`,
    );
  }
  if (run.headBranch != null && run.headBranch !== args.branch) {
    throw new Error(`GitHub Actions run ${runId} branch mismatch: expected ${args.branch}, got ${run.headBranch}`);
  }
  if (run.status !== "completed" || run.conclusion === "cancelled") {
    throw new Error(
      `GitHub Actions run ${runId} is not completed usable evidence: ${run.status ?? "unknown"}/${run.conclusion ?? "unknown"}`,
    );
  }
  return run;
}

async function assertRunHasSuccessfulTauriJobs(args: Args, runId: string, viewedRun?: GithubRun): Promise<void> {
  const run = viewedRun ?? (await viewRun(args, runId));
  const jobs = run.jobs ?? [];
  for (const jobName of requiredTauriJobNames) {
    const job = jobs.find((candidate) => candidate.name === jobName);
    if (job == null) {
      throw new Error(`GitHub Actions run ${runId} is missing required native M4 job: ${jobName}`);
    }
    if (job.status !== "completed" || job.conclusion !== "success") {
      throw new Error(
        `GitHub Actions run ${runId} required native M4 job did not pass: ${jobName} is ${job.status ?? "unknown"}/${job.conclusion ?? "unknown"}`,
      );
    }
  }
}

function selectCompletedRun(args: Args, runs: GithubRun[]): GithubRun | undefined {
  return runs.find(
    (candidate) =>
      candidate.status === "completed" &&
      candidate.conclusion !== "cancelled" &&
      (candidate.headBranch == null || candidate.headBranch === args.branch) &&
      (args.expectedHead == null || candidate.headSha === args.expectedHead),
  );
}

function summarizeRuns(runs: GithubRun[]): string {
  if (runs.length === 0) return "none";
  return runs
    .slice(0, 3)
    .map(
      (run) =>
        `${run.databaseId ?? "unknown"}:${run.status ?? "unknown"}/${run.conclusion ?? "unknown"}@${run.headBranch ?? "unknown"}:${run.headSha ?? "unknown"}`,
    )
    .join(", ");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function parsePositiveInt(label: string, value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error(`${label} must be a positive integer`);
  return parsed;
}

async function downloadArtifact(args: Args, runId: string, artifactName: string, outputDir: string): Promise<void> {
  await rm(outputDir, { force: true, recursive: true });
  await mkdir(outputDir, { recursive: true });
  await gh(args, ["run", "download", runId, "--repo", args.repo, "--name", artifactName, "--dir", outputDir]);
}

async function gh(args: Args, commandArgs: string[]): Promise<{ stderr: string; stdout: string }> {
  try {
    return await execFileAsync(args.ghBin, commandArgs, {
      cwd: workspaceRoot,
      maxBuffer: 1024 * 1024 * 8,
    });
  } catch (error) {
    const detail = error as Error & { code?: string; stderr?: string; stdout?: string };
    throw new Error(
      [
        `GitHub CLI command failed: ${formatCommand(args.ghBin, commandArgs)}`,
        ...(detail.code === "ENOENT"
          ? [
              `GitHub CLI was not found at ${args.ghBin}. Install gh or pass --gh <path-to-gh>.`,
              "If reports are already available locally, skip this downloader and run scripts/verify-tauri-platform-gates.ts with the report directories.",
              args.expectedHead == null
                ? "To mutate M4/M5 from local reports, run scripts/advance-tauri-migration-m4-m5.ts with --remote, --branch, --expected-head, --win-report, and --linux-report."
                : `To mutate M4/M5 from local reports, run scripts/advance-tauri-migration-m4-m5.ts --remote ${args.gitRemote} --branch ${args.branch} --expected-head ${args.expectedHead} --win-report <win-report-dir> --linux-report <linux-report-dir>.`,
            ]
          : []),
        ...(detail.stdout == null || detail.stdout.trim() === "" ? [] : [`stdout:\n${detail.stdout.trimEnd()}`]),
        ...(detail.stderr == null || detail.stderr.trim() === "" ? [] : [`stderr:\n${detail.stderr.trimEnd()}`]),
      ].join("\n"),
    );
  }
}

async function runScript(scriptName: string, args: string[]): Promise<{ stderr: string; stdout: string }> {
  return execFileAsync(process.execPath, ["--import", "tsx", join(scriptsRoot, scriptName), ...args], {
    cwd: workspaceRoot,
    maxBuffer: 1024 * 1024 * 8,
  });
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

function formatCommand(command: string, args: string[]): string {
  return [command, ...args].map(shellQuote).join(" ");
}

try {
  await main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
