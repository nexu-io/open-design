import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const defaultHandoffDir = "/tmp/open-design-tauri-migration-handoff";
const manifestName = "open-design-tauri-migration-handoff.json";
const noteName = "open-design-tauri-migration-handoff.md";

type Args = {
  handoffDir: string;
  output?: string;
};

type HandoffManifest = {
  branch: string;
  branchHead: string;
  bundlePath: string;
  bundleSha256: string;
  schemaVersion: 1;
};

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const archivePath = resolve(args.output ?? `${args.handoffDir}.tar.gz`);
  ensureOutputOutsideHandoff(args.handoffDir, archivePath);

  const handoff = await validateHandoff(args.handoffDir);
  await mkdir(dirname(archivePath), { recursive: true });
  await execFileAsync("tar", ["-czf", archivePath, "-C", dirname(args.handoffDir), basename(args.handoffDir)], {
    maxBuffer: 1024 * 1024,
  });

  const archiveSha256 = await sha256File(archivePath);
  const checksumPath = `${archivePath}.sha256`;
  await writeFile(checksumPath, `${archiveSha256}  ${basename(archivePath)}\n`, "utf8");

  process.stdout.write(
    [
      "Packaged Tauri migration handoff.",
      `Handoff: ${args.handoffDir}`,
      `Manifest: ${handoff.manifestPath}`,
      `Note: ${handoff.notePath}`,
      `Branch: ${handoff.manifest.branch} @ ${handoff.manifest.branchHead}`,
      `Bundle: ${handoff.bundlePath}`,
      `Bundle SHA-256: ${handoff.manifest.bundleSha256}`,
      `Archive: ${archivePath}`,
      `Archive SHA-256: ${archiveSha256}`,
      `Checksum: ${checksumPath}`,
      "",
    ].join("\n"),
  );
}

function parseArgs(argv: string[]): Args {
  const parsed: Args = { handoffDir: defaultHandoffDir };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];
    if ((arg === "--handoff-dir" || arg === "--output") && value == null) {
      throw new Error(`${arg} requires a value`);
    }
    if (arg === "--handoff-dir") {
      parsed.handoffDir = resolve(value!);
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
          "usage: tsx scripts/package-tauri-migration-handoff.ts [--handoff-dir <dir>] [--output <tar.gz>]",
          "",
          `defaults: --handoff-dir ${defaultHandoffDir} --output <handoff-dir>.tar.gz`,
          "",
        ].join("\n"),
      );
      process.exit(0);
    }
    throw new Error(`unsupported argument: ${arg}`);
  }
  return parsed;
}

async function validateHandoff(handoffDir: string): Promise<{
  bundlePath: string;
  manifest: HandoffManifest;
  manifestPath: string;
  notePath: string;
}> {
  await assertDirectory(handoffDir);
  const manifestPath = join(handoffDir, manifestName);
  const notePath = join(handoffDir, noteName);
  const manifest = readManifest(JSON.parse(await readFile(manifestPath, "utf8")) as Partial<HandoffManifest>);
  const bundlePath = resolve(dirname(manifestPath), manifest.bundlePath);
  ensureInsideHandoff(handoffDir, bundlePath, "handoff manifest bundlePath");
  await assertFile(notePath, "handoff note");
  await assertFile(bundlePath, "handoff bundle");

  const bundleSha256 = await sha256File(bundlePath);
  if (bundleSha256 !== manifest.bundleSha256) {
    throw new Error(`bundle SHA-256 mismatch: expected ${manifest.bundleSha256}, got ${bundleSha256}`);
  }

  return {
    bundlePath,
    manifest,
    manifestPath,
    notePath,
  };
}

async function assertDirectory(path: string): Promise<void> {
  const value = await stat(path);
  if (!value.isDirectory()) {
    throw new Error(`handoff path is not a directory: ${path}`);
  }
}

async function assertFile(path: string, label: string): Promise<void> {
  const value = await stat(path);
  if (!value.isFile()) {
    throw new Error(`${label} is not a file: ${path}`);
  }
}

function readManifest(value: Partial<HandoffManifest>): HandoffManifest {
  if (value.schemaVersion !== 1) {
    throw new Error(`unsupported handoff manifest schemaVersion: ${String(value.schemaVersion)}`);
  }
  if (typeof value.branch !== "string" || value.branch.length === 0) {
    throw new Error("handoff manifest missing branch");
  }
  if (typeof value.branchHead !== "string" || !/^[0-9a-f]{40}$/.test(value.branchHead)) {
    throw new Error("handoff manifest missing branchHead");
  }
  if (typeof value.bundlePath !== "string" || value.bundlePath.length === 0) {
    throw new Error("handoff manifest missing bundlePath");
  }
  if (typeof value.bundleSha256 !== "string" || !/^[0-9a-f]{64}$/.test(value.bundleSha256)) {
    throw new Error("handoff manifest missing bundleSha256");
  }
  return {
    branch: value.branch,
    branchHead: value.branchHead,
    bundlePath: value.bundlePath,
    bundleSha256: value.bundleSha256,
    schemaVersion: value.schemaVersion,
  };
}

function ensureInsideHandoff(handoffDir: string, targetPath: string, label: string): void {
  const relativeTarget = relative(handoffDir, targetPath);
  if (relativeTarget === "" || relativeTarget.startsWith("..") || isAbsolute(relativeTarget)) {
    throw new Error(`${label} must resolve inside the handoff directory: ${targetPath}`);
  }
}

function ensureOutputOutsideHandoff(handoffDir: string, outputPath: string): void {
  const relativeOutput = relative(handoffDir, outputPath);
  if (relativeOutput.startsWith("..") || isAbsolute(relativeOutput)) {
    return;
  }
  throw new Error(`--output must be outside the handoff directory so it is not archived into itself: ${outputPath}`);
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
