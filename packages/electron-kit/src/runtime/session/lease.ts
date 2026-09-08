import { createHash } from "node:crypto";
import { realpath } from "node:fs/promises";
import { userInfo } from "node:os";
import { isAbsolute, resolve } from "node:path";
import { tryAcquireKernelLease, type KernelLease } from "@open-design/platform";

/** Normal carrier processes hold this lease until process death. Explicit
 * offline recovery holds the identical canonical-root lease for its operation.
 * It does not replace Electron's single-instance ingress or Sidecar's guarded
 * resource-set retirement, nor does it authorize any durable state mutation. */
export async function acquireElectronSessionLease(runtimeRoot: string): Promise<KernelLease> {
  if (!isAbsolute(runtimeRoot) || resolve(runtimeRoot) !== runtimeRoot) throw new Error("Electron session root must be absolute and normalized");
  const canonicalRoot = await realpath(runtimeRoot);
  const digest = createHash("sha256").update(`electron-session-v1\n${userInfo().username}\n${canonicalRoot}`).digest();
  const endpoint = process.platform === "win32"
    ? `\\\\.\\pipe\\electron-session-${digest.toString("hex")}`
    : { host: "127.0.0.1" as const, port: 49_152 + digest.readUInt16BE(0) % 16_384 };
  const lease = await tryAcquireKernelLease(endpoint);
  if (lease == null) throw new Error("Electron session is owned by another process or explicit recovery; retry only after its owner exits");
  return lease;
}
