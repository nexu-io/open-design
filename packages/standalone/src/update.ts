import {
  assertShellCompatibility,
  canonicalJson,
  sha256Hex,
  verifyStandaloneChannelHead,
  verifyStandaloneMetadata,
  type SignedStandaloneChannelHead,
  type SignedStandaloneMetadata,
  type StandaloneShellIdentity,
  type StandaloneShellRequirement,
  type StandaloneTrustedKeyRing,
} from "./protocol.js";
import { type GenerationRecord, type StandalonePrepareOptions, StandaloneStore } from "./store.js";
import { FossilBootloader, type LifecycleStatus, type VersionedLauncher } from "./launcher.js";
import type { StandaloneFeedbackHandler } from "./feedback.js";
import type { StandaloneLifecycleOccupant } from "./shell-update.js";
import { activationPolicyCommand, StandaloneStateConflictError, type GenerationState, type UpdateActivationPolicy } from "./state-machine.js";

export type StandaloneUpdateSource = {
  readChannelHead(channel: string): Promise<SignedStandaloneChannelHead>;
  readDocument(url: string): Promise<Uint8Array>;
  prepare?: Omit<StandalonePrepareOptions, "feedback">;
};

export type UpdatePreparation =
  | { status: "prepared"; generation: GenerationRecord; authorized: boolean }
  | { status: "current"; generationId: string }
  | {
      status: "shell-reinstall-required";
      releaseVersion: string;
      minimumVersion: string | null;
      requirement: StandaloneShellRequirement | null;
    };

export type UpdateApplication =
  | Readonly<{ status: "applied"; lifecycle: LifecycleStatus }>
  | Readonly<{
      status: "blocked";
      reason: "occupied" | "transition-active" | "unavailable";
      occupants: readonly StandaloneLifecycleOccupant[];
    }>;

async function applyActivationPolicy(
  store: StandaloneStore,
  generationId: string,
  policy: UpdateActivationPolicy,
): Promise<GenerationState> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const state = await store.readState();
    if (state.prepared !== generationId) throw new Error("prepared generation changed concurrently");
    const command = activationPolicyCommand(state, generationId, policy);
    if (command == null) return state;
    try {
      if (command.type === "revoke-silent") return await store.revokeSilentAuthorization(generationId, state.revision);
      await store.authorizePrepared(generationId, command.authority, command.cause, state.revision);
      const updated = await store.readState();
      if (updated.prepared !== generationId) throw new Error("prepared generation changed concurrently");
      return updated;
    } catch (error) {
      if (!(error instanceof StandaloneStateConflictError) || error.code !== "revision-conflict") throw error;
    }
  }
  throw new Error("activation policy did not converge");
}

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
    private readonly feedback?: StandaloneFeedbackHandler,
  ) {}

  async prepareLatest(activationPolicy: UpdateActivationPolicy): Promise<UpdatePreparation> {
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
      const requirement = envelope.metadata.shellRequirements.find(({ type }) => type === this.shell.type) ?? null;
      return { status: "shell-reinstall-required", releaseVersion: lane.releaseVersion, minimumVersion: requirement?.minVersion ?? null, requirement };
    }
    const id = sha256Hex(canonicalJson(envelope.metadata));
    const state = await this.store.readState();
    if (state.prepared === id) {
      const generation = await this.store.readGeneration(id);
      const updated = await applyActivationPolicy(this.store, id, activationPolicy);
      return { status: "prepared", generation, authorized: updated.activationIntent?.generationId === id };
    }
    const retainedIds = new Set([state.active, state.prepared].filter((value): value is string => value != null));
    for (const retainedId of retainedIds) {
      const retained = await this.store.readGeneration(retainedId);
      const order = compareReleaseVersions(retained.releaseVersion, lane.releaseVersion, this.channel);
      if (order > 0) throw new Error(`channel head would downgrade ${retained.releaseVersion} to ${lane.releaseVersion}`);
      if (order === 0) {
        if (retained.id !== id) throw new Error(`immutable release metadata collision: ${lane.releaseVersion}`);
        if (state.active === id) return { status: "current", generationId: id };
      }
    }
    const generation = await this.store.prepare(envelope, this.trustedKeys, { ...this.source.prepare, feedback: this.feedback });
    const updated = await applyActivationPolicy(this.store, generation.id, activationPolicy);
    return { status: "prepared", generation, authorized: updated.activationIntent?.generationId === generation.id };
  }

  activateOnColdStart(bootloader: FossilBootloader): Promise<LifecycleStatus> { return bootloader.start(); }

  async applyNow(launcher: VersionedLauncher, options: Readonly<{ force?: boolean }> = {}): Promise<UpdateApplication> {
    const state = await this.store.readState();
    if (state.prepared == null) throw new Error("no prepared generation to apply");
    const targetGenerationId = state.prepared;
    await applyActivationPolicy(this.store, targetGenerationId, "authorize-user");
    const transition = await launcher.beginTransition("content-restart", options);
    if (transition.state === "blocked") return { status: "blocked", reason: transition.reason, occupants: transition.occupants };
    await transition.transition.renew();
    await transition.transition.forceStop();
    await this.store.recoverInterruptedAttempt();
    const prepared = await this.store.readState();
    if (prepared.prepared !== targetGenerationId) throw new Error("prepared generation changed before activation");
    await this.store.activatePrepared(targetGenerationId, this.shell, prepared.revision);
    return { status: "applied", lifecycle: await launcher.startDuringTransition(transition.transition) };
  }
}
