import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";

import { CLOSURE_ARCHIVE_ENTRY_PATH } from "@open-design/closure/protocol";

import {
  standaloneBodySource,
  standaloneInnerBootloaderSource,
} from "./closure-runtime-source.js";

const CLOSURE_FORBIDDEN_BUNDLE_INPUTS = [
  "/shells/electron/",
  "/payload-desktop-handoff.",
] as const;
const CLOSURE_ESBUILD_BANNER =
  'import { createRequire as __odCreateRequire } from "node:module"; const require = __odCreateRequire(import.meta.url);';

type RunPnpm = (workspaceRoot: string, args: readonly string[]) => Promise<void>;

async function runEsbuild(
  runPnpm: RunPnpm,
  workspaceRoot: string,
  args: readonly string[],
): Promise<void> {
  await runPnpm(workspaceRoot, ["--filter", "@open-design/tools-pack", "exec", "esbuild", ...args]);
}

async function assertClosureBundleMetafile(path: string): Promise<void> {
  const metafile = JSON.parse(await readFile(path, "utf8")) as { inputs?: Record<string, unknown> };
  const forbidden = Object.keys(metafile.inputs ?? {})
    .map((input) => input.replaceAll("\\", "/"))
    .filter((input) => CLOSURE_FORBIDDEN_BUNDLE_INPUTS.some((fragment) => input.includes(fragment)));
  if (forbidden.length > 0) {
    throw new Error(`Closure prebundle included shell compatibility inputs: ${forbidden.join(", ")}`);
  }
}

export async function buildClosurePrebundles(input: Readonly<{
  appRoot: string;
  daemonExternals: readonly string[];
  minShellVersion: string;
  runPnpm: RunPnpm;
  stageRoot: string;
  workspaceRoot: string;
}>): Promise<void> {
  const { appRoot, daemonExternals, minShellVersion, runPnpm, stageRoot, workspaceRoot } = input;
  const entryRoot = join(stageRoot, "entries");
  const metadataRoot = join(stageRoot, "metadata");
  const daemonEntry = join(entryRoot, "daemon-cli.mjs");
  const daemonSidecarEntry = join(workspaceRoot, "apps", "daemon", "src", "sidecar", "daemon-sidecar.ts");
  const daemonStandaloneSidecarEntry = join(
    workspaceRoot,
    "apps",
    "daemon",
    "src",
    "sidecar",
    "daemon-standalone-sidecar.ts",
  );
  const daemonOutputRoot = join(appRoot, "daemon");
  const daemonMetafile = join(metadataRoot, "daemon.json");
  const bodyEntry = join(entryRoot, "body.mjs");
  const bootloaderEntry = join(entryRoot, CLOSURE_ARCHIVE_ENTRY_PATH);
  const bodyMetafile = join(metadataRoot, "body.json");
  const webOutput = join(appRoot, "web", "web-sidecar.mjs");
  const webStandaloneOutput = join(appRoot, "web", "web-standalone-sidecar.mjs");
  const webMetafile = join(metadataRoot, "web.json");
  const webStandaloneMetafile = join(metadataRoot, "web-standalone.json");
  await mkdir(entryRoot, { recursive: true });
  await mkdir(metadataRoot, { recursive: true });
  await writeFile(
    daemonEntry,
    [
      'import { fileURLToPath } from "node:url";',
      "const selfPath = fileURLToPath(import.meta.url);",
      "process.env.OD_BIN ??= selfPath;",
      "process.env.OD_DAEMON_CLI_PATH ??= selfPath;",
      `await import(${JSON.stringify(join(workspaceRoot, "apps", "daemon", "dist", "cli.js"))});`,
      "",
    ].join("\n"),
    "utf8",
  );
  await writeFile(bodyEntry, standaloneBodySource(), "utf8");
  await writeFile(bootloaderEntry, standaloneInnerBootloaderSource({ minShellVersion }), "utf8");
  const externalArgs = [...daemonExternals, "fsevents"].map((dependency) => `--external:${dependency}`);
  await runEsbuild(runPnpm, workspaceRoot, [
    daemonEntry,
    daemonSidecarEntry,
    daemonStandaloneSidecarEntry,
    "--bundle",
    "--splitting",
    "--platform=node",
    "--format=esm",
    "--target=node24",
    `--banner:js=${CLOSURE_ESBUILD_BANNER}`,
    ...externalArgs,
    `--outdir=${daemonOutputRoot}`,
    "--entry-names=[name]",
    "--chunk-names=chunks/[name]-[hash]",
    "--out-extension:.js=.mjs",
    `--metafile=${daemonMetafile}`,
  ]);
  await runEsbuild(runPnpm, workspaceRoot, [
    bootloaderEntry,
    bodyEntry,
    "--bundle",
    "--splitting",
    "--platform=node",
    "--format=esm",
    "--target=node24",
    `--banner:js=${CLOSURE_ESBUILD_BANNER}`,
    ...externalArgs,
    `--outdir=${appRoot}`,
    "--entry-names=[name]",
    "--chunk-names=chunks/[name]-[hash]",
    "--out-extension:.js=.mjs",
    `--metafile=${bodyMetafile}`,
  ]);
  await runEsbuild(runPnpm, workspaceRoot, [
    join(workspaceRoot, "apps", "web", "dist", "sidecar", "index.js"),
    "--bundle",
    "--platform=node",
    "--format=esm",
    "--target=node24",
    `--outfile=${webOutput}`,
    `--metafile=${webMetafile}`,
  ]);
  await runEsbuild(runPnpm, workspaceRoot, [
    join(workspaceRoot, "apps", "web", "sidecar", "web-standalone-sidecar.ts"),
    "--bundle",
    "--platform=node",
    "--format=esm",
    "--target=node24",
    `--outfile=${webStandaloneOutput}`,
    `--metafile=${webStandaloneMetafile}`,
  ]);
  await Promise.all([
    assertClosureBundleMetafile(daemonMetafile),
    assertClosureBundleMetafile(bodyMetafile),
    assertClosureBundleMetafile(webMetafile),
    assertClosureBundleMetafile(webStandaloneMetafile),
  ]);
}

export async function copyClosureWebRuntime(workspaceRoot: string, appRoot: string): Promise<void> {
  const standaloneSource = join(workspaceRoot, "apps", "web", ".next", "standalone");
  const standaloneTarget = join(appRoot, "web", "standalone");
  if (!(await stat(standaloneSource)).isDirectory()) {
    throw new Error(`Closure Web standalone output is missing: ${standaloneSource}`);
  }
  await cp(standaloneSource, standaloneTarget, { dereference: true, recursive: true });
  await materializeClosureWebPublicHoist(standaloneTarget);

  const appRelativeRoot = await stat(join(standaloneTarget, "apps", "web", "server.js"))
    .then(() => join(standaloneTarget, "apps", "web"))
    .catch(() => standaloneTarget);
  await mkdir(join(appRelativeRoot, ".next"), { recursive: true });
  await cp(
    join(workspaceRoot, "apps", "web", ".next", "static"),
    join(appRelativeRoot, ".next", "static"),
    { dereference: true, recursive: true },
  );
  const publicRoot = join(workspaceRoot, "apps", "web", "public");
  if ((await stat(publicRoot).catch(() => null))?.isDirectory()) {
    await cp(publicRoot, join(appRelativeRoot, "public"), { dereference: true, recursive: true });
  }
}

/** Materialize pnpm's public-hoist symlinks as archive-safe directories. */
export async function materializeClosureWebPublicHoist(standaloneRoot: string): Promise<string[]> {
  const nodeModulesRoot = join(standaloneRoot, "node_modules");
  const hoistRoot = join(nodeModulesRoot, ".pnpm", "node_modules");
  const entries = await readdir(hoistRoot, { withFileTypes: true }).catch(() => []);
  const materialized: string[] = [];
  const materialize = async (sourcePath: string, destinationPath: string): Promise<void> => {
    await rm(destinationPath, { force: true, recursive: true });
    await mkdir(dirname(destinationPath), { recursive: true });
    await cp(sourcePath, destinationPath, { dereference: true, recursive: true });
    materialized.push(relative(standaloneRoot, destinationPath).split(sep).join("/"));
  };
  for (const entry of entries) {
    const sourcePath = join(hoistRoot, entry.name);
    if (entry.name.startsWith("@") && entry.isDirectory()) {
      for (const scopedEntry of await readdir(sourcePath)) {
        await materialize(join(sourcePath, scopedEntry), join(nodeModulesRoot, entry.name, scopedEntry));
      }
      continue;
    }
    await materialize(sourcePath, join(nodeModulesRoot, entry.name));
  }
  return materialized.sort();
}
