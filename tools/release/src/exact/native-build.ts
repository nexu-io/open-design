import { execFile } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { basename, join, resolve } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import type { ElectronExactSceneRequest } from "@open-design/shell-electron/build";
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
    const { buildElectronScene } = await electronBuilder(root);
    const result = await buildElectronScene({ schemaVersion: 1, operation: "electron.scene.build", target: buildTarget,
      buildHash: identity.slice(7), acceptedClosureBaselineFile: closure, standaloneLauncherFile: launcher,
      resourceReceiptFile: resolve(input.resources), sceneDirectory: resolve(input.output) });
    await writeObject(input.receipt, result);
    return result;
  }
  const lock = await readObject(join(root, "shells/terminal/node-lock.json")), node = lock.targets?.[buildTarget];
  if (typeof lock.version !== "string" || typeof node?.archive !== "string" || basename(node.archive) !== node.archive || !/^[a-f0-9]{64}$/u.test(node?.sha256 ?? "")) throw new Error("invalid official Node lock");
  const scratch = await mkdtemp(join(tmpdir(), "release-node-archive-"));
  try {
    const archive = input.nodeArchive ? resolve(input.nodeArchive) : join(scratch, node.archive);
    if (!input.nodeArchive) {
      const url = new URL(node.url);
      if (url.protocol !== "https:" || url.username || url.password) throw new Error("official Node archive must use credential-free HTTPS");
      const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(120_000) });
      if (!response.ok || !response.body) throw new Error(`official Node archive acquisition failed (${response.status})`);
      await pipeline(Readable.fromWeb(response.body as import("node:stream/web").ReadableStream), createWriteStream(archive, { flags: "wx" }));
    }
    if ((await describeFile(archive)).sha256 !== node.sha256) throw new Error("official Node archive digest mismatch");
    return await terminalBuild(input, "scene", { schemaVersion: 1, operation: "terminal.scene.build", target: buildTarget,
      shellVersion: (await readFile(join(root, "shells/terminal/version"), "utf8")).trim(),
      node: { version: lock.version, archiveFile: archive, archiveSha256: node.sha256 },
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
