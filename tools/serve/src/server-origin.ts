import type { Server } from "node:http";

/**
 * Build the http origin a fixture service is reachable at, derived from the
 * bound address instead of assuming loopback. Wildcard binds map to the
 * matching loopback literal so the printed URL is always connectable locally;
 * IPv6 literals get the brackets URL syntax requires.
 */
export function fixtureServerOrigin(server: Server, label: string): string {
  const address = server.address();
  if (address == null || typeof address === "string") {
    throw new Error(`${label} did not listen on TCP`);
  }
  let host = address.address;
  if (host === "0.0.0.0") host = "127.0.0.1";
  else if (host === "::") host = "::1";
  if (host.includes(":")) host = `[${host}]`;
  return `http://${host}:${address.port}`;
}
