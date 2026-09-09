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
import { canonicalBytes, checkedFile, describeFile, readObject, writeObject } from "./control-common.ts";
import { resolveExactPlatformPlanNode } from "./plan.ts";

type Target = ElectronExactSceneRequest["target"];
type BuildInput = Readonly<{ root: string; shell: string; target: string; output: string; receipt: string }>;
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
  plan?: string; resources?: string; nodeArchive?: string;
  capsuleContent?: string; capsuleArchive?: string;
}>) {
  if ((input.capsuleContent != null || input.capsuleArchive != null)
    && (input.shell !== "electron" || !input.capsuleContent || !input.capsuleArchive)) {
    throw new Error("Capsule inputs require electron and both --capsule-content and --capsule-archive");
  }
  const buildTarget = target(input), root = resolve(input.root);
  const closure = join(root, "apps/closure/dist/index.mjs"), launcher = join(root, "apps/closure/dist/launcher.mjs");
  if (input.shell === "electron") {
    if (!input.plan || !input.resources) throw new Error("Electron scene requires --plan and --resources");
    const resourceReceiptFile = resolve(input.resources);
    const plan = await readObject(input.plan), identity = plan.plan?.nodes?.["electron.shell.build"]?.identity;
    if (plan.plan?.target !== buildTarget || typeof identity !== "string" || !/^sha256:[a-f0-9]{64}$/u.test(identity)) throw new Error("Electron Shell plan identity is invalid");
    // Build dependencies load only when the native build command is executed.
    if (input.nodeArchive != null) throw new Error("Electron scene does not consume --node-archive; use build platform");
    const { buildElectronScene, buildElectronCapsuleContent } = await electronBuilder(root);
    const assemble = async (capsule: Readonly<{ contentPath: string; archivePath: string }>) => {
      const result = await buildElectronScene({ schemaVersion: 2, operation: "electron.scene.build", target: buildTarget,
        capsuleContentFile: capsule.contentPath, capsuleArchiveFile: capsule.archivePath,
        buildHash: identity.slice(7), acceptedClosureBaselineFile: closure, standaloneLauncherFile: launcher,
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
export async function buildReleasePlatform(input: BuildInput & Readonly<{ nodeArchive?: string; plan?: string }>) {
  if (input.shell !== "electron") throw new Error("external platform build requires electron");
  const buildTarget = target(input), output = resolve(input.output);
  const plan = input.plan == null ? undefined : await readObject(input.plan);
  const id = "electron.platform.build";
  if (plan != null && (plan.schemaVersion !== 1 || plan.plan?.target !== buildTarget
    || !Array.isArray(plan.actions) || !plan.actions.some(action => action?.id === id))) {
    throw new Error("platform build is not selected by a valid release plan");
  }
  const matches = async () => plan == null || canonicalBytes(await resolveExactPlatformPlanNode({
    root: resolve(input.root), registryPath: join(resolve(input.root), "tools/release/resources/exact-plan-identities.json"), target: buildTarget,
  })).equals(canonicalBytes(plan.plan.nodes?.[id] ?? null));
  if (!await matches()) throw new Error("platform build plan binding mismatch");
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
  if (!await matches()) throw new Error("platform build source changed during execution");
  const resourcePath = join(output, "platform-resource.json");
  await writeObject(resourcePath, resource);
  const receipt = { schemaVersion: 1, operation: "electron.platform.build", target: buildTarget,
    archivePath: outputArchivePath, resourcePath, resource,
    ...(plan == null ? {} : { planNode: { id, identity: plan.plan.nodes[id].identity, target: buildTarget } }) };
  await writeObject(input.receipt, receipt);
  return receipt;
}

export async function buildReleaseDistribution(input: BuildInput & Readonly<{ scene: string; prepared: string; policy: string; channel: string; releaseVersion: string; sourceCommit: string }>) {
  const buildTarget = target(input), preparedRoot = resolve(input.prepared);
  const policy = await readReleasePolicyReceipt(input.policy, { capability: "prepare",
    channel: input.channel, releaseVersion: input.releaseVersion, sourceCommit: input.sourceCommit });
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
    acceptedCapsuleManifestFile: capsule, acceptedCapsuleArchiveFile: capsuleArchive,
    channel: policy.channel, releaseVersion: policy.releaseVersion, channelHeadUrl: `${policy.target.publicBaseUrl}/${input.channel}/latest/channel-head.json` });
  await writeObject(join(input.output, "shell-contribution.json"), result);
  await writeObject(input.receipt, result);
  return result;
}
