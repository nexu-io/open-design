import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const scriptsRoot = import.meta.dirname;
const defaultRemote = "origin";
const manifestName = "open-design-tauri-migration-handoff.json";
const noteName = "open-design-tauri-migration-handoff.md";

type Args = {
  archive?: string;
  bundle?: string;
  cwd: string;
  manifest?: string;
  remote: string;
};

type ResolvedArgs = {
  archive?: string;
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
  const parsed = parseArgs(process.argv.slice(2));
  const extracted = parsed.archive == null ? undefined : await extractArchive(parsed.archive);
  try {
    const args = await resolveArgs(parsed, extracted?.manifest);
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
        ...(args.archive == null ? [] : [`Archive: ${args.archive}`]),
        `Manifest: ${args.manifest}`,
        ...(args.bundle == null ? [] : [`Bundle override: ${args.bundle}`]),
        `Remote: ${args.remote}`,
        `Branch: ${args.branch}`,
        ...(extracted == null
          ? []
          : [
              "Archive verify:",
              indent(
                [
                  `SHA-256: ${extracted.archiveSha256}`,
                  `Checksum: ${extracted.checksum}`,
                  `Extracted manifest: ${extracted.manifest}`,
                ].join("\n"),
              ),
            ]),
        "Import:",
        indent(importOutput.stdout.trim()),
        "Push:",
        indent((pushOutput.stdout + pushOutput.stderr).trim()),
        "Verify:",
        indent(verifyOutput.stdout.trim()),
        "",
      ].join("\n"),
    );
  } finally {
    if (extracted != null) {
      await rm(extracted.tempRoot, { force: true, recursive: true });
    }
  }
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
      (arg === "--archive" || arg === "--bundle" || arg === "--cwd" || arg === "--manifest" || arg === "--remote") &&
      value == null
    ) {
      throw new Error(`${arg} requires a value`);
    }
    if (arg === "--archive") {
      parsed.archive = resolve(value!);
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
          "usage: tsx scripts/push-tauri-migration-handoff.ts --archive <handoff.tar.gz> [--remote <remote>] [--cwd <repo>]",
          "       tsx scripts/push-tauri-migration-handoff.ts --manifest <path> [--remote <remote>] [--cwd <repo>]",
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

async function resolveArgs(parsed: Args, extractedManifest?: string): Promise<ResolvedArgs> {
  if (parsed.archive != null && parsed.manifest != null) {
    throw new Error("--archive and --manifest are mutually exclusive");
  }
  if (parsed.archive != null && parsed.bundle != null) {
    throw new Error("--bundle can only be used with --manifest");
  }
  const manifestPath = extractedManifest ?? parsed.manifest;
  if (manifestPath == null) {
    throw new Error("--manifest or --archive is required");
  }
  const manifest = await readManifest(manifestPath);
  return {
    ...(parsed.archive == null ? {} : { archive: parsed.archive }),
    branch: manifest.branch,
    ...(parsed.bundle == null ? {} : { bundle: parsed.bundle }),
    cwd: parsed.cwd,
    manifest: manifestPath,
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

async function extractArchive(archive: string): Promise<{
  archiveSha256: string;
  checksum: string;
  manifest: string;
  tempRoot: string;
}> {
  const checksumPath = `${archive}.sha256`;
  const archiveSha256 = await sha256File(archive);
  await verifyChecksumSidecar(checksumPath, archiveSha256, archive);
  const entries = await listTarEntries(archive);
  validateArchiveEntries(entries);
  const manifestEntries = entries.filter((entry) => entry.endsWith(`/${manifestName}`) || entry === manifestName);
  if (manifestEntries.length !== 1) {
    throw new Error(`handoff archive must contain exactly one ${manifestName}; found ${manifestEntries.length}`);
  }
  const noteEntries = entries.filter((entry) => entry.endsWith(`/${noteName}`) || entry === noteName);
  if (noteEntries.length !== 1) {
    throw new Error(`handoff archive must contain exactly one ${noteName}; found ${noteEntries.length}`);
  }
  const tempRoot = await mkdtemp(join(tmpdir(), "open-design-tauri-push-handoff-"));
  try {
    await execFileAsync("tar", ["-xzf", archive, "-C", tempRoot], { maxBuffer: 1024 * 1024 });
    return {
      archiveSha256,
      checksum: checksumPath,
      manifest: join(tempRoot, manifestEntries[0]!),
      tempRoot,
    };
  } catch (error) {
    await rm(tempRoot, { force: true, recursive: true });
    throw error;
  }
}

async function verifyChecksumSidecar(checksumPath: string, actualSha256: string, archive: string): Promise<void> {
  const checksum = await readFile(checksumPath, "utf8");
  const match = checksum.match(/^([0-9a-f]{64})\s+(\S+)\s*$/);
  if (match?.[1] == null || match[2] == null) {
    throw new Error(`checksum sidecar has invalid format: ${checksumPath}`);
  }
  if (match[1] !== actualSha256) {
    throw new Error(`archive SHA-256 mismatch: expected ${match[1]}, got ${actualSha256}`);
  }
  if (match[2] !== basename(archive)) {
    throw new Error(`checksum sidecar filename mismatch: expected ${basename(archive)}, got ${match[2]}`);
  }
}

async function listTarEntries(archive: string): Promise<string[]> {
  const result = await execFileAsync("tar", ["-tzf", archive], { maxBuffer: 1024 * 1024 });
  return result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function validateArchiveEntries(entries: string[]): void {
  if (entries.length === 0) {
    throw new Error("handoff archive is empty");
  }
  for (const entry of entries) {
    if (entry.startsWith("/") || entry.split("/").some((part) => part === "..")) {
      throw new Error(`handoff archive contains unsafe path: ${entry}`);
    }
  }
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

async function sha256File(path: string): Promise<string> {
  const hash = createHash("sha256");
  const stream = createReadStream(path);
  for await (const chunk of stream) {
    hash.update(chunk);
  }
  return hash.digest("hex");
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
