import { access, chmod, copyFile, link, mkdir, mkdtemp, readFile, readlink, rm, symlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path, { join } from "node:path";

import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const runWebStandaloneAfterPack = require("../resources/web-standalone-after-pack.cjs") as (context: unknown) => Promise<void>;

const CONFIG_ENV = "OD_TOOLS_PACK_WEB_STANDALONE_HOOK_CONFIG";
const darwinSymlinkIt = process.platform === "win32" ? it.skip : it;

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

async function writeEsmPackage(packageRoot: string, packageName: string, source: string): Promise<void> {
  await mkdir(packageRoot, { recursive: true });
  await writeFile(
    join(packageRoot, "package.json"),
    `${JSON.stringify({ exports: "./index.js", name: packageName, type: "module", version: "0.0.0" }, null, 2)}\n`,
    "utf8",
  );
  await writeFile(join(packageRoot, "index.js"), source, "utf8");
}

async function writeHyperframesRuntimeFixture(options: {
  omitPackage?: string;
  platformName: "darwin" | "win32";
  resourcesRoot: string;
  runtimeSourceRoot: string;
}): Promise<void> {
  const arch = options.platformName === "win32" ? "x64" : process.arch;
  const platform = options.platformName === "darwin" ? "darwin" : "win32";
  const nativePackage = `@img/sharp-${platform}-${arch}`;
  const libvipsPackage = options.platformName === "darwin"
    ? `@img/sharp-libvips-${platform}-${arch}`
    : null;
  const packages = ["@img/colour", nativePackage, ...(libvipsPackage == null ? [] : [libvipsPackage])];
  const sourceNodeModulesRoot = join(options.runtimeSourceRoot, "node_modules");

  for (const packageName of packages) {
    if (packageName === options.omitPackage) continue;
    await writeEsmPackage(
      join(sourceNodeModulesRoot, ...packageName.split("/")),
      packageName,
      `export default ${JSON.stringify(packageName)};\n`,
    );
  }
  if (options.omitPackage !== "sharp") {
    await writeEsmPackage(
      join(sourceNodeModulesRoot, "sharp"),
      "sharp",
      [
        'import colour from "@img/colour";',
        `import native from ${JSON.stringify(nativePackage)};`,
        ...(libvipsPackage == null
          ? ["export default { colour, native };"]
          : [
              `import libvips from ${JSON.stringify(libvipsPackage)};`,
              "export default { colour, native, libvips };",
            ]),
        "",
      ].join("\n"),
    );
  }

  const hyperframesRoot = join(options.resourcesRoot, "app", "node_modules", "hyperframes");
  await mkdir(join(hyperframesRoot, "dist"), { recursive: true });
  await writeFile(
    join(hyperframesRoot, "package.json"),
    `${JSON.stringify({ name: "hyperframes", type: "module", version: "0.8.1" }, null, 2)}\n`,
    "utf8",
  );
  await writeFile(
    join(hyperframesRoot, "dist", "cli.js"),
    [
      'import sharp from "sharp";',
      'if (sharp == null) throw new Error("sharp failed to load");',
      'console.log("hyperframes 0.8.1");',
      "",
    ].join("\n"),
    "utf8",
  );

  const appPath = options.platformName === "darwin"
    ? path.dirname(path.dirname(options.resourcesRoot))
    : path.dirname(options.resourcesRoot);
  const bundledNodePath = options.platformName === "win32"
    ? join(appPath, "Open Design.exe")
    : join(appPath, "Contents", "MacOS", "Open Design");
  await mkdir(path.dirname(bundledNodePath), { recursive: true });
  if (process.platform !== "win32") {
    const quotedNodePath = process.execPath.replaceAll("'", "'\\''");
    await writeFile(bundledNodePath, `#!/bin/sh\nexec '${quotedNodePath}' "$@"\n`, "utf8");
    await chmod(bundledNodePath, 0o755);
    return;
  }
  try {
    await link(process.execPath, bundledNodePath);
  } catch {
    await copyFile(process.execPath, bundledNodePath);
    // A successful hard link may share a CI-owned inode that the test user cannot chmod.
    await chmod(bundledNodePath, 0o755);
  }
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
  macAdhocBundleSign?: boolean;
  omitHyperframesRuntimePackage?: string;
  omitMacAdhocBundleSign?: boolean;
  omitRootWebPackage?: boolean;
  platformName?: "darwin" | "win32";
  requireRootWebPackageAudit?: boolean;
  useAbsolutePnpmSymlinks?: boolean;
  writeMacCodeBundleFixture?: boolean;
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
  const appPath = join(appOutDir, "Open Design.app");
  const auditReportPath = join(root, "audit.json");
  const configPath = join(root, "config.json");
  const hyperframesRuntimeSourceRoot = join(workspaceRoot, "assembled", "app");
  const oldConfigEnv = process.env[CONFIG_ENV];

  await mkdir(resourcesRoot, { recursive: true });
  if (platformName === "darwin" && options.writeMacCodeBundleFixture) {
    const frameworksRoot = join(appPath, "Contents", "Frameworks");
    const electronFrameworkRoot = join(frameworksRoot, "Electron Framework.framework");
    await mkdir(join(electronFrameworkRoot, "Resources"), { recursive: true });
    await mkdir(join(electronFrameworkRoot, "Versions", "A", "Resources"), { recursive: true });
    await mkdir(join(electronFrameworkRoot, "Versions", "A", "Helpers"), { recursive: true });
    await mkdir(join(electronFrameworkRoot, "Versions", "Current", "Resources"), { recursive: true });
    await writeFile(join(electronFrameworkRoot, "Electron Framework"), "binary\n", "utf8");
    await writeFile(join(electronFrameworkRoot, "Versions", "A", "Electron Framework"), "binary\n", "utf8");
    await writeFile(join(electronFrameworkRoot, "Versions", "A", "Helpers", "chrome_crashpad_handler"), "binary\n", "utf8");
    await writeFile(join(electronFrameworkRoot, "Versions", "Current", "Electron Framework"), "binary\n", "utf8");
    await mkdir(join(frameworksRoot, "ReactiveObjC.framework"), { recursive: true });
    await mkdir(join(frameworksRoot, "Open Design Helper.app"), { recursive: true });
  }
  if (options.omitRootWebPackage !== true) {
    await writeRootWebPackage(resourcesRoot);
  }
  await writeHyperframesRuntimeFixture({
    omitPackage: options.omitHyperframesRuntimePackage,
    platformName,
    resourcesRoot,
    runtimeSourceRoot: hyperframesRuntimeSourceRoot,
  });
  await writeFile(
    configPath,
    `${JSON.stringify(
      {
        auditReportPath,
        hyperframesRuntimeSourceRoot,
        ...(options.omitMacAdhocBundleSign ? {} : { macAdhocBundleSign: options.macAdhocBundleSign ?? false }),
        pruneCopiedSharp: false,
        pruneRootNext: false,
        pruneRootSharp: true,
        ...(options.requireRootWebPackageAudit == null
          ? {}
          : { requireRootWebPackageAudit: options.requireRootWebPackageAudit }),
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
  it("restores HyperFrames' native sharp closure and executes its CLI from the final payload", async () => {
    const fixture = await runFixture({ includeWebNext: true });

    try {
      const report = JSON.parse(await readFile(fixture.auditReportPath, "utf8")) as {
        hyperframesCliSmoke: { cliPath: string; nodePath: string; stdout: string };
        hyperframesRuntimeCopies: Array<{ bytes: number; packageName: string }>;
      };
      expect(report.hyperframesRuntimeCopies.map((entry) => entry.packageName)).toEqual([
        "sharp",
        "@img/colour",
        "@img/sharp-win32-x64",
      ]);
      expect(report.hyperframesRuntimeCopies.every((entry) => entry.bytes > 0)).toBe(true);
      expect(report.hyperframesCliSmoke.stdout).toBe("hyperframes 0.8.1");
      expect(report.hyperframesCliSmoke.cliPath.split(path.sep).join("/")).toMatch(
        /resources\/app\/node_modules\/hyperframes\/dist\/cli\.js$/,
      );
      expect(report.hyperframesCliSmoke.nodePath.split(path.sep).join("/")).toMatch(
        /win-unpacked\/Open Design\.exe$/,
      );
    } finally {
      await rm(fixture.root, { force: true, recursive: true });
    }
  });

  it("fails packaging when HyperFrames' target native sharp payload is absent", async () => {
    await expect(runFixture({
      includeWebNext: true,
      omitHyperframesRuntimePackage: "@img/sharp-win32-x64",
    })).rejects.toThrow(/required source missing.*sharp-win32-x64/);
  });

  it("rejects unsupported packaging platforms", async () => {
    await expect(runWebStandaloneAfterPack({
      appOutDir: "/tmp/open-design-linux",
      electronPlatformName: "linux",
      packager: { appInfo: { productFilename: "Open Design" } },
    })).rejects.toThrow(/unsupported platform: linux/);
  });

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

  it("defaults the mac ad-hoc signing hook option off for win32 configs", async () => {
    const fixture = await runFixture({ includeWebNext: true, omitMacAdhocBundleSign: true });

    try {
      const report = JSON.parse(await readFile(fixture.auditReportPath, "utf8")) as {
        macAdhocBundleSign: unknown[];
        platformName: string;
      };

      expect(report.platformName).toBe("win32");
      expect(report.macAdhocBundleSign).toEqual([]);
    } finally {
      await rm(fixture.root, { force: true, recursive: true });
    }
  });

  it("allows win32 prebundle mode to omit the root web package audit", async () => {
    const fixture = await runFixture({
      includeWebNext: true,
      omitRootWebPackage: true,
      requireRootWebPackageAudit: false,
    });

    try {
      const report = JSON.parse(await readFile(fixture.auditReportPath, "utf8")) as {
        rootWebPackageAudit: unknown;
      };

      expect(report.rootWebPackageAudit).toBeNull();
    } finally {
      await rm(fixture.root, { force: true, recursive: true });
    }
  });

  darwinSymlinkIt("rewrites darwin copied pnpm symlinks to stay inside the packaged resource", async () => {
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

  darwinSymlinkIt("signs versioned mac frameworks at their Current version path", async () => {
    const codesignRoot = await mkdtemp(join(tmpdir(), "open-design-fake-codesign-"));
    const codesignBin = join(codesignRoot, "bin");
    const codesignLog = join(codesignRoot, "codesign.log");
    const oldPath = process.env.PATH;
    const oldCodesignLog = process.env.OD_FAKE_CODESIGN_LOG;

    await mkdir(codesignBin, { recursive: true });
    await writeFile(
      join(codesignBin, "codesign"),
      "#!/bin/sh\nprintf '%s\\n' \"$*\" >> \"$OD_FAKE_CODESIGN_LOG\"\n",
      "utf8",
    );
    await chmod(join(codesignBin, "codesign"), 0o755);

    process.env.PATH = `${codesignBin}${path.delimiter}${oldPath ?? ""}`;
    process.env.OD_FAKE_CODESIGN_LOG = codesignLog;

    let fixture: Awaited<ReturnType<typeof runFixture>> | null = null;
    try {
      fixture = await runFixture({
        includeWebNext: true,
        macAdhocBundleSign: true,
        platformName: "darwin",
        writeMacCodeBundleFixture: true,
      });

      const report = JSON.parse(await readFile(fixture.auditReportPath, "utf8")) as {
        macAdhocBundleSign: string[];
      };
      const signedTargets = report.macAdhocBundleSign.map((target) => target.split(path.sep).join("/"));
      const codesignInvocations = await readFile(codesignLog, "utf8");

      expect(signedTargets).toEqual(
        expect.arrayContaining([
          expect.stringMatching(/Electron Framework\.framework\/Versions\/Current$/),
          expect.stringMatching(/ReactiveObjC\.framework$/),
          expect.stringMatching(/Open Design Helper\.app$/),
          expect.stringMatching(/Open Design\.app$/),
        ]),
      );
      expect(signedTargets).not.toContainEqual(expect.stringMatching(/Electron Framework\.framework$/));
      await expect(
        readlink(join(
          fixture.appOutDir,
          "Open Design.app",
          "Contents",
          "Frameworks",
          "Electron Framework.framework",
          "Versions",
          "Current",
        )),
      ).resolves.toBe("A");
      await expect(
        readlink(join(
          fixture.appOutDir,
          "Open Design.app",
          "Contents",
          "Frameworks",
          "Electron Framework.framework",
          "Electron Framework",
        )),
      ).resolves.toBe("Versions/Current/Electron Framework");
      await expect(
        readlink(join(
          fixture.appOutDir,
          "Open Design.app",
          "Contents",
          "Frameworks",
          "Electron Framework.framework",
          "Resources",
        )),
      ).resolves.toBe("Versions/Current/Resources");
      expect(codesignInvocations.split(path.sep).join("/")).toContain(
        "Electron Framework.framework/Versions/Current",
      );
      expect(codesignInvocations.split(/\r?\n/).some((line) => {
        const normalized = line.split(path.sep).join("/");
        return normalized.includes("--deep") && normalized.includes("Electron Framework.framework/Versions/Current");
      })).toBe(true);
    } finally {
      if (fixture != null) {
        await rm(fixture.root, { force: true, recursive: true });
      }
      await rm(codesignRoot, { force: true, recursive: true });
      if (oldPath == null) {
        delete process.env.PATH;
      } else {
        process.env.PATH = oldPath;
      }
      if (oldCodesignLog == null) {
        delete process.env.OD_FAKE_CODESIGN_LOG;
      } else {
        process.env.OD_FAKE_CODESIGN_LOG = oldCodesignLog;
      }
    }
  });
});
