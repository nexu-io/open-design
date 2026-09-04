import { createHash, generateKeyPairSync } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { stopSidecar } from "@open-design/sidecar";
import { canonicalJson, SHELL_UPDATE_ALGEBRA, signStandaloneChannelHead, signStandaloneMetadata, type StandaloneMetadata } from "@open-design/standalone";
import type { ElectronShellManifest } from "@open-design/electron-kit/runtime";

import { buildElectronStandaloneAuthority } from "../scripts/build-authority.ts";
import { createElectronStandaloneAuthorityFactory, isElectronStandaloneScope } from "@/adapters/standalone/authority.js";
import { createElectronStandaloneControlTransport, ElectronStandaloneControlClient } from "@/adapters/standalone/control-client.js";
import { bindElectronPhysicalResourceSet } from "@/adapters/standalone/physical-resources.js";
import { ElectronStandaloneInstallerClaimLedger } from "@/adapters/standalone/installer-claim.js";
import { ElectronStandaloneShellUpdaterLedger } from "@/adapters/standalone/shell-updater-ledger.js";

const roots: string[] = [];
afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

function descriptor(file: string, bytes: Uint8Array) {
  return { file, sha256: createHash("sha256").update(bytes).digest("hex"), size: bytes.byteLength };
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

  it("cold-starts a signed offline generation through official Node and a supervised Sidecar host", async () => {
    const root = await mkdtemp(join(tmpdir(), "electron-standalone-authority-"));
    roots.push(root);
    const runtimeRoot = join(root, "runtime");
    const built = await buildElectronStandaloneAuthority(root);
    const [host, supervisor, launcher] = await Promise.all([
      readFile(built.host.path),
      readFile(built.supervisor.path),
      readFile(new URL("./fixtures/standalone-launcher.mjs", import.meta.url)),
    ]);
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
      update: { channelHeadUrl: "https://releases.invalid/betahyx/latest/channel-head.json" },
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
      shell: { type: "electron", version: "0.1.0", buildHash: "a".repeat(64), digest: "b".repeat(64) },
    };
    const authority = createElectronStandaloneAuthorityFactory(manifest, physicalResources)({
      officialNodeExecutablePath: process.execPath,
      resourceRoot: root,
      runtimeRoot,
    });
    let stamp: ReturnType<typeof bindElectronPhysicalResourceSet>["resources"][number]["stamp"] | null = null;
    try {
      const prepared = await authority.prepare({ correlationId: "authority-test", releaseVersion: manifest.version, scope: { channel: manifest.channel, namespace: manifest.namespace }, shell: manifest.shell });
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
      const releases = new Map<string, Uint8Array>([
        [installation.update.channelHeadUrl, channelHead],
        ["https://releases.invalid/content-v2.json", nextContent],
        ["https://releases.invalid/closure-v2.mjs", nextClosure],
      ]);
      vi.stubGlobal("fetch", async (input: string | URL | Request) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        const body = releases.get(url);
        return body == null ? new Response(null, { status: 404 }) : new Response(Buffer.from(body), { status: 200 });
      });
      await expect(prepared.contentUpdater.prepareLatest("observe"))
        .resolves.toMatchObject({ status: "prepared", generation: { releaseVersion: nextMetadata.releaseVersion }, authorized: false });
      const competingLifecycle = new ElectronStandaloneControlClient(
        { channel: manifest.channel, namespace: manifest.namespace },
        createElectronStandaloneControlTransport(stamp),
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

      const invalidLauncher = Buffer.from("export const invalidLauncher = true;\n");
      const invalidLauncherDigest = createHash("sha256").update(invalidLauncher).digest("hex");
      const failedMetadata: StandaloneMetadata = {
        ...nextMetadata,
        releaseVersion: "0.1.0-betahyx.3",
        publishedAt: "2026-09-04T00:03:00.000Z",
        blobs: {
          [invalidLauncherDigest]: { sha256: invalidLauncherDigest, size: invalidLauncher.byteLength, mediaType: "text/javascript", sources: [{ kind: "remote", url: "https://releases.invalid/invalid-launcher.mjs" }] },
          [nextClosureDigest]: nextMetadata.blobs[nextClosureDigest]!,
        },
        resources: [
          { id: "standalone-launcher", component: "standalone.launcher", blob: invalidLauncherDigest, sync: true, materialization: { type: "file", entrypoint: "standalone-launcher.mjs" } },
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
      releases.set("https://releases.invalid/invalid-launcher.mjs", invalidLauncher);
      await expect(prepared.contentUpdater.prepareLatest("observe"))
        .resolves.toMatchObject({ status: "prepared", generation: { releaseVersion: failedMetadata.releaseVersion } });
      await expect(prepared.contentUpdater.applyNow()).rejects.toThrow("lacks createStandaloneGenerationBootloader");
      expect(await handle.readStatus()).toMatchObject({ state: "running", generationId: applied.generation.id, bindingDigest: applied.binding.digest });

      const updaterLedger = new ElectronStandaloneShellUpdaterLedger(join(runtimeRoot, "standalone-store"), { channel: manifest.channel, namespace: manifest.namespace }, "electron");
      const artifactPath = join(root, "closure-seed.mjs");
      const handoff = {
        interaction: "restart-and-install" as const,
        releaseVersion: "0.2.0-betahyx.1",
        target,
        artifact: { path: artifactPath, sha256: closureDigest, size: closure.byteLength, mediaType: "application/octet-stream" },
        shell: { type: "electron", version: "0.2.0", buildHash: "c".repeat(64) },
      };
      let updaterState = SHELL_UPDATE_ALGEBRA.initial("electron");
      for (const command of [
        { state: "checking" as const },
        { state: "available" as const, candidateId: "candidate-020" },
        { state: "downloading" as const },
        { state: "ready" as const, handoff },
      ]) updaterState = SHELL_UPDATE_ALGEBRA.reduce(updaterState, { expectedRevision: updaterState.revision, ...command });
      await updaterLedger.write(updaterState);
      const applying = await prepared.updater.invoke("force-stop-and-install");
      expect(applying).toMatchObject({ outcome: "accepted", snapshot: { state: "applying" } });
      await expect(prepared.contentUpdater.prepareLatest("observe"))
        .resolves.toMatchObject({ status: "prepared", generation: { releaseVersion: failedMetadata.releaseVersion } });
      await expect(prepared.contentUpdater.applyNow()).resolves.toMatchObject({ status: "blocked", reason: "transition-active" });
      const installAttemptId = applying.snapshot.installAttemptId!;
      const installationRequest = { handoff, installAttemptId, nodeExecutablePath: process.execPath, parentPid: process.pid, runtimeRoot, mode: "verify-only" as const };
      await expect(prepared.armShellInstallation({
        request: installationRequest,
        async install() { throw new Error("injected crash after sealed claim"); },
      })).rejects.toThrow("injected crash after sealed claim");
      expect(await new ElectronStandaloneInstallerClaimLedger(join(runtimeRoot, "standalone-store"), { channel: manifest.channel, namespace: manifest.namespace }).read())
        .toMatchObject({ state: "sealed", bindingDigest: applied.binding.digest, generationId: applied.generation.id, installAttemptId });

      let installerCalls = 0;
      const install = async (request: typeof installationRequest) => {
          installerCalls += 1;
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
      const receipt = await prepared.armShellInstallation({ request: installationRequest, install });
      expect(receipt).toMatchObject({ state: "armed", installAttemptId });
      expect(await prepared.armShellInstallation({ request: installationRequest, install })).toEqual(receipt);
      expect(installerCalls).toBe(1);
      expect(await handle.close()).toMatchObject({ state: "stopped", generationId: applied.generation.id, bindingDigest: applied.binding.digest });
      expect(await updaterLedger.read()).toMatchObject({ state: "handed-off", installAttemptId });
      expect(await new ElectronStandaloneInstallerClaimLedger(join(runtimeRoot, "standalone-store"), { channel: manifest.channel, namespace: manifest.namespace }).read())
        .toMatchObject({ state: "armed", bindingDigest: applied.binding.digest, generationId: applied.generation.id, installAttemptId });

      const replacementManifest: ElectronShellManifest = {
        ...manifest,
        version: handoff.shell.version,
        shell: { ...handoff.shell, digest: "d".repeat(64) },
      };
      const replacementAuthority = createElectronStandaloneAuthorityFactory(replacementManifest, physicalResources)({
        officialNodeExecutablePath: process.execPath,
        resourceRoot: root,
        runtimeRoot,
      });
      const replacement = await replacementAuthority.prepare({
        correlationId: "replacement-authority-test",
        releaseVersion: replacementManifest.version,
        scope: { channel: replacementManifest.channel, namespace: replacementManifest.namespace },
        shell: replacementManifest.shell,
      });
      expect(await replacement.updater.confirmInstalled(replacementManifest.shell))
        .toMatchObject({ outcome: "accepted", snapshot: { state: "installed", installAttemptId } });
      const replacementHandle = await replacement.start({
        attachment: { id: "electron-replacement", shell: replacementManifest.shell },
        capabilities: { async invoke(request) { return { requestId: request.requestId, attachmentId: request.attachmentId, bindingDigest: request.bindingDigest, outcome: "unsupported" }; } },
      });
      expect(await replacementHandle.readStatus()).toMatchObject({ state: "running", generationId: replacement.generation.id, bindingDigest: replacement.binding.digest });
      await replacementHandle.close();
    } finally {
      if (stamp != null) {
        const stopped = await stopSidecar(stamp, { termGraceMs: 1_000, killGraceMs: 1_000 });
        expect(stopped.remainingPids).toEqual([]);
      }
    }
  }, 30_000);
});
