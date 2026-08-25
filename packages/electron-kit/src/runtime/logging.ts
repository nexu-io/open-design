import { randomUUID } from "node:crypto";
import { appendFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";

export type ElectronRuntimeLogEvent = Readonly<{
  schemaVersion: 1;
  attemptId: string;
  sequence: number;
  timestamp: string;
  event: string;
  details?: Readonly<Record<string, unknown>>;
}>;

function normalize(value: unknown): unknown {
  if (value instanceof Error) return { name: value.name, message: value.message, stack: value.stack };
  if (Array.isArray(value)) return value.map(normalize);
  if (value != null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, normalize(item)]));
  }
  return value;
}

/** Diagnostic observation only: an unavailable log sink never controls startup. */
export class ElectronRuntimeLog {
  readonly path: string;
  readonly attemptId = randomUUID();
  private sequence = 0;
  private pending = Promise.resolve();

  constructor(runtimeRoot: string) {
    this.path = join(runtimeRoot, "logs", "electron-runtime.jsonl");
  }

  write(event: string, details?: Readonly<Record<string, unknown>>): void {
    const record: ElectronRuntimeLogEvent = {
      schemaVersion: 1,
      attemptId: this.attemptId,
      sequence: this.sequence++,
      timestamp: new Date().toISOString(),
      event,
      ...(details == null ? {} : { details: normalize(details) as Readonly<Record<string, unknown>> }),
    };
    this.pending = this.pending.then(async () => {
      await mkdir(dirname(this.path), { recursive: true });
      await appendFile(this.path, `${JSON.stringify(record)}\n`, "utf8");
    }).catch(() => undefined);
  }

  async flush(): Promise<void> {
    await this.pending;
  }
}
