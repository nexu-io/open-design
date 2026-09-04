import { describe, expect, it, vi } from "vitest";

import {
  withSidecarLifecycleLock,
  type SidecarStamp,
} from "../src/index.js";

const firstStamp: SidecarStamp = Object.freeze({
  app: "standalone",
  channel: "betahyx",
  mode: "runtime",
  namespace: `lifecycle-lock-${process.pid}`,
  source: "standalone",
});

const secondStamp: SidecarStamp = Object.freeze({
  ...firstStamp,
  app: "closure",
});

function deferred(): Readonly<{ promise: Promise<void>; resolve(): void }> {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("Sidecar lifecycle resource-set lock", () => {
  it("serializes the same normalized resource set across concurrent callers", async () => {
    const entered = deferred();
    const release = deferred();
    const order: string[] = [];
    const first = withSidecarLifecycleLock([firstStamp, secondStamp], async () => {
      order.push("first-entered");
      entered.resolve();
      await release.promise;
      order.push("first-released");
    });
    await entered.promise;

    const second = withSidecarLifecycleLock(
      [secondStamp, firstStamp, firstStamp],
      async () => { order.push("second-entered"); },
      { timeoutMs: 2_000 },
    );
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 75));
    expect(order).toEqual(["first-entered"]);
    release.resolve();
    await Promise.all([first, second]);
    expect(order).toEqual(["first-entered", "first-released", "second-entered"]);
  });

  it("times out without entering while another caller owns the set", async () => {
    const entered = deferred();
    const release = deferred();
    const owner = withSidecarLifecycleLock([firstStamp], async () => {
      entered.resolve();
      await release.promise;
    });
    await entered.promise;
    const operation = vi.fn();
    await expect(withSidecarLifecycleLock([firstStamp], operation, { timeoutMs: 50 }))
      .rejects.toThrow(/timed out waiting for sidecar lifecycle lock/u);
    expect(operation).not.toHaveBeenCalled();
    release.resolve();
    await owner;
  });

  it("releases the kernel lock when the guarded operation fails", async () => {
    await expect(withSidecarLifecycleLock([firstStamp], async () => {
      throw new Error("guarded failure");
    })).rejects.toThrow("guarded failure");
    await expect(withSidecarLifecycleLock([firstStamp], async () => "reentered"))
      .resolves.toBe("reentered");
  });
});
