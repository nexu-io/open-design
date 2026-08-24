import {
  assertShellCompatibility,
  canonicalJson,
  sha256Hex,
  verifyStandaloneChannelHead,
  verifyStandaloneMetadata,
  type SignedStandaloneChannelHead,
  type SignedStandaloneMetadata,
  type StandaloneShellIdentity,
  type StandaloneTrustedKeyRing,
} from "./protocol.js";
import { type ActivationSource, type ArtifactReader, type GenerationRecord, StandaloneStore } from "./store.js";
import { FossilBootloader, type LifecycleStatus, type VersionedLauncher } from "./launcher.js";

export type StandaloneUpdateSource = {
  readChannelHead(channel: string): Promise<SignedStandaloneChannelHead>;
  readDocument(url: string): Promise<Uint8Array>;
  readArtifact: ArtifactReader;
};

export type UpdatePreparation =
  | { status: "prepared"; generation: GenerationRecord; authorized: boolean }
  | { status: "current"; generationId: string }
  | { status: "shell-reinstall-required"; releaseVersion: string; minimumVersion: string | null };

function parseEnvelope(bytes: Uint8Array): SignedStandaloneMetadata {
  return JSON.parse(Buffer.from(bytes).toString("utf8")) as SignedStandaloneMetadata;
}

function versionOrder(value: string, channel: string): number[] {
  const match = new RegExp(`^(\\d+)\\.(\\d+)\\.(\\d+)-${channel}\\.(\\d+)$`).exec(value);
  if (match == null) throw new Error(`invalid ${channel} release version: ${value}`);
  return match.slice(1).map(Number);
}

function compareReleaseVersions(left: string, right: string, channel: string): number {
  const a = versionOrder(left, channel);
  const b = versionOrder(right, channel);
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) return a[index]! - b[index]!;
  }
  return 0;
}

export class StandaloneUpdater {
  constructor(
    private readonly channel: string,
    private readonly contentLane: string,
    private readonly shell: StandaloneShellIdentity,
    private readonly trustedKeys: StandaloneTrustedKeyRing,
    private readonly store: StandaloneStore,
    private readonly source: StandaloneUpdateSource,
  ) {}

  async prepareLatest(activationSource?: ActivationSource): Promise<UpdatePreparation> {
    const signedHead = await this.source.readChannelHead(this.channel);
    verifyStandaloneChannelHead(signedHead, this.trustedKeys);
    const head = signedHead.head;
    if (head.channel !== this.channel) throw new Error("channel head escaped updater namespace");
    const lane = head.lanes[this.contentLane];
    if (lane == null) throw new Error(`channel head lacks content lane: ${this.contentLane}`);
    const bytes = await this.source.readDocument(lane.url);
    if (bytes.byteLength !== lane.size || sha256Hex(bytes) !== lane.sha256) throw new Error(`${this.contentLane} lane metadata failed binding verification`);
    const envelope = parseEnvelope(bytes);
    verifyStandaloneMetadata(envelope, this.trustedKeys);
    if (envelope.metadata.channel !== this.channel || envelope.metadata.releaseVersion !== lane.releaseVersion) throw new Error(`${this.contentLane} lane metadata identity mismatch`);
    try {
      assertShellCompatibility(envelope.metadata, this.shell);
    } catch (error) {
      if (!(error instanceof Error) || (error as { code?: unknown }).code !== "installer-required") throw error;
      const minimumVersion = envelope.metadata.shellRequirements.find(({ type }) => type === this.shell.type)?.minVersion ?? null;
      return { status: "shell-reinstall-required", releaseVersion: lane.releaseVersion, minimumVersion };
    }
    const id = sha256Hex(canonicalJson(envelope.metadata));
    const state = await this.store.readState();
    if (state.prepared === id) {
      const generation = await this.store.readGeneration(id);
      if (activationSource != null && state.activationIntent?.generationId !== id) await this.store.authorizePrepared(activationSource);
      return { status: "prepared", generation, authorized: activationSource != null || state.activationIntent?.generationId === id };
    }
    const retainedIds = new Set([state.active?.generationId, state.prepared].filter((value): value is string => value != null));
    for (const retainedId of retainedIds) {
      const retained = await this.store.readGeneration(retainedId);
      const order = compareReleaseVersions(retained.releaseVersion, lane.releaseVersion, this.channel);
      if (order > 0) throw new Error(`channel head would downgrade ${retained.releaseVersion} to ${lane.releaseVersion}`);
      if (order === 0) {
        if (retained.id !== id) throw new Error(`immutable release metadata collision: ${lane.releaseVersion}`);
        if (state.active?.generationId === id) return { status: "current", generationId: id };
      }
    }
    const generation = await this.store.prepare(envelope, this.trustedKeys, this.source.readArtifact);
    if (activationSource != null) await this.store.authorizePrepared(activationSource);
    return { status: "prepared", generation, authorized: activationSource != null };
  }

  authorizePrepared(source: ActivationSource): Promise<unknown> { return this.store.authorizePrepared(source); }
  activateOnColdStart(bootloader: FossilBootloader): Promise<LifecycleStatus> { return bootloader.start(); }

  async applyNow(launcher: VersionedLauncher): Promise<LifecycleStatus> {
    const state = await this.store.readState();
    if (state.prepared == null) throw new Error("no prepared generation to apply");
    if (state.activationIntent?.generationId !== state.prepared) await this.store.authorizePrepared("user-restart");
    await launcher.stop();
    await this.store.recoverInterruptedAttempt();
    const activated = await this.store.activatePrepared(this.shell);
    if (activated == null) throw new Error("no prepared generation to apply");
    return launcher.start();
  }
}
