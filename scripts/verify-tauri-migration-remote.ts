import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const defaultBranch = "codex/electron-to-tauri-migration";
const defaultRemote = "origin";

type Args = {
  branch?: string;
  cwd: string;
  expectedHead?: string;
  manifest?: string;
  remote: string;
};

type ResolvedArgs = {
  branch: string;
  cwd: string;
  expectedHead: string;
  manifest?: string;
  remote: string;
};

type HandoffManifest = {
  branch: string;
  branchHead: string;
  schemaVersion: 1;
};

async function main(): Promise<void> {
  const args = await resolveArgs(parseArgs(process.argv.slice(2)));
  const remoteHead = await readRemoteBranchHead(args.cwd, args.remote, args.branch);
  if (remoteHead !== args.expectedHead) {
    throw new Error(`remote branch head mismatch: expected ${args.expectedHead}, got ${remoteHead}`);
  }

  process.stdout.write(
    [
      "Verified Tauri migration remote branch.",
      `Remote: ${args.remote}`,
      ...(args.manifest == null ? [] : [`Manifest: ${args.manifest}`]),
      `Branch: ${args.branch} @ ${remoteHead}`,
      "",
    ].join("\n"),
  );
}

function parseArgs(argv: string[]): Args {
  const parsed: Args = {
    cwd: process.cwd(),
    remote: defaultRemote,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];
    if (
      (arg === "--branch" ||
        arg === "--cwd" ||
        arg === "--expected-head" ||
        arg === "--manifest" ||
        arg === "--remote") &&
      value == null
    ) {
      throw new Error(`${arg} requires a value`);
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
    if (arg === "--expected-head") {
      parsed.expectedHead = value!;
      index += 1;
      continue;
    }
    if (arg === "--manifest") {
      parsed.manifest = resolve(value!);
      index += 1;
      continue;
    }
    if (arg === "--remote") {
      parsed.remote = value!;
      index += 1;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      process.stdout.write(
        [
          "usage: tsx scripts/verify-tauri-migration-remote.ts --manifest <path> [--remote <remote>] [--cwd <repo>] [--branch <ref>] [--expected-head <sha>]",
          "",
          `defaults: --cwd ${process.cwd()} --remote ${defaultRemote} --branch ${defaultBranch}`,
          "",
        ].join("\n"),
      );
      process.exit(0);
    }
    throw new Error(`unsupported argument: ${arg}`);
  }

  return parsed;
}

async function resolveArgs(parsed: Args): Promise<ResolvedArgs> {
  const manifest = parsed.manifest == null ? undefined : await readManifest(parsed.manifest);
  const expectedHead = parsed.expectedHead ?? manifest?.branchHead;
  if (expectedHead == null) {
    throw new Error("--expected-head or --manifest requires a branch head");
  }
  if (!/^[0-9a-f]{40}$/.test(expectedHead)) {
    throw new Error(`invalid expected branch head: ${expectedHead}`);
  }

  const resolved: ResolvedArgs = {
    branch: parsed.branch ?? manifest?.branch ?? defaultBranch,
    cwd: parsed.cwd,
    expectedHead,
    remote: parsed.remote,
  };
  if (parsed.manifest != null) {
    resolved.manifest = parsed.manifest;
  }
  return resolved;
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

try {
  await main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
