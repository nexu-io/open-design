import { mkdir, realpath } from "node:fs/promises";
import { resolve } from "node:path";
import { tryAcquireKernelLease } from "@open-design/platform";

/** Store coordination only. Durable state remains the caller's authority;
 * neither elapsed time nor a stale file can revoke a live process's ownership. */
export async function withStandaloneTransaction<T>(root: string, kind: "maintenance" | "generation-state",
  operation: () => Promise<T>, timeoutMs: number,
): Promise<T> {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 0) throw new Error("invalid Standalone transaction timeout");
  const directory = resolve(root);
  await mkdir(directory, { recursive: true });
  const canonical = await realpath(directory);
  const identity = { domain: `standalone.${kind}`, key: canonical };
  const deadline = performance.now() + timeoutMs;
  for (;;) {
    const lease = await tryAcquireKernelLease(identity);
    if (lease != null) {
      try { return await operation(); }
      finally { await lease.release(); }
    }
    const remaining = deadline - performance.now();
    if (remaining <= 0) throw new Error(`Standalone ${kind} transaction timed out acquiring ${canonical} after ${timeoutMs}ms`);
    await new Promise<void>(resolveWait => setTimeout(resolveWait, Math.min(20, remaining)));
  }
}
