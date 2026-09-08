import { createHash } from "node:crypto";
import { mkdir, realpath } from "node:fs/promises";
import { userInfo } from "node:os";
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
  const digest = createHash("sha256").update(`standalone-transaction-v1\n${userInfo().username}\n${kind}\n${canonical}`).digest();
  const endpoint = process.platform === "win32" ? `\\\\.\\pipe\\standalone-${digest.toString("hex")}`
    : { host: "127.0.0.1" as const, port: 49_152 + digest.readUInt16BE(0) % 16_384 };
  const deadline = performance.now() + timeoutMs;
  for (;;) {
    const lease = await tryAcquireKernelLease(endpoint);
    if (lease != null) {
      try { return await operation(); }
      finally { await lease.release(); }
    }
    const remaining = deadline - performance.now();
    if (remaining <= 0) throw new Error(`Standalone ${kind} transaction timed out`);
    await new Promise<void>(resolveWait => setTimeout(resolveWait, Math.min(20, remaining)));
  }
}
