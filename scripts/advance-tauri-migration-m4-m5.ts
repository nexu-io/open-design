import { execFile } from "node:child_process";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const scriptsRoot = import.meta.dirname;
const workspaceRoot = resolve(scriptsRoot, "..");

type Args = {
  linuxReport?: string;
  root: string;
  winReport?: string;
};

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.winReport == null || args.linuxReport == null) {
    throw new Error("usage: tsx scripts/advance-tauri-migration-m4-m5.ts --win-report <dir> --linux-report <dir> [--root <repo>]");
  }
  await assertTrackedWorktreeClean(args.root, "advancing M4 evidence and M5 defaults");

  const migrationDoc = join(args.root, "docs", "electron-to-tauri-migration.md");
  const platformResult = await runScript("verify-tauri-platform-gates.ts", [
    "--win-report",
    args.winReport,
    "--linux-report",
    args.linuxReport,
    "--update-migration-doc",
    migrationDoc,
  ]);
  const m5Result = await runScript("apply-tauri-migration-m5.ts", ["--root", args.root, "--skip-clean-check"]);

  process.stdout.write(
    [
      "Advanced Tauri migration from verified M4 platform evidence through M5 default flip.",
      `Root: ${args.root}`,
      `Migration doc: ${migrationDoc}`,
      "Platform verification:",
      indent(platformResult.stdout.trim()),
      "M5 default flip:",
      indent(m5Result.stdout.trim()),
      "",
    ].join("\n"),
  );
}

function parseArgs(argv: string[]): Args {
  const parsed: Args = {
    root: workspaceRoot,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];
    if ((arg === "--linux-report" || arg === "--root" || arg === "--win-report") && value == null) {
      throw new Error(`${arg} requires a value`);
    }
    if (arg === "--linux-report") {
      parsed.linuxReport = resolve(value!);
      index += 1;
      continue;
    }
    if (arg === "--root") {
      parsed.root = resolve(value!);
      index += 1;
      continue;
    }
    if (arg === "--win-report") {
      parsed.winReport = resolve(value!);
      index += 1;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      process.stdout.write(
        [
          "usage: tsx scripts/advance-tauri-migration-m4-m5.ts --win-report <dir> --linux-report <dir> [--root <repo>]",
          "",
          "Verifies native Windows/Linux M4 reports, updates the migration document, then applies the guarded M5 default flip.",
          "",
        ].join("\n"),
      );
      process.exit(0);
    }
    throw new Error(`unsupported argument: ${arg}`);
  }

  return parsed;
}

async function runScript(scriptName: string, args: string[]): Promise<{ stderr: string; stdout: string }> {
  return execFileAsync(process.execPath, ["--import", "tsx", join(scriptsRoot, scriptName), ...args], {
    cwd: workspaceRoot,
    maxBuffer: 1024 * 1024 * 4,
  });
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

function indent(value: string): string {
  return value
    .split(/\r?\n/)
    .map((line) => `  ${line}`)
    .join("\n");
}

try {
  await main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
