import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { generateKeyPairSync } from "node:crypto";
import { closeSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { expect } from "vitest";

import { canonicalJson, sha256Hex, signStandaloneChannelHead, signStandaloneMetadata, type StandaloneMetadata } from "@open-design/standalone";

export const repoRoot = resolve(import.meta.dirname, "../../..");
export const terminalRoot = resolve(import.meta.dirname, "..");
const temporaryRoots: string[] = [];
const fixtureServers: ChildProcess[] = [];

export type TerminalOptions = { attachmentId?: string; channelHeadUrl?: string; activationSource?: string };
export type TerminalRunner = (root: string, storeRoot: string, channel: string, namespace: string, operation: string, options?: TerminalOptions) => Record<string, any>;
type SceneRequestInput = { target: string; shellVersion: string; nodeVersion: string; nodeArchive: string; nodeArchiveSha256: string; closureFile: string; standaloneDirectory: string; sceneDirectory: string };
type DistributionRequestInput = { target: string; sceneDirectory: string; sceneManifestSha256: string; releaseDocumentsDirectory: string; trustFile: string; release: { channel: string; releaseVersion: string; sourceCommit: string; publishedAt: string; artifactBaseUrl: string }; outputDirectory: string };

export function cleanupFixtures(): void {
  for (const server of fixtureServers.splice(0)) server.kill();
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
}

export function run(command: string, args: string[], options: { allowFailure?: boolean; timeout?: number } = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", timeout: options.timeout ?? 120_000 });
  if (!options.allowFailure && result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed (${result.status}):\n${result.stderr}\n${result.stdout}`);
  return result;
}

export function powershell(script: string, args: string[], options: { allowFailure?: boolean } = {}) {
  return run("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script, ...args], options);
}

export function writeSceneRequest(path: string, input: SceneRequestInput): void {
  writeFileSync(path, canonicalJson({
    schemaVersion: 1,
    operation: "terminal.scene.build",
    target: input.target,
    shellVersion: input.shellVersion,
    node: { version: input.nodeVersion, archiveFile: input.nodeArchive, archiveSha256: input.nodeArchiveSha256 },
    closureArtifactFile: input.closureFile,
    standaloneDirectory: input.standaloneDirectory,
    sceneDirectory: input.sceneDirectory,
  }));
}

export function writeDistributionRequest(path: string, input: DistributionRequestInput): void {
  writeFileSync(path, canonicalJson({
    schemaVersion: 1,
    operation: "terminal.distribution.build",
    target: input.target,
    sceneDirectory: input.sceneDirectory,
    sceneManifestSha256: input.sceneManifestSha256,
    releaseDocumentsDirectory: input.releaseDocumentsDirectory,
    trustFile: input.trustFile,
    release: input.release,
    outputDirectory: input.outputDirectory,
  }));
}

function startToolsServeReleaseStorage(root: string): string {
  const stdoutFile = join(root, "tools-serve.stdout");
  const stderrFile = join(root, "tools-serve.stderr");
  const stdout = openSync(stdoutFile, "w");
  const stderr = openSync(stderrFile, "w");
  const server = spawn("pnpm", ["--silent", "--filter", "@open-design/tools-serve", "dev", "start", "release-storage", "--json", "--port", "0"], {
    cwd: repoRoot,
    stdio: ["ignore", stdout, stderr],
  });
  closeSync(stdout);
  closeSync(stderr);
  fixtureServers.push(server);
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const line = readFileSync(stdoutFile, "utf8").split(/\r?\n/).find((candidate) => candidate.startsWith("{"));
    if (line != null) {
      const info = JSON.parse(line) as { bucket: string; endpointUrl: string };
      return `${info.endpointUrl}/${info.bucket}`;
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20);
  }
  throw new Error(`tools-serve release-storage did not start:\n${readFileSync(stderrFile, "utf8")}`);
}

function publishFixtureFile(baseUrl: string, file: string): void {
  const source = `
const fs = require("node:fs");
fetch(process.argv[1], { method: "PUT", body: fs.readFileSync(process.argv[2]) })
  .then((response) => { if (!response.ok) throw new Error(String(response.status)); })
  .catch((error) => { console.error(error); process.exitCode = 1; });
`;
  run(process.execPath, ["-e", source, `${baseUrl}/${encodeURIComponent(basename(file))}`, file]);
}

function releaseDocuments(root: string, closure: Uint8Array, baseUrl: string) {
  const keys = generateKeyPairSync("ed25519");
  const signer = { keyId: "terminal-e2e", privateKey: keys.privateKey };
  writeFileSync(join(root, "trust.json"), canonicalJson({ schemaVersion: 1, keys: [{ keyId: signer.keyId, publicKey: keys.publicKey.export({ type: "spki", format: "pem" }) }] }));
  const create = (channel: string, releaseVersion: string, minVersion: string, artifactBytes: Uint8Array) => {
    const artifactFile = join(root, `${releaseVersion}-closure.mjs`);
    writeFileSync(artifactFile, artifactBytes);
    const metadata: StandaloneMetadata = {
      schemaVersion: 2,
      channel,
      releaseVersion,
      standaloneVersion: "0.1.0",
      sourceCommit: "993f2e1a90845f7068b705e970ada2bf48d0cb84",
      publishedAt: "2026-08-24T00:00:00.000Z",
      components: [{ name: "closure-fixture", mode: "required", artifact: { entrypoint: "fixture.mjs", sha256: sha256Hex(artifactBytes), size: artifactBytes.byteLength, url: `${baseUrl}/${encodeURIComponent(basename(artifactFile))}` } }],
      shellRequirements: [{ type: "terminal", minVersion }],
    };
    const metadataBytes = Buffer.from(canonicalJson(signStandaloneMetadata(metadata, [signer])));
    const metadataFile = join(root, `${releaseVersion}-metadata.json`);
    writeFileSync(metadataFile, metadataBytes);
    const head = signStandaloneChannelHead({ schemaVersion: 1, channel, publishedAt: metadata.publishedAt, lanes: {
      content: { releaseVersion, url: `${baseUrl}/${encodeURIComponent(basename(metadataFile))}`, sha256: sha256Hex(metadataBytes), size: metadataBytes.byteLength },
    } }, [signer]);
    const headFile = join(root, `${releaseVersion}-head.json`);
    writeFileSync(headFile, canonicalJson(head));
    const headUrl = `${baseUrl}/${encodeURIComponent(basename(headFile))}`;
    return {
      artifactFile,
      artifactSha256: sha256Hex(artifactBytes),
      headFile,
      headUrl,
      metadataFile,
      release: { channel, releaseVersion, sourceCommit: metadata.sourceCommit, publishedAt: metadata.publishedAt, artifactBaseUrl: baseUrl },
    };
  };
  const beta2 = Buffer.concat([closure, Buffer.from("\n// terminal exact beta 2\n")]);
  const beta3 = Buffer.concat([beta2, Buffer.from("// terminal exact beta 3\n")]);
  const preview1 = Buffer.concat([closure, Buffer.from("\n// terminal exact preview 1\n")]);
  const releases = {
    trustFile: join(root, "trust.json"),
    beta1: create("betahyx", "0.1.0-betahyx.1", "0.1.0", closure),
    beta2: create("betahyx", "0.1.0-betahyx.2", "0.1.0", beta2),
    beta3: create("betahyx", "0.1.0-betahyx.3", "0.2.0", beta3),
    preview1: create("previewhyx", "0.1.0-previewhyx.1", "0.1.0", preview1),
  };
  for (const release of [releases.beta1, releases.beta2, releases.beta3, releases.preview1]) {
    publishFixtureFile(baseUrl, release.artifactFile);
    publishFixtureFile(baseUrl, release.metadataFile);
    publishFixtureFile(baseUrl, release.headFile);
  }
  return releases;
}

export function prepareExactFixture(target: string) {
  const lock = JSON.parse(readFileSync(join(terminalRoot, "node-lock.json"), "utf8")) as { version: string; targets: Record<string, { archive: string; sha256: string }> };
  const locked = lock.targets[target];
  if (locked == null) throw new Error(`Terminal Node lock lacks ${target}`);
  const archive = process.env.OD_TERMINAL_NODE_ARCHIVE ?? join(repoRoot, ".tmp/terminal-e2e/node", locked.archive);
  if (!existsSync(archive)) return null;
  const closureFile = join(repoRoot, "apps/closure/dist/fixture.mjs");
  const standaloneDirectory = join(repoRoot, "packages/standalone/dist");
  if (!existsSync(closureFile) || !existsSync(join(standaloneDirectory, "index.mjs"))) throw new Error("build Closure and Standalone before the Terminal native test");
  const work = mkdtempSync(join(tmpdir(), `terminal-${target}-e2e-`)); temporaryRoots.push(work);
  const directories = { documents: join(work, "documents"), output: join(work, "output"), unpacked: join(work, "unpacked"), store: join(work, "store") };
  mkdirSync(directories.documents); mkdirSync(directories.output); mkdirSync(directories.unpacked);
  const releases = releaseDocuments(work, new Uint8Array(readFileSync(closureFile)), startToolsServeReleaseStorage(work));
  writeFileSync(join(directories.documents, "content-metadata.json"), readFileSync(releases.beta1.metadataFile));
  return { archive, closureFile, directories, lock, locked, releases, standaloneDirectory, work };
}

export function verifyExactLifecycle(root: string, store: string, terminal: TerminalRunner, releases: ReturnType<typeof releaseDocuments>): void {
  expect(terminal(root, store, "betahyx", "shared", "probe")).toMatchObject({ outcome: "ready", result: { channel: "betahyx" } });
  const first = terminal(root, store, "betahyx", "shared", "start", { attachmentId: "terminal-a" });
  expect(first).toMatchObject({ outcome: "ready", result: { state: "running", references: 1 } });
  const second = terminal(root, store, "betahyx", "shared", "start", { attachmentId: "terminal-b" });
  expect(second.result).toMatchObject({ instanceId: first.result.instanceId, references: 2 });
  expect(terminal(root, store, "betahyx", "shared", "heartbeat", { attachmentId: "terminal-b" }).result.references).toBe(2);
  expect(terminal(root, store, "betahyx", "shared", "release", { attachmentId: "terminal-a" }).result.references).toBe(1);
  expect(terminal(root, store, "betahyx", "shared", "release", { attachmentId: "terminal-b" }).result).toMatchObject({ state: "running", references: 0 });
  expect(terminal(root, store, "betahyx", "shared", "stop").result.state).toBe("stopped");
  expect(terminal(root, store, "betahyx", "shared", "prepare-update", { channelHeadUrl: releases.beta2.headUrl, activationSource: "silent-policy" }).result).toMatchObject({ status: "prepared", authorized: true });
  expect(readFileSync(join(store, "blobs", "sha256", releases.beta2.artifactSha256))).toEqual(readFileSync(releases.beta2.artifactFile));
  const applied = terminal(root, store, "betahyx", "shared", "apply-update");
  expect(applied.result).toMatchObject({ state: "running" });
  expect(applied.result.generationId).not.toBe(first.result.generationId);
  expect(terminal(root, store, "betahyx", "shared", "prepare-update", { channelHeadUrl: releases.beta3.headUrl }).result).toMatchObject({ status: "shell-reinstall-required", minimumVersion: "0.2.0" });
  expect(terminal(root, store, "previewhyx", "shared", "prepare-update", { channelHeadUrl: releases.preview1.headUrl, activationSource: "user-restart" }).result).toMatchObject({ status: "prepared", authorized: true });
  expect(terminal(root, store, "previewhyx", "shared", "apply-update").result).toMatchObject({ state: "running", scope: { channel: "previewhyx", namespace: "shared" } });
}
