import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

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

export class ElectronActivationAttempt {
  private constructor(private readonly path: string, private record: ElectronActivationRecord) {}

  static async begin(runtimeRoot: string): Promise<ElectronActivationAttempt> {
    const path = join(runtimeRoot, "activation.json");
    const previous = await readFile(path, "utf8").then((value) => JSON.parse(value) as ElectronActivationRecord).catch(() => null);
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

  async commit(): Promise<void> {
    if (this.record.state !== "starting") throw new Error(`cannot commit Electron activation from ${this.record.state}`);
    this.record = { ...this.record, state: "running", committedAt: new Date().toISOString() };
    await writeRecord(this.path, this.record);
  }

  async fail(error: unknown): Promise<void> {
    if (this.record.state !== "starting") return;
    this.record = {
      ...this.record,
      state: "failed",
      error: {
        code: typeof error === "object" && error != null && "code" in error && typeof error.code === "string" ? error.code : "electron-startup-failed",
        message: error instanceof Error ? error.message : String(error),
      },
    };
    await writeRecord(this.path, this.record);
  }

  async stop(): Promise<void> {
    if (this.record.state !== "running") return;
    this.record = { ...this.record, state: "stopped", stoppedAt: new Date().toISOString() };
    await writeRecord(this.path, this.record);
  }
}
