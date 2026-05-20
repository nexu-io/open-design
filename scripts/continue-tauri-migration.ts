import { execFile } from "node:child_process";
import { access, mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";

import { tauriMigrationPrBody } from "./tauri-migration-pr-body.ts";

const execFileAsync = promisify(execFile);
const scriptsRoot = import.meta.dirname;
const workspaceRoot = resolve(scriptsRoot, "..");
const defaultBranch = "codex/electron-to-tauri-migration";
const defaultHandoffDir = "/tmp/open-design-tauri-migration-handoff";
const defaultRemote = "origin";
const defaultPrBodyPath = ".tmp/tauri-migration-pr-body.md";
const defaultReportDir = "/tmp/open-design-tauri-m4-reports";
const defaultWorkflow = "ci.yml";

type Args = {
  advance: boolean;
  automationDir?: string;
  branch: string;
  dispatchCi: boolean;
  dryRun: boolean;
  ghBin: string;
  handoffArchive?: string;
  handoffDir: string;
  prBodyPath: string;
  remote: string;
  reportDir: string;
  root: string;
  push: boolean;
  waitReports: boolean;
  workflow: string;
};

type MigrationStatus = {
  git: {
    branch?: string;
    head?: string;
    trackedClean?: boolean;
  };
  handoff?: {
    branch?: string;
    branchHead?: string;
    current?: boolean;
  };
  handoffArchive?: {
    archive: string;
    current?: boolean;
  };
  heartbeat?: {
    current: boolean;
    dir: string;
    problems: string[];
  };
  phase: "M4" | "M5" | "M6" | "complete";
  platformReports?: {
    current: boolean;
    linuxReport?: string;
    winReport?: string;
  };
  remote?: {
    branch?: string;
    current?: boolean;
    expectedHead?: string;
    head?: string;
  };
};

type RunOptions = {
  cwd: string;
  dryRun: boolean;
  okIfUnavailable?: boolean;
  silent?: boolean;
};

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const log: string[] = [`Continuing Tauri migration from ${args.root}`];
  let status = await readStatus(args);
  ensureBranchMatchesStatus(args, status);

  if (status.heartbeat?.current === false) {
    log.push(`Heartbeat needs attention under ${status.heartbeat.dir}: ${status.heartbeat.problems.join("; ")}`);
  }

  if (status.git.trackedClean !== true && !args.dryRun) {
    throw new Error("tracked worktree changes are present; commit or stash them before continuing the migration");
  }
  if (status.git.trackedClean !== true) {
    log.push("Tracked worktree changes are present; dry-run will print the planned sequence without mutating state.");
  }

  if (status.phase === "complete") {
    log.push("Migration checklist is already complete.");
    process.stdout.write(`${log.join("\n")}\n`);
    return;
  }

  if (status.phase === "M5") {
    await continueM5(args, log);
    process.stdout.write(`${log.join("\n")}\n`);
    return;
  }

  if (status.phase === "M6") {
    log.push("M6 is open. Start with the generated Electron cleanup plan:");
    log.push(formatScriptCommand("tauri-migration-inventory.ts", ["--plan"]));
    process.stdout.write(`${log.join("\n")}\n`);
    return;
  }

  const needsHandoff = status.handoff?.current !== true || status.handoffArchive?.current !== true;
  if (needsHandoff) {
    await runScript(
      "verify-tauri-migration-handoff.ts",
      ["--cwd", args.root, "--branch", args.branch, "--output-dir", args.handoffDir],
      {
        cwd: args.root,
        dryRun: args.dryRun,
      },
    );
    await runScript(
      "package-tauri-migration-handoff.ts",
      [
        "--handoff-dir",
        args.handoffDir,
        "--root",
        args.root,
        ...(args.handoffArchive == null ? [] : ["--output", args.handoffArchive]),
      ],
      {
        cwd: args.root,
        dryRun: args.dryRun,
      },
    );
    log.push(`${args.dryRun ? "Would refresh" : "Refreshed"} verified handoff artifacts under ${args.handoffDir}.`);
    if (args.dryRun) {
      log.push("Rerun the continuation dry-run after refreshing handoff artifacts to plan push and report actions from current status.");
      process.stdout.write(`${log.join("\n")}\n`);
      return;
    }
    status = await readStatus(args);
    ensureBranchMatchesStatus(args, status);
  }

  await continueM4(args, status, log);
  process.stdout.write(`${log.join("\n")}\n`);
}

function ensureBranchMatchesStatus(args: Args, status: MigrationStatus): void {
  const statusBranch = status.handoff?.branch;
  if (statusBranch == null || statusBranch === args.branch) return;
  throw new Error(
    `continuation branch ${args.branch} does not match current handoff/status branch ${statusBranch}; refresh the handoff with --branch ${args.branch} or rerun without the branch override`,
  );
}

function parseArgs(argv: string[]): Args {
  const parsed: Args = {
    advance: false,
    branch: defaultBranch,
    dispatchCi: true,
    dryRun: false,
    ghBin: process.env.GH_BIN ?? "gh",
    handoffDir: defaultHandoffDir,
    prBodyPath: process.env.TAURI_PR_BODY_PATH ?? defaultPrBodyPath,
    remote: process.env.REMOTE ?? defaultRemote,
    reportDir: resolve(process.env.TAURI_M4_REPORT_DIR ?? defaultReportDir),
    root: workspaceRoot,
    push: true,
    waitReports: false,
    workflow: process.env.GITHUB_WORKFLOW ?? defaultWorkflow,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];
    if (arg === "--advance") {
      parsed.advance = true;
      parsed.waitReports = true;
      continue;
    }
    if (arg === "--dry-run") {
      parsed.dryRun = true;
      continue;
    }
    if (arg === "--skip-dispatch") {
      parsed.dispatchCi = false;
      continue;
    }
    if (arg === "--skip-push") {
      parsed.push = false;
      continue;
    }
    if (arg === "--wait-reports") {
      parsed.waitReports = true;
      continue;
    }
    if (
      (arg === "--branch" ||
        arg === "--automation-dir" ||
        arg === "--gh" ||
        arg === "--handoff-archive" ||
        arg === "--handoff-dir" ||
        arg === "--pr-body-path" ||
        arg === "--remote" ||
        arg === "--report-dir" ||
        arg === "--root" ||
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
    if (arg === "--automation-dir") {
      parsed.automationDir = resolve(value!);
      index += 1;
      continue;
    }
    if (arg === "--gh") {
      parsed.ghBin = value!;
      index += 1;
      continue;
    }
    if (arg === "--handoff-archive") {
      parsed.handoffArchive = resolve(value!);
      index += 1;
      continue;
    }
    if (arg === "--handoff-dir") {
      parsed.handoffDir = resolve(value!);
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
    if (arg === "--root") {
      parsed.root = resolve(value!);
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
          "usage: tsx scripts/continue-tauri-migration.ts [--root <repo>] [--automation-dir <dir>] [--handoff-dir <dir>] [--handoff-archive <tar.gz>] [--remote <remote>] [--workflow <file>] [--gh <path>] [--report-dir <dir>] [--pr-body-path <path>] [--wait-reports] [--advance] [--dry-run] [--skip-push] [--skip-dispatch]",
          "",
          "Continues the Electron→Tauri migration from the current phase without bypassing M4/M5/M6 guards.",
          "It refreshes stale handoff artifacts, pushes/verifies the migration branch when credentials allow, and can wait for native M4 reports before applying the guarded M5 advance.",
          `defaults: --workflow ${defaultWorkflow} --report-dir ${defaultReportDir} --pr-body-path ${defaultPrBodyPath}`,
          "env defaults: REMOTE, GITHUB_WORKFLOW, GH_BIN, TAURI_M4_REPORT_DIR, TAURI_PR_BODY_PATH",
          "",
        ].join("\n"),
      );
      process.exit(0);
    }
    throw new Error(`unsupported argument: ${arg}`);
  }

  return parsed;
}

async function continueM4(args: Args, status: MigrationStatus, log: string[]): Promise<void> {
  const archive = status.handoffArchive?.archive ?? args.handoffArchive ?? `${args.handoffDir}.tar.gz`;
  const expectedHead = status.git.head ?? status.handoff?.branchHead;
  if (expectedHead == null) {
    throw new Error("cannot continue M4 without a git head or handoff branchHead");
  }

  let currentStatus = status;
  let remoteCurrent = status.remote?.current === true;
  if (!remoteCurrent) {
    if (args.push) {
      try {
        await runScript("push-tauri-migration-handoff.ts", pushHandoffArgs(args, archive), {
          cwd: args.root,
          dryRun: args.dryRun,
        });
      } catch (error) {
        throw new Error(
          [
            error instanceof Error ? error.message : String(error),
            "",
            "Remote handoff push failed. Transfer the current packaged handoff to a checkout with repository write access:",
            `  ${archive}`,
            `  ${archive}.sha256`,
            `  ${archive}.commands.sh`,
            `  ${archive}.commands.sh.sha256`,
            "",
            "Then run the command sidecar from that checkout, or run:",
            `  ${formatScriptCommand("push-tauri-migration-handoff.ts", pushHandoffArgs(args, archive, { omitCwd: true }))}`,
          ].join("\n"),
        );
      }
      log.push(`${args.dryRun ? "Would push" : "Pushed"} ${args.branch} to ${args.remote} from ${archive}.`);
      if (args.dryRun) {
        const preflight = await preflightDryRunPush(args);
        if (preflight.ok) {
          log.push(`Dry-run push preflight succeeded for ${args.remote} ${args.branch}.`);
          remoteCurrent = true;
        } else {
          log.push(`Dry-run push preflight failed: ${preflight.message}`);
          log.push("The planned push is likely blocked on this host; use the transferable handoff path below.");
          remoteCurrent = false;
        }
        appendTransferableHandoffHint(args, archive, log);
      }
      if (!args.dryRun) {
        currentStatus = await readStatus(args);
        remoteCurrent = currentStatus.remote?.current === true;
        if (!remoteCurrent) {
          throw new Error(`remote ${args.remote} still does not match ${args.branch} after push attempt`);
        }
      }
    } else {
      log.push("Push skipped.");
      appendTransferableHandoffHint(args, archive, log);
      remoteCurrent = false;
    }
  }

  if (!remoteCurrent) {
    log.push("Remote branch is not ready; native CI cannot be collected yet.");
    return;
  }

  if (remoteCurrent && currentStatus.platformReports?.current === true) {
    await maybeAdvanceFromReports(args, currentStatus, log);
    return;
  }

  if (args.dispatchCi) {
    const dispatch = await requestNativeCiDispatch(args);
    if (dispatch.status === "requested" || dispatch.status === "dry-run") {
      log.push(`${args.dryRun ? "Would request" : "Requested"} native CI dispatch for ${args.branch}.`);
    } else {
      log.push(`Native CI dispatch ${dispatch.status === "unavailable" ? "skipped" : "failed"}: ${dispatch.message}`);
      await appendManualNativeCiFallback(args, log);
    }
  }

  if (args.waitReports) {
    await runScript(
      "download-tauri-m4-reports.ts",
      [
        "--branch",
        args.branch,
        "--expected-head",
        expectedHead,
        "--remote",
        args.remote,
        "--wait",
        "--output-dir",
        args.reportDir,
        "--root",
        args.root,
        ...(args.advance ? ["--advance"] : []),
      ],
      {
        cwd: args.root,
        dryRun: args.dryRun,
      },
    );
    log.push(
      `${args.dryRun ? "Would wait for" : "Downloaded and verified"} native M4 reports${args.advance ? " and advance M4→M5" : ""}.`,
    );
    return;
  }

  log.push("Next command after native CI is available:");
  log.push(
    formatScriptCommand("download-tauri-m4-reports.ts", [
      "--branch",
      args.branch,
      "--expected-head",
      expectedHead,
      "--remote",
      args.remote,
      "--wait",
      "--output-dir",
      args.reportDir,
      ...rootArgs(args),
      "--advance",
    ]),
  );
}

function pushHandoffArgs(args: Args, archive: string, options: { omitCwd?: boolean } = {}): string[] {
  return [
    "--archive",
    archive,
    "--remote",
    args.remote,
    ...(options.omitCwd === true ? [] : ["--cwd", args.root]),
    ...(args.ghBin === "gh" ? [] : ["--gh", args.ghBin]),
    "--workflow",
    args.workflow,
    "--report-dir",
    args.reportDir,
    "--pr-body-path",
    args.prBodyPath,
  ];
}

async function preflightDryRunPush(args: Args): Promise<{ ok: true } | { message: string; ok: false }> {
  try {
    await execFileAsync("git", ["push", "--dry-run", args.remote, `HEAD:refs/heads/${args.branch}`], {
      cwd: args.root,
      maxBuffer: 1024 * 1024,
    });
    return { ok: true };
  } catch (error) {
    return { message: conciseErrorMessage(error), ok: false };
  }
}

function appendTransferableHandoffHint(args: Args, archive: string, log: string[]): void {
  log.push("If this host lacks repository write access, transfer the current packaged handoff to a write-capable checkout:");
  log.push(`  ${archive}`);
  log.push(`  ${archive}.sha256`);
  log.push(`  ${archive}.commands.sh`);
  log.push(`  ${archive}.commands.sh.sha256`);
  log.push("Then run the command sidecar from that checkout, or run:");
  log.push(`  ${formatScriptCommand("push-tauri-migration-handoff.ts", pushHandoffArgs(args, archive, { omitCwd: true }))}`);
}

async function appendManualNativeCiFallback(args: Args, log: string[]): Promise<void> {
  const prBodyPath = resolvePathFromRoot(args.root, args.prBodyPath);
  if (args.dryRun) {
    log.push(`Would write draft PR body: ${prBodyPath}`);
  } else {
    await mkdir(dirname(prBodyPath), { recursive: true });
    await writeFile(prBodyPath, tauriMigrationPrBody(), "utf8");
    log.push(`Draft PR body: ${prBodyPath}`);
  }
  log.push(`Trigger it manually with: ${formatCommand(args.ghBin, ["workflow", "run", args.workflow, "--ref", args.branch])}`);
  log.push("If workflow dispatch is unavailable after the branch is pushed, open a draft PR with:");
  log.push(
    formatCommand(args.ghBin, [
      "pr",
      "create",
      "--draft",
      "--base",
      "main",
      "--head",
      args.branch,
      "--title",
      "Migrate desktop runtime to Tauri",
      "--body-file",
      prBodyPath,
    ]),
  );
}

function resolvePathFromRoot(root: string, path: string): string {
  return resolve(root, path);
}

async function requestNativeCiDispatch(args: Args): Promise<
  | { status: "dry-run" }
  | { status: "failed"; message: string }
  | { status: "requested" }
  | { status: "unavailable"; message: string }
> {
  const commandArgs = ["workflow", "run", args.workflow, "--ref", args.branch];
  if (!(await commandExists(args.ghBin))) {
    return { status: "unavailable", message: `${args.ghBin} is not available on PATH` };
  }
  if (args.dryRun) {
    await run(args.ghBin, commandArgs, {
      cwd: args.root,
      dryRun: true,
    });
    return { status: "dry-run" };
  }
  try {
    await run(args.ghBin, commandArgs, {
      cwd: args.root,
      dryRun: false,
    });
    return { status: "requested" };
  } catch (error) {
    return { status: "failed", message: conciseErrorMessage(error) };
  }
}

function conciseErrorMessage(error: unknown): string {
  if (error instanceof Error && ("stderr" in error || "stdout" in error)) {
    const detail = error as Error & { stderr?: string; stdout?: string };
    const output = [detail.stderr, detail.stdout]
      .filter((value): value is string => value != null && value.trim().length > 0)
      .join("\n");
    const firstOutputLine = output.split(/\r?\n/).find((line) => line.trim().length > 0)?.trim();
    if (firstOutputLine != null) return firstOutputLine;
  }
  const message = error instanceof Error ? error.message : String(error);
  return message.split(/\r?\n/).find((line) => line.trim().length > 0)?.trim() ?? "unknown error";
}

async function continueM5(args: Args, log: string[]): Promise<void> {
  if (!args.advance) {
    log.push("M4 is recorded and M5 is open. Run with --advance to apply the guarded default flip.");
    log.push(formatScriptCommand("apply-tauri-migration-m5.ts", rootArgs(args)));
    return;
  }
  await runScript("apply-tauri-migration-m5.ts", ["--root", args.root], { cwd: args.root, dryRun: args.dryRun });
  log.push(`${args.dryRun ? "Would apply" : "Applied"} guarded M5 default flip.`);
}

async function maybeAdvanceFromReports(args: Args, status: MigrationStatus, log: string[]): Promise<void> {
  const winReport = status.platformReports?.winReport;
  const linuxReport = status.platformReports?.linuxReport;
  const expectedHead = status.remote?.expectedHead ?? status.handoff?.branchHead;
  if (winReport == null || linuxReport == null) {
    throw new Error("platform reports are marked current but report paths are missing");
  }
  if (expectedHead == null) {
    throw new Error("remote branch head is required before advancing from platform reports");
  }
  if (!args.advance) {
    log.push("Native M4 reports are verified. Run with --advance to record M4 evidence and apply M5 defaults.");
    log.push(
      formatScriptCommand("advance-tauri-migration-m4-m5.ts", [
        "--remote",
        args.remote,
        "--branch",
        args.branch,
        "--expected-head",
        expectedHead,
        "--win-report",
        winReport,
        "--linux-report",
        linuxReport,
        ...rootArgs(args),
      ]),
    );
    return;
  }
  await runScript(
    "advance-tauri-migration-m4-m5.ts",
    [
      "--remote",
      args.remote,
      "--branch",
      args.branch,
      "--expected-head",
      expectedHead,
      "--win-report",
      winReport,
      "--linux-report",
      linuxReport,
      "--root",
      args.root,
    ],
    {
      cwd: args.root,
      dryRun: args.dryRun,
    },
  );
  log.push(`${args.dryRun ? "Would record" : "Recorded"} M4 evidence and applied guarded M5 default flip.`);
}

function rootArgs(args: Args): string[] {
  return args.root === workspaceRoot ? [] : ["--root", args.root];
}

async function readStatus(args: Args): Promise<MigrationStatus> {
  const result = await runScript(
    "tauri-migration-status.ts",
    [
      "--root",
      args.root,
      ...(args.automationDir == null ? [] : ["--automation-dir", args.automationDir]),
      "--handoff-dir",
      args.handoffDir,
      ...(args.handoffArchive == null ? [] : ["--handoff-archive", args.handoffArchive]),
      "--remote",
      args.remote,
      "--report-dir",
      args.reportDir,
      "--json",
    ],
    { cwd: args.root, dryRun: false, silent: true },
  );
  return JSON.parse(result.stdout) as MigrationStatus;
}

async function runScript(
  scriptName: string,
  args: string[],
  options: RunOptions,
): Promise<{ stderr: string; stdout: string }> {
  return run(process.execPath, ["--import", "tsx", join(scriptsRoot, scriptName), ...args], { ...options, cwd: workspaceRoot });
}

async function run(command: string, args: string[], options: RunOptions): Promise<{ stderr: string; stdout: string }> {
  if (options.dryRun) {
    process.stdout.write(`Would run: ${formatCommand(command, args)}\n`);
    return { stderr: "", stdout: "" };
  }
  if (options.okIfUnavailable && !(await commandExists(command))) {
    process.stdout.write(`Command unavailable, skipping: ${command}\n`);
    return { stderr: "", stdout: "" };
  }
  try {
    const result = await execFileAsync(command, args, {
      cwd: options.cwd,
      maxBuffer: 1024 * 1024 * 16,
    });
    if (options.silent !== true && result.stdout.trim().length > 0) process.stdout.write(`${result.stdout.trimEnd()}\n`);
    if (options.silent !== true && result.stderr.trim().length > 0) process.stderr.write(`${result.stderr.trimEnd()}\n`);
    return result;
  } catch (error) {
    if (error instanceof Error && "stdout" in error && "stderr" in error) {
      const detail = error as Error & { stderr?: string; stdout?: string };
      throw new Error(
        [
          `command failed: ${formatCommand(command, args)}`,
          ...(detail.stdout == null || detail.stdout.trim() === "" ? [] : [`stdout:\n${detail.stdout.trimEnd()}`]),
          ...(detail.stderr == null || detail.stderr.trim() === "" ? [] : [`stderr:\n${detail.stderr.trimEnd()}`]),
        ].join("\n"),
      );
    }
    throw error;
  }
}

async function commandExists(command: string): Promise<boolean> {
  if (command.includes("/") || command.includes("\\")) {
    try {
      await access(command);
      return true;
    } catch {
      return false;
    }
  }
  try {
    await execFileAsync("sh", ["-c", `command -v ${shellQuote(command)}`]);
    return true;
  } catch {
    return false;
  }
}

function formatScriptCommand(scriptName: string, args: string[]): string {
  return formatCommand("pnpm", ["exec", "tsx", `scripts/${scriptName}`, ...args]);
}

function formatCommand(command: string, args: string[]): string {
  return [command, ...args].map(shellQuote).join(" ");
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
