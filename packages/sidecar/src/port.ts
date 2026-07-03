/**
 * @module port
 *
 * TCP port allocation: a forced port is checked for availability and reserved, or
 * a dynamic port is probed via an ephemeral listen until a non-reserved one is
 * found. Depends on the shared net primitives and the public port types.
 */

import type { Server } from "node:net";

import { closeServer, listenOnPort } from "./net.js";
import type { PortAllocation, PortRequest } from "./types.js";

/**
 * @internal Validate and parse a port value to an integer in 1..65535, or null
 * when absent/empty.
 */
function parsePort(value: number | string | null | undefined, label: string): number | null {
  if (value == null || value === "") return null;
  const port = Number(value);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`${label} port must be an integer between 1 and 65535`);
  }
  return port;
}

/**
 * @internal Extract a Node error `code` string from an unknown thrown value.
 */
function errorCode(error: unknown): string | null {
  if (typeof error !== "object" || error == null || !("code" in error)) return null;
  const code = (error as { code?: unknown }).code;
  return code == null ? null : String(code);
}

/**
 * @internal Extract a human-readable message from an unknown thrown value.
 */
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * @internal Reserve a forced port after confirming it is free and unclaimed.
 */
async function allocateForcedPort(port: number, label: string, host: string, reserved: Set<number>): Promise<PortAllocation> {
  if (reserved.has(port)) {
    throw new Error(`forced ${label} port ${port} conflicts with another managed port`);
  }
  let server: Server | null = null;
  try {
    server = await listenOnPort(port, host);
  } catch (error) {
    throw new Error(`forced ${label} port ${port} is not available (${errorCode(error) ?? errorMessage(error)})`);
  } finally {
    if (server) await closeServer(server);
  }
  reserved.add(port);
  return { port, source: "forced" };
}

/**
 * @internal Probe ephemeral ports until a non-reserved one is found, then
 * reserve it.
 */
async function allocateDynamicPort(label: string, host: string, reserved: Set<number>): Promise<PortAllocation> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const server = await listenOnPort(0, host);
    const address = server.address();
    await closeServer(server);
    if (address == null || typeof address === "string") {
      throw new Error(`failed to allocate dynamic ${label} port`);
    }
    if (!reserved.has(address.port)) {
      reserved.add(address.port);
      return { port: address.port, source: "dynamic" };
    }
  }
  throw new Error(`failed to allocate dynamic ${label} port without conflict`);
}

/**
 * Allocate a port: a forced port when one is supplied, otherwise a dynamic one,
 * recording it in the `reserved` set to avoid double-allocation.
 * @returns The port allocation (port + how it was chosen).
 */
export async function allocatePort({
  host = "127.0.0.1",
  label = "runtime",
  port,
  reserved = new Set<number>(),
}: PortRequest = {}): Promise<PortAllocation> {
  const forcedPort = parsePort(port, label);
  return forcedPort == null
    ? await allocateDynamicPort(label, host, reserved)
    : await allocateForcedPort(forcedPort, label, host, reserved);
}
