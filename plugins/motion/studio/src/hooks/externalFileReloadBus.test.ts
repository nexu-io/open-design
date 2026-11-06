import { describe, expect, it, vi } from "vitest";
import { addExternalFileReloadListener, notifyExternalFileReload } from "./externalFileReloadBus";

describe("external file reload bus", () => {
  it("lets the sole watcher reload every SDK owner of the changed path", () => {
    const first = vi.fn();
    const second = vi.fn();
    const removeFirst = addExternalFileReloadListener(first);
    const removeSecond = addExternalFileReloadListener(second);

    notifyExternalFileReload("scenes/card.html");
    expect(first).toHaveBeenCalledWith("scenes/card.html");
    expect(second).toHaveBeenCalledWith("scenes/card.html");

    removeFirst();
    removeSecond();
  });

  it("isolates a broken listener so later SDK owners still reload", () => {
    const broken = vi.fn(() => {
      throw new Error("stale owner");
    });
    const healthy = vi.fn();
    const removeBroken = addExternalFileReloadListener(broken);
    const removeHealthy = addExternalFileReloadListener(healthy);

    expect(() => notifyExternalFileReload("scenes/card.html")).not.toThrow();
    expect(broken).toHaveBeenCalledWith("scenes/card.html");
    expect(healthy).toHaveBeenCalledWith("scenes/card.html");

    removeBroken();
    removeHealthy();
  });
});
