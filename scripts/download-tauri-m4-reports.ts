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
const defaultWorkflow = "ci.yml";
const linuxArtifactName = "open-design-ci-linux-tauri-e2e-report";
const winArtifactName = "open-design-ci-win-tauri-e2e-report";

type Args = {
  advance: boolean;
  branch: string;
  expectedHead?: string;
  ghBin: string;
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
  headSha?: string;
  status?: string;
};

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const runId = args.runId ?? (args.wait ? await waitForCompletedRun(args) : await findLatestCompletedRun(args));
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

function parseArgs(argv: string[]): Args {
  const parsed: Args = {
    advance: false,
    branch: defaultBranch,
    ghBin: process.env.GH_BIN ?? "gh",
    outputDir: defaultOutputDir,
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
          "usage: tsx scripts/download-tauri-m4-reports.ts [--run-id <id>] [--repo <owner/repo>] [--branch <ref>] [--output-dir <dir>] [--advance] [--root <repo>]",
          "",
          "Downloads the Windows/Linux Tauri CI report artifacts with gh, verifies them with scripts/verify-tauri-platform-gates.ts, and optionally applies the guarded M4→M5 advance.",
          "Use --expected-head <sha> to avoid stale branch runs, and --wait to poll until a matching completed run exists.",
          "",
          `defaults: --repo ${defaultRepo} --branch ${defaultBranch} --workflow ${defaultWorkflow} --output-dir ${defaultOutputDir}`,
          "",
        ].join("\n"),
      );
      process.exit(0);
    }
    throw new Error(`unsupported argument: ${arg}`);
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
    "databaseId,status,conclusion,headSha,createdAt",
    "--limit",
    "20",
  ]);
  return JSON.parse(result.stdout) as GithubRun[];
}

function selectCompletedRun(args: Args, runs: GithubRun[]): GithubRun | undefined {
  return runs.find(
    (candidate) =>
      candidate.status === "completed" &&
      candidate.conclusion !== "cancelled" &&
      (args.expectedHead == null || candidate.headSha === args.expectedHead),
  );
}

function summarizeRuns(runs: GithubRun[]): string {
  if (runs.length === 0) return "none";
  return runs
    .slice(0, 3)
    .map(
      (run) =>
        `${run.databaseId ?? "unknown"}:${run.status ?? "unknown"}/${run.conclusion ?? "unknown"}@${run.headSha ?? "unknown"}`,
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
              "If reports are already available locally, skip this downloader and run scripts/verify-tauri-platform-gates.ts or scripts/advance-tauri-migration-m4-m5.ts with the report directories.",
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
