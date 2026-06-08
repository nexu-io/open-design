import { readFileSync } from "node:fs";
import { access, cp, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

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

const CHROMIUM_BUNDLE_ROOT_RE = /^chromium(?:_headless_shell)?-\d+$/i;
const HEADED_CHROMIUM_BUNDLE_ROOT_RE = /^chromium-\d+$/i;

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

export async function copyBundledPlaywrightChromium({
  resourceRoot,
  sourceExecutablePath,
  workspaceRoot,
}: {
  resourceRoot: string;
  sourceExecutablePath?: string;
  workspaceRoot: string;
}): Promise<{ sourceRoots: string[]; targetRoots: string[] }> {
  const { sourceRoots } = await resolveBundledPlaywrightChromiumSourceRoots({
    sourceExecutablePath,
    workspaceRoot,
  });
  const targetRoots: string[] = [];
  for (const sourceRoot of sourceRoots) {
    const targetRoot = join(resourceRoot, "ms-playwright", basename(sourceRoot));
    await mkdir(dirname(targetRoot), { recursive: true });
    await cp(sourceRoot, targetRoot, { recursive: true });
    targetRoots.push(targetRoot);
  }
  return { sourceRoots, targetRoots };
}

export function resolveDaemonPlaywrightChromiumExecutablePath(workspaceRoot: string): string {
  const daemonPackagePath = join(workspaceRoot, "apps", "daemon", "package.json");
  const requireFromDaemon = createRequire(daemonPackagePath);
  const playwrightModule = requireFromDaemon("playwright") as {
    chromium?: { executablePath?: () => string };
  };
  const executablePath = playwrightModule.chromium?.executablePath?.();
  if (!executablePath) {
    throw new Error("tools-pack: daemon Playwright Chromium executable path is unavailable");
  }
  return executablePath;
}

function resolveChromiumBundleRoot(executablePath: string): string {
  let current = dirname(executablePath);
  while (true) {
    const name = basename(current);
    if (CHROMIUM_BUNDLE_ROOT_RE.test(name)) return current;
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  throw new Error(`tools-pack: unable to locate Chromium bundle root for ${executablePath}`);
}

export async function resolveChromiumBundleRoots(executablePath: string): Promise<string[]> {
  const primaryRoot = resolveChromiumBundleRoot(executablePath);
  const match = basename(primaryRoot).match(/^chromium(?:_headless_shell)?-(\d+)$/i);
  if (!match) return [primaryRoot];
  const revision = match[1];
  const parent = dirname(primaryRoot);
  const roots = [primaryRoot];
  const optionalVariants = [
    join(parent, `chromium-${revision}`),
    join(parent, `chromium_headless_shell-${revision}`),
  ].filter((variantRoot) => variantRoot !== primaryRoot);
  for (const variantRoot of optionalVariants) {
    try {
      await access(variantRoot);
      roots.push(variantRoot);
    } catch {
      // Some Playwright installs ship only one Chromium variant. Keep
      // packaging the variant that actually backs chromium.launch().
    }
  }
  assertBundledChromiumRootsSupportChannelLaunch(roots, executablePath);
  return roots;
}

function assertBundledChromiumRootsSupportChannelLaunch(
  roots: readonly string[],
  executablePath: string,
): void {
  if (roots.some((root) => HEADED_CHROMIUM_BUNDLE_ROOT_RE.test(basename(root)))) return;
  throw new Error(
    `tools-pack: bundled Playwright Chromium for ${executablePath} is missing the chromium-* bundle required by channel: 'chromium'; reinstall Playwright without --only-shell or add the headed Chromium bundle`,
  );
}

export async function resolveBundledPlaywrightChromiumSourceRoots({
  sourceExecutablePath,
  workspaceRoot,
}: {
  sourceExecutablePath?: string;
  workspaceRoot: string;
}): Promise<{ executablePath: string; sourceRoots: string[] }> {
  const executablePath =
    sourceExecutablePath ?? resolveDaemonPlaywrightChromiumExecutablePath(workspaceRoot);
  await access(executablePath);
  const sourceRoots = await resolveChromiumBundleRoots(executablePath);
  return { executablePath, sourceRoots };
}
