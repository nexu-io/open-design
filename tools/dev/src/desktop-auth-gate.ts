import type { DaemonStatusSnapshot, WebStatusSnapshot } from "@open-design/sidecar-proto";
import { APP_KEYS } from "@open-design/sidecar-proto";

/**
 * PR #974 round 6 (mrcfps): close the split-start dev-flow gap.
 *
 * `tools-dev start daemon` followed by `tools-dev start desktop` was
 * leaving the daemon running without `OD_REQUIRE_DESKTOP_AUTH=1`,
 * because the env var is only injected when (A) daemon and desktop
 * are spawned in the same orchestrator invocation (`startApp` in
 * `index.ts`), or (B) a desktop runtime is already alive at daemon
 * spawn time (`startDaemon` in `index.ts`). Neither fires for the
 * split sequence, so a renderer (or any local HTTP client) could
 * `POST /api/import/folder` directly with an arbitrary `baseDir`
 * before the desktop's first registration POST.
 *
 * This helper closes that window by introspecting the running
 * daemon's STATUS over IPC and, if the daemon reports
 * `desktopAuthGateActive: false`, restarting the daemon (and web,
 * if running) with the env var pinned BEFORE desktop main is
 * launched. The bundled-targets path (`pnpm tools-dev`) is
 * unaffected because trigger (A) already armed the gate at the
 * daemon's first spawn, so the helper is a single ~800ms IPC
 * roundtrip that returns no-op.
 *
 * Pure helper with injected deps so the regression test in
 * `tools/dev/tests/desktop-auth-gate.test.ts` can pin every branch
 * (no daemon, gate active, gate inactive + web running, gate
 * inactive + web not running) without spawning real processes.
 *
 * Lives in its own module so the test can import it without
 * triggering the `cli.parse()` side effect at the bottom of
 * `tools/dev/src/index.ts`.
 */
export type EnsureDaemonGateDeps = {
  inspectDaemon: () => Promise<DaemonStatusSnapshot | null>;
  inspectWeb: () => Promise<WebStatusSnapshot | null>;
  stopApp: (app: typeof APP_KEYS.DAEMON | typeof APP_KEYS.WEB) => Promise<void>;
  startDaemonGated: () => Promise<void>;
  startWeb: () => Promise<void>;
  log: (msg: string) => void;
};

export async function ensureDaemonGateForDesktop(deps: EnsureDaemonGateDeps): Promise<void> {
  const daemon = await deps.inspectDaemon();
  if (daemon == null) return; // no daemon running; the regular desktop start flow will surface that
  if (daemon.desktopAuthGateActive) return; // already armed; nothing to do
  deps.log(
    "[tools-dev] daemon is running without desktop-auth gate; restarting daemon (and web, if running) before desktop start",
  );
  const web = await deps.inspectWeb();
  if (web != null) await deps.stopApp(APP_KEYS.WEB);
  await deps.stopApp(APP_KEYS.DAEMON);
  await deps.startDaemonGated();
  if (web != null) await deps.startWeb();
}
