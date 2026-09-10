import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { readFile, readdir, realpath } from "node:fs/promises";
import { basename, isAbsolute, join, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { finalizeContent, prepareContent, preparationTrust, type PrepareExactContentInput } from "./content.ts";
import { readReleasePolicyReceipt } from "../policy/release-profile.ts";
import { describeFile, readObject, type JsonObject } from "./control-common.ts";
import { unpackSceneArtifact } from "./scene-artifact.ts";
import { resolveDataResourceReceipts } from "./resource-composition.ts";
import { freezeVersionInput } from "./version-input.ts";
import { versionInputStorage } from "./version-input-storage.ts";

async function localFile(root: string, name: unknown): Promise<string> {
  if (typeof name !== "string" || isAbsolute(name)) throw new Error("scene input must be a relative file");
  const base = await realpath(root), path = await realpath(resolve(root, name)), rel = relative(base, path);
  if (!rel || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new Error("scene input escapes its root");
  return path;
}

export async function prepareReleaseContent(input: Readonly<{
  policy: string; channel: string; releaseVersion: string; sourceCommit: string;
  sourceRoot: string; shellInputs: string; scenesRoot: string; standaloneVersion: string;
  closureArtifactFile?: string; standaloneArtifactFile?: string; resourceReceiptFile?: string;
  capsulesRoot?: string;
  platformsRoot?: string;
  dataResourceReceiptFiles?: readonly string[];
  dataResourcesRoot?: string;
  versionInputDirectory?: string;
  freezeStorage?: boolean;
  previousContentMetadataFile?: string; output: string; receipt: string;
}>): Promise<void> {
  const policy = await readReleasePolicyReceipt(input.policy, { capability: "prepare", ...input });
  if (input.dataResourcesRoot != null && input.dataResourceReceiptFiles != null) throw new Error("choose --data-resources or --data-resource, not both");
  const dataResourceReceiptFiles = input.dataResourcesRoot == null ? input.dataResourceReceiptFiles
    : await resolveDataResourceReceipts(input.dataResourcesRoot);
  const acquirePrevious = async (): Promise<Buffer | null> => {
    const base = `${policy.target.publicBaseUrl.replace(/\/$/u, "")}/${input.channel}/`;
    const head = await fetch(`${base}latest/channel-head.json`, { redirect: "error", signal: AbortSignal.timeout(10_000) });
    if (head.status !== 404) {
      if (!head.ok) throw new Error(`previous channel head acquisition failed (${head.status})`);
      const value = await head.json() as JsonObject;
      if (value.head?.channel !== input.channel || value.head?.lanes == null || typeof value.head.lanes !== "object") throw new Error("previous channel head identity is invalid");
      const lane = value.head?.lanes?.content;
      if (lane != null) {
        if (typeof lane.url !== "string" || !lane.url.startsWith(base) || !/^[a-f0-9]{64}$/u.test(lane.sha256)) throw new Error("previous content lane binding is invalid");
        const response = await fetch(lane.url, { redirect: "error", signal: AbortSignal.timeout(10_000) });
        if (!response.ok) throw new Error(`previous content acquisition failed (${response.status})`);
        const body = Buffer.from(await response.arrayBuffer());
        if (createHash("sha256").update(body).digest("hex") !== lane.sha256) throw new Error("previous content digest mismatch");
        return body;
      }
    }
    return null;
  };
  const inventory = await readObject(input.shellInputs);
  if (!Array.isArray(inventory.shells) || inventory.shells.length === 0) throw new Error("prepare requires Shell input inventory");
  const selectedFile = async (path: string) => {
    const { sha256, size } = await describeFile(path); return { sha256, size };
  };
  const products: JsonObject = {};
  for (const item of inventory.shells) {
    if (!["electron", "terminal"].includes(item.shell) || !["darwin-arm64", "darwin-x64", "win32-x64"].includes(item.target)) {
      throw new Error("unsupported prepare Shell input");
    }
    products[`${item.shell}/${item.target}/scene`] = await selectedFile(join(input.scenesRoot,
      `exact-${item.shell}-scene-${item.target}-${input.sourceCommit}`, "scene.tar"));
    if (item.shell === "electron") {
      if (input.capsulesRoot != null) products[`capsule/${item.target}`] = await readObject(join(input.capsulesRoot, item.target, "capsule-content.json"));
      if (input.platformsRoot != null) products[`platform/${item.target}`] = await readObject(join(input.platformsRoot, item.target, "platform-resource.json"));
    }
  }
  for (const [name, path] of [["closure", input.closureArtifactFile], ["launcher", input.standaloneArtifactFile]] as const) {
    if (path != null) products[name] = await selectedFile(path);
  }
  // Local relocation is not a new release selection. Hashes and entrypoints are.
  const resourceIdentity = ({ id, file, sha256, size, treeSha256, entrypoint, sync }: JsonObject) => ({
    id, file: basename(file), sha256, size, treeSha256, entrypoint, ...(sync == null ? {} : { sync }),
  });
  if (input.resourceReceiptFile != null) products.runtime = (await readObject(input.resourceReceiptFile)).resources.map(resourceIdentity);
  if (dataResourceReceiptFiles != null) products.data = await Promise.all(dataResourceReceiptFiles.map(async file => resourceIdentity((await readObject(file)).resource)));
  const previousContentMetadataFile = await freezeVersionInput({
    directory: input.versionInputDirectory ?? join(input.output, "version-input"),
    selection: { policy, standaloneVersion: input.standaloneVersion, shells: inventory.shells, products, trust: await preparationTrust() },
    ...(input.freezeStorage ? { store: versionInputStorage(policy) } : {}),
    ...(input.previousContentMetadataFile == null ? {} : { previousContentFile: input.previousContentMetadataFile }), acquirePrevious,
  });
  type Shell = { type: string; version: string; scenes: { target: string; sceneDirectory: string; sceneManifestSha256: string }[] };
  const shells = new Map<string, Shell>();
  const capsuleProducts: Array<{ target: string; contentFile: string; archiveFile: string }> = [];
  const platformProducts: Array<{ target: string; resourceFile: string; archiveFile: string }> = [];
  let { closureArtifactFile, standaloneArtifactFile, resourceReceiptFile } = input;
  for (const item of inventory.shells) {
    if (!["electron", "terminal"].includes(item.shell) || !["darwin-arm64", "darwin-x64", "win32-x64"].includes(item.target)) throw new Error("unsupported prepare Shell input");
    const artifact = join(input.scenesRoot, `exact-${item.shell}-scene-${item.target}-${input.sourceCommit}`);
    const directory = join(artifact, "scene");
    await unpackSceneArtifact(join(artifact, "scene.tar"), directory);
    const manifestPath = join(directory, "scene.json"), scene = await readObject(manifestPath);
    if (scene.target !== item.target || typeof scene.shellVersion !== "string") throw new Error("prepare scene identity mismatch");
    const shell: Shell = shells.get(item.shell) ?? { type: item.shell, version: scene.shellVersion, scenes: [] };
    if (shell.version !== scene.shellVersion || shell.scenes.some(value => value.target === item.target)) throw new Error("duplicate or inconsistent prepare Shell scene");
    shell.scenes.push({ target: item.target, sceneDirectory: directory, sceneManifestSha256: createHash("sha256").update(await readFile(manifestPath)).digest("hex") });
    shells.set(item.shell, shell);
    closureArtifactFile ??= await localFile(directory, scene.closure?.file);
    standaloneArtifactFile ??= await localFile(directory, scene.standalone?.entrypoint);
    if (item.shell === "electron") resourceReceiptFile ??= await localFile(directory, "closure-resources.json");
    if (item.shell === "electron" && input.capsulesRoot != null) {
      capsuleProducts.push({ target: item.target,
        contentFile: await localFile(input.capsulesRoot, `${item.target}/capsule-content.json`),
        archiveFile: await localFile(input.capsulesRoot, `${item.target}/capsule.zip`) });
    }
    if (item.shell === "electron") {
      if (input.platformsRoot == null) throw new Error("Electron prepare requires --platforms independent products");
      platformProducts.push({ target: item.target,
        resourceFile: await localFile(input.platformsRoot, `${item.target}/platform-resource.json`),
        archiveFile: await localFile(input.platformsRoot, `${item.target}/platform.zip`) });
    }
  }
  if (closureArtifactFile == null || standaloneArtifactFile == null) throw new Error("prepare Shell inputs have no seeds");
  const { stdout } = await promisify(execFile)("git", ["show", "--no-patch", "--format=%cI", input.sourceCommit], { cwd: input.sourceRoot });
  const request: PrepareExactContentInput = {
    channel: input.channel, releaseVersion: input.releaseVersion, sourceCommit: input.sourceCommit, publishedAt: stdout.trim(),
    standaloneVersion: input.standaloneVersion, artifactBaseUrl: `${policy.target.publicBaseUrl.replace(/\/$/u, "")}/${input.channel}/${input.releaseVersion}`,
    closureArtifactFile, standaloneArtifactFile, resourceReceiptFile, previousContentMetadataFile,
    ...(dataResourceReceiptFiles == null ? {} : { dataResourceReceiptFiles }),
    ...(input.capsulesRoot == null ? {} : { capsuleProducts }),
    platformProducts,
    shells: [...shells.values()].sort((a, b) => a.type.localeCompare(b.type)), outputDirectory: input.output,
  };
  await prepareContent(request, input.receipt);
}

export async function finalizeReleaseContent(input: Readonly<{
  policy: string; prepared: string; distributions: string; output: string; receipt: string;
}>): Promise<void> {
  const prepareReceipt = join(input.prepared, "prepare-receipt.json"), prepared = await readObject(prepareReceipt);
  await readReleasePolicyReceipt(input.policy, { capability: "finalize", channel: String(prepared.channel), releaseVersion: String(prepared.releaseVersion), sourceCommit: String(prepared.sourceCommit) });
  const contributions = [];
  for (const entry of (await readdir(input.distributions, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory()) throw new Error("distribution collection must contain contribution directories");
    const directory = join(input.distributions, entry.name), receipt = join(directory, "shell-contribution.json");
    const contribution: JsonObject = await readObject(receipt);
    if (typeof contribution.artifact?.file !== "string") throw new Error("distribution contribution lacks artifact");
    contributions.push({ receipt, archiveFile: await localFile(directory, basename(contribution.artifact.file)) });
  }
  const relocated = async (descriptor: JsonObject, directory: string) => {
    if (typeof descriptor?.file !== "string") throw new Error("prepared artifact descriptor is incomplete");
    return localFile(directory, basename(descriptor.file));
  };
  await finalizeContent({ prepareReceipt,
    contentMetadataFile: await relocated(prepared.contentMetadata, join(input.prepared, "documents")),
    closureArtifactFile: await relocated(prepared.closureArtifact, join(input.prepared, "artifacts")),
    standaloneArtifactFile: await relocated(prepared.standaloneArtifact, join(input.prepared, "artifacts")),
    contributions, outputDirectory: input.output,
  }, input.receipt);
}
