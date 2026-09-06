import { randomUUID } from "node:crypto";

import type {
  StandaloneShellIdentity,
  StandaloneShellUpdaterAction,
  StandaloneShellUpdaterActionResult,
  StandaloneShellUpdaterSnapshot,
} from "@open-design/standalone";
import { stageElectronInstallerArtifact } from "@open-design/electron-kit/installation";

import type { ElectronStandaloneHostLifecycle } from "./host-lifecycle.js";
import { ElectronStandaloneShellUpdaterLedger } from "./shell-updater-ledger.js";
import type { ElectronReleaseExactFeed } from "./release-feed.js";
import type { ElectronStandaloneShellCandidateLedger } from "./shell-updater-candidate.js";

const result = (outcome: StandaloneShellUpdaterActionResult["outcome"], snapshot: StandaloneShellUpdaterSnapshot): StandaloneShellUpdaterActionResult => Object.freeze({ outcome, snapshot });

export class ElectronStandaloneHostUpdater {
  #tail: Promise<void> = Promise.resolve();

  constructor(
    readonly shellType: string,
    private readonly lifecycle: ElectronStandaloneHostLifecycle,
    private readonly ledger: ElectronStandaloneShellUpdaterLedger,
    private readonly release?: Readonly<{
      authorityRoot: string;
      feed: ElectronReleaseExactFeed;
      candidates: ElectronStandaloneShellCandidateLedger;
    }>,
  ) {}

  async #serialize<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.#tail;
    let release!: () => void;
    this.#tail = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try { return await operation(); }
    finally { release(); }
  }

  readSnapshot(): Promise<StandaloneShellUpdaterSnapshot> { return this.ledger.read(); }

  async waitForChange(afterRevision: number, timeoutMs: number): Promise<StandaloneShellUpdaterSnapshot> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const snapshot = await this.ledger.read();
      if (snapshot.revision > afterRevision || Date.now() >= deadline) return snapshot;
      await new Promise((resolveWait) => setTimeout(resolveWait, Math.min(25, Math.max(1, deadline - Date.now()))));
    }
  }

  invoke(action: StandaloneShellUpdaterAction["id"]): Promise<StandaloneShellUpdaterActionResult> {
    return this.#serialize(async () => {
      const snapshot = await this.ledger.read();
      if (action === "check" && this.release != null && (snapshot.state === "idle" || snapshot.state === "failed" || snapshot.state === "installed")) {
        return await this.#check(snapshot);
      }
      if (action === "download" && this.release != null && snapshot.state === "available") {
        return await this.#download(snapshot);
      }
      if ((action !== "install" && action !== "force-stop-and-install") || snapshot.state !== "ready" || snapshot.handoff == null) {
        return result("unsupported", snapshot);
      }
      const installAttemptId = randomUUID();
      const transition = await this.lifecycle.beginTransition("shell-install", {
        attemptId: installAttemptId,
        ownerShellType: this.shellType,
        force: action === "force-stop-and-install",
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
        await this.lifecycle.releaseTransition(transition.transition.token, transition.transition.fence).catch(() => undefined);
        throw error;
      }
    });
  }

  async #check(snapshot: StandaloneShellUpdaterSnapshot): Promise<StandaloneShellUpdaterActionResult> {
    let current = await this.ledger.update({ expectedRevision: snapshot.revision, state: "checking" });
    try {
      const candidate = await this.release!.feed.check();
      if (candidate == null) return result("accepted", await this.ledger.update({ expectedRevision: current.revision, state: "idle" }));
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
