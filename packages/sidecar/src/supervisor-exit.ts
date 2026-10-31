/**
 * How the supervisor should end once its target has exited.
 *
 * Invariant: the supervisor's own exit must report how its target ended
 * without folding signals into the numeric exit-code space.
 * - A stop the supervisor forwarded (SIGINT/SIGTERM from its owner) is an
 *   orderly shutdown and exits 0.
 * - A target killed by any other signal makes the supervisor terminate itself
 *   with that same signal (POSIX), so observers see a real `signal`, never a
 *   number they would have to reverse-engineer. A target that calls
 *   `process.exit(137)` therefore stays `code=137, signal=null`.
 * - Windows has no catchable signal termination; a signal exit there reports 1.
 * - Otherwise the target's own exit code passes through (unknown → 1).
 */
export type SupervisorExitDisposition =
  | { kind: "code"; code: number }
  | { kind: "signal"; signal: NodeJS.Signals };

export function supervisorExitDisposition(
  code: number | null,
  signal: NodeJS.Signals | null,
  forwardedSignal: NodeJS.Signals | null,
  platform: NodeJS.Platform = process.platform,
): SupervisorExitDisposition {
  if (forwardedSignal != null) return { kind: "code", code: 0 };
  if (signal != null) return platform === "win32" ? { kind: "code", code: 1 } : { kind: "signal", signal };
  return { kind: "code", code: code ?? 1 };
}
