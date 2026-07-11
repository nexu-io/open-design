/**
 * @module ipc-path
 *
 * IPC path shape helpers: recognizing a Windows named-pipe path and validating
 * that an IPC path is a well-formed absolute socket path (or a named pipe).
 * Depends only on `node:path`.
 */

import { isAbsolute } from "node:path";

/**
 * Detect whether a value is a Windows named-pipe path (`\\.\pipe\...`).
 * @returns `true` when `value` is such a pipe path.
 */
export function isWindowsNamedPipePath(value: unknown): boolean {
  return typeof value === "string" && value.startsWith("\\\\.\\pipe\\");
}

/**
 * Validate and return an IPC path: a Windows named pipe is accepted as-is, and
 * any other value must be a non-empty, un-padded, null-byte-free absolute path.
 * @returns The validated IPC path.
 */
export function normalizeIpcPath(ipc: unknown): string {
  if (typeof ipc !== "string") throw new Error("sidecar ipc path must be a string");
  if (ipc.length === 0) throw new Error("sidecar ipc path must not be empty");
  if (ipc.trim() !== ipc) throw new Error("sidecar ipc path must not contain leading or trailing whitespace");
  if (ipc.includes("\0")) throw new Error("sidecar ipc path must not contain null bytes");
  if (isWindowsNamedPipePath(ipc)) return ipc;
  if (!isAbsolute(ipc)) throw new Error(`sidecar ipc path must be absolute: ${ipc}`);
  return ipc;
}
