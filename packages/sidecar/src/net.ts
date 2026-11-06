/**
 * @module net
 *
 * Generic TCP server primitives shared by port allocation and the JSON-IPC
 * server: a promise-based close and a promise-based listen-on-port. Depends only
 * on `node:net`.
 */

import { createServer as createNetServer, type Server } from "node:net";

/**
 * @internal Close a listening server, resolving once closed (no-op if not
 * listening).
 */
export async function closeServer(server: Server): Promise<void> {
  if (!server.listening) return;
  await new Promise<void>((resolveClose, rejectClose) => {
    server.close((error) => (error == null ? resolveClose() : rejectClose(error)));
  });
}

/**
 * @internal Start an exclusive TCP server on the given port/host, resolving with
 * the listening server.
 */
export async function listenOnPort(port: number, host: string): Promise<Server> {
  const server = createNetServer();
  await new Promise<void>((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen({ port, host, exclusive: true }, () => {
      server.off("error", rejectListen);
      resolveListen();
    });
  });
  return server;
}
