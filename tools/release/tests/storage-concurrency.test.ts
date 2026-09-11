import { expect, it } from "vitest";
import { mapWithConcurrency } from "@/storage/concurrency.ts";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

it("bounds active operations and retains declaration order despite out-of-order completion", async () => {
  const slots = Array.from({ length: 5 }, () => deferred<number>());
  const entered = Array.from({ length: 5 }, () => deferred<void>());
  let active = 0, peak = 0;
  const run = mapWithConcurrency(slots, 2, async (slot, index) => {
    peak = Math.max(peak, ++active); entered[index]!.resolve();
    try { return await slot.promise; } finally { active--; }
  });
  await entered[1]!.promise;
  expect(active).toBe(2);
  slots[1]!.resolve(1); await entered[2]!.promise;
  slots[2]!.resolve(2); await entered[3]!.promise;
  slots[0]!.resolve(0); await entered[4]!.promise;
  slots[4]!.resolve(4); slots[3]!.resolve(3);
  await expect(run).resolves.toEqual([0, 1, 2, 3, 4]);
  expect(peak).toBe(2); expect(active).toBe(0);
});

it("stops queued work on failure and drains in-flight work before rejecting", async () => {
  const finish = deferred<void>(), entered = deferred<void>();
  const visited: number[] = [];
  let drained = false;
  const failure = new Error("write rejected");
  const run = mapWithConcurrency([0, 1, 2, 3], 2, async value => {
    visited.push(value);
    if (value === 0) throw failure;
    entered.resolve(); await finish.promise; drained = true;
  });
  const checked = expect(run).rejects.toBe(failure);
  await entered.promise;
  expect(drained).toBe(false);
  finish.resolve(); await checked;
  expect(drained).toBe(true); expect(visited).toEqual([0, 1]);
});
