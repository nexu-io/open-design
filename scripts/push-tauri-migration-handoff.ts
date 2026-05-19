import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const scriptsRoot = import.meta.dirname;
const defaultRemote = "origin";

type Args = {
  bundle?: string;
  cwd: string;
  manifest?: string;
  remote: string;
};

type ResolvedArgs = {
  branch: string;
  bundle?: string;
  cwd: string;
  manifest: string;
  remote: string;
};

type HandoffManifest = {
  branch: string;
  branchHead: string;
  schemaVersion: 1;
};

async function main(): Promise<void> {
  const args = await resolveArgs(parseArgs(process.argv.slice(2)));
  const importArgs = [
    "--cwd",
    args.cwd,
    "--manifest",
    args.manifest,
    ...(args.bundle == null ? [] : ["--bundle", args.bundle]),
  ];
  const importOutput = await runScript("import-tauri-migration-bundle.ts", importArgs);
  const pushOutput = await git(args.cwd, ["push", args.remote, `refs/heads/${args.branch}:refs/heads/${args.branch}`]);
  const verifyOutput = await runScript("verify-tauri-migration-remote.ts", [
    "--cwd",
    args.cwd,
    "--manifest",
    args.manifest,
    "--remote",
    args.remote,
  ]);

  process.stdout.write(
    [
      "Pushed Tauri migration handoff.",
      `Git cwd: ${args.cwd}`,
      `Manifest: ${args.manifest}`,
      ...(args.bundle == null ? [] : [`Bundle override: ${args.bundle}`]),
      `Remote: ${args.remote}`,
      `Branch: ${args.branch}`,
      "Import:",
      indent(importOutput.stdout.trim()),
      "Push:",
      indent((pushOutput.stdout + pushOutput.stderr).trim()),
      "Verify:",
      indent(verifyOutput.stdout.trim()),
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
    if ((arg === "--bundle" || arg === "--cwd" || arg === "--manifest" || arg === "--remote") && value == null) {
      throw new Error(`${arg} requires a value`);
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
          "usage: tsx scripts/push-tauri-migration-handoff.ts --manifest <path> [--remote <remote>] [--cwd <repo>]",
          "       tsx scripts/push-tauri-migration-handoff.ts --manifest <path> --bundle <path> [--remote <remote>] [--cwd <repo>]",
          "",
          `defaults: --cwd ${process.cwd()} --remote ${defaultRemote}`,
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
  if (parsed.manifest == null) {
    throw new Error("--manifest is required");
  }
  const manifest = await readManifest(parsed.manifest);
  return {
    branch: manifest.branch,
    ...(parsed.bundle == null ? {} : { bundle: parsed.bundle }),
    cwd: parsed.cwd,
    manifest: parsed.manifest,
    remote: parsed.remote,
  };
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

async function runScript(scriptName: string, args: string[]): Promise<{ stderr: string; stdout: string }> {
  return execFileAsync(process.execPath, ["--import", "tsx", resolve(scriptsRoot, scriptName), ...args], {
    cwd: scriptsRoot,
    maxBuffer: 1024 * 1024 * 4,
  });
}

async function git(cwd: string, args: string[]): Promise<{ stderr: string; stdout: string }> {
  return execFileAsync("git", args, {
    cwd,
    maxBuffer: 1024 * 1024,
  });
}

function indent(value: string): string {
  return value
    .split(/\r?\n/)
    .filter((line, index, lines) => line.length > 0 || index < lines.length - 1)
    .map((line) => `  ${line}`)
    .join("\n");
}

try {
  await main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
