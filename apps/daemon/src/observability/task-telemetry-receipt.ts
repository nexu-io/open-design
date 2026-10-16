import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export interface TaskTraceReceipt {
  taskExecutionId: string;
  idempotencyKey: string;
  traceId: string;
  protocol: 'legacy-v1' | 'otlp-v4';
  transport: 'langfuse' | 'relay';
}

/** Small non-secret exporter receipt under the caller's resolved daemon data root.
 * Missing/corrupt receipts must never be reconstructed from current config. */
export function taskTraceReceipts(dataDir?: string) {
  const memory = new Map<string, TaskTraceReceipt>();
  const file = (id: string) => join(dataDir!, 'task-telemetry-receipts',
    createHash('sha256').update(id).digest('hex') + '.json');
  return {
    write(receipt: TaskTraceReceipt) {
      memory.set(receipt.taskExecutionId, receipt);
      if (!dataDir) return;
      try {
        mkdirSync(join(dataDir, 'task-telemetry-receipts'), { recursive: true, mode: 0o700 });
        const target = file(receipt.taskExecutionId);
        writeFileSync(target + '.tmp', JSON.stringify(receipt), { mode: 0o600 });
        renameSync(target + '.tmp', target);
      } catch { /* Observability cannot fail task execution or delivery. */ }
    },
    read(id: string, idempotencyKey: string | null): TaskTraceReceipt | undefined {
      try {
        const r = memory.get(id) ?? (dataDir ? JSON.parse(readFileSync(file(id), 'utf8')) : undefined);
        if (r?.taskExecutionId === id && r.idempotencyKey === idempotencyKey
          && typeof r.traceId === 'string' && r.traceId.length > 0
          && ['legacy-v1', 'otlp-v4'].includes(r.protocol)
          && ['langfuse', 'relay'].includes(r.transport)) return r;
      } catch { /* Unknown is preferable to a guessed trace identity. */ }
      return undefined;
    },
  };
}
