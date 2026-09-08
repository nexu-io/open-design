import { createServer } from "node:net";

export type KernelLeaseEndpoint = string | Readonly<{ host: "127.0.0.1"; port: number }>;
export type KernelLease = Readonly<{ release(): Promise<void> }>;

/** One nonwaiting, exclusive kernel acquisition. The caller owns endpoint
 * identity, retry policy and lease lifetime. No durable state, stale-file repair,
 * authentication or process discovery is implied by owning this lease. */
export async function tryAcquireKernelLease(input: KernelLeaseEndpoint): Promise<KernelLease | null> {
  const endpoint = typeof input === "string" ? input : { ...input };
  if (typeof endpoint === "string"
    ? process.platform !== "win32" || !endpoint.startsWith("\\\\.\\pipe\\") || endpoint.length <= 9
    : endpoint.host !== "127.0.0.1" || !Number.isInteger(endpoint.port) || endpoint.port < 1 || endpoint.port > 65_535) {
    throw new Error("invalid kernel lease endpoint");
  }
  const server = createServer(socket => socket.destroy());
  const acquired = await new Promise<boolean>((resolve, reject) => {
    const onError = (error: NodeJS.ErrnoException) => {
      server.removeListener("listening", onListening);
      if (error.code === "EADDRINUSE") resolve(false);
      else reject(error);
    };
    const onListening = () => { server.removeListener("error", onError); resolve(true); };
    server.once("error", onError);
    server.once("listening", onListening);
    if (typeof endpoint === "string") server.listen({ exclusive: true, path: endpoint });
    else server.listen({ exclusive: true, ...endpoint });
  });
  if (!acquired) return null;
  let releasing: Promise<void> | null = null;
  return Object.freeze({ release() {
    releasing ??= new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    return releasing;
  } });
}
