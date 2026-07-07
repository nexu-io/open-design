import { existsSync, readFileSync } from "node:fs";
import { chmod, cp, mkdir } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);

function resolveToolsPackRoot(startDir: string): string {
  const maxDepth = 6;
  let current = startDir;

  for (let depth = 0; depth < maxDepth; depth += 1) {
    try {
      const raw = readFileSync(join(current, "package.json"), "utf8");
      const parsed = JSON.parse(raw) as { name?: unknown };
      if (parsed.name === "@open-design/tools-pack") {
        return current;
      }
    } catch {
      // Keep walking until we find the tools-pack package root.
    }

    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }

  throw new Error(`tools-pack: unable to resolve package root from ${startDir}`);
}

export const toolsPackRoot = resolveToolsPackRoot(dirname(fileURLToPath(import.meta.url)));
export const resourcesRoot = join(toolsPackRoot, "resources");

export const macResources = {
  entitlements: join(resourcesRoot, "mac", "entitlements.mac.plist"),
  entitlementsInherit: join(resourcesRoot, "mac", "entitlements.mac.inherit.plist"),
  icon: join(resourcesRoot, "mac", "icon.icns"),
  iconPng: join(resourcesRoot, "mac", "icon.png"),
  notarizeHook: join(resourcesRoot, "mac", "notarize.cjs"),
  webStandaloneAfterPackHook: join(resourcesRoot, "web-standalone-after-pack.cjs"),
} as const;

export const winResources = {
  icon: join(resourcesRoot, "win", "icon.ico"),
  sevenZipDll: join(resourcesRoot, "win", "7zip", "7z.dll"),
  sevenZipExe: join(resourcesRoot, "win", "7zip", "7z.exe"),
  webStandaloneAfterPackHook: join(resourcesRoot, "web-standalone-after-pack.cjs"),
} as const;

export const linuxResources = {
  icon: join(resourcesRoot, "linux", "icon.png"),
  desktopTemplate: join(resourcesRoot, "linux", "open-design.desktop.template"),
} as const;

const BUNDLED_RESOURCE_TREES = [
  { from: "skills", to: "skills" },
  // After the skills/design-templates split (specs/current/skills-and-design-templates.md)
  // the rendering catalogue lives under its own root and the daemon
  // resolves it via DESIGN_TEMPLATES_DIR. Bundle it like any other
  // first-class resource so packaged builds carry the full template set.
  { from: "design-templates", to: "design-templates" },
  { from: "design-systems", to: "design-systems" },
  { from: "craft", to: "craft" },
  { from: join("plugins", "_official"), to: join("plugins", "_official") },
  { from: join("plugins", "registry"), to: join("plugins", "registry") },
  { from: join("assets", "frames"), to: "frames" },
  { from: join("assets", "community-pets"), to: "community-pets" },
  { from: "prompt-templates", to: "prompt-templates" },
  // Baked plugin-preview manifest. The gallery's pre-rendered hover-pan clips
  // live on R2; the daemon needs this checked-in manifest to map each plugin to
  // its clip (it serves clips from R2 when the files aren't on disk, which is the
  // packaged case). Without it the packaged daemon reads an empty manifest and the
  // gallery falls back to live, GPU-expensive iframes instead of the baked clips.
  { from: join("data", "plugin-previews"), to: join("data", "plugin-previews") },
] as const;

export async function copyBundledResourceTrees({
  workspaceRoot,
  resourceRoot,
}: {
  workspaceRoot: string;
  resourceRoot: string;
}): Promise<void> {
  for (const entry of BUNDLED_RESOURCE_TREES) {
    await cp(join(workspaceRoot, entry.from), join(resourceRoot, entry.to), {
      recursive: true,
    });
  }
}

const OD_TEAM_PACKAGE_DIR = join("packages", "multi-agent-team");

function odTeamBinaryName(platform: "linux" | "mac" | "win"): string {
  return platform === "win" ? "odteam.exe" : "odteam";
}

function odTeamBinaryPath(workspaceRoot: string, platform: "linux" | "mac" | "win"): string {
  return join(workspaceRoot, OD_TEAM_PACKAGE_DIR, "cmd", "odteam", odTeamBinaryName(platform));
}

function goTargetEnv(platform: "linux" | "mac" | "win"): Record<string, string> {
  switch (platform) {
    case "win":
      return { GOOS: "windows", GOARCH: "amd64", CGO_ENABLED: "0" };
    case "linux":
      return { GOOS: "linux", GOARCH: process.arch === "arm64" ? "arm64" : "amd64", CGO_ENABLED: "0" };
    case "mac":
      return { GOOS: "darwin", GOARCH: process.arch === "arm64" ? "arm64" : "amd64" };
  }
}

/**
 * Compile the odteam Go binary for the target platform using the Go toolchain
 * on the host. Cross-compilation is used for win (from mac/linux) and linux
 * (from mac) via GOOS/GOARCH env vars.
 *
 * If the `go` binary is not on PATH but the pre-built binary already exists
 * (e.g. compiled on the host before a containerized Linux build), the
 * existing binary path is returned without recompiling.
 *
 * Throws if Go is not available AND the binary does not already exist, so
 * packaging never silently produces a resource tree without odteam.
 */
export async function buildOdTeamBinary({
  platform,
  workspaceRoot,
}: {
  platform: "linux" | "mac" | "win";
  workspaceRoot: string;
}): Promise<string> {
  const binName = odTeamBinaryName(platform);
  const outputDir = join(workspaceRoot, OD_TEAM_PACKAGE_DIR, "cmd", "odteam");
  const outputPath = join(outputDir, binName);

  // If the binary already exists (e.g. pre-built on the host before a
  // containerized build), skip recompilation. This covers the container case
  // where Go is not installed inside electronuserland/builder:base.
  if (existsSync(outputPath)) {
    return outputPath;
  }

  const goEnv = goTargetEnv(platform);
  await mkdir(outputDir, { recursive: true });
  const { stdout, stderr } = await execFileAsync("go", [
    "build",
    "-o",
    outputPath,
    "./cmd/odteam/",
  ], {
    cwd: join(workspaceRoot, OD_TEAM_PACKAGE_DIR),
    env: { ...process.env, ...goEnv },
  });
  if (stdout.length > 0) process.stderr.write(`[tools-pack] odteam build stdout: ${stdout}\n`);
  if (stderr.length > 0) process.stderr.write(`[tools-pack] odteam build stderr: ${stderr}\n`);
  if (!existsSync(outputPath)) {
    throw new Error(`go build completed but odteam binary not found at ${outputPath}`);
  }
  if (platform !== "win") {
    await chmod(outputPath, 0o755);
  }
  return outputPath;
}

/**
 * Hash the odteam Go source tree so resource-tree cache keys invalidate when
 * the Go code changes. Hashes .go files, go.mod, and go.sum under
 * packages/multi-agent-team.
 */
export async function hashOdTeamSource(workspaceRoot: string): Promise<string> {
  const { hashPath } = await import("./cache.js");
  const sourceDir = join(workspaceRoot, OD_TEAM_PACKAGE_DIR);
  const goModHash = await hashPath(join(sourceDir, "go.mod")).catch(() => "missing");
  const goSumHash = await hashPath(join(sourceDir, "go.sum")).catch(() => "missing");
  const cmdHash = await hashPath(join(sourceDir, "cmd")).catch(() => "missing");
  const internalHash = await hashPath(join(sourceDir, "internal")).catch(() => "missing");
  const pkgHash = await hashPath(join(sourceDir, "pkg")).catch(() => "missing");
  return createHash("sha256")
    .update(`${goModHash}:${goSumHash}:${cmdHash}:${internalHash}:${pkgHash}`)
    .digest("hex");
}

/**
 * Copy the pre-built odteam binary from the monorepo into the packaged
 * resource tree so it is available at runtime under DAEMON_RESOURCE_ROOT/bin/.
 *
 * When `requireBundled` is true (the default for packaged builds), a missing
 * binary throws instead of returning null — packaging must not silently
 * produce a tree without odteam, or users get AGENT_UNAVAILABLE at runtime.
 * Call `buildOdTeamBinary` first to compile the binary for the target platform.
 */
export async function copyBundledOdTeamBinary({
  platform,
  resourceRoot,
  workspaceRoot,
  requireBundled = false,
}: {
  platform: "linux" | "mac" | "win";
  resourceRoot: string;
  workspaceRoot: string;
  requireBundled?: boolean;
}): Promise<string | null> {
  const binName = odTeamBinaryName(platform);
  const source = odTeamBinaryPath(workspaceRoot, platform);
  if (!existsSync(source)) {
    if (requireBundled) {
      throw new Error(
        `odteam binary not found at ${source}. Run buildOdTeamBinary first or install Go and run "make build" in packages/multi-agent-team.`,
      );
    }
    return null;
  }
  const target = join(resourceRoot, "bin", binName);
  await cp(source, target);
  if (platform !== "win") {
    await chmod(target, 0o755);
  }
  return target;
}
