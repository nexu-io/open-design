import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import type { ElectronExactSceneRequest } from "@open-design/shell-electron/build";
import { acquireBuildArchive } from "@open-design/tools-pack/build";
import { readOfficialNodeLock } from "@open-design/standalone/packages";
import { readReleasePolicyReceipt } from "../policy/release-profile.ts";
import { checkedFile, describeFile, readObject, writeObject } from "./control-common.ts";

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

export async function buildReleaseScene(input: BuildInput & Readonly<{ plan?: string; resources?: string; nodeArchive?: string }>) {
  const buildTarget = target(input), root = resolve(input.root);
  const closure = join(root, "apps/closure/dist/index.mjs"), launcher = join(root, "apps/closure/dist/launcher.mjs");
  if (input.shell === "electron") {
    if (!input.plan || !input.resources) throw new Error("Electron scene requires --plan and --resources");
    const plan = await readObject(input.plan), identity = plan.plan?.nodes?.["electron.shell.build"]?.identity;
    if (plan.plan?.target !== buildTarget || typeof identity !== "string" || !/^sha256:[a-f0-9]{64}$/u.test(identity)) throw new Error("Electron Shell plan identity is invalid");
    // Build dependencies load only when the native build command is executed.
    const { buildElectronScene, resolveElectronNodeArchive } = await electronBuilder(root);
    const platformArchivePath = input.nodeArchive ? resolve(input.nodeArchive) : await (async () => {
      const source = await resolveElectronNodeArchive(buildTarget);
      return (await acquireBuildArchive({ cacheRoot: join(dirname(resolve(input.output)), ".build-cache"), fileName: source.archive, url: source.url, sha256: source.sha256 })).path;
    })();
    const result = await buildElectronScene({ schemaVersion: 1, operation: "electron.scene.build", target: buildTarget,
      buildHash: identity.slice(7), acceptedClosureBaselineFile: closure, standaloneLauncherFile: launcher, platformArchivePath,
      resourceReceiptFile: resolve(input.resources), sceneDirectory: resolve(input.output) });
    await writeObject(input.receipt, result);
    return result;
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
  const result = await buildElectronInstaller({ ...common, operation: "electron.distribution.build", acceptedContentMetadataFile: content, acceptedTrustFile: trust,
    channel: policy.channel, releaseVersion: policy.releaseVersion, channelHeadUrl: `${policy.target.publicBaseUrl}/${input.channel}/latest/channel-head.json` });
  await writeObject(join(input.output, "shell-contribution.json"), result);
  await writeObject(input.receipt, result);
  return result;
}
