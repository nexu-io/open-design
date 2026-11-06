import { createHash } from "node:crypto";
import { createServer, type Server } from "node:net";
import { userInfo } from "node:os";

import { normalizeSidecarStamp, sidecarStampKey, type SidecarStamp } from "./stamp.js";

export type SidecarLifecycleLockOptions = Readonly<{
  timeoutMs?: number;
}>;

/**
 * Serialize one Windows lifecycle resource set across independent clients.
 *
 * The named pipe is an ephemeral kernel lock, not a second resource identity:
 * callers still declare the exact five-field stamps they intend to coordinate.
 */
export async function withSidecarLifecycleLock<T>(
  stampInputs: readonly SidecarStamp[],
  operation: () => Promise<T>,
  options: SidecarLifecycleLockOptions = {},
): Promise<T> {
  if (stampInputs.length === 0) return await operation();
  if (process.platform !== "win32") return await operation();

  const lockPath = resolveWindowsLifecycleLockPath(stampInputs);
  const timeoutMs = normalizeTimeoutMs(options.timeoutMs);
  const deadline = Date.now() + timeoutMs;
  let server: Server | null = null;
  while (server == null) {
    server = await tryListen(lockPath);
    if (server != null) break;
    if (Date.now() >= deadline) {
      throw new Error(`timed out waiting for sidecar lifecycle lock after ${timeoutMs}ms`);
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  try {
    return await operation();
  } finally {
    await closeServer(server);
  }
}

function resolveWindowsLifecycleLockPath(stampInputs: readonly SidecarStamp[]): string {
  const principal = (() => {
    try { return userInfo().username; } catch { return process.env.USERNAME ?? "unknown"; }
  })();
  const resourceSet = [...new Set(stampInputs.map((stamp) => sidecarStampKey(normalizeSidecarStamp(stamp))))]
    .sort()
    .join("\n---\n");
  const digest = createHash("sha256").update(`${principal}\n${resourceSet}`).digest("hex").slice(0, 32);
  return `\\\\.\\pipe\\open-design-sidecar-lifecycle-${digest}`;
}

async function tryListen(path: string): Promise<Server | null> {
  const server = createServer((socket) => socket.destroy());
  return await new Promise<Server | null>((resolve, reject) => {
    const onError = (error: NodeJS.ErrnoException): void => {
      server.removeListener("listening", onListening);
      if (error.code === "EADDRINUSE") resolve(null);
      else reject(error);
    };
    const onListening = (): void => {
      server.removeListener("error", onError);
      resolve(server);
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen({ exclusive: true, path });
  });
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error == null ? resolve() : reject(error));
  });
}

function normalizeTimeoutMs(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : 120_000;
}
