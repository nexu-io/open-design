import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { createPackageManagerInvocation } from "@open-design/platform";

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

export const DSH_RUNTIME_RESOURCE_DIRECTORY = join("agent-runtimes", "deepseek-harness");

export type BundledDshRuntimeManifest = {
  file: string;
  packageName: "@open-design/dsh-runtime";
  schemaVersion: 1;
  sha256: string;
  version: string;
};

/**
 * Materializes the OD-owned DSH profile as a fixed, integrity-addressed
 * package inside the application resources. The user's official `dsh`
 * installation remains external; this tarball is only the thin bridge that
 * teaches it Open Design's versioned JSONL stdio protocol.
 */
export async function packBundledDshRuntime({
  workspaceRoot,
  resourceRoot,
}: {
  workspaceRoot: string;
  resourceRoot: string;
}): Promise<BundledDshRuntimeManifest> {
  const packageRoot = join(workspaceRoot, "packages", "dsh-runtime");
  const packageJson = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8")) as {
    name?: unknown;
    version?: unknown;
  };
  if (packageJson.name !== "@open-design/dsh-runtime" || typeof packageJson.version !== "string") {
    throw new Error("tools-pack: invalid @open-design/dsh-runtime package metadata");
  }

  const destination = join(resourceRoot, DSH_RUNTIME_RESOURCE_DIRECTORY);
  await rm(destination, { force: true, recursive: true });
  await mkdir(destination, { recursive: true });

  const invocation = createPackageManagerInvocation(
    ["-C", packageRoot, "pack", "--pack-destination", destination],
    process.env,
  );
  await execFileAsync(invocation.command, invocation.args, {
    cwd: workspaceRoot,
    env: process.env,
    windowsVerbatimArguments: invocation.windowsVerbatimArguments,
  });

  const tarballs = (await readdir(destination)).filter((entry) => entry.endsWith(".tgz"));
  if (tarballs.length !== 1 || tarballs[0] == null) {
    throw new Error(`tools-pack: expected one DSH runtime tarball, got ${tarballs.length}`);
  }
  const file = tarballs[0];
  const sha256 = createHash("sha256").update(await readFile(join(destination, file))).digest("hex");
  const manifest: BundledDshRuntimeManifest = {
    file,
    packageName: "@open-design/dsh-runtime",
    schemaVersion: 1,
    sha256,
    version: packageJson.version,
  };
  await writeFile(join(destination, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return manifest;
}
