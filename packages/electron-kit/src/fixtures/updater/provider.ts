import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import {
  ensureStandaloneBlob,
  SHELL_UPDATE_ALGEBRA,
  type LifecyclePort,
  type LifecycleScope,
  type StandaloneShellIdentity,
  type StandaloneShellUpdaterAction,
  type StandaloneShellUpdaterActionResult,
  type StandaloneShellUpdaterPort,
  type StandaloneShellUpdaterSnapshot,
} from "@open-design/standalone";

type Artifact = Readonly<{ url: string; size: number; contentType: string; sha256Url: string }>;
type Candidate = Readonly<{ releaseVersion: string; artifact: Artifact; sha256: string }>;

function validateCandidate(value: unknown): Candidate {
  const candidate = value as Partial<Candidate> | null;
  const artifact = candidate?.artifact as Partial<Artifact> | undefined;
  if (candidate == null || typeof candidate.releaseVersion !== "string" || !/^[a-f0-9]{64}$/u.test(candidate.sha256 ?? "")) {
    throw new Error("persisted Electron updater candidate is invalid");
  }
  if (artifact == null || typeof artifact.url !== "string" || typeof artifact.sha256Url !== "string" || typeof artifact.contentType !== "string"
    || !Number.isSafeInteger(artifact.size) || artifact.size! < 0) {
    throw new Error("persisted Electron updater artifact is invalid");
  }
  return structuredClone(candidate as Candidate);
}

async function response(url: string): Promise<Response> {
  const result = await fetch(url, { redirect: "error" });
  if (!result.ok) throw new Error(`Electron updater request failed: ${result.status}`);
  return result;
}

async function replaceFile(from: string, to: string): Promise<void> {
  try { await rename(from, to); }
  catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (process.platform !== "win32" || (code !== "EPERM" && code !== "EEXIST")) throw error;
    await rm(to, { force: true });
    await rename(from, to);
  }
}

export type ElectronFixtureShellUpdaterOptions = Readonly<{
  metadataUrl: string | null;
  shell: StandaloneShellIdentity;
  cacheRoot: string;
  lifecycle: LifecyclePort;
  scope: LifecycleScope;
}>;

export class ElectronFixtureShellUpdater implements StandaloneShellUpdaterPort {
  readonly shellType = "electron";
  private snapshot = SHELL_UPDATE_ALGEBRA.initial(this.shellType);
  private candidate: Candidate | null = null;
  private waiters = new Set<() => void>();
  private initialized: Promise<void> | null = null;
  private persistence = Promise.resolve();
  private readonly statePath: string;
  private readonly candidatePath: string;

  constructor(private readonly options: ElectronFixtureShellUpdaterOptions) {
    this.statePath = join(options.cacheRoot, "channels", options.scope.channel, "namespaces", options.scope.namespace, "shell-updater.json");
    this.candidatePath = join(options.cacheRoot, "channels", options.scope.channel, "namespaces", options.scope.namespace, "shell-updater-candidate.json");
  }

  private ensureInitialized(): Promise<void> {
    this.initialized ??= (async () => {
      try { this.snapshot = SHELL_UPDATE_ALGEBRA.validate(JSON.parse(await readFile(this.statePath, "utf8")) as unknown); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
      try { this.candidate = validateCandidate(JSON.parse(await readFile(this.candidatePath, "utf8")) as unknown); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    })();
    return this.initialized;
  }

  async readSnapshot(): Promise<StandaloneShellUpdaterSnapshot> {
    await this.ensureInitialized();
    return structuredClone(this.snapshot);
  }

  async waitForChange(afterRevision: number, timeoutMs: number): Promise<StandaloneShellUpdaterSnapshot> {
    await this.ensureInitialized();
    if (this.snapshot.revision > afterRevision) return this.readSnapshot();
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => { this.waiters.delete(done); resolve(); }, Math.max(0, timeoutMs));
      const done = () => { clearTimeout(timer); this.waiters.delete(done); resolve(); };
      this.waiters.add(done);
    });
    return this.readSnapshot();
  }

  private set(command: Parameters<typeof SHELL_UPDATE_ALGEBRA.reduce>[1]): StandaloneShellUpdaterSnapshot {
    this.snapshot = SHELL_UPDATE_ALGEBRA.reduce(this.snapshot, command);
    const snapshot = structuredClone(this.snapshot);
    this.persist(this.statePath, snapshot);
    for (const wake of this.waiters) wake();
    return this.snapshot;
  }

  private persist(path: string, value: unknown): void {
    this.persistence = this.persistence.then(async () => {
      await mkdir(dirname(path), { recursive: true });
      const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
      try {
        await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" });
        await replaceFile(temporary, path);
      } finally {
        await rm(temporary, { force: true });
      }
    });
  }

  private async result(outcome: StandaloneShellUpdaterActionResult["outcome"]): Promise<StandaloneShellUpdaterActionResult> {
    await this.persistence;
    return { outcome, snapshot: await this.readSnapshot() };
  }

  private async check(): Promise<void> {
    this.set({ expectedRevision: this.snapshot.revision, state: "checking" });
    if (this.options.metadataUrl == null) throw new Error("Electron updater metadata URL is not configured");
    const metadata = await (await response(this.options.metadataUrl)).json() as {
      releaseVersion?: string;
      platforms?: { mac?: { artifacts?: { dmg?: Artifact } }; win?: { artifacts?: { installer?: Artifact } } };
    };
    const artifact = process.platform === "win32" ? metadata.platforms?.win?.artifacts?.installer : metadata.platforms?.mac?.artifacts?.dmg;
    if (artifact == null || metadata.releaseVersion == null) throw new Error("updater metadata lacks the current platform artifact");
    const sha256 = (await (await response(artifact.sha256Url)).text()).trim().split(/\s+/u)[0];
    if (!/^[a-f0-9]{64}$/u.test(sha256 ?? "")) throw new Error("updater checksum response is invalid");
    this.candidate = { releaseVersion: metadata.releaseVersion, artifact, sha256: sha256! };
    this.persist(this.candidatePath, this.candidate);
    this.set({ expectedRevision: this.snapshot.revision, state: "available", candidateId: metadata.releaseVersion });
  }

  private async download(): Promise<void> {
    if (this.candidate == null || this.snapshot.candidateId == null) throw new Error("updater candidate is unavailable");
    const { artifact, sha256 } = this.candidate;
    this.set({ expectedRevision: this.snapshot.revision, state: "downloading", progress: { completed: 0, total: artifact.size } });
    const downloaded = await ensureStandaloneBlob(this.options.cacheRoot, {
      sha256,
      size: artifact.size,
      mediaType: artifact.contentType,
      sources: [{ kind: "remote", url: artifact.url }],
    }, { resourceId: "electron-shell-distribution" });
    this.set({
      expectedRevision: this.snapshot.revision,
      state: "ready",
      progress: { completed: artifact.size, total: artifact.size },
      handoff: {
        interaction: "restart-and-install",
        releaseVersion: this.candidate.releaseVersion,
        target: process.platform === "win32" ? "win32-x64" : `darwin-${process.arch}`,
        artifact: { path: downloaded.path, sha256, size: artifact.size, mediaType: artifact.contentType },
        shell: { type: this.options.shell.type, version: this.options.shell.version, buildHash: this.options.shell.buildHash },
      },
    });
  }

  private async install(force: boolean): Promise<StandaloneShellUpdaterActionResult> {
    if (this.options.lifecycle.beginTransition == null) return this.result("blocked");
    const result = await this.options.lifecycle.beginTransition(this.options.scope, "shell-install", {
      ownerShellType: this.shellType,
      force,
    });
    if (result.state === "blocked") {
      this.set({
        expectedRevision: this.snapshot.revision,
        state: "ready",
        blockedBy: result.occupants,
        progress: this.snapshot.progress,
        handoff: this.snapshot.handoff,
      });
      return this.result("blocked");
    }
    let heartbeat: NodeJS.Timeout | undefined;
    let sealed = false;
    try {
      const installAttemptId = randomUUID();
      this.set({
        expectedRevision: this.snapshot.revision,
        state: "applying",
        installAttemptId,
        handoff: this.snapshot.handoff,
        blockedBy: result.transition.occupants,
      });
      heartbeat = setInterval(() => { void result.transition.renew().catch(() => undefined); }, result.transition.heartbeatIntervalMs);
      heartbeat.unref();
      await result.transition.forceStop();
      sealed = true;
      this.set({
        expectedRevision: this.snapshot.revision,
        state: "handed-off",
        installAttemptId,
        handoff: this.snapshot.handoff,
      });
      return this.result("accepted");
    } catch (error) {
      if (!sealed) await result.transition.release().catch(() => undefined);
      throw error;
    } finally {
      if (heartbeat != null) clearInterval(heartbeat);
    }
  }

  async invoke(action: StandaloneShellUpdaterAction["id"]): Promise<StandaloneShellUpdaterActionResult> {
    await this.ensureInitialized();
    try {
      if (action === "check") await this.check();
      else if (action === "download") await this.download();
      else if (action === "install" || action === "force-stop-and-install") return await this.install(action === "force-stop-and-install");
      else if (action === "later") this.set({ expectedRevision: this.snapshot.revision, state: "ready" });
      else if (action === "abandon") this.set({ expectedRevision: this.snapshot.revision, state: "failed", error: { code: "install-abandoned", message: "installer handoff was abandoned" } });
      else return this.result("unsupported");
      return this.result("accepted");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (this.snapshot.state !== "failed") this.set({ expectedRevision: this.snapshot.revision, state: "failed", error: { code: "fixture-update-failed", message } });
      return this.result("failed");
    }
  }

  async confirmInstalled(proof: StandaloneShellIdentity): Promise<StandaloneShellUpdaterActionResult> {
    await this.ensureInitialized();
    const expected = this.snapshot.handoff?.shell;
    const matches = expected != null
      && proof.type === expected.type
      && proof.version === expected.version
      && proof.buildHash === expected.buildHash;
    if ((this.snapshot.state !== "handed-off" && this.snapshot.state !== "applying") || !matches) {
      return this.result("blocked");
    }
    this.set({ expectedRevision: this.snapshot.revision, state: "installed" });
    return this.result("accepted");
  }
}
