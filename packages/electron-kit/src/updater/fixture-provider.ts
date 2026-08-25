import { createHash, randomUUID } from "node:crypto";

import {
  SHELL_UPDATE_ALGEBRA,
  type StandaloneShellIdentity,
  type StandaloneShellUpdaterAction,
  type StandaloneShellUpdaterActionResult,
  type StandaloneShellUpdaterPort,
  type StandaloneShellUpdaterSnapshot,
} from "@open-design/standalone";

type Artifact = Readonly<{ url: string; size: number; contentType: string; sha256Url: string }>;

export class ElectronFixtureShellUpdater implements StandaloneShellUpdaterPort {
  readonly shellType = "electron";
  private snapshot = SHELL_UPDATE_ALGEBRA.initial(this.shellType);
  private artifact: Artifact | null = null;
  private waiters = new Set<() => void>();

  constructor(private readonly metadataUrl: string | null, private readonly shell: StandaloneShellIdentity) {}

  readSnapshot(): Promise<StandaloneShellUpdaterSnapshot> { return Promise.resolve(structuredClone(this.snapshot)); }

  async waitForChange(afterRevision: number, timeoutMs: number): Promise<StandaloneShellUpdaterSnapshot> {
    if (this.snapshot.revision > afterRevision) return this.readSnapshot();
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => { this.waiters.delete(done); resolve(); }, Math.max(0, timeoutMs));
      const done = () => { clearTimeout(timer); this.waiters.delete(done); resolve(); };
      this.waiters.add(done);
    });
    return this.readSnapshot();
  }

  private set(command: Parameters<typeof SHELL_UPDATE_ALGEBRA.reduce>[1]): void {
    this.snapshot = SHELL_UPDATE_ALGEBRA.reduce(this.snapshot, command);
    for (const wake of this.waiters) wake();
  }

  async invoke(action: StandaloneShellUpdaterAction["id"]): Promise<StandaloneShellUpdaterActionResult> {
    try {
      if (action === "check") {
        this.set({ expectedRevision: this.snapshot.revision, state: "checking" });
        if (this.metadataUrl == null) throw new Error("Electron updater metadata URL is not configured");
        const metadata = await (await fetch(this.metadataUrl)).json() as {
          releaseVersion?: string;
          platforms?: { mac?: { artifacts?: { dmg?: Artifact } }; win?: { artifacts?: { installer?: Artifact } } };
        };
        const artifact = process.platform === "win32" ? metadata.platforms?.win?.artifacts?.installer : metadata.platforms?.mac?.artifacts?.dmg;
        if (artifact == null || metadata.releaseVersion == null) throw new Error("updater metadata lacks the current platform artifact");
        this.artifact = artifact;
        this.set({ expectedRevision: this.snapshot.revision, state: "available", candidateId: metadata.releaseVersion });
      } else if (action === "download") {
        if (this.artifact == null || this.snapshot.candidateId == null) throw new Error("updater candidate is unavailable");
        this.set({ expectedRevision: this.snapshot.revision, state: "downloading", progress: { completed: 0, total: this.artifact.size } });
        const bytes = Buffer.from(await (await fetch(this.artifact.url)).arrayBuffer());
        const checksum = (await (await fetch(this.artifact.sha256Url)).text()).trim().split(/\s+/u)[0];
        const actual = createHash("sha256").update(bytes).digest("hex");
        if (actual !== checksum || bytes.byteLength !== this.artifact.size) throw new Error("updater artifact verification failed");
        this.set({
          expectedRevision: this.snapshot.revision,
          state: "ready",
          progress: { completed: bytes.byteLength, total: bytes.byteLength },
          handoff: {
            interaction: "restart-and-install",
            releaseVersion: this.snapshot.candidateId,
            target: process.platform === "win32" ? "win32-x64" : `darwin-${process.arch}`,
            artifact: { path: this.artifact.url, sha256: actual, size: bytes.byteLength, mediaType: this.artifact.contentType },
            shell: { type: this.shell.type, version: this.shell.version, buildHash: this.shell.buildHash },
          },
        });
      } else if (action === "install" || action === "force-stop-and-install") {
        this.set({ expectedRevision: this.snapshot.revision, state: "applying", installAttemptId: randomUUID() });
        this.set({ expectedRevision: this.snapshot.revision, state: "handed-off" });
      } else if (action === "later") {
        this.set({ expectedRevision: this.snapshot.revision, state: "ready" });
      } else if (action === "abandon") {
        this.set({ expectedRevision: this.snapshot.revision, state: "failed", error: { code: "install-abandoned", message: "installer handoff was abandoned" } });
      } else {
        return { outcome: "unsupported", snapshot: await this.readSnapshot() };
      }
      return { outcome: "accepted", snapshot: await this.readSnapshot() };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (this.snapshot.state !== "failed") this.set({ expectedRevision: this.snapshot.revision, state: "failed", error: { code: "fixture-update-failed", message } });
      return { outcome: "failed", snapshot: await this.readSnapshot() };
    }
  }

  async confirmInstalled(proof: StandaloneShellIdentity): Promise<StandaloneShellUpdaterActionResult> {
    if (this.snapshot.state !== "handed-off" || proof.type !== this.shellType) return { outcome: "blocked", snapshot: await this.readSnapshot() };
    this.set({ expectedRevision: this.snapshot.revision, state: "installed" });
    return { outcome: "accepted", snapshot: await this.readSnapshot() };
  }
}
