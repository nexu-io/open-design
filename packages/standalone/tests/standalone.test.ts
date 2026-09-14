import { generateKeyPairSync } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
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
  createStandaloneGenerationBinding,
  sha256Hex,
  signStandaloneChannelHead,
  signStandaloneMetadata,
  signStandaloneShellMetadata,
  sweepStandaloneStore,
  verifyStandaloneChannelHead,
  validateStandaloneMetadata,
  verifyStandaloneShellMetadata,
  type GenerationRecord,
  type LifecycleAttachment,
  type LifecyclePort,
  type LifecycleScope,
  type LifecycleStatus,
  type SignedStandaloneMetadata,
  type StandaloneMetadata,
  type StandaloneGenerationHandoffPort,
  type StandaloneShellIdentity,
} from "../src/index.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

const terminal = Object.freeze({ type: "terminal", version: "0.1.0", buildHash: "b".repeat(64), digest: "a".repeat(64) });

function metadata(
  bytes: Uint8Array,
  releaseVersion = "0.1.0-somechan.1",
  minVersion = "0.1.0",
  channel = "somechan",
  shellRequirements: StandaloneMetadata["shellRequirements"] = [{ type: "terminal", minVersion, buildHash: "b".repeat(64) }],
): StandaloneMetadata {
  const digest = sha256Hex(bytes);
  return {
    schemaVersion: 4,
    channel,
    releaseVersion,
    standaloneVersion: "0.1.0",
    sourceCommit: "7a4175c86fe305b6432081c3dc269cd4bd4ec04d",
    publishedAt: "2026-08-24T00:00:00.000Z",
    blobs: { [digest]: { sha256: digest, size: bytes.byteLength, mediaType: "text/javascript", sources: [{ kind: "remote", url: "https://fixtures.invalid/content.mjs" }] } },
    resources: [
      { id: "standalone-launcher", component: "standalone.launcher", blob: digest, sync: true, materialization: { type: "file", entrypoint: "fixture.mjs" } },
      { id: "fixture", component: "standalone.resource", blob: digest, sync: true, materialization: { type: "file", entrypoint: "fixture.mjs" } },
    ],
    shellRequirements,
  };
}

async function blobOptions(root: string, bytes: Uint8Array) {
  const digest = sha256Hex(bytes);
  const path = join(root, "fixtures", digest);
  await mkdir(join(root, "fixtures"), { recursive: true });
  await writeFile(path, bytes);
  return { candidates: { [digest]: [{ path, source: "seed" as const }] } };
}

class FixturePort implements LifecyclePort {
  private scope: LifecycleScope | null = null;
  private generationId: string | null = null;
  private bindingDigest: string | null = null;
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
      scope: this.scope ?? { channel: "somechan", namespace: "shared" },
      state,
      generationId: this.generationId,
      bindingDigest: this.bindingDigest,
      instanceId: this.instanceId,
      references: this.attachments.size,
      occupants: [...this.attachments.values()].map((attachment) => ({ attachmentId: attachment.id, generationId: this.generationId!, shell: attachment.shell })),
      fence: this.fence,
      lease: state === "running" ? { heartbeatIntervalMs: 5_000, expiresAt: "2026-08-24T00:01:00.000Z" } : null,
    };
  }

  async start(scope: LifecycleScope, generation: GenerationRecord, attachment: LifecycleAttachment, binding: import("../src/index.js").StandaloneGenerationBinding): Promise<LifecycleStatus> {
    this.bindScope(scope);
    if (generation.id === this.failGenerationId) throw new Error("activation failed");
    if (this.generationId != null && this.generationId !== generation.id) throw new Error("different generation is already running");
    if (this.bindingDigest != null && this.bindingDigest !== binding.digest) throw new Error("different generation binding is already running");
    if (this.generationId == null) this.fence += 1;
    this.generationId = generation.id;
    this.bindingDigest ??= binding.digest;
    this.instanceId ??= `fixture-instance-${this.fence}`;
    this.attachments.set(attachment.id, attachment);
    return this.snapshot();
  }

  async awaitReady(scope: LifecycleScope, readiness: { generationId: string; bindingDigest: string; instanceId: string; attachmentId: string }) {
    this.bindScope(scope);
    const current = this.snapshot();
    if (
      current.state !== "running"
      || current.generationId !== readiness.generationId
      || current.bindingDigest !== readiness.bindingDigest
      || current.instanceId !== readiness.instanceId
      || !current.occupants.some(({ attachmentId }) => attachmentId === readiness.attachmentId)
    ) throw new Error("fixture readiness acknowledgement is stale");
    return readiness;
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
    this.bindingDigest = null;
    this.instanceId = null;
    this.fence += 1;
    return this.snapshot("stopped");
  }
}

const fixtureScope = Object.freeze({ channel: "somechan", namespace: "shared" });

async function stopFixture(lifecycle: FixturePort): Promise<void> {
  const status = await lifecycle.status(fixtureScope);
  await lifecycle.stop(fixtureScope, status.fence);
}

async function fixtureStore(root: string, bytes: Buffer, releaseVersion = "0.1.0-somechan.1") {
  const keys = generateKeyPairSync("ed25519");
  const trusted = new Map([["test", keys.publicKey]]);
  const store = new StandaloneStore(root, { channel: "somechan", namespace: "shared" });
  const generation = await store.prepare(signStandaloneMetadata(metadata(bytes, releaseVersion), "test", keys.privateKey), trusted, await blobOptions(root, bytes));
  return { generation, keys, store, trusted };
}

async function authorize(store: StandaloneStore, source: "initial-bootstrap" | "repair" | "silent-policy" | "user-restart") {
  const state = await store.readState();
  if (state.prepared == null) throw new Error("fixture has no prepared generation");
  const authority = source === "user-restart" ? "user" : "silent";
  const cause = source === "initial-bootstrap"
    ? "installed-seed"
    : source === "repair"
      ? "repair"
      : source === "user-restart"
        ? "user-interaction"
        : "update-policy";
  return store.authorizePrepared(state.prepared, authority, cause, state.revision);
}

async function activate(store: StandaloneStore, shell: StandaloneShellIdentity) {
  const state = await store.readState();
  if (state.prepared == null) throw new Error("fixture has no prepared generation");
  return store.activatePrepared(state.prepared, shell, state.revision);
}

describe("standalone exact lifecycle", () => {
  it("shares the repository namespace character and length contract", () => {
    expect(new StandaloneStore("/unused", { channel: "somechan", namespace: "Team.Shared_01" }).namespace).toBe("Team.Shared_01");
    expect(() => new StandaloneStore("/unused", { channel: "somechan", namespace: `n${"x".repeat(128)}` })).toThrow("invalid standalone namespace");
  });

  it("keeps preparation non-authoritative until explicit activation and health confirmation", async () => {
    const root = await mkdtemp(join(tmpdir(), "standalone-store-")); roots.push(root);
    const bytes = Buffer.from("export default 'fixture';\n");
    const { generation, store } = await fixtureStore(root, bytes);
    expect(await store.readState()).toEqual({ schemaVersion: 4, revision: 1, prepared: generation.id, activationIntent: null, activationAttempt: null, active: null, lastHealthy: null });
    await authorize(store, "initial-bootstrap");
    const lifecycle = new FixturePort();
    const handoffs: string[] = [];
    const handoff: StandaloneGenerationHandoffPort = {
      async start(input) {
        handoffs.push(input.binding.digest);
        expect(input.binding.launcher.path).toBe(generation.launcher.path);
        return input.start();
      },
    };
    const launcher = new VersionedLauncher(store, lifecycle, terminal, "terminal-1", undefined, handoff);
    const selectedBindings: string[] = [];
    const fossil = new FossilBootloader(store, terminal, async (binding) => {
      selectedBindings.push(binding.digest);
      expect(binding.generationId).toBe(generation.id);
      return launcher;
    });
    await expect(fossil.start()).resolves.toMatchObject({ state: "running", generationId: generation.id, references: 1 });
    expect(handoffs).toHaveLength(1);
    expect(selectedBindings).toEqual(handoffs);
    expect(await store.readState()).toMatchObject({ schemaVersion: 4, revision: 5, prepared: null, activationIntent: null, activationAttempt: null, active: generation.id, lastHealthy: generation.id });
    expect(await readFile(generation.resources.fixture!.path, "utf8")).toContain("fixture");
  });

  it("fails closed before materializing tampered metadata", async () => {
    const root = await mkdtemp(join(tmpdir(), "standalone-tamper-")); roots.push(root);
    const bytes = Buffer.from("fixture");
    const keys = generateKeyPairSync("ed25519");
    const envelope = signStandaloneMetadata(metadata(bytes), "test", keys.privateKey);
    envelope.metadata.releaseVersion = "0.1.0-somechan.2";
    const store = new StandaloneStore(root, { channel: "somechan", namespace: "shared" });
    await expect(store.prepare(envelope, new Map([["test", keys.publicKey]]), await blobOptions(root, bytes))).rejects.toThrow("signature verification failed");
    expect(await store.readState()).toEqual({ schemaVersion: 4, revision: 0, prepared: null, activationIntent: null, activationAttempt: null, active: null, lastHealthy: null });
  });

  it("requires exactly one typed standalone.launcher in every signed content graph", () => {
    const value = metadata(Buffer.from("fixture"));
    expect(() => validateStandaloneMetadata({ ...value, resources: value.resources.filter(({ component }) => component !== "standalone.launcher") }))
      .toThrow("exactly one standalone.launcher");
    expect(() => validateStandaloneMetadata({ ...value, resources: [...value.resources, { ...value.resources[0]!, id: "other-launcher" }] }))
      .toThrow("exactly one standalone.launcher");
  });

  it("retries an interrupted attempt and rolls back only after a failed health proof", async () => {
    const root = await mkdtemp(join(tmpdir(), "standalone-recover-")); roots.push(root);
    const { keys, store, trusted } = await fixtureStore(root, Buffer.from("first"));
    await authorize(store, "initial-bootstrap");
    const lifecycle = new FixturePort();
    await new FossilBootloader(store, terminal, async () => new VersionedLauncher(store, lifecycle, terminal, "first-shell")).start();
    const first = await store.activeGeneration();
    const secondBytes = Buffer.from("second");
    const second = await store.prepare(signStandaloneMetadata(metadata(secondBytes, "0.1.0-somechan.2"), "test", keys.privateKey), trusted, await blobOptions(root, secondBytes));
    await authorize(store, "silent-policy");
    await activate(store, terminal);
    await store.beginActiveAttempt(terminal);
    expect(await store.readState()).toMatchObject({ active: second.id, activationAttempt: { generationId: second.id, launchCount: 1 }, lastHealthy: first.id });
    await stopFixture(lifecycle);
    lifecycle.failGenerationId = second.id;
    await expect(new FossilBootloader(store, terminal, async () => new VersionedLauncher(store, lifecycle, terminal, "second-shell")).start()).rejects.toThrow("activation failed");
    expect(await store.readState()).toMatchObject({ active: first.id, activationAttempt: null, lastHealthy: first.id });
    lifecycle.failGenerationId = null;
    await expect(new FossilBootloader(store, terminal, async () => new VersionedLauncher(store, lifecycle, terminal, "recovery-shell")).start()).resolves.toMatchObject({ generationId: first.id });
  });

  it("rolls an unsuccessful first activation back to an empty binding", async () => {
    const root = await mkdtemp(join(tmpdir(), "standalone-first-failure-")); roots.push(root);
    const { generation, store } = await fixtureStore(root, Buffer.from("first"));
    await authorize(store, "initial-bootstrap");
    const lifecycle = new FixturePort();
    lifecycle.failGenerationId = generation.id;
    const launcher = new VersionedLauncher(store, lifecycle, terminal, "terminal");
    await expect(new FossilBootloader(store, terminal, async () => launcher).start()).rejects.toThrow("activation failed");
    expect(await store.readState()).toMatchObject({ schemaVersion: 4, prepared: null, activationIntent: null, activationAttempt: null, active: null, lastHealthy: null });
  });

  it("attaches a new Shell identity without reopening healthy generation state", async () => {
    const root = await mkdtemp(join(tmpdir(), "standalone-shell-")); roots.push(root);
    const { generation, store } = await fixtureStore(root, Buffer.from("fixture"));
    await authorize(store, "initial-bootstrap");
    const lifecycle = new FixturePort();
    await new FossilBootloader(store, terminal, async () => new VersionedLauncher(store, lifecycle, terminal, "terminal")).start();
    await stopFixture(lifecycle);
    const replacement = { type: "terminal", version: "0.2.0", buildHash: "c".repeat(64), digest: "b".repeat(64) } satisfies StandaloneShellIdentity;
    const before = await store.readState();
    await new FossilBootloader(store, replacement, async () => new VersionedLauncher(store, lifecycle, replacement, "replacement")).start();
    expect(await store.readState()).toEqual(before);
  });

  it("shares one channel namespace instance across Shell attachments with leases and fenced stop", async () => {
    const root = await mkdtemp(join(tmpdir(), "standalone-shared-instance-")); roots.push(root);
    const artifact = Buffer.from("fixture");
    const keys = generateKeyPairSync("ed25519");
    const store = new StandaloneStore(root, fixtureScope);
    await store.prepare(
      signStandaloneMetadata(metadata(artifact, "0.1.0-somechan.1", "0.1.0", "somechan", [
        { type: "terminal", minVersion: "0.1.0", buildHash: "b".repeat(64) },
        { type: "electron", minVersion: "1.0.0", buildHash: "c".repeat(64) },
      ]), "test", keys.privateKey),
      new Map([["test", keys.publicKey]]),
      await blobOptions(root, artifact),
    );
    await authorize(store, "initial-bootstrap");
    const lifecycle = new FixturePort();
    const terminalLauncher = new VersionedLauncher(store, lifecycle, terminal, "terminal");
    const terminalStatus = await new FossilBootloader(store, terminal, async () => terminalLauncher).start();
    const electron = { type: "electron", version: "1.0.0", buildHash: "c".repeat(64), digest: "b".repeat(64) } satisfies StandaloneShellIdentity;
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
    const store = new StandaloneStore(root, { channel: "somechan", namespace: "shared" });
    await store.prepare(signStandaloneMetadata(metadata(bytes, "0.1.0-somechan.1", "0.2.0"), "test", keys.privateKey), new Map([["test", keys.publicKey]]), await blobOptions(root, bytes));
    await authorize(store, "initial-bootstrap");
    const fossil = new FossilBootloader(store, terminal, async () => new VersionedLauncher(store, new FixturePort(), terminal, "terminal"));
    await expect(fossil.start()).rejects.toMatchObject({ code: "installer-required" } satisfies Partial<StandaloneBootstrapError>);
  });

  it("hard-rejects activation while an active Terminal reference is below its declared floor", async () => {
    const root = await mkdtemp(join(tmpdir(), "standalone-occupant-floor-")); roots.push(root);
    const bytes = Buffer.from("fixture");
    const keys = generateKeyPairSync("ed25519");
    const store = new StandaloneStore(root, fixtureScope);
    const generation = await store.prepare(signStandaloneMetadata(metadata(bytes, "0.1.0-somechan.1", "0.2.0", "somechan", [
      { type: "terminal", minVersion: "0.2.0", buildHash: "b".repeat(64) },
      { type: "electron", minVersion: "1.0.0", buildHash: "c".repeat(64) },
    ]), "test", keys.privateKey), new Map([["test", keys.publicKey]]), await blobOptions(root, bytes));
    await authorize(store, "initial-bootstrap");
    const lifecycle = new FixturePort();
    const occupiedGeneration = { ...generation, id: "d".repeat(64) };
    await lifecycle.start(fixtureScope, occupiedGeneration, { id: "old-terminal", shell: terminal }, createStandaloneGenerationBinding(occupiedGeneration, fixtureScope));
    const electron = { type: "electron", version: "1.0.0", buildHash: "c".repeat(64), digest: "e".repeat(64) } satisfies StandaloneShellIdentity;
    await expect(new FossilBootloader(store, electron, async () => new VersionedLauncher(store, lifecycle, electron, "electron")).start())
      .rejects.toMatchObject({ code: "shell-update-required" });
    expect(await store.readState()).toMatchObject({ active: null, activationAttempt: null, lastHealthy: null });
  });

  it("leaves an unauthorized prepared update inactive during cold start", async () => {
    const root = await mkdtemp(join(tmpdir(), "standalone-prepared-")); roots.push(root);
    const { keys, store, trusted } = await fixtureStore(root, Buffer.from("first"));
    await authorize(store, "initial-bootstrap");
    const lifecycle = new FixturePort();
    await new FossilBootloader(store, terminal, async () => new VersionedLauncher(store, lifecycle, terminal, "first")).start();
    const active = await store.activeGeneration();
    await stopFixture(lifecycle);
    const secondBytes = Buffer.from("second");
    const prepared = await store.prepare(signStandaloneMetadata(metadata(secondBytes, "0.1.0-somechan.2"), "test", keys.privateKey), trusted, await blobOptions(root, secondBytes));
    await expect(new FossilBootloader(store, terminal, async () => new VersionedLauncher(store, lifecycle, terminal, "second")).start()).resolves.toMatchObject({ generationId: active.id });
    expect(await store.readState()).toMatchObject({ prepared: prepared.id, activationIntent: null, active: active.id, lastHealthy: active.id });
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
      channel: "somechan",
      publishedAt: "2026-08-24T00:00:00.000Z",
      lanes: { content: { releaseVersion: "0.1.0-somechan.1", url: "https://fixtures.invalid/metadata.json", sha256: sha256Hex(metadataBytes), size: metadataBytes.byteLength } },
    }, [{ keyId: "old", privateKey: oldKeys.privateKey }, { keyId: "next", privateKey: nextKeys.privateKey }]);
    const trusted = new Map([["next", nextKeys.publicKey]]);
    expect(verifyStandaloneChannelHead(head, trusted)).toBe("next");
    const store = new StandaloneStore(root, { channel: "somechan", namespace: "shared" });
    const updater = new StandaloneUpdater("somechan", "content", terminal, trusted, store, {
      readChannelHead: async () => head,
      readDocument: async () => metadataBytes,
      prepare: await blobOptions(root, artifact),
    });
    await expect(updater.prepareLatest("observe")).resolves.toMatchObject({ status: "prepared", authorized: false });
    expect(await store.readState()).toMatchObject({ prepared: expect.any(String), activationIntent: null, active: null, activationAttempt: null });
    await expect(updater.prepareLatest("authorize-silent")).resolves.toMatchObject({ status: "prepared", authorized: true });
    expect(await store.readState()).toMatchObject({ activationIntent: { authority: "silent", cause: "update-policy" } });

    const updaterFor = (candidate: SignedStandaloneMetadata) => {
      const candidateBytes = Buffer.from(canonicalJson(candidate));
      const candidateHead = signStandaloneChannelHead({
        schemaVersion: 1,
        channel: "somechan",
        publishedAt: "2026-08-24T00:00:01.000Z",
        lanes: { content: { releaseVersion: candidate.metadata.releaseVersion, url: "https://fixtures.invalid/candidate.json", sha256: sha256Hex(candidateBytes), size: candidateBytes.byteLength } },
      }, [{ keyId: "next", privateKey: nextKeys.privateKey }]);
      return new StandaloneUpdater("somechan", "content", terminal, trusted, store, {
        readChannelHead: async () => candidateHead,
        readDocument: async () => candidateBytes,
      });
    };
    const downgrade = signStandaloneMetadata(metadata(artifact, "0.1.0-somechan.0"), "next", nextKeys.privateKey);
    await expect(updaterFor(downgrade).prepareLatest("observe")).rejects.toThrow("would downgrade");
    const collision = signStandaloneMetadata(metadata(Buffer.from("collision")), "next", nextKeys.privateKey);
    await expect(updaterFor(collision).prepareLatest("observe")).rejects.toThrow("immutable release metadata collision");
  });

  it("binds optional Shell updater sidecars to immutable target distributions", () => {
    const keys = generateKeyPairSync("ed25519");
    const envelope = signStandaloneShellMetadata({
      schemaVersion: 1,
      channel: "somechan",
      releaseVersion: "0.1.0-somechan.1",
      sourceCommit: "7a4175c86fe305b6432081c3dc269cd4bd4ec04d",
      publishedAt: "2026-08-24T00:00:00.000Z",
      distributions: [{
        shell: { type: "terminal", version: "0.1.0", buildHash: "b".repeat(64) },
        target: "darwin-arm64",
        artifact: { url: "https://fixtures.invalid/terminal.tar.gz", sha256: "c".repeat(64), size: 1024, mediaType: "application/gzip" },
        updater: { protocol: "standalone-shell-updater-v3", handler: "fixture-v3", interaction: "restart-and-install" },
      }],
    }, [{ keyId: "terminal", privateKey: keys.privateKey }]);
    expect(verifyStandaloneShellMetadata(envelope, new Map([["terminal", keys.publicKey]]))).toBe("terminal");
    expect(() => signStandaloneShellMetadata({ ...envelope.document, distributions: [...envelope.document.distributions, envelope.document.distributions[0]!] }, [{ keyId: "terminal", privateKey: keys.privateKey }]))
      .toThrow("duplicate Shell distribution");
  });

  it("isolates channel state while retaining global content-addressed blobs", async () => {
    const root = await mkdtemp(join(tmpdir(), "standalone-channels-")); roots.push(root);
    const artifact = Buffer.from("same immutable closure");
    const keys = generateKeyPairSync("ed25519");
    const trusted = new Map([["test", keys.publicKey]]);
    const beta = new StandaloneStore(root, { channel: "somechan", namespace: "shared" });
    const preview = new StandaloneStore(root, { channel: "somepreview", namespace: "shared" });
    const betaGeneration = await beta.prepare(signStandaloneMetadata(metadata(artifact), "test", keys.privateKey), trusted, await blobOptions(root, artifact));
    await expect(preview.prepare(signStandaloneMetadata(metadata(artifact), "test", keys.privateKey), trusted, await blobOptions(root, artifact))).rejects.toThrow("escaped Store channel");
    const previewGeneration = await preview.prepare(
      signStandaloneMetadata(metadata(artifact, "0.1.0-somepreview.1", "0.1.0", "somepreview"), "test", keys.privateKey),
      trusted,
      await blobOptions(root, artifact),
    );
    expect(previewGeneration.id).not.toBe(betaGeneration.id);
    expect(previewGeneration.resources.fixture?.path).toBe(betaGeneration.resources.fixture?.path);
    expect(await beta.readState()).toMatchObject({ prepared: betaGeneration.id });
    expect(await preview.readState()).toMatchObject({ prepared: previewGeneration.id });
    const orphan = "f".repeat(64);
    await writeFile(join(root, "blobs", "sha256", orphan), "orphan");
    await expect(sweepStandaloneStore(root)).resolves.toEqual({ discardedBlobs: 1, discardedMaterializations: 0 });
    await expect(stat(join(root, "blobs", "sha256", artifactSha(artifact)))).resolves.toMatchObject({ size: artifact.byteLength });
    expect(await readdir(join(root, "trash"))).toHaveLength(1);
  });
});

function artifactSha(bytes: Uint8Array): string { return sha256Hex(bytes); }
