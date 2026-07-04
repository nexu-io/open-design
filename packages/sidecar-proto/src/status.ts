import type { DesktopUpdateStatusSnapshot } from "./desktop-update.js";

/**
 * @module status
 *
 * Runtime status snapshots reported by each service (daemon, web, desktop)
 * over sidecar IPC.
 */

export type ServiceRuntimeState = "idle" | "running" | "starting" | "stopped" | "unknown";

export type DaemonStatusSnapshot = {
  pid?: number | null;
  state: ServiceRuntimeState;
  trustedWebOriginPort?: number | null;
  updatedAt?: string;
  url: string | null;
  /**
   * PR #974 round 6 (mrcfps): true when the daemon's
   * `/api/import/folder` route refuses tokenless requests. Surfaced
   * over IPC so `tools-dev start desktop` can detect a daemon that
   * was spawned without `OD_REQUIRE_DESKTOP_AUTH=1` (the split-start
   * dev flow `start daemon` -> `start desktop`) and restart it
   * before launching desktop main, instead of letting a renderer
   * race the registration handshake. Mirrors
   * `apps/daemon/src/server.ts#isDesktopAuthGateActive()` at the
   * moment the STATUS request was answered.
   */
  desktopAuthGateActive: boolean;
};

export type WebStatusSnapshot = {
  pid?: number | null;
  state: ServiceRuntimeState;
  updatedAt?: string;
  url: string | null;
};

export type DesktopRuntimeState = "idle" | "running" | "unknown";

export type DesktopStatusSnapshot = {
  pid?: number | null;
  state: DesktopRuntimeState;
  title?: string | null;
  update?: DesktopUpdateStatusSnapshot;
  updateStatusError?: string;
  updatedAt?: string;
  url?: string | null;
  windowVisible?: boolean;
};
