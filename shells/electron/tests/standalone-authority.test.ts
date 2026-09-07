import { createHash, generateKeyPairSync } from "node:crypto";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { findSidecarProcesses, getSidecarStatus, stopSidecar } from "@open-design/sidecar/authority";
import {
  canonicalJson,
  signStandaloneChannelHead,
  signStandaloneMetadata,
  signStandaloneShellMetadata,
  type StandaloneMetadata,
  type StandaloneShellMetadata,
} from "@open-design/standalone";
import type { ElectronShellManifest } from "@open-design/electron-kit/runtime";
import { verifyElectronInstallerArtifact } from "@open-design/electron-kit/installation";
import type { ElectronInstallerArtifactIdentity, ElectronInstallerHandoffRequest, ElectronMacInstallerTrustReceipt, ElectronMacLastKnownGoodCaptureReceipt, ElectronMacLastKnownGoodCaptureRequest, ElectronMacLastKnownGoodRestorePreparationRequest, ElectronMacLastKnownGoodRestorePreparationReceipt } from "@open-design/electron-kit/installation";

import { buildElectronStandaloneAuthority } from "../scripts/build-authority.ts";
import { createElectronStandaloneAuthorityFactory, isElectronStandaloneScope } from "@/adapters/standalone/authority.js";
import { StandaloneHostControlClient } from "@open-design/standalone";
import { createStandaloneHostControlTransport } from "@/adapters/standalone/control-client.js";
import { bindElectronPhysicalResourceSet } from "@/adapters/standalone/physical-resources.js";
import { ElectronStandaloneInstallerClaimLedger } from "@/adapters/standalone/installer-claim.js";
import { StandaloneHostLifecycle } from "@open-design/standalone";
import { ElectronStandaloneLifecycleLedger } from "@/adapters/standalone/lifecycle-ledger.js";
import { ElectronStandaloneShellUpdaterLedger } from "@/adapters/standalone/shell-updater-ledger.js";

const roots: string[] = [];
const servers: ReturnType<typeof createServer>[] = [];
const fixtureTrust = async (input: Readonly<{
  artifact: ElectronInstallerArtifactIdentity;
  handoff: ElectronInstallerHandoffRequest["handoff"];
  manifest: ElectronShellManifest;
}>): Promise<ElectronMacInstallerTrustReceipt> => {
  const trust = input.handoff.platformTrust!;
  const app = Object.freeze({
    provider: "verify-only" as const,
    appBundleName: `${input.manifest.executableName}.app`,
    bundleId: input.manifest.appId,
    executableName: input.manifest.executableName,
    productName: input.manifest.productName,
    designatedRequirement: trust.designatedRequirement,
    teamIdentifier: trust.teamIdentifier,
    codesignVerified: true,
    gatekeeperAssessed: false,
  });
  return Object.freeze({
    schemaVersion: 1,
    operation: "electron.macos-installer.trust",
    mode: "verify-only",
    container: input.artifact,
    release: {
      channel: input.manifest.channel,
      releaseVersion: input.handoff.releaseVersion,
      shell: input.handoff.shell,
      installIdentity: { appId: input.manifest.appId, executableName: input.manifest.executableName, namespace: input.manifest.namespace, productName: input.manifest.productName },
      designatedRequirement: trust.designatedRequirement,
      teamIdentifier: trust.teamIdentifier,
    },
    app,
  });
};
const fixtureLkg = async (input: ElectronMacLastKnownGoodCaptureRequest): Promise<ElectronMacLastKnownGoodCaptureReceipt> => {
  const tree = { path: input.appPath, sha256: "e".repeat(64), entries: 2, size: 42 };
  return Object.freeze({
    schemaVersion: 1,
    operation: "electron.macos-lkg.capture",
    source: tree,
    backup: { ...tree, path: join(input.authorityRoot, "installer", "lkg", `${tree.sha256}.app`) },
    shell: input.shell,
    installIdentity: input.installIdentity,
  });
};
const fixturePrepareRestore = async (input: ElectronMacLastKnownGoodRestorePreparationRequest): Promise<ElectronMacLastKnownGoodRestorePreparationReceipt> => Object.freeze({
  schemaVersion: 1, operation: "electron.macos-lkg.restore.prepare", state: "prepared", recoveryId: input.recoveryId,
  claim: input.claim, capture: input.capture, trust: input.trust, helperPath: join(input.runtimeRoot, "restore-helper.cjs"), helperSha256: "f".repeat(64),
  inputPath: join(input.runtimeRoot, "restore-input.json"), inputSha256: "a".repeat(64), resultPath: join(input.runtimeRoot, "restore-result.json"),
  lockPath: join(input.runtimeRoot, "restore.lock"), nodeExecutablePath: input.nodeExecutablePath, parentPid: input.parentPid, mode: input.mode,
});
let fixtureRestoreSchedules = 0;
let fixtureRestoreReads = 0;
const fixtureScheduleRestore = async (preparation: ElectronMacLastKnownGoodRestorePreparationReceipt) => {
  fixtureRestoreSchedules += 1;
  return Object.freeze({
  schemaVersion: 1 as const, operation: "electron.macos-lkg.restore.schedule" as const, state: "armed" as const,
  recoveryId: preparation.recoveryId, claim: preparation.claim, preparation, helperPid: 4242,
  });
};
const fixtureReadRestore = async (preparation: ElectronMacLastKnownGoodRestorePreparationReceipt) => {
  fixtureRestoreReads += 1;
  if (fixtureRestoreReads === 1) return null;
  return Object.freeze({ schemaVersion: 1 as const, operation: "electron.macos-lkg.restore.result" as const, recoveryId: preparation.recoveryId,
    claim: preparation.claim, state: "restored" as const, restoredAppPath: preparation.capture.source.path,
    forensicAppPath: `${preparation.capture.source.path}.candidate` });
};
const authorityOptions = Object.freeze({
  verifyInstallerPlatformTrust: fixtureTrust,
  captureInstallerLastKnownGood: fixtureLkg,
  prepareInstallerLastKnownGoodRestore: fixturePrepareRestore,
  scheduleInstallerLastKnownGoodRestore: fixtureScheduleRestore,
  readInstallerLastKnownGoodRestoreResult: fixtureReadRestore,
});
afterEach(async () => {
  fixtureRestoreSchedules = 0;
  fixtureRestoreReads = 0;
  vi.unstubAllGlobals();
  await Promise.all(servers.splice(0).map(async (server) => await new Promise<void>((resolveClose, reject) => server.close((error) => error == null ? resolveClose() : reject(error)))));
  await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

function descriptor(file: string, bytes: Uint8Array) {
  return { file, sha256: createHash("sha256").update(bytes).digest("hex"), size: bytes.byteLength };
}

function isProcessAlive(pid: number): boolean {
  try { process.kill(pid, 0); return true; }
  catch { return false; }
}

const physicalResources = {
  schemaVersion: 1,
  resources: [{ id: "standalone-runtime", stamp: { source: "standalone", mode: "runtime", app: "standalone" } }],
} as const;

describe("Electron production Standalone authority", () => {
  it("accepts only the interactive and derived headless namespaces for its channel", () => {
    const manifest = { channel: "betahyx", namespace: "electron-foundation" } as ElectronShellManifest;
    expect(isElectronStandaloneScope(manifest, { channel: "betahyx", namespace: "electron-foundation" })).toBe(true);
    expect(isElectronStandaloneScope(manifest, { channel: "betahyx", namespace: "electron-foundation-headless" })).toBe(true);
    expect(isElectronStandaloneScope(manifest, { channel: "dev", namespace: "electron-foundation-headless" })).toBe(false);
    expect(isElectronStandaloneScope(manifest, { channel: "betahyx", namespace: "other-headless" })).toBe(false);
  });

  it("closes signed cold start, readiness rollback, and Shell-only replacement through the production host", async () => {
    const root = await mkdtemp(join(tmpdir(), "electron-standalone-authority-"));
    roots.push(root);
    const releases = new Map<string, Uint8Array>();
    const server = createServer((request, response) => {
      const body = releases.get(`http://127.0.0.1:${(server.address() as { port: number }).port}${request.url ?? ""}`);
      response.statusCode = body == null ? 404 : 200;
      response.end(body == null ? "missing" : Buffer.from(body));
    });
    servers.push(server);
    await new Promise<void>((resolveListen, reject) => server.listen(0, "127.0.0.1", resolveListen).once("error", reject));
    const releaseOrigin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    const runtimeRoot = join(root, "runtime");
    const built = await buildElectronStandaloneAuthority(root);
    const readinessFaultMarker = join(root, "readiness-fault-consumed");
    const [rawHost, supervisor, launcher] = await Promise.all([
      readFile(built.host.path),
      readFile(built.supervisor.path),
      readFile(new URL("./fixtures/standalone-launcher.mjs", import.meta.url)),
    ]);
    const readinessHandler = 'if (request.operation === "lifecycle.ready") return await this.lifecycle.awaitReady(request.readiness);';
    const faultedReadinessHandler = `if (request.operation === "lifecycle.ready") { const acknowledged = await this.lifecycle.awaitReady(request.readiness); const fs = process.getBuiltinModule("node:fs"); const marker = ${JSON.stringify(readinessFaultMarker)}; if (!fs.existsSync(marker)) { fs.writeFileSync(marker, JSON.stringify([process.pid, process.ppid])); return { ...acknowledged, attachmentId: "faulted-readiness" }; } return acknowledged; }`;
    const hostSource = rawHost.toString("utf8");
    expect(hostSource).toContain(readinessHandler);
    const host = Buffer.from(hostSource.replace(readinessHandler, faultedReadinessHandler));
    await Promise.all([writeFile(built.host.path, host), writeFile(readinessFaultMarker, "initial-start-must-remain-healthy")]);
    const closure = Buffer.from("export const closure = true;\n");
    const launcherDigest = createHash("sha256").update(launcher).digest("hex");
    const closureDigest = createHash("sha256").update(closure).digest("hex");
    const metadata: StandaloneMetadata = {
      schemaVersion: 4,
      channel: "betahyx",
      releaseVersion: "0.1.0-betahyx.1",
      standaloneVersion: "0.1.0",
      sourceCommit: "7a4175c86fe305b6432081c3dc269cd4bd4ec04d",
      publishedAt: "2026-09-04T00:00:00.000Z",
      blobs: {
        [launcherDigest]: { sha256: launcherDigest, size: launcher.byteLength, mediaType: "text/javascript", sources: [{ kind: "remote", url: "https://releases.invalid/launcher.mjs" }] },
        [closureDigest]: { sha256: closureDigest, size: closure.byteLength, mediaType: "text/javascript", sources: [{ kind: "remote", url: "https://releases.invalid/closure.mjs" }] },
      },
      resources: [
        { id: "standalone-launcher", component: "standalone.launcher", blob: launcherDigest, sync: true, materialization: { type: "file", entrypoint: "standalone-launcher.mjs" } },
        { id: "closure", component: "standalone.resource", blob: closureDigest, sync: true, materialization: { type: "file", entrypoint: "closure.mjs" } },
      ],
      shellRequirements: [
        { type: "electron", minVersion: "0.1.0", buildHash: "a".repeat(64) },
        { type: "terminal", minVersion: "0.1.0", buildHash: "f".repeat(64) },
      ],
    };
    const keys = generateKeyPairSync("ed25519");
    const content = Buffer.from(canonicalJson(signStandaloneMetadata(metadata, "release", keys.privateKey)));
    const trust = Buffer.from(canonicalJson({ schemaVersion: 1, keys: [{ keyId: "release", publicKey: keys.publicKey.export({ format: "pem", type: "spki" }).toString() }] }));
    const target = process.platform === "win32" ? `win32-${process.arch}` : `${process.platform}-${process.arch}`;
    const installation = {
      schemaVersion: 1,
      channel: metadata.channel,
      releaseVersion: metadata.releaseVersion,
      target,
      host: descriptor("standalone-host.mjs", host),
      supervisor: descriptor("supervisor.mjs", supervisor),
      content: descriptor("standalone-content.json", content),
      trust: descriptor("standalone-trust.json", trust),
      update: { channelHeadUrl: `${releaseOrigin}/betahyx/latest/channel-head.json` },
      seeds: [
        { ...descriptor("standalone-launcher-seed.mjs", launcher), blobSha256: launcherDigest },
        { ...descriptor("closure-seed.mjs", closure), blobSha256: closureDigest },
      ],
    };
    await Promise.all([
      writeFile(join(root, "standalone-content.json"), content),
      writeFile(join(root, "standalone-trust.json"), trust),
      writeFile(join(root, "standalone-launcher-seed.mjs"), launcher),
      writeFile(join(root, "closure-seed.mjs"), closure),
      writeFile(join(root, "standalone-installation.json"), canonicalJson(installation)),
    ]);
    const manifest: ElectronShellManifest = {
      schemaVersion: 1,
      appId: "io.nexu.electron-foundation",
      productName: "Electron Foundation",
      publisher: "Open Design",
      executableName: "electron-foundation",
      version: "0.1.0",
      channel: "betahyx",
      namespace: `authority-${process.pid}`,
      protocol: "od",
      window: { width: 800, height: 600, title: "Electron Foundation" },
      splash: { width: 520, height: 320, minimumVisibleMs: 350, backgroundColor: "#151515", foregroundColor: "#ffffff", mutedColor: "#aaaaaa", initialLabel: "Preparing", readyLabel: "Ready" },
      shell: { type: "electron", version: "0.1.0", buildHash: "a".repeat(64), digest: "b".repeat(64) },
    };
    const feedback: { generationId?: string; phase: string; state: string }[] = [];
    const authority = createElectronStandaloneAuthorityFactory(manifest, physicalResources, authorityOptions)({
      installedShellPath: join(root, "Current.app"),
      namespaceRoot: join(runtimeRoot, "namespace"),
      officialNodeExecutablePath: process.execPath,
      observeFeedback(event) { feedback.push(event); },
      resourceRoot: root,
      runtimeRoot,
    });
    let stamp: ReturnType<typeof bindElectronPhysicalResourceSet>["resources"][number]["stamp"] | null = null;
    try {
      const prepared = await authority.prepare({ correlationId: "authority-test", scope: { channel: manifest.channel, namespace: manifest.namespace }, shell: manifest.shell });
      expect(prepared.generation.releaseVersion).toBe("0.1.0-betahyx.1");
      expect(prepared.generation.releaseVersion).not.toBe(manifest.version);
      stamp = bindElectronPhysicalResourceSet(physicalResources, prepared.binding).resources[0]!.stamp;
      expect(await prepared.updater.readSnapshot()).toMatchObject({ state: "idle", shellType: "electron" });
      const handle = await prepared.start({
        attachment: { id: "electron-test", shell: manifest.shell },
        capabilities: { async invoke(request) { return { requestId: request.requestId, attachmentId: request.attachmentId, bindingDigest: request.bindingDigest, outcome: "unsupported" }; } },
      });
      expect(await handle.readStatus()).toMatchObject({ state: "running", generationId: prepared.generation.id, bindingDigest: prepared.binding.digest });

      const nextClosure = Buffer.from("export const closure = 'next';\n");
      const nextClosureDigest = createHash("sha256").update(nextClosure).digest("hex");
      const nextMetadata: StandaloneMetadata = {
        ...metadata,
        releaseVersion: "0.1.0-betahyx.2",
        publishedAt: "2026-09-04T00:01:00.000Z",
        blobs: {
          [launcherDigest]: metadata.blobs[launcherDigest]!,
          [nextClosureDigest]: { sha256: nextClosureDigest, size: nextClosure.byteLength, mediaType: "text/javascript", sources: [{ kind: "remote", url: "https://releases.invalid/closure-v2.mjs" }] },
        },
        resources: [
          metadata.resources[0]!,
          { id: "closure", component: "standalone.resource", blob: nextClosureDigest, sync: true, materialization: { type: "file", entrypoint: "closure.mjs" } },
        ],
      };
      const nextContent = Buffer.from(canonicalJson(signStandaloneMetadata(nextMetadata, "release", keys.privateKey)));
      const channelHead = Buffer.from(canonicalJson(signStandaloneChannelHead({
        schemaVersion: 1,
        channel: "betahyx",
        publishedAt: "2026-09-04T00:02:00.000Z",
        lanes: {
          content: {
            releaseVersion: nextMetadata.releaseVersion,
            url: "https://releases.invalid/content-v2.json",
            sha256: createHash("sha256").update(nextContent).digest("hex"),
            size: nextContent.byteLength,
          },
        },
      }, [{ keyId: "release", privateKey: keys.privateKey }])));
      releases.set(installation.update.channelHeadUrl, channelHead);
      releases.set("https://releases.invalid/content-v2.json", nextContent);
      releases.set("https://releases.invalid/closure-v2.mjs", nextClosure);
      vi.stubGlobal("fetch", async (input: string | URL | Request) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        const body = releases.get(url);
        return body == null ? new Response(null, { status: 404 }) : new Response(Buffer.from(body), { status: 200 });
      });
      await expect(prepared.contentUpdater.prepareLatest("observe"))
        .resolves.toMatchObject({ status: "prepared", generation: { releaseVersion: nextMetadata.releaseVersion }, authorized: false });
      const competingLifecycle = new StandaloneHostControlClient(
        { channel: manifest.channel, namespace: manifest.namespace },
        createStandaloneHostControlTransport(stamp),
      );
      const terminalAttachment = {
        id: "terminal-competitor",
        shell: { type: "terminal", version: "0.1.0", buildHash: "f".repeat(64), digest: "e".repeat(64) },
      };
      const terminalStarted = await competingLifecycle.start(
        { channel: manifest.channel, namespace: manifest.namespace },
        prepared.generation,
        terminalAttachment,
        prepared.binding,
      );
      await competingLifecycle.awaitReady(
        { channel: manifest.channel, namespace: manifest.namespace },
        {
          generationId: prepared.generation.id,
          bindingDigest: prepared.binding.digest,
          instanceId: terminalStarted.instanceId!,
          attachmentId: terminalAttachment.id,
        },
      );
      await expect(prepared.contentUpdater.applyNow()).resolves.toMatchObject({
        status: "blocked",
        reason: "occupied",
        occupants: [{ attachmentId: terminalAttachment.id }],
      });
      const applied = await prepared.contentUpdater.applyNow({ force: true });
      expect(applied).toMatchObject({ status: "applied", generation: { releaseVersion: nextMetadata.releaseVersion }, lifecycle: { state: "running" } });
      if (applied.status !== "applied") throw new Error("content update did not apply");
      expect(applied.binding.digest).not.toBe(prepared.binding.digest);
      expect(await handle.readStatus()).toMatchObject({ state: "running", generationId: applied.generation.id, bindingDigest: applied.binding.digest });

      const failedMetadata: StandaloneMetadata = {
        ...nextMetadata,
        releaseVersion: "0.1.0-betahyx.3",
        publishedAt: "2026-09-04T00:03:00.000Z",
        blobs: {
          [launcherDigest]: metadata.blobs[launcherDigest]!,
          [nextClosureDigest]: nextMetadata.blobs[nextClosureDigest]!,
        },
        resources: [
          metadata.resources[0]!,
          nextMetadata.resources[1]!,
        ],
      };
      const failedContent = Buffer.from(canonicalJson(signStandaloneMetadata(failedMetadata, "release", keys.privateKey)));
      const failedHead = Buffer.from(canonicalJson(signStandaloneChannelHead({
        schemaVersion: 1,
        channel: "betahyx",
        publishedAt: "2026-09-04T00:04:00.000Z",
        lanes: {
          content: {
            releaseVersion: failedMetadata.releaseVersion,
            url: "https://releases.invalid/content-v3.json",
            sha256: createHash("sha256").update(failedContent).digest("hex"),
            size: failedContent.byteLength,
          },
        },
      }, [{ keyId: "release", privateKey: keys.privateKey }])));
      releases.set(installation.update.channelHeadUrl, failedHead);
      releases.set("https://releases.invalid/content-v3.json", failedContent);
      const failedPreparation = await prepared.contentUpdater.prepareLatest("observe");
      expect(failedPreparation).toMatchObject({ status: "prepared", generation: { releaseVersion: failedMetadata.releaseVersion } });
      if (failedPreparation.status !== "prepared") throw new Error("readiness-fault generation was not prepared");
      await rm(readinessFaultMarker, { force: true });
      await expect(prepared.contentUpdater.applyNow()).rejects.toThrow("stale readiness");
      const failedPids = JSON.parse(await readFile(readinessFaultMarker, "utf8")) as number[];
      await vi.waitFor(() => expect(failedPids.map(isProcessAlive)).toEqual([false, false]), { timeout: 5_000 });
      expect(feedback).not.toContainEqual(expect.objectContaining({ phase: "closure-ready", state: "complete", generationId: failedPreparation.generation.id }));
      expect(feedback).toContainEqual(expect.objectContaining({ phase: "rollback", state: "complete", generationId: applied.generation.id }));
      expect(await handle.readStatus()).toMatchObject({ state: "running", generationId: applied.generation.id, bindingDigest: applied.binding.digest });

      const updaterLedger = new ElectronStandaloneShellUpdaterLedger(join(runtimeRoot, "standalone-store"), { channel: manifest.channel, namespace: manifest.namespace }, "electron");
      const shellArtifact = Buffer.from("signed shell-only electron distribution");
      const shellArtifactUrl = `${releaseOrigin}/electron-v020.dmg`;
      const shellMetadataUrl = `${releaseOrigin}/electron-v020.json`;
      const shellDocument: StandaloneShellMetadata = {
        schemaVersion: 1,
        channel: manifest.channel,
        releaseVersion: "0.2.0-betahyx.1",
        sourceCommit: "8a4175c86fe305b6432081c3dc269cd4bd4ec04d",
        publishedAt: "2026-09-04T00:05:00.000Z",
        distributions: [{
          shell: { type: "electron", version: "0.2.0", buildHash: "c".repeat(64) },
          target,
          artifact: { url: shellArtifactUrl, sha256: createHash("sha256").update(shellArtifact).digest("hex"), size: shellArtifact.byteLength, mediaType: "application/x-apple-diskimage" },
          platformTrust: { platform: "macos", mode: "verify-only", designatedRequirement: 'identifier "io.nexu.electron-foundation"', teamIdentifier: "adhoc" },
          updater: { protocol: "standalone-shell-updater-v3", handler: "sidecar-v1", interaction: "restart-and-install" },
        }],
      };
      const shellMetadata = Buffer.from(canonicalJson(signStandaloneShellMetadata(shellDocument, [{ keyId: "release", privateKey: keys.privateKey }])));
      const shellOnlyHead = Buffer.from(canonicalJson(signStandaloneChannelHead({
        schemaVersion: 1,
        channel: manifest.channel,
        publishedAt: "2026-09-04T00:06:00.000Z",
        lanes: { electron: { releaseVersion: shellDocument.releaseVersion, url: shellMetadataUrl, sha256: createHash("sha256").update(shellMetadata).digest("hex"), size: shellMetadata.byteLength } },
      }, [{ keyId: "release", privateKey: keys.privateKey }])));
      releases.set(installation.update.channelHeadUrl, shellOnlyHead);
      releases.set(shellMetadataUrl, shellMetadata);
      releases.set(shellArtifactUrl, shellArtifact);
      const checkedShell = await prepared.updater.invoke("check");
      if (checkedShell.outcome !== "accepted") throw new Error(`shell-only check failed: ${JSON.stringify(checkedShell)}`);
      expect(checkedShell).toMatchObject({ outcome: "accepted", snapshot: { state: "available", candidateId: shellDocument.releaseVersion } });
      const downloadedShell = await prepared.updater.invoke("download");
      expect(downloadedShell).toMatchObject({ outcome: "accepted", snapshot: { state: "ready", handoff: { releaseVersion: shellDocument.releaseVersion, target } } });
      const handoff = downloadedShell.snapshot.handoff!;
      expect(await prepared.updater.invoke("install")).toMatchObject({ outcome: "blocked", snapshot: { state: "ready", blockedBy: [{ attachmentId: "electron-test" }] } });
      const applying = await prepared.updater.invoke("force-stop-and-install");
      expect(applying).toMatchObject({ outcome: "accepted", snapshot: { state: "applying" } });
      const installAttemptId = applying.snapshot.installAttemptId!;
      const installationRequest = { handoff, installAttemptId, nodeExecutablePath: process.execPath, parentPid: process.pid, runtimeRoot, mode: "verify-only" as const };
      await expect(prepared.armShellInstallation({
        request: installationRequest,
        async install() { throw new Error("injected crash after sealed claim"); },
      })).rejects.toThrow("injected crash after sealed claim");
      const installerClaimLedger = new ElectronStandaloneInstallerClaimLedger(join(runtimeRoot, "standalone-store"), { channel: manifest.channel, namespace: manifest.namespace });
      expect(await installerClaimLedger.read())
        .toMatchObject({
          state: "sealed",
          revision: 1,
          bindingDigest: applied.binding.digest,
          generationId: applied.generation.id,
          installAttemptId,
          artifact: { path: handoff.artifact.path, sha256: handoff.artifact.sha256, size: handoff.artifact.size },
          invocation: { state: "failed", lastError: { message: "injected crash after sealed claim" } },
        });

      let installerCalls = 0;
      let recoveryHostPids: number[] = [];
      const install = async (request: typeof installationRequest) => {
          installerCalls += 1;
          expect(recoveryHostPids.map(isProcessAlive)).toEqual(recoveryHostPids.map(() => false));
          return {
            schemaVersion: 1,
            state: "armed",
            installAttemptId: request.installAttemptId,
            artifactPath: request.handoff.artifact.path,
            artifactSha256: request.handoff.artifact.sha256,
            helperPath: join(runtimeRoot, "installer-helper.cjs"),
            resultPath: join(runtimeRoot, "installer-result.json"),
            mode: "verify-only",
            parentPid: request.parentPid,
          } as const;
      };
      await expect(prepared.armShellInstallation({ request: installationRequest, install })).rejects.toThrow("requires explicit recovery");
      expect(installerCalls).toBe(0);
      const abandonAuthority = createElectronStandaloneAuthorityFactory(manifest, physicalResources, authorityOptions)({
        installedShellPath: join(root, "Current.app"),
        namespaceRoot: join(runtimeRoot, "namespace"),
        officialNodeExecutablePath: process.execPath,
        resourceRoot: root,
        runtimeRoot,
      });
      const abandonPrepared = await abandonAuthority.prepare({
        correlationId: "abandon-recovery-authority-test",
        scope: { channel: manifest.channel, namespace: manifest.namespace },
        shell: manifest.shell,
      });
      const preAbandonHost = await getSidecarStatus<{ generationPid: number; hostPid: number; lifecycle: { references: number } }>(stamp);
      expect(preAbandonHost.lifecycle.references).toBe(0);
      const failedClaim = await abandonPrepared.readShellInstallationClaim();
      if (failedClaim == null) throw new Error("failed installer claim is unavailable");
      await expect(abandonPrepared.confirmShellInstallation({
        expected: failedClaim.identity,
        proof: { ...handoff.shell, digest: "d".repeat(64) },
      })).rejects.toThrow("not armed");
      const persistedClaim = JSON.parse(await readFile(installerClaimLedger.path, "utf8")) as Record<string, unknown>;
      await writeFile(installerClaimLedger.path, canonicalJson({ ...persistedClaim, createdAt: "2026-09-04T00:00:00.000Z", expiresAt: "2026-09-04T00:01:00.000Z" }));
      const lifecycleLedger = new ElectronStandaloneLifecycleLedger(join(runtimeRoot, "standalone-store"), { channel: manifest.channel, namespace: manifest.namespace });
      const expiringLifecycle = await lifecycleLedger.readOrInitial();
      if (expiringLifecycle.transition == null) throw new Error("installer lifecycle transition is unavailable");
      await lifecycleLedger.write({ ...expiringLifecycle, transition: { ...expiringLifecycle.transition, expiresAt: "2026-09-04T00:01:00.000Z" } });
      await new StandaloneHostLifecycle({ channel: manifest.channel, namespace: manifest.namespace }, { statePort: lifecycleLedger }).status();
      expect(await lifecycleLedger.read()).toMatchObject({ transition: { token: installAttemptId, kind: "shell-install", phase: "stopped-sealed" } });
      const expiredClaim = await abandonPrepared.readShellInstallationClaim();
      expect(expiredClaim).toMatchObject({ state: "sealed", identity: { installAttemptId, revision: 1 }, artifact: { path: handoff.artifact.path }, invocation: { state: "failed" } });
      expect(JSON.parse(await readFile(installerClaimLedger.path, "utf8"))).toMatchObject({ state: "sealed", revision: 1 });
      if (expiredClaim == null) throw new Error("installer claim is unavailable");
      const abandonRequest = { action: "abandon-and-restore" as const, recoveryId: "abandon-and-restore-1", expected: expiredClaim.identity };
      const quitReceipt = await abandonPrepared.recoverShellInstallation({ request: abandonRequest });
      expect(quitReceipt).toMatchObject({ action: "abandon-and-restore", recoveryId: abandonRequest.recoveryId, state: "quit-required", restore: { state: "armed" } });
      expect(JSON.parse(await readFile(installerClaimLedger.path, "utf8"))).toMatchObject({
        state: "expired", restoration: { recoveryId: abandonRequest.recoveryId, phase: "restore-armed", expected: abandonRequest.expected },
      });
      expect([preAbandonHost.hostPid, preAbandonHost.generationPid].map(isProcessAlive)).toEqual([false, false]);
      expect(await lifecycleLedger.read()).toMatchObject({ transition: { token: installAttemptId, phase: "stopped-sealed" } });
      expect(await updaterLedger.read()).toMatchObject({ state: "applying" });
      expect(fixtureRestoreSchedules).toBe(1);
      const restoringClaim = await abandonPrepared.readShellInstallationClaim();
      if (restoringClaim == null) throw new Error("restoring installer claim is unavailable");
      await expect(abandonPrepared.recoverShellInstallation({ request: { action: "abandon-and-restore", recoveryId: "another-restore", expected: restoringClaim.identity } })).rejects.toThrow("another restoration in progress");
      await expect(abandonPrepared.recoverShellInstallation({ request: abandonRequest })).rejects.toThrow("armed but has no durable result");
      expect(fixtureRestoreSchedules).toBe(1);
      expect(await lifecycleLedger.read()).toMatchObject({ transition: { token: installAttemptId, phase: "stopped-sealed" } });
      const abandonReceipt = await abandonPrepared.recoverShellInstallation({ request: abandonRequest });
      expect(abandonReceipt).toMatchObject({ action: "abandon-and-restore", recoveryId: abandonRequest.recoveryId, state: "restored", result: { state: "restored" } });
      expect(await abandonPrepared.recoverShellInstallation({ request: abandonRequest })).toEqual(abandonReceipt);
      expect(JSON.parse(await readFile(installerClaimLedger.path, "utf8"))).toMatchObject({ state: "abandoned", restoration: { phase: "result-observed", result: { state: "restored" } } });
      const restoredHost = await getSidecarStatus<{ generationPid: number; hostPid: number; lifecycle: { references: number } }>(stamp);
      expect(restoredHost.hostPid).not.toBe(preAbandonHost.hostPid);
      expect(restoredHost.generationPid).not.toBe(preAbandonHost.generationPid);
      expect([restoredHost.hostPid, restoredHost.generationPid].map(isProcessAlive)).toEqual([true, true]);
      expect(restoredHost.lifecycle.references).toBe(0);
      expect(await updaterLedger.read()).toMatchObject({ state: "failed", error: { code: "electron-installer-abandoned" } });
      expect(await handle.close()).toMatchObject({ state: "stopped", generationId: applied.generation.id, bindingDigest: applied.binding.digest });
      const restoredHandle = await abandonPrepared.start({
        attachment: { id: "electron-restored", shell: manifest.shell },
        capabilities: { async invoke(request) { return { requestId: request.requestId, attachmentId: request.attachmentId, bindingDigest: request.bindingDigest, outcome: "unsupported" }; } },
      });
      expect(await restoredHandle.readStatus()).toMatchObject({ state: "running", generationId: applied.generation.id, bindingDigest: applied.binding.digest });

      expect(await abandonPrepared.updater.invoke("check")).toMatchObject({ outcome: "accepted", snapshot: { state: "available" } });
      const redownloadedShell = await abandonPrepared.updater.invoke("download");
      expect(redownloadedShell).toMatchObject({ outcome: "accepted", snapshot: { state: "ready" } });
      expect(await abandonPrepared.updater.invoke("force-stop-and-install")).toMatchObject({ outcome: "accepted", snapshot: { state: "applying" } });
      const secondSnapshot = await updaterLedger.read();
      const secondInstallAttemptId = secondSnapshot.installAttemptId!;
      const secondInstallationRequest = { ...installationRequest, installAttemptId: secondInstallAttemptId };
      await expect(abandonPrepared.armShellInstallation({
        request: secondInstallationRequest,
        async install() { throw new Error("injected second crash after sealed claim"); },
      })).rejects.toThrow("injected second crash after sealed claim");
      expect(await restoredHandle.close()).toMatchObject({ state: "stopped", generationId: applied.generation.id, bindingDigest: applied.binding.digest });
      const retryAuthority = createElectronStandaloneAuthorityFactory(manifest, physicalResources, authorityOptions)({
        installedShellPath: join(root, "Current.app"),
        namespaceRoot: join(runtimeRoot, "namespace"),
        officialNodeExecutablePath: process.execPath,
        resourceRoot: root,
        runtimeRoot,
      });
      const retryPrepared = await retryAuthority.prepare({
        correlationId: "retry-recovery-authority-test",
        scope: { channel: manifest.channel, namespace: manifest.namespace },
        shell: manifest.shell,
      });
      const preRetryHost = await getSidecarStatus<{ generationPid: number; hostPid: number; lifecycle: { references: number } }>(stamp);
      expect(preRetryHost.lifecycle.references).toBe(0);
      recoveryHostPids = [preRetryHost.hostPid, preRetryHost.generationPid];
      const secondClaim = await retryPrepared.readShellInstallationClaim();
      expect(secondClaim).toMatchObject({ state: "sealed", identity: { installAttemptId: secondInstallAttemptId }, invocation: { state: "failed" } });
      if (secondClaim == null) throw new Error("second installer claim is unavailable");
      const secondClaimRevision = secondClaim.identity.revision;
      const retryRequest = {
        action: "retry-original-artifact" as const,
        recoveryId: "retry-original-artifact-1",
        expected: secondClaim.identity,
        installer: secondInstallationRequest,
      };
      await chmod(handoff.artifact.path, 0o600);
      await writeFile(handoff.artifact.path, "tampered artifact");
      await chmod(handoff.artifact.path, 0o400);
      await expect(retryPrepared.recoverShellInstallation({ request: retryRequest, install })).rejects.toThrow("artifact identity mismatch");
      expect([preRetryHost.hostPid, preRetryHost.generationPid].map(isProcessAlive)).toEqual([false, false]);
      const failedRetryClaim = await retryPrepared.readShellInstallationClaim();
      expect(failedRetryClaim).toMatchObject({ state: "sealed", identity: { revision: secondClaimRevision + 1 }, invocation: { state: "failed", lastError: { message: "staged installer artifact identity mismatch" } } });
      if (failedRetryClaim == null) throw new Error("failed retry claim observation is unavailable");
      await expect(retryPrepared.recoverShellInstallation({ request: retryRequest, install })).rejects.toThrow("stale Electron installer claim identity");
      await chmod(handoff.artifact.path, 0o600);
      await writeFile(handoff.artifact.path, shellArtifact);
      await chmod(handoff.artifact.path, 0o400);
      await expect(verifyElectronInstallerArtifact(failedRetryClaim.artifact)).resolves.toEqual(failedRetryClaim.artifact);
      const retriedIntent = { ...retryRequest, expected: failedRetryClaim.identity };
      await expect(retryPrepared.recoverShellInstallation({
        request: retriedIntent,
        async install() { throw new Error("retry installer crashed"); },
      })).rejects.toThrow("retry installer crashed");
      const invocationFailedClaim = await retryPrepared.readShellInstallationClaim();
      expect(invocationFailedClaim).toMatchObject({ state: "sealed", identity: { revision: secondClaimRevision + 2 }, invocation: { state: "failed", lastError: { message: "retry installer crashed" } } });
      if (invocationFailedClaim == null) throw new Error("retry invocation failure observation is unavailable");
      const successfulIntent = { ...retryRequest, expected: invocationFailedClaim.identity };
      const recoveryReceipt = await retryPrepared.recoverShellInstallation({ request: successfulIntent, install });
      expect(recoveryReceipt).toMatchObject({ action: "retry-original-artifact", recoveryId: retryRequest.recoveryId, installer: { state: "armed", installAttemptId: secondInstallAttemptId } });
      expect(await retryPrepared.recoverShellInstallation({ request: successfulIntent, install })).toEqual(recoveryReceipt);
      expect(installerCalls).toBe(1);
      expect(await updaterLedger.read()).toMatchObject({ state: "handed-off", installAttemptId: secondInstallAttemptId });
      expect(await installerClaimLedger.read())
        .toMatchObject({ state: "armed", bindingDigest: applied.binding.digest, generationId: applied.generation.id, installAttemptId: secondInstallAttemptId });

      const replacementManifest: ElectronShellManifest = {
        ...manifest,
        version: handoff.shell.version,
        shell: { ...handoff.shell, digest: "d".repeat(64) },
      };
      const replacementAuthority = createElectronStandaloneAuthorityFactory(replacementManifest, physicalResources, authorityOptions)({
        installedShellPath: join(root, "Current.app"),
        namespaceRoot: join(runtimeRoot, "namespace"),
        officialNodeExecutablePath: process.execPath,
        resourceRoot: root,
        runtimeRoot,
      });
      const replacement = await replacementAuthority.prepare({
        correlationId: "replacement-authority-test",
        scope: { channel: replacementManifest.channel, namespace: replacementManifest.namespace },
        shell: replacementManifest.shell,
      });
      const replacementClaim = await replacement.readShellInstallationClaim();
      expect(replacementClaim).toMatchObject({ state: "armed", identity: { installAttemptId: secondInstallAttemptId } });
      if (replacementClaim == null) throw new Error("replacement installer claim is unavailable");
      const replacementClaimBytes = await readFile(installerClaimLedger.path);
      await rm(installerClaimLedger.path);
      await expect(replacement.confirmShellInstallation({ expected: replacementClaim.identity, proof: replacementManifest.shell })).rejects.toThrow("missing installer claim");
      await writeFile(installerClaimLedger.path, replacementClaimBytes);
      const armedForExpiry = JSON.parse(replacementClaimBytes.toString("utf8")) as Record<string, unknown>;
      await writeFile(installerClaimLedger.path, canonicalJson({ ...armedForExpiry, createdAt: "2026-09-04T00:00:00.000Z", expiresAt: "2026-09-04T00:01:00.000Z" }));
      await expect(replacement.confirmShellInstallation({ expected: replacementClaim.identity, proof: replacementManifest.shell })).rejects.toThrow("expired installer claim");
      const confirmationExpiredClaim = await replacement.readShellInstallationClaim();
      expect(confirmationExpiredClaim).toMatchObject({ state: "expired" });
      if (confirmationExpiredClaim == null) throw new Error("expired confirmation claim is unavailable");
      const replacementRetryIntent = {
        action: "retry-original-artifact" as const,
        recoveryId: "replacement-expired-retry",
        expected: confirmationExpiredClaim.identity,
        installer: secondInstallationRequest,
      };
      await replacement.recoverShellInstallation({ request: replacementRetryIntent, install });
      const rearmedReplacementClaim = await replacement.readShellInstallationClaim();
      expect(rearmedReplacementClaim).toMatchObject({ state: "armed" });
      if (rearmedReplacementClaim == null) throw new Error("rearmed replacement claim is unavailable");
      await expect(replacement.confirmShellInstallation({
        expected: rearmedReplacementClaim.identity,
        proof: { ...replacementManifest.shell, digest: "e".repeat(64) },
      })).rejects.toThrow("proof differs");
      const confirmationReceipt = await replacement.confirmShellInstallation({ expected: rearmedReplacementClaim.identity, proof: replacementManifest.shell });
      expect(confirmationReceipt).toMatchObject({ state: "consumed", installAttemptId: secondInstallAttemptId });
      expect(await replacement.updater.readSnapshot()).toMatchObject({ state: "installed", installAttemptId: secondInstallAttemptId });
      const consumedClaim = await replacement.readShellInstallationClaim();
      expect(consumedClaim).toMatchObject({ state: "consumed" });
      if (consumedClaim == null) throw new Error("consumed replacement claim is unavailable");
      const confirmedHost = await getSidecarStatus<{ hostPid: number }>(stamp);
      expect(await replacement.confirmShellInstallation({ expected: consumedClaim.identity, proof: replacementManifest.shell })).toEqual(confirmationReceipt);
      expect((await getSidecarStatus<{ hostPid: number }>(stamp)).hostPid).toBe(confirmedHost.hostPid);
      const replacementHandle = await replacement.start({
        attachment: { id: "electron-replacement", shell: replacementManifest.shell },
        capabilities: { async invoke(request) { return { requestId: request.requestId, attachmentId: request.attachmentId, bindingDigest: request.bindingDigest, outcome: "unsupported" }; } },
      });
      expect(await replacementHandle.readStatus()).toMatchObject({ state: "running", generationId: replacement.generation.id, bindingDigest: replacement.binding.digest });
      const sibling = await replacementAuthority.prepare({ correlationId: "close-sibling", scope: { channel: replacementManifest.channel, namespace: replacementManifest.namespace }, shell: replacementManifest.shell });
      const siblingHandle = await sibling.start({
        attachment: { id: "electron-sibling", shell: replacementManifest.shell },
        capabilities: { async invoke(request) { return { requestId: request.requestId, attachmentId: request.attachmentId, bindingDigest: request.bindingDigest, outcome: "unsupported" }; } },
      });
      await replacementHandle.close();
      expect(await siblingHandle.readStatus()).toMatchObject({ state: "running", references: 1 });
      expect(await findSidecarProcesses(stamp)).not.toEqual([]);
      const closed = await Promise.all([siblingHandle.close(), siblingHandle.close()]);
      expect(closed[0]).toEqual(closed[1]);
      expect(await findSidecarProcesses(stamp)).toEqual([]);
      expect(await lifecycleLedger.read()).toMatchObject({ state: "stopped", attachments: [] });
    } finally {
      if (stamp != null) {
        const stopped = await stopSidecar(stamp, { termGraceMs: 1_000, killGraceMs: 1_000 });
        expect(stopped.remainingPids).toEqual([]);
      }
    }
  }, 30_000);
});
