import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { generateKeyPairSync } from "node:crypto";
import { closeSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { expect } from "vitest";

import { stopSidecars, type SidecarStamp } from "@open-design/sidecar";
import { canonicalJson, sha256Hex, signStandaloneChannelHead, signStandaloneMetadata, type StandaloneMetadata } from "@open-design/standalone";

export const repoRoot = resolve(import.meta.dirname, "../../..");
export const terminalRoot = resolve(import.meta.dirname, "..");
const temporaryRoots: string[] = [];
const fixtureServers: ChildProcess[] = [];
const terminalSidecars = new Map<string, SidecarStamp>();

export type TerminalOptions = { attachmentId?: string; attachmentCapability?: string; channelHeadUrl?: string; activationPolicy?: string; feedbackFile?: string };
export type TerminalRunner = (root: string, storeRoot: string, channel: string, namespace: string, operation: string, options?: TerminalOptions) => Record<string, any>;
type SceneRequestInput = { target: string; shellVersion: string; nodeVersion: string; nodeArchive: string; nodeArchiveSha256: string; closureFile: string; standaloneDirectory: string; sidecarDirectory: string; platformDirectory: string; sceneDirectory: string };
type DistributionRequestInput = { target: string; sceneDirectory: string; sceneManifestSha256: string; releaseDocumentsDirectory: string; trustFile: string; release: { channel: string; releaseVersion: string; sourceCommit: string; publishedAt: string; artifactBaseUrl: string }; outputDirectory: string };

export async function cleanupFixtures(): Promise<void> {
  const stamps = [...terminalSidecars.values()];
  terminalSidecars.clear();
  if (stamps.length > 0) await stopSidecars(stamps.map((stamp) => ({ stamp }))).catch(() => undefined);
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
    sidecarDirectory: input.sidecarDirectory,
    platformDirectory: input.platformDirectory,
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

export function expectedShellBuildHash(scene: string, target: string, nodeArchiveSha256: string): string {
  const digest = (relativePath: string) => sha256Hex(readFileSync(join(scene, relativePath)));
  const nodeExecutable = target.startsWith("win32-") ? "carrier/node/node.exe" : "carrier/node/bin/node";
  const lines = [
    `carrier_lock=${digest("carrier.lock")}`,
    `fixture_lifecycle=${digest("runtime/fixture-lifecycle.mjs")}`,
    `fixture_shell_updater=${digest("runtime/fixture-shell-updater.mjs")}`,
    `fossil=${digest("runtime/fossil.mjs")}`,
    `runtime_modules=${digest("runtime/modules.json")}`,
    `sidecar_host=${digest("runtime/sidecar-host.mjs")}`,
    `sidecar_bootstrap=${digest("runtime/sidecar-bootstrap.mjs")}`,
    `node_archive=${nodeArchiveSha256}`,
    `node_executable=${digest(nodeExecutable)}`,
    `ps_install=${digest("ps1/install.ps1")}`,
    `ps_terminal=${digest("ps1/terminal.ps1")}`,
    `sh_install=${digest("sh/install.sh")}`,
    `sh_terminal=${digest("sh/terminal.sh")}`,
    `standalone=${digest("runtime/standalone/index.mjs")}`,
    `target=${target}`,
    ...readdirSync(join(scene, "contract")).sort().map((name) => `contract/${name}=${digest(`contract/${name}`)}`),
  ];
  return sha256Hex(`${lines.join("\n")}\n`);
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

function publishFixtureFile(baseUrl: string, file: string, key = encodeURIComponent(basename(file))): void {
  const source = `
const fs = require("node:fs");
fetch(process.argv[1], { method: "PUT", body: fs.readFileSync(process.argv[2]) })
  .then((response) => { if (!response.ok) throw new Error(String(response.status)); })
  .catch((error) => { console.error(error); process.exitCode = 1; });
`;
  run(process.execPath, ["-e", source, `${baseUrl}/${key}`, file]);
}

function releaseDocuments(root: string, closure: Uint8Array, launcher: Uint8Array, baseUrl: string) {
  const keys = generateKeyPairSync("ed25519");
  const signer = { keyId: "terminal-e2e", privateKey: keys.privateKey };
  writeFileSync(join(root, "trust.json"), canonicalJson({ schemaVersion: 1, keys: [{ keyId: signer.keyId, publicKey: keys.publicKey.export({ type: "spki", format: "pem" }) }] }));
  const create = (channel: string, releaseVersion: string, minVersion: string, artifactBytes: Uint8Array) => {
    const artifactFile = join(root, `${releaseVersion}-closure.mjs`);
    writeFileSync(artifactFile, artifactBytes);
    const artifactSha256 = sha256Hex(artifactBytes);
    const launcherFile = join(root, `${releaseVersion}-standalone-launcher.mjs`);
    writeFileSync(launcherFile, launcher);
    const launcherSha256 = sha256Hex(launcher);
    const metadata: StandaloneMetadata = {
      schemaVersion: 4,
      channel,
      releaseVersion,
      standaloneVersion: "0.1.0",
      sourceCommit: "993f2e1a90845f7068b705e970ada2bf48d0cb84",
      publishedAt: "2026-08-24T00:00:00.000Z",
      blobs: {
        [artifactSha256]: { sha256: artifactSha256, size: artifactBytes.byteLength, mediaType: "text/javascript", sources: [{ kind: "remote", url: `${baseUrl}/${encodeURIComponent(basename(artifactFile))}` }] },
        [launcherSha256]: { sha256: launcherSha256, size: launcher.byteLength, mediaType: "text/javascript", sources: [{ kind: "remote", url: `${baseUrl}/${encodeURIComponent(basename(launcherFile))}` }] },
      },
      resources: [
        { id: "standalone-launcher", component: "standalone.launcher", blob: launcherSha256, sync: true, materialization: { type: "file", entrypoint: "launcher.mjs" } },
        { id: "closure-fixture", component: "standalone.resource", blob: artifactSha256, sync: true, materialization: { type: "file", entrypoint: "fixture.mjs" } },
      ],
      shellRequirements: [{ type: "terminal", minVersion, buildHash: "b".repeat(64) }],
    };
    const metadataBytes = Buffer.from(canonicalJson(signStandaloneMetadata(metadata, [signer])));
    const metadataFile = join(root, `${releaseVersion}-metadata.json`);
    writeFileSync(metadataFile, metadataBytes);
    const head = signStandaloneChannelHead({ schemaVersion: 1, channel, publishedAt: metadata.publishedAt, lanes: {
      content: { releaseVersion, url: `${baseUrl}/${encodeURIComponent(basename(metadataFile))}`, sha256: sha256Hex(metadataBytes), size: metadataBytes.byteLength },
    } }, [signer]);
    const headFile = join(root, `${releaseVersion}-head.json`);
    writeFileSync(headFile, canonicalJson(head));
    return {
      artifactFile,
      artifactSha256,
      launcherFile,
      launcherSha256,
      headFile,
      metadataFile,
      release: { channel, releaseVersion, sourceCommit: metadata.sourceCommit, publishedAt: metadata.publishedAt, artifactBaseUrl: baseUrl },
    };
  };
  const beta2 = Buffer.concat([closure, Buffer.from("\n// terminal exact beta 2\n")]);
  const beta3 = Buffer.concat([beta2, Buffer.from("// terminal exact beta 3\n")]);
  const preview1 = Buffer.concat([closure, Buffer.from("\n// terminal exact preview 1\n")]);
  const releases = {
    trustFile: join(root, "trust.json"),
    beta1: create("somechan", "0.1.0-somechan.1", "0.1.0", closure),
    beta2: create("somechan", "0.1.0-somechan.2", "0.1.0", beta2),
    beta3: create("somechan", "0.1.0-somechan.3", "0.2.0", beta3),
    preview1: create("somepreview", "0.1.0-somepreview.1", "0.1.0", preview1),
    latestUrls: {
      somechan: `${baseUrl}/somechan/latest/channel-head.json`,
      somepreview: `${baseUrl}/somepreview/latest/channel-head.json`,
    },
  };
  for (const release of [releases.beta1, releases.beta2, releases.beta3, releases.preview1]) {
    publishFixtureFile(baseUrl, release.artifactFile);
    publishFixtureFile(baseUrl, release.launcherFile);
    publishFixtureFile(baseUrl, release.metadataFile);
  }
  const promote = (release: typeof releases.beta1) => {
    publishFixtureFile(baseUrl, release.headFile, `${release.release.channel}/latest/channel-head.json`);
  };
  promote(releases.beta1);
  return { ...releases, promote };
}

export function prepareExactFixture(target: string) {
  const lock = JSON.parse(readFileSync(join(terminalRoot, "node-lock.json"), "utf8")) as { version: string; targets: Record<string, { archive: string; sha256: string }> };
  const locked = lock.targets[target];
  if (locked == null) throw new Error(`Terminal Node lock lacks ${target}`);
  const archive = process.env.OD_TERMINAL_NODE_ARCHIVE ?? join(repoRoot, ".tmp/terminal-e2e/node", locked.archive);
  if (!existsSync(archive)) return null;
  const closureFile = join(repoRoot, "apps/closure/dist/index.mjs");
  const standaloneDirectory = join(repoRoot, "packages/standalone/dist");
  const sidecarDirectory = join(repoRoot, "packages/sidecar/dist");
  const platformDirectory = join(repoRoot, "packages/platform/dist");
  if (!existsSync(closureFile) || !existsSync(join(standaloneDirectory, "index.mjs")) || !existsSync(join(sidecarDirectory, "index.mjs")) || !existsSync(join(platformDirectory, "index.mjs"))) throw new Error("build Closure, Standalone, Sidecar, and Platform before the Terminal native test");
  const work = mkdtempSync(join(tmpdir(), `terminal-${target}-e2e-`)); temporaryRoots.push(work);
  const directories = { documents: join(work, "documents"), output: join(work, "output"), unpacked: join(work, "unpacked"), store: join(work, "store") };
  mkdirSync(directories.documents); mkdirSync(directories.output); mkdirSync(directories.unpacked);
  const releases = releaseDocuments(
    work,
    new Uint8Array(readFileSync(closureFile)),
    new Uint8Array(readFileSync(join(standaloneDirectory, "index.mjs"))),
    startToolsServeReleaseStorage(work),
  );
  writeFileSync(join(directories.documents, "content-metadata.json"), readFileSync(releases.beta1.metadataFile));
  return { archive, closureFile, directories, lock, locked, releases, standaloneDirectory, sidecarDirectory, platformDirectory, work };
}

export function verifyExactLifecycle(root: string, store: string, terminal: TerminalRunner, releases: ReturnType<typeof releaseDocuments>): void {
  for (const [channel, namespace] of [["somechan", "shared"], ["somechan", "updater-scenario"], ["somepreview", "shared"]]) {
    const stamp = { channel, namespace, source: "standalone", mode: "runtime", app: "standalone" };
    terminalSidecars.set(JSON.stringify(stamp), stamp);
  }
  const feedbackFile = join(dirname(store), "terminal-feedback.jsonl");
  expect(terminal(root, store, "somechan", "shared", "probe")).toMatchObject({ outcome: "ready", result: { channel: "somechan" } });
  const first = terminal(root, store, "somechan", "shared", "start", { attachmentId: "terminal-a", feedbackFile });
  expect(first).toMatchObject({ outcome: "ready", result: { state: "running", references: 1, attachmentCapability: expect.any(String), sidecar: { bootstrapPid: expect.any(Number), generationPid: expect.any(Number), hostPid: expect.any(Number), status: "ready" } } });
  expect(first.result.sidecar.bootstrapPid).not.toBe(first.result.sidecar.hostPid);
  const second = terminal(root, store, "somechan", "shared", "start", { attachmentId: "terminal-b" });
  expect(second.result).toMatchObject({ instanceId: first.result.instanceId, references: 2, attachmentCapability: expect.any(String), sidecar: { generationPid: first.result.sidecar.generationPid, status: "ready" } });
  expect(terminal(root, store, "somechan", "shared", "heartbeat", { attachmentId: "terminal-b", attachmentCapability: second.result.attachmentCapability }).result.references).toBe(2);
  expect(terminal(root, store, "somechan", "shared", "release", { attachmentId: "terminal-a", attachmentCapability: first.result.attachmentCapability }).result.references).toBe(1);
  expect(terminal(root, store, "somechan", "shared", "release", { attachmentId: "terminal-b", attachmentCapability: second.result.attachmentCapability }).result).toMatchObject({ state: "running", references: 0 });
  const reattached = terminal(root, store, "somechan", "shared", "start", { attachmentId: "terminal-a" });
  expect(reattached.result).toMatchObject({
    generationId: first.result.generationId,
    references: 1,
    sidecar: { generationPid: first.result.sidecar.generationPid, status: "ready" },
  });
  expect(reattached.result.sidecar.hostPid).not.toBe(first.result.sidecar.hostPid);
  expect(terminal(root, store, "somechan", "shared", "release", { attachmentId: "terminal-a", attachmentCapability: reattached.result.attachmentCapability }).result.references).toBe(0);
  expect(terminal(root, store, "somechan", "updater-scenario", "start", { attachmentId: "terminal-active" }).result).toMatchObject({ state: "running" });
  expect(terminal(root, store, "somechan", "updater-scenario", "shell-update-check").result).toMatchObject({ outcome: "accepted", snapshot: { state: "available" } });
  const downloadedShell = terminal(root, store, "somechan", "updater-scenario", "shell-update-download").result;
  expect(downloadedShell).toMatchObject({ snapshot: { state: "ready", handoff: { shell: { type: "terminal", version: "0.0.0", buildHash: "0".repeat(64) } } } });
  expect(downloadedShell.snapshot.handoff.shell).not.toMatchObject({ version: "0.1.0" });
  expect(terminal(root, store, "somechan", "updater-scenario", "shell-update-install").result).toMatchObject({ outcome: "blocked", snapshot: { blockedBy: [{ attachmentId: "terminal-active" }] } });
  expect(terminal(root, store, "somechan", "updater-scenario", "shell-update-later").result).toMatchObject({ snapshot: { state: "ready" } });
  expect(terminal(root, store, "somechan", "updater-scenario", "shell-update-force").result).toMatchObject({ outcome: "accepted", snapshot: { state: "handed-off" } });
  expect(terminal(root, store, "somechan", "updater-scenario", "shell-update-confirm").result).toMatchObject({ outcome: "accepted", snapshot: { state: "installed", handoff: { shell: downloadedShell.snapshot.handoff.shell } } });
  releases.promote(releases.beta2);
  expect(terminal(root, store, "somechan", "shared", "prepare-update", { channelHeadUrl: releases.latestUrls.somechan, activationPolicy: "authorize-silent", feedbackFile }).result).toMatchObject({ status: "prepared", authorized: true });
  expect(readFileSync(join(store, "blobs", "sha256", releases.beta2.artifactSha256))).toEqual(readFileSync(releases.beta2.artifactFile));
  expect(readFileSync(join(store, "blobs", "sha256", releases.beta2.launcherSha256))).toEqual(readFileSync(releases.beta2.launcherFile));
  const applied = terminal(root, store, "somechan", "shared", "apply-update");
  expect(applied.result).toMatchObject({ status: "applied", lifecycle: { state: "running" } });
  expect(applied.result.lifecycle.generationId).not.toBe(first.result.generationId);
  const handedOff = terminal(root, store, "somechan", "shared", "status");
  expect(handedOff.result.sidecar).toMatchObject({
    generationPid: first.result.sidecar.generationPid,
    previousHostPid: reattached.result.sidecar.hostPid,
    status: "ready",
  });
  expect(handedOff.result.sidecar.hostPid).not.toBe(reattached.result.sidecar.hostPid);
  expect(terminal(root, store, "somechan", "shared", "stop").result.state).toBe("stopped");
  releases.promote(releases.beta3);
  expect(terminal(root, store, "somechan", "shared", "prepare-update", { channelHeadUrl: releases.latestUrls.somechan, activationPolicy: "observe" }).result).toMatchObject({
    state: "update-required",
    minimumVersion: "0.2.0",
    snapshot: { state: "failed", error: { message: expect.stringContaining("lacks Shell lane") } },
  });
  releases.promote(releases.preview1);
  expect(terminal(root, store, "somepreview", "shared", "prepare-update", { channelHeadUrl: releases.latestUrls.somepreview, activationPolicy: "authorize-user" }).result).toMatchObject({ status: "prepared", authorized: true });
  expect(terminal(root, store, "somepreview", "shared", "apply-update").result).toMatchObject({ status: "applied", lifecycle: { state: "running", scope: { channel: "somepreview", namespace: "shared" } } });
  const feedback = readFileSync(feedbackFile, "utf8").trim().split(/\r?\n/).map((line) => JSON.parse(line));
  const phases = feedback.map((event) => event.phase);
  expect(phases).toContain("node-verification");
  expect(phases).toContain("sync-planning");
  expect(phases).toContain("blob-resolution");
  expect(phases).toContain("blob-download");
  expect(phases).toContain("closure-ready");
  expect(feedback).toEqual(expect.arrayContaining([
    expect.objectContaining({ phase: "node-verification", state: "complete" }),
    expect.objectContaining({ phase: "sync-planning", state: "complete", totalBytes: expect.any(Number) }),
    expect.objectContaining({ phase: "blob-download", state: "progress", receivedBytes: expect.any(Number), totalBytes: expect.any(Number) }),
    expect.objectContaining({ phase: "closure-ready", state: "complete" }),
  ]));
}
