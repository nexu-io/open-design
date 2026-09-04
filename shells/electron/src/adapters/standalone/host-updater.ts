import { randomUUID } from "node:crypto";

import type {
  StandaloneShellIdentity,
  StandaloneShellUpdaterAction,
  StandaloneShellUpdaterActionResult,
  StandaloneShellUpdaterSnapshot,
} from "@open-design/standalone";

import type { ElectronStandaloneHostLifecycle } from "./host-lifecycle.js";
import { ElectronStandaloneShellUpdaterLedger } from "./shell-updater-ledger.js";

const result = (outcome: StandaloneShellUpdaterActionResult["outcome"], snapshot: StandaloneShellUpdaterSnapshot): StandaloneShellUpdaterActionResult => Object.freeze({ outcome, snapshot });

export class ElectronStandaloneHostUpdater {
  #tail: Promise<void> = Promise.resolve();

  constructor(
    readonly shellType: string,
    private readonly lifecycle: ElectronStandaloneHostLifecycle,
    private readonly ledger: ElectronStandaloneShellUpdaterLedger,
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

  confirmInstalled(proof: StandaloneShellIdentity): Promise<StandaloneShellUpdaterActionResult> {
    return this.#serialize(async () => {
      const snapshot = await this.ledger.read();
      const expected = snapshot.handoff?.shell;
      const matches = expected != null && proof.type === expected.type && proof.version === expected.version && proof.buildHash === expected.buildHash;
      if ((snapshot.state !== "applying" && snapshot.state !== "handed-off") || !matches) return result("blocked", snapshot);
      return result("accepted", await this.ledger.update({ expectedRevision: snapshot.revision, state: "installed" }));
    });
  }
}
