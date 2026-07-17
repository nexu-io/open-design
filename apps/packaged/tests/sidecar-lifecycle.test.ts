/**
 * Sidecar lifecycle test for creator-backup restore (P0-3).
 *
 * `restartPackagedSidecars` must:
 *   - close the OLD daemon + web group first (no orphan processes),
 *   - re-spawn the full group on the SAME web port so the loaded renderer
 *     keeps its URL and reconnects to the new daemon through the new web,
 *   - register the NEW handle via `handleRef.set` (so `handleRef.get` returns
 *     the new children and its `close()` shuts the new group down on exit).
 *
 * The real `spawnSidecars` is injected with a mock so NO real process is
 * spawned; the assertions verify the lifecycle contract against the injected
 * handles.
 */

import { describe, expect, it, vi } from "vitest";

import { restartPackagedSidecars } from "../src/sidecars.js";
import type { PackagedSidecarHandle } from "../src/sidecars.js";

// The injected spawnSidecars ignores these, so we pass inert stand-ins rather
// than constructing the heavy runtime/path objects.
const runtime = {} as never;
const paths = {} as never;
const options = {
  appVersion: null,
  amrProfile: null,
  daemonCliEntry: null,
  daemonSidecarEntry: null,
  electronNodeCommand: null,
  nodeCommand: null,
  telemetryRelayUrl: null,
  posthogKey: null,
  posthogHost: null,
  requireDesktopAuth: true,
  webSidecarEntry: null,
  webStandaloneRoot: null,
  webOutputMode: "standalone",
  webPort: "0",
} as never;

function makeHandle(daemonUrl: string, webUrl: string): PackagedSidecarHandle {
  return {
    daemon: { url: daemonUrl } as never,
    web: { url: webUrl } as never,
    close: vi.fn(async () => undefined),
    closeApp: vi.fn(async () => undefined),
  } as unknown as PackagedSidecarHandle;
}

describe("restartPackagedSidecars (P0-3 sidecar lifecycle)", () => {
  it("closes the old group, re-spawns on the same web port, and registers the new handle", async () => {
    const oldHandle = makeHandle("http://127.0.0.1:1111", "http://127.0.0.1:2222");
    let current: PackagedSidecarHandle | null = oldHandle;
    const handleRef = {
      get(): PackagedSidecarHandle | null {
        return current;
      },
      set(handle: PackagedSidecarHandle): void {
        current = handle;
      },
    };

    let capturedWebPort: string | null = null;
    let spawned: PackagedSidecarHandle | null = null;
    const spawnSidecars = vi.fn(async (_rt: unknown, _p: unknown, opts: { webPort?: string }) => {
      capturedWebPort = opts.webPort ?? null;
      spawned = makeHandle("http://127.0.0.1:3333", "http://127.0.0.1:2222");
      return spawned;
    }) as unknown as typeof import("../src/sidecars.js").startPackagedSidecars;

    const { daemonUrl } = await restartPackagedSidecars(runtime, paths, options, handleRef, { spawnSidecars });

    // The OLD daemon + web group was closed — no orphan processes left behind.
    expect(oldHandle.close).toHaveBeenCalledTimes(1);

    // The re-spawned group reuses the OLD web port so the loaded renderer keeps
    // its URL and reconnects to the new daemon through the new web sidecar.
    expect(capturedWebPort).toBe("2222");

    // The NEW handle is registered and is the one the reference now returns.
    expect(spawned).not.toBeNull();
    expect(handleRef.get()).toBe(spawned);
    expect((handleRef.get() as unknown as { web: { url: string } }).web.url).toBe("http://127.0.0.1:2222");

    // The restart result exposes the new daemon URL for the caller.
    expect(daemonUrl).toBe("http://127.0.0.1:3333");
  });

  it("treats a missing old handle as a fresh spawn (no close attempted)", async () => {
    let registered: PackagedSidecarHandle | null = null;
    const handleRef = {
      get(): PackagedSidecarHandle | null {
        return registered;
      },
      set(handle: PackagedSidecarHandle): void {
        registered = handle;
      },
    };
    const spawnSidecars = vi.fn(async () => makeHandle("http://127.0.0.1:4444", "http://127.0.0.1:5555")) as unknown as typeof import("../src/sidecars.js").startPackagedSidecars;

    const { daemonUrl } = await restartPackagedSidecars(runtime, paths, options, handleRef, { spawnSidecars });

    expect(spawnSidecars).toHaveBeenCalledTimes(1);
    expect(registered).not.toBeNull();
    expect(daemonUrl).toBe("http://127.0.0.1:4444");
  });
});
