import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  CLOSURE_DAEMON_EXTERNALS,
  CLOSURE_ELECTRON_NATIVE_MODULES,
  CLOSURE_INTERNAL_PACKAGES,
  CLOSURE_PLATFORM_TARGETS,
  closureRuntimeSource,
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

  it("publishes one shell-neutral entry with explicit Web and daemon layout", () => {
    const source = closureRuntimeSource();
    expect(source).toContain('export * from "@open-design/headless"');
    expect(source).toContain("resolveOpenDesignClosureLayout");
    expect(source).toContain("daemonCliEntry");
    expect(source).toContain("daemonSidecarEntry");
    expect(source).toContain("webServerEntry");
    expect(source).toContain("webSidecarEntry");
    expect(source).not.toContain("payload-desktop-handoff");
    expect(source).not.toContain("desktop");
    expect(source).not.toContain("namespace");
  });

  it("keeps shell applications outside the Closure install set", () => {
    const names = CLOSURE_INTERNAL_PACKAGES.map((entry) => entry.name);
    expect(names).toContain("@open-design/headless");
    expect(names).not.toContain("@open-design/daemon");
    expect(names).not.toContain("@open-design/desktop");
    expect(names).not.toContain("@open-design/packaged");
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
