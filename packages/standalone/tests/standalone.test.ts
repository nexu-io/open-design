import { generateKeyPairSync } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  FossilBootloader,
  StandaloneBootstrapError,
  StandaloneStore,
  StandaloneUpdater,
  VersionedLauncher,
  canonicalJson,
  sha256Hex,
  signStandaloneChannelHead,
  signStandaloneMetadata,
  verifyStandaloneChannelHead,
  type GenerationRecord,
  type LifecycleAttachment,
  type LifecyclePort,
  type LifecycleScope,
  type LifecycleStatus,
  type SignedStandaloneMetadata,
  type StandaloneMetadata,
  type StandaloneShellIdentity,
} from "../src/index.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

const terminal = Object.freeze({ type: "terminal", version: "0.1.0", digest: "a".repeat(64) });

function metadata(
  bytes: Uint8Array,
  releaseVersion = "0.1.0-betahyx.1",
  minVersion = "0.1.0",
  channel = "betahyx",
  shellRequirements: StandaloneMetadata["shellRequirements"] = [{ type: "terminal", minVersion }],
): StandaloneMetadata {
  return {
    schemaVersion: 2,
    channel,
    releaseVersion,
    standaloneVersion: "0.1.0",
    sourceCommit: "7a4175c86fe305b6432081c3dc269cd4bd4ec04d",
    publishedAt: "2026-08-24T00:00:00.000Z",
    components: [{ name: "fixture", mode: "required", artifact: { entrypoint: "fixture.mjs", sha256: sha256Hex(bytes), size: bytes.byteLength, url: "https://fixtures.invalid/content.mjs" } }],
    shellRequirements,
  };
}

class FixturePort implements LifecyclePort {
  private scope: LifecycleScope | null = null;
  private generationId: string | null = null;
  private instanceId: string | null = null;
  private readonly attachments = new Map<string, LifecycleAttachment>();
  private fence = 0;
  failGenerationId: string | null = null;

  private bindScope(scope: LifecycleScope): void {
    if (this.scope != null && (this.scope.channel !== scope.channel || this.scope.namespace !== scope.namespace)) {
      throw new Error("fixture lifecycle is bound to another channel namespace");
    }
    this.scope = { ...scope };
  }

  private snapshot(state: "running" | "stopped" = this.generationId == null ? "stopped" : "running"): LifecycleStatus {
    return {
      scope: this.scope ?? { channel: "betahyx", namespace: "shared" },
      state,
      generationId: this.generationId,
      instanceId: this.instanceId,
      references: this.attachments.size,
      fence: this.fence,
      lease: state === "running" ? { heartbeatIntervalMs: 5_000, expiresAt: "2026-08-24T00:01:00.000Z" } : null,
    };
  }

  async start(scope: LifecycleScope, generation: GenerationRecord, attachment: LifecycleAttachment): Promise<LifecycleStatus> {
    this.bindScope(scope);
    if (generation.id === this.failGenerationId) throw new Error("activation failed");
    if (this.generationId != null && this.generationId !== generation.id) throw new Error("different generation is already running");
    if (this.generationId == null) this.fence += 1;
    this.generationId = generation.id;
    this.instanceId ??= `fixture-instance-${this.fence}`;
    this.attachments.set(attachment.id, attachment);
    return this.snapshot();
  }

  async heartbeat(scope: LifecycleScope, attachment: LifecycleAttachment): Promise<LifecycleStatus> {
    this.bindScope(scope);
    if (!this.attachments.has(attachment.id)) throw new Error("attachment is unavailable");
    this.attachments.set(attachment.id, attachment);
    return this.snapshot();
  }

  async release(scope: LifecycleScope, attachmentId: string): Promise<LifecycleStatus> {
    this.bindScope(scope);
    this.attachments.delete(attachmentId);
    return this.snapshot();
  }

  async status(scope: LifecycleScope): Promise<LifecycleStatus> { this.bindScope(scope); return this.snapshot(); }
  async stop(scope: LifecycleScope, fence: number): Promise<LifecycleStatus> {
    this.bindScope(scope);
    if (fence !== this.fence) throw new Error("stale lifecycle stop fence");
    this.attachments.clear();
    this.generationId = null;
    this.instanceId = null;
    this.fence += 1;
    return this.snapshot("stopped");
  }
}

const fixtureScope = Object.freeze({ channel: "betahyx", namespace: "shared" });

async function stopFixture(lifecycle: FixturePort): Promise<void> {
  const status = await lifecycle.status(fixtureScope);
  await lifecycle.stop(fixtureScope, status.fence);
}

async function fixtureStore(root: string, bytes: Buffer, releaseVersion = "0.1.0-betahyx.1") {
  const keys = generateKeyPairSync("ed25519");
  const trusted = new Map([["test", keys.publicKey]]);
  const store = new StandaloneStore(root, { channel: "betahyx", namespace: "shared" });
  const generation = await store.prepare(signStandaloneMetadata(metadata(bytes, releaseVersion), "test", keys.privateKey), trusted, async () => bytes);
  return { generation, keys, store, trusted };
}

describe("standalone exact lifecycle", () => {
  it("shares the repository namespace character and length contract", () => {
    expect(new StandaloneStore("/unused", { channel: "betahyx", namespace: "Team.Shared_01" }).namespace).toBe("Team.Shared_01");
    expect(() => new StandaloneStore("/unused", { channel: "betahyx", namespace: `n${"x".repeat(128)}` })).toThrow("invalid standalone namespace");
  });

  it("keeps preparation non-authoritative until explicit activation and health confirmation", async () => {
    const root = await mkdtemp(join(tmpdir(), "standalone-store-")); roots.push(root);
    const bytes = Buffer.from("export default 'fixture';\n");
    const { generation, store } = await fixtureStore(root, bytes);
    expect(await store.readState()).toEqual({ schemaVersion: 2, prepared: generation.id, activationIntent: null, attempt: null, active: null, lastSuccessful: null });
    await store.authorizePrepared("initial-bootstrap");
    const lifecycle = new FixturePort();
    const launcher = new VersionedLauncher(store, lifecycle, terminal, "terminal-1");
    const fossil = new FossilBootloader(store, terminal, async () => launcher);
    await expect(fossil.start()).resolves.toMatchObject({ state: "running", generationId: generation.id, references: 1 });
    expect(await store.readState()).toEqual({ schemaVersion: 2, prepared: null, activationIntent: null, attempt: null, active: { generationId: generation.id, shell: terminal }, lastSuccessful: { generationId: generation.id, shell: terminal } });
    expect(await readFile(generation.components.fixture!.path, "utf8")).toContain("fixture");
  });

  it("fails closed before materializing tampered metadata", async () => {
    const root = await mkdtemp(join(tmpdir(), "standalone-tamper-")); roots.push(root);
    const bytes = Buffer.from("fixture");
    const keys = generateKeyPairSync("ed25519");
    const envelope = signStandaloneMetadata(metadata(bytes), "test", keys.privateKey);
    envelope.metadata.releaseVersion = "0.1.0-betahyx.2";
    const store = new StandaloneStore(root, { channel: "betahyx", namespace: "shared" });
    await expect(store.prepare(envelope, new Map([["test", keys.publicKey]]), async () => bytes)).rejects.toThrow("signature verification failed");
    expect(await store.readState()).toEqual({ schemaVersion: 2, prepared: null, activationIntent: null, attempt: null, active: null, lastSuccessful: null });
  });

  it("retries an interrupted attempt and rolls back only after a failed health proof", async () => {
    const root = await mkdtemp(join(tmpdir(), "standalone-recover-")); roots.push(root);
    const { keys, store, trusted } = await fixtureStore(root, Buffer.from("first"));
    await store.authorizePrepared("initial-bootstrap");
    const lifecycle = new FixturePort();
    await new FossilBootloader(store, terminal, async () => new VersionedLauncher(store, lifecycle, terminal, "first-shell")).start();
    const first = await store.activeGeneration();
    const secondBytes = Buffer.from("second");
    const second = await store.prepare(signStandaloneMetadata(metadata(secondBytes, "0.1.0-betahyx.2"), "test", keys.privateKey), trusted, async () => secondBytes);
    await store.authorizePrepared("silent-policy");
    await store.activatePrepared(terminal);
    expect(await store.readState()).toMatchObject({ active: { generationId: second.id }, attempt: { generationId: second.id }, lastSuccessful: { generationId: first.id } });
    await stopFixture(lifecycle);
    lifecycle.failGenerationId = second.id;
    await expect(new FossilBootloader(store, terminal, async () => new VersionedLauncher(store, lifecycle, terminal, "second-shell")).start()).resolves.toMatchObject({ generationId: first.id });
    expect(await store.readState()).toMatchObject({ active: { generationId: first.id }, attempt: null, lastSuccessful: { generationId: first.id } });
  });

  it("rolls an unsuccessful first activation back to an empty binding", async () => {
    const root = await mkdtemp(join(tmpdir(), "standalone-first-failure-")); roots.push(root);
    const { generation, store } = await fixtureStore(root, Buffer.from("first"));
    await store.authorizePrepared("initial-bootstrap");
    const lifecycle = new FixturePort();
    lifecycle.failGenerationId = generation.id;
    const launcher = new VersionedLauncher(store, lifecycle, terminal, "terminal");
    await expect(new FossilBootloader(store, terminal, async () => launcher).start()).rejects.toThrow("activation failed");
    expect(await store.readState()).toEqual({ schemaVersion: 2, prepared: null, activationIntent: null, attempt: null, active: null, lastSuccessful: null });
  });

  it("health-proves a new Shell identity without forking the generation", async () => {
    const root = await mkdtemp(join(tmpdir(), "standalone-shell-")); roots.push(root);
    const { generation, store } = await fixtureStore(root, Buffer.from("fixture"));
    await store.authorizePrepared("initial-bootstrap");
    const lifecycle = new FixturePort();
    await new FossilBootloader(store, terminal, async () => new VersionedLauncher(store, lifecycle, terminal, "terminal")).start();
    await stopFixture(lifecycle);
    const replacement = { type: "terminal", version: "0.2.0", digest: "b".repeat(64) } satisfies StandaloneShellIdentity;
    await new FossilBootloader(store, replacement, async () => new VersionedLauncher(store, lifecycle, replacement, "replacement")).start();
    expect(await store.readState()).toMatchObject({ active: { generationId: generation.id, shell: replacement }, lastSuccessful: { generationId: generation.id, shell: replacement }, attempt: null });
  });

  it("shares one channel namespace instance across Shell attachments with leases and fenced stop", async () => {
    const root = await mkdtemp(join(tmpdir(), "standalone-shared-instance-")); roots.push(root);
    const artifact = Buffer.from("fixture");
    const keys = generateKeyPairSync("ed25519");
    const store = new StandaloneStore(root, fixtureScope);
    await store.prepare(
      signStandaloneMetadata(metadata(artifact, "0.1.0-betahyx.1", "0.1.0", "betahyx", [
        { type: "terminal", minVersion: "0.1.0" },
        { type: "electron", minVersion: "1.0.0" },
      ]), "test", keys.privateKey),
      new Map([["test", keys.publicKey]]),
      async () => artifact,
    );
    await store.authorizePrepared("initial-bootstrap");
    const lifecycle = new FixturePort();
    const terminalLauncher = new VersionedLauncher(store, lifecycle, terminal, "terminal");
    const terminalStatus = await new FossilBootloader(store, terminal, async () => terminalLauncher).start();
    const electron = { type: "electron", version: "1.0.0", digest: "b".repeat(64) } satisfies StandaloneShellIdentity;
    const electronLauncher = new VersionedLauncher(store, lifecycle, electron, "electron");
    const electronStatus = await electronLauncher.start();
    expect(electronStatus).toMatchObject({ scope: fixtureScope, instanceId: terminalStatus.instanceId, references: 2, state: "running" });
    await expect(electronLauncher.heartbeat()).resolves.toMatchObject({ references: 2, lease: { heartbeatIntervalMs: 5_000 } });
    await expect(terminalLauncher.release()).resolves.toMatchObject({ references: 1, state: "running" });
    const unreferenced = await electronLauncher.release();
    expect(unreferenced).toMatchObject({ references: 0, state: "running" });
    await expect(lifecycle.stop(fixtureScope, unreferenced.fence - 1)).rejects.toThrow("stale lifecycle stop fence");
    await expect(electronLauncher.stop()).resolves.toMatchObject({ references: 0, state: "stopped", fence: unreferenced.fence + 1 });
  });

  it("routes a fossil min Shell failure to installer-required", async () => {
    const root = await mkdtemp(join(tmpdir(), "standalone-min-shell-")); roots.push(root);
    const bytes = Buffer.from("fixture");
    const keys = generateKeyPairSync("ed25519");
    const store = new StandaloneStore(root, { channel: "betahyx", namespace: "shared" });
    await store.prepare(signStandaloneMetadata(metadata(bytes, "0.1.0-betahyx.1", "0.2.0"), "test", keys.privateKey), new Map([["test", keys.publicKey]]), async () => bytes);
    await store.authorizePrepared("initial-bootstrap");
    const fossil = new FossilBootloader(store, terminal, async () => new VersionedLauncher(store, new FixturePort(), terminal, "terminal"));
    await expect(fossil.start()).rejects.toMatchObject({ code: "installer-required" } satisfies Partial<StandaloneBootstrapError>);
  });

  it("leaves an unauthorized prepared update inactive during cold start", async () => {
    const root = await mkdtemp(join(tmpdir(), "standalone-prepared-")); roots.push(root);
    const { keys, store, trusted } = await fixtureStore(root, Buffer.from("first"));
    await store.authorizePrepared("initial-bootstrap");
    const lifecycle = new FixturePort();
    await new FossilBootloader(store, terminal, async () => new VersionedLauncher(store, lifecycle, terminal, "first")).start();
    const active = await store.activeGeneration();
    await stopFixture(lifecycle);
    const secondBytes = Buffer.from("second");
    const prepared = await store.prepare(signStandaloneMetadata(metadata(secondBytes, "0.1.0-betahyx.2"), "test", keys.privateKey), trusted, async () => secondBytes);
    await expect(new FossilBootloader(store, terminal, async () => new VersionedLauncher(store, lifecycle, terminal, "second")).start()).resolves.toMatchObject({ generationId: active.id });
    expect(await store.readState()).toMatchObject({ prepared: prepared.id, activationIntent: null, active: { generationId: active.id }, lastSuccessful: { generationId: active.id } });
  });

  it("supports dual-sign rotation, monotonic discovery, and separate activation authorization", async () => {
    const root = await mkdtemp(join(tmpdir(), "standalone-update-")); roots.push(root);
    const artifact = Buffer.from("update");
    const oldKeys = generateKeyPairSync("ed25519");
    const nextKeys = generateKeyPairSync("ed25519");
    const envelope = signStandaloneMetadata(metadata(artifact), [{ keyId: "old", privateKey: oldKeys.privateKey }, { keyId: "next", privateKey: nextKeys.privateKey }]);
    const metadataBytes = Buffer.from(canonicalJson(envelope));
    const head = signStandaloneChannelHead({
      schemaVersion: 1,
      channel: "betahyx",
      publishedAt: "2026-08-24T00:00:00.000Z",
      lanes: { content: { releaseVersion: "0.1.0-betahyx.1", url: "https://fixtures.invalid/metadata.json", sha256: sha256Hex(metadataBytes), size: metadataBytes.byteLength } },
    }, [{ keyId: "old", privateKey: oldKeys.privateKey }, { keyId: "next", privateKey: nextKeys.privateKey }]);
    const trusted = new Map([["next", nextKeys.publicKey]]);
    expect(verifyStandaloneChannelHead(head, trusted)).toBe("next");
    const store = new StandaloneStore(root, { channel: "betahyx", namespace: "shared" });
    const updater = new StandaloneUpdater("betahyx", "content", terminal, trusted, store, {
      readChannelHead: async () => head,
      readDocument: async () => metadataBytes,
      readArtifact: async () => artifact,
    });
    await expect(updater.prepareLatest()).resolves.toMatchObject({ status: "prepared", authorized: false });
    expect(await store.readState()).toMatchObject({ prepared: expect.any(String), activationIntent: null, active: null, attempt: null });
    await expect(updater.prepareLatest("silent-policy")).resolves.toMatchObject({ status: "prepared", authorized: true });
    expect(await store.readState()).toMatchObject({ activationIntent: { source: "silent-policy" } });

    const updaterFor = (candidate: SignedStandaloneMetadata) => {
      const candidateBytes = Buffer.from(canonicalJson(candidate));
      const candidateHead = signStandaloneChannelHead({
        schemaVersion: 1,
        channel: "betahyx",
        publishedAt: "2026-08-24T00:00:01.000Z",
        lanes: { content: { releaseVersion: candidate.metadata.releaseVersion, url: "https://fixtures.invalid/candidate.json", sha256: sha256Hex(candidateBytes), size: candidateBytes.byteLength } },
      }, [{ keyId: "next", privateKey: nextKeys.privateKey }]);
      return new StandaloneUpdater("betahyx", "content", terminal, trusted, store, {
        readChannelHead: async () => candidateHead,
        readDocument: async () => candidateBytes,
        readArtifact: async () => artifact,
      });
    };
    const downgrade = signStandaloneMetadata(metadata(artifact, "0.1.0-betahyx.0"), "next", nextKeys.privateKey);
    await expect(updaterFor(downgrade).prepareLatest()).rejects.toThrow("would downgrade");
    const collision = signStandaloneMetadata(metadata(Buffer.from("collision")), "next", nextKeys.privateKey);
    await expect(updaterFor(collision).prepareLatest()).rejects.toThrow("immutable release metadata collision");
  });

  it("isolates channel state while retaining global content-addressed blobs", async () => {
    const root = await mkdtemp(join(tmpdir(), "standalone-channels-")); roots.push(root);
    const artifact = Buffer.from("same immutable closure");
    const keys = generateKeyPairSync("ed25519");
    const trusted = new Map([["test", keys.publicKey]]);
    const beta = new StandaloneStore(root, { channel: "betahyx", namespace: "shared" });
    const preview = new StandaloneStore(root, { channel: "previewhyx", namespace: "shared" });
    const betaGeneration = await beta.prepare(signStandaloneMetadata(metadata(artifact), "test", keys.privateKey), trusted, async () => artifact);
    await expect(preview.prepare(signStandaloneMetadata(metadata(artifact), "test", keys.privateKey), trusted, async () => artifact)).rejects.toThrow("escaped Store channel");
    const previewGeneration = await preview.prepare(
      signStandaloneMetadata(metadata(artifact, "0.1.0-previewhyx.1", "0.1.0", "previewhyx"), "test", keys.privateKey),
      trusted,
      async () => artifact,
    );
    expect(previewGeneration.id).not.toBe(betaGeneration.id);
    expect(previewGeneration.components.fixture?.path).toBe(betaGeneration.components.fixture?.path);
    expect(await beta.readState()).toMatchObject({ prepared: betaGeneration.id });
    expect(await preview.readState()).toMatchObject({ prepared: previewGeneration.id });
  });
});
