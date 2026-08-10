import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  CLOSURE_DAEMON_EXTERNALS,
  CLOSURE_BUILD_SOURCE_PATHS,
  CLOSURE_ELECTRON_NATIVE_MODULES,
  CLOSURE_INTERNAL_PACKAGES,
  CLOSURE_PLATFORM_TARGETS,
  standaloneBodySource,
  standaloneBootloaderSource,
  standaloneInnerBootloaderSource,
  createClosureBuildCacheKey,
  createClosureElectronRebuildOptions,
  materializeClosureWebPublicHoist,
  normalizeClosurePlatformTarget,
  resolveClosureArchiveInvocation,
  resolveClosureRuntimeDependencies,
} from "../src/closure.js";
import { WORKSPACE_ROOT } from "../src/config.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map(async (root) => await rm(root, { force: true, recursive: true })));
});

describe("tools-pack Closure archive", () => {
  it("normalizes only the two G2 platform targets", () => {
    expect(normalizeClosurePlatformTarget("darwin-arm64")).toBe(CLOSURE_PLATFORM_TARGETS.DARWIN_ARM64);
    expect(normalizeClosurePlatformTarget("win32-x64")).toBe(CLOSURE_PLATFORM_TARGETS.WIN32_X64);
    expect(() => normalizeClosurePlatformTarget("linux-x64")).toThrow(/unsupported Closure platform target/u);
  });

  it("selects target-native ZIP tooling", () => {
    expect(resolveClosureArchiveInvocation({
      artifactPath: "/tmp/closure.zip",
      target: CLOSURE_PLATFORM_TARGETS.DARWIN_ARM64,
    })).toEqual({
      args: ["-c", "-k", "--sequesterRsrc", "--rsrc", ".", "/tmp/closure.zip"],
      command: "ditto",
    });

    const windows = resolveClosureArchiveInvocation({
      artifactPath: "C:\\closure.zip",
      target: CLOSURE_PLATFORM_TARGETS.WIN32_X64,
    });
    expect(windows.command).toMatch(/[\\/]resources[\\/]win[\\/]7zip[\\/]7z\.exe$/u);
    expect(windows.args).toEqual(["a", "-tzip", "-mx=5", "C:\\closure.zip", ".\\*"]);
  });

  it("rebuilds Closure native modules for the shell Electron ABI", () => {
    expect(createClosureElectronRebuildOptions({
      appRoot: "/tmp/closure",
      electronVersion: "41.3.0",
      target: CLOSURE_PLATFORM_TARGETS.DARWIN_ARM64,
    })).toMatchObject({
      arch: "arm64",
      buildPath: "/tmp/closure",
      electronVersion: "41.3.0",
      onlyModules: [...CLOSURE_ELECTRON_NATIVE_MODULES],
      platform: "darwin",
      projectRootPath: "/tmp/closure",
    });
    expect(createClosureElectronRebuildOptions({
      appRoot: "C:\\closure",
      electronVersion: "41.3.0",
      target: CLOSURE_PLATFORM_TARGETS.WIN32_X64,
    })).toMatchObject({
      arch: "x64",
      buildPath: "C:\\closure",
      electronVersion: "41.3.0",
      onlyModules: [...CLOSURE_ELECTRON_NATIVE_MODULES],
      platform: "win32",
      projectRootPath: "C:\\closure",
    });
  });

  it("publishes a fossil root, registered inner bootloader and separate body", () => {
    const root = standaloneBootloaderSource({ minShellVersion: "0.18.0-beta.1" });
    const inner = standaloneInnerBootloaderSource({ minShellVersion: "0.18.0-beta.1" });
    const body = standaloneBodySource();

    expect(root).toContain("createStandaloneBootloader");
    expect(root).toContain("resolveRegisteredBootloader");
    expect(root).toContain('join(root, "standalone", "bootloader.mjs")');
    expect(root).toContain("export const handoff");
    expect(root).toContain('electron: { version: { min: "0.18.0-beta.1" } }');
    expect(root).not.toContain("resolveOpenDesignClosureLayout");

    expect(inner).toContain("createStandaloneBootloader");
    expect(inner).toContain("startStandaloneBody");
    expect(inner).toContain("export const handoff");
    expect(inner).not.toContain("resolveRegisteredBootloader");

    expect(body).toContain("resolveOpenDesignClosureLayout");
    expect(body).toContain("resolveOpenDesignClosureRuntimeRoot");
    expect(body).toContain('join(request.paths.runtimeRoot, "closure-aliases")');
    expect(body).toContain('symlink(expectedRoot, aliasRoot, "junction")');
    expect(body).toContain("Closure runtime alias does not resolve to the selected generation");
    expect(body).toContain("daemonStandaloneSidecarEntry");
    expect(body).toContain("webStandaloneSidecarEntry");
    expect(body).toContain("OD_DAEMON_CLI_PATH");
    expect(body).toContain("OD_RESOURCE_TRUST_ROOT: request.paths.installationRoot");
    expect(body).toContain('process.platform === "win32" ? 120_000 : undefined');
    expect(body.match(/readyTimeoutMs: sidecarReadyTimeoutMs/gu)).toHaveLength(2);
    expect(body.match(/output: "inherit"/gu)).toHaveLength(2);
    for (const source of [root, inner, body]) {
      expect(source).not.toContain("payload-desktop-handoff");
      expect(source).not.toContain("ELECTRON_RUN_AS_NODE");
      expect(source).not.toContain("release-beta");
    }
  });

  it("keeps shell applications outside the Closure install set", () => {
    const names = CLOSURE_INTERNAL_PACKAGES.map((entry) => entry.name);
    expect(names).toContain("@open-design/standalone");
    expect(names).toContain("@open-design/standalone-proto");
    expect(names).toContain("@open-design/sidecar");
    expect(names).not.toContain("@open-design/daemon");
    expect(names).not.toContain("@open-design/shell-electron");
    expect(names).not.toContain("@open-design/shell-electron");
  });

  it("keys Closure builds independently from shell-only sources", async () => {
    const root = await mkdtemp(join(tmpdir(), "od-closure-build-key-"));
    roots.push(root);
    await writeFile(join(root, "package.json"), JSON.stringify({ packageManager: "pnpm@10.33.2" }));
    await writeFile(join(root, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
    for (const sourcePath of CLOSURE_BUILD_SOURCE_PATHS) {
      const absolutePath = join(root, sourcePath);
      if (sourcePath.endsWith(".json") || sourcePath.endsWith(".ts")) {
        await mkdir(join(absolutePath, ".."), { recursive: true });
        await writeFile(absolutePath, `source:${sourcePath}\n`);
      } else {
        await mkdir(absolutePath, { recursive: true });
        await writeFile(join(absolutePath, "source.txt"), `source:${sourcePath}\n`);
      }
    }
    await mkdir(join(root, "apps", "desktop", "src"), { recursive: true });
    await writeFile(join(root, "apps", "desktop", "src", "index.ts"), "export const shell = 1;\n");
    const options = {
      artifactUrl: "https://releases.open-design.test/beta/closure/darwin-arm64/versions/0.18.0-beta.4/closure.zip",
      channel: "beta" as const,
      electronVersion: "41.3.0",
      minShellVersion: "0.16.2",
      platform: CLOSURE_PLATFORM_TARGETS.DARWIN_ARM64,
      version: "0.18.0-beta.4",
      workspaceRoot: root,
    };

    const initial = await createClosureBuildCacheKey(options);
    await writeFile(join(root, "apps", "desktop", "src", "index.ts"), "export const shell = 2;\n");
    expect(await createClosureBuildCacheKey(options)).toBe(initial);

    await writeFile(join(root, "apps", "standalone", "source.txt"), "standalone changed\n");
    expect(await createClosureBuildCacheKey(options)).not.toBe(initial);
    expect(CLOSURE_BUILD_SOURCE_PATHS).not.toContain("shells/electron");
    expect(CLOSURE_BUILD_SOURCE_PATHS).not.toContain("shells/electron");
  });

  it("takes external runtime versions from the daemon dependency contract", async () => {
    const dependencies = await resolveClosureRuntimeDependencies(WORKSPACE_ROOT);

    expect(Object.keys(dependencies).sort()).toEqual([...CLOSURE_DAEMON_EXTERNALS].sort());
    expect(Object.values(dependencies).every(
      (version) => /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u.test(version),
    )).toBe(true);
  });

  it("materializes pnpm public-hoist packages required by the archived Next server", async () => {
    const root = await mkdtemp(join(tmpdir(), "od-closure-web-hoist-"));
    roots.push(root);
    const hoistRoot = join(root, "node_modules", ".pnpm", "node_modules");
    await Promise.all([
      mkdir(join(hoistRoot, "@swc", "helpers"), { recursive: true }),
      mkdir(join(hoistRoot, "next"), { recursive: true }),
    ]);
    await Promise.all([
      writeFile(join(hoistRoot, "@swc", "helpers", "package.json"), '{"name":"@swc/helpers"}\n'),
      writeFile(join(hoistRoot, "next", "package.json"), '{"name":"next"}\n'),
    ]);

    expect(await materializeClosureWebPublicHoist(root)).toEqual([
      "node_modules/@swc/helpers",
      "node_modules/next",
    ]);
    expect(await readFile(join(root, "node_modules", "@swc", "helpers", "package.json"), "utf8"))
      .toContain('@swc/helpers');
    expect(await readFile(join(root, "node_modules", "next", "package.json"), "utf8"))
      .toContain('next');
  });
});
