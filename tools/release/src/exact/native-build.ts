import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { basename, dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import type { ElectronExactSceneRequest } from "@open-design/shell-electron/build";
import { acquireBuildArchive } from "@open-design/tools-pack/build";
import { readOfficialNodeLock, validateNodePlatformResource } from "@open-design/standalone/packages";
import { readReleasePolicyReceipt } from "../policy/release-profile.ts";
import { assertMacNotarizationCredentials, requiresFormalMacTrust } from "../policy/native-trust.ts";
import { checkedFile, describeFile, readObject, writeObject } from "./control-common.ts";
import { buildReleaseRuntimeResources } from "./resource-build.ts";

type Target = ElectronExactSceneRequest["target"];
type BuildInput = Readonly<{ root: string; shell: string; target: string; output: string; receipt: string }>;
/** Workspace preparation for a scene is a build recipe, not workflow policy. */
export async function buildReleaseSceneInputs(input: BuildInput) {
  target(input);
  // The caller bootstraps the declared workspace closure once. This operation
  // produces scene inputs; it must not silently rebuild that closure again.
  if (input.shell === "electron") return buildReleaseRuntimeResources(input);
  await writeObject(input.receipt, { schemaVersion: 1, operation: "terminal.scene.inputs", target: input.target });
}
async function electronBuilder(root: string): Promise<typeof import("@open-design/shell-electron/build")> {
  // A relocated CI controller resolves native build dependencies from the explicitly
  // selected workspace, never from its temporary artifact directory.
  const resolver = createRequire(join(resolve(root), "tools/release/package.json"));
  return import(pathToFileURL(resolver.resolve("@open-design/shell-electron/build")).href);
}
async function packageBuilder(root: string): Promise<typeof import("@open-design/standalone/packages/build")> {
  const resolver = createRequire(join(resolve(root), "tools/release/package.json"));
  return import(pathToFileURL(resolver.resolve("@open-design/standalone/packages/build")).href);
}
function target(input: BuildInput): Target {
  if (input.shell !== "electron" && input.shell !== "terminal") throw new Error("build shell must be electron or terminal");
  if (input.target !== "darwin-arm64" && input.target !== "darwin-x64" && input.target !== "win32-x64") throw new Error("unsupported build target");
  if (input.shell === "terminal" && (!input.target.startsWith("darwin-") || process.platform !== "darwin")) throw new Error("Terminal native build requires Darwin");
  return input.target;
}

/** Terminal's existing native process boundary requires a file-backed contract. */
async function terminalBuild(input: BuildInput, operation: "scene" | "distribution", request: unknown) {
  const scratch = await mkdtemp(join(tmpdir(), "release-terminal-build-"));
  try {
    const requestFile = join(scratch, "request.json");
    await writeObject(requestFile, request);
    await promisify(execFile)("/bin/sh", [join(resolve(input.root), `shells/terminal/sh/${operation}.sh`), "--request", requestFile, "--receipt", resolve(input.receipt)],
      { cwd: resolve(input.root), timeout: 20 * 60_000, maxBuffer: 8 * 1024 * 1024 });
    return await readObject(input.receipt);
  } finally { await rm(scratch, { recursive: true, force: true }); }
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

export async function buildReleaseBase(input: BuildInput & Readonly<{ scene: string; runtimeArchive?: string }>) {
  if (input.shell !== "electron") throw new Error("base build requires electron");
  const buildTarget = target(input), scene = resolve(input.scene);
  const sceneManifest = await readObject(join(scene, "scene.json"));
  if (sceneManifest.target !== buildTarget || buildTarget !== `${process.platform}-${process.arch}`) throw new Error("base build target mismatch");
  const { buildElectronBase, resolveElectronBaseArchive } = await electronBuilder(input.root);
  const source = await resolveElectronBaseArchive(buildTarget);
  const archivePath = input.runtimeArchive ? resolve(input.runtimeArchive) : (await acquireBuildArchive({
    cacheRoot: join(dirname(resolve(input.output)), ".build-cache"), fileName: source.fileName, url: source.url, sha256: source.sha256,
  })).path;
  await mkdir(dirname(resolve(input.output)), { recursive: true });
  const base = await buildElectronBase({ sceneDirectory: scene,
    sceneManifestSha256: (await describeFile(join(scene, "scene.json"))).sha256, archivePath, outputRoot: resolve(input.output) });
  const receipt = { schemaVersion: 1, operation: "electron.base.build", target: buildTarget, base };
  await writeObject(input.receipt, receipt);
  return receipt;
}

export async function buildReleaseDistribution(input: BuildInput & Readonly<{ baseDirectory?: string; baseReceipt?: string; scene: string; prepared: string; policy: string; channel: string; releaseVersion: string; sourceCommit: string }>) {
  if (input.baseDirectory != null) {
    if (input.baseReceipt != null) throw new Error("Base directory and receipt are mutually exclusive");
    if (input.shell === "electron") input = { ...input, baseReceipt: join(resolve(input.baseDirectory), "base-build-receipt.json") };
  }
  const buildTarget = target(input), preparedRoot = resolve(input.prepared);
  const baseReceipt = input.baseReceipt == null ? undefined : await readObject(input.baseReceipt);
  if (baseReceipt != null && (input.shell !== "electron" || baseReceipt.schemaVersion !== 1
    || baseReceipt.operation !== "electron.base.build" || baseReceipt.target !== buildTarget)) throw new Error("distribution base receipt binding mismatch");
  const policy = await readReleasePolicyReceipt(input.policy, { capability: "prepare",
    channel: input.channel, releaseVersion: input.releaseVersion, sourceCommit: input.sourceCommit });
  if (input.shell === "electron" && buildTarget.startsWith("darwin-") && requiresFormalMacTrust(policy)) {
    assertMacNotarizationCredentials();
  }
  const prepared = await readObject(join(preparedRoot, "prepare-receipt.json"));
  if (prepared.channel !== input.channel || prepared.releaseVersion !== input.releaseVersion || prepared.sourceCommit !== input.sourceCommit) throw new Error("prepared release identity mismatch");
  const content = await checkedFile(prepared.contentMetadata, "prepared content", join(preparedRoot, "documents/content-metadata.json"));
  const trust = await checkedFile(prepared.trustFile, "prepared trust", join(preparedRoot, "trust/keys.json"));
  const scene = resolve(input.scene), manifest = await readObject(join(scene, "scene.json"));
  const expected = prepared.shells?.find((shell: { type: string }) => shell.type === input.shell)?.scenes?.find((entry: { target: string }) => entry.target === buildTarget);
  const sceneManifestSha256 = (await describeFile(join(scene, "scene.json"))).sha256;
  if (manifest.target !== buildTarget || expected?.sceneManifestSha256 !== sceneManifestSha256) throw new Error("prepared scene binding mismatch");
  const common = { schemaVersion: 1 as const, target: buildTarget, sceneDirectory: scene, sceneManifestSha256, outputDirectory: resolve(input.output) };
  if (input.shell === "terminal") return terminalBuild(input, "distribution", { ...common, operation: "terminal.distribution.build", trustFile: trust,
    releaseDocumentsDirectory: join(preparedRoot, "documents"), release: { channel: input.channel, releaseVersion: input.releaseVersion,
      sourceCommit: input.sourceCommit, publishedAt: prepared.publishedAt, artifactBaseUrl: prepared.artifactBaseUrl } });
  const { buildElectronInstaller } = await electronBuilder(input.root);
  const capsule = await checkedFile(expected.capsule.manifest, "prepared Capsule manifest", join(preparedRoot, "documents", `capsule-${buildTarget}.json`));
  const capsuleArchive = await checkedFile(expected.capsule.archive, "prepared Capsule archive", join(preparedRoot, "artifacts", basename(expected.capsule.archive.file)));
  const result = await buildElectronInstaller({ ...common, schemaVersion: 2, operation: "electron.distribution.build", acceptedContentMetadataFile: content, acceptedTrustFile: trust,
    ...(baseReceipt == null ? {} : { base: baseReceipt.base }),
    acceptedCapsuleManifestFile: capsule, acceptedCapsuleArchiveFile: capsuleArchive,
    channel: policy.channel, releaseVersion: policy.releaseVersion, channelHeadUrl: `${policy.target.publicBaseUrl}/${input.channel}/latest/channel-head.json` });
  if (buildTarget.startsWith("darwin-") && requiresFormalMacTrust(policy) && result.platformTrust?.mode !== "formal") {
    throw new Error("public macOS distribution requires formal signed and notarized platform trust");
  }
  await writeObject(join(input.output, "shell-contribution.json"), result);
  await writeObject(input.receipt, result);
  return result;
}
