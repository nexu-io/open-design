import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { ElectronRecoveryRequiredError, readElectronRecoveryIntent } from "./recovery.js";

export type ElectronActivationState = "failed" | "running" | "starting" | "stopped";

export type ElectronActivationRecord = Readonly<{
  schemaVersion: 1;
  attemptId: string;
  state: ElectronActivationState;
  startedAt: string;
  committedAt?: string;
  stoppedAt?: string;
  error?: Readonly<{ code: string; message: string }>;
  previousAttempt?: Readonly<{ attemptId: string; state: ElectronActivationState }>;
}>;

function validateRecord(value: unknown): ElectronActivationRecord {
  const record = value as ElectronActivationRecord | null;
  const state = (candidate: unknown) => ["failed", "running", "starting", "stopped"].includes(candidate as string);
  const id = (candidate: unknown) => typeof candidate === "string" && candidate.length > 0;
  const time = (candidate: unknown) => typeof candidate === "string" && Number.isFinite(Date.parse(candidate));
  if (record == null || typeof record !== "object" || Array.isArray(record) || record.schemaVersion !== 1
    || !id(record.attemptId) || !state(record.state) || !time(record.startedAt)
    || ((record.state === "running" || record.state === "stopped") && !time(record.committedAt))
    || (record.state === "stopped" && !time(record.stoppedAt))
    || (record.state === "failed" && (!id(record.error?.code) || typeof record.error?.message !== "string"))
    || (record.previousAttempt != null && (!id(record.previousAttempt.attemptId) || !state(record.previousAttempt.state)))) {
    throw new Error("invalid Electron activation record; explicit metadata repair required");
  }
  return record;
}

async function writeRecord(path: string, record: ElectronActivationRecord): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, `${JSON.stringify(record, null, 2)}\n`, { flag: "wx" });
    try { await rename(temporary, path); }
    catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (process.platform !== "win32" || (code !== "EPERM" && code !== "EEXIST")) throw error;
      await rm(path, { force: true });
      await rename(temporary, path);
    }
  } finally {
    await rm(temporary, { force: true });
  }
}

async function readActivation(runtimeRoot: string): Promise<ElectronActivationRecord | null> {
  const bytes = await readFile(join(runtimeRoot, "activation.json"), "utf8").catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  return bytes == null ? null : validateRecord(JSON.parse(bytes));
}

/** Read-only diagnostics remain available when normal startup is blocked.
 * A projection is not proof that repair may clear any durable record. */
export async function inspectElectronStartup(runtimeRoot: string, observation: Readonly<{ live?: boolean }> = {}) {
  try {
    const [activation, recovery] = await Promise.all([readActivation(runtimeRoot), readElectronRecoveryIntent(runtimeRoot)]);
    const incomplete = activation?.state === "failed" || (activation?.state === "starting" && observation.live !== true);
    return Object.freeze({ activation, recovery, required: recovery != null || incomplete,
      reason: recovery != null ? "recovery-unfinished" : incomplete ? "startup-incomplete" : null });
  } catch (error) {
    return Object.freeze({ activation: null, recovery: null, required: true, reason: "metadata-invalid",
      error: error instanceof Error ? error.message : String(error) });
  }
}

export class ElectronActivationAttempt {
  private constructor(private readonly path: string, private record: ElectronActivationRecord) {}

  static async begin(runtimeRoot: string): Promise<ElectronActivationAttempt> {
    if (await readElectronRecoveryIntent(runtimeRoot) != null) {
      throw new ElectronRecoveryRequiredError("Electron startup recovery is unfinished; resume its exact target explicitly");
    }
    const path = join(runtimeRoot, "activation.json");
    // Corruption or unreadable state is not a first launch. Preserve the exact
    // record for explicit repair instead of silently replacing the evidence.
    const previous = await readActivation(runtimeRoot);
    if (previous?.state === "starting" || previous?.state === "failed") {
      throw new ElectronRecoveryRequiredError(`Electron startup ${previous.attemptId} is incomplete; explicit exact recovery required`);
    }
    const record: ElectronActivationRecord = {
      schemaVersion: 1,
      attemptId: randomUUID(),
      state: "starting",
      startedAt: new Date().toISOString(),
      ...(previous == null ? {} : { previousAttempt: { attemptId: previous.attemptId, state: previous.state } }),
    };
    await writeRecord(path, record);
    return new ElectronActivationAttempt(path, record);
  }

  get attemptId(): string { return this.record.attemptId; }

  async commit(): Promise<void> {
    if (this.record.state !== "starting") throw new Error(`cannot commit Electron activation from ${this.record.state}`);
    const record = { ...this.record, state: "running" as const, committedAt: new Date().toISOString() };
    await writeRecord(this.path, record);
    this.record = record;
  }

  async fail(error: unknown): Promise<void> {
    // Only carrier startup cleanup owns this method. A cancellation can arrive
    // while commit is writing; the caller joins that write before marking failure.
    if (this.record.state !== "starting" && this.record.state !== "running") return;
    const { committedAt: _unacknowledgedCommit, ...record } = this.record;
    const failed: ElectronActivationRecord = {
      ...record,
      state: "failed",
      error: {
        code: typeof error === "object" && error != null && "code" in error && typeof error.code === "string" ? error.code : "electron-startup-failed",
        message: error instanceof Error ? error.message : String(error),
      },
    };
    await writeRecord(this.path, failed);
    this.record = failed;
  }

  async stop(): Promise<void> {
    if (this.record.state !== "running") return;
    const record = { ...this.record, state: "stopped" as const, stoppedAt: new Date().toISOString() };
    await writeRecord(this.path, record);
    this.record = record;
  }
}
