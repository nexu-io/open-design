import { randomUUID } from "node:crypto";

import type {
  StandaloneShellIdentity,
  StandaloneShellUpdaterAction,
  StandaloneShellUpdaterActionResult,
  StandaloneShellUpdaterSnapshot,
  StandaloneLifecycleTransitionPort,
} from "@open-design/standalone";
import { stageElectronInstallerArtifact } from "@open-design/electron-kit/installation";
import { compareChannelReleaseVersions } from "@open-design/standalone";

import { ElectronStandaloneShellUpdaterLedger } from "./shell-updater-ledger.js";
import type { ElectronReleaseExactFeed } from "./release-feed.js";
import type { ElectronStandaloneShellCandidateLedger } from "./shell-updater-candidate.js";
import type { ElectronCapsuleUpdate } from "./capsule-update.js";

const result = (outcome: StandaloneShellUpdaterActionResult["outcome"], snapshot: StandaloneShellUpdaterSnapshot): StandaloneShellUpdaterActionResult => Object.freeze({ outcome, snapshot });

export class ElectronStandaloneHostUpdater {
  #tail: Promise<void> = Promise.resolve();
  #pendingOperations = 0;

  constructor(
    readonly shellType: string,
    private readonly lifecycle: StandaloneLifecycleTransitionPort,
    private readonly ledger: ElectronStandaloneShellUpdaterLedger,
    private readonly release?: Readonly<{
      authorityRoot: string;
      feed: ElectronReleaseExactFeed;
      candidates: ElectronStandaloneShellCandidateLedger;
      capsule?: ElectronCapsuleUpdate;
    }>,
  ) {}

  async #serialize<T>(operation: () => Promise<T>): Promise<T> {
    this.#pendingOperations++;
    const previous = this.#tail;
    let release!: () => void;
    this.#tail = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try { return await operation(); }
    finally { this.#pendingOperations--; release(); }
  }

  readSnapshot(): Promise<StandaloneShellUpdaterSnapshot> {
    // The ledger publishes atomic progress. Observation must not queue behind
    // network/download work; state-changing reconciliation remains serialized.
    return this.#pendingOperations > 0 ? this.ledger.read() : this.#serialize(() => this.#reconcile());
  }

  async #reconcile(): Promise<StandaloneShellUpdaterSnapshot> {
    let snapshot = await this.ledger.read();
    if (snapshot.handoff?.interaction !== "restart-and-activate" || this.release?.capsule == null
      || !["ready", "applying", "handed-off"].includes(snapshot.state)) return snapshot;
    const attemptId = await this.release.capsule.completed(snapshot.handoff);
    if (attemptId == null) return snapshot;
    if (snapshot.state === "ready") snapshot = await this.ledger.update({ expectedRevision: snapshot.revision, state: "applying", installAttemptId: attemptId });
    return this.ledger.update({ expectedRevision: snapshot.revision, state: "installed" });
  }

  async waitForChange(afterRevision: number, timeoutMs: number): Promise<StandaloneShellUpdaterSnapshot> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const snapshot = await this.readSnapshot();
      if (snapshot.revision > afterRevision || Date.now() >= deadline) return snapshot;
      await new Promise((resolveWait) => setTimeout(resolveWait, Math.min(25, Math.max(1, deadline - Date.now()))));
    }
  }

  invoke(action: StandaloneShellUpdaterAction["id"]): Promise<StandaloneShellUpdaterActionResult> {
    return this.#serialize(async () => {
      const snapshot = await this.#reconcile();
      if (action === "check" && this.release != null && (snapshot.state === "idle" || snapshot.state === "failed" || snapshot.state === "installed")) {
        return await this.#check(snapshot);
      }
      if (action === "download" && this.release != null && snapshot.state === "available") {
        return await this.#download(snapshot);
      }
      const restart = snapshot.handoff?.interaction === "restart-and-activate";
      const supported = restart ? action === "restart" || action === "force-stop-and-restart"
        : action === "install" || action === "force-stop-and-install";
      if (!supported || snapshot.state !== "ready" || snapshot.handoff == null) {
        return result("unsupported", snapshot);
      }
      const installAttemptId = randomUUID();
      const ownAttachments = restart ? (await this.lifecycle.occupants(this.ledger.scope)).filter(occupant => occupant.shell.type === this.shellType) : [];
      const transition = await this.lifecycle.beginTransition(this.ledger.scope, restart ? "content-restart" : "shell-install", {
        attemptId: installAttemptId,
        ownerShellType: this.shellType,
        ...(ownAttachments.length === 1 ? { ownerAttachmentId: ownAttachments[0]!.attachmentId } : {}),
        force: action === "force-stop-and-install" || action === "force-stop-and-restart",
      });
      if (transition.state === "blocked") {
        const blocked = await this.ledger.update({
          expectedRevision: snapshot.revision,
          state: "ready",
          progress: snapshot.progress,
          handoff: snapshot.handoff,
          blockedBy: transition.occupants,
        });
        return result("blocked", blocked);
      }
      try {
        if (restart && this.release?.capsule != null && snapshot.handoff.interaction === "restart-and-activate") {
          const candidate = await this.release.candidates.read();
          if (candidate == null || candidate.candidateId !== snapshot.candidateId) throw new Error("Capsule restart candidate is unavailable or stale");
          await this.release.capsule.arm(candidate, snapshot.handoff);
        }
        const applying = await this.ledger.update({
          expectedRevision: snapshot.revision,
          state: "applying",
          installAttemptId,
          progress: snapshot.progress,
          handoff: snapshot.handoff,
          blockedBy: transition.transition.occupants,
        });
        return result("accepted", applying);
      } catch (error) {
        await transition.transition.release().catch(() => undefined);
        throw error;
      }
    });
  }

  async #check(snapshot: StandaloneShellUpdaterSnapshot): Promise<StandaloneShellUpdaterActionResult> {
    let current = await this.ledger.update({ expectedRevision: snapshot.revision, state: "checking" });
    try {
      const candidate = await this.release!.feed.check();
      if (candidate == null) return result("accepted", await this.ledger.update({ expectedRevision: current.revision, state: "idle" }));
      const previous = await this.release!.candidates.read();
      if (previous != null && compareChannelReleaseVersions(candidate.candidateId, previous.candidateId, this.ledger.scope.channel) < 0) {
        throw new Error("Electron release head would downgrade the retained selected release");
      }
      if (await this.release!.capsule?.classify(candidate) === "current") {
        return result("accepted", await this.ledger.update({ expectedRevision: current.revision, state: "idle" }));
      }
      await this.release!.candidates.write(candidate);
      current = await this.ledger.update({ expectedRevision: current.revision, state: "available", candidateId: candidate.candidateId });
      return result("accepted", current);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return result("failed", await this.ledger.update({ expectedRevision: current.revision, state: "failed", error: { code: "electron-update-check-failed", message } }));
    }
  }

  async #download(snapshot: StandaloneShellUpdaterSnapshot): Promise<StandaloneShellUpdaterActionResult> {
    let current = snapshot;
    try {
      const candidate = await this.release!.candidates.read();
      if (candidate == null || candidate.candidateId !== snapshot.candidateId) throw new Error("Electron release candidate is unavailable or stale");
      const route = await this.release!.capsule?.classify(candidate);
      if (route === "current") {
        current = await this.ledger.update({ expectedRevision: snapshot.revision, state: "checking" });
        return result("accepted", await this.ledger.update({ expectedRevision: current.revision, state: "idle" }));
      }
      if (route === "activate") {
        current = await this.ledger.update({ expectedRevision: snapshot.revision, state: "downloading" });
        const handoff = await this.release!.capsule!.prepare(candidate);
        return result("accepted", await this.ledger.update({ expectedRevision: current.revision, state: "ready", handoff }));
      }
      const total = candidate.distribution.artifact.size;
      current = await this.ledger.update({ expectedRevision: snapshot.revision, state: "downloading", progress: { completed: 0, total } });
      const downloaded = await this.release!.feed.download(candidate);
      const artifact = candidate.distribution.artifact;
      const staged = await stageElectronInstallerArtifact({
        artifact: { path: downloaded.path, sha256: artifact.sha256, size: artifact.size, mediaType: artifact.mediaType },
        authorityRoot: this.release!.authorityRoot,
      });
      const ready = await this.ledger.update({
        expectedRevision: current.revision,
        state: "ready",
        progress: { completed: total, total },
        handoff: {
          interaction: "restart-and-install",
          releaseVersion: candidate.candidateId,
          target: candidate.distribution.target,
          artifact: { ...staged.artifact, mediaType: artifact.mediaType },
          shell: candidate.distribution.shell,
          ...(candidate.distribution.platformTrust == null ? {} : { platformTrust: candidate.distribution.platformTrust }),
        },
      });
      return result("accepted", ready);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return result("failed", await this.ledger.update({ expectedRevision: current.revision, state: "failed", error: { code: "electron-update-download-failed", message } }));
    }
  }

  confirmInstalled(_proof: StandaloneShellIdentity): Promise<StandaloneShellUpdaterActionResult> {
    return this.#serialize(async () => {
      const snapshot = await this.ledger.read();
      // Kept only as a fossil protocol method. Installation confirmation is a
      // Shell authority operation bound to the installer claim and lifecycle
      // fence; generation/renderer callers can never advance this ledger.
      return result("blocked", snapshot);
    });
  }
}
