import { execFile } from "node:child_process";
import { copyFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
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
  manifest?: string;
  note?: string;
  output?: string;
  outputDir?: string;
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
    const manifestBundlePath = args.manifest == null ? bundlePath : bundlePathForManifest(args.manifest, bundlePath);
    const manifestBundlePathIsRelocatable = isRelocatableManifestBundlePath(manifestBundlePath);
    const importCommand = receivingImportCommand({
      branch: args.branch,
      bundlePath,
      bundleSha256,
      ...(args.manifest == null ? {} : { manifestPath: args.manifest }),
    });
    if (args.manifest != null) {
      await writeManifest(args.manifest, {
        base: args.base,
        baseHead,
        branch: args.branch,
        branchHead,
        bundlePath: manifestBundlePath,
        bundleSha256,
        importCommand,
        source: args.cwd,
      });
    }
    if (args.note != null) {
      await writeNote(args.note, {
        base: args.base,
        baseHead,
        branch: args.branch,
        branchHead,
        bundlePath,
        bundleSha256,
        importCommand,
        ...(args.manifest == null ? {} : { manifestPath: args.manifest }),
        manifestBundlePathIsRelocatable,
        source: args.cwd,
      });
    }

    await git(args.cwd, ["init", "--bare", remotePath]);
    await git(args.cwd, ["push", remotePath, `${baseHead}:refs/heads/main`]);
    await git(args.cwd, ["clone", "--branch", "main", remotePath, receiverPath]);
    const importOutput = await runScript(
      "import-tauri-migration-bundle.ts",
      args.manifest == null
        ? [
            "--cwd",
            receiverPath,
            "--branch",
            args.branch,
            "--bundle",
            bundlePath,
            "--expected-sha256",
            bundleSha256,
            "--checkout",
          ]
        : ["--cwd", receiverPath, "--manifest", args.manifest, "--checkout"],
    );
    const importedHead = (await git(receiverPath, ["rev-parse", "--verify", args.branch])).stdout.trim();
    if (importedHead !== branchHead) {
      throw new Error(`imported branch head mismatch: expected ${branchHead}, got ${importedHead}`);
    }
    const relocatedImportOutput =
      args.manifest == null || !manifestBundlePathIsRelocatable
        ? undefined
        : await verifyRelocatedHandoff({
            branch: args.branch,
            branchHead,
            bundlePath,
            manifestBundlePath,
            manifestPath: args.manifest,
            remotePath,
            tempRoot,
          });

    process.stdout.write(
      [
        "Verified Tauri migration bundle handoff round-trip.",
        `Source: ${args.cwd}`,
        `Receiver: ${receiverPath}`,
        `Branch: ${args.branch} @ ${branchHead}`,
        `Base: ${args.base} @ ${baseHead}`,
        `Bundle: ${bundlePath}`,
        `SHA-256: ${bundleSha256}`,
        ...(args.manifest == null ? [] : [`Manifest: ${args.manifest}`]),
        ...(args.note == null ? [] : [`Note: ${args.note}`]),
        "Receiving import command (replace --manifest or --bundle if copied elsewhere):",
        indent(importCommand),
        "Create:",
        indent(createOutput.stdout.trim()),
        "Import:",
        indent(importOutput.stdout.trim()),
        ...(relocatedImportOutput == null ? [] : ["Relocated import:", indent(relocatedImportOutput.stdout.trim())]),
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
    if (
      (arg === "--base" ||
        arg === "--branch" ||
        arg === "--cwd" ||
        arg === "--note" ||
        arg === "--output" ||
        arg === "--output-dir") &&
      value == null
    ) {
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
    if (arg === "--output-dir") {
      parsed.outputDir = resolve(value!);
      index += 1;
      continue;
    }
    if (arg === "--keep-temp") {
      parsed.keepTemp = true;
      continue;
    }
    if (arg === "--manifest") {
      if (value == null) {
        throw new Error("--manifest requires a path");
      }
      parsed.manifest = resolve(value);
      index += 1;
      continue;
    }
    if (arg === "--note") {
      parsed.note = resolve(value!);
      index += 1;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      process.stdout.write(
        [
          "usage: tsx scripts/verify-tauri-migration-handoff.ts [--cwd <repo>] [--branch <ref>] [--base <ref>] [--output <bundle>] [--manifest <path>] [--note <path>] [--keep-temp]",
          "       tsx scripts/verify-tauri-migration-handoff.ts --output-dir <dir> [--cwd <repo>] [--branch <ref>] [--base <ref>] [--keep-temp]",
          "",
          `defaults: --cwd ${defaultRoot} --branch ${defaultBranch} --base ${defaultBase}`,
          "",
        ].join("\n"),
      );
      process.exit(0);
    }
    throw new Error(`unsupported argument: ${arg}`);
  }

  return applyOutputDirDefaults(parsed);
}

function applyOutputDirDefaults(args: Args): Args {
  if (args.outputDir == null) {
    return args;
  }
  return {
    ...args,
    manifest: args.manifest ?? join(args.outputDir, "open-design-tauri-migration-handoff.json"),
    note: args.note ?? join(args.outputDir, "open-design-tauri-migration-handoff.md"),
    output: args.output ?? join(args.outputDir, "open-design-tauri-migration.bundle"),
  };
}

async function runScript(scriptName: string, args: string[]): Promise<{ stderr: string; stdout: string }> {
  return execFileAsync(process.execPath, ["--import", "tsx", join(scriptsRoot, scriptName), ...args], {
    cwd: defaultRoot,
    maxBuffer: 1024 * 1024 * 4,
  });
}

async function verifyRelocatedHandoff({
  branch,
  branchHead,
  bundlePath,
  manifestBundlePath,
  manifestPath,
  remotePath,
  tempRoot,
}: {
  branch: string;
  branchHead: string;
  bundlePath: string;
  manifestBundlePath: string;
  manifestPath: string;
  remotePath: string;
  tempRoot: string;
}): Promise<{ stderr: string; stdout: string }> {
  const relocatedHandoffPath = join(tempRoot, "relocated-handoff");
  const relocatedBundlePath = join(relocatedHandoffPath, manifestBundlePath);
  const relocatedManifestPath = join(relocatedHandoffPath, basename(manifestPath));
  const relocatedReceiverPath = join(tempRoot, "relocated-receiver");

  await mkdir(dirname(relocatedBundlePath), { recursive: true });
  await mkdir(dirname(relocatedManifestPath), { recursive: true });
  await copyFile(bundlePath, relocatedBundlePath);
  await copyFile(manifestPath, relocatedManifestPath);
  await git(defaultRoot, ["clone", "--branch", "main", remotePath, relocatedReceiverPath]);
  const importOutput = await runScript("import-tauri-migration-bundle.ts", [
    "--cwd",
    relocatedReceiverPath,
    "--manifest",
    relocatedManifestPath,
    "--checkout",
  ]);
  const importedHead = (await git(relocatedReceiverPath, ["rev-parse", "--verify", branch])).stdout.trim();
  if (importedHead !== branchHead) {
    throw new Error(`relocated imported branch head mismatch: expected ${branchHead}, got ${importedHead}`);
  }
  return importOutput;
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

function receivingImportCommand({
  branch,
  bundlePath,
  bundleSha256,
  manifestPath,
}: {
  branch: string;
  bundlePath: string;
  bundleSha256: string;
  manifestPath?: string;
}): string {
  if (manifestPath != null) {
    return [
      "pnpm exec tsx scripts/import-tauri-migration-bundle.ts \\",
      `  --manifest ${shellQuote(manifestPath)} \\`,
      "  --checkout",
    ].join("\n");
  }
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

function bundlePathForManifest(manifestPath: string, bundlePath: string): string {
  const manifestRelativePath = relative(dirname(manifestPath), bundlePath);
  return isRelocatableManifestBundlePath(manifestRelativePath) ? manifestRelativePath : bundlePath;
}

function isRelocatableManifestBundlePath(value: string): boolean {
  return value.length > 0 && !isAbsolute(value) && value.split(/[\\/]/)[0] !== "..";
}

async function writeManifest(
  path: string,
  manifest: {
    base: string;
    baseHead: string;
    branch: string;
    branchHead: string;
    bundlePath: string;
    bundleSha256: string;
    importCommand: string;
    source: string;
  },
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(
    path,
    `${JSON.stringify(
      {
        schemaVersion: 1,
        createdAt: new Date().toISOString(),
        ...manifest,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
}

async function writeNote(
  path: string,
  note: {
    base: string;
    baseHead: string;
    branch: string;
    branchHead: string;
    bundlePath: string;
    bundleSha256: string;
    importCommand: string;
    manifestBundlePathIsRelocatable: boolean;
    manifestPath?: string;
    source: string;
  },
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(
    path,
    [
      "# Tauri Migration Handoff",
      "",
      "## Verified Artifact",
      "",
      `- Source: \`${note.source}\``,
      `- Base: \`${note.base}\` @ \`${note.baseHead}\``,
      `- Branch: \`${note.branch}\` @ \`${note.branchHead}\``,
      `- Bundle: \`${note.bundlePath}\``,
      `- Bundle SHA-256: \`${note.bundleSha256}\``,
      ...(note.manifestPath == null ? [] : [`- Manifest: \`${note.manifestPath}\``]),
      "",
      "## Sender Machine",
      "",
      "Before copying to another machine, package this verified handoff directory as a tarball with a checksum sidecar:",
      "",
      "```bash",
      ...(note.manifestPath == null
        ? [
            "pnpm exec tsx scripts/package-tauri-migration-handoff.ts \\",
            "  --handoff-dir /path/to/open-design-tauri-migration-handoff",
          ]
        : [
            "pnpm exec tsx scripts/package-tauri-migration-handoff.ts \\",
            `  --handoff-dir ${shellWord(dirname(note.manifestPath))}`,
          ]),
      "```",
      "",
      "## Receiving Machine",
      "",
      "Preferred path when you copied the tarball and `.sha256` sidecar:",
      "",
      "```bash",
      "pnpm exec tsx scripts/push-tauri-migration-handoff.ts \\",
      ...(note.manifestPath == null
        ? ["  --archive /path/to/open-design-tauri-migration-handoff.tar.gz \\"]
        : [`  --archive ${shellWord(`${dirname(note.manifestPath)}.tar.gz`)} \\`]),
      "  --remote origin",
      "```",
      "",
      "Fallback path when the handoff directory is already extracted:",
      "",
      "```bash",
      ...(note.manifestPath == null
        ? [
            note.importCommand,
            "git push -u origin " + shellWord(note.branch),
          ]
        : [
            "pnpm exec tsx scripts/push-tauri-migration-handoff.ts \\",
            `  --manifest ${shellWord(note.manifestPath)} \\`,
            "  --remote origin",
          ]),
      "```",
      "",
      ...(note.manifestBundlePathIsRelocatable
        ? [
            "If this handoff directory is copied elsewhere after extraction, replace only the manifest path in the fallback command above. The manifest records the bundle path relative to itself, so keep the bundle and manifest in the same copied directory.",
            "If the bundle is copied outside the handoff directory, add `--bundle /path/to/open-design-tauri-migration.bundle` to the push command.",
            "",
          ]
        : []),
      "To verify an already-pushed remote without importing again:",
      "",
      "```bash",
      ...(note.manifestPath == null
        ? [
            "pnpm exec tsx scripts/verify-tauri-migration-remote.ts \\",
            `  --branch ${shellWord(note.branch)} \\`,
            `  --expected-head ${note.branchHead} \\`,
            "  --remote origin",
          ]
        : [
            "pnpm exec tsx scripts/verify-tauri-migration-remote.ts \\",
            `  --manifest ${shellWord(note.manifestPath)} \\`,
            "  --remote origin",
          ]),
      "```",
      "",
      "After the Windows and Linux Tauri smoke jobs complete, download and verify their report artifacts:",
      "",
      "```bash",
      "pnpm exec tsx scripts/download-tauri-m4-reports.ts \\",
      "  --run-id <github-run-id> \\",
      "  --output-dir /tmp/open-design-tauri-m4-reports",
      "```",
      "",
      "Then advance the migration through M4 evidence and M5 defaults:",
      "",
      "```bash",
      "pnpm exec tsx scripts/advance-tauri-migration-m4-m5.ts \\",
      "  --win-report /tmp/open-design-tauri-m4-reports/open-design-ci-win-tauri-e2e-report \\",
      "  --linux-report /tmp/open-design-tauri-m4-reports/open-design-ci-linux-tauri-e2e-report",
      "```",
      "",
    ].join("\n"),
    "utf8",
  );
}

function shellWord(value: string): string {
  return shellQuote(value);
}

try {
  await main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
