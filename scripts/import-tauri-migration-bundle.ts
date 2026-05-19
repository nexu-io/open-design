import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const defaultBranch = "codex/electron-to-tauri-migration";

type Args = {
  branch: string;
  bundle: string;
  checkout: boolean;
  cwd: string;
  expectedSha256?: string;
  manifest?: string;
};

type ParsedArgs = {
  branch?: string;
  bundle?: string;
  checkout: boolean;
  cwd: string;
  expectedSha256?: string;
  manifest?: string;
};

type HandoffManifest = {
  branch: string;
  bundlePath: string;
  bundleSha256: string;
  schemaVersion: 1;
};

async function main(): Promise<void> {
  const args = await resolveArgs(parseArgs(process.argv.slice(2)));

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

  const currentBranch = await readCurrentBranch(args.cwd);
  const shouldRestoreCheckedOutBranch = currentBranch === args.branch;
  const tempRef = `refs/heads/__open_design_tauri_import_${process.pid}_${Date.now()}`;
  await ensureTrackedClean(args.cwd);
  if (shouldRestoreCheckedOutBranch) {
    await git(args.cwd, ["checkout", "--detach"]);
  }
  try {
    await deleteRefIfPresent(args.cwd, tempRef);
    await git(args.cwd, ["fetch", args.bundle, `${args.branch}:${tempRef}`]);
    await git(args.cwd, ["branch", "-f", args.branch, tempRef]);
  } finally {
    await deleteRefIfPresent(args.cwd, tempRef);
  }
  const branchHead = (await git(args.cwd, ["rev-parse", "--verify", args.branch])).stdout.trim();
  if (args.checkout || shouldRestoreCheckedOutBranch) {
    await ensureTrackedClean(args.cwd);
    await git(args.cwd, ["checkout", args.branch]);
  }

  process.stdout.write(
    [
      `Imported Tauri migration bundle: ${args.bundle}`,
      ...(args.manifest == null ? [] : [`Manifest: ${args.manifest}`]),
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

function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = {
    checkout: false,
    cwd: process.cwd(),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];
    if (
      (arg === "--branch" ||
        arg === "--bundle" ||
        arg === "--cwd" ||
        arg === "--expected-sha256" ||
        arg === "--manifest") &&
      value == null
    ) {
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
    if (arg === "--manifest") {
      parsed.manifest = resolve(value!);
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
          "usage: tsx scripts/import-tauri-migration-bundle.ts (--bundle <path> | --manifest <path>) [--expected-sha256 <sha>] [--cwd <repo>] [--branch <ref>] [--checkout]",
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

async function resolveArgs(parsed: ParsedArgs): Promise<Args> {
  const manifest = parsed.manifest == null ? undefined : await readManifest(parsed.manifest);
  const bundle = parsed.bundle ?? (manifest == null ? undefined : resolveMaybeRelative(parsed.manifest!, manifest.bundlePath));
  if (bundle == null) {
    throw new Error("--bundle or --manifest requires a bundle path");
  }

  const args: Args = {
    branch: parsed.branch ?? manifest?.branch ?? defaultBranch,
    bundle,
    checkout: parsed.checkout,
    cwd: parsed.cwd,
  };
  const expectedSha256 = parsed.expectedSha256 ?? manifest?.bundleSha256;
  if (expectedSha256 != null) {
    args.expectedSha256 = expectedSha256;
  }
  if (parsed.manifest != null) {
    args.manifest = parsed.manifest;
  }
  return args;
}

async function readManifest(path: string): Promise<HandoffManifest> {
  const value = JSON.parse(await readFile(path, "utf8")) as Partial<HandoffManifest>;
  if (value.schemaVersion !== 1) {
    throw new Error(`unsupported handoff manifest schemaVersion: ${String(value.schemaVersion)}`);
  }
  if (typeof value.branch !== "string" || value.branch.length === 0) {
    throw new Error("handoff manifest missing branch");
  }
  if (typeof value.bundlePath !== "string" || value.bundlePath.length === 0) {
    throw new Error("handoff manifest missing bundlePath");
  }
  if (typeof value.bundleSha256 !== "string" || !/^[0-9a-f]{64}$/.test(value.bundleSha256)) {
    throw new Error("handoff manifest missing bundleSha256");
  }
  return {
    branch: value.branch,
    bundlePath: value.bundlePath,
    bundleSha256: value.bundleSha256,
    schemaVersion: value.schemaVersion,
  };
}

function resolveMaybeRelative(manifestPath: string, targetPath: string): string {
  return resolve(dirname(manifestPath), targetPath);
}

async function ensureTrackedClean(cwd: string): Promise<void> {
  const trackedStatus = (await git(cwd, ["status", "--porcelain", "--untracked-files=no"])).stdout.trim();
  if (trackedStatus.length > 0) {
    throw new Error("tracked worktree changes are present; commit or stash them before importing the migration handoff");
  }
}

async function readCurrentBranch(cwd: string): Promise<string | undefined> {
  try {
    const branch = (await git(cwd, ["symbolic-ref", "--short", "-q", "HEAD"])).stdout.trim();
    return branch.length === 0 ? undefined : branch;
  } catch {
    return undefined;
  }
}

async function deleteRefIfPresent(cwd: string, ref: string): Promise<void> {
  try {
    await git(cwd, ["update-ref", "-d", ref]);
  } catch {
    // The temp ref is best-effort cleanup; absence is the normal case.
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
