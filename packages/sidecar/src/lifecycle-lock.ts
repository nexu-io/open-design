import { createHash } from "node:crypto";
import { createServer, type Server } from "node:net";
import { userInfo } from "node:os";

import { normalizeSidecarStamp, sidecarStampKey, type SidecarStamp } from "./stamp.js";

export type SidecarLifecycleLockOptions = Readonly<{
  timeoutMs?: number;
}>;

type SidecarLifecycleLockEndpoint = string | Readonly<{ host: string; port: number }>;

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
  let server: Server | null = null;
  while (server == null) {
    server = await tryListen(endpoint);
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

function resolveLifecycleLockEndpoint(stampInputs: readonly SidecarStamp[]): SidecarLifecycleLockEndpoint {
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

async function tryListen(endpoint: SidecarLifecycleLockEndpoint): Promise<Server | null> {
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
    if (typeof endpoint === "string") server.listen({ exclusive: true, path: endpoint });
    else server.listen({ exclusive: true, host: endpoint.host, port: endpoint.port });
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
