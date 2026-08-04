import { mkdir, stat, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";

import { build, type Metafile } from "esbuild";

export const SERVER_DAEMON_ESBUILD_TARGET = "node24";
export const SERVER_DAEMON_CHUNK_NAMES = "[name]-[hash]";
export const SERVER_DEPLOY_HASH_PROBE_ENTRYPOINT = "deploy-hash-probe.mjs";
export const SERVER_DAEMON_EXTERNALS = [
  "better-sqlite3",
  "blake3-wasm",
  "fsevents",
  "node-pty",
] as const;
export const SERVER_DAEMON_ESM_REQUIRE_BANNER =
  'import { createRequire as __odCreateRequire } from "node:module"; const require = __odCreateRequire(import.meta.url);';

const FORBIDDEN_SERVER_DAEMON_INPUTS = [
  "/node_modules/better-sqlite3/",
  "/node_modules/blake3-wasm/",
  "/node_modules/electron/",
  "/node_modules/fsevents/",
  "/node_modules/next/",
  "/node_modules/node-pty/",
  "/node_modules/react/",
  "/node_modules/react-dom/",
] as const;

function toPosixPath(value: string): string {
  return value.replaceAll("\\", "/");
}

function relativeImportSpecifier(fromDirectory: string, targetPath: string): string {
  const value = toPosixPath(relative(fromDirectory, targetPath));
  return value.startsWith(".") ? value : `./${value}`;
}

export function renderServerDaemonEntrypoint(
  compiledCliSpecifier: string,
): string {
  return [
    'import { fileURLToPath } from "node:url";',
    "const selfPath = fileURLToPath(import.meta.url);",
    "process.env.OD_BIN ??= selfPath;",
    "process.env.OD_DAEMON_CLI_PATH ??= selfPath;",
    `await import(${JSON.stringify(compiledCliSpecifier)});`,
    "",
  ].join("\n");
}

export function renderServerDeployHashProbe(
  compiledDeploySpecifier: string,
): string {
  return [
    `import { cloudflarePagesAssetHash } from ${JSON.stringify(compiledDeploySpecifier)};`,
    "const digest = cloudflarePagesAssetHash({",
    '  file: "index.html",',
    '  data: Buffer.from("open-design-server-smoke", "utf8"),',
    "});",
    "if (!/^[0-9a-f]{32}$/.test(digest)) {",
    '  throw new Error(`unexpected deploy asset hash: ${digest}`);',
    "}",
    'process.stdout.write(`${digest}\\n`);',
    "",
  ].join("\n");
}

export function assertServerDaemonMetafile(
  metafile: Pick<Metafile, "inputs" | "outputs">,
): void {
  const forbidden = Object.keys(metafile.inputs)
    .map(toPosixPath)
    .filter((input) =>
      FORBIDDEN_SERVER_DAEMON_INPUTS.some((segment) => input.includes(segment)),
    );
  if (forbidden.length > 0) {
    throw new Error(
      `server daemon bundle included forbidden inputs: ${forbidden.join(", ")}`,
    );
  }
}

export async function bundleServerDaemon(options: {
  compiledCliPath: string;
  compiledDeployPath: string;
  deployHashEntrySourcePath: string;
  entrySourcePath: string;
  metafilePath: string;
  outdir: string;
  workspaceRoot: string;
}): Promise<{
  deployHashProbePath: string;
  entrypointPath: string;
  metafile: Metafile;
}> {
  const outdir = resolve(options.outdir);
  const entrySourcePath = resolve(options.entrySourcePath);
  const deployHashEntrySourcePath = resolve(options.deployHashEntrySourcePath);
  await mkdir(dirname(entrySourcePath), { recursive: true });
  await mkdir(dirname(deployHashEntrySourcePath), { recursive: true });
  await mkdir(outdir, { recursive: true });
  await writeFile(
    entrySourcePath,
    renderServerDaemonEntrypoint(
      relativeImportSpecifier(dirname(entrySourcePath), resolve(options.compiledCliPath)),
    ),
    "utf8",
  );
  await writeFile(
    deployHashEntrySourcePath,
    renderServerDeployHashProbe(
      relativeImportSpecifier(
        dirname(deployHashEntrySourcePath),
        resolve(options.compiledDeployPath),
      ),
    ),
    "utf8",
  );

  const result = await build({
    absWorkingDir: resolve(options.workspaceRoot),
    banner: { js: SERVER_DAEMON_ESM_REQUIRE_BANNER },
    bundle: true,
    chunkNames: SERVER_DAEMON_CHUNK_NAMES,
    entryNames: "[name]",
    entryPoints: {
      "daemon-cli": entrySourcePath,
      "deploy-hash-probe": deployHashEntrySourcePath,
    },
    external: [...SERVER_DAEMON_EXTERNALS],
    format: "esm",
    legalComments: "none",
    logLevel: "info",
    metafile: true,
    outExtension: { ".js": ".mjs" },
    outdir,
    platform: "node",
    splitting: true,
    target: SERVER_DAEMON_ESBUILD_TARGET,
  });
  assertServerDaemonMetafile(result.metafile);
  await writeFile(
    resolve(options.metafilePath),
    `${JSON.stringify(result.metafile, null, 2)}\n`,
    "utf8",
  );
  const entrypointPath = resolve(outdir, "daemon-cli.mjs");
  const deployHashProbePath = resolve(
    outdir,
    SERVER_DEPLOY_HASH_PROBE_ENTRYPOINT,
  );
  for (const path of [entrypointPath, deployHashProbePath]) {
    const metadata = await stat(path);
    if (!metadata.isFile()) {
      throw new Error(`server daemon bundle entrypoint is missing: ${path}`);
    }
  }
  return {
    deployHashProbePath,
    entrypointPath,
    metafile: result.metafile,
  };
}
