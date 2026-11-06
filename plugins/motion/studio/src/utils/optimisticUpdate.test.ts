import { describe, it, expect, vi } from "vitest";
import { executeOptimistic } from "./optimisticUpdate";

describe("executeOptimistic", () => {
  it("calls apply then persist on success, never rollback", async () => {
    const apply = vi.fn(() => "snapshot");
    const persist = vi.fn(() => Promise.resolve());
    const rollback = vi.fn();

    await executeOptimistic({ apply, persist, rollback });

    expect(apply).toHaveBeenCalledOnce();
    expect(persist).toHaveBeenCalledOnce();
    expect(rollback).not.toHaveBeenCalled();
  });

  it("calls rollback with snapshot on persist failure", async () => {
    const apply = vi.fn(() => ({ prev: "data" }));
    const persist = vi.fn(() => Promise.reject(new Error("network")));
    const rollback = vi.fn();

    await executeOptimistic({ apply, persist, rollback });

    expect(apply).toHaveBeenCalledOnce();
    expect(persist).toHaveBeenCalledOnce();
    expect(rollback).toHaveBeenCalledWith({ prev: "data" });
  });

  it("preserves complex snapshot objects through rollback", async () => {
    const snapshot = {
      format: "percentage",
      keyframes: [{ percentage: 0, properties: { opacity: 0 } }],
    };
    const apply = vi.fn(() => structuredClone(snapshot));
    const persist = vi.fn(() => Promise.reject(new Error("500")));
    const rollback = vi.fn();

    await executeOptimistic({ apply, persist, rollback });

    expect(rollback).toHaveBeenCalledOnce();
    expect(rollback.mock.calls[0][0]).toEqual(snapshot);
  });

  it("handles undefined snapshot for rollback", async () => {
    const apply = vi.fn(() => undefined);
    const persist = vi.fn(() => Promise.reject(new Error("timeout")));
    const rollback = vi.fn();

    await executeOptimistic({ apply, persist, rollback });

    expect(rollback).toHaveBeenCalledWith(undefined);
  });
});
