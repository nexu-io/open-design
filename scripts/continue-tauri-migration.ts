import { execFile } from "node:child_process";
import { access } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const scriptsRoot = import.meta.dirname;
const workspaceRoot = resolve(scriptsRoot, "..");
const defaultBranch = "codex/electron-to-tauri-migration";
const defaultHandoffDir = "/tmp/open-design-tauri-migration-handoff";
const defaultRemote = "origin";
const defaultReportDir = "/tmp/open-design-tauri-m4-reports";

type Args = {
  advance: boolean;
  branch: string;
  dispatchCi: boolean;
  dryRun: boolean;
  ghBin: string;
  handoffDir: string;
  remote: string;
  reportDir: string;
  root: string;
  push: boolean;
  waitReports: boolean;
};

type MigrationStatus = {
  git: {
    branch?: string;
    head?: string;
    trackedClean?: boolean;
  };
  handoff?: {
    branchHead?: string;
    current?: boolean;
  };
  handoffArchive?: {
    archive: string;
    current?: boolean;
  };
  phase: "M4" | "M5" | "M6" | "complete";
  platformReports?: {
    current: boolean;
    linuxReport?: string;
    winReport?: string;
  };
  remote?: {
    current?: boolean;
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
    await runScript("verify-tauri-migration-handoff.ts", ["--cwd", args.root, "--output-dir", args.handoffDir], {
      cwd: args.root,
      dryRun: args.dryRun,
    });
    await runScript("package-tauri-migration-handoff.ts", ["--handoff-dir", args.handoffDir], {
      cwd: args.root,
      dryRun: args.dryRun,
    });
    log.push(`${args.dryRun ? "Would refresh" : "Refreshed"} verified handoff artifacts under ${args.handoffDir}.`);
    if (args.dryRun) {
      log.push("Rerun the continuation dry-run after refreshing handoff artifacts to plan push and report actions from current status.");
      process.stdout.write(`${log.join("\n")}\n`);
      return;
    }
    status = await readStatus(args);
  }

  await continueM4(args, status, log);
  process.stdout.write(`${log.join("\n")}\n`);
}

function parseArgs(argv: string[]): Args {
  const parsed: Args = {
    advance: false,
    branch: defaultBranch,
    dispatchCi: true,
    dryRun: false,
    ghBin: process.env.GH_BIN ?? "gh",
    handoffDir: defaultHandoffDir,
    remote: defaultRemote,
    reportDir: defaultReportDir,
    root: workspaceRoot,
    push: true,
    waitReports: false,
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
        arg === "--gh" ||
        arg === "--handoff-dir" ||
        arg === "--remote" ||
        arg === "--report-dir" ||
        arg === "--root") &&
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
    if (arg === "--handoff-dir") {
      parsed.handoffDir = resolve(value!);
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
    if (arg === "--help" || arg === "-h") {
      process.stdout.write(
        [
          "usage: tsx scripts/continue-tauri-migration.ts [--root <repo>] [--handoff-dir <dir>] [--remote <remote>] [--report-dir <dir>] [--wait-reports] [--advance] [--dry-run] [--skip-push] [--skip-dispatch]",
          "",
          "Continues the Electron→Tauri migration from the current phase without bypassing M4/M5/M6 guards.",
          "It refreshes stale handoff artifacts, pushes/verifies the migration branch when credentials allow, and can wait for native M4 reports before applying the guarded M5 advance.",
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
  const archive = status.handoffArchive?.archive ?? `${args.handoffDir}.tar.gz`;
  const expectedHead = status.git.head ?? status.handoff?.branchHead;
  if (expectedHead == null) {
    throw new Error("cannot continue M4 without a git head or handoff branchHead");
  }

  if (status.platformReports?.current === true) {
    await maybeAdvanceFromReports(args, status, log);
    return;
  }

  let remoteCurrent = status.remote?.current === true;
  if (!remoteCurrent) {
    if (args.push) {
      try {
        await runScript("push-tauri-migration-handoff.ts", ["--archive", archive, "--remote", args.remote, "--cwd", args.root], {
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
            `  ${formatScriptCommand("push-tauri-migration-handoff.ts", ["--archive", archive, "--remote", args.remote])}`,
          ].join("\n"),
        );
      }
      log.push(`${args.dryRun ? "Would push" : "Pushed"} ${args.branch} to ${args.remote} from ${archive}.`);
      if (!args.dryRun) {
        const refreshed = await readStatus(args);
        remoteCurrent = refreshed.remote?.current === true;
        if (!remoteCurrent) {
          throw new Error(`remote ${args.remote} still does not match ${args.branch} after push attempt`);
        }
      }
    } else {
      log.push(
        `Push skipped. Transfer ${archive}, ${archive}.sha256, ${archive}.commands.sh, and ${archive}.commands.sh.sha256 to a write-capable checkout.`,
      );
      remoteCurrent = false;
    }
  }

  if (!remoteCurrent && !args.dryRun) {
    log.push("Remote branch is not ready; native CI cannot be collected yet.");
    return;
  }

  if (args.dispatchCi) {
    const dispatch = await requestNativeCiDispatch(args);
    if (dispatch.status === "requested" || dispatch.status === "dry-run") {
      log.push(`${args.dryRun ? "Would request" : "Requested"} native CI dispatch for ${args.branch}.`);
    } else {
      log.push(`Native CI dispatch ${dispatch.status === "unavailable" ? "skipped" : "failed"}: ${dispatch.message}`);
      log.push(`Trigger it manually with: gh workflow run ci.yml --ref ${args.branch}`);
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
      "--wait",
      "--output-dir",
      args.reportDir,
      "--advance",
    ]),
  );
}

async function requestNativeCiDispatch(args: Args): Promise<
  | { status: "dry-run" }
  | { status: "failed"; message: string }
  | { status: "requested" }
  | { status: "unavailable"; message: string }
> {
  const commandArgs = ["workflow", "run", "ci.yml", "--ref", args.branch];
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
  const message = error instanceof Error ? error.message : String(error);
  return message.split(/\r?\n/).find((line) => line.trim().length > 0)?.trim() ?? "unknown error";
}

async function continueM5(args: Args, log: string[]): Promise<void> {
  if (!args.advance) {
    log.push("M4 is recorded and M5 is open. Run with --advance to apply the guarded default flip.");
    log.push(formatScriptCommand("apply-tauri-migration-m5.ts", []));
    return;
  }
  await runScript("apply-tauri-migration-m5.ts", ["--root", args.root], { cwd: args.root, dryRun: args.dryRun });
  log.push(`${args.dryRun ? "Would apply" : "Applied"} guarded M5 default flip.`);
}

async function maybeAdvanceFromReports(args: Args, status: MigrationStatus, log: string[]): Promise<void> {
  const winReport = status.platformReports?.winReport;
  const linuxReport = status.platformReports?.linuxReport;
  if (winReport == null || linuxReport == null) {
    throw new Error("platform reports are marked current but report paths are missing");
  }
  if (!args.advance) {
    log.push("Native M4 reports are verified. Run with --advance to record M4 evidence and apply M5 defaults.");
    log.push(formatScriptCommand("advance-tauri-migration-m4-m5.ts", ["--win-report", winReport, "--linux-report", linuxReport]));
    return;
  }
  await runScript(
    "advance-tauri-migration-m4-m5.ts",
    ["--win-report", winReport, "--linux-report", linuxReport, "--root", args.root],
    {
      cwd: args.root,
      dryRun: args.dryRun,
    },
  );
  log.push(`${args.dryRun ? "Would record" : "Recorded"} M4 evidence and applied guarded M5 default flip.`);
}

async function readStatus(args: Args): Promise<MigrationStatus> {
  const result = await runScript(
    "tauri-migration-status.ts",
    [
      "--root",
      args.root,
      "--handoff-dir",
      args.handoffDir,
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
