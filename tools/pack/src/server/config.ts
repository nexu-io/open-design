import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

function resolveDefaultWorkspaceRoot(): string {
  let current = dirname(fileURLToPath(import.meta.url));
  while (true) {
    if (existsSync(join(current, "pnpm-workspace.yaml"))) return current;
    const parent = dirname(current);
    if (parent === current) {
      throw new Error(
        `tools-pack: unable to resolve workspace root from ${fileURLToPath(import.meta.url)}`,
      );
    }
    current = parent;
  }
}

export const SERVER_PLATFORMS = ["darwin", "linux", "win32"] as const;
export const SERVER_ARCHES = ["arm64", "x64"] as const;

export type ServerPlatform = (typeof SERVER_PLATFORMS)[number];
export type ServerArch = (typeof SERVER_ARCHES)[number];
export type ServerTarget = {
  arch: ServerArch;
  platform: ServerPlatform;
};

export type ServerPackCliOptions = {
  appVersion?: string;
  arch?: string;
  archive?: string;
  archivesDir?: string;
  dir?: string;
  feedDir?: string;
  json?: boolean;
  platform?: string;
  releaseId?: string;
  skipWorkspaceBuild?: boolean;
  updateLatest?: boolean;
};

export type ServerPackConfig = {
  appVersion: string;
  archivePath: string;
  installerRoot: string;
  manifestPath: string;
  outputRoot: string;
  releaseId: string;
  releaseRoot: string;
  reportPath: string;
  sha256Path: string;
  sha256SumsPath: string;
  stageRoot: string;
  target: ServerTarget;
  toolPackRoot: string;
  topLevelName: string;
  topLevelRoot: string;
  workspaceRoot: string;
};

function cleanVersion(value: string, label: string): string {
  const normalized = value.trim().replace(/^v(?=\d)/, "");
  if (
    !/^[A-Za-z0-9][A-Za-z0-9._+-]*$/.test(normalized) ||
    normalized.includes("..")
  ) {
    throw new Error(`${label} must be a non-empty path-safe value`);
  }
  return normalized;
}

function cleanReleaseId(value: string): string {
  const normalized = value.trim();
  if (
    !/^[A-Za-z0-9][A-Za-z0-9._+-]*$/.test(normalized) ||
    normalized.includes("..")
  ) {
    throw new Error(`--release-id must be one safe path segment: ${value}`);
  }
  return normalized;
}

function readWorkspaceVersion(workspaceRoot: string): string {
  const manifest = JSON.parse(readFileSync(join(workspaceRoot, "package.json"), "utf8")) as {
    version?: unknown;
  };
  if (typeof manifest.version !== "string") {
    throw new Error(`workspace package.json is missing version: ${workspaceRoot}`);
  }
  return cleanVersion(manifest.version, "workspace version");
}

function gitShortSha(workspaceRoot: string): string | null {
  try {
    const value = execFileSync("git", ["rev-parse", "--short=12", "HEAD"], {
      cwd: workspaceRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return /^[0-9a-f]+$/i.test(value) ? value : null;
  } catch {
    return null;
  }
}

export function normalizeServerPlatform(value: string): ServerPlatform {
  const normalized = value.trim().toLowerCase();
  if (normalized === "mac" || normalized === "macos") return "darwin";
  if (normalized === "win" || normalized === "windows") return "win32";
  if (SERVER_PLATFORMS.includes(normalized as ServerPlatform)) return normalized as ServerPlatform;
  throw new Error(`unsupported server platform: ${value}`);
}

export function normalizeServerArch(value: string): ServerArch {
  const normalized = value.trim().toLowerCase();
  if (normalized === "amd64" || normalized === "x86_64") return "x64";
  if (normalized === "aarch64") return "arm64";
  if (SERVER_ARCHES.includes(normalized as ServerArch)) return normalized as ServerArch;
  throw new Error(`unsupported server architecture: ${value}`);
}

export function hostServerTarget(
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch,
): ServerTarget {
  return {
    arch: normalizeServerArch(arch),
    platform: normalizeServerPlatform(platform),
  };
}

export function assertNativeServerTarget(
  target: ServerTarget,
  host: ServerTarget = hostServerTarget(),
): void {
  if (target.platform === host.platform && target.arch === host.arch) return;
  throw new Error(
    `server package ${target.platform}-${target.arch} must run on a native ` +
      `${target.platform}-${target.arch} host (current host: ${host.platform}-${host.arch})`,
  );
}

export function resolveServerPackConfig(
  options: ServerPackCliOptions & { workspaceRoot?: string } = {},
): ServerPackConfig {
  const workspaceRoot = resolve(
    options.workspaceRoot ?? resolveDefaultWorkspaceRoot(),
  );
  const target = {
    arch: normalizeServerArch(options.arch ?? process.arch),
    platform: normalizeServerPlatform(options.platform ?? process.platform),
  } satisfies ServerTarget;
  const appVersion = cleanVersion(
    options.appVersion ?? readWorkspaceVersion(workspaceRoot),
    "--app-version",
  );
  const shortSha = gitShortSha(workspaceRoot);
  const releaseId = cleanReleaseId(
    options.releaseId ?? (shortSha == null ? appVersion : `${appVersion}+${shortSha}`),
  );
  const toolPackRoot = resolve(options.dir ?? join(workspaceRoot, ".tmp", "tools-pack"));
  const targetName = `${target.platform}-${target.arch}`;
  const topLevelName = `open-design-server-${appVersion}-${targetName}`;
  const outputRoot = join(toolPackRoot, "out", "server", targetName);
  const stageRoot = join(outputRoot, "stage");
  const topLevelRoot = join(stageRoot, topLevelName);
  const releaseRoot = join(topLevelRoot, "releases", releaseId);
  const extension = target.platform === "win32" ? "zip" : "tar.gz";
  const archivePath = resolve(
    options.archive ?? join(outputRoot, `${topLevelName}.${extension}`),
  );

  return {
    appVersion,
    archivePath,
    installerRoot: join(topLevelRoot, "installer"),
    manifestPath: join(releaseRoot, "RELEASE.json"),
    outputRoot,
    releaseId,
    releaseRoot,
    reportPath: join(outputRoot, "smoke-report.json"),
    sha256Path: `${archivePath}.sha256`,
    // Single-target sums file that matches the hosted bootstrap feed entry
    // format install.sh / install.ps1 consume from v<version>/SHA256SUMS.
    sha256SumsPath: join(outputRoot, "SHA256SUMS"),
    stageRoot,
    target,
    toolPackRoot,
    topLevelName,
    topLevelRoot,
    workspaceRoot,
  };
}
