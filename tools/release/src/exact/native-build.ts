import { electronBuilder, packageBuilder, target, terminalBuild, type BuildInput } from "./native-builder.ts";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { acquireBuildArchive } from "@open-design/tools-pack/build";
import { readOfficialNodeLock, validateNodePlatformResource } from "@open-design/standalone/packages";
import { describeFile, readObject, writeObject } from "./control-common.ts";
import { buildReleaseRuntimeResources } from "./resource-build.ts";

/** Workspace preparation for a scene is a build recipe, not workflow policy. */
export async function buildReleaseSceneInputs(input: BuildInput) {
  target(input);
  // The caller bootstraps the declared workspace closure once. This operation
  // produces scene inputs; it must not silently rebuild that closure again.
  if (input.shell === "electron") return buildReleaseRuntimeResources(input);
  await writeObject(input.receipt, { schemaVersion: 1, operation: "terminal.scene.inputs", target: input.target });
}
export async function buildReleaseScene(input: BuildInput & Readonly<{
  resources?: string; nodeArchive?: string;
  capsuleContent?: string; capsuleArchive?: string; capsuleDirectory?: string;
}>) {
  if (input.capsuleDirectory != null) {
    if (input.capsuleContent != null || input.capsuleArchive != null) throw new Error("Capsule directory and individual files are mutually exclusive");
    if (input.shell === "electron") input = { ...input,
      capsuleContent: join(resolve(input.capsuleDirectory), input.target, "capsule-content.json"),
      capsuleArchive: join(resolve(input.capsuleDirectory), input.target, "capsule.zip") };
  }
  if ((input.capsuleContent != null || input.capsuleArchive != null)
    && (input.shell !== "electron" || !input.capsuleContent || !input.capsuleArchive)) {
    throw new Error("Capsule inputs require electron and both --capsule-content and --capsule-archive");
  }
  const buildTarget = target(input), root = resolve(input.root);
  const closure = join(root, "apps/closure/dist/index.mjs"), launcher = join(root, "apps/closure/dist/launcher.mjs");
  if (input.shell === "electron") {
    if (!input.resources) throw new Error("Electron scene requires --resources");
    const resourceReceiptFile = resolve(input.resources);
    // Build dependencies load only when the native build command is executed.
    if (input.nodeArchive != null) throw new Error("Electron scene does not consume --node-archive; use build platform");
    const { buildElectronScene, buildElectronCapsuleContent } = await electronBuilder(root);
    const assemble = async (capsule: Readonly<{ contentPath: string; archivePath: string }>) => {
      const result = await buildElectronScene({ schemaVersion: 2, operation: "electron.scene.build", target: buildTarget,
        capsuleContentFile: capsule.contentPath, capsuleArchiveFile: capsule.archivePath,
        acceptedClosureBaselineFile: closure, standaloneLauncherFile: launcher,
        resourceReceiptFile, sceneDirectory: resolve(input.output) });
      await writeObject(input.receipt, result);
      return result;
    };
    // Acquisition and cache identity remain the caller/planner's responsibility.
    // Shell scene assembly verifies target and actual archive bytes in either path.
    if (input.capsuleContent != null && input.capsuleArchive != null) {
      return assemble({ contentPath: resolve(input.capsuleContent), archivePath: resolve(input.capsuleArchive) });
    }
    const capsuleStage = await mkdtemp(join(tmpdir(), "release-capsule-baseline-"));
    try {
      return await assemble(await buildElectronCapsuleContent({ target: buildTarget, outputRoot: join(capsuleStage, "content") }));
    } finally { await rm(capsuleStage, { recursive: true, force: true }); }
  }
  const lock = await readOfficialNodeLock(join(root, "shells/terminal/node-lock.json")), node = lock.targets[buildTarget];
  if (node == null) throw new Error("Terminal platform target is not declared");
  const archive = input.nodeArchive ? resolve(input.nodeArchive) : (await acquireBuildArchive({
    cacheRoot: join(dirname(resolve(input.output)), ".build-cache"), fileName: node.archive, url: node.url, sha256: node.sha256 })).path;
  const { buildNodePlatform } = await packageBuilder(root);
  const scratch = await mkdtemp(join(tmpdir(), "release-terminal-platform-"));
  try {
    const platform = await buildNodePlatform({
      lockPath: join(root, "shells/terminal/node-lock.json"), archivePath: archive, target: buildTarget,
      outputRoot: join(scratch, "platform"), dependenciesRoot: join(root, "shells/terminal/resources/platform"),
      preparationEntryPath: join(root, "shells/terminal/resources/platform/prepare.ts"),
      verificationEntryPath: join(root, "shells/terminal/resources/platform/verify.ts"),
    });
    return await terminalBuild(input, "scene", { schemaVersion: 2, operation: "terminal.scene.build", target: buildTarget,
    shellVersion: (await readFile(join(root, "shells/terminal/version"), "utf8")).trim(),
    node: { version: lock.version, platformDirectory: platform.root, archiveSha256: node.sha256 },
    closureArtifactFile: closure, standaloneLauncherFile: launcher,
    standaloneDirectory: join(root, "packages/standalone/dist"), sidecarDirectory: join(root, "packages/sidecar/dist"),
    platformDirectory: join(root, "packages/platform/dist"), sceneDirectory: resolve(input.output) });
  } finally { await rm(scratch, { recursive: true, force: true }); }
}

/** Release-neutral Capsule production uses the same workspace-owned public boundary. */
export async function buildReleaseCapsule(input: BuildInput) {
  if (input.shell !== "electron") throw new Error("Capsule build requires electron");
  const buildTarget = target(input);
  const { buildElectronCapsuleContent } = await electronBuilder(input.root);
  const result = await buildElectronCapsuleContent({ target: buildTarget, outputRoot: resolve(input.output) });
  const receipt = { schemaVersion: 1, operation: "electron.capsule.build", ...result };
  await writeObject(input.receipt, receipt);
  return receipt;
}

/** Independent Node/native production. No Capsule compilation, Closure inputs,
 * channel policy or signing; release preparation authenticates this descriptor. */
export async function buildReleasePlatform(input: BuildInput & Readonly<{ nodeArchive?: string }>) {
  if (input.shell !== "electron") throw new Error("external platform build requires electron");
  const buildTarget = target(input), output = resolve(input.output);
  const { buildElectronPlatformResource, resolveElectronNodeArchive } = await electronBuilder(input.root);
  await mkdir(dirname(output), { recursive: true });
  // A cache hit is restored by the plan owner, never inferred from output presence.
  await mkdir(output);
  const archivePath = input.nodeArchive ? resolve(input.nodeArchive) : await (async () => {
    const source = await resolveElectronNodeArchive(buildTarget);
    return (await acquireBuildArchive({ cacheRoot: join(dirname(output), ".build-cache"),
      fileName: source.archive, url: source.url, sha256: source.sha256 })).path;
  })();
  const outputArchivePath = join(output, "platform.zip");
  const built = await buildElectronPlatformResource({ archivePath, target: buildTarget, outputArchivePath });
  const resource = validateNodePlatformResource(built.resource);
  const archive = await describeFile(outputArchivePath, "application/zip");
  if (resource.target !== buildTarget || resource.blob.sources.length !== 0 || built.archivePath !== outputArchivePath
    || archive.sha256 !== resource.blob.sha256 || archive.size !== resource.blob.size) throw new Error("platform build product binding mismatch");
  const resourcePath = join(output, "platform-resource.json");
  await writeObject(resourcePath, resource);
  const receipt = { schemaVersion: 1, operation: "electron.platform.build", target: buildTarget,
    archivePath: outputArchivePath, resourcePath, resource };
  await writeObject(input.receipt, receipt);
  return receipt;
}
