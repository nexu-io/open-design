import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  archiveClosureComponent,
  buildClosureDistributionSharedContribution,
  buildClosureDistributionTargetContribution,
  prepareClosureLauncherComponent,
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
      runtimeEntryPath: target === "win32-x64" ? "node.exe" : "bin/node",
      runtimeRoot: await componentRoot(
        root,
        "runtime",
        target === "win32-x64" ? "node.exe" : "bin/node",
      ),
      target,
      version: "0.19.0-beta.10",
    });
    const manifest = mergeClosureDistributionTargetContributions(shared, [targetContribution]);

    expect(shared).not.toHaveProperty("target");
    expect(targetContribution).not.toHaveProperty("body");
    expect(manifest.required.targets[target]?.runtime.entryPath).toBe(
      target === "win32-x64" ? "node.exe" : "bin/node",
    );
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
    await writeFile(join(distRoot, "sidecars.mjs"), "not part of launcher\n");

    const launcherRoot = await prepareClosureLauncherComponent({
      outputRoot: join(root, "prepared"),
      standaloneDistRoot: distRoot,
    });

    await expect(readFile(join(launcherRoot, "bootloader.mjs"), "utf8")).resolves.toBe("handoff\n");
    await expect(readFile(join(launcherRoot, "launcher.mjs"), "utf8")).resolves.toBe("launcher\n");
    await expect(readFile(join(launcherRoot, "sidecars.mjs"), "utf8")).rejects.toThrow();
  });
});
