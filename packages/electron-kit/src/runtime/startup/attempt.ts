export type ElectronStartupPhase = "created" | "binding-resolved" | "runtime-ready" | "renderer-mounted" | "committed" | "cancelled";

export type ElectronStartupSignal = Readonly<{
  attemptId: string;
  bindingDigest: string;
}>;

const digest = /^[a-f0-9]{64}$/u;
const token = /^[A-Za-z0-9._-]{1,128}$/u;
const nextPhase: Readonly<Record<Exclude<ElectronStartupPhase, "cancelled" | "committed">, ElectronStartupPhase>> = {
  created: "binding-resolved",
  "binding-resolved": "runtime-ready",
  "runtime-ready": "renderer-mounted",
  "renderer-mounted": "committed",
};

/** Fences every authoritative cold-start signal to one activation and binding. */
export class ElectronStartupAttemptFence {
  #bindingDigest: string | null = null;
  #phase: ElectronStartupPhase = "created";

  constructor(readonly attemptId: string) {
    if (!token.test(attemptId)) throw new Error("invalid Electron startup attempt id");
  }

  get phase(): ElectronStartupPhase { return this.#phase; }
  get bindingDigest(): string | null { return this.#bindingDigest; }

  bind(bindingDigest: string): ElectronStartupSignal {
    if (this.#phase !== "created") throw new Error(`cannot bind Electron startup from ${this.#phase}`);
    if (!digest.test(bindingDigest)) throw new Error("invalid Electron startup binding digest");
    this.#bindingDigest = bindingDigest;
    this.#phase = "binding-resolved";
    return { attemptId: this.attemptId, bindingDigest };
  }

  advance(signal: ElectronStartupSignal, phase: "committed" | "renderer-mounted" | "runtime-ready"): void {
    if (this.#phase === "cancelled") throw new Error("Electron startup attempt is cancelled");
    if (signal.attemptId !== this.attemptId || signal.bindingDigest !== this.#bindingDigest) {
      throw new Error("stale Electron startup signal");
    }
    if (nextPhase[this.#phase as keyof typeof nextPhase] !== phase) {
      throw new Error(`invalid Electron startup phase transition: ${this.#phase} -> ${phase}`);
    }
    this.#phase = phase;
  }

  accepts(signal: ElectronStartupSignal): boolean {
    return this.#phase !== "cancelled"
      && signal.attemptId === this.attemptId
      && signal.bindingDigest === this.#bindingDigest;
  }

  cancel(): void {
    if (this.#phase !== "committed") this.#phase = "cancelled";
  }
}
