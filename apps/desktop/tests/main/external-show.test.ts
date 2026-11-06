import { describe, expect, it, vi } from "vitest";

import { notifyDesktopExternalShow } from "../../src/main/external-show.js";

describe("notifyDesktopExternalShow", () => {
  it("starts the packaged compatibility callback immediately without awaiting it", () => {
    let finish: (() => void) | undefined;
    const callback = vi.fn(() => new Promise<void>((resolve) => {
      finish = resolve;
    }));

    notifyDesktopExternalShow(callback);

    expect(callback).toHaveBeenCalledOnce();
    finish?.();
  });

  it("contains callback failures at the optional host boundary", async () => {
    const onError = vi.fn();

    notifyDesktopExternalShow(async () => {
      throw new Error("retirement failed");
    }, {
      onError,
    });

    await vi.waitFor(() => expect(onError).toHaveBeenCalledWith(expect.objectContaining({
      message: "retirement failed",
    })));
  });

  it("contains synchronous callback failures", () => {
    const onError = vi.fn();

    notifyDesktopExternalShow(() => {
      throw new Error("retirement failed synchronously");
    }, { onError });

    expect(onError).toHaveBeenCalledWith(expect.objectContaining({
      message: "retirement failed synchronously",
    }));
  });

  it("does nothing when the packaged host did not opt in", () => {
    const onError = vi.fn();

    notifyDesktopExternalShow(undefined, { onError });

    expect(onError).not.toHaveBeenCalled();
  });
});
