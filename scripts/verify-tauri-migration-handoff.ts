import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const scriptsRoot = import.meta.dirname;
const defaultRoot = resolve(scriptsRoot, "..");
const defaultBranch = "codex/electron-to-tauri-migration";
const defaultBase = "origin/main";

type Args = {
  base: string;
  branch: string;
  cwd: string;
  keepTemp: boolean;
  output?: string;
};

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const tempRoot = await mkdtemp(join(tmpdir(), "open-design-tauri-handoff-"));
  const bundlePath = args.output ?? join(tempRoot, "open-design-tauri-migration.bundle");
  const remotePath = join(tempRoot, "origin.git");
  const receiverPath = join(tempRoot, "receiver");

  try {
    const branchHead = (await git(args.cwd, ["rev-parse", "--verify", args.branch])).stdout.trim();
    const baseHead = (await git(args.cwd, ["rev-parse", "--verify", args.base])).stdout.trim();
    const createOutput = await runScript("create-tauri-migration-bundle.ts", [
      "--cwd",
      args.cwd,
      "--branch",
      args.branch,
      "--base",
      args.base,
      "--output",
      bundlePath,
    ]);
    const bundleSha256 = readSha256(createOutput.stdout);

    await git(args.cwd, ["init", "--bare", remotePath]);
    await git(args.cwd, ["push", remotePath, `${baseHead}:refs/heads/main`]);
    await git(args.cwd, ["clone", "--branch", "main", remotePath, receiverPath]);
    const importOutput = await runScript("import-tauri-migration-bundle.ts", [
      "--cwd",
      receiverPath,
      "--branch",
      args.branch,
      "--bundle",
      bundlePath,
      "--expected-sha256",
      bundleSha256,
      "--checkout",
    ]);
    const importedHead = (await git(receiverPath, ["rev-parse", "--verify", args.branch])).stdout.trim();
    if (importedHead !== branchHead) {
      throw new Error(`imported branch head mismatch: expected ${branchHead}, got ${importedHead}`);
    }

    process.stdout.write(
      [
        "Verified Tauri migration bundle handoff round-trip.",
        `Source: ${args.cwd}`,
        `Receiver: ${receiverPath}`,
        `Branch: ${args.branch} @ ${branchHead}`,
        `Base: ${args.base} @ ${baseHead}`,
        `Bundle: ${bundlePath}`,
        `SHA-256: ${bundleSha256}`,
        "Receiving import command (replace --bundle if copied elsewhere):",
        indent(receivingImportCommand(bundlePath, bundleSha256, args.branch)),
        "Create:",
        indent(createOutput.stdout.trim()),
        "Import:",
        indent(importOutput.stdout.trim()),
        args.keepTemp ? `Temp retained: ${tempRoot}` : "Temp retained: false",
        "",
      ].join("\n"),
    );
  } finally {
    if (!args.keepTemp) {
      await rm(tempRoot, { force: true, recursive: true });
    }
  }
}

function parseArgs(argv: string[]): Args {
  const parsed: Args = {
    base: defaultBase,
    branch: defaultBranch,
    cwd: defaultRoot,
    keepTemp: false,
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
    if (arg === "--keep-temp") {
      parsed.keepTemp = true;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      process.stdout.write(
        [
          "usage: tsx scripts/verify-tauri-migration-handoff.ts [--cwd <repo>] [--branch <ref>] [--base <ref>] [--output <bundle>] [--keep-temp]",
          "",
          `defaults: --cwd ${defaultRoot} --branch ${defaultBranch} --base ${defaultBase}`,
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
    cwd: defaultRoot,
    maxBuffer: 1024 * 1024 * 4,
  });
}

async function git(cwd: string, args: string[]): Promise<{ stderr: string; stdout: string }> {
  return execFileAsync("git", args, {
    cwd,
    maxBuffer: 1024 * 1024,
  });
}

function readSha256(output: string): string {
  const match = output.match(/^SHA-256:\s*([0-9a-f]{64})$/m);
  if (match?.[1] == null) {
    throw new Error("create bundle output did not include a SHA-256 line");
  }
  return match[1];
}

function indent(value: string): string {
  return value
    .split(/\r?\n/)
    .map((line) => `  ${line}`)
    .join("\n");
}

function receivingImportCommand(bundlePath: string, bundleSha256: string, branch: string): string {
  return [
    "pnpm exec tsx scripts/import-tauri-migration-bundle.ts \\",
    `  --bundle ${shellQuote(bundlePath)} \\`,
    `  --expected-sha256 ${bundleSha256} \\`,
    `  --branch ${shellQuote(branch)} \\`,
    "  --checkout",
  ].join("\n");
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
