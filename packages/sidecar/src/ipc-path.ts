/**
 * @module ipc-path
 *
 * IPC path shape helper: recognizing a Windows named-pipe path
 * (`\\.\pipe\...`). Wire-level IPC path validation lives in
 * `@open-design/sidecar-proto` (`normalizeIpcPath`) — keep the validator
 * single-sourced there so this file can't drift a second answer for the same
 * wire field.
 */

/**
 * Detect whether a value is a Windows named-pipe path (`\\.\pipe\...`).
 * @returns `true` when `value` is such a pipe path.
 */
export function isWindowsNamedPipePath(value: unknown): boolean {
  return typeof value === "string" && value.startsWith("\\\\.\\pipe\\");
}
