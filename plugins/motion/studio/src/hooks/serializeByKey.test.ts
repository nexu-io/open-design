import { describe, expect, it } from "vitest";
import { createKeyedSerializer } from "./serializeByKey";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("createKeyedSerializer", () => {
  it("runs same-key tasks strictly in order (second awaits the first)", async () => {
    const run = createKeyedSerializer();
    const order: string[] = [];
    const first = deferred<void>();

    const p1 = run("k", async () => {
      order.push("1-start");
      await first.promise;
      order.push("1-end");
    });
    const p2 = run("k", async () => {
      order.push("2-start");
    });

    // Second task must not start until the first finishes.
    await Promise.resolve();
    expect(order).toEqual(["1-start"]);

    first.resolve();
    await Promise.all([p1, p2]);
    expect(order).toEqual(["1-start", "1-end", "2-start"]);
  });

  it("does not block tasks under different keys", async () => {
    const run = createKeyedSerializer();
    const order: string[] = [];
    const blockA = deferred<void>();

    const pa = run("a", async () => {
      order.push("a-start");
      await blockA.promise;
      order.push("a-end");
    });
    const pb = run("b", async () => {
      order.push("b-start");
      order.push("b-end");
    });

    // Different key runs to completion while "a" is still blocked.
    await pb;
    expect(order).toEqual(["a-start", "b-start", "b-end"]);

    blockA.resolve();
    await pa;
    expect(order).toEqual(["a-start", "b-start", "b-end", "a-end"]);
  });

  it("does not wedge a key when a prior task rejects", async () => {
    const run = createKeyedSerializer();
    const order: string[] = [];

    const p1 = run("k", async () => {
      order.push("1");
      throw new Error("boom");
    });
    await expect(p1).rejects.toThrow("boom");

    const p2 = run("k", async () => {
      order.push("2");
    });
    await p2;
    expect(order).toEqual(["1", "2"]);
  });

  it("propagates the task's resolved value to its caller", async () => {
    const run = createKeyedSerializer();
    await expect(run("k", async () => 42)).resolves.toBe(42);
  });
});
