import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const defaultBranch = "codex/electron-to-tauri-migration";

type Args = {
  branch: string;
  bundle?: string;
  checkout: boolean;
  cwd: string;
  expectedSha256?: string;
};

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.bundle == null) {
    throw new Error("--bundle requires a path");
  }

  const outputStat = await stat(args.bundle);
  const outputSha256 = await sha256File(args.bundle);
  if (args.expectedSha256 != null && outputSha256 !== args.expectedSha256) {
    throw new Error(`bundle SHA-256 mismatch: expected ${args.expectedSha256}, got ${outputSha256}`);
  }

  const verify = await git(args.cwd, ["bundle", "verify", args.bundle]);
  const heads = await git(args.cwd, ["bundle", "list-heads", args.bundle]);
  if (!heads.stdout.includes(`refs/heads/${args.branch}`)) {
    throw new Error(`bundle does not contain refs/heads/${args.branch}`);
  }

  await git(args.cwd, ["fetch", args.bundle, `${args.branch}:refs/heads/${args.branch}`]);
  const branchHead = (await git(args.cwd, ["rev-parse", "--verify", args.branch])).stdout.trim();
  if (args.checkout) {
    await ensureTrackedClean(args.cwd);
    await git(args.cwd, ["checkout", args.branch]);
  }

  process.stdout.write(
    [
      `Imported Tauri migration bundle: ${args.bundle}`,
      `Git cwd: ${args.cwd}`,
      `Branch: ${args.branch} @ ${branchHead}`,
      `Bundle bytes: ${outputStat.size}`,
      `SHA-256: ${outputSha256}`,
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
    branch: defaultBranch,
    checkout: false,
    cwd: process.cwd(),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];
    if ((arg === "--branch" || arg === "--bundle" || arg === "--cwd" || arg === "--expected-sha256") && value == null) {
      throw new Error(`${arg} requires a value`);
    }
    if (arg === "--branch") {
      parsed.branch = value!;
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
    if (arg === "--expected-sha256") {
      parsed.expectedSha256 = value!;
      index += 1;
      continue;
    }
    if (arg === "--checkout") {
      parsed.checkout = true;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      process.stdout.write(
        [
          "usage: tsx scripts/import-tauri-migration-bundle.ts --bundle <path> [--expected-sha256 <sha>] [--cwd <repo>] [--branch <ref>] [--checkout]",
          "",
          `defaults: --cwd ${process.cwd()} --branch ${defaultBranch}`,
          "",
        ].join("\n"),
      );
      process.exit(0);
    }
    throw new Error(`unsupported argument: ${arg}`);
  }

  return parsed;
}

async function ensureTrackedClean(cwd: string): Promise<void> {
  const trackedStatus = (await git(cwd, ["status", "--porcelain", "--untracked-files=no"])).stdout.trim();
  if (trackedStatus.length > 0) {
    throw new Error("tracked worktree changes are present; commit or stash them before checking out the imported branch");
  }
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

try {
  await main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
