import { tryAcquireKernelLease, type KernelLease } from "@open-design/platform";
import { normalizeSidecarStamp, sidecarStampKey, type SidecarStamp } from "./stamp.js";

export type SidecarLifecycleLockOptions = Readonly<{ timeoutMs?: number }>;

/** Acquire every resource before entering. Intersecting sets share a lease;
 * disjoint sets remain independent. Partial acquisition never survives a failed
 * attempt, and no timeout can revoke another process's kernel ownership. */
export async function withSidecarLifecycleLock<T>(
  stampInputs: readonly SidecarStamp[], operation: () => Promise<T>,
  options: SidecarLifecycleLockOptions = {},
): Promise<T> {
  const keys = [...new Set(stampInputs.map(stamp => sidecarStampKey(normalizeSidecarStamp(stamp))))].sort();
  if (keys.length === 0) return operation();
  const timeoutMs = options.timeoutMs ?? 120_000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 0) throw new Error("invalid sidecar lifecycle lock timeout");
  const deadline = performance.now() + timeoutMs;
  for (;;) {
    const leases: KernelLease[] = [];
    let blocked: string | undefined;
    try {
      for (const key of keys) {
        const lease = await tryAcquireKernelLease({ domain: "sidecar.lifecycle", key });
        if (lease == null) { blocked = key; break; }
        leases.push(lease);
      }
      if (blocked == null) return await operation();
    } finally {
      const failures: unknown[] = [];
      for (const lease of leases.reverse()) { try { await lease.release(); } catch (error) { failures.push(error); } }
      if (failures.length) throw new AggregateError(failures, "could not release sidecar lifecycle leases");
    }
    const remaining = deadline - performance.now();
    if (remaining <= 0) throw new Error(`timed out waiting for sidecar lifecycle lock after ${timeoutMs}ms: ${blocked}`);
    await new Promise<void>(resolve => setTimeout(resolve, Math.min(25, remaining)));
  }
}
