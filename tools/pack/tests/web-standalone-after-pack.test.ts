import { access, mkdir, mkdtemp, readFile, readlink, rm, symlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path, { join } from "node:path";

import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const runWebStandaloneAfterPack = require("../resources/web-standalone-after-pack.cjs") as (context: unknown) => Promise<void>;

const CONFIG_ENV = "OD_TOOLS_PACK_WEB_STANDALONE_HOOK_CONFIG";

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function writePackage(packageRoot: string, packageName: string): Promise<void> {
  await mkdir(packageRoot, { recursive: true });
  await writeFile(
    join(packageRoot, "package.json"),
    `${JSON.stringify({ name: packageName, version: "0.0.0" }, null, 2)}\n`,
    "utf8",
  );
  await writeFile(join(packageRoot, "index.js"), "module.exports = {};\n", "utf8");
}

async function writePnpmLinkedPackage(standaloneRoot: string, packageName: string): Promise<string> {
  const packageDirectoryName = `${packageName}@0.0.0`.split("/").join("+");
  const packageRoot = join(standaloneRoot, "node_modules", ".pnpm", packageDirectoryName, "node_modules", packageName);
  const hoistPath = join(standaloneRoot, "node_modules", ".pnpm", "node_modules", packageName);
  await writePackage(packageRoot, packageName);
  await mkdir(path.dirname(hoistPath), { recursive: true });
  await symlink(packageRoot, hoistPath);
  return packageRoot;
}

async function writeRootWebPackage(resourcesRoot: string): Promise<void> {
  const webPackageRoot = join(resourcesRoot, "app", "node_modules", "@open-design", "web");
  await mkdir(join(webPackageRoot, "dist", "sidecar"), { recursive: true });
  await writeFile(join(webPackageRoot, "package.json"), "{\"name\":\"@open-design/web\"}\n", "utf8");
  await writeFile(join(webPackageRoot, "dist", "sidecar", "index.js"), "module.exports = {};\n", "utf8");
}

async function writeStandaloneFixture(
  workspaceRoot: string,
  options: { includeHoistedNext: boolean; includeWebNext: boolean; useAbsolutePnpmSymlinks?: boolean },
): Promise<string> {
  const standaloneRoot = join(workspaceRoot, "apps", "web", ".next", "standalone");
  const sourceWebRoot = join(standaloneRoot, "apps", "web");
  const hoistRoot = join(standaloneRoot, "node_modules", ".pnpm", "node_modules");

  if (options.useAbsolutePnpmSymlinks) {
    const nextPackageRoot = options.includeHoistedNext ? await writePnpmLinkedPackage(standaloneRoot, "next") : null;
    await writePnpmLinkedPackage(standaloneRoot, "react");
    await writePnpmLinkedPackage(standaloneRoot, "react-dom");
    await writePnpmLinkedPackage(standaloneRoot, "styled-jsx");
    if (options.includeWebNext && nextPackageRoot != null) {
      await mkdir(join(sourceWebRoot, "node_modules"), { recursive: true });
      await symlink(nextPackageRoot, join(sourceWebRoot, "node_modules", "next"));
    }
  } else {
    if (options.includeHoistedNext) {
      await writePackage(join(hoistRoot, "next"), "next");
    }
    await writePackage(join(hoistRoot, "react"), "react");
    await writePackage(join(hoistRoot, "react-dom"), "react-dom");
    await writePackage(join(hoistRoot, "styled-jsx"), "styled-jsx");
    if (options.includeWebNext) {
      await writePackage(join(sourceWebRoot, "node_modules", "next"), "next");
    }
  }

  await mkdir(join(sourceWebRoot, ".next", "static"), { recursive: true });
  await writeFile(join(sourceWebRoot, "server.js"), "module.exports = {};\n", "utf8");
  await writeFile(join(sourceWebRoot, ".next", "BUILD_ID"), "fixture\n", "utf8");

  await mkdir(join(workspaceRoot, "apps", "web", ".next", "static"), { recursive: true });
  await writeFile(join(workspaceRoot, "apps", "web", ".next", "static", "client.js"), "client();\n", "utf8");

  return standaloneRoot;
}

async function runFixture(options: {
  includeHoistedNext?: boolean;
  includeWebNext: boolean;
  platformName?: "darwin" | "win32";
  useAbsolutePnpmSymlinks?: boolean;
}): Promise<{
  appOutDir: string;
  auditReportPath: string;
  destinationRoot: string;
  root: string;
}> {
  const root = await mkdtemp(join(tmpdir(), "open-design-web-standalone-hook-"));
  const workspaceRoot = join(root, "workspace");
  const standaloneSourceRoot = await writeStandaloneFixture(workspaceRoot, {
    includeHoistedNext: options.includeHoistedNext ?? true,
    includeWebNext: options.includeWebNext,
    useAbsolutePnpmSymlinks: options.useAbsolutePnpmSymlinks,
  });
  const platformName = options.platformName ?? "win32";
  const appOutDir = join(root, "builder", platformName === "darwin" ? "mac-arm64" : "win-unpacked");
  const resourcesRoot = platformName === "darwin"
    ? join(appOutDir, "Open Design.app", "Contents", "Resources")
    : join(appOutDir, "resources");
  const auditReportPath = join(root, "audit.json");
  const configPath = join(root, "config.json");
  const oldConfigEnv = process.env[CONFIG_ENV];

  await mkdir(resourcesRoot, { recursive: true });
  await writeRootWebPackage(resourcesRoot);
  await writeFile(
    configPath,
    `${JSON.stringify(
      {
        auditReportPath,
        pruneCopiedSharp: false,
        pruneRootNext: false,
        pruneRootSharp: false,
        resourceName: "open-design-web-standalone",
        standaloneSourceRoot,
        version: 1,
        webPublicSourceRoot: join(workspaceRoot, "apps", "web", "public"),
        webStaticSourceRoot: join(workspaceRoot, "apps", "web", ".next", "static"),
        workspaceRoot,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  process.env[CONFIG_ENV] = configPath;
  try {
    await runWebStandaloneAfterPack({
      appOutDir,
      electronPlatformName: platformName,
      packager: { appInfo: { productFilename: "Open Design" } },
    });
  } catch (error) {
    await rm(root, { force: true, recursive: true });
    throw error;
  } finally {
    if (oldConfigEnv == null) {
      delete process.env[CONFIG_ENV];
    } else {
      process.env[CONFIG_ENV] = oldConfigEnv;
    }
  }

  return {
    appOutDir,
    auditReportPath,
    destinationRoot: join(resourcesRoot, "open-design-web-standalone"),
    root,
  };
}

describe("web standalone afterPack hook", () => {
  it("deduplicates win32 copied standalone Next while retaining the app-local Next package", async () => {
    const fixture = await runFixture({ includeWebNext: true });

    try {
      expect(await pathExists(join(fixture.destinationRoot, "node_modules", "next"))).toBe(false);
      expect(await pathExists(join(fixture.destinationRoot, "node_modules", ".pnpm", "node_modules", "next"))).toBe(false);
      expect(await pathExists(join(fixture.destinationRoot, "apps", "web", "node_modules", "next", "package.json"))).toBe(true);

      const report = JSON.parse(await readFile(fixture.auditReportPath, "utf8")) as {
        copiedAudit: { resolvedModules: Record<string, string>; brokenSymlinks: string[] };
        copiedNextDedupe: { removedPaths: Array<{ reason: string }>; retainedPath: string };
        copiedNextDedupeAudit: { resolvedNextPackagePath: string; remainingPaths: string[] };
      };
      const resolvedNextPath = report.copiedNextDedupeAudit.resolvedNextPackagePath.split(path.sep).join("/");

      expect(report.copiedNextDedupe.removedPaths.map((entry) => entry.reason)).toEqual([
        "copied standalone root next public-hoist duplicate",
        "copied standalone pnpm-hoisted next duplicate superseded by app-local next",
      ]);
      expect(report.copiedNextDedupe.retainedPath.split(path.sep).join("/")).toMatch(
        /apps\/web\/node_modules\/next$/,
      );
      expect(report.copiedNextDedupeAudit.remainingPaths).toEqual([]);
      expect(resolvedNextPath).toMatch(
        /open-design-web-standalone\/apps\/web\/node_modules\/next\/package\.json$/,
      );
      expect(report.copiedAudit.brokenSymlinks).toEqual([]);
      expect(report.copiedAudit.resolvedModules["next/package.json"].split(path.sep).join("/")).toMatch(
        /open-design-web-standalone\/apps\/web\/node_modules\/next\/package\.json$/,
      );
    } finally {
      await rm(fixture.root, { force: true, recursive: true });
    }
  });

  it("fails the win32 Next dedupe when no copied Next package exists", async () => {
    await expect(runFixture({ includeHoistedNext: false, includeWebNext: false })).rejects.toThrow(
      /copied standalone app-local Next package missing/,
    );
  });

  it("rewrites darwin copied pnpm symlinks to stay inside the packaged resource", async () => {
    const fixture = await runFixture({
      includeWebNext: true,
      platformName: "darwin",
      useAbsolutePnpmSymlinks: true,
    });

    try {
      const report = JSON.parse(await readFile(fixture.auditReportPath, "utf8")) as {
        copiedAudit: { externalSymlinks: string[]; resolvedModules: Record<string, string> };
      };
      const copiedNextLink = join(fixture.destinationRoot, "apps", "web", "node_modules", "next");
      const nextTarget = await readlink(copiedNextLink);

      expect(path.isAbsolute(nextTarget)).toBe(false);
      expect(report.copiedAudit.externalSymlinks).toEqual([]);
      expect(report.copiedAudit.resolvedModules["next/package.json"].split(path.sep).join("/")).toMatch(
        /open-design-web-standalone\/node_modules\/\.pnpm\/next@0\.0\.0\/node_modules\/next\/package\.json$/,
      );
    } finally {
      await rm(fixture.root, { force: true, recursive: true });
    }
  });
});
