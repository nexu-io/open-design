import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { buildReleaseCapsule, buildReleaseDistribution, buildReleaseScene } from "../src/exact/native-build.ts";
import { resolveReleasePolicy } from "../src/policy/release-profile.ts";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
async function json(file: string, value: unknown) { await writeFile(file, JSON.stringify(value)); }
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "release-native-build-")); roots.push(root);
  const pkg = join(root, "tools/release/node_modules/@open-design/shell-electron");
  await mkdir(pkg, { recursive: true });
  await json(join(pkg, "package.json"), { name: "@open-design/shell-electron", type: "module", exports: { "./build": "./build.mjs" } });
  await writeFile(join(pkg, "build.mjs"), "export async function buildElectronScene(request) { return { request }; }\nexport async function buildElectronInstaller(request) { return { request }; }\nexport async function buildElectronCapsuleContent(request) { return { request }; }\n");
  const plan = join(root, "plan.json"), receipt = join(root, "receipt.json");
  await json(plan, { plan: { target: "darwin-arm64", nodes: { "electron.shell.build": { identity: `sha256:${"a".repeat(64)}` } } } });
  return { root, plan, receipt, shell: "electron", target: "darwin-arm64", output: join(root, "output"), resources: join(root, "resources.json"), nodeArchive: join(root, "node.tar.gz") };
}

it("resolves only the public build export in the selected workspace and passes typed scene inputs", async () => {
  const f = await fixture(); await buildReleaseScene(f);
  const result = JSON.parse(await readFile(f.receipt, "utf8"));
  expect(result.request).toEqual({ schemaVersion: 1, operation: "electron.scene.build", target: f.target, buildHash: "a".repeat(64),
    acceptedClosureBaselineFile: join(f.root, "apps/closure/dist/index.mjs"), standaloneLauncherFile: join(f.root, "apps/closure/dist/launcher.mjs"),
    resourceReceiptFile: f.resources, sceneDirectory: f.output, platformArchivePath: f.nodeArchive });
  await expect(buildReleaseScene({ ...f, target: "win32-x64" })).rejects.toThrow("plan identity is invalid");
  await expect(buildReleaseScene({ ...f, shell: "linux" })).rejects.toThrow("electron or terminal");
});

it("builds neutral Capsule content without Node archives, Closure inputs or version policy", async () => {
  const f = await fixture(); await buildReleaseCapsule(f);
  expect(JSON.parse(await readFile(f.receipt, "utf8"))).toEqual({ schemaVersion: 1, operation: "electron.capsule.build",
    request: { target: f.target, outputRoot: f.output } });
  await expect(buildReleaseCapsule({ ...f, shell: "terminal" })).rejects.toThrow("requires electron");
  await expect(buildReleaseCapsule({ ...f, target: "linux-x64" })).rejects.toThrow("unsupported build target");
});

it("binds native distribution to authorized prepared content, trust and scene", async () => {
  const f = await fixture(), prepared = join(f.root, "prepared"), scene = join(f.root, "scene"), policy = join(f.root, "policy.json");
  await mkdir(join(prepared, "documents"), { recursive: true }); await mkdir(join(prepared, "trust")); await mkdir(scene);
  const content = join(prepared, "documents/content-metadata.json"), trust = join(prepared, "trust/keys.json");
  await writeFile(content, "content"); await writeFile(trust, "trust");
  const manifest = JSON.stringify({ target: f.target }); await writeFile(join(scene, "scene.json"), manifest);
  const identity = { channel: "betahyx", releaseVersion: "0.1.0-betahyx.1", sourceCommit: "a".repeat(40) };
  await json(policy, resolveReleasePolicy({ schemaVersion: 1, operation: "release.policy.resolve", ...identity, profile: "exact-validation", sourceRef: "refs/heads/feat/test",
    switches: { endUserDistribution: false, stableAuthorized: false }, target: { endpointUrl: "https://storage.example", bucket: "releases", publicBaseUrl: "https://public.example",
      latestChannelHeadUrl: "https://storage.example/releases/betahyx/latest/channel-head.json" } }));
  await json(join(prepared, "prepare-receipt.json"), { ...identity, contentMetadata: { sha256: digest("content"), size: 7 }, trustFile: { sha256: digest("trust"), size: 5 },
    shells: [{ type: f.shell, scenes: [{ target: f.target, sceneManifestSha256: digest(manifest) }] }] });
  const input = { ...f, ...identity, prepared, scene, policy };
  await buildReleaseDistribution(input);
  expect(await readFile(join(f.output, "shell-contribution.json"), "utf8")).toBe(await readFile(f.receipt, "utf8"));
  expect(JSON.parse(await readFile(f.receipt, "utf8")).request).toMatchObject({ operation: "electron.distribution.build",
    acceptedContentMetadataFile: content, acceptedTrustFile: trust, channelHeadUrl: "https://public.example/betahyx/latest/channel-head.json", sceneManifestSha256: digest(manifest) });
  await expect(buildReleaseDistribution({ ...input, channel: "stable" })).rejects.toThrow("binding mismatch");
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
  await expect(buildReleaseScene({ ...f, shell: "terminal" })).rejects.toThrow("invalid official Node source");
});
