import { execFile } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const defaultBranch = "codex/electron-to-tauri-migration";
const defaultBase = "origin/main";
const defaultOutput = resolve(tmpdir(), "open-design-tauri-migration.bundle");

type Args = {
  base: string;
  branch: string;
  cwd: string;
  output: string;
};

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const trackedStatus = (await git(args.cwd, ["status", "--porcelain", "--untracked-files=no"])).stdout.trim();
  if (trackedStatus.length > 0) {
    throw new Error("tracked worktree changes are present; commit or stash them before creating a handoff bundle");
  }

  const branchHead = (await git(args.cwd, ["rev-parse", "--verify", args.branch])).stdout.trim();
  const baseHead = (await git(args.cwd, ["rev-parse", "--verify", args.base])).stdout.trim();
  await mkdir(dirname(args.output), { recursive: true });
  await git(args.cwd, ["bundle", "create", args.output, args.branch, `^${args.base}`]);
  const verify = await git(args.cwd, ["bundle", "verify", args.output]);
  const heads = await git(args.cwd, ["bundle", "list-heads", args.output]);

  process.stdout.write(
    [
      `Created Tauri migration bundle: ${args.output}`,
      `Git cwd: ${args.cwd}`,
      `Branch: ${args.branch} @ ${branchHead}`,
      `Base: ${args.base} @ ${baseHead}`,
      "Verify:",
      verify.stdout.trim(),
      "Heads:",
      heads.stdout.trim(),
      "",
    ].join("\n"),
  );
}

function parseArgs(argv: string[]): Args {
  const parsed: Args = {
    base: defaultBase,
    branch: defaultBranch,
    cwd: process.cwd(),
    output: defaultOutput,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];
    if ((arg === "--base" || arg === "--branch" || arg === "--cwd" || arg === "--output") && value == null) {
      throw new Error(`${arg} requires a value`);
    }
    if (arg === "--base") {
      parsed.base = value!;
      index += 1;
      continue;
    }
    if (arg === "--branch") {
      parsed.branch = value!;
      index += 1;
      continue;
    }
    if (arg === "--cwd") {
      parsed.cwd = resolve(value!);
      index += 1;
      continue;
    }
    if (arg === "--output") {
      parsed.output = resolve(value!);
      index += 1;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      process.stdout.write(
        [
          "usage: tsx scripts/create-tauri-migration-bundle.ts [--cwd <repo>] [--branch <ref>] [--base <ref>] [--output <path>]",
          "",
          `defaults: --cwd ${process.cwd()} --branch ${defaultBranch} --base ${defaultBase} --output ${defaultOutput}`,
          "",
        ].join("\n"),
      );
      process.exit(0);
    }
    throw new Error(`unsupported argument: ${arg}`);
  }

  return parsed;
}

async function git(cwd: string, args: string[]): Promise<{ stderr: string; stdout: string }> {
  return execFileAsync("git", args, {
    cwd,
    maxBuffer: 1024 * 1024,
  });
}

try {
  await main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
