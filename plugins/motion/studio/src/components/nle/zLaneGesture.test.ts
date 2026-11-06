import { describe, expect, it, vi } from "vitest";
import { runLaneZGesture, runZLaneGesture } from "./zLaneGesture";

const durable = { durable: true, allMatched: true, changed: true };

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("runZLaneGesture", () => {
  it("runs the mirror after a durable z commit and resolves its result", async () => {
    const order: string[] = [];
    const result = await runZLaneGesture({
      commitZ: async () => {
        order.push("z");
        return durable;
      },
      mirror: async () => {
        order.push("mirror");
        return true;
      },
    });
    expect(result).toBe(true);
    expect(order).toEqual(["z", "mirror"]);
  });

  it("skips the mirror when the z commit reports unmatched targets", async () => {
    const mirror = vi.fn(async () => true);
    const result = await runZLaneGesture({
      commitZ: async () => ({ durable: false, allMatched: false, changed: true }),
      mirror,
    });
    expect(result).toBe(false);
    expect(mirror).not.toHaveBeenCalled();
  });

  it("still mirrors on a void resolution (empty-entries commit path)", async () => {
    const mirror = vi.fn(async () => true);
    await runZLaneGesture({ commitZ: async () => undefined, mirror });
    expect(mirror).toHaveBeenCalledTimes(1);
  });

  it("serializes gestures: B's z phase waits for A's mirror phase", async () => {
    const order: string[] = [];
    const aMirrorGate = deferred<void>();

    const a = runZLaneGesture({
      commitZ: async () => {
        order.push("A:z");
        return durable;
      },
      mirror: async () => {
        await aMirrorGate.promise;
        order.push("A:mirror");
        return true;
      },
    });
    const b = runZLaneGesture({
      commitZ: async () => {
        order.push("B:z");
        return durable;
      },
      mirror: async () => {
        order.push("B:mirror");
        return true;
      },
    });

    // Give B every chance to start early — it must not.
    await new Promise((r) => setTimeout(r, 10));
    expect(order).toEqual(["A:z"]);

    aMirrorGate.resolve();
    await Promise.all([a, b]);
    expect(order).toEqual(["A:z", "A:mirror", "B:z", "B:mirror"]);
  });

  it("holds a lane→z gesture until an overlapping z→lane gesture fully settles", async () => {
    const order: string[] = [];
    const mirrorGate = deferred<void>();
    const zFirst = runZLaneGesture({
      commitZ: async () => {
        order.push("z-first:z");
        return durable;
      },
      mirror: async () => {
        order.push("z-first:lane-start");
        await mirrorGate.promise;
        order.push("z-first:lane-end");
        return true;
      },
    });
    const laneFirst = runLaneZGesture({
      commitLane: async () => {
        order.push("lane-first:lane");
        return true;
      },
      commitZ: async () => {
        order.push("lane-first:z");
      },
    });

    await Promise.resolve();
    expect(order).toEqual(["z-first:z", "z-first:lane-start"]);
    mirrorGate.resolve();
    await Promise.all([zFirst, laneFirst]);
    expect(order).toEqual([
      "z-first:z",
      "z-first:lane-start",
      "z-first:lane-end",
      "lane-first:lane",
      "lane-first:z",
    ]);
  });

  it("holds a z→lane gesture until an overlapping lane→z gesture fully settles", async () => {
    const order: string[] = [];
    const zGate = deferred<void>();
    const laneFirst = runLaneZGesture({
      commitLane: async () => {
        order.push("lane-first:lane");
        return true;
      },
      commitZ: async () => {
        order.push("lane-first:z-start");
        await zGate.promise;
        order.push("lane-first:z-end");
      },
    });
    const zFirst = runZLaneGesture({
      commitZ: async () => {
        order.push("z-first:z");
        return durable;
      },
      mirror: async () => {
        order.push("z-first:lane");
        return true;
      },
    });

    await Promise.resolve();
    expect(order).toEqual(["lane-first:lane", "lane-first:z-start"]);
    zGate.resolve();
    await Promise.all([laneFirst, zFirst]);
    expect(order).toEqual([
      "lane-first:lane",
      "lane-first:z-start",
      "lane-first:z-end",
      "z-first:z",
      "z-first:lane",
    ]);
  });

  it("a failed gesture rejects its caller but never wedges the queue", async () => {
    const boom = new Error("z failed");
    const failed = runZLaneGesture({
      commitZ: async () => {
        throw boom;
      },
      mirror: async () => true,
    });
    await expect(failed).rejects.toBe(boom);

    const next = await runZLaneGesture({
      commitZ: async () => durable,
      mirror: async () => true,
    });
    expect(next).toBe(true);
  });
});
