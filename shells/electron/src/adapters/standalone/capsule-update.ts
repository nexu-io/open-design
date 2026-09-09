import { canonicalJson, compareVersions, sha256Hex, StandaloneUpdater, verifyDocument,
  type StandaloneShellIdentity, type StandaloneShellRestartHandoff, type StandaloneStore,
  type StandaloneTrustedKeyRing } from "@open-design/standalone";
import { armElectronCapsuleSelection, inspectElectronStartup, readElectronCapsuleSelection } from "@open-design/electron-kit";
import { resolveElectronCompositeShellIdentity, type ElectronCapsuleTarget } from "@open-design/electron-kit/contracts";
import type { ElectronReleaseExactCandidate, ElectronReleaseExactFeed } from "./release-feed.js";

/** Product pairing over the existing authorities. No extra pointer, updater
 * ledger, downloader or cross-component transaction is introduced here. */
export class ElectronCapsuleUpdate {
  constructor(private readonly input: Readonly<{
    feed: ElectronReleaseExactFeed;
    store: StandaloneStore;
    runtimeRoot: string;
    channel: string;
    carrier: Readonly<{ target: ElectronCapsuleTarget; shell: StandaloneShellIdentity }>;
    shell: StandaloneShellIdentity;
    trustedKeys: StandaloneTrustedKeyRing;
  }>) {}

  async completed(handoff: StandaloneShellRestartHandoff): Promise<string | null> {
    const selection = await readElectronCapsuleSelection(this.input.runtimeRoot);
    const current = selection.current;
    if (selection.pending != null || current == null || current.closureGenerationId !== handoff.activation.generationId
      || sha256Hex(canonicalJson(current.envelope)) !== handoff.activation.targetDigest) return null;
    verifyDocument(current.envelope, this.input.trustedKeys);
    const shell = resolveElectronCompositeShellIdentity(current.envelope.document, this.input.carrier);
    if (canonicalJson(shell) !== canonicalJson(handoff.shell) || canonicalJson(shell) !== canonicalJson(this.input.shell)) return null;
    const startup = await inspectElectronStartup(this.input.runtimeRoot);
    if (startup.required || startup.activation?.state !== "running") return null;
    return startup.activation.attemptId;
  }

  async classify(candidate: ElectronReleaseExactCandidate): Promise<"current" | "activate" | "install"> {
    const envelope = await this.input.feed.readCapsule(candidate);
    if (compareVersions(this.input.carrier.shell.version, envelope.document.requires.carrierVersion) < 0) return "install";
    const shell = resolveElectronCompositeShellIdentity(envelope.document, this.input.carrier);
    return canonicalJson(shell) === canonicalJson(this.input.shell) ? "current" : "activate";
  }

  async prepare(candidateInput: ElectronReleaseExactCandidate): Promise<StandaloneShellRestartHandoff> {
    const candidate = this.input.feed.validateCandidate(candidateInput);
    const selection = await readElectronCapsuleSelection(this.input.runtimeRoot);
    if (selection.pending != null) throw new Error("Capsule selection is already armed; complete startup or explicit recovery first");
    const capsule = await this.input.feed.prepareCapsule(candidate);
    const shell = resolveElectronCompositeShellIdentity(capsule.envelope.document, this.input.carrier);
    const updater = new StandaloneUpdater(this.input.channel, "content", shell,
      this.input.trustedKeys, this.input.store, this.input.feed);
    // Both lanes consume the persisted signed head; preparing every sync
    // resource finishes before either activation authority is armed.
    const prepared = await updater.prepareFromHead(candidate.head, "observe");
    if (prepared.status === "shell-reinstall-required") throw new Error("selected Capsule cannot satisfy the exact Closure requirement");
    const generationId = prepared.status === "current" ? prepared.generationId : prepared.generation.id;
    return { interaction: "restart-and-activate", releaseVersion: candidate.candidateId,
      target: this.input.carrier.target, shell,
      activation: { targetDigest: sha256Hex(canonicalJson(capsule.envelope)), generationId } };
  }

  /** Called only after an authorized restart acquires the shared transition.
   * Downloading a candidate must not authorize its activation on next launch. */
  async arm(candidateInput: ElectronReleaseExactCandidate, handoff: StandaloneShellRestartHandoff): Promise<void> {
    const candidate = this.input.feed.validateCandidate(candidateInput);
    const selection = await readElectronCapsuleSelection(this.input.runtimeRoot);
    if (selection.pending != null) throw new Error("Capsule selection is already armed; complete startup or explicit recovery first");
    const capsule = await this.input.feed.prepareCapsule(candidate);
    const shell = resolveElectronCompositeShellIdentity(capsule.envelope.document, this.input.carrier);
    if (handoff.releaseVersion !== candidate.candidateId || handoff.target !== this.input.carrier.target
      || canonicalJson(handoff.shell) !== canonicalJson(shell)
      || handoff.activation.targetDigest !== sha256Hex(canonicalJson(capsule.envelope))) {
      throw new Error("Capsule restart differs from its prepared candidate");
    }
    const generationId = handoff.activation.generationId;
    const metadata = await this.input.store.readGenerationMetadata(generationId, this.input.trustedKeys);
    const bytes = Buffer.from(canonicalJson(metadata));
    const lane = candidate.head.head.lanes.content;
    if (lane == null || lane.sha256 !== sha256Hex(bytes) || lane.size !== bytes.length) {
      throw new Error("Capsule restart Closure differs from its selected head");
    }
    const state = await this.input.store.readState();
    if (state.activationAttempt != null) throw new Error("Closure startup is incomplete; explicit recovery required");
    if (state.active !== generationId && state.prepared !== generationId) throw new Error("prepared Closure changed before Capsule arm");
    await armElectronCapsuleSelection({ runtimeRoot: this.input.runtimeRoot,
      expectedRevision: selection.revision, closureGenerationId: generationId,
      capsule: { ...capsule, carrier: this.input.carrier, trustedKeys: this.input.trustedKeys } });
    if (state.active !== generationId) {
      // Deliberately a second arm, not an invented atomic transaction. A crash
      // or CAS conflict leaves the first intent intact and cold start fails
      // closed until explicit exact recovery repairs the pair.
      await this.input.store.authorizePrepared(generationId, "silent", "update-policy", state.revision);
    }
  }
}
