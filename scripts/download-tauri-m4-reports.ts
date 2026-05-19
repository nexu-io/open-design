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
  ghBin: string;
  outputDir: string;
  repo: string;
  root: string;
  runId?: string;
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
  const runId = args.runId ?? (await findLatestCompletedRun(args));
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
    repo: defaultRepo,
    root: workspaceRoot,
    workflow: defaultWorkflow,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];
    if (arg === "--advance") {
      parsed.advance = true;
      continue;
    }
    if (
      (arg === "--branch" ||
        arg === "--gh" ||
        arg === "--output-dir" ||
        arg === "--repo" ||
        arg === "--root" ||
        arg === "--run-id" ||
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
  const runs = JSON.parse(result.stdout) as GithubRun[];
  const run = runs.find((candidate) => candidate.status === "completed" && candidate.conclusion !== "cancelled");
  if (run?.databaseId == null) {
    throw new Error(`no completed GitHub Actions run found for ${args.repo} ${args.branch} ${args.workflow}`);
  }
  return String(run.databaseId);
}

async function downloadArtifact(args: Args, runId: string, artifactName: string, outputDir: string): Promise<void> {
  await rm(outputDir, { force: true, recursive: true });
  await mkdir(outputDir, { recursive: true });
  await gh(args, ["run", "download", runId, "--repo", args.repo, "--name", artifactName, "--dir", outputDir]);
}

async function gh(args: Args, commandArgs: string[]): Promise<{ stderr: string; stdout: string }> {
  return execFileAsync(args.ghBin, commandArgs, {
    cwd: workspaceRoot,
    maxBuffer: 1024 * 1024 * 8,
  });
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

try {
  await main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
