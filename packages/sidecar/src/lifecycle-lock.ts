import { createHash } from "node:crypto";
import { userInfo } from "node:os";
import { tryAcquireKernelLease, type KernelLease, type KernelLeaseEndpoint } from "@open-design/platform";

import { normalizeSidecarStamp, sidecarStampKey, type SidecarStamp } from "./stamp.js";

export type SidecarLifecycleLockOptions = Readonly<{
  timeoutMs?: number;
}>;

/**
 * Serialize one lifecycle resource set across independent clients.
 *
 * The named pipe on Windows and loopback listener on POSIX are ephemeral kernel
 * locks, not resource identities or Sidecar transports. Callers still declare
 * only the exact five-field stamps they intend to coordinate. Kernel ownership
 * also makes an abandoned lock disappear when its process exits.
 */
export async function withSidecarLifecycleLock<T>(
  stampInputs: readonly SidecarStamp[],
  operation: () => Promise<T>,
  options: SidecarLifecycleLockOptions = {},
): Promise<T> {
  if (stampInputs.length === 0) return await operation();

  const endpoint = resolveLifecycleLockEndpoint(stampInputs);
  const timeoutMs = normalizeTimeoutMs(options.timeoutMs);
  const deadline = Date.now() + timeoutMs;
  let lease: KernelLease | null = null;
  while (lease == null) {
    lease = await tryAcquireKernelLease(endpoint);
    if (lease != null) break;
    if (Date.now() >= deadline) {
      throw new Error(`timed out waiting for sidecar lifecycle lock after ${timeoutMs}ms`);
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  try {
    return await operation();
  } finally {
    await lease.release();
  }
}

function resolveLifecycleLockEndpoint(stampInputs: readonly SidecarStamp[]): KernelLeaseEndpoint {
  const principal = (() => {
    try { return userInfo().username; } catch { return process.env.USERNAME ?? "unknown"; }
  })();
  const resourceSet = [...new Set(stampInputs.map((stamp) => sidecarStampKey(normalizeSidecarStamp(stamp))))]
    .sort()
    .join("\n---\n");
  const digest = createHash("sha256").update(`${principal}\n${resourceSet}`).digest();
  if (process.platform === "win32") {
    return `\\\\.\\pipe\\open-design-sidecar-lifecycle-${digest.toString("hex").slice(0, 32)}`;
  }
  return Object.freeze({
    host: "127.0.0.1",
    port: 49_152 + digest.readUInt16BE(0) % 16_384,
  });
}

function normalizeTimeoutMs(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : 120_000;
}
