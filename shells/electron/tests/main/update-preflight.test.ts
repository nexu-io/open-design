import { describe, expect, it, vi } from "vitest";

import {
  DesktopUpdateTransitionOwner,
  beginDesktopUpdateTransition,
  updateRestartSafetyError,
} from "../../src/main/update-preflight.js";

describe("desktop update lifecycle transition", () => {
  it("acquires and releases the semantic Standalone lifecycle transition", async () => {
    const release = vi.fn(async () => undefined);
    const beginTransition = vi.fn(async () => ({
      state: "acquired" as const,
      transition: { release },
    }));
    const owner = new DesktopUpdateTransitionOwner({ beginTransition });

    await expect(owner.acquire()).resolves.toEqual({ occupantCount: 0, state: "clear" });
    await expect(owner.acquire()).resolves.toEqual({ occupantCount: 0, state: "clear" });
    expect(beginTransition).toHaveBeenCalledTimes(1);
    expect(beginTransition).toHaveBeenCalledWith("apply-shell-update");

    await owner.release();
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("quick-fails with exact other-Shell occupants", async () => {
    const occupant = {
      generation: 8,
      incarnation: "codex-plugin-a",
      key: "codex-plugin:codex-plugin-a",
      projection: { shellVersion: "0.19.0-beta.9" },
    };
    const result = await beginDesktopUpdateTransition({
      async beginTransition() {
        return { occupants: [occupant], reason: "occupied" as const, state: "blocked" as const };
      },
    });

    expect(result).toEqual({
      safety: { occupantCount: 1, occupants: [occupant], state: "blocked" },
      state: "blocked",
    });
    if (result.state !== "blocked") throw new Error("transition unexpectedly acquired");
    expect(updateRestartSafetyError(result.safety)).toMatchObject({
      code: "standalone-lifecycle-occupied",
      details: { occupantCount: 1, occupants: [occupant] },
      message: "Open Design is still in use by codex-plugin:codex-plugin-a.",
    });
  });

  it("fails closed when lifecycle truth is unavailable", async () => {
    await expect(new DesktopUpdateTransitionOwner(null).acquire()).resolves.toMatchObject({
      occupantCount: null,
      state: "unknown",
    });
    await expect(new DesktopUpdateTransitionOwner({
      async beginTransition() {
        throw new Error("control state unreadable");
      },
    }).acquire()).resolves.toMatchObject({ occupantCount: null, state: "unknown" });
  });

  it("serializes concurrent manual and silent update acquisition", async () => {
    let resolveBegin!: (value: {
      state: "acquired";
      transition: { release(): Promise<void> };
    }) => void;
    const beginTransition = vi.fn(() => new Promise<{
      state: "acquired";
      transition: { release(): Promise<void> };
    }>((resolve) => {
      resolveBegin = resolve;
    }));
    const release = vi.fn(async () => undefined);
    const owner = new DesktopUpdateTransitionOwner({ beginTransition });

    const manual = owner.acquire();
    const silent = owner.acquire();
    expect(beginTransition).toHaveBeenCalledTimes(1);
    resolveBegin({ state: "acquired", transition: { release } });
    await expect(Promise.all([manual, silent])).resolves.toEqual([
      { occupantCount: 0, state: "clear" },
      { occupantCount: 0, state: "clear" },
    ]);
    await owner.release();
    expect(release).toHaveBeenCalledTimes(1);
  });
});
