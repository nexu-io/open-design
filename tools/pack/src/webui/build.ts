import { execFile } from "node:child_process";
import { chmod, cp, mkdir, readdir, rm, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { promisify } from "node:util";

import {
  assembleNodeApp,
  buildWorkspaceArtifacts,
  collectWorkspaceTarballs,
  copyResourceTree,
  readPackagedVersion,
} from "../assemble.js";
import { ToolPackCache } from "../cache.js";
import {
  resolveToolPackBuildOnlyConfig,
  type ToolPackArch,
  type ToolPackBuildOnlyConfig,
  type ToolPackCliOptions,
  type ToolPackPlatform,
} from "../config.js";
import { webuiResourcesRoot, winResources } from "../resources.js";
import { ensureWorkspaceBuildArtifacts } from "../workspace-build.js";

const execFileAsync = promisify(execFile);

export type WebuiArchiveKind = "zip" | "tar.gz";

// Linux distributions ship a gzipped tarball (preserves the executable bit on
// the launcher and is the native expectation for `tar xzf`); macOS and Windows
// ship a zip (the macOS `Open Design WebUI.command` and the Windows `.bat` are
// the user-facing entry points and zip is the platform-native archive there).
export function webuiArchiveKind(platform: ToolPackPlatform): WebuiArchiveKind {
  return platform === "linux" ? "tar.gz" : "zip";
}

export function webuiArchiveName(input: {
  platform: ToolPackPlatform;
  arch: ToolPackArch;
  version: string;
}): string {
  const ext = webuiArchiveKind(input.platform);
  return `open-design-webui-${input.version}-${input.platform}-${input.arch}.${ext}`;
}

// Maps the tools-pack platform/arch identity onto the prebuild-install
// `--platform`/`--arch` (Node `process.platform`/`process.arch`) values used to
// fetch the matching better-sqlite3 N-API prebuild. WebUI requires the user's
// system Node 24, so better-sqlite3 is the only platform-specific binary.
export function prebuiltSqliteTarget(
  platform: ToolPackPlatform,
  arch: ToolPackArch,
): { platform: "darwin" | "linux" | "win32"; arch: ToolPackArch } {
  const map = { mac: "darwin", linux: "linux", win: "win32" } as const;
  return { platform: map[platform], arch };
}

export type WebuiBuildResult = {
  platform: ToolPackPlatform;
  arch: ToolPackArch;
  archivePath: string;
  stageRoot: string;
  /** @next/swc-* native compiler dirs (build-only, never loaded at runtime), removed before packaging. */
  prunedNativeModules: string[];
};

// Recursively finds every `@next/swc-*` directory under a node_modules tree.
// npm's flat install puts the host's binary at `node_modules/@next/swc-<host>`,
// but a nested copy can also appear under `node_modules/next/node_modules/@next`,
// so we descend through each package's own `node_modules`. The depth bound is a
// runaway guard; real install trees are far shallower than 8.
async function readDirEntries(dir: string) {
  try {
    return await readdir(dir, { withFileTypes: true });
  } catch {
    return []; // missing directory at this level
  }
}

async function findNextSwcDirs(nodeModulesDir: string, found: string[], depth = 0): Promise<void> {
  if (depth > 8) return;
  for (const entry of await readDirEntries(nodeModulesDir)) {
    if (!entry.isDirectory()) continue;
    if (entry.name === "@next") {
      const scope = join(nodeModulesDir, entry.name);
      for (const child of await readDirEntries(scope)) {
        if (child.isDirectory() && child.name.startsWith("swc-")) found.push(join(scope, child.name));
      }
    } else if (entry.name.startsWith("@")) {
      // scope dir (e.g. @open-design): recurse into each scoped package's node_modules
      const scope = join(nodeModulesDir, entry.name);
      for (const pkg of await readDirEntries(scope)) {
        if (pkg.isDirectory()) {
          await findNextSwcDirs(join(scope, pkg.name, "node_modules"), found, depth + 1);
        }
      }
    } else {
      await findNextSwcDirs(join(nodeModulesDir, entry.name, "node_modules"), found, depth + 1);
    }
  }
}

// Strips Next.js's build-time SWC native binary (~125MB) from the assembled
// WebUI app. SWC is only used by `next build`/`next dev`; the production
// `next start` server we ship never loads it — Next's own `standalone` output
// excludes it entirely, which is the proof this is safe. Returns the removed
// directories for build-log visibility. Never throws on an absent tree.
export async function pruneBuildOnlyNativeModules(appRoot: string): Promise<string[]> {
  const found: string[] = [];
  await findNextSwcDirs(join(appRoot, "node_modules"), found);
  for (const dir of found) {
    await rm(dir, { force: true, recursive: true });
  }
  return found;
}

// Ensures the assembled app carries the better-sqlite3 native binary for the
// *target* platform/arch.
//
// Native build (target === host): the production `npm install` already ran
// better-sqlite3's install script (`prebuild-install || node-gyp rebuild`),
// which fetched/compiled the matching binary for this host. Nothing to do —
// this is the path every CI matrix entry takes (each target builds on its own
// runner). Critically, this also avoids invoking the `.bin/prebuild-install`
// POSIX shim, which Windows `node` cannot execute directly.
//
// Cross build (host != target): explicitly fetch the target prebuild by running
// prebuild-install's JS entry through node (works regardless of host shell).
export async function installPrebuiltSqlite(
  appRoot: string,
  platform: ToolPackPlatform,
  arch: ToolPackArch,
): Promise<void> {
  const target = prebuiltSqliteTarget(platform, arch);
  if (target.platform === process.platform && target.arch === process.arch) {
    return;
  }
  const sqliteDir = join(appRoot, "node_modules", "better-sqlite3");
  const prebuildInstallJs = join(appRoot, "node_modules", "prebuild-install", "bin.js");
  try {
    await execFileAsync(
      process.execPath,
      [prebuildInstallJs, "--platform", target.platform, "--arch", target.arch, "--napi"],
      { cwd: sqliteDir },
    );
  } catch (error) {
    throw new Error(
      `failed to fetch better-sqlite3 prebuild for ${target.platform}/${target.arch}: ` +
        `${(error as Error).message}. There may be no prebuilt package for this os/arch.`,
    );
  }
}

// Compresses the staged WebUI distribution into the platform-native archive.
// Linux uses gzip-tar; Windows prefers the bundled 7-Zip (deterministic,
// dependency-free) and macOS uses the system `zip`.
export async function createWebuiArchive(
  stageRoot: string,
  archivePath: string,
  kind: WebuiArchiveKind,
  sevenZipExe: string | null,
): Promise<void> {
  await mkdir(dirname(archivePath), { recursive: true });
  await rm(archivePath, { force: true });
  if (kind === "tar.gz") {
    await execFileAsync("tar", ["-czf", archivePath, "-C", stageRoot, "."]);
  } else if (sevenZipExe != null) {
    await execFileAsync(sevenZipExe, ["a", "-tzip", "-mx=5", archivePath, "./*"], { cwd: stageRoot });
  } else {
    await execFileAsync("zip", ["-r", "-q", archivePath, "."], { cwd: stageRoot });
  }
  await stat(archivePath);
}

// Stages the launcher scripts, wrappers, config example, and README into the
// archive root, setting the executable bit on every user-invoked entry. The
// Linux `.desktop` entry is tracked 100644 but MUST be executable: many file
// managers refuse to launch a non-executable desktop entry, which would break
// the double-click contract documented in the WebUI README. `resourcesRoot` is
// injectable for tests.
export async function stageWebuiLauncherResources(
  stageRoot: string,
  platform: ToolPackPlatform,
  resourcesRoot: string = webuiResourcesRoot,
): Promise<void> {
  for (const name of ["open-design.sh", "open-design.cmd", "webui.config.example.json", "README.md"]) {
    await cp(join(resourcesRoot, name), join(stageRoot, name));
  }
  await chmod(join(stageRoot, "open-design.sh"), 0o755);
  if (platform === "mac") {
    await cp(join(resourcesRoot, "launch-mac.command"), join(stageRoot, "Open Design WebUI.command"));
    await chmod(join(stageRoot, "Open Design WebUI.command"), 0o755);
  } else if (platform === "win") {
    await cp(join(resourcesRoot, "launch-win.bat"), join(stageRoot, "Open Design WebUI.bat"));
  } else {
    const desktopEntry = join(stageRoot, "open-design-webui.desktop");
    await cp(join(resourcesRoot, "open-design-webui.desktop"), desktopEntry);
    await chmod(desktopEntry, 0o755);
  }
}

export function resolveWebuiPackConfig(
  platform: ToolPackPlatform,
  options: ToolPackCliOptions = {},
): ToolPackBuildOnlyConfig {
  // WebUI is a build-only archive lane. It reuses the shared workspace/node-app
  // assembly primitives but deliberately avoids Electron builder, installer
  // identity, signing, and updater config.
  return resolveToolPackBuildOnlyConfig(platform, options, { webOutputMode: "server" });
}

export async function buildPackedWebui(config: ToolPackBuildOnlyConfig): Promise<WebuiBuildResult> {
  const platform = config.platform;
  const arch = config.arch;
  const version = await readPackagedVersion(config);

  // 1) ensure workspace build artifacts (web server-mode + daemon dist + packaged
  //    dist) via the shared builder, routed through the cached
  //    ensureWorkspaceBuildArtifacts path the mac/win lanes use.
  const cache = new ToolPackCache(config.roots.cacheRoot);
  await ensureWorkspaceBuildArtifacts(config, cache, async () => {
    await buildWorkspaceArtifacts(config);
  });

  const baseDir = join(config.roots.output.namespaceRoot, "webui", `${platform}-${arch}`);
  const stageRoot = join(baseDir, "stage");
  const appRoot = join(stageRoot, "app");
  const resourceRoot = join(appRoot, "resources", "open-design");
  const tarballsRoot = join(baseDir, "tarballs");
  await rm(stageRoot, { force: true, recursive: true });
  await mkdir(appRoot, { recursive: true });

  // 2) assemble node app + production install
  const packed = await collectWorkspaceTarballs(config, tarballsRoot);
  await assembleNodeApp({ config, appRoot, tarballsRoot, packed });

  // 3) bundled resources WITHOUT bundling node (webui requires system node)
  await copyResourceTree(config, resourceRoot, { includeNodeBinary: false });

  // 4) target-platform better-sqlite3 prebuild
  await installPrebuiltSqlite(appRoot, platform, arch);

  // 4b) strip the build-only @next/swc native compiler (~125MB). server-mode
  //     `next start` never loads it; this is the bulk of the WebUI bundle size.
  const prunedNativeModules = await pruneBuildOnlyNativeModules(appRoot);

  // 5) copy webui launcher scripts / wrappers / config example / README
  await stageWebuiLauncherResources(stageRoot, platform);

  // 6) archive
  const kind = webuiArchiveKind(platform);
  const archivePath = join(config.roots.output.platformRoot, webuiArchiveName({ platform, arch, version }));
  const sevenZip = platform === "win" ? winResources.sevenZipExe : null;
  await createWebuiArchive(stageRoot, archivePath, kind, sevenZip);

  return { platform, arch, archivePath, stageRoot, prunedNativeModules };
}
