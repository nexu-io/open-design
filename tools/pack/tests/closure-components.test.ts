import { cp, mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  archiveClosureComponent,
  buildClosureDistributionSharedContribution,
  buildClosureDistributionTargetContribution,
  prepareClosureLauncherComponent,
  probeClosureNodeRuntime,
  probeClosureNativeModules,
  validateClosureBodyComponent,
  validateClosureNativeComponent,
  validateClosureNodeRuntimeComponent,
  validateClosureNodeRuntimeIdentity,
  type ClosureComponentArchiveRunner,
} from "../src/closure-components.js";
import { mergeClosureDistributionTargetContributions } from "../src/closure-distribution.js";
import {
  resolveHostClosurePlatformTarget,
  type ClosurePlatformTarget,
} from "../src/closure-platform.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map(async (root) => await rm(root, { force: true, recursive: true })));
});

async function tempRoot(name: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), `od-closure-components-${name}-`));
  roots.push(root);
  return root;
}

async function componentRoot(root: string, name: string, entry: string, content = name): Promise<string> {
  const sourceRoot = join(root, name);
  const path = join(sourceRoot, ...entry.split("/"));
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, content, "utf8");
  return sourceRoot;
}

const fakeArchive: ClosureComponentArchiveRunner = async (invocation, cwd) => {
  const outputPath = invocation.args.find((value) => isAbsolute(value) && value.endsWith(".zip"));
  if (outputPath == null) throw new Error("archive invocation did not expose an absolute ZIP output");
  await writeFile(outputPath, `PK\u0003\u0004${cwd}`, "utf8");
};

describe("tools-pack Closure component archives", () => {
  it("keeps body, native and runtime identities in separate layers", async () => {
    const root = await tempRoot("layer-purity");
    const bodyRoot = await componentRoot(root, "body-pure", "bootloader.mjs");
    await mkdir(join(bodyRoot, "web"), { recursive: true });
    await writeFile(join(bodyRoot, "web", "index.html"), "web");
    await expect(validateClosureBodyComponent(bodyRoot)).resolves.toMatchObject({ fileCount: 2 });
    await writeFile(join(bodyRoot, "addon.node"), "native");
    await expect(validateClosureBodyComponent(bodyRoot)).rejects.toThrow(/platform-neutral/u);

    const nativeRoot = await componentRoot(
      root,
      "native-pure",
      "node_modules/better-sqlite3/build/Release/better_sqlite3.node",
    );
    await expect(validateClosureNativeComponent(nativeRoot)).resolves.toMatchObject({ fileCount: 1 });
    await writeFile(join(nativeRoot, "README.md"), "mixed");
    await expect(validateClosureNativeComponent(nativeRoot)).rejects.toThrow(/only contain node_modules/u);

    expect(validateClosureNodeRuntimeIdentity({
      arch: "arm64",
      electron: null,
      modules: "137",
      node: "24.18.0",
      platform: "darwin",
      release: "node",
    }, { arch: "arm64", platform: "darwin", version: "24.18.0" })).toMatchObject({
      electron: null,
      release: "node",
    });
    expect(() => validateClosureNodeRuntimeIdentity({
      arch: "arm64",
      electron: "40.0.0",
      modules: "143",
      node: "24.18.0",
      platform: "darwin",
      release: "node",
    }, { arch: "arm64", platform: "darwin", version: "24.18.0" })).toThrow(/standalone Node/u);

    await expect(probeClosureNodeRuntime(process.execPath, {
      arch: process.arch,
      platform: process.platform,
      version: process.versions.node,
    })).resolves.toMatchObject({
      arch: process.arch,
      electron: null,
      modules: process.versions.modules,
      node: process.versions.node,
      platform: process.platform,
      release: "node",
    });
  });

  it("loads a prepared native pack through the same standalone Node ABI", async () => {
    const root = await tempRoot("native-probe");
    const nativeRoot = join(root, "native");
    const packageRoot = join(nativeRoot, "node_modules", "better-sqlite3");
    await cp(join(process.cwd(), "..", "..", "apps", "daemon", "node_modules", "better-sqlite3"), packageRoot, {
      dereference: true,
      recursive: true,
    });

    await expect(probeClosureNativeModules({
      executable: process.execPath,
      modules: ["better-sqlite3"],
      nativeRoot,
    })).resolves.toEqual(["better-sqlite3"]);
    await expect(probeClosureNativeModules({
      executable: process.execPath,
      modules: ["missing-native-module"],
      nativeRoot,
    })).rejects.toThrow(/probe failed/u);
  });

  it("creates a real host ZIP from an isolated component root", async () => {
    const target = resolveHostClosurePlatformTarget();
    if (target == null) return;
    const root = await tempRoot("real");
    const sourceRoot = await componentRoot(root, "launcher", "launcher.mjs");
    const outputPath = join(root, "output", "launcher.zip");

    const archive = await archiveClosureComponent({
      entryPath: "launcher.mjs",
      outputPath,
      sourceRoot,
      target,
    });

    expect(archive.fileCount).toBe(1);
    expect((await readFile(outputPath)).subarray(0, 2).toString("ascii")).toBe("PK");

    const secondOutputPath = join(root, "output", "launcher-again.zip");
    await archiveClosureComponent({
      entryPath: "launcher.mjs",
      outputPath: secondOutputPath,
      sourceRoot,
      target,
    });
    await expect(readFile(secondOutputPath)).resolves.toEqual(await readFile(outputPath));
  });

  it("rejects missing entries, empty roots, and symlinked content before archiving", async () => {
    const root = await tempRoot("invalid");
    const target = (resolveHostClosurePlatformTarget() ?? "darwin-arm64") as ClosurePlatformTarget;
    const emptyRoot = join(root, "empty");
    await mkdir(emptyRoot, { recursive: true });
    await expect(archiveClosureComponent({
      outputPath: join(root, "empty.zip"),
      run: fakeArchive,
      sourceRoot: emptyRoot,
      target,
    })).rejects.toThrow(/empty/u);

    const bodyRoot = await componentRoot(root, "body", "other.mjs");
    await expect(archiveClosureComponent({
      entryPath: "bootloader.mjs",
      outputPath: join(root, "body.zip"),
      run: fakeArchive,
      sourceRoot: bodyRoot,
      target,
    })).rejects.toThrow(/entry is missing/u);

    if (process.platform !== "win32") {
      await symlink(join(bodyRoot, "other.mjs"), join(bodyRoot, "linked.mjs"));
      await expect(archiveClosureComponent({
        outputPath: join(root, "linked.zip"),
        run: fakeArchive,
        sourceRoot: bodyRoot,
        target,
      })).rejects.toThrow(/symlinks/u);
    }
  });

  it("wires once-built shared archives and target-only archives into one graph", async () => {
    const root = await tempRoot("graph");
    const target = (resolveHostClosurePlatformTarget() ?? "darwin-arm64") as ClosurePlatformTarget;
    const outputRoot = join(root, "out");
    const shared = await buildClosureDistributionSharedContribution({
      archiveTarget: target,
      blobOrigin: "https://releases.open-design.ai/",
      bodyRoot: await componentRoot(root, "body", "bootloader.mjs"),
      channel: "beta",
      launcherRoot: await (async () => {
        const launcherRoot = await componentRoot(root, "launcher", "launcher.mjs");
        await writeFile(join(launcherRoot, "bootloader.mjs"), "export const handoff = true;\n");
        await writeFile(join(launcherRoot, "native-loader.mjs"), "export {};\n");
        return launcherRoot;
      })(),
      outputRoot,
      resources: [{
        id: "skills",
        root: await componentRoot(root, "skills", "skills/sample/SKILL.md"),
        title: "Skills",
      }],
      run: fakeArchive,
      shellCompatibility: { electron: { version: { min: "0.19.0-beta.4" } } },
      version: "0.19.0-beta.10",
    });
    const targetContribution = await buildClosureDistributionTargetContribution({
      blobOrigin: "https://releases.open-design.ai/",
      channel: "beta",
      nativeRoot: await componentRoot(root, "native", "node_modules/addon/addon.node"),
      outputRoot,
      run: fakeArchive,
      target,
      version: "0.19.0-beta.10",
    });
    const manifest = mergeClosureDistributionTargetContributions(shared, [targetContribution]);

    expect(shared).not.toHaveProperty("target");
    expect(targetContribution).not.toHaveProperty("body");
    expect(manifest.required.targets[target]?.native.blob).toBe(targetContribution.native.artifact.digest);
    expect(manifest.resources.map(({ id }) => id)).toEqual(["skills"]);
    expect(await readFile(join(outputRoot, "shared", "body.zip"), "utf8")).toMatch(/^PK/u);
    expect(await readFile(join(outputRoot, "targets", target, "native.zip"), "utf8")).toMatch(/^PK/u);
  });

  it("materializes only the handoff and official-Node fossil launcher entries", async () => {
    const root = await tempRoot("launcher-layout");
    const distRoot = join(root, "dist");
    await mkdir(distRoot, { recursive: true });
    await writeFile(join(distRoot, "generation-bootloader.mjs"), "handoff\n");
    await writeFile(join(distRoot, "launcher.mjs"), "launcher\n");
    await writeFile(join(distRoot, "native-loader.mjs"), "loader\n");
    await writeFile(join(distRoot, "sidecars.mjs"), "not part of launcher\n");

    const launcherRoot = await prepareClosureLauncherComponent({
      outputRoot: join(root, "prepared"),
      standaloneDistRoot: distRoot,
    });

    await expect(readFile(join(launcherRoot, "bootloader.mjs"), "utf8")).resolves.toBe("handoff\n");
    await expect(readFile(join(launcherRoot, "launcher.mjs"), "utf8")).resolves.toBe("launcher\n");
    await expect(readFile(join(launcherRoot, "native-loader.mjs"), "utf8")).resolves.toBe("loader\n");
    await expect(readFile(join(launcherRoot, "sidecars.mjs"), "utf8")).rejects.toThrow();
  });

  it("derives the official Node entry from the target and rejects version drift", async () => {
    const root = await tempRoot("runtime-target");
    const runtimeRoot = await componentRoot(root, "runtime-target", "bin/node");
    const probe = async (_executable: string, expected: Readonly<{
      arch: string;
      platform: string;
      version: string;
    }>) => validateClosureNodeRuntimeIdentity({
      arch: expected.arch,
      electron: null,
      modules: "137",
      node: expected.version,
      platform: expected.platform,
      release: "node",
    }, expected);

    await expect(validateClosureNodeRuntimeComponent({
      nodeVersion: "24.18.0",
      probe,
      root: runtimeRoot,
      target: "darwin-arm64",
    })).resolves.toMatchObject({ entryPath: "bin/node" });
    await expect(validateClosureNodeRuntimeComponent({
      nodeVersion: "24",
      probe,
      root: runtimeRoot,
      target: "darwin-arm64",
    })).rejects.toThrow(/must be exact/u);
    await expect(validateClosureNodeRuntimeComponent({
      nodeVersion: "24.18.0",
      probe,
      root: runtimeRoot,
      target: "win32-x64",
    })).rejects.toThrow(/node.exe/u);
  });
});
