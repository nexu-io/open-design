import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { buildReleaseCapsule, buildReleaseDistribution, buildReleasePlatform, buildReleaseScene } from "@/exact/native-build.ts";
import { resolveExactPlatformPlanNode } from "@/exact/plan.ts";
import { resolveReleasePolicy } from "@/policy/release-profile.ts";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
async function json(file: string, value: unknown) { await writeFile(file, JSON.stringify(value)); }
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "release-native-build-")); roots.push(root);
  const pkg = join(root, "tools/release/node_modules/@open-design/shell-electron");
  await mkdir(pkg, { recursive: true });
  await json(join(pkg, "package.json"), { name: "@open-design/shell-electron", type: "module", exports: { "./build": "./build.mjs" } });
  await writeFile(join(pkg, "build.mjs"), "export async function buildElectronScene(request) { return { request }; }\nexport async function buildElectronInstaller(request) { return { request }; }\nexport async function buildElectronCapsuleContent(request) { return { request, contentPath: request.outputRoot + '/capsule-content.json', archivePath: request.outputRoot + '/capsule.zip' }; }\n");
  const plan = join(root, "plan.json"), receipt = join(root, "receipt.json");
  await json(plan, { plan: { target: "darwin-arm64", nodes: { "electron.shell.build": { identity: `sha256:${"a".repeat(64)}` } } } });
  return { root, plan, receipt, shell: "electron", target: "darwin-arm64", output: join(root, "output"), resources: join(root, "resources.json"), nodeArchive: join(root, "node.tar.gz") };
}

it("resolves only the public build export in the selected workspace and passes typed scene inputs", async () => {
  const f = await fixture(); await buildReleaseScene({ ...f, nodeArchive: undefined });
  const result = JSON.parse(await readFile(f.receipt, "utf8"));
  expect(result.request).toEqual({ schemaVersion: 2, operation: "electron.scene.build", target: f.target, buildHash: "a".repeat(64),
    capsuleContentFile: expect.stringMatching(/release-capsule-baseline-[^/]+\/content\/capsule-content\.json$/u),
    capsuleArchiveFile: expect.stringMatching(/release-capsule-baseline-[^/]+\/content\/capsule\.zip$/u),
    acceptedClosureBaselineFile: join(f.root, "apps/closure/dist/index.mjs"), standaloneLauncherFile: join(f.root, "apps/closure/dist/launcher.mjs"),
    resourceReceiptFile: f.resources, sceneDirectory: f.output });
  await expect(buildReleaseScene({ ...f, nodeArchive: undefined, target: "win32-x64" })).rejects.toThrow("plan identity is invalid");
  await expect(buildReleaseScene({ ...f, nodeArchive: undefined, shell: "linux" })).rejects.toThrow("electron or terminal");
  await expect(buildReleaseScene(f)).rejects.toThrow("use build platform");
});

it("builds neutral Capsule content without Node archives, Closure inputs or version policy", async () => {
  const f = await fixture(); await buildReleaseCapsule(f);
  expect(JSON.parse(await readFile(f.receipt, "utf8"))).toEqual({ schemaVersion: 1, operation: "electron.capsule.build",
    contentPath: join(f.output, "capsule-content.json"), archivePath: join(f.output, "capsule.zip"),
    request: { target: f.target, outputRoot: f.output } });
  await expect(buildReleaseCapsule({ ...f, shell: "terminal" })).rejects.toThrow("requires electron");
  await expect(buildReleaseCapsule({ ...f, target: "linux-x64" })).rejects.toThrow("unsupported build target");
});

it.each(["unbound", "bound", "drift"])("builds an independent platform with verified metadata (%s)", async mode => {
  const fixtureInput = await fixture();
  const f = { ...fixtureInput, plan: mode === "unbound" ? undefined : fixtureInput.plan };
  const source = join(f.root, "platform-input");
  await writeFile(source, "source");
  const registryPath = join(f.root, "tools/release/resources/exact-plan-identities.json");
  await mkdir(join(f.root, "tools/release/resources"), { recursive: true });
  await json(registryPath, { schemaVersion: 1,
    identities: { "electron.platform.build": { schemaVersion: 1, parameters: ["target"], sourceSets: ["platform"] } },
    sourceSets: { platform: { paths: ["platform-input"] } } });
  const node = await resolveExactPlatformPlanNode({ root: f.root, registryPath, target: "darwin-arm64" });
  if (f.plan != null) await json(f.plan, { schemaVersion: 1, actions: [{ id: "electron.platform.build" }],
    plan: { target: f.target, nodes: { "electron.platform.build": node } } });
  const resource = { schemaVersion: 1, target: f.target,
    blob: { sha256: digest("platform"), size: 8, mediaType: "application/zip", sources: [] },
    treeSha256: "b".repeat(64), executables: ["bin/node"] };
  await writeFile(join(f.root, "tools/release/node_modules/@open-design/shell-electron/build.mjs"), `
    import { writeFile } from 'node:fs/promises';
    export async function buildElectronPlatformResource(request) {
      if (request.archivePath !== ${JSON.stringify(f.nodeArchive)}) throw Error('archive escaped');
      ${mode === "drift" ? `await writeFile(${JSON.stringify(source)}, 'changed');` : ""}
      await writeFile(request.outputArchivePath, 'platform', { flag: 'wx' });
      return { archivePath: request.outputArchivePath, resource: ${JSON.stringify(resource)} };
    }
  `);
  if (mode === "drift") {
    await expect(buildReleasePlatform(f)).rejects.toThrow("source changed during execution");
    await expect(readFile(f.receipt)).rejects.toThrow("ENOENT");
    return;
  }
  const result = await buildReleasePlatform(f);
  expect(result).toEqual({ schemaVersion: 1, operation: "electron.platform.build", target: f.target,
    resource, resourcePath: join(f.output, "platform-resource.json"), archivePath: join(f.output, "platform.zip"),
    ...(f.plan == null ? {} : { planNode: { id: "electron.platform.build", identity: node.identity, target: f.target } }) });
  expect(JSON.parse(await readFile(result.resourcePath, "utf8"))).toEqual(resource);
  expect(JSON.parse(await readFile(f.receipt, "utf8"))).toEqual(result);
  await expect(buildReleasePlatform(f)).rejects.toThrow("EEXIST");
  expect(await readFile(result.archivePath, "utf8")).toBe("platform");
  await expect(buildReleasePlatform({ ...f, shell: "terminal" })).rejects.toThrow("requires electron");
  await expect(buildReleasePlatform({ ...f, target: "linux-x64" })).rejects.toThrow("unsupported build target");
});

it("rejects unselected platform plans before creating build output", async () => {
  const f = await fixture();
  await json(f.plan, { schemaVersion: 1, actions: [], plan: { target: f.target } });
  await expect(buildReleasePlatform(f)).rejects.toThrow("not selected by a valid release plan");
  await expect(readFile(f.receipt)).rejects.toThrow("ENOENT");
  await json(f.plan, { schemaVersion: 1, actions: [{ id: "electron.platform.build" }], plan: { target: "win32-x64" } });
  await expect(buildReleasePlatform(f)).rejects.toThrow("not selected by a valid release plan");
});

it.each(["digest", "target", "source"])("rejects unbound platform output before writing release-neutral metadata (%s)", async kind => {
  const f = await fixture();
  const resource = { schemaVersion: 1, target: kind === "target" ? "darwin-x64" : f.target,
    blob: { sha256: kind === "digest" ? "a".repeat(64) : digest("platform"), size: 8, mediaType: "application/zip",
      sources: kind === "source" ? [{ kind: "remote", url: "https://invalid.test/platform.zip" }] : [] },
    treeSha256: "b".repeat(64), executables: ["bin/node"] };
  await writeFile(join(f.root, "tools/release/node_modules/@open-design/shell-electron/build.mjs"), `
    import { writeFile } from 'node:fs/promises';
    export async function buildElectronPlatformResource(request) {
      await writeFile(request.outputArchivePath, 'platform');
      return { archivePath: request.outputArchivePath, resource: ${JSON.stringify(resource)} };
    }
  `);
  await expect(buildReleasePlatform({ ...f, plan: undefined })).rejects.toThrow("product binding mismatch");
  await expect(readFile(join(f.output, "platform-resource.json"))).rejects.toThrow("ENOENT");
  await expect(readFile(f.receipt)).rejects.toThrow("ENOENT");
});

it("consumes a prebuilt Capsule without invoking its compiler or deleting caller inputs", async () => {
  const f = await fixture(), capsuleContent = join(f.root, "capsule-content.json"), capsuleArchive = join(f.root, "capsule.zip");
  await writeFile(capsuleContent, "content"); await writeFile(capsuleArchive, "archive");
  await writeFile(join(f.root, "tools/release/node_modules/@open-design/shell-electron/build.mjs"),
    "export async function buildElectronScene(request) { return { request }; }\nexport async function buildElectronCapsuleContent() { throw Error('Capsule must not be recompiled'); }\n");
  await buildReleaseScene({ ...f, nodeArchive: undefined, capsuleContent, capsuleArchive });
  expect(JSON.parse(await readFile(f.receipt, "utf8")).request).toMatchObject({ capsuleContentFile: capsuleContent, capsuleArchiveFile: capsuleArchive });
  expect(await readFile(capsuleContent, "utf8")).toBe("content");
  expect(await readFile(capsuleArchive, "utf8")).toBe("archive");
});

it("rejects incomplete or non-Electron Capsule inputs before native work", async () => {
  const f = await fixture();
  for (const input of [
    { ...f, capsuleContent: "content" },
    { ...f, capsuleArchive: "archive" },
    { ...f, shell: "terminal", capsuleContent: "content", capsuleArchive: "archive" },
  ]) await expect(buildReleaseScene(input)).rejects.toThrow("Capsule inputs require electron and both");
});

it("binds native distribution to authorized prepared content, trust and scene", async () => {
  const f = await fixture(), prepared = join(f.root, "prepared"), scene = join(f.root, "scene"), policy = join(f.root, "policy.json");
  await mkdir(join(prepared, "documents"), { recursive: true }); await mkdir(join(prepared, "trust")); await mkdir(scene);
  const content = join(prepared, "documents/content-metadata.json"), trust = join(prepared, "trust/keys.json");
  await writeFile(content, "content"); await writeFile(trust, "trust");
  const capsule = join(prepared, "documents/capsule-darwin-arm64.json");
  await writeFile(capsule, "capsule");
  await mkdir(join(prepared, "artifacts"));
  const capsuleArchive = join(prepared, "artifacts/capsule-current.zip");
  await writeFile(capsuleArchive, "current archive");
  const manifest = JSON.stringify({ target: f.target }); await writeFile(join(scene, "scene.json"), manifest);
  const identity = { channel: "betahyx", releaseVersion: "0.1.0-betahyx.1", sourceCommit: "a".repeat(40) };
  await json(policy, resolveReleasePolicy({ schemaVersion: 1, operation: "release.policy.resolve", ...identity, profile: "exact-validation", sourceRef: "refs/heads/feat/test",
    switches: { endUserDistribution: false, stableAuthorized: false }, target: { endpointUrl: "https://storage.example", bucket: "releases", publicBaseUrl: "https://public.example",
      latestChannelHeadUrl: "https://storage.example/releases/betahyx/latest/channel-head.json" } }));
  await json(join(prepared, "prepare-receipt.json"), { ...identity, contentMetadata: { sha256: digest("content"), size: 7 }, trustFile: { sha256: digest("trust"), size: 5 },
    shells: [{ type: f.shell, scenes: [{ target: f.target, sceneManifestSha256: digest(manifest), capsule: { manifest: { sha256: digest("capsule"), size: 7 }, archive: { file: "capsule-current.zip", sha256: digest("current archive"), size: 15 } } }] }] });
  const input = { ...f, ...identity, prepared, scene, policy };
  await buildReleaseDistribution(input);
  expect(await readFile(join(f.output, "shell-contribution.json"), "utf8")).toBe(await readFile(f.receipt, "utf8"));
  expect(JSON.parse(await readFile(f.receipt, "utf8")).request).toMatchObject({ operation: "electron.distribution.build",
    schemaVersion: 2, acceptedCapsuleArchiveFile: capsuleArchive, acceptedCapsuleManifestFile: capsule, acceptedContentMetadataFile: content, acceptedTrustFile: trust, channelHeadUrl: "https://public.example/betahyx/latest/channel-head.json", sceneManifestSha256: digest(manifest) });
  await expect(buildReleaseDistribution({ ...input, channel: "stable" })).rejects.toThrow("binding mismatch");
  await writeFile(capsuleArchive, "wrong archive");
  await expect(buildReleaseDistribution(input)).rejects.toThrow("prepared Capsule archive binding verification failed");
  await writeFile(capsuleArchive, "current archive");
  await writeFile(trust, "tampered");
  await expect(buildReleaseDistribution(input)).rejects.toThrow("prepared trust binding verification failed");
  await writeFile(trust, "trust"); await writeFile(join(scene, "scene.json"), JSON.stringify({ target: f.target, extra: true }));
  await expect(buildReleaseDistribution(input)).rejects.toThrow("prepared scene binding mismatch");
});

it.skipIf(process.platform !== "darwin")("rejects an invalid Terminal source lock before acquiring archives or starting native assembly", async () => {
  const f = await fixture();
  const terminal = join(f.root, "shells/terminal");
  await mkdir(terminal, { recursive: true });
  await json(join(terminal, "node-lock.json"), { schemaVersion: 1, version: "24.18.0", targets: {
    "darwin-arm64": { archive: "node-v24.18.0-darwin-arm64.tar.gz", mediaType: "application/gzip",
      sha256: "a".repeat(64), url: "https://untrusted.example/node.tar.gz" },
  } });
  await expect(buildReleaseScene({ ...f, nodeArchive: undefined, shell: "terminal" })).rejects.toThrow("invalid official Node source");
});
